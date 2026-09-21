import type { RenderRuntime, RenderSizeId, RenderThemeId, RenderSkeletonId } from './render.d.mts';
export type PdfPageKind = 'cover' | 'toc' | 'section' | 'image';
export type PdfEntry = { kind: PdfPageKind; title: string; page: number };
export type PortfolioOptions = {
  width?: number;
  theme?: RenderThemeId;
  skeleton?: RenderSkeletonId | 'auto';
  qr?: HTMLCanvasElement;
  origin?: string;
};
export declare const A4: { w: number; h: number };
/** 左侧装订边的宽度（pt） */
export declare const BINDING: number;
/** 作品集 PDF 字节；Node 与浏览器共用 */
export declare function buildPortfolio(
  project: unknown,
  runtime: RenderRuntime,
  options?: PortfolioOptions,
): Promise<Uint8Array>;
