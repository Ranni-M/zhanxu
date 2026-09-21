import { unzipSync } from 'fflate';
import type { Project, ProjectMeta } from '../domain/project.ts';
import { uploadLimits } from '../domain/limits.ts';
// 纯规则解析：不用任何模型。所有结论都能说清是从哪个文件、哪条规则来的。
export type ArchiveImport = {
  patch: Partial<Project>;
  images: File[];
  /** 用了哪些文件 / 规则，直接显示给作者看 */
  sources: string[];
  notice: string;
};
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.idea',
  '.vscode',
  '.cache',
  'coverage',
  'tmp',
  'temp',
]);
const IMAGE = /\.(jpe?g|png|webp)$/i;
const TEXT = /\.(md|markdown|txt|json)$/i;
const DOC_NAMES = /^(readme|说明|简介|介绍|项目说明|作品说明|readme_?cn|about)/i;
const TOOL_BY_EXTENSION: [RegExp, string][] = [
  [/\.blend$/i, 'Blender'],
  [/\.max$/i, '3ds Max'],
  [/\.c4d$/i, 'Cinema 4D'],
  [/\.(ma|mb)$/i, 'Maya'],
  [/\.(uproject|umap)$/i, 'Unreal Engine'],
  [/\.unity$/i, 'Unity'],
  [/\.aep$/i, 'After Effects'],
  [/\.prproj$/i, 'Premiere Pro'],
  [/\.(psd|psb)$/i, 'Photoshop'],
  [/\.ai$/i, 'Illustrator'],
  [/\.indd$/i, 'InDesign'],
  [/\.fig$/i, 'Figma'],
  [/\.sketch$/i, 'Sketch'],
  [/\.xd$/i, 'Adobe XD'],
  [/\.(rp|rplib)$/i, 'Axure'],
  [/\.(skp|sketchup)$/i, 'SketchUp'],
  [/\.(dwg|dxf)$/i, 'AutoCAD'],
  [/\.rvt$/i, 'Revit'],
  [/\.(3dm|3dmbak)$/i, 'Rhino'],
  [/\.ino$/i, 'Arduino'],
  [/\.(sln|csproj)$/i, 'Visual Studio'],
  [/\.xcodeproj$/i, 'Xcode'],
  [/\.ipynb$/i, 'Jupyter'],
  [/\.py$/i, 'Python'],
  [/\.java$/i, 'Java'],
  [/\.cs$/i, 'C#'],
  [/\.(cpp|cc|hpp)$/i, 'C++'],
  [/\.go$/i, 'Go'],
  [/\.(pde|java~)$/i, 'Processing'],
  [/\.(sb3|sb2)$/i, 'Scratch'],
  [/\.(twb|twbx)$/i, 'Tableau'],
  [/\.pbix$/i, 'Power BI'],
  [/\.(m|mat)$/i, 'MATLAB'],
  [/\.(fla|as)$/i, 'Animate'],
  [/\.(c4d|mix)$/i, 'Cinema 4D'],
];
const TOOL_BY_DEPENDENCY: [RegExp, string][] = [
  [/^next$/, 'Next.js'],
  [/^react$/, 'React'],
  [/^vue$/, 'Vue'],
  [/^svelte$/, 'Svelte'],
  [/^three$/, 'Three.js'],
  [/^@?babylonjs/, 'Babylon.js'],
  [/^aframe$/, 'A-Frame'],
  [/^p5$/, 'p5.js'],
  [/^d3$/, 'D3.js'],
  [/^gsap$/, 'GSAP'],
  [/^tailwindcss$/, 'Tailwind CSS'],
  [/^express$/, 'Express'],
  [/^vite$/, 'Vite'],
  [/^@tensorflow/, 'TensorFlow'],
  [/^torch$/, 'PyTorch'],
  [/^opencv/, 'OpenCV'],
  [/^flutter/, 'Flutter'],
  [/^(cocos|cc)$/, 'Cocos'],
  [/^@?egret/, 'Egret'],
  [/^socket\.io$/, 'Socket.IO'],
  [/^echarts$/, 'ECharts'],
  [/^leaflet$/, 'Leaflet'],
  [/^mapbox/, 'Mapbox'],
  [/^ffmpeg/, 'FFmpeg'],
];
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['动画影视', /动画|影视|短片|分镜|特效|纪录片|游戏|定格|三维动画/i],
  [
    '数字媒体',
    /交互|数媒|数字媒体|新媒体|装置|生成艺术|数据可视化|声音|沉浸|虚拟现实|影像|ar\b|vr\b/i,
  ],
  ['空间设计', /空间|室内|建筑|景观|展陈|环境设计|陈列/i],
  ['产品设计', /产品|工业设计|家具|器物|文创|结构设计|外观设计/i],
  ['软件开发', /系统|平台|小程序|网站|网页|前端|后端|算法|软件|app\b|web\b|管理系统/i],
  ['视觉传达', /视觉|品牌|海报|字体|包装|插画|平面|vi\b|book design|书籍/i],
];
const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  视觉传达: 'editorial',
  数字媒体: 'neon',
  空间设计: 'gallery',
  产品设计: 'paper',
  软件开发: 'cobalt',
  动画影视: 'ink',
  其他: 'editorial',
};
/** Windows 上导出的文本常是 GBK，先按 UTF-8 严格解码，失败再退回 GBK */
export function smartDecode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}
export function archivePath(name: string) {
  return name.replace(/\\/g, '/').replace(/^\.\//, '');
}
function segments(name: string) {
  return archivePath(name).split('/').filter(Boolean);
}
/** 压缩包里的路径要过滤掉依赖、构建产物、系统垃圾 */
function wantedEntry(name: string, size: number) {
  const parts = segments(name);
  const base = parts.at(-1) || '';
  if (parts.some((part) => SKIP_DIRS.has(part.toLowerCase()))) return false;
  if (base.startsWith('._') || base === '.DS_Store' || base === 'Thumbs.db') return false;
  // 不按字节数筛图：设计稿也可能是小体积的纯色图，交给后面的分辨率打分判断
  if (IMAGE.test(base)) return size > 0 && size <= uploadLimits.imageMb * 1024 * 1024;
  if (TEXT.test(base)) return size <= 2 * 1024 * 1024;
  return false;
}
function plain(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`>|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
function squash(text: string) {
  return text
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
/** 标题、章节、段落：markdown 与纯文本都能吃 */
function headings(text: string) {
  return [...text.matchAll(/^[ \t]{0,3}(#{1,6})[ \t]*(.+?)[ \t]*#*[ \t]*$/gm)].map((m) => ({
    level: m[1].length,
    title: plain(m[2]),
    index: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
}
function bodyAfter(text: string, from: number, to?: number) {
  return squash(text.slice(from, to ?? text.length));
}
function firstParagraph(text: string, min = 24, max = 900) {
  for (const block of text.split(/\n\s*\n/)) {
    const value = squash(block).replace(/\n/g, ' ');
    if (value.length >= min && value.length <= max) return value;
  }
  return '';
}
function labelguess(text: string, title: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== title);
  const out: string[] = [];
  for (const line of lines) {
    if (/^(摘要|关键词|目录|致谢|参考文献|附录)/.test(line)) break;
    if (line.length < 8) continue;
    out.push(line);
    if (out.join(' ').length >= 60) break;
  }
  return out.join(' ').slice(0, 400);
}
function labelled(text: string, keys: string) {
  const match = text.match(
    new RegExp('(?:' + keys + ')[ \\t]*[:：]?[ \\t]*([^\\n，,。;；|]{1,40})', 'i'),
  );
  return match ? plain(match[1]).trim() : '';
}
function urlsOf(text: string) {
  const found = [...text.matchAll(/https?:\/\/[^\s)>\]]+/g)].map((m) =>
    m[0].replace(/[.,;:]+$/, ''),
  );
  return [...new Set(found)];
}
function inferCategory(text: string) {
  for (const [name, pattern] of CATEGORY_KEYWORDS) if (pattern.test(text)) return name;
  return '';
}
function inferTools(dependencies: string[], names: string[]) {
  const tools: string[] = [];
  const pick = (values: string[], table: [RegExp, string][]) => {
    for (const value of values) {
      for (const [pattern, tool] of table) {
        if (pattern.test(value) && !tools.includes(tool)) tools.push(tool);
      }
    }
  };
  // 依赖包先看（前端项目最准），再用文件后缀补齐设计工具
  pick(dependencies, TOOL_BY_DEPENDENCY);
  pick(names, TOOL_BY_EXTENSION);
  return tools.slice(0, 6);
}
/** 压缩包名 / 顶层目录名兜底当标题：去掉“终版”“final”这类噪声 */
function titleFromArchive(name: string, rootFolder: string) {
  const clean = (value: string) =>
    plain(value)
      .replace(/\.(zip|rar|7z)$/i, '')
      .replace(/\b(final|latest|backup|copy|new)\b/gi, '')
      .replace(/终版|最终版|定稿|提交版|备份|新建文件夹|修改版|v?\d+(\.\d+)*$/gi, '')
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const folder = clean(rootFolder);
  if (folder && folder.length >= 2 && folder.length <= 30 && !/^\d+$/.test(folder)) return folder;
  return clean(name).slice(0, 40);
}

type Entry = { name: string; bytes: Uint8Array };
type Candidate = { name: string; file: File; score: number };
/** 从文件名猜这张图能不能当封面 */
function nameScore(path: string) {
  const base = (segments(path).at(-1) || '').toLowerCase();
  let score = 0;
  if (/封面|cover|主图|首页|kv|keyvisual|poster|海报|主视觉/.test(base)) score += 8;
  if (/作品|展示|效果|成品|render|shot|view|scene|main|hero/.test(base)) score += 3;
  if (/logo|icon|二维码|qrcode|avatar|头像|水印|示意图|diagram|thumb|缩略/.test(base)) score -= 5;
  if (/截图|screenshot|screen[-_ ]?shot|录屏|界面/.test(base)) score -= 1;
  if (/\/(封面|图片|图像|作品|展示|素材|photos?|images?)\//i.test(path)) score += 2;
  if (/^\d+$/.test(base.replace(IMAGE, ''))) score += 1;
  return score;
}
/** 用浏览器解码一次拿宽高，太小的图不适合当封面 */
async function probe(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { w: 0, h: 0 };
  }
}
async function rankImages(entries: Entry[], onProgress: (text: string) => void) {
  const candidates: Candidate[] = entries
    .filter((entry) => IMAGE.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      file: new File([entry.bytes as BlobPart], segments(entry.name).at(-1) || 'image.jpg', {
        type:
          'image/' +
          (/\.png$/i.test(entry.name) ? 'png' : /\.webp$/i.test(entry.name) ? 'webp' : 'jpeg'),
      }),
      score: nameScore(entry.name),
    }))
    // 先按文件名排，只给前面的候选算分辨率，避免解压一堆图去解码
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 24);
  for (const [index, item] of candidates.entries()) {
    onProgress('正在读取图片 ' + (index + 1) + ' / ' + candidates.length);
    const { w, h } = await probe(item.file);
    if (!w || !h) {
      item.score -= 100;
      continue;
    }
    if (w < 500 || h < 380) item.score -= 6;
    item.score += Math.min(6, (w * h) / 1_600_000);
    if (w / h > 1.15 && w / h < 2.2) item.score += 1.5;
  }
  const usable = candidates.filter((item) => item.score > -50);
  usable.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return usable.slice(0, 24);
}
/**
 * 把一个压缩包读成一份填好的作品草稿：标题、简介、作者、工具、链接、分类、配色，
 * 加上排好序的图片。规则全部写在上面，改起来不用碰解析流程。
 */
export async function readArchive(
  file: File,
  onProgress: (text: string) => void,
): Promise<ArchiveImport> {
  if (file.size > uploadLimits.archiveMb * 1024 * 1024)
    throw new Error('压缩包请控制在 ' + uploadLimits.archiveMb + ' MB 以内。');
  onProgress('正在打开 ' + file.name);
  const names: string[] = [];
  const data = new Uint8Array(await file.arrayBuffer());
  let output: Record<string, Uint8Array>;
  try {
    output = unzipSync(data, {
      // filter 会对每个条目调用一次，顺手记下全部文件名用于推断工具
      filter: (entry) => {
        names.push(archivePath(entry.name));
        return wantedEntry(entry.name, entry.originalSize);
      },
    });
  } catch {
    throw new Error('这个压缩包打不开，换一个 zip 试试。');
  }
  const entries: Entry[] = Object.entries(output)
    .filter(([, bytes]) => bytes.length)
    .map(([name, bytes]) => ({ name, bytes }));
  const sources: string[] = [];
  const docs = entries
    .filter((entry) => TEXT.test(entry.name))
    .map((entry) => {
      const base = (segments(entry.name).at(-1) || '').toLowerCase();
      const depth = segments(entry.name).length;
      const weight = DOC_NAMES.test(base) ? 3 : depth <= 2 ? 2 : 1;
      return { name: entry.name, base, weight, text: smartDecode(entry.bytes) };
    })
    .sort((a, b) => b.weight - a.weight || b.text.length - a.text.length);
  const packageDoc = docs.find((doc) => doc.base === 'package.json');
  const packageJson: {
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = (() => {
    try {
      return JSON.parse(packageDoc?.text || '{}');
    } catch {
      return {};
    }
  })();
  const main = docs.find((doc) => !doc.base.endsWith('.json')) || docs[0];
  const text = main ? main.text : '';
  const flat = plain(text);
  if (main) sources.push(segments(main.name).at(-1) || main.name);
  const patch: Partial<Project> = {};
  const head = headings(text);
  const top = head.find((item) => item.level === 1) || head[0];
  if (top && top.title.length >= 2 && top.title.length <= 40) patch.title = top.title;
  const matches = (keys: RegExp) => {
    const found = head.find((item) => keys.test(item.title));
    if (!found) return '';
    const next = head.find((item) => item.index > found.index);
    return bodyAfter(text, found.end, next?.index);
  };
  const intro =
    firstParagraph(matches(/简介|介绍|概述|项目背景|作品说明|abstract|introduction|overview/i)) ||
    firstParagraph(
      top ? bodyAfter(text, top.end, head.find((item) => item.index > top.index)?.index) : text,
      40,
    ) ||
    (packageDoc ? String(packageJson.description || '') : '') ||
    firstParagraph(flat, 40) ||
    labelguess(flat, patch.title || '');
  if (intro) patch.intro = intro.slice(0, 900);
  const process = matches(
    /过程|思路|实现|方法|方案|制作|开发|process|approach|implementation|method/i,
  );
  if (process) patch.process = process.slice(0, 900);
  const role = matches(/职责|分工|我的工作|本人工作|贡献|role|contribution/i);
  if (role) patch.role = role.slice(0, 400);
  if (role || process) sources.push('项目文档的章节');
  const toolsSection = matches(/技术栈|技术选型|工具|环境|依赖|tech|tools|stack|built with/i);
  const dependencies = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ];
  const tools = [
    ...new Set([
      ...(toolsSection
        ? plain(toolsSection)
            .replace(/\n/g, ' / ')
            .split(/\s*[、,，/|]\s*/)
        : []),
      ...inferTools(dependencies, names),
    ]),
  ]
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 1 && tool.length < 24)
    .slice(0, 6);
  if (tools.length) {
    patch.tools = tools.join(' · ');
    sources.push('文件名与依赖');
  }
  const author = labelled(text, '作者|姓名|设计者|作者姓名|author');
  if (author) patch.author = author;
  const subtitleLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^[A-Z][A-Z0-9 &·\-–'’,.]{4,60}$/.test(line));
  if (subtitleLine) patch.subtitle = subtitleLine;
  const meta: ProjectMeta = {
    school: labelled(text, '学校|院校|学院|大学|school|university'),
    major: labelled(text, '专业|系别|专业方向|major'),
    advisor: labelled(text, '指导教师|指导老师|导师|advisor|supervisor'),
    booth: labelled(text, '展位号|展位|展板号|展区|booth'),
    period: labelled(text, '展期|时间|日期|period|date'),
    tagline: '',
  };
  const links = urlsOf(text).concat(urlsOf(flat));
  const repositories = links.filter((url) => /github\.com|gitee\.com|gitlab|gitcode/i.test(url));
  const others = links.filter((url) => !repositories.includes(url));
  const preferred =
    others.find((url) =>
      /demo|preview|在线|视频|bilibili|youtu|vimeo|xiaohongshu|zhihu/i.test(url),
    ) || others[0];
  if (preferred) patch.demoUrl = preferred;
  if (repositories[0]) patch.repositoryUrl = repositories[0];
  if (preferred || repositories[0]) sources.push('正文里的链接');
  const category =
    inferCategory(flat + ' ' + (patch.title || '') + ' ' + (patch.tools || '')) ||
    (/软件开发/.test(patch.tools || '') ? '软件开发' : '') ||
    '其他';
  patch.category = category;
  patch.template = (TEMPLATE_BY_CATEGORY[category] || 'editorial') as Project['template'];
  const year = (file.name.match(/(20\d{2})/) || flat.match(/20\d{2}\s*届/))?.[1];
  patch.year = year || String(new Date().getFullYear());
  patch.meta = meta;
  const rootFolder = (() => {
    const roots = new Set(
      names.filter((name) => name.includes('/')).map((name) => segments(name)[0]),
    );
    return roots.size === 1 ? [...roots][0] : '';
  })();
  if (!patch.title)
    patch.title =
      titleFromArchive(file.name, names.length ? rootFolder : segments(file.name)[0]) ||
      '未命名作品';
  const images = await rankImages(entries, onProgress);
  const filled = [
    patch.title ? '标题' : '',
    patch.intro ? '简介' : '',
    patch.author ? '作者' : '',
    patch.tools ? '工具' : '',
    Object.values(meta).some(Boolean) ? '展位信息' : '',
    images.length ? images.length + ' 张图' : '',
    category !== '其他' ? category : '',
  ].filter(Boolean);
  return {
    patch,
    images: images.map((item) => item.file),
    sources,
    notice: filled.length
      ? '已从「' + file.name + '」自动填好：' + filled.join('、') + '。全部是猜的，点哪里都能改。'
      : '压缩包里没找到能自动识别的文字或图片，先按空白项目打开，你手动补上就好。',
  };
}
