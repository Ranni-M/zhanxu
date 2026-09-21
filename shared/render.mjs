// Shared browser/server rendering. No storage, network or framework dependencies.
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
function text(ctx, value, x, y, size, color, weight = 400) {
  ctx.font = weight + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.fillText(String(value), x, y);
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
  const rows = lines(ctx, value, width, size, weight);
  ctx.fillStyle = color;
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
function photo(ctx, img, x, y, w, h, contain = false) {
  const scale = contain
    ? Math.min(w / img.width, h / img.height)
    : Math.max(w / img.width, h / img.height);
  const dw = img.width * scale,
    dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
function setup(runtime, width, bg) {
  const canvas = runtime.createCanvas(width, Math.round(width * 1.25));
  const ctx = canvas.getContext('2d');
  ctx.scale(width / 900, width / 900);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 900, 1125);
  return { canvas, ctx };
}
export async function renderCover(project, runtime, width = 1200) {
  const gallery = project.template === 'gallery',
    bold = project.template === 'bold';
  const bg = bold ? '#d7ed93' : gallery ? '#f0f2ed' : '#f6f3ee',
    ink = '#252922',
    accent = bold ? '#263c26' : gallery ? '#3e5549' : '#ce4c30';
  const { canvas, ctx } = setup(runtime, width, bg);
  text(ctx, project.category + ' / ' + project.year, 52, 48, 18, ink, 500);
  text(ctx, 'GRADUATION PROJECT', 575, 51, 15, ink, 500);
  const title = project.title.trim() || '我的毕业设计',
    image = project.images[0] ? await runtime.loadImage(project.images[0].src) : null;
  const picture = (x, y, w, h) => {
    if (image) photo(ctx, image, x, y, w, h);
    else {
      ctx.fillStyle = '#e7e7df';
      ctx.fillRect(x, y, w, h);
      text(ctx, '在这里放上你的作品', x + 70, y + h / 2 - 18, 29, accent, 500);
    }
  };
  if (gallery) {
    picture(52, 105, 796, 660);
    text(ctx, (project.subtitle || 'A NEW PERSPECTIVE').slice(0, 40), 54, 802, 17, accent, 600);
    wrapped(ctx, title, 48, 850, 800, title.length > 12 ? 55 : 76, ink, 92, 2, 700);
    text(ctx, project.author || '作品创作者', 54, 1058, 19, ink);
  } else if (bold) {
    wrapped(ctx, title, 44, 106, 805, title.length > 12 ? 60 : 98, ink, 112, 2, 800);
    text(ctx, (project.subtitle || 'MAKE YOUR WORK SEEN').slice(0, 38), 52, 342, 22, ink, 500);
    picture(52, 404, 796, 574);
    text(ctx, project.author || '作品创作者', 52, 1030, 20, ink);
    text(ctx, 'DESIGN IN PROGRESS', 611, 1033, 14, ink, 500);
  } else {
    ctx.fillStyle = '#e35b3b';
    ctx.fillRect(0, 90, 900, 355);
    text(ctx, (project.subtitle || 'YOUR NEXT CHAPTER').slice(0, 39), 52, 125, 19, ink, 500);
    wrapped(ctx, title, 46, 188, 810, title.length > 12 ? 58 : 94, ink, 111, 2, 800);
    picture(52, 478, 796, 488);
    text(ctx, project.author || '作品创作者', 52, 1022, 20, ink);
    text(ctx, '毕业设计作品集', 657, 1024, 17, ink);
  }
  ctx.fillStyle = accent;
  ctx.fillRect(52, 1091, 796, 2);
  return canvas;
}
export async function* renderPages(project, runtime, width = 1600) {
  yield await renderCover(project, runtime, width);
  const ink = '#252922',
    muted = '#61665e',
    bg = '#f6f3ee';
  let sheet = setup(runtime, width, bg),
    y = 145,
    page = 2;
  const header = () => {
    text(sheet.ctx, project.title, 52, 49, 25, ink, 600);
    text(sheet.ctx, 'PROJECT STORY', 650, 56, 14, muted);
    sheet.ctx.fillStyle = '#d8dad0';
    sheet.ctx.fillRect(52, 104, 796, 1);
  };
  header();
  const sections = [
    { title: '关于项目', body: project.intro },
    { title: '我的职责', body: project.role },
    { title: '制作工具', body: project.tools },
    { title: '制作过程', body: project.process },
    ...(project.sections || []),
    {
      title: '体验与源码',
      body: [project.demoUrl, project.repositoryUrl].filter(Boolean).join('\n'),
    },
  ].filter((s) => s.body?.trim());
  for (const section of sections) {
    if (y > 940) {
      text(sheet.ctx, String(page++), 820, 1070, 14, muted);
      yield sheet.canvas;
      sheet = setup(runtime, width, bg);
      header();
      y = 145;
    }
    text(sheet.ctx, section.title, 52, y, 30, ink, 650);
    y += 58;
    const rows = lines(sheet.ctx, section.body, 796, 24);
    for (const row of rows) {
      if (y > 1000) {
        text(sheet.ctx, String(page++), 820, 1070, 14, muted);
        yield sheet.canvas;
        sheet = setup(runtime, width, bg);
        header();
        y = 145;
        text(sheet.ctx, section.title + '（续）', 52, y, 27, ink, 600);
        y += 58;
      }
      text(sheet.ctx, row, 52, y, 24, muted);
      y += 39;
    }
    y += 45;
  }
  if (sections.length) {
    text(sheet.ctx, String(page++), 820, 1070, 14, muted);
    yield sheet.canvas;
  }
  for (const item of project.images) {
    const { canvas, ctx } = setup(runtime, width, bg);
    text(ctx, project.title, 52, 49, 24, ink, 600);
    const image = await runtime.loadImage(item.src);
    photo(ctx, image, 52, 115, 796, 820, true);
    wrapped(ctx, item.name, 52, 972, 780, 23, ink, 33, 2);
    text(ctx, String(page++), 820, 1070, 14, muted);
    yield canvas;
  }
}
