import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { samples, templates } from '../src/data/catalog.ts';
import type { SkeletonId, TemplateId } from '../src/domain/project.ts';

// 画廊里每张预览换一种排版骨架，不然九张图只有颜色差别，看起来就是同一个模板
const gallerySkeleton: Record<TemplateId, SkeletonId> = {
  editorial: 'stack',
  gallery: 'split',
  bold: 'statement',
  paper: 'type-only',
  ink: 'banner',
  neon: 'stack',
  kraft: 'banner',
  mono: 'statement',
  cobalt: 'split',
};
// The renderer accepts interchangeable Canvas implementations.
import { renderCover } from '../shared/render.mjs';
if (existsSync('C:/Windows/Fonts/msyh.ttc'))
  GlobalFonts.registerFromPath('C:/Windows/Fonts/msyh.ttc', 'Microsoft YaHei');
await mkdir('public/previews', { recursive: true });
const runtime = {
  createCanvas,
  loadImage: (src: string) => loadImage(path.resolve('public', src.replace(/^\//, ''))),
};
for (const project of samples)
  for (const template of templates) {
    // theme 必须显式传：每个模板的预览图要长得不一样，否则九张图是同一张
    const skeleton = gallerySkeleton[template.id];
    const canvas = await renderCover(
      { ...project, template: template.id, skeleton, posterSize: 'a4' },
      runtime as any,
      { width: 800, theme: template.id, skeleton, size: 'a4' },
    );
    await writeFile(
      'public/previews/' + project.id + '-' + template.id + '.webp',
      await (canvas as any).encode('webp', 82),
    );
  }
