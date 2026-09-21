import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'zhanxu.sqlite'));
db.exec(readFileSync(fileURLToPath(new URL('./schema-sqlite.sql', import.meta.url)), 'utf8'));
// CREATE TABLE IF NOT EXISTS 不会给已存在的表补列，结构性升级要在这里单独做。
// 只判断列是否存在，因此可以重复执行（每次启动都会跑一遍）。
function hasColumn(table: string, column: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((item) => item.name === column);
}
if (!hasColumn('publications', 'visibility'))
  db.exec("ALTER TABLE publications ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
// SQLite 不能给已有表补外键，只能重建；顺带清掉指向已删除项目的脏收藏。
function hasProjectForeignKey(table: string) {
  const list = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
    table: string;
    from: string;
  }[];
  return list.some((item) => item.table === 'projects' && item.from === 'project_id');
}
if (!hasProjectForeignKey('bookmarks'))
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE bookmarks_rebuilt(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,PRIMARY KEY(user_id,project_id));
    INSERT OR IGNORE INTO bookmarks_rebuilt(user_id,project_id)
      SELECT b.user_id,b.project_id FROM bookmarks b
      JOIN users u ON u.id=b.user_id JOIN projects p ON p.id=b.project_id;
    DROP TABLE bookmarks;
    ALTER TABLE bookmarks_rebuilt RENAME TO bookmarks;
    COMMIT;`);
export function transaction<T>(operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
