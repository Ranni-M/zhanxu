import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
test('备份生成可独立打开的数据库与完整素材，并拒绝覆盖或递归备份', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'zhanxu-backup-')),
    source = path.join(root, 'source'),
    destination = path.join(root, 'snapshot');
  await mkdir(path.join(source, 'files'), { recursive: true });
  const db = new DatabaseSync(path.join(source, 'zhanxu.sqlite'));
  db.exec('CREATE TABLE example(id INTEGER PRIMARY KEY, title TEXT)');
  db.prepare('INSERT INTO example(title) VALUES(?)').run('作品备份');
  db.close();
  await writeFile(path.join(source, 'files', 'fixture.txt'), 'complete project file', 'utf8');
  const run = (target: string) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/backup.ts', target], {
      env: { ...process.env, DATA_DIR: source },
      encoding: 'utf8',
      windowsHide: true,
    });
  const result = run(destination);
  assert.equal(result.status, 0, result.stderr);
  const restored = new DatabaseSync(path.join(destination, 'zhanxu.sqlite'));
  assert.equal(restored.prepare('SELECT title FROM example').get()!.title, '作品备份');
  restored.close();
  assert.equal(
    await readFile(path.join(destination, 'files', 'fixture.txt'), 'utf8'),
    'complete project file',
  );
  await access(path.join(destination, 'backup.json'));
  assert.notEqual(run(destination).status, 0);
  assert.notEqual(run(path.join(source, 'nested')).status, 0);
});
