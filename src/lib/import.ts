import type { ProjectImage } from '../data';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export type ImportResult = { images: ProjectImage[]; title: string; intro: string; notice: string };
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
async function imageData(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error('图片分辨率过大，请缩小到 4000 万像素以内。');
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.88);
}
export async function importFiles(
  files: File[],
  onProgress: (text: string) => void,
  capacity = 24,
): Promise<ImportResult> {
  if (!files.length) return { images: [], title: '', intro: '', notice: '' };
  if (capacity < 1) throw new Error('每个项目最多保留 24 张图片，请先移除部分图片。');
  if (files.length > 8) throw new Error('一次最多选择 8 个文件。');
  const result: ImportResult = {
    images: [],
    title: files[0].name.replace(/\.[^.]+$/, ''),
    intro: '',
    notice: '',
  };
  for (const file of files) {
    if (result.images.length >= capacity) {
      result.notice = '已达到 24 张图片上限，其余文件未导入。';
      break;
    }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf && !ACCEPTED.includes(file.type))
      throw new Error('支持 JPG、PNG、WebP 图片和 PDF 文件。');
    if (file.size > (isPdf ? 25 : 12) * 1024 * 1024)
      throw new Error(isPdf ? 'PDF 请控制在 25 MB 以内。' : '单张图片请控制在 12 MB 以内。');
    onProgress('正在读取 ' + file.name);
    if (!isPdf) {
      result.images.push({
        id: crypto.randomUUID(),
        src: await imageData(file),
        name: file.name.replace(/\.[^.]+$/, ''),
      });
      continue;
    }
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      cMapUrl: '/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/standard_fonts/',
      wasmUrl: '/pdfjs/wasm/',
    });
    try {
      const pdf = await task.promise;
      let text = '';
      const count = Math.min(pdf.numPages, 6, capacity - result.images.length);
      for (let p = 1; p <= count; p++) {
        onProgress('正在导入 PDF 第 ' + p + ' / ' + count + ' 页');
        const page = await pdf.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.5, 1600 / Math.max(base.width, base.height)),
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d')!;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        result.images.push({
          id: crypto.randomUUID(),
          src: canvas.toDataURL('image/jpeg', 0.86),
          name: file.name + ' · 第 ' + p + ' 页',
        });
        const content = await page.getTextContent();
        text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
        page.cleanup();
      }
      const abstract = text.match(
        /摘\s*要[：:\s]*([\s\S]{30,}?)(?:关\s*键\s*词|Key\s*words|Abstract|$)/i,
      );
      if (abstract) result.intro = abstract[1].replace(/\s+/g, ' ').trim().slice(0, 800);
      result.notice =
        '已导入 PDF 前 ' +
        count +
        ' 页' +
        (result.intro ? '并提取摘要，请核对内容。' : '，可以在项目介绍中补充说明。');
    } finally {
      await task.destroy();
    }
  }
  return result;
}
