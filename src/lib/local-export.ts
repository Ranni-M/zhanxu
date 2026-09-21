import { zipSync, strToU8 } from 'fflate';
import type { Project } from '../domain/project';
import type { ExportFormat } from './api';
import { autoQr, posterRuntime, qrDataUrl, renderPoster } from './poster';
/** 网页版作品集是浏览器里现算的单文件，不需要排队等服务端任务 */
export type LocalExportFormat = ExportFormat | 'html';
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function jpeg(canvas: HTMLCanvasElement, quality = 0.9) {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('导出失败，请重试。');
  return new Uint8Array(await blob.arrayBuffer());
}
/**
 * 网页版作品集要把图片写进同一个文件才能随身带着走，
 * 所以先把每张图读成 base64。单张读不动就退回原始地址，不整页失败。
 */
async function inlineImages(project: Project, onProgress: (text: string) => void) {
  const sources = [
    ...project.images.map((item) => item.src),
    ...(project.compares || []).flatMap((pair) => [pair.before, pair.after]),
  ].filter((src, index, list) => src && list.indexOf(src) === index);
  const map: Record<string, string> = {};
  for (const [index, src] of sources.entries()) {
    onProgress('正在内联图片 ' + (index + 1) + '/' + sources.length + '…');
    try {
      const response = await fetch(src);
      if (!response.ok) continue;
      const blob = await response.blob();
      map[src] = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('图片读取失败。'));
        reader.readAsDataURL(blob);
      });
    } catch {
      // 读不到的图片留原始地址，导出的网页从同源打开时仍然看得见
    }
  }
  return map;
}
/**
 * 游客模式的导出：没有账号、没有服务端任务，全部在浏览器里算完直接下载。
 * 复用和服务端同一份 shared/ 渲染代码，所以成品一模一样。
 */
export async function exportLocally(
  project: Project,
  format: LocalExportFormat,
  onProgress: (text: string) => void,
) {
  const name = project.title || '毕业设计';
  const url = project.publishedSlug ? window.location.origin + '/p/' + project.publishedSlug : '';
  const qr = await autoQr(project);
  if (format === 'cover') {
    onProgress('正在生成封面…');
    const canvas = await renderPoster(project, 1600);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('导出失败，请重试。');
    save(blob, name + '-封面.png');
    return { bytes: blob.size };
  }
  if (format === 'html') {
    onProgress('正在读取图片…');
    const images = await inlineImages(project, onProgress);
    onProgress('正在排版网页…');
    const { portfolioHtml } = await import('./portfolio-html');
    const html = portfolioHtml(project, {
      images,
      // 只有公开作品才印二维码：私密作品扫开也是 404
      qr: qr ? await qrDataUrl(url, 320) : undefined,
      publicUrl: url,
      generatedAt: new Date().toLocaleDateString('zh-CN'),
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    save(blob, name + '-作品集.html');
    return { bytes: blob.size };
  }
  if (format === 'pdf') {
    onProgress('正在排版作品集…');
    const { buildPortfolio } = await import('../../shared/pdf.mjs');
    const bytes = await buildPortfolio(project, posterRuntime, {
      width: 1500,
      theme: project.template,
      skeleton: project.skeleton,
      qr,
    });
    save(new Blob([bytes as BlobPart], { type: 'application/pdf' }), name + '-作品集.pdf');
    return { bytes: (bytes as Uint8Array).length };
  }
  onProgress('正在分页…');
  const { renderPages } = await import('../../shared/render.mjs');
  const files: Record<string, Uint8Array> = {};
  let page = 0;
  for await (const sheet of renderPages(project, posterRuntime, {
    width: 1600,
    theme: project.template,
    qr,
  })) {
    onProgress('正在导出第 ' + (page + 1) + ' 页…');
    files[String(++page).padStart(2, '0') + '-project.jpg'] = await jpeg(
      sheet.canvas as HTMLCanvasElement,
    );
  }
  files['README.txt'] = strToU8(
    '此图文包用于介绍项目。视频、完整PDF、源码和在线体验请通过项目展示页访问。\n项目：' +
      name +
      '\n在线体验：' +
      (project.demoUrl || '未填写') +
      '\n源码：' +
      (project.repositoryUrl || '未填写') +
      (url ? '\n项目展示页：' + url : ''),
  );
  save(
    new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: 'application/zip' }),
    name + '-图文展示包.zip',
  );
  return { bytes: Object.values(files).reduce((total, file) => total + file.length, 0) };
}
