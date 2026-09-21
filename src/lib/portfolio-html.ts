import { storySections, themes } from '../../shared/render.mjs';
import { coverImage } from '../domain/project.ts';
import type { Project } from '../domain/project.ts';

export type PortfolioHtmlOptions = {
  /** 已经内联成 data URL 的图片，按 src 查；查不到的退回原始地址 */
  images?: Record<string, string>;
  /** 展台二维码（data URL），只有公开作品才有 */
  qr?: string;
  /** 公开页地址，页脚与二维码旁边会写出来 */
  publicUrl?: string;
  /** 生成日期，只写进页脚；测试里传固定值 */
  generatedAt?: string;
};

/** 和服务端渲染共用一份配色表，导出的网页和海报是同一套颜色 */
type Palette = (typeof themes)[keyof typeof themes];
function palette(template: string): Palette {
  const table: Record<string, Palette> = themes;
  return table[template] || themes.editorial;
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 正文按空行/换行拆段，和 PDF 的分行口径一致 */
function paragraphs(body: string, className = '') {
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p${className ? ` class="${className}"` : ''}>${escapeHtml(line)}</p>`)
    .join('\n        ');
}

function figure(src: string, alt: string, caption: string, images: PortfolioHtmlOptions['images']) {
  const url = images?.[src] || src;
  return `<figure>
          <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />
          ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
        </figure>`;
}

/**
 * 单文件网页版作品集：所有文字、配色和图片都写进一个 .html，
 * 不依赖网络也不依赖账号，双击就能打开，也可以直接丢到任意静态空间。
 */
export function portfolioHtml(project: Project, options: PortfolioHtmlOptions = {}) {
  const theme = palette(project.template);
  const meta = project.meta;
  const title = project.title.trim() || '毕业设计';
  const cover = coverImage(project);
  const images = options.images;
  const byline = [
    project.author,
    meta?.major,
    meta?.school,
    meta?.advisor && '指导 ' + meta.advisor,
  ]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  const facts = [
    ['作品方向', project.category],
    ['作者', project.author],
    ['年份', project.year],
    ['学校', meta?.school],
    ['专业', meta?.major],
    ['指导老师', meta?.advisor],
    ['展位', meta?.booth],
    ['展期', meta?.period],
    ['我的职责', project.role],
    ['制作工具', project.tools],
  ].filter(([, value]) => (value || '').trim()) as [string, string][];

  const sections = storySections(project)
    // 贡献/工具这种短信息已经在展签里列过，正文里不再重复
    .filter((section) => section.title !== '关于项目' && section.title !== '体验与源码')
    .filter((section) => section.title !== '我的职责' && section.title !== '制作工具');

  const links = [
    project.demoUrl && ['在线体验', project.demoUrl],
    project.repositoryUrl && ['源码仓库', project.repositoryUrl],
  ].filter(Boolean) as [string, string][];
  const attachments = (project.attachments || []).filter((item) => item.visible);

  const body = [
    facts.length
      ? `<section class="block facts">
        <h2>展签信息</h2>
        <dl>
          ${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('\n          ')}
        </dl>
      </section>`
      : '',
    project.intro.trim()
      ? `<section class="block lead">
        <h2>关于项目</h2>
        ${paragraphs(project.intro)}
      </section>`
      : '',
    ...sections.map(
      (section) => `<section class="block">
        <h2>${escapeHtml(section.title)}</h2>
        ${paragraphs(section.body || '')}
      </section>`,
    ),
    project.images.length
      ? `<section class="block">
        <h2>作品图集</h2>
        <div class="figures">
          ${project.images
            .map((item) => figure(item.src, item.name || title, item.name, images))
            .join('\n          ')}
        </div>
      </section>`
      : '',
    project.compares?.length
      ? `<section class="block">
        <h2>方案对比</h2>
        ${project.compares
          .map(
            (pair) => `<div class="pair">
          <p class="pair-label">${escapeHtml(pair.label || '前后对比')}</p>
          <div class="pair-shots">
            ${figure(pair.before, (pair.label || '') + ' 前', '修改前', images)}
            ${figure(pair.after, (pair.label || '') + ' 后', '修改后', images)}
          </div>
        </div>`,
          )
          .join('\n        ')}
      </section>`
      : '',
    links.length
      ? `<section class="block">
        <h2>体验与源码</h2>
        <ul class="links">
          ${links.map(([label, url]) => `<li><span>${escapeHtml(label)}</span><a href="${escapeHtml(url)}" rel="noopener">${escapeHtml(url)}</a></li>`).join('\n          ')}
        </ul>
      </section>`
      : '',
  ]
    .filter(Boolean)
    .join('\n      ');

  const description = (project.intro.trim().split(/\n/)[0] || title).slice(0, 90);
  // 分类和年份可能有一项没填，空的那一项不留分隔符
  const eyebrow = [project.category, project.year]
    .filter((value) => (value || '').trim())
    .map(escapeHtml)
    .join('<span>·</span>');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · 作品集</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta name="generator" content="展序 ZHANXU" />
<style>
  :root {
    --bg: ${theme.bg};
    --ink: ${theme.ink};
    --muted: ${theme.muted};
    --accent: ${theme.accent};
    --soft: ${theme.soft};
    --panel: ${theme.panel};
    --on-panel: ${theme.onPanel};
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.8;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 76px 28px 96px; }
  h1 { font-size: clamp(34px, 6.4vw, 58px); line-height: 1.24; letter-spacing: -0.02em; margin: 20px 0 0; }
  h2 { font-size: 20px; line-height: 1.5; letter-spacing: -0.01em; margin: 0 0 16px; }
  p { margin: 0 0 14px; }
  p:last-child { margin-bottom: 0; }
  img { display: block; width: 100%; height: auto; border-radius: 4px; }
  figure { margin: 0; }
  figcaption { margin-top: 10px; font-size: 12.5px; line-height: 1.7; color: var(--muted); }
  .eyebrow { margin: 0; font-size: 12px; letter-spacing: 0.16em; color: var(--accent); }
  .eyebrow span { margin: 0 8px; opacity: 0.6; }
  .subtitle { margin: 14px 0 0; font-size: 14px; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }
  .byline { margin: 22px 0 0; font-size: 13px; color: var(--muted); }
  .byline span { margin: 0 9px; opacity: 0.5; }
  .cover-figure { margin-top: 38px; }
  .tagline { margin: 26px 0 0; padding-left: 16px; border-left: 2px solid var(--accent); font-size: 17px; line-height: 1.85; }
  .block { margin-top: 54px; padding-top: 30px; border-top: 1px solid var(--soft); }
  .lead p { font-size: 17px; line-height: 1.92; }
  .facts dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 16px 26px; margin: 0; }
  .facts dt { font-size: 11.5px; letter-spacing: 0.06em; color: var(--muted); }
  .facts dd { margin: 3px 0 0; font-size: 14.5px; }
  .figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 28px 24px; }
  .figures figure:only-child { grid-column: 1 / -1; }
  .pair + .pair { margin-top: 30px; }
  .pair-label { font-size: 13px; color: var(--muted); }
  .pair-shots { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .links { margin: 0; padding: 0; list-style: none; }
  .links li { display: flex; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--soft); font-size: 14px; }
  .links span { flex: 0 0 76px; color: var(--muted); }
  .links a { color: var(--accent); word-break: break-all; }
  .colophon { margin-top: 60px; padding-top: 24px; border-top: 1px solid var(--soft); font-size: 12.5px; line-height: 1.9; color: var(--muted); }
  .colophon .stamp { margin-top: 16px; }
  .qr { display: flex; gap: 16px; align-items: center; margin-bottom: 20px; }
  .qr img { width: 116px; height: 116px; flex: 0 0 auto; padding: 8px; border-radius: 4px; background: var(--panel); }
  .qr figcaption { margin: 0; }
  .qr b { display: block; color: var(--ink); font-weight: 600; margin-bottom: 4px; }
  @media (max-width: 640px) {
    .page { padding: 48px 20px 64px; }
    .pair-shots { grid-template-columns: 1fr; }
    .links li { display: block; }
    .links span { display: block; }
  }
  @media print {
    body { background: #fff; color: #1b1b1b; font-size: 12pt; }
    .page { max-width: none; padding: 0; }
    .block, figure, .pair, .links li { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
    .qr img { border: 1px solid #ddd; }
  }
</style>
</head>
<body>
  <main class="page">
    <header class="cover">
      <p class="eyebrow">${eyebrow}</p>
      <h1>${escapeHtml(title)}</h1>
      ${project.subtitle.trim() ? `<p class="subtitle">${escapeHtml(project.subtitle)}</p>` : ''}
      ${byline.length ? `<p class="byline">${byline.map(escapeHtml).join('<span>/</span>')}</p>` : ''}
      ${
        cover
          ? `<div class="cover-figure">${figure(cover.src, title, cover.name, images)}</div>`
          : ''
      }
      ${meta?.tagline?.trim() ? `<p class="tagline">${escapeHtml(meta.tagline)}</p>` : ''}
    </header>
      ${body}
    <footer class="colophon">
      ${
        options.qr
          ? `<figure class="qr">
        <img src="${escapeHtml(options.qr)}" alt="作品展示页二维码" />
        <figcaption><b>扫码打开作品展示页</b>${escapeHtml(options.publicUrl || '')}</figcaption>
      </figure>`
          : ''
      }
      <p>图片已内嵌在这一个文件里，双击即可离线打开，也可以直接上传到任意静态空间。</p>
      ${attachments.length ? `<p>视频与附件共 ${attachments.length} 个，请在项目展示页中查看。</p>` : ''}
      <p class="stamp">由 展序 ZHANXU 生成 · ${escapeHtml(options.generatedAt || '')}</p>
    </footer>
  </main>
</body>
</html>
`;
}
