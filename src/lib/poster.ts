import type { Project, PosterSizeId, SkeletonId } from '../data';
import { renderCover } from '../../shared/render.mjs';
const cache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  let promise = cache.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        cache.delete(src);
        reject(new Error('图片加载失败，请重新登录或刷新。'));
      };
      image.src = src;
    });
    cache.set(src, promise);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return promise;
}
const runtime = {
  createCanvas: (w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  },
  loadImage,
};
/** 游客模式的本地导出要自己搭 runtime，这里直接复用同一份 */
export const posterRuntime = runtime;
export async function renderPoster(
  project: Project,
  width = 1200,
  options: { size?: PosterSizeId; skeleton?: SkeletonId; qr?: unknown } = {},
) {
  return renderCover(project, runtime, {
    width,
    size: options.size ?? project.posterSize ?? 'a4',
    skeleton: options.skeleton ?? project.skeleton ?? 'auto',
    theme: project.template,
    qr: options.qr ?? (await autoQr(project)),
  });
}
/** 只有公开作品才印二维码：私密作品印上去也扫不开 */
export async function autoQr(project: Project) {
  const slug = project.publishedSlug;
  if (!slug || project.publishedVisibility === 'private') return undefined;
  const { drawQr } = await import('../../shared/qr.mjs');
  return drawQr(runtime, window.location.origin + '/p/' + slug, 360);
}
/** 编辑器展台二维码用的图片数据 */
export async function qrDataUrl(url: string, size = 264) {
  const { drawQr } = await import('../../shared/qr.mjs');
  return drawQr(runtime, url, size).toDataURL('image/png');
}
export async function downloadPoster(project: Project, options: { width?: number } = {}) {
  const canvas = await renderPoster(project, options.width ?? 1600);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png'),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.title || '毕业设计') + '-封面.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
