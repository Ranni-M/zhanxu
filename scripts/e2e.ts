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
  await page.screenshot({ path: path.join(out, 'home-desktop.png'), fullPage: true });
  assert.equal(await page.locator('.project-card').count(), 4);
  await page.getByRole('textbox', { name: '搜索作品' }).fill('不存在的项目');
  await page.getByRole('heading', { name: '没有找到相关作品' }).waitFor();
  await page.getByRole('button', { name: '查看全部作品', exact: true }).click();
  pass('首页、示例封面与搜索空状态');
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
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
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
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
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
  await phone.screenshot({ path: path.join(out, 'home-mobile.png'), fullPage: true });
  pass('390px手机布局无横向溢出');
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
  await page.getByRole('button', { name: '撤回公开展示', exact: true }).click();
  await page.getByText('项目已撤回，草稿仍然保留。', { exact: true }).waitFor();
  await publicPage.reload();
  await publicPage.getByRole('heading', { name: '这个作品暂时无法访问。' }).waitFor();
  pass('撤回后原链接不再公开');
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
