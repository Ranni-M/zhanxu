// 封面风格（原来的 3 种 + 新增 6 种配色），id 保持不变所以老草稿能直接读
export type TemplateId =
  'editorial' | 'gallery' | 'bold' | 'paper' | 'ink' | 'neon' | 'kraft' | 'mono' | 'cobalt';
// 海报骨架（排版结构）。auto = 按内容形状自动挑一个
export type SkeletonId = 'auto' | 'stack' | 'banner' | 'statement' | 'split' | 'grid' | 'type-only';
export type PosterSizeId = 'a4' | 'print' | 'story' | 'og' | 'square';
export type ProjectImage = { id: string; src: string; name: string };
export type Attachment = {
  id: string;
  src: string;
  name: string;
  kind: 'video' | 'pdf' | 'archive';
  size: number;
  visible: boolean;
  caption?: string;
};
export type ProjectSection = { id: string; title: string; body: string; imageIds: string[] };
// 材质配色：作者选一个目标 RGB，系统换算成色相偏移 + 饱和度/明度倍数（服务端烘焙）
export type Colorway = {
  id: string;
  label: string;
  /** 取材色（图片主色），用来算色相偏移 */
  source: string;
  hue: number;
  saturation: number;
  brightness: number;
  color: string;
};
// A/B 方案：一组图 + 一套配色，观众可以切换
export type ProjectOption = {
  id: string;
  label: string;
  note: string;
  imageIds: string[];
  colorwayId?: string;
};
// 前后对比：两张图叠在一起拉滑杆
export type ComparePair = { id: string; label: string; before: string; after: string };
// 海报与作品集 PDF 共用的展签信息（可留空，留空就用项目本身的信息）
export type ProjectMeta = {
  school: string;
  major: string;
  advisor: string;
  booth: string;
  period: string;
  tagline: string;
};
export type BirthDay = { day: string; count: number };
export type Birth = {
  days: BirthDay[];
  edits: number;
  activeDays: number;
  spanDays: number;
  streak: number;
  versions: number;
  startedAt: number;
  lastAt: number;
};
export type Project = {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  category: string;
  year: string;
  intro: string;
  process: string;
  template: TemplateId;
  images: ProjectImage[];
  updatedAt: number;
  sample?: boolean;
  revision?: number;
  role?: string;
  tools?: string;
  demoUrl?: string;
  repositoryUrl?: string;
  attachments?: Attachment[];
  sections?: ProjectSection[];
  publishedSlug?: string;
  publishedRevision?: number;
  publishedVisibility?: 'public' | 'private';
  /** 第几张图当封面（0 开始），默认第一张 */
  coverIndex?: number;
  skeleton?: SkeletonId;
  posterSize?: PosterSizeId;
  meta?: ProjectMeta;
  colorways?: Colorway[];
  options?: ProjectOption[];
  compares?: ComparePair[];
  /** 出生证明，由服务端算好下发，只读 */
  birth?: Birth;
};
export function emptyMeta(): ProjectMeta {
  return { school: '', major: '', advisor: '', booth: '', period: '', tagline: '' };
}
/** 封面图：越界或没设置时退回第一张 */
export function coverImage(project: Project): ProjectImage | undefined {
  if (!project.images.length) return undefined;
  const index = Math.min(Math.max(project.coverIndex ?? 0, 0), project.images.length - 1);
  return project.images[index] || project.images[0];
}
export const skeletonOptions: { id: SkeletonId; label: string; note: string }[] = [
  { id: 'auto', label: '自动', note: '按图片数量自动挑一种' },
  { id: 'stack', label: '标题在上', note: '标题与标语在上，大图在下，最稳' },
  { id: 'banner', label: '大图压顶', note: '整幅图铺满上半，文字在下' },
  { id: 'statement', label: '色块标题', note: '色块托住标题，像展览海报' },
  { id: 'split', label: '左右分栏', note: '左边文字右边图，横版最好用' },
  { id: 'grid', label: '图阵', note: '四张图拼成方阵，图多最好看' },
  { id: 'type-only', label: '纯文字', note: '不放图，把字和展签排好' },
];
export const posterSizeOptions: { id: PosterSizeId; label: string; note: string }[] = [
  { id: 'a4', label: 'A4 竖版', note: '屏幕分享与正文预览' },
  { id: 'print', label: 'A4 打印', note: '书册与展板，导出 PDF 就是这个比例' },
  { id: 'story', label: '手机竖屏', note: '朋友圈与短视频封面' },
  { id: 'og', label: '社交横版', note: '微信卡片与网页分享图' },
  { id: 'square', label: '方形', note: '社交头像与方图' },
];
export function createProject(): Project {
  return {
    id: crypto.randomUUID(),
    title: '',
    subtitle: '',
    author: '',
    category: '视觉传达',
    year: String(new Date().getFullYear()),
    intro: '',
    process: '',
    template: 'editorial',
    images: [],
    attachments: [],
    sections: [],
    role: '',
    tools: '',
    demoUrl: '',
    repositoryUrl: '',
    updatedAt: 0,
    coverIndex: 0,
    skeleton: 'auto',
    posterSize: 'a4',
    meta: emptyMeta(),
    colorways: [],
    options: [],
    compares: [],
  };
}
