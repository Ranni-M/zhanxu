import { renderPages, renderToc } from './render.mjs';
// A4 是 595.28 × 841.89 pt（210 × 297 mm）
const A4 = { w: 595.28, h: 841.89 };
// 四边都留安全边距（家用打印机也印得下），左侧再额外让出装订边
const MARGIN = 20;
const BINDING = 24;
/** 画布转 JPEG 字节：服务端走 encode，浏览器走 toBlob */
async function jpeg(canvas, quality = 0.84) {
  if (typeof canvas.encode === 'function') return canvas.encode('jpeg', Math.round(quality * 100));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}
/**
 * 生成作品集 PDF：封面、自动目录、每页页眉页码、左侧装订边。
 * runtime 与服务端渲染共用，同一份代码在 worker 与浏览器里都能跑。
 */
export async function buildPortfolio(project, runtime, options = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const book = {
    width: options.width || 1500,
    size: 'print',
    theme: options.theme,
    skeleton: options.skeleton,
    qr: options.qr,
    // 目录页插在封面后面，所以正文页码整体后移一页
    numberOffset: 1,
  };
  const contents = [];
  const entries = [];
  for await (const page of renderPages(project, runtime, book)) {
    contents.push({ kind: page.kind, bytes: await jpeg(page.canvas) });
    if (page.kind !== 'cover')
      entries.push({ kind: page.kind, title: page.title, page: page.page });
  }
  const toc = await renderToc(project, runtime, entries, book);
  // 目录页自己占第 2 页，正文从第 3 页开始
  contents.splice(1, 0, { kind: 'toc', bytes: await jpeg(toc) });
  const left = MARGIN + BINDING;
  const box = { w: A4.w - MARGIN - left, h: A4.h - MARGIN * 2 };
  const draw = async (bytes) => {
    const image = await pdf.embedJpg(bytes);
    const page = pdf.addPage([A4.w, A4.h]);
    const width = Math.min(box.w, (box.h * image.width) / image.height);
    const height = (width * image.height) / image.width;
    page.drawImage(image, {
      x: left,
      y: (A4.h - height) / 2,
      width,
      height,
    });
  };
  for (const item of contents) await draw(item.bytes);
  pdf.setTitle(project.title || '毕业设计作品集');
  pdf.setAuthor(project.author || '');
  pdf.setSubject([project.category, project.year].filter(Boolean).join(' / '));
  pdf.setCreator('展序 ZHANXU');
  if (options.origin && project.publishedSlug && project.publishedVisibility !== 'private')
    pdf.setKeywords([options.origin + '/p/' + project.publishedSlug]);
  return pdf.save();
}
export { A4, BINDING, MARGIN };
