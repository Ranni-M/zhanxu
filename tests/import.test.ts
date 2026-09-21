import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { readArchive } from '../src/lib/archive.ts';

// 浏览器才有 createImageBitmap，这里用一个假的：只回尺寸，不解码
globalThis.createImageBitmap = (async (file: Blob) => {
  const name = (file as File).name || '';
  const size = /tiny/.test(name) ? { width: 120, height: 90 } : { width: 1920, height: 1280 };
  return { ...size, close() {} };
}) as unknown as typeof createImageBitmap;

const png = (() => {
  // 1x1 的合法 PNG，够 unzip 与 File 用；尺寸由上面的假解码器给
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    ),
    (char) => char.charCodeAt(0),
  );
  return bytes;
})();

function archive(entries: Record<string, string | Uint8Array>) {
  const files: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(entries))
    files[name] = typeof value === 'string' ? strToU8(value) : value;
  return new File([zipSync(files) as BlobPart], '潮汐来信-终版.zip', { type: 'application/zip' });
}

test('压缩包导入：从 README 抽出标题、简介、作者、链接与展位信息', async () => {
  const readme = [
    '# 潮汐来信',
    '',
    'LETTERS FROM THE SEA',
    '',
    '## 项目简介',
    '',
    '把海面的细微波动转化为视觉语言，作品由三组实时影像与一组实体装置组成，观众的手势会影响潮汐的涨落节奏。',
    '',
    '## 我的职责',
    '',
    '独立完成概念、视觉与动态实现，并负责展览现场的三联屏搭建。',
    '',
    '## 制作过程',
    '',
    '先采集近岸海浪的水面数据，再把高度场转成粒子位移，最后用 After Effects 做合成。',
    '',
    '作者：林小满',
    '指导教师：陈思远',
    '学校：中国美术学院',
    '专业：数字媒体艺术',
    '展位号：B-12',
    '',
    '演示地址：https://demo.example.com/tide',
    '源码：https://github.com/example/tide',
    '',
  ].join('\n');
  const result = await readArchive(
    archive({
      '潮汐来信/README.md': readme,
      '潮汐来信/node_modules/left-pad/index.js': 'module.exports = 1;',
      '潮汐来信/素材/封面主视觉.png': png,
      '潮汐来信/素材/过程图 tiny.png': png,
      '潮汐来信/素材/render-01.png': png,
    }),
    () => {},
  );
  assert.equal(result.patch.title, '潮汐来信');
  assert.equal(result.patch.subtitle, 'LETTERS FROM THE SEA');
  assert.match(String(result.patch.intro), /把海面的细微波动转化为视觉语言/);
  assert.match(String(result.patch.process), /高度场转成粒子位移/);
  assert.match(String(result.patch.role), /独立完成概念/);
  assert.equal(result.patch.author, '林小满');
  assert.equal(result.patch.demoUrl, 'https://demo.example.com/tide');
  assert.equal(result.patch.repositoryUrl, 'https://github.com/example/tide');
  assert.equal(result.patch.meta?.advisor, '陈思远');
  assert.equal(result.patch.meta?.school, '中国美术学院');
  assert.equal(result.patch.meta?.booth, 'B-12');
  assert.match(String(result.patch.year), /^20\d\d$/);
  assert.equal(result.patch.year, String(new Date().getFullYear()));
  // 分类与配色：README 里出现“影像/装置”，应该落到数字媒体与霓虹夜场
  assert.equal(result.patch.category, '数字媒体');
  assert.equal(result.patch.template, 'neon');
  // 图片：封面主视觉排第一，太小的小图被压到后面
  assert.equal(result.images.length, 3);
  assert.match(result.images[0].name, /封面主视觉/);
  assert.match(result.images[2].name, /tiny/);
  assert.match(result.notice, /自动填好/);
  assert.ok(result.sources.includes('README.md'), JSON.stringify(result.sources));
});

test('压缩包导入：没有 README 时用 package.json 与文件后缀兜底', async () => {
  const result = await readArchive(
    archive({
      'graduation-final/package.json': JSON.stringify({
        name: 'campus-tour',
        description: '一个给新生用的校园导览小程序，支持路线规划与语音讲解。',
        dependencies: { react: '^19.0.0', three: '^0.17.0' },
      }),
      'graduation-final/src/App.tsx': 'export default () => null;',
      'graduation-final/模型/场景.blend': 'blend',
      'graduation-final/海报/主图.png': png,
    }),
    () => {},
  );
  assert.equal(result.patch.title, 'graduation');
  assert.match(String(result.patch.intro), /校园导览小程序/);
  assert.match(String(result.patch.tools), /React/);
  assert.match(String(result.patch.tools), /Blender/);
  assert.equal(result.patch.category, '软件开发');
  assert.equal(result.patch.template, 'cobalt');
  assert.equal(result.images.length, 1);
});

test('压缩包导入：GBK 编码的中文说明也能读出来', async () => {
  // “关于项目” 的 GBK 字节
  const gbk = Uint8Array.from([0xb9, 0xd8, 0xd3, 0xda, 0xcf, 0xee, 0xc4, 0xbf]);
  const result = await readArchive(archive({ '作品/说明.txt': gbk }), () => {});
  assert.equal(result.patch.title, '作品');
  assert.equal(result.patch.template, 'editorial');
  assert.equal(result.images.length, 0);
});
