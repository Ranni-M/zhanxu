import type { Project } from '../data';
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
export function renderPoster(project: Project, width = 1200) {
  return renderCover(project, runtime, width);
}
export async function downloadPoster(project: Project) {
  const canvas = await renderCover(project, runtime, 1600);
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
