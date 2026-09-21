import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
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
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

before(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'zhanxu-features-'));
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

test('配色烘焙、多方案数据与出生证明', async (t) => {
  const owner = await register('paint@example.test');
  const other = await register('intruder@example.test');
  let project: any,
    image: any,
    archive: any,
    slug = '';

  await t.test('新模板与展签信息随文档保存，非法模板被拒绝', async () => {
    project = (await call('/projects', 'POST', { template: 'cobalt' }, owner)).data.project;
    assert.equal(project.template, 'cobalt');
    const reject = await call(
      '/projects/' + project.id,
      'PUT',
      { ...project, template: 'not-a-template' },
      owner,
    );
    assert.equal(reject.status, 400);
    const fixture = await sharp({
      create: {
        width: 120,
        height: 90,
        channels: 4,
        background: { r: 60, g: 120, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const first = await upload(project.id, owner, fixture, 'front.png', 'image/png');
    const second = await upload(project.id, owner, fixture, 'detail.png', 'image/png');
    assert.equal(first.status, 201, JSON.stringify(first.data));
    image = first.data.asset;
    const saved = await call(
      '/projects/' + project.id,
      'PUT',
      {
        ...project,
        title: '配色测试',
        intro: '检查配色、方案与出生证明。',
        skeleton: 'split',
        posterSize: 'story',
        coverIndex: 1,
        meta: {
          school: '测试美院',
          major: '视觉传达',
          advisor: '',
          booth: 'A-12',
          period: '',
          tagline: '先看见，再理解',
        },
        images: [
          { id: image.id, name: '正面', src: image.src },
          { id: second.data.asset.id, name: '细节', src: second.data.asset.src },
        ],
      },
      owner,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    project = saved.data.project;
    assert.equal(project.coverIndex, 1);
    assert.equal(project.meta.tagline, '先看见，再理解');
    assert.equal(project.skeleton, 'split');
    assert.equal(project.posterSize, 'story');
  });

  await t.test('方案与对比组引用到已删除的图片时静默收敛', async () => {
    const saved = await call(
      '/projects/' + project.id,
      'PUT',
      {
        ...project,
        options: [
          { id: randomUUID(), label: '方案 A', note: '', imageIds: [project.images[0].id] },
          { id: randomUUID(), label: '空方案', note: '', imageIds: [randomUUID()] },
        ],
        compares: [
          {
            id: randomUUID(),
            label: '有效对比',
            before: project.images[0].id,
            after: project.images[1].id,
          },
          {
            id: randomUUID(),
            label: '无效对比',
            before: project.images[0].id,
            after: randomUUID(),
          },
          {
            id: randomUUID(),
            label: '同一张图',
            before: project.images[0].id,
            after: project.images[0].id,
          },
        ],
      },
      owner,
    );
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    project = saved.data.project;
    assert.equal(project.options.length, 1);
    assert.equal(project.options[0].label, '方案 A');
    assert.equal(project.compares.length, 1);
    assert.equal(project.compares[0].label, '有效对比');
  });

  await t.test('图片配色按需烘焙、写入缓存并复用结果', async () => {
    const identity = await fetch(base + image.src + '/colorway?hue=0&sat=1&bri=1', {
      headers: { Cookie: owner },
    });
    const original = await fetch(base + image.src, { headers: { Cookie: owner } });
    assert.equal(identity.status, 200);
    assert.deepEqual(
      Buffer.from(await identity.arrayBuffer()),
      Buffer.from(await original.arrayBuffer()),
    );
    const baked = await fetch(base + image.src + '/colorway?hue=140&sat=1.2&bri=0.9', {
      headers: { Cookie: owner },
    });
    assert.equal(baked.status, 200);
    assert.equal(baked.headers.get('content-type'), 'image/png');
    assert.match(baked.headers.get('cache-control') || '', /max-age=86400/);
    const painted = Buffer.from(await baked.arrayBuffer());
    const again = Buffer.from(
      await (
        await fetch(base + image.src + '/colorway?hue=140&sat=1.2&bri=0.9', {
          headers: { Cookie: owner },
        })
      ).arrayBuffer(),
    );
    assert.deepEqual(painted, again);
    const files = await readdir(path.join(dir, 'derived'));
    assert.equal(files.length, 1);
    assert.equal(files[0], image.id + '-h140_s1.2_b0.9.png');
  });

  await t.test('越界参数被夹紧，非法参数与非图片被拒绝', async () => {
    const clamped = await fetch(base + image.src + '/colorway?hue=9999&sat=5&bri=0.1', {
      headers: { Cookie: owner },
    });
    assert.equal(clamped.status, 200);
    const files = await readdir(path.join(dir, 'derived'));
    assert.ok(files.includes(image.id + '-h180_s1.5_b0.5.png'), files.join(','));
    assert.equal(
      (await fetch(base + image.src + '/colorway?sat=abc', { headers: { Cookie: owner } })).status,
      400,
    );
    const packed = await upload(
      project.id,
      owner,
      Buffer.from('PK\x03\x04' + '\0'.repeat(24)),
      'archive.zip',
      'application/zip',
    );
    assert.equal(packed.status, 201, JSON.stringify(packed.data));
    archive = packed.data.asset;
    assert.equal(
      (await fetch(base + archive.src + '/colorway?hue=90', { headers: { Cookie: owner } })).status,
      400,
    );
  });

  await t.test('别人拿不到配色地址，访客只能看公开素材', async () => {
    assert.equal(
      (await fetch(base + image.src + '/colorway?hue=90', { headers: { Cookie: other } })).status,
      404,
    );
    assert.equal((await fetch(base + image.src + '/colorway?hue=90')).status, 401);
    const published = await call(
      '/projects/' + project.id + '/publish',
      'POST',
      { revision: project.revision },
      owner,
    );
    assert.equal(published.status, 200, JSON.stringify(published.data));
    slug = published.data.slug;
    const publicImage = published.data.project.images[0];
    const publicBaked = await fetch(
      base + '/api/public-assets/' + slug + '/' + publicImage.id + '/colorway?hue=200&sat=1.4',
    );
    assert.equal(publicBaked.status, 200);
    assert.equal(publicBaked.headers.get('content-type'), 'image/png');
    assert.equal(
      (await fetch(base + '/api/public-assets/' + slug + '/' + archive.id + '/colorway?hue=90'))
        .status,
      404,
    );
  });

  await t.test('出生证明统计保存与发布，且只有作者能看', async () => {
    const birth = await call('/projects/' + project.id + '/birth', 'GET', undefined, owner);
    assert.equal(birth.status, 200);
    assert.equal(birth.data.birth.activeDays, 1);
    assert.equal(birth.data.birth.streak, 1);
    // 两次上传、两次保存、一次上传 ZIP、一次发布，每个动作记 1 次
    assert.equal(birth.data.birth.edits, 6);
    assert.equal(birth.data.birth.versions, project.revision);
    assert.ok(birth.data.birth.startedAt > 0);
    assert.equal(
      (await call('/projects/' + project.id + '/birth', 'GET', undefined, other)).status,
      404,
    );
    const visitor = await call('/publications/' + slug);
    assert.equal(visitor.status, 200);
    assert.equal(visitor.data.project.birth.activeDays, 1);
    // 出生证明是实时统计：草稿再改一次，访客立刻看到新的一格
    project = (
      await call('/projects/' + project.id, 'PUT', { ...project, subtitle: '又改了一版' }, owner)
    ).data.project;
    const refreshed = await call('/publications/' + slug);
    assert.equal(refreshed.data.project.birth.edits, 7);
    // 草稿文字仍在快照里冻结，只有出生证明是实时的
    assert.equal(refreshed.data.project.subtitle, '');
  });
});
