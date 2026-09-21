import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { drawQr, publicationUrl } from '../shared/qr.mjs';
import {
  posterSkeletons,
  posterSizes,
  renderCover,
  pickSkeleton,
  themes,
} from '../shared/render.mjs';
if (existsSync('C:/Windows/Fonts/msyh.ttc'))
  GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc', 'Microsoft YaHei');
// 画一张有内容的图，避免海报因为空图看起来像没渲染
const art = createCanvas(1200, 900);
const brush = art.getContext('2d');
brush.fillStyle = '#2c4a63';
brush.fillRect(0, 0, 1200, 900);
brush.fillStyle = '#e8d6b0';
brush.beginPath();
brush.arc(600, 380, 210, 0, Math.PI * 2);
brush.fill();
const runtime = { createCanvas, loadImage: async () => art } as unknown as never;
const base = {
  title: '潮汐来信',
  subtitle: 'LETTERS FROM THE SEA',
  author: '林小满',
  category: '数字媒体',
  year: '2026',
  intro: '把海面的波动转成视觉语言。',
  meta: { tagline: '把波动转成语言', school: '中国美术学院', booth: 'B-12' },
  images: [
    { id: 'a', src: 'a', name: '图一' },
    { id: 'b', src: 'b', name: '图二' },
    { id: 'c', src: 'c', name: '图三' },
    { id: 'd', src: 'd', name: '图四' },
  ],
} as never;
// 把画布缩成 32×32 数颜色，判断“有没有真的画出东西”
function inkOf(canvas: HTMLCanvasElement) {
  const thumb = createCanvas(32, 32);
  const ctx = thumb.getContext('2d');
  ctx.drawImage(canvas as never, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  const seen = new Set<string>();
  for (let i = 0; i < data.length; i += 4)
    seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
  return seen.size;
}
test('六种骨架都能画出有内容的 A4 海报', async () => {
  for (const skeleton of posterSkeletons) {
    const canvas = await renderCover(base, runtime, { width: 640, skeleton, theme: 'editorial' });
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 800);
    assert.ok(inkOf(canvas) > 6, skeleton + ' 看起来是空白的');
  }
});
test('四种尺寸的比例正确，字体不会缩到看不清', async () => {
  for (const [id, spec] of Object.entries(posterSizes)) {
    const canvas = await renderCover(base, runtime, { width: 600, size: id as never });
    assert.equal(canvas.width, 600);
    assert.equal(canvas.height, Math.round((600 * spec.h) / spec.w), id + ' 高度不对');
    assert.ok(inkOf(canvas) > 6, id + ' 看起来是空白的');
  }
});
test('九套配色都能正常出图', async () => {
  for (const theme of Object.keys(themes)) {
    const canvas = await renderCover(base, runtime, { width: 400, theme: theme as never });
    assert.ok(inkOf(canvas) > 6, theme + ' 看起来是空白的');
  }
});
test('没有图片时自动改用纯文字，并且每种骨架都不崩', async () => {
  const bare = { ...(base as Record<string, unknown>), images: [] } as never;
  assert.equal(pickSkeleton(bare), 'type-only');
  for (const skeleton of posterSkeletons) {
    const canvas = await renderCover(bare, runtime, { width: 400, skeleton });
    assert.equal(canvas.width, 400);
  }
});
test('自动挑骨架会看图片数量与尺寸', () => {
  assert.equal(pickSkeleton(base), 'grid');
  assert.equal(pickSkeleton(base, 'og'), 'split');
  assert.equal(
    pickSkeleton({ ...(base as Record<string, unknown>), images: [] } as never, 'story'),
    'type-only',
  );
  assert.equal(
    pickSkeleton(
      { ...(base as Record<string, unknown>), images: [{ id: 'a', src: 'a' }] } as never,
      'story',
    ),
    'banner',
  );
});
test('二维码能画出模块矩阵，内容为空时明确报错', () => {
  const canvas = drawQr(runtime, 'https://ryhtest.cn/p/abc-123', 240);
  assert.equal(canvas.width, 240);
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, 240, 240).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 128) dark++;
  const ratio = dark / (240 * 240);
  assert.ok(ratio > 0.2 && ratio < 0.6, '深色占比应该在两成到六成之间，实际 ' + ratio.toFixed(2));
  // 静默区是白的，第一个模块（左上定位图案）是黑的
  assert.equal(ctx.getImageData(4, 4, 1, 1).data[0], 255);
  assert.ok(ctx.getImageData(17, 17, 1, 1).data[0] < 128, '左上定位图案应该是深的');
  assert.throws(() => drawQr(runtime, '   ', 240), /二维码内容为空/);
  assert.equal(publicationUrl('https://ryhtest.cn/', 'abc'), 'https://ryhtest.cn/p/abc');
  assert.equal(publicationUrl('', 'abc'), '');
});
test('海报右下角会印上二维码', async () => {
  const qr = drawQr(runtime, 'https://ryhtest.cn/p/abc', 320);
  const plain = await renderCover(base, runtime, { width: 800, skeleton: 'stack' });
  const stamped = await renderCover(base, runtime, { width: 800, skeleton: 'stack', qr });
  // 二维码落在逻辑坐标 (782,1047) 边长 66 的位置
  const darkness = (canvas: { getContext(t: string): CanvasRenderingContext2D }) => {
    const scale = 800 / 900;
    const { data } = canvas
      .getContext('2d')
      .getImageData(Math.round(784 * scale), Math.round(1049 * scale), 50, 50);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    return sum / (data.length / 4);
  };
  assert.ok(
    darkness(stamped as never) < darkness(plain as never) - 10,
    '印了二维码应该让右下角变暗',
  );
});
