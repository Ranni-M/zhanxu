import type { Birth } from '../domain/project';
const CELL = 11;
const GAP = 2;
const TOP = 18;
const MONTHS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
function pad(value: number) {
  return String(value).padStart(2, '0');
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function level(count: number) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}
function formatDate(at: number) {
  const date = new Date(at);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}
/** 出生证明：把「改了多少次」变成一张看得见的创作热力图 */
export default function BirthCertificate({
  birth,
  compact = false,
}: {
  birth: Birth;
  compact?: boolean;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map(birth.days.map((entry) => [entry.day, entry.count]));
  // 至少铺满 26 周，有更早的记录就从那时开始
  const first = birth.days[0] ? new Date(birth.days[0].day + 'T00:00:00') : today;
  const floor = new Date(today.getTime() - 181 * 86400000);
  const start = new Date(Math.min(first.getTime(), floor.getTime()));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells: { day: string; count: number; date: Date }[] = [];
  for (const cursor = new Date(start); cursor <= today; cursor.setDate(cursor.getDate() + 1))
    cells.push({
      day: dayKey(cursor),
      count: counts.get(dayKey(cursor)) || 0,
      date: new Date(cursor),
    });
  const weeks = Math.ceil(cells.length / 7);
  const width = weeks * (CELL + GAP);
  const height = 7 * (CELL + GAP) + TOP;
  const monthMarks = cells.reduce<{ x: number; label: string }[]>((marks, cell, index) => {
    if (cell.date.getDate() <= 7 && index % 7 === 0) {
      const label = MONTHS[cell.date.getMonth()];
      if (marks[marks.length - 1]?.label !== label)
        marks.push({ x: Math.floor(index / 7) * (CELL + GAP), label });
    }
    return marks;
  }, []);
  if (!birth.days.length)
    return (
      <section className={'birth' + (compact ? ' is-compact' : '')} aria-label="出生证明">
        <div className="birth-head">
          <h3>出生证明</h3>
        </div>
        <p className="birth-empty">还没有创作记录。保存一次修改，今天就会亮起来。</p>
      </section>
    );
  return (
    <section className={'birth' + (compact ? ' is-compact' : '')} aria-label="出生证明">
      <div className="birth-head">
        <h3>出生证明</h3>
        <span className="birth-since">始于 {formatDate(birth.startedAt)}</span>
      </div>
      <dl className="birth-stats">
        <div>
          <dt>创作天数</dt>
          <dd>{birth.activeDays}</dd>
        </div>
        <div>
          <dt>累计修改</dt>
          <dd>{birth.edits}</dd>
        </div>
        <div>
          <dt>连续创作</dt>
          <dd>{birth.streak}</dd>
        </div>
        <div>
          <dt>保存版本</dt>
          <dd>{birth.versions}</dd>
        </div>
      </dl>
      <div className="birth-scroll">
        <svg
          className="birth-grid"
          viewBox={`-17 0 ${width + 17} ${height}`}
          width={width + 17}
          height={height}
          role="img"
          aria-label={`创作热力图：${birth.activeDays} 天有修改，累计 ${birth.edits} 次`}
        >
          {monthMarks.map((mark) => (
            <text key={mark.label + mark.x} className="birth-month" x={mark.x} y={11}>
              {mark.label}
            </text>
          ))}
          <text className="birth-weekday" x={-7} y={TOP + 1 * (CELL + GAP) + 9} textAnchor="end">
            {WEEKDAYS[0]}
          </text>
          <text className="birth-weekday" x={-7} y={TOP + 3 * (CELL + GAP) + 9} textAnchor="end">
            {WEEKDAYS[2]}
          </text>
          <text className="birth-weekday" x={-7} y={TOP + 5 * (CELL + GAP) + 9} textAnchor="end">
            {WEEKDAYS[4]}
          </text>
          {cells.map((cell, index) => (
            <rect
              key={cell.day}
              className={'birth-cell level-' + level(cell.count)}
              x={Math.floor(index / 7) * (CELL + GAP)}
              y={TOP + (index % 7) * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={3}
            >
              <title>
                {cell.day} · {cell.count ? cell.count + ' 次修改' : '没有修改'}
              </title>
            </rect>
          ))}
        </svg>
      </div>
      <p className="birth-legend">
        最近一次修改 {formatDate(birth.lastAt)} · 存续 {birth.spanDays} 天
      </p>
    </section>
  );
}
