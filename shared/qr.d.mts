import type { RenderRuntime } from './render.d.mts';
export function drawQr(
  runtime: Pick<RenderRuntime, 'createCanvas'>,
  value: string,
  size?: number,
  options?: { level?: 'L' | 'M' | 'Q' | 'H'; quiet?: number; light?: string; dark?: string },
): HTMLCanvasElement;
export function publicationUrl(origin: string, slug?: string, kind?: string): string;
