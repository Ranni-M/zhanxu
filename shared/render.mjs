// Shared browser/server rendering. No storage, network or framework dependencies.
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
// 字重只用 400/500/600/700：本机的 msyh.ttc 在 @napi-rs/canvas 下 550/650 会渲染成方块
const M = 52; // 统一页边距，所有骨架共用一套栅格
// 九套配色。bg 底 / ink 字 / muted 次要字 / accent 强调 / panel 色块 / onPanel 色块上的字
export const themes = {
  editorial: {
    bg: '#f6f3ee',
    ink: '#252922',
    muted: '#61665e',
    accent: '#ce4c30',
    panel: '#e35b3b',
    onPanel: '#252922',
    soft: '#e7e7df',
  },
  gallery: {
    bg: '#f0f2ed',
    ink: '#252922',
    muted: '#5f665e',
    accent: '#3e5549',
    panel: '#d5d9cf',
    onPanel: '#3e5549',
    soft: '#e4e7e0',
  },
  bold: {
    bg: '#d7ed93',
    ink: '#263c26',
    muted: '#3f5539',
    accent: '#263c26',
    panel: '#263c26',
    onPanel: '#d7ed93',
    soft: '#c9e08a',
  },
  paper: {
    bg: '#f4efe4',
    ink: '#2b2b2b',
    muted: '#6b6455',
    accent: '#2f4858',
    panel: '#e5dccb',
    onPanel: '#2f4858',
    soft: '#e8e0d0',
  },
  ink: {
    bg: '#f7f7f5',
    ink: '#141414',
    muted: '#6a6a66',
    accent: '#1c1c1a',
    panel: '#1c1c1a',
    onPanel: '#f7f7f5',
    soft: '#e6e6e3',
  },
  neon: {
    bg: '#141317',
    ink: '#f4f1f3',
    muted: '#a2919f',
    accent: '#ff3d81',
    panel: '#ff3d81',
    onPanel: '#141317',
    soft: '#26242c',
  },
  kraft: {
    bg: '#e8dcc8',
    ink: '#3a2c1e',
    muted: '#6d5c46',
    accent: '#a8622d',
    panel: '#d9c7a7',
    onPanel: '#3a2c1e',
    soft: '#dccdb2',
  },
  mono: {
    bg: '#ffffff',
    ink: '#111111',
    muted: '#6e6e6e',
    accent: '#4b4b4b',
    panel: '#111111',
    onPanel: '#ffffff',
    soft: '#ebebeb',
  },
  cobalt: {
    bg: '#f2f5fb',
    ink: '#101828',
    muted: '#5a6478',
    accent: '#2563eb',
    panel: '#2563eb',
    onPanel: '#ffffff',
    soft: '#dde5f7',
  },
};
// 四种尺寸，逻辑宽度固定 900，高度按比例
export const posterSizes = {
  a4: { w: 900, h: 1125, label: 'A4 竖版' },
  print: { w: 900, h: 1273, label: 'A4 打印' },
  story: { w: 900, h: 1600, label: '手机竖屏' },
  og: { w: 1200, h: 630, label: '社交横版' },
  square: { w: 900, h: 900, label: '方形' },
};
export const posterSkeletons = ['stack', 'banner', 'statement', 'split', 'grid', 'type-only'];
function text(ctx, value, x, y, size, color, weight = 400) {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(value), x, y);
}
function textRight(ctx, value, x, y, size, color, weight = 400) {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(String(value), x, y);
  ctx.textAlign = 'left';
}
function lines(ctx, value, width, size, weight = 400) {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  const result = [];
  let line = '';
  for (const c of value) {
    if (c === '\n') {
      result.push(line);
      line = '';
      continue;
    }
    if (ctx.measureText(line + c).width > width && line) {
      result.push(line);
      line = c;
    } else line += c;
  }
  if (line) result.push(line);
  return result;
}
function wrapped(ctx, value, x, y, width, size, color, height, max = 100, weight = 400) {
  if (!value) return 0;
  const rows = lines(ctx, value, width, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  rows.slice(0, max).forEach((row, i) => {
    if (i === max - 1 && rows.length > max) {
      while (ctx.measureText(row + '…').width > width) row = row.slice(0, -1);
      row += '…';
    }
    ctx.fillText(row, x, y + i * height);
  });
  return Math.min(rows.length, max) * height;
}
function photo(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale,
    dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
function rule(ctx, x, y, w, color, height = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, height);
}
function setup(runtime, width, spec, bg) {
  const canvas = runtime.createCanvas(width, Math.round((width * spec.h) / spec.w));
  const ctx = canvas.getContext('2d');
  const scale = width / spec.w;
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, spec.w, spec.h);
  return { canvas, ctx, scale };
}
/** 项目名最大，标语用强调色印在下面，两者都不浪费 */
function hero(project) {
  const tagline = (project.meta?.tagline || '').trim();
  const title = (project.title || '').trim() || '我的毕业设计';
  const subtitle = (project.subtitle || '').trim();
  return tagline
    ? { big: title, small: tagline, note: subtitle }
    : { big: title, small: subtitle, note: '' };
}
function bigSize(value, u) {
  const length = value.length;
  if (length <= 6) return 96 * u;
  if (length <= 10) return 76 * u;
  if (length <= 16) return 58 * u;
  return 44 * u;
}
/** 展签信息一行：学校 · 院系 · 指导教师 · 展位 · 展期，都没有就退回分类与年份 */
function metaLine(project) {
  const meta = project.meta || {};
  const parts = [
    meta.school,
    meta.major,
    meta.advisor && '指导教师 ' + meta.advisor,
    meta.booth && '展位 ' + meta.booth,
    meta.period,
  ].filter(Boolean);
  if (!parts.length) parts.push((project.category || '毕业设计') + ' · ' + (project.year || ''));
  return parts.join(' · ');
}
function metaRows(project) {
  const meta = project.meta || {};
  return [
    ['学校', meta.school],
    ['院系', meta.major],
    ['指导教师', meta.advisor],
    ['展位', meta.booth],
    ['展期', meta.period],
  ].filter((row) => row[1]);
}
async function loadImages(runtime, project, limit = 5) {
  const list = project.images || [];
  if (!list.length) return [];
  const cover = Math.min(Math.max(project.coverIndex ?? 0, 0), list.length - 1);
  const ordered = [list[cover], ...list.filter((_, index) => index !== cover)];
  const loaded = [];
  for (const item of ordered.slice(0, limit)) {
    try {
      loaded.push(await runtime.loadImage(item.src));
    } catch {
      loaded.push(null);
    }
  }
  return loaded.filter(Boolean);
}
function imageBlock(ctx, img, x, y, w, h, theme, hint = '在这里放上你的作品') {
  if (h <= 0 || w <= 0) return;
  if (img) return photo(ctx, img, x, y, w, h);
  ctx.fillStyle = theme.soft;
  ctx.fillRect(x, y, w, h);
  text(
    ctx,
    hint,
    x + Math.min(40, w * 0.06),
    y + h / 2 - 12,
    Math.min(26, h * 0.09),
    theme.accent,
    500,
  );
}
function masthead({ ctx, project, theme, spec, u, overImage }) {
  if (overImage) {
    ctx.fillStyle = 'rgba(14,14,12,.46)';
    ctx.fillRect(0, 0, spec.w, Math.round(78 * u));
  }
  const color = overImage ? '#ffffff' : theme.ink;
  const label = ((project.category || '毕业设计') + ' / ' + (project.year || '')).trim();
  text(ctx, label, M, 26 * u, 15 * u, color, 500);
  textRight(ctx, 'GRADUATION PROJECT', spec.w - M, 27 * u, 13 * u, color, 500);
}
function qrBlock(ctx, qr, x, y, size) {
  if (!qr) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 6, y - 6, size + 12, size + 12);
  const scale = Math.min(size / qr.width, size / qr.height);
  ctx.drawImage(
    qr,
    x + (size - qr.width * scale) / 2,
    y + (size - qr.height * scale) / 2,
    qr.width * scale,
    qr.height * scale,
  );
}
function footer({ ctx, project, theme, spec, u, qr }) {
  const h = spec.h;
  rule(ctx, M, h - 88 * u, spec.w - 2 * M, theme.accent, 2 * u);
  text(ctx, project.author || '作品创作者', M, h - 76 * u, 17 * u, theme.ink, 600);
  const limit = qr ? spec.w - 2 * M - 78 * u : spec.w - 2 * M;
  wrapped(ctx, metaLine(project), M, h - 48 * u, limit, 12 * u, theme.muted, 17 * u, 2);
  if (qr) qrBlock(ctx, qr, spec.w - M - 66 * u, h - 78 * u, 66 * u);
}
/** 两张图并排的窄条，用在版面下半段 */
function imageStrip(ctx, images, x, y, w, h, theme, count = 2) {
  const picked = images.slice(0, count);
  if (h <= 0) return;
  const gap = 10;
  const cw = (w - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) imageBlock(ctx, picked[i], x + i * (cw + gap), y, cw, h, theme);
}
const layouts = {
  // 标题在上、大图在下：最稳的一种
  stack(o) {
    const { ctx, project, theme, spec, u, images } = o;
    masthead(o);
    const head = hero(project);
    let y = spec.h * 0.085;
    y +=
      wrapped(
        ctx,
        head.big,
        M,
        y,
        spec.w - 2 * M,
        bigSize(head.big, u),
        theme.ink,
        bigSize(head.big, u) * 1.14,
        2,
        700,
      ) +
      8 * u;
    if (head.small)
      y +=
        wrapped(ctx, head.small, M, y, spec.w - 2 * M, 21 * u, theme.accent, 29 * u, 2, 600) +
        6 * u;
    if (head.note)
      y += wrapped(ctx, head.note, M, y, spec.w - 2 * M, 14 * u, theme.muted, 21 * u, 1);
    const top = Math.max(y + 20 * u, spec.h * 0.32);
    imageBlock(ctx, images[0], M, top, spec.w - 2 * M, spec.h - 132 * u - top, theme);
    footer(o);
  },
  // 整幅出血图 + 文字压在图上：社交横版最上相
  banner(o) {
    const { ctx, project, theme, spec, u, images } = o;
    const band = spec.h * 0.56;
    if (images[0]) photo(ctx, images[0], 0, 0, spec.w, band);
    else {
      ctx.fillStyle = theme.soft;
      ctx.fillRect(0, 0, spec.w, band);
    }
    masthead({ ...o, overImage: true });
    const head = hero(project);
    let y = band + 30 * u;
    y +=
      wrapped(
        ctx,
        head.big,
        M,
        y,
        spec.w - 2 * M,
        bigSize(head.big, u) * 0.86,
        theme.ink,
        bigSize(head.big, u),
        2,
        700,
      ) +
      6 * u;
    if (head.small)
      y += wrapped(ctx, head.small, M, y, spec.w - 2 * M, 19 * u, theme.accent, 26 * u, 1, 600);
    const top = y + 16 * u;
    const bottom = spec.h - 118 * u;
    if (images.length > 1 && bottom - top > 90 * u)
      imageBlock(ctx, images[1], M, top, spec.w - 2 * M, bottom - top, theme);
    footer(o);
  },
  // 色块压标题：最像展览海报
  statement(o) {
    const { ctx, project, theme, spec, u, images } = o;
    masthead(o);
    const panelY = spec.h * 0.07,
      panelH = spec.h * 0.3;
    ctx.fillStyle = theme.panel;
    ctx.fillRect(0, panelY, spec.w, panelH);
    const head = hero(project);
    const size = bigSize(head.big, u) * 0.82;
    const rows = Math.min(2, lines(ctx, head.big, spec.w - 2 * M - 8, size, 700).length);
    wrapped(
      ctx,
      head.big,
      M,
      panelY + panelH / 2 - (rows * size * 1.12) / 2,
      spec.w - 2 * M,
      size,
      theme.onPanel,
      size * 1.12,
      2,
      700,
    );
    let y = panelY + panelH + 22 * u;
    if (head.small)
      y += wrapped(ctx, head.small, M, y, spec.w - 2 * M, 20 * u, theme.accent, 28 * u, 1, 600);
    if (head.note)
      y += wrapped(ctx, head.note, M, y, spec.w - 2 * M, 14 * u, theme.muted, 21 * u, 1);
    const top = Math.max(y + 18 * u, spec.h * 0.46);
    imageBlock(ctx, images[0], M, top, spec.w - 2 * M, spec.h - 132 * u - top, theme);
    footer(o);
  },
  // 左文右图，右边出血
  split(o) {
    const { ctx, project, theme, spec, u, images } = o;
    masthead({ ...o, overImage: false });
    const columnX = M,
      columnW = spec.w * 0.42,
      imageX = spec.w * 0.5;
    imageBlock(ctx, images[0], imageX, spec.h * 0.11, spec.w - imageX, spec.h * 0.72, theme);
    const head = hero(project);
    let y = spec.h * 0.16;
    y +=
      wrapped(
        ctx,
        head.big,
        columnX,
        y,
        columnW,
        bigSize(head.big, u) * 0.68,
        theme.ink,
        bigSize(head.big, u) * 0.78,
        3,
        700,
      ) +
      10 * u;
    if (head.small)
      y +=
        wrapped(ctx, head.small, columnX, y, columnW, 17 * u, theme.accent, 24 * u, 3, 600) + 8 * u;
    if (head.note)
      y += wrapped(ctx, head.note, columnX, y, columnW, 13 * u, theme.muted, 19 * u, 3);
    // 展签贴到图片下沿，左栏不留空洞
    const rows = metaRows(project).slice(0, 4);
    if (rows.length) {
      const block = rows.length * 32 * u;
      const start = Math.min(
        Math.max(y + 18 * u, spec.h * 0.62 - block / 2),
        spec.h * 0.83 - block,
      );
      rows.forEach((row, index) => {
        const rowY = start + index * 32 * u;
        text(ctx, row[0], columnX, rowY, 11 * u, theme.muted, 500);
        wrapped(ctx, row[1], columnX, rowY + 14 * u, columnW, 14 * u, theme.ink, 19 * u, 1, 600);
      });
    }
    footer(o);
  },
  // 2×2 图阵，图片多的项目最好看
  grid(o) {
    const { ctx, project, theme, spec, u, images } = o;
    masthead(o);
    const head = hero(project);
    let y = spec.h * 0.075;
    y +=
      wrapped(
        ctx,
        head.big,
        M,
        y,
        spec.w - 2 * M,
        bigSize(head.big, u) * 0.7,
        theme.ink,
        bigSize(head.big, u) * 0.8,
        1,
        700,
      ) +
      4 * u;
    if (head.small)
      y += wrapped(ctx, head.small, M, y, spec.w - 2 * M, 17 * u, theme.accent, 23 * u, 1, 600);
    const top = Math.max(y + 20 * u, spec.h * 0.24),
      bottom = spec.h - 124 * u,
      gap = 12 * u,
      cw = (spec.w - 2 * M - gap) / 2,
      ch = (bottom - top - gap) / 2;
    for (let i = 0; i < 4; i++) {
      const x = M + (i % 2) * (cw + gap),
        yy = top + Math.floor(i / 2) * (ch + gap);
      if (images[i]) imageBlock(ctx, images[i], x, yy, cw, ch, theme);
      else if (i === 3) metaTile(ctx, project, theme, x, yy, cw, ch, u);
      else {
        ctx.fillStyle = theme.soft;
        ctx.fillRect(x, yy, cw, ch);
      }
    }
    footer(o);
  },
  // 不要图，把字排好：适合论文型与系统型作品
  'type-only'(o) {
    const { ctx, project, theme, spec, u } = o;
    masthead(o);
    const head = hero(project);
    let y = spec.h * 0.14;
    y +=
      wrapped(
        ctx,
        head.big,
        M,
        y,
        spec.w - 2 * M,
        bigSize(head.big, u),
        theme.ink,
        bigSize(head.big, u) * 1.14,
        3,
        700,
      ) +
      12 * u;
    if (head.small)
      y +=
        wrapped(ctx, head.small, M, y, spec.w - 2 * M, 22 * u, theme.accent, 30 * u, 2, 600) +
        10 * u;
    if (head.note)
      y += wrapped(ctx, head.note, M, y, spec.w - 2 * M, 15 * u, theme.muted, 22 * u, 3);
    const rows = metaRows(project);
    if (rows.length) {
      // 横版卡片换成两列，不然右下角会空一大块
      const landscape = spec.w / spec.h > 1.5;
      const top = Math.max(y + 26 * u, spec.h * (landscape ? 0.4 : 0.44));
      ctx.globalAlpha = 0.35;
      rule(ctx, M, top - 22 * u, spec.w - 2 * M, theme.accent, 2 * u);
      ctx.globalAlpha = 1;
      const columnW = landscape ? (spec.w - 2 * M - 40 * u) / 2 : 0;
      rows.slice(0, 5).forEach((row, index) => {
        const second = landscape && index >= 3;
        const rowY = top + (second ? index - 3 : index) * 34 * u;
        const rowX = second ? M + columnW + 40 * u : M;
        text(ctx, row[0], rowX, rowY, 12 * u, theme.muted, 500);
        wrapped(
          ctx,
          row[1],
          rowX + 96 * u,
          rowY - 2 * u,
          (landscape ? columnW : spec.w - 2 * M) - 96 * u,
          16 * u,
          theme.ink,
          22 * u,
          1,
          600,
        );
      });
    }
    if (project.intro && !(spec.w / spec.h > 1.5)) {
      const top = spec.h - 200 * u;
      wrapped(ctx, project.intro, M, top, spec.w - 2 * M, 13 * u, theme.muted, 20 * u, 3);
    }
    footer(o);
  },
};
/** 图阵里空出来的那格改放展签信息，不留白洞 */
function metaTile(ctx, project, theme, x, y, w, h, u) {
  ctx.fillStyle = theme.panel;
  ctx.fillRect(x, y, w, h);
  const color = theme.onPanel;
  text(ctx, project.author || '作品创作者', x + 20, y + 20, 15 * u, color, 700);
  const rows = metaRows(project);
  const body =
    rows.length > 0
      ? rows.map((row) => row[1]).join(' · ')
      : (project.category || '毕业设计') + ' · ' + (project.year || '');
  wrapped(ctx, body, x + 20, y + h - 58 * u, w - 40, 12 * u, color, 17 * u, 3);
}
/** 自动挑骨架：图片多的排图阵，没图就纯排字 */
export function pickSkeleton(project, size = 'a4') {
  const count = (project.images || []).length;
  if (!count) return 'type-only';
  if (size === 'og') return 'split'; // 横版卡片只有左右分栏排得下
  if (size === 'story') return count >= 3 ? 'stack' : 'banner';
  if (count >= 4) return 'grid';
  if ((project.title || '').length > 12 && project.intro) return 'split';
  return 'stack';
}
function resolve(options) {
  const opts = typeof options === 'number' ? { width: options } : options || {};
  const size = posterSizes[opts.size] ? opts.size : 'a4';
  // 主题只能来自 opts.theme；外面忘了传就退回项目自己的 template，别再默默套 editorial
  const wanted = themes[opts.theme] ? opts.theme : opts.project?.template;
  const theme = themes[wanted] ? wanted : 'editorial';
  return {
    width: opts.width || 1200,
    size,
    theme,
    skeleton:
      opts.skeleton && opts.skeleton !== 'auto' ? opts.skeleton : pickSkeleton(opts.project, size),
    qr: opts.qr || null,
    spec: posterSizes[size],
    palette: themes[theme],
  };
}
export async function renderCover(project, runtime, options = {}) {
  const config = resolve({
    project,
    ...(typeof options === 'number' ? { width: options } : options),
  });
  const { canvas, ctx } = setup(runtime, config.width, config.spec, config.palette.bg);
  const images = await loadImages(runtime, project, config.skeleton === 'grid' ? 4 : 3);
  // 字号跟版面面积走：A4 为基准，横版卡片不会被缩得太小
  const u = Math.sqrt((config.spec.w * config.spec.h) / (900 * 1125));
  const layout = layouts[config.skeleton] || layouts.stack;
  layout({
    ctx,
    project,
    theme: config.palette,
    spec: config.spec,
    u,
    images,
    qr: config.qr,
    skeleton: config.skeleton,
  });
  return canvas;
}
/** 一个作品的正文分节：标题与正文都在这儿改 */
export function storySections(project) {
  return [
    { title: '关于项目', body: project.intro },
    { title: '我的职责', body: project.role },
    { title: '制作工具', body: project.tools },
    { title: '制作过程', body: project.process },
    ...(project.sections || []),
    {
      title: '体验与源码',
      body: [project.demoUrl, project.repositoryUrl].filter(Boolean).join('\n'),
    },
  ].filter((section) => section.body?.trim());
}
/** 把 renderPages 的各种入参收敛成一份配置，两种签名都认 */
function pageSetup(options) {
  const opts = typeof options === 'number' ? { width: options } : options || {};
  const print = opts.size === 'print';
  return {
    width: opts.width || 1600,
    size: print ? 'print' : 'a4',
    spec: posterSizes[print ? 'print' : 'a4'],
    palette: themes[opts.theme] || themes.editorial,
    qr: opts.qr,
    skeleton: opts.skeleton,
    offset: opts.numberOffset || 0,
  };
}
/**
 * 逐页产出作品集内页。yield 的是 { canvas, kind, title, page }，
 * kind 取 cover / section / image，title 和 page 留给 PDF 的自动目录用。
 */
export async function* renderPages(project, runtime, options = {}) {
  const book = pageSetup(options);
  const { width, size, spec, palette, qr, offset } = book;
  yield {
    kind: 'cover',
    title: project.title,
    page: 1,
    canvas: await renderCover(project, runtime, {
      width,
      size,
      theme: options.theme,
      skeleton: options.skeleton,
      qr,
    }),
  };
  const footer = (ctx, n) =>
    text(ctx, String(n + offset), spec.w - 80, spec.h - 55, 14, palette.muted);
  let sheet = setup(runtime, width, spec, palette.bg);
  let y = Math.round(spec.h * 0.129);
  let number = 2;
  // 同一页上放得下好几节，目录需要把这些节的标题合起来报一次
  let onPage = [];
  const sheetTitle = () =>
    onPage.length > 1 ? onPage[0] + ' 等 ' + onPage.length + ' 节' : onPage[0] || '';
  const header = () => {
    text(sheet.ctx, project.title, M, 49, 25, palette.ink, 600);
    textRight(sheet.ctx, 'PROJECT STORY', spec.w - M, 56, 14, palette.muted);
    rule(sheet.ctx, M, 104, spec.w - 2 * M, palette.soft, 1);
  };
  header();
  const sections = storySections(project);
  for (const section of sections) {
    if (y > spec.h * 0.836) {
      footer(sheet.ctx, number++);
      yield { canvas: sheet.canvas, kind: 'section', title: sheetTitle(), page: number };
      sheet = setup(runtime, width, spec, palette.bg);
      header();
      y = Math.round(spec.h * 0.129);
      onPage = [];
    }
    if (onPage.at(-1) !== section.title) onPage.push(section.title);
    text(sheet.ctx, section.title, M, y, 30, palette.ink, 700);
    y += 58;
    for (const row of lines(sheet.ctx, section.body, spec.w - 2 * M - 8, 24)) {
      if (y > spec.h * 0.889) {
        footer(sheet.ctx, number++);
        yield { canvas: sheet.canvas, kind: 'section', title: sheetTitle(), page: number };
        sheet = setup(runtime, width, spec, palette.bg);
        header();
        y = Math.round(spec.h * 0.129);
        onPage = [section.title];
        text(sheet.ctx, section.title + '（续）', M, y, 27, palette.ink, 600);
        y += 58;
      }
      text(sheet.ctx, row, M, y, 24, palette.muted);
      y += 39;
    }
    y += 45;
  }
  if (sections.length) {
    footer(sheet.ctx, number++);
    yield { canvas: sheet.canvas, kind: 'section', title: sheetTitle(), page: number };
  }
  for (const item of project.images) {
    const fresh = setup(runtime, width, spec, palette.bg);
    const ctx = fresh.ctx;
    const boxW = spec.w - 2 * M;
    const boxH = Math.round(spec.h * 0.729);
    text(ctx, project.title, M, 49, 24, palette.ink, 600);
    const image = await runtime.loadImage(item.src);
    // 作品集页里整张图要能看全：contain，不裁切
    const scale = Math.min(boxW / image.width, boxH / image.height);
    ctx.fillStyle = palette.soft;
    ctx.fillRect(M, 115, boxW, boxH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(M, 115, boxW, boxH);
    ctx.clip();
    ctx.drawImage(
      image,
      M + (boxW - image.width * scale) / 2,
      115 + (boxH - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    ctx.restore();
    wrapped(ctx, item.name, M, 115 + boxH + 37, boxW - 16, 23, palette.ink, 33, 2);
    footer(ctx, number++);
    yield { canvas: fresh.canvas, kind: 'image', title: item.name || '作品图片', page: number };
  }
}
/** 目录页：页码来自 renderPages 报上来的 page，插在封面后面 */
export async function renderToc(project, runtime, entries, options = {}) {
  const book = pageSetup(options);
  const { width, spec, palette } = book;
  const { canvas, ctx } = setup(runtime, width, spec, palette.bg);
  text(ctx, '目录', M, 130, 44, palette.ink, 700);
  textRight(ctx, 'CONTENTS', spec.w - M, 146, 14, palette.muted, 500);
  rule(ctx, M, 224, spec.w - 2 * M, palette.accent, 3);
  let y = 278;
  for (const entry of entries) {
    if (y > spec.h - 190) break;
    const label = (entry.title || '').trim() || '（续）';
    const weight = entry.kind === 'section' ? 600 : 400;
    const rows = lines(ctx, label, spec.w - 2 * M - 96, 22, weight);
    const first = rows[0] + (rows.length > 1 ? '…' : '');
    text(ctx, first, M, y, 22, palette.ink, weight);
    textRight(ctx, String(entry.page), spec.w - M, y, 22, palette.muted, 500);
    const from = M + ctx.measureText(first).width + 12;
    const to = spec.w - M - 36;
    if (to > from) {
      ctx.globalAlpha = 0.32;
      rule(ctx, from, y + 15, to - from, palette.muted, 1);
      ctx.globalAlpha = 1;
    }
    y += rows.length > 1 ? 34 : 41;
    rule(ctx, M, y - 13, spec.w - 2 * M, palette.soft, 1);
  }
  wrapped(ctx, metaLine(project), M, spec.h - 150, spec.w - 2 * M, 13, palette.muted, 20, 3);
  return canvas;
}
