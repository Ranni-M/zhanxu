import type { Project } from '../src/domain/project';
export type RenderRuntime = {
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
  loadImage: (src: string) => Promise<HTMLImageElement>;
};
export function renderCover(
  project: Project,
  runtime: RenderRuntime,
  width?: number,
): Promise<HTMLCanvasElement>;
export function renderPages(
  project: Project,
  runtime: RenderRuntime,
  width?: number,
): AsyncGenerator<HTMLCanvasElement>;
