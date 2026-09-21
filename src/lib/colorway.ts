import type { Colorway } from '../domain/project';
/** 把配色参数拼到图片地址后面；服务端会烘焙并缓存，地址本身不变 */
export function colorwaySrc(src: string, colorway?: Colorway | null) {
  if (!colorway || !isColorwayActive(colorway)) return src;
  const query = new URLSearchParams({
    hue: String(Math.round(colorway.hue)),
    sat: String(colorway.saturation),
    bri: String(colorway.brightness),
  });
  return src + '/colorway?' + query;
}
export function isColorwayActive(colorway: Colorway) {
  return colorway.hue !== 0 || colorway.saturation !== 1 || colorway.brightness !== 1;
}
/** 拖动调色时的即时预览（CSS 滤镜），最终展示用服务端烘焙的结果 */
export function colorwayFilter(colorway?: Colorway | null) {
  if (!colorway || !isColorwayActive(colorway)) return undefined;
  return `hue-rotate(${Math.round(colorway.hue)}deg) saturate(${colorway.saturation}) brightness(${colorway.brightness})`;
}
export function hexToRgb(hex: string) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const number = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(number)) return { r: 0, g: 0, b: 0 };
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}
export function rgbToHex(r: number, g: number, b: number) {
  const part = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return '#' + part(r) + part(g) + part(b);
}
/** 色相角 0-360 */
export function hueOf(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max === min) return 0;
  const delta = max - min;
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
}
/** 从来源色到目标色的最短色相偏移（-180..180） */
export function hueDelta(fromHex: string, toHex: string) {
  const delta = ((hueOf(toHex) - hueOf(fromHex) + 540) % 360) - 180;
  return Math.round(delta);
}
/** 取图片主色：缩到 32px 再求平均，跳过透明像素。失败返回 undefined */
export async function dominantColor(src: string): Promise<string | undefined> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.crossOrigin = 'anonymous';
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('图片加载失败'));
    element.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0, 32, 32);
  const { data } = ctx.getImageData(0, 0, 32, 32);
  let r = 0,
    g = 0,
    b = 0,
    weight = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.2) continue;
    r += data[index] * alpha;
    g += data[index + 1] * alpha;
    b += data[index + 2] * alpha;
    weight += alpha;
  }
  if (!weight) return undefined;
  return rgbToHex(r / weight, g / weight, b / weight);
}
