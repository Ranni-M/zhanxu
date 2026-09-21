import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { samples, templates } from '../src/data/catalog.ts';
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
    const canvas = await renderCover({ ...project, template: template.id }, runtime as any, 800);
    await writeFile(
      'public/previews/' + project.id + '-' + template.id + '.webp',
      await (canvas as any).encode('webp', 82),
    );
  }
