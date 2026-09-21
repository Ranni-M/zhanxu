// 二维码：同构（浏览器 / @napi-rs/canvas）。只依赖 qrcode-generator 的模块矩阵，
// 自己画到 canvas 上，这样浏览器和 Node 导出用的是同一份实现。
import qrcode from 'qrcode-generator';
/** 画一张二维码画布。runtime 只需 createCanvas，size 是像素边长 */
export function drawQr(runtime, value, size = 240, options = {}) {
  const text = String(value || '').trim();
  if (!text) throw new Error('二维码内容为空。');
  const code = qrcode(0, options.level || 'M');
  code.addData(text, options.mode || 'Byte');
  code.make();
  const count = code.getModuleCount();
  const quiet = options.quiet ?? 2; // 静默区，扫码器需要
  const unit = size / (count + quiet * 2);
  const canvas = runtime.createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = options.light || '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = options.dark || '#111111';
  const edge = (n) => Math.round(n * unit);
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (!code.isDark(row, column)) continue;
      const x = edge(column + quiet),
        y = edge(row + quiet);
      ctx.fillRect(x, y, edge(column + quiet + 1) - x, edge(row + quiet + 1) - y);
    }
  }
  return canvas;
}
/** 公开作品才给二维码：私密作品印上去也扫不开 */
export function publicationUrl(origin, slug, kind = 'p') {
  if (!slug || !origin) return '';
  return String(origin).replace(/\/+$/, '') + '/' + kind + '/' + slug;
}
