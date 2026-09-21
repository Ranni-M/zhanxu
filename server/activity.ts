import { db } from './db/index.ts';
export type BirthDay = { day: string; count: number };
export type Birth = {
  days: BirthDay[];
  /** 累计编辑/上传/发布次数 */
  edits: number;
  /** 有动作的天数 */
  activeDays: number;
  /** 从第一次动笔到今天的天数 */
  spanDays: number;
  /** 当前连续创作天数（今天还没动手也算，最多容忍昨天） */
  streak: number;
  /** 已保存的版本数 */
  versions: number;
  startedAt: number;
  lastAt: number;
};
const pad = (value: number) => String(value).padStart(2, '0');
function dayKey(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dayTime(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}
/** 记录一次创作动作。统计永远不该把主流程一起弄挂，所以这里吞掉异常。 */
export function recordActivity(projectId: string, amount = 1) {
  try {
    db.prepare(
      'INSERT INTO activity(project_id,day,count) VALUES(?,?,?) ON CONFLICT(project_id,day) DO UPDATE SET count=count+excluded.count',
    ).run(projectId, dayKey(Date.now()), amount);
  } catch (error) {
    console.error('Activity log failed:', error instanceof Error ? error.message : error);
  }
}
/** 出生证明：创作热力图 + 汇总。实时读取，不跟着发布快照冻结。 */
export function birth(projectId: string): Birth {
  const rows = db
    .prepare('SELECT day,count FROM activity WHERE project_id=? ORDER BY day')
    .all(projectId) as BirthDay[];
  const project = db
    .prepare('SELECT revision,created_at FROM projects WHERE id=?')
    .get(projectId) as { revision: number; created_at: number } | undefined;
  const today = dayTime(dayKey(Date.now()));
  const first = rows[0]?.day;
  const last = rows[rows.length - 1]?.day;
  let streak = 0;
  if (last && Math.round((today - dayTime(last)) / 86400000) <= 1) {
    streak = 1;
    for (let index = rows.length - 1; index > 0; index -= 1)
      if (Math.round((dayTime(rows[index].day) - dayTime(rows[index - 1].day)) / 86400000) === 1)
        streak += 1;
      else break;
  }
  return {
    days: rows,
    edits: rows.reduce((sum, row) => sum + row.count, 0),
    activeDays: rows.length,
    spanDays: first ? Math.round((today - dayTime(first)) / 86400000) + 1 : 0,
    streak,
    versions: project?.revision ?? 0,
    startedAt: project?.created_at ?? (first ? dayTime(first) : Date.now()),
    lastAt: last ? dayTime(last) : (project?.created_at ?? Date.now()),
  };
}
