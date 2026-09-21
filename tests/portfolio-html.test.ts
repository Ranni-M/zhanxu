import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, portfolioHtml } from '../src/lib/portfolio-html.ts';
import { samples } from '../src/data/catalog.ts';
import { themes } from '../shared/render.mjs';
import type { Project } from '../src/domain/project.ts';

const sample = samples[0];

function full(project: Partial<Project>): Project {
  return { ...sample, ...project };
}

test('html 转义把标签和引号都盖住', () => {
  assert.equal(escapeHtml('<b>"x" &\'\'</b>'), '&lt;b&gt;&quot;x&quot; &amp;&#39;&#39;&lt;/b&gt;');
});

test('单文件网页作品集：封面、展签、正文、图集都在一个文件里', () => {
  const html = portfolioHtml(sample, { generatedAt: '2026/6/1' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<meta charset="utf-8" />'));
  assert.ok(html.includes('<title>栖居之间 · 作品集</title>'));
  assert.ok(html.includes('<h1>栖居之间</h1>'));
  assert.ok(html.includes('BETWEEN SPACES'));
  assert.ok(html.includes('展签信息'));
  assert.ok(html.includes('关于项目'));
  assert.ok(html.includes('空间与几何') && html.includes('日常生活的尺度'));
  assert.ok(html.includes('@media print'));
  assert.ok(html.includes('由 展序 ZHANXU 生成 · 2026/6/1'));
  // 模板没提到的地方不能漏出 undefined / null
  assert.ok(!/undefined|null/.test(html));
});

test('配色跟着模板走，网页和海报是同一套颜色', () => {
  const neon = portfolioHtml(full({ template: 'neon' }));
  assert.ok(neon.includes(themes.neon.accent));
  assert.ok(neon.includes(themes.neon.bg));
  const cobalt = portfolioHtml(full({ template: 'cobalt' }));
  assert.ok(cobalt.includes(themes.cobalt.accent));
});

test('图片按 src 换成本地内嵌的 data URL，没内嵌的退回原地址', () => {
  const html = portfolioHtml(sample, {
    images: { '/images/architecture.jpg': 'data:image/jpeg;base64,AAAA' },
  });
  assert.ok(html.includes('src="data:image/jpeg;base64,AAAA"'));
  assert.ok(html.includes('src="/images/interior.jpg"'));
});

test('用户写的内容一律转义，网页不会被自己的标题带跑', () => {
  const html = portfolioHtml(
    full({
      title: '<script>alert(1)</script>',
      intro: 'a & b <c>',
      subtitle: '"引号"',
    }),
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('a &amp; b &lt;c&gt;'));
});

test('有对比、链接和二维码时补上对应区块', () => {
  const html = portfolioHtml(
    full({
      demoUrl: 'https://example.com/demo',
      repositoryUrl: 'https://github.com/example/repo',
      attachments: [
        { id: 'v', src: '/a.mp4', name: '演示视频', kind: 'video', size: 10, visible: true },
      ],
      compares: [
        { id: 'p1', label: '配色方案', before: '/images/interior.jpg', after: '/images/ocean.jpg' },
      ],
    }),
    { qr: 'data:image/png;base64,QR', publicUrl: 'https://ryhtest.cn/p/abc' },
  );
  assert.ok(html.includes('方案对比'));
  assert.ok(html.includes('修改前') && html.includes('修改后'));
  assert.ok(html.includes('href="https://example.com/demo"'));
  assert.ok(html.includes('源码仓库'));
  assert.ok(html.includes('data:image/png;base64,QR'));
  assert.ok(html.includes('https://ryhtest.cn/p/abc'));
  assert.ok(html.includes('视频与附件共 1 个'));
});

test('没发布的草稿不印二维码，也不留空区块', () => {
  const html = portfolioHtml(full({ publishedSlug: undefined, compares: [], images: [] }));
  assert.ok(!html.includes('扫码打开作品展示页'));
  assert.ok(!html.includes('作品图集'));
  assert.ok(!html.includes('方案对比'));
  assert.ok(html.includes('class="block facts"')); // 样板填了方向与作者，展签应该还在
});
