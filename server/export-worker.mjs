import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { createWriteStream, existsSync } from 'node:fs';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { renderCover, renderPages } from '../shared/render.mjs';
import { buildPortfolio } from '../shared/pdf.mjs';
import { drawQr } from '../shared/qr.mjs';
const windowsFont = 'C:/Windows/Fonts/msyh.ttc';
if (existsSync(windowsFont)) GlobalFonts.registerFromPath(windowsFont, 'Microsoft YaHei');
const { project, format, destination, url } = workerData;
const runtime = { createCanvas, loadImage };
const qr = url ? drawQr(runtime, url, 320) : undefined;
const temp = destination + '.tmp';
try {
  if (format === 'cover') {
    const canvas = await renderCover(project, runtime, { width: 1600, qr });
    await writeFile(temp, await canvas.encode('png'));
  } else if (format === 'pdf') {
    await writeFile(
      temp,
      await buildPortfolio(project, runtime, {
        width: 1500,
        theme: project.template,
        skeleton: project.skeleton,
        qr,
      }),
    );
  } else {
    const zip = new yazl.ZipFile();
    const output = createWriteStream(temp);
    const done = pipeline(zip.outputStream, output);
    let page = 0;
    for await (const sheet of renderPages(project, runtime, {
      width: 1600,
      theme: project.template,
      qr,
    })) {
      zip.addBuffer(
        await sheet.canvas.encode('png'),
        String(++page).padStart(2, '0') + '-project.png',
        { compress: false },
      );
    }
    zip.addBuffer(
      Buffer.from(
        '此图文包用于介绍项目。视频、完整PDF、源码和在线体验请通过项目展示页访问。\n项目：' +
          project.title +
          '\n在线体验：' +
          (project.demoUrl || '未填写') +
          '\n源码：' +
          (project.repositoryUrl || '未填写') +
          (url ? '\n项目展示页：' + url : ''),
        'utf8',
      ),
      'README.txt',
    );
    zip.end();
    await done;
  }
  await rename(temp, destination);
  parentPort.postMessage({ ok: true });
} catch (error) {
  await unlink(temp).catch(() => {});
  parentPort.postMessage({ ok: false, error: error.message });
}
