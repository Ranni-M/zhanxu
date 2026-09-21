import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { AxeBuilder } from '@axe-core/playwright';
import { zipSync, strToU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { Buffer } from 'node:buffer';
const out = path.resolve('output/playwright');
await mkdir(out, { recursive: true });
const data = await mkdtemp(path.join(os.tmpdir(), 'zhanxu-ui-'));
const socket = net.createServer();
await new Promise<void>((r) => socket.listen(0, '127.0.0.1', r));
const port = (socket.address() as net.AddressInfo).port;
await new Promise<void>((r) => socket.close(() => r()));
const base = 'http://127.0.0.1:' + port;
let server: ChildProcess | undefined,
  browser: Browser | undefined,
  serverLog = '';
const errors: string[] = [];
const checks: string[] = [];
const pass = (s: string) => {
  checks.push(s);
  console.log('PASS ' + s);
};
/** 先整页滚一遍预热（触发滚动进场动画、图片解码与 canvas 渲染），再回顶截图。
 *  否则 fullPage 截图会因 captureBeyondViewport 把未光栅化的区域拍成灰块。 */
const warmScroll = async (page: Page) => {
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.7);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  // 强制解码所有位图，否则 fullPage 截图会把尚未光栅化的图片拍成空白块
  await page.evaluate(() =>
    Promise.all([...document.images].map((img) => img.decode().catch(() => {}))),
  );
  await page.waitForTimeout(900);
};
try {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATA_DIR: data,
      PUBLIC_ORIGIN: base,
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout?.on('data', (b) => (serverLog += b));
  server.stderr?.on('data', (b) => (serverLog += b));
  let started = false;
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base + '/api/health')).ok) {
        started = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!started) throw new Error(serverLog);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') console.log('BROWSER ' + m.text());
  });
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(base);
  await page.locator('.hero-art .poster-image img').first().waitFor();
  await warmScroll(page);
  await page.screenshot({ path: path.join(out, 'home-desktop.png'), fullPage: true });
  assert.equal(await page.locator('.project-card').count(), 9, '首页应该铺满 9 套模板示例');
  assert.equal(
    await page.locator('.project-card .sample-tag').count(),
    9,
    '每个模板示例都要标出「示例」',
  );
  assert.equal(
    await page.locator('.project-card .save-project').count(),
    0,
    '示例不属于任何人，不该出现收藏按钮',
  );
  assert.equal(await page.locator('.feature-cell').count(), 6, '首页功能区应为 6 格');
  assert.equal(
    await page.locator('.feature-extract-row').count(),
    5,
    '导入解析面板应展示 5 个字段',
  );
  assert.equal(await page.locator('.category-tabs .tab-count').count(), 8, '分类标签应带作品数量');
  await page.locator('.feature-compare .compare-range').waitFor();
  await page.locator('.feature-qr-frame img').waitFor();
  const featureDownload = page.waitForEvent('download', { timeout: 180000 });
  await page.getByRole('button', { name: '下载示例作品集 PDF' }).click();
  const featureFile = await featureDownload;
  assert.match(featureFile.suggestedFilename(), /作品集\.pdf$/);
  await featureFile.saveAs(path.join(out, 'home-sample.pdf'));
  const featurePdf = await readFile(path.join(out, 'home-sample.pdf'));
  assert.equal(featurePdf.subarray(0, 5).toString(), '%PDF-');
  await page.locator('.feature-status').waitFor();
  assert.match(await page.locator('.feature-status').innerText(), /已生成/);
  const featureHtmlEvent = page.waitForEvent('download', { timeout: 180000 });
  await page.getByRole('button', { name: '或导出 HTML 网页' }).click();
  const featureHtmlFile = await featureHtmlEvent;
  assert.match(featureHtmlFile.suggestedFilename(), /作品集\.html$/);
  await featureHtmlFile.saveAs(path.join(out, 'home-sample.html'));
  const sampleHtml = await readFile(path.join(out, 'home-sample.html'), 'utf8');
  assert.ok(sampleHtml.startsWith('<!doctype html>'));
  assert.ok(sampleHtml.includes('展签信息') && sampleHtml.includes('作品图集'));
  assert.ok(sampleHtml.includes('data:image/jpeg;base64,'), '网页版作品集必须把图片内嵌成一个文件');
  await page.waitForFunction(() =>
    /单文件/.test(document.querySelector('.feature-status')?.textContent || ''),
  );
  await page.getByRole('textbox', { name: '搜索作品' }).fill('不存在的项目');
  await page.getByRole('heading', { name: '没有找到相关作品' }).waitFor();
  await page.getByRole('button', { name: '查看全部作品', exact: true }).click();
  pass('首页、示例封面与搜索空状态');
  await page.getByRole('button', { name: '挑选展示模板' }).click();
  await page.locator('.template-full').first().waitFor();
  assert.equal(await page.locator('.template-full').count(), 9, '展示模板页应该列全 9 套模板');
  const templateSources = await page
    .locator('.template-full .poster-image img')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src') || ''));
  assert.equal(
    new Set(templateSources).size,
    9,
    '每套模板要配一个不同的示例作品，不是同一个作品换九套配色',
  );
  await warmScroll(page);
  await page.screenshot({ path: path.join(out, 'templates-page.png'), fullPage: true });
  await page.getByRole('button', { name: '返回首页' }).click();
  await page.locator('.hero-art').waitFor();
  pass('展示模板页：九套模板配九个不同示例');
  const fixturePage = await context.newPage();
  await fixturePage.setContent(
    '<html lang="zh-CN"><style>@page{size:A4;margin:24mm}body{font-family:Arial,sans-serif}section{break-after:page}</style><section><h1>Graduation Project</h1><h2>Project Overview</h2><p>This is a two page project document used for upload verification.</p></section><h2>Design Process</h2><p>Research, prototyping and implementation.</p></html>',
  );
  await fixturePage.pdf({ path: path.join(out, 'fixture.pdf'), printBackground: true });
  await fixturePage.close();
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    return await new Promise<number[]>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
        stream.getTracks().forEach((t) => t.stop());
        resolve(Array.from(bytes));
      };
      recorder.start();
      let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = frame++ % 2 ? '#c94c30' : '#f0f0eb';
        ctx.fillRect(0, 0, 320, 180);
        if (frame >= 5) {
          clearInterval(timer);
          recorder.stop();
        }
      }, 100);
    });
  });
  await writeFile(path.join(out, 'fixture.webm'), Buffer.from(video));
  await writeFile(
    path.join(out, 'fixture.zip'),
    Buffer.from('504b0506000000000000000000000000000000000000', 'hex'),
  );
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '还没有账号？注册一个' }).click();
  await page.getByLabel('你的名字', { exact: true }).fill('流程验证作者');
  await page.getByLabel('邮箱', { exact: true }).fill('ui@example.test');
  await page.locator('input[autocomplete="new-password"]').fill('full-project-test-password');
  await page.getByRole('button', { name: '注册账号', exact: true }).click();
  await page.getByRole('button', { name: '流程验证作', exact: true }).waitFor();
  pass('注册账号并建立会话');
  await page.getByRole('button', { name: '创建作品', exact: true }).first().click();
  await page.waitForURL('**/studio/**');
  await page.getByLabel('项目名称 *', { exact: true }).fill('栖居之间：完整项目展示');
  await page.getByLabel('英文标题 / 副标题', { exact: true }).fill('BETWEEN SPACES');
  await page
    .getByLabel('项目介绍 *', { exact: true })
    .fill(
      '一项关于建筑、空间与交互体验的毕业设计。完整项目包含研究过程、视觉成果、演示视频以及论文。',
    );
  await page.getByLabel('我的职责', { exact: true }).fill('独立完成调研、交互设计与实现。');
  await page.getByLabel('制作工具 / 技术栈', { exact: true }).fill('React / Node.js / Blender');
  await page.getByLabel('在线体验地址', { exact: true }).fill('https://example.com');
  await page.getByLabel('源码仓库地址', { exact: true }).fill('https://github.com');
  await page.getByRole('button', { name: '作品素材', exact: true }).click();
  await page
    .getByLabel('上传项目素材', { exact: true })
    .setInputFiles([
      path.resolve('public/images/architecture.jpg'),
      path.resolve('public/images/interior.jpg'),
      path.join(out, 'fixture.pdf'),
      path.join(out, 'fixture.webm'),
      path.join(out, 'fixture.zip'),
    ]);
  await page.getByRole('button', { name: '保存修改', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('.operation-status'),
    {},
    { timeout: 120000 },
  );
  if (await page.locator('.editor-error').count())
    throw new Error(await page.locator('.editor-error').innerText());
  await page.screenshot({ path: path.join(out, 'upload-state.png'), fullPage: true });
  console.log('UPLOAD NOTICE', await page.locator('.field-notice').allTextContents());
  assert.equal(await page.locator('.asset-row').count(), 4);
  assert.equal(await page.locator('.attachment-item').count(), 3);
  assert.equal(await page.locator('video').count(), 1);
  pass('图片、两页PDF、真实WebM与ZIP上传');
  await page.getByRole('button', { name: '内容模块', exact: true }).click();
  await page.getByRole('button', { name: '添加内容模块', exact: true }).click();
  await page.getByLabel('模块标题', { exact: true }).fill('功能与技术架构');
  await page
    .getByLabel('模块说明', { exact: true })
    .fill('前端负责交互，后端负责身份、素材与发布权限；项目以模块组织，不挤在一张图里。');
  await page.locator('.section-image-picker button').nth(1).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('项目已保存到账号。', { exact: true }).waitFor();
  const studioUrl = page.url();
  await page.reload();
  await page.getByRole('button', { name: '内容模块', exact: true }).click();
  assert.equal(await page.getByLabel('模块标题', { exact: true }).inputValue(), '功能与技术架构');
  pass('内容模块、关联图片、服务端保存与刷新恢复');
  await page.getByRole('button', { name: '项目介绍', exact: true }).click();
  await page.getByLabel('项目名称 *', { exact: true }).fill('未保存修改恢复验证');
  await page.reload();
  await page.getByLabel('项目名称 *', { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('项目名称 *', { exact: true }).inputValue(),
    '未保存修改恢复验证',
  );
  await page.getByLabel('项目名称 *', { exact: true }).fill('栖居之间：完整项目展示');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('项目已保存到账号。', { exact: true }).waitFor();
  pass('未保存编辑的页面恢复');
  await page.getByRole('button', { name: '发布项目', exact: true }).click();
  await page.getByRole('button', { name: '确认公开发布', exact: true }).click();
  await page.getByLabel('公开展示链接', { exact: true }).waitFor();
  const publicLink = await page.getByLabel('公开展示链接', { exact: true }).inputValue();
  await page.screenshot({ path: path.join(out, 'editor-desktop.png'), fullPage: true });
  pass('发布完整项目并生成独立链接');
  const anonymous = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
  });
  const publicPage = await anonymous.newPage();
  publicPage.on('pageerror', (e) => errors.push(e.message));
  await publicPage.goto(publicLink);
  await publicPage.getByRole('heading', { name: '栖居之间：完整项目展示', level: 1 }).waitFor();
  assert.equal(await publicPage.locator('video').count(), 1);
  assert.equal(await publicPage.locator('.document-link').count(), 0);
  assert.equal(
    await publicPage.getByRole('heading', { name: '功能与技术架构', exact: true }).count(),
    1,
  );
  assert.equal(await publicPage.getByRole('link', { name: '查看源码' }).count(), 1);
  await publicPage.screenshot({
    path: path.join(out, 'public-project-desktop.png'),
    fullPage: true,
  });
  pass('匿名访客查看完整模块、视频与链接，私有附件不可见');
  await page.getByRole('button', { name: '作品素材', exact: true }).click();
  await page.getByLabel('发布时允许访客查看或下载').first().check();
  await page.getByRole('button', { name: '更新发布', exact: true }).click();
  await page.getByRole('button', { name: '确认公开发布', exact: true }).click();
  await page.getByLabel('公开展示链接', { exact: true }).waitFor();
  await publicPage.reload();
  await publicPage.locator('.document-link').waitFor();
  assert.match(await publicPage.locator('.document-link').innerText(), /PDF/);
  pass('作者选择公开完整PDF并更新发布');
  await page.getByRole('button', { name: '发布导出', exact: true }).click();
  await page.getByLabel('导出形式', { exact: true }).selectOption('cover');
  let event = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '导出封面', exact: true }).click();
  let download = await event;
  await download.saveAs(path.join(out, 'export-cover.png'));
  const meta = await sharp(await readFile(path.join(out, 'export-cover.png'))).metadata();
  assert.equal(meta.width, 1600);
  assert.equal(meta.height, 2000);
  await page.waitForFunction(() => !document.querySelector('.operation-status'));
  await page.getByLabel('导出形式', { exact: true }).selectOption('bundle');
  event = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: '导出图文包', exact: true }).click();
  download = await event;
  await download.saveAs(path.join(out, 'export-bundle.zip'));
  assert.equal(
    (await readFile(path.join(out, 'export-bundle.zip'))).subarray(0, 2).toString(),
    'PK',
  );
  pass('浏览器下载真实PNG封面与分页图文ZIP');
  await page.waitForFunction(() => !document.querySelector('.operation-status'));
  await page.getByLabel('导出形式', { exact: true }).selectOption('pdf');
  event = page.waitForEvent('download', { timeout: 180000 });
  await page.getByRole('button', { name: '导出作品集 PDF', exact: true }).click();
  download = await event;
  const suggested = download.suggestedFilename();
  await download.saveAs(path.join(out, 'export-portfolio.pdf'));
  const pdfBytes = await readFile(path.join(out, 'export-portfolio.pdf'));
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(suggested, /作品集\.pdf$/);
  const portfolio = await PDFDocument.load(pdfBytes);
  assert.ok(portfolio.getPageCount() >= 4, 'PDF 页数 ' + portfolio.getPageCount());
  assert.ok(
    (await page.locator('.publish-qr img').count()) === 1,
    '公开作品的展台二维码应该显示出来',
  );
  pass('浏览器下载作品集PDF，并显示展台二维码');
  await page.waitForFunction(() => !document.querySelector('.operation-status'));
  await page.getByLabel('导出形式', { exact: true }).selectOption('html');
  event = page.waitForEvent('download', { timeout: 180000 });
  await page.getByRole('button', { name: '导出单文件网页', exact: true }).click();
  download = await event;
  await download.saveAs(path.join(out, 'export-portfolio.html'));
  assert.match(download.suggestedFilename(), /作品集\.html$/);
  const exportedHtml = await readFile(path.join(out, 'export-portfolio.html'), 'utf8');
  assert.ok(exportedHtml.startsWith('<!doctype html>'));
  assert.ok(exportedHtml.includes('栖居之间'));
  assert.ok(exportedHtml.includes('data:image/'), '登录用户的网页版同样把图片内嵌进去');
  pass('浏览器下载单文件网页版作品集');
  await page.waitForFunction(() => !document.querySelector('.operation-status'));
  await page.getByRole('button', { name: '返回我的作品', exact: true }).click();
  await page.getByRole('button', { name: '栖居之间：完整项目展示', exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'workspace.png'), fullPage: true });
  await page.getByRole('button', { name: '切换深色模式', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'workspace-dark.png'), fullPage: true });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  pass('工作台与深色主题');
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
  });
  const phone = await mobile.newPage();
  await phone.goto(publicLink);
  await phone.getByRole('heading', { level: 1 }).waitFor();
  assert.ok(
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await phone.screenshot({ path: path.join(out, 'public-project-mobile.png'), fullPage: true });
  await phone.goto(base);
  await phone.locator('.hero-art .poster-image img').first().waitFor();
  assert.ok(
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  assert.equal(await phone.locator('.feature-cell').count(), 6, '手机端功能区同样 6 格');
  // 单列布局下模板区左侧文案不能再 sticky，否则会浮在模板卡上把卡片压住
  await phone.locator('.template-feature').scrollIntoViewIfNeeded();
  assert.equal(
    await phone.locator('.template-feature-copy').evaluate((el) => getComputedStyle(el).position),
    'static',
    '窄屏下模板区文案必须是静态定位，不能盖住模板卡',
  );
  const templateOverlap = await phone.evaluate(() => {
    window.scrollBy(0, 260);
    const copy = document.querySelector('.template-feature-copy')!.getBoundingClientRect();
    return [...document.querySelectorAll('.mini-template')].filter((card) => {
      const box = card.getBoundingClientRect();
      return (
        box.top < copy.bottom &&
        box.bottom > copy.top &&
        box.left < copy.right &&
        box.right > copy.left
      );
    }).length;
  });
  assert.equal(templateOverlap, 0, '滚动时模板卡不应与上方文案重合');
  await warmScroll(phone);
  await phone.screenshot({ path: path.join(out, 'home-mobile.png'), fullPage: true });
  pass('390px手机布局与模板区不重合');
  // isMobile 模拟下 innerWidth 会跟着布局视口一起变大，测不出溢出，这里用普通窄窗口再卡一道
  const narrow = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 1,
  });
  const small = await narrow.newPage();
  for (const target of [base, base + '/templates']) {
    await small.goto(target);
    await small.locator('h1').first().waitFor();
    await small.waitForTimeout(300);
    assert.ok(
      await small.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `${target} 在 360px 下不该有横向溢出`,
    );
  }
  await narrow.close();
  pass('360px 窄窗口无横向溢出');
  await mobile.addCookies(await context.cookies());
  await phone.goto(studioUrl);
  await phone.getByRole('button', { name: '作品素材', exact: true }).waitFor();
  await phone.getByRole('button', { name: '作品素材', exact: true }).click();
  assert.equal(await phone.locator('.asset-row').count(), 4);
  assert.ok(
    await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await phone.screenshot({ path: path.join(out, 'editor-mobile.png'), fullPage: true });
  pass('手机编辑器素材与发布入口');
  assert.deepEqual(
    await phone.locator('.canvas-stage').evaluate((el) => {
      const style = getComputedStyle(el);
      const chain = [...document.querySelectorAll('.canvas-stage,.editor-canvas')].filter(
        (node) => getComputedStyle(node).overflowY !== 'visible',
      ).length;
      return {
        overflowY: style.overflowY,
        overscroll: style.overscrollBehaviorY,
        scrollHosts: chain,
      };
    }),
    { overflowY: 'visible', overscroll: 'auto', scrollHosts: 0 },
    '手机端画布不能自己变成滚动容器，否则手指放在封面图上滑不动页面',
  );
  pass('手机端画布不吞滚动手势');
  await phone.goto(base);
  await phone.locator('.hero-copy').waitFor();

  await phone.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await phone.locator('.hero-copy').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  pass('减少动态效果偏好');
  const accessibility = await new AxeBuilder({ page: publicPage })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  await writeFile(
    path.join(out, 'accessibility.json'),
    JSON.stringify(accessibility.violations, null, 2),
  );
  const serious = accessibility.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  if (serious.length)
    throw new Error(
      'Accessibility: ' +
        serious.map((v) => v.id + ':' + v.nodes.map((n) => n.target.join(' ')).join(',')).join(';'),
    );
  pass('公开项目页自动无障碍检查');
  await page.goto(studioUrl);
  await page.getByRole('button', { name: '发布导出', exact: true }).click();
  await page.locator('input[value="private"]').check();
  await page
    .getByText('已改为私密：链接不再出现在发现页，只有你登录后能打开。', { exact: true })
    .waitFor();
  await publicPage.goto(publicLink);
  await publicPage.getByRole('heading', { name: '这个作品暂时无法访问。' }).waitFor();
  await publicPage.goto(base);
  await publicPage.getByLabel('搜索作品', { exact: true }).waitFor();
  assert.equal(await publicPage.getByText('栖居之间：完整项目展示').count(), 0);
  await page.goto(publicLink);
  await page.getByRole('heading', { name: '栖居之间：完整项目展示', level: 1 }).waitFor();
  pass('私密发布：匿名访客打不开链接也搜不到，作者本人仍可预览');
  await page.goto(studioUrl);
  await page.getByRole('button', { name: '发布导出', exact: true }).click();
  await page.locator('input[value="public"]').check();
  await page.getByText('已改为公开：任何人可以访问，并会出现在发现页。', { exact: true }).waitFor();
  await publicPage.goto(publicLink);
  await publicPage.getByRole('heading', { name: '栖居之间：完整项目展示', level: 1 }).waitFor();
  pass('切回公开后匿名访客恢复访问');
  await page.goto(studioUrl);
  await page.getByRole('button', { name: '发布导出', exact: true }).click();
  await page.getByRole('button', { name: '撤回公开展示', exact: true }).click();
  await page.getByText('项目已撤回，草稿仍然保留。', { exact: true }).waitFor();
  await publicPage.reload();
  await publicPage.getByRole('heading', { name: '这个作品暂时无法访问。' }).waitFor();
  pass('撤回后原链接不再公开');
  // 零填写导入：一个真实压缩包丢进首页，应该自己去建项目、传图、回填文字
  const importImages = await Promise.all(
    ['封面主视觉.png', '过程记录-01.png'].map(async (name, index) => [
      name,
      await sharp({
        create: {
          width: 1400,
          height: 900,
          channels: 3,
          background: index ? '#3e5549' : '#ce4c30',
        },
      })
        .jpeg()
        .toBuffer(),
    ]),
  );
  const importZip = zipSync({
    '潮汐来信/README.md': strToU8(
      [
        '# 潮汐来信',
        '',
        'LETTERS FROM THE SEA',
        '',
        '## 项目简介',
        '',
        '把海面的细微波动转化为视觉语言，作品由三组实时影像与一组实体装置组成，观众的手势会影响潮汐的涨落节奏。',
        '',
        '作者：林小满',
        '指导教师：陈思远',
        '学校：中国美术学院',
        '展位号：B-12',
        '',
        '演示地址：https://demo.example.com/tide',
        '源码：https://github.com/example/tide',
        '',
      ].join('\n'),
    ),
    '潮汐来信/素材/封面主视觉.png': new Uint8Array(importImages[0][1] as Buffer),
    '潮汐来信/素材/过程记录-01.png': new Uint8Array(importImages[1][1] as Buffer),
    '潮汐来信/node_modules/react/index.js': strToU8('module.exports = {};'),
  });
  const importPath = path.join(out, 'import-fixture.zip');
  await writeFile(importPath, Buffer.from(importZip));
  await page.goto(base);
  await page.locator('.hero-art .poster-image img').first().waitFor();
  await page.setInputFiles('.import-button input[type=file]', importPath);
  await page.waitForURL(/\/studio\//, { timeout: 120000 });
  await page.getByLabel('项目名称 *', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('项目名称 *', { exact: true }).inputValue(), '潮汐来信');
  assert.equal(
    await page.getByLabel('英文标题 / 副标题', { exact: true }).inputValue(),
    'LETTERS FROM THE SEA',
  );
  assert.match(
    await page.getByPlaceholder('背景、目标、解决的问题，以及最终成果。').inputValue(),
    /把海面的细微波动转化为视觉语言/,
  );
  assert.equal(await page.getByLabel('创作者', { exact: true }).inputValue(), '林小满');
  assert.equal(await page.getByLabel('作品方向', { exact: true }).inputValue(), '数字媒体');
  assert.match(await page.getByPlaceholder('https://…').inputValue(), /demo\.example\.com\/tide$/);
  assert.match(
    await page.getByPlaceholder('https://github.com/…').inputValue(),
    /github\.com\/example\/tide/,
  );
  await page.getByRole('button', { name: '方案与配色', exact: true }).click();
  assert.equal(await page.getByLabel('指导教师', { exact: true }).inputValue(), '陈思远');
  assert.equal(await page.getByLabel('展位', { exact: true }).inputValue(), 'B-12');
  await page.getByRole('button', { name: '分享封面', exact: true }).click();
  const posterWidth = await page
    .locator('.poster-image img')
    .first()
    .evaluate((el: HTMLImageElement) => el.naturalWidth);
  assert.ok(posterWidth > 400, '自动生成的海报宽度 ' + posterWidth);
  await page.getByRole('button', { name: '作品素材', exact: true }).click();
  await page.getByText('2 / 24 张图片', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'studio-imported.png'), fullPage: true });
  pass('零填写导入：压缩包自动变出填好的作品页');
  // 游客模式：一个干净的浏览器（未登录）也能建草稿、导出海报，只有发布要账号
  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
    acceptDownloads: true,
  });
  const guest = await guestContext.newPage();
  guest.on('pageerror', (e) => errors.push(e.message));
  await guest.goto(base);
  await guest.getByRole('button', { name: '创建作品', exact: true }).first().click();
  await guest.waitForURL(/\/studio\//, { timeout: 60000 });
  // 只点了「创建作品」、一个字没写：它不该在「我的作品」里冒充作品
  await guest.getByRole('button', { name: '返回我的作品', exact: true }).click();
  await guest.getByText('你的第一份代表作，从这里开始。', { exact: true }).waitFor();
  assert.equal(await guest.locator('.project-card').count(), 0, '没填过内容的空草稿不该进作品列表');
  await guest.getByRole('button', { name: '创建作品', exact: true }).first().click();
  await guest.waitForURL(/\/studio\//, { timeout: 60000 });
  await guest.getByLabel('项目名称 *', { exact: true }).fill('游客草稿');
  await guest.getByLabel('创作者', { exact: true }).fill('路过的人');
  await guest.getByRole('button', { name: '保存修改', exact: true }).click();
  await guest.getByText('草稿已保存在这台浏览器。', { exact: true }).waitFor();
  await guest.getByRole('button', { name: '发布导出', exact: true }).click();
  await guest.getByText('游客模式：草稿存在这台浏览器里', { exact: true }).waitFor();
  assert.equal(
    await guest.getByRole('button', { name: '发布项目', exact: true }).count(),
    0,
    '游客不应该看到发布按钮',
  );
  await guest.getByLabel('导出形式', { exact: true }).selectOption('pdf');
  let guestDownload = guest.waitForEvent('download', { timeout: 180000 });
  await guest.getByRole('button', { name: '导出作品集 PDF', exact: true }).click();
  let downloaded = await guestDownload;
  await downloaded.saveAs(path.join(out, 'guest-portfolio.pdf'));
  const guestPdf = await readFile(path.join(out, 'guest-portfolio.pdf'));
  assert.equal(guestPdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(downloaded.suggestedFilename(), /作品集\.pdf$/);
  assert.ok(
    (await PDFDocument.load(guestPdf)).getPageCount() >= 2,
    '游客作品集应该也能导出完整页数',
  );
  await guest.screenshot({ path: path.join(out, 'guest-publish.png'), fullPage: true });
  await guest.getByRole('button', { name: '返回我的作品', exact: true }).click();
  await guest.getByText('当前是游客模式', { exact: true }).waitFor();
  await guest.screenshot({ path: path.join(out, 'guest-works.png'), fullPage: true });
  await guest.getByRole('button', { name: '登录并接收草稿', exact: true }).click();
  await guest.getByLabel('邮箱', { exact: true }).fill('ui@example.test');
  await guest.locator('input[autocomplete="current-password"]').fill('full-project-test-password');
  await guest.getByRole('button', { name: '登录', exact: true }).last().click();
  await guest.getByText('已把 1 份浏览器草稿搬进账号。', { exact: true }).waitFor();
  await guest.getByRole('button', { name: '游客草稿', exact: true }).waitFor();
  await guestContext.close();
  pass('游客模式：不登录就能建草稿、导出作品集，发布引导登录，登录后草稿自动搬进账号');
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    path.join(out, 'e2e-results.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        browserErrors: errors,
        accessibilityViolations: accessibility.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
        })),
        scope: 'Chromium desktop and touch emulation; no physical phone',
      },
      null,
      2,
    ),
  );
  console.log('All ' + checks.length + ' browser checks passed.');
} catch (error) {
  await writeFile(path.join(out, 'e2e-failure.txt'), String(error) + '\n' + serverLog);
  throw error;
} finally {
  await browser?.close();
  server?.kill();
}
