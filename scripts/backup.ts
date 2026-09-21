import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { mkdir, cp, access, writeFile } from 'node:fs/promises';
const source = path.resolve(process.env.DATA_DIR || 'data');
const destination = path.resolve(
  process.argv[2] || 'backups/' + new Date().toISOString().replace(/[:.]/g, '-'),
);
if (destination === source || destination.startsWith(source + path.sep))
  throw new Error('Backup destination must be outside DATA_DIR.');
await access(path.join(source, 'zhanxu.sqlite'));
await mkdir(destination, { recursive: false });
const db = new DatabaseSync(path.join(source, 'zhanxu.sqlite'));
try {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.exec("VACUUM INTO '" + path.join(destination, 'zhanxu.sqlite').replaceAll("'", "''") + "'");
  await cp(path.join(source, 'files'), path.join(destination, 'files'), { recursive: true });
  await writeFile(
    path.join(destination, 'backup.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        format: 1,
        note: 'Stop the application before backup for file/database consistency.',
      },
      null,
      2,
    ),
  );
  console.log('Backup created: ' + destination);
} finally {
  db.close();
}
