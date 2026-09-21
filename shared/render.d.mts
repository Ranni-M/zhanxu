import type { Project, PosterSizeId, SkeletonId, TemplateId } from '../src/domain/project';
export type RenderRuntime = {
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
  loadImage: (src: string) => Promise<HTMLImageElement>;
};
export type RenderSizeId = PosterSizeId;
export type RenderThemeId = TemplateId;
export type RenderSkeletonId = Exclude<SkeletonId, 'auto'>;
export type RenderOptions = {
  width?: number;
  size?: RenderSizeId;
  skeleton?: RenderSkeletonId | 'auto';
  theme?: RenderThemeId;
  qr?: unknown;
  /** PDF 插了目录页时传 1，让正文页码接在目录后面 */
  numberOffset?: number;
};
/** 作品集内页：kind 与 title 是给 PDF 自动目录用的 */
export type RenderedPage = {
  canvas: HTMLCanvasElement;
  kind: 'cover' | 'section' | 'image';
  title: string;
  page: number;
};
export type StorySection = { title: string; body?: string };
export const themes: Record<
  TemplateId,
  {
    bg: string;
    ink: string;
    muted: string;
    accent: string;
    panel: string;
    onPanel: string;
    soft: string;
  }
>;
export const posterSizes: Record<PosterSizeId, { w: number; h: number; label: string }>;
export const posterSkeletons: RenderSkeletonId[];
export function pickSkeleton(project: Project, size?: PosterSizeId): SkeletonId;
/** 一个作品的正文分节，PDF 目录与正文页共用 */
export function storySections(project: Project): StorySection[];
export function renderCover(
  project: Project,
  runtime: RenderRuntime,
  options?: RenderOptions | number,
): Promise<HTMLCanvasElement>;
export function renderPages(
  project: Project,
  runtime: RenderRuntime,
  options?: RenderOptions | number,
): AsyncGenerator<RenderedPage>;
export function renderToc(
  project: Project,
  runtime: RenderRuntime,
  entries: { kind: string; title: string; page: number }[],
  options?: RenderOptions | number,
): Promise<HTMLCanvasElement>;
