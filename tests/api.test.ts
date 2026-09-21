import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
let base = '',
  child: ChildProcess,
  dir = '',
  logs = '';
async function freePort() {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const address = s.address() as net.AddressInfo;
  await new Promise<void>((r) => s.close(() => r()));
  return address.port;
}
before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'zhanxu-api-'));
  const port = await freePort();
  base = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dir,
      PUBLIC_ORIGIN: base,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.on('data', (b) => (logs += b));
  child.stderr?.on('data', (b) => (logs += b));
  for (let n = 0; n < 80; n++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server failed to start: ' + logs);
});
after(async () => {
  child?.kill();
  if (child && child.exitCode === null)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
});
async function call(
  route: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  headers: Record<string, string> = {},
) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Zhanxu-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await response.json().catch(() => null);
  return { response, data, status: response.status };
}
async function register(email: string) {
  const result = await call('/auth/register', 'POST', {
    email,
    name: '测试创作者',
    password: 'correct-horse-test-password',
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const header = result.response.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/);
  return header.split(';')[0];
}
async function upload(
  project: string,
  cookie: string,
  bytes: Uint8Array,
  name: string,
  type: string,
) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  const response = await fetch(base + '/api/projects/' + project + '/assets', {
    method: 'POST',
    headers: { Cookie: cookie, 'X-Zhanxu-Request': '1' },
    body: form,
  });
  return { status: response.status, data: (await response.json()) as any };
}
async function job(id: string, cookie: string) {
  for (let n = 0; n < 200; n++) {
    const result = await call('/jobs/' + id, 'GET', undefined, cookie);
    if (['succeeded', 'failed'].includes(result.data.job.status)) return result.data.job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Job timed out ' + logs);
}
test('完整账号、项目隔离、私有素材、发布快照与分页导出', async (t) => {
  const owner = await register('owner@example.test'),
    other = await register('other@example.test');
  let project: any,
    image: any,
    pdf: any,
    slug = '',
    coverJob = '';
  await t.test('拒绝未登录访问与跨站请求', async () => {
    assert.equal((await call('/projects')).status, 401);
    assert.equal(
      (
        await call('/projects', 'POST', { template: 'editorial' }, owner, {
          Origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    const response = await fetch(base + '/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: owner },
    });
    assert.equal(response.status, 403);
  });
  await t.test('创建项目并阻止其他账号读写', async () => {
    project = (await call('/projects', 'POST', { template: 'editorial' }, owner)).data.project;
    assert.ok(project.id);
    assert.equal((await call('/projects/' + project.id, 'GET', undefined, other)).status, 404);
    assert.equal((await call('/projects/' + project.id, 'DELETE', undefined, other)).status, 404);
    assert.equal((await call('/projects', 'GET', undefined, other)).data.projects.length, 0);
  });
  await t.test('校验上传字节并保护原始素材', async () => {
    const fixture = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#bb5a34' },
    })
      .png()
      .toBuffer();
    const good = await upload(project.id, owner, fixture, 'design.png', 'image/png');
    assert.equal(good.status, 201);
    image = good.data.asset;
    const bad = await upload(
      project.id,
      owner,
      Buffer.from('not an image'),
      'wrong.png',
      'image/png',
    );
    assert.equal(bad.status, 400);
    assert.equal((await fetch(base + image.src)).status, 401);
    assert.equal((await fetch(base + image.src, { headers: { Cookie: other } })).status, 404);
    const doc = await upload(
      project.id,
      owner,
      Buffer.from('%PDF-1.4\n% fixture\n%%EOF'),
      'thesis.pdf',
      'application/pdf',
    );
    assert.equal(doc.status, 201);
    pdf = doc.data.asset;
  });
  await t.test('保存内容模块，拒绝过期版本与危险链接', async () => {
    project = {
      ...project,
      title: '完整项目测试',
      intro: '这不是一张图，而是一份包含模块、视频与附件的完整项目。',
      role: '设计与全栈实现',
      images: [{ id: image.id, name: '架构预览', src: image.src }],
      attachments: [{ ...pdf, visible: false }],
      sections: [
        {
          id: randomUUID(),
          title: '功能介绍',
          body: '登录、上传、展示与导出。',
          imageIds: [image.id],
        },
      ],
    };
    const saved = await call('/projects/' + project.id, 'PUT', project, owner);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal((await call('/projects/' + project.id, 'PUT', project, owner)).status, 409);
    project = saved.data.project;
    assert.equal(
      (
        await call(
          '/projects/' + project.id,
          'PUT',
          { ...project, demoUrl: 'javascript:alert(1)' },
          owner,
        )
      ).status,
      400,
    );
  });
  await t.test('发布仅公开选择的素材，草稿修改不改变公开快照', async () => {
    const result = await call(
      '/projects/' + project.id + '/publish',
      'POST',
      { revision: project.revision },
      owner,
    );
    assert.equal(result.status, 200);
    slug = result.data.slug;
    const pub = await call('/publications/' + slug);
    assert.equal(pub.status, 200);
    assert.equal(pub.data.project.attachments.length, 0);
    assert.equal((await fetch(base + pub.data.project.images[0].src)).status, 200);
    assert.equal((await fetch(base + '/api/public-assets/' + slug + '/' + pdf.id)).status, 404);
    project = (
      await call('/projects/' + project.id, 'PUT', { ...project, title: '修改后的草稿' }, owner)
    ).data.project;
    assert.equal((await call('/publications/' + slug)).data.project.title, '完整项目测试');
  });
  await t.test('服务端生成PNG和多页ZIP，任务跨用户不可访问', async () => {
    const result = await call(
      '/projects/' + project.id + '/exports',
      'POST',
      { format: 'cover', revision: project.revision },
      owner,
    );
    assert.equal(result.status, 202);
    coverJob = result.data.id;
    assert.equal((await call('/jobs/' + coverJob, 'GET', undefined, other)).status, 404);
    const done = await job(coverJob, owner);
    assert.equal(done.status, 'succeeded', done.error);
    const downloaded = await fetch(base + done.downloadUrl, { headers: { Cookie: owner } });
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    const info = await sharp(bytes).metadata();
    assert.equal(info.width, 1600);
    assert.equal(info.height, 2000);
    assert.equal(
      (await fetch(base + done.downloadUrl, { headers: { Cookie: other } })).status,
      404,
    );
    const again = await call(
      '/projects/' + project.id + '/exports',
      'POST',
      { format: 'cover', revision: project.revision },
      owner,
    );
    assert.equal(again.data.id, coverJob);
    const bundle = await call(
      '/projects/' + project.id + '/exports',
      'POST',
      { format: 'bundle', revision: project.revision },
      owner,
    );
    const finished = await job(bundle.data.id, owner);
    assert.equal(finished.status, 'succeeded', finished.error);
    const zip = Buffer.from(
      await (
        await fetch(base + finished.downloadUrl, { headers: { Cookie: owner } })
      ).arrayBuffer(),
    );
    assert.equal(zip.subarray(0, 2).toString(), 'PK');
    assert.ok(zip.includes(Buffer.from('01-project.png')));
    assert.ok(zip.includes(Buffer.from('03-project.png')));
  });
  await t.test('更新发布可公开完整PDF，撤回立即收回访问', async () => {
    project = (
      await call(
        '/projects/' + project.id,
        'PUT',
        { ...project, attachments: [{ ...pdf, visible: true }] },
        owner,
      )
    ).data.project;
    assert.equal(
      (
        await call(
          '/projects/' + project.id + '/publish',
          'POST',
          { revision: project.revision },
          owner,
        )
      ).status,
      200,
    );
    const pub = await call('/publications/' + slug);
    assert.equal(pub.data.project.title, '修改后的草稿');
    assert.equal(pub.data.project.attachments.length, 1);
    assert.equal((await fetch(base + pub.data.project.attachments[0].src)).status, 200);
    assert.equal(
      (await call('/projects/' + project.id + '/publication', 'DELETE', undefined, owner)).status,
      200,
    );
    assert.equal((await call('/publications/' + slug)).status, 404);
    assert.equal((await fetch(base + '/api/public-assets/' + slug + '/' + image.id)).status, 404);
  });
  await t.test('删除项目使文件与导出不可访问，数据库不保存明文密码', async () => {
    assert.equal((await call('/projects/' + project.id, 'DELETE', undefined, owner)).status, 200);
    assert.equal((await fetch(base + image.src, { headers: { Cookie: owner } })).status, 404);
    assert.equal((await call('/jobs/' + coverJob, 'GET', undefined, owner)).status, 404);
    const file = await readFile(path.join(dir, 'zhanxu.sqlite'));
    assert.ok(!file.includes(Buffer.from('correct-horse-test-password')));
  });
  await t.test('退出登录令会话失效', async () => {
    assert.equal((await call('/auth/logout', 'POST', {}, owner)).status, 200);
    assert.equal((await call('/auth/me', 'GET', undefined, owner)).data.user, null);
  });
});
