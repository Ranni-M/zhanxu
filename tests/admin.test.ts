import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const adminEmail = 'admin@example.test';
const password = 'correct-horse-test-password';
let base = '',
  child: ChildProcess,
  dir = '',
  logs = '';

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'zhanxu-admin-'));
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
      // 大小写与空格都要能容忍，否则线上复制邮箱时很容易配错
      ADMIN_EMAILS: ' ' + adminEmail.toUpperCase() + ' , second@example.test',
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

async function call(route: string, method = 'GET', body?: unknown, cookie = '') {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Zhanxu-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    response,
    data: (await response.json().catch(() => null)) as any,
    status: response.status,
  };
}

async function register(email: string, name = '创作者') {
  const result = await call('/auth/register', 'POST', { email, name, password });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.response.headers.get('set-cookie')!.split(';')[0];
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

const storedFiles = () => readdir(path.join(dir, 'files'));

test('管理员删除能力与公开/私密发布', async (t) => {
  const admin = await register(adminEmail, '站长');
  const owner = await register('owner@example.test');
  const other = await register('other@example.test');
  let project: any,
    image: any,
    pdf: any,
    slug = '',
    privateSlug = '';

  await t.test('只有 ADMIN_EMAILS 里的账号能进入管理接口', async () => {
    assert.equal((await call('/auth/me', 'GET', undefined, admin)).data.user.isAdmin, true);
    assert.equal((await call('/auth/me', 'GET', undefined, owner)).data.user.isAdmin, false);
    assert.equal((await call('/admin/overview')).status, 401);
    assert.equal((await call('/admin/projects', 'GET', undefined, owner)).status, 403);
    assert.equal((await call('/admin/orphans', 'GET', undefined, owner)).status, 403);
    assert.equal((await call('/admin/projects', 'GET', undefined, admin)).status, 200);
  });

  await t.test('总览按账号统计项目、文件与占用', async () => {
    project = (await call('/projects', 'POST', { template: 'editorial' }, owner)).data.project;
    const fixture = await sharp({
      create: {
        width: 120,
        height: 90,
        channels: 4,
        background: { r: 20, g: 90, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    image = (await upload(project.id, owner, fixture, 'cover.png', 'image/png')).data.asset;
    pdf = (
      await upload(project.id, owner, Buffer.from('%PDF-1.4\n%%EOF'), 'doc.pdf', 'application/pdf')
    ).data.asset;
    project = {
      ...project,
      title: '管理测试项目',
      intro: '用于验证管理接口的项目。',
      category: '视觉传达',
      images: [{ id: image.id, name: '封面', src: image.src }],
      attachments: [{ ...pdf, visible: true }],
      sections: [{ id: randomUUID(), title: '正文', body: '内容', imageIds: [image.id] }],
    };
    project = (await call('/projects/' + project.id, 'PUT', project, owner)).data.project;
    const overview = (await call('/admin/overview', 'GET', undefined, admin)).data;
    const row = overview.users.find((user: any) => user.email === 'owner@example.test');
    assert.equal(row.project_count, 1);
    assert.equal(row.file_count, 2);
    assert.equal(row.live_count, 0);
    assert.ok(row.bytes > 0);
    assert.equal(overview.totals.users, 3);
    assert.ok(overview.disk.free > 0 && overview.disk.total > 0);
    const listed = (await call('/admin/projects', 'GET', undefined, admin)).data.projects.find(
      (item: any) => item.id === project.id,
    );
    assert.equal(listed.title, '管理测试项目');
    assert.equal(listed.ownerEmail, 'owner@example.test');
    assert.equal(listed.fileCount, 2);
    assert.equal(listed.slug, null);
    const detail = (
      await call('/admin/projects/' + project.id + '/assets', 'GET', undefined, admin)
    ).data;
    assert.deepEqual(
      detail.assets.map((asset: any) => asset.used),
      [true, true],
    );
  });

  await t.test('发布时选择私密：不进发现页，只有作者与管理员看得到', async () => {
    privateSlug = (
      await call(
        '/projects/' + project.id + '/publish',
        'POST',
        { revision: project.revision, visibility: 'private' },
        owner,
      )
    ).data.slug;
    assert.ok(privateSlug);
    project = (await call('/projects/' + project.id, 'GET', undefined, owner)).data.project;
    assert.equal(project.publishedVisibility, 'private');
    assert.equal((await call('/publications/' + privateSlug)).status, 404);
    assert.equal((await call('/publications/' + privateSlug, 'GET', undefined, other)).status, 404);
    assert.equal(
      (await fetch(base + '/api/public-assets/' + privateSlug + '/' + image.id)).status,
      404,
    );
    const mine = await call('/publications/' + privateSlug, 'GET', undefined, owner);
    assert.equal(mine.status, 200);
    assert.equal(mine.data.project.title, '管理测试项目');
    assert.equal(mine.data.project.publishedVisibility, 'private');
    assert.equal((await call('/publications/' + privateSlug, 'GET', undefined, admin)).status, 200);
    const feed = (await call('/publications')).data.projects;
    assert.equal(
      feed.some((item: any) => item.publishedSlug === privateSlug),
      false,
    );
    const adminList = (await call('/admin/projects', 'GET', undefined, admin)).data.projects.find(
      (item: any) => item.id === project.id,
    );
    assert.equal(adminList.visibility, 'private');
    const overview = (await call('/admin/overview', 'GET', undefined, admin)).data;
    assert.equal(overview.totals.live, 1);
    assert.equal(overview.totals.live_private, 1);
  });

  await t.test('切换公开范围不需要重新发布', async () => {
    const before = (await call('/projects/' + project.id, 'GET', undefined, owner)).data.project;
    const switched = await call(
      '/projects/' + project.id + '/publication',
      'PUT',
      { visibility: 'public' },
      owner,
    );
    assert.equal(switched.status, 200);
    assert.equal(switched.data.project.publishedRevision, before.publishedRevision);
    assert.equal(switched.data.project.revision, before.revision);
    assert.equal((await call('/publications/' + privateSlug)).status, 200);
    assert.equal(
      (await fetch(base + '/api/public-assets/' + privateSlug + '/' + image.id)).status,
      200,
    );
    assert.equal(
      (await call('/publications')).data.projects.some(
        (item: any) => item.publishedSlug === privateSlug,
      ),
      true,
    );
    assert.equal(
      (
        await call(
          '/projects/' + project.id + '/publication',
          'PUT',
          { visibility: 'hidden' },
          owner,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          '/projects/' + project.id + '/publication',
          'PUT',
          { visibility: 'private' },
          other,
        )
      ).status,
      404,
    );
    // 撤回后不再能切换范围
    await call('/projects/' + project.id + '/publication', 'PUT', { visibility: 'private' }, owner);
    await call('/projects/' + project.id + '/publication', 'DELETE', undefined, owner);
    assert.equal(
      (
        await call(
          '/projects/' + project.id + '/publication',
          'PUT',
          { visibility: 'public' },
          owner,
        )
      ).status,
      404,
    );
  });

  await t.test('再次发布沿用上次的公开范围', async () => {
    project = (await call('/projects/' + project.id, 'GET', undefined, owner)).data.project;
    slug = (
      await call(
        '/projects/' + project.id + '/publish',
        'POST',
        { revision: project.revision, visibility: 'private' },
        owner,
      )
    ).data.slug;
    project = (await call('/projects/' + project.id, 'GET', undefined, owner)).data.project;
    const updated = await call(
      '/projects/' + project.id + '/publish',
      'POST',
      { revision: project.revision },
      owner,
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.data.visibility, 'private');
    assert.equal(updated.data.slug, slug);
    assert.equal((await call('/publications/' + slug)).status, 404);
  });

  await t.test('删除单个文件会同时清理草稿文档与发布快照', async () => {
    await call('/projects/' + project.id + '/publication', 'PUT', { visibility: 'public' }, owner);
    const files = await storedFiles();
    const removed = await call('/admin/assets/' + image.id, 'DELETE', undefined, admin);
    assert.equal(removed.status, 200);
    assert.equal(removed.data.removedFromSnapshot, true);
    const draft = (await call('/projects/' + project.id, 'GET', undefined, owner)).data.project;
    assert.deepEqual(draft.images, []);
    assert.deepEqual(draft.sections[0].imageIds, []);
    const live = (await call('/publications/' + slug)).data.project;
    assert.deepEqual(live.images, []);
    assert.equal((await call('/admin/assets/' + image.id, 'DELETE', undefined, admin)).status, 404);
    assert.equal((await storedFiles()).length, files.length - 1);
  });

  await t.test('删除项目与账号会连带清理磁盘文件', async () => {
    const adminId = (await call('/auth/me', 'GET', undefined, admin)).data.user.id;
    assert.equal((await call('/admin/users/' + adminId, 'DELETE', undefined, admin)).status, 400);
    assert.equal(
      (await call('/admin/projects/' + project.id, 'DELETE', undefined, admin)).status,
      200,
    );
    assert.equal((await call('/projects/' + project.id, 'GET', undefined, owner)).status, 404);
    assert.equal((await call('/publications/' + slug)).status, 404);
    assert.equal((await storedFiles()).length, 0);
    const ownerId = (await call('/auth/me', 'GET', undefined, owner)).data.user.id;
    assert.equal((await call('/admin/users/' + ownerId, 'DELETE', undefined, admin)).status, 200);
    assert.equal((await call('/auth/me', 'GET', undefined, owner)).data.user, null);
    assert.equal((await call('/admin/users/' + ownerId, 'DELETE', undefined, admin)).status, 404);
    assert.equal((await call('/admin/overview', 'GET', undefined, admin)).data.totals.users, 2);
  });

  await t.test('孤儿文件只清理一小时以前的', async () => {
    const stale = randomUUID() + '.png';
    await writeFile(path.join(dir, 'files', stale), Buffer.alloc(2048, 7));
    const past = new Date(Date.now() - 7200_000);
    await utimes(path.join(dir, 'files', stale), past, past);
    const fresh = randomUUID() + '.png';
    await writeFile(path.join(dir, 'files', fresh), Buffer.alloc(1024, 9));
    const orphans = (await call('/admin/orphans', 'GET', undefined, admin)).data;
    assert.equal(orphans.files.length, 2);
    assert.equal(orphans.files.find((file: any) => file.name === stale).ageHours, 2);
    assert.equal(orphans.total, 3072);
    assert.equal((await call('/admin/orphans', 'DELETE', undefined, admin)).data.removed, 1);
    assert.deepEqual(await storedFiles(), [fresh]);
  });
});
