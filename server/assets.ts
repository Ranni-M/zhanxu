import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, rename, unlink, stat } from 'node:fs/promises';
import { config } from './config.ts';
import { db } from './db/index.ts';
import { owned, removeProject } from './projects.ts';
import { HttpError, requireUser } from './http.ts';
export const fileDir = path.join(config.dataDir, 'files');
const incoming = path.join(config.dataDir, 'incoming');
mkdirSync(fileDir, { recursive: true });
mkdirSync(incoming, { recursive: true });
export function storedPath(filename: string) {
  if (!/^[a-f0-9-]+\.(jpg|pdf|mp4|webm|zip|png)$/.test(filename))
    throw new HttpError(400, '文件路径无效。');
  return path.join(fileDir, filename);
}
const upload = multer({
  storage: multer.diskStorage({
    destination: incoming,
    filename: (_r, _f, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0 },
}).single('file');
const doUpload = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) =>
    upload(req, res, (error) => (error ? reject(error) : resolve())),
  );
function originalName(name: string) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (
    path
      .basename(decoded.includes('�') ? name : decoded)
      .replace(/[\x00-\x1f]/g, '')
      .slice(0, 160) || 'file'
  );
}
export const assets = Router();
assets.post('/projects/:id/assets', requireUser, async (req, res) => {
  const projectId = String(req.params.id);
  owned(projectId, req.user!.id);
  const count = db
    .prepare('SELECT count(*) as n FROM assets WHERE project_id=?')
    .get(projectId) as { n: number };
  if (count.n >= 100) throw new HttpError(400, '此项目已上传100个素材，请新建项目或删除旧项目。');
  await doUpload(req, res);
  if (!req.file) throw new HttpError(400, '请选择一个文件。');
  let temp = req.file.path;
  let destination = '';
  try {
    const file = req.file,
      name = originalName(file.originalname),
      ext = path.extname(name).toLowerCase();
    let kind = '',
      mime = '',
      outputExt = '';
    const handle = await open(temp, 'r');
    const header = Buffer.alloc(1024);
    try {
      await handle.read(header, 0, 1024, 0);
    } finally {
      await handle.close();
    }
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      if (file.size > 12 * 1024 * 1024) throw new HttpError(413, '单张图片不能超过12MB。');
      const info = await sharp(temp, { limitInputPixels: 40_000_000 })
        .metadata()
        .catch(() => {
          throw new HttpError(400, '无法识别图片内容。');
        });
      if (!['jpeg', 'png', 'webp'].includes(info.format || ''))
        throw new HttpError(400, '图片格式不受支持。');
      kind = 'image';
      mime = 'image/jpeg';
      outputExt = 'jpg';
    } else if (ext === '.pdf' && header.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
      if (file.size > 25 * 1024 * 1024) throw new HttpError(413, 'PDF不能超过25MB。');
      kind = 'pdf';
      mime = 'application/pdf';
      outputExt = 'pdf';
    } else if (ext === '.mp4' && header.subarray(4, 8).toString() === 'ftyp') {
      kind = 'video';
      mime = 'video/mp4';
      outputExt = 'mp4';
    } else if (
      ext === '.webm' &&
      header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ) {
      kind = 'video';
      mime = 'video/webm';
      outputExt = 'webm';
    } else if (
      ext === '.zip' &&
      ['504b0304', '504b0506', '504b0708'].includes(header.subarray(0, 4).toString('hex'))
    ) {
      if (file.size > 50 * 1024 * 1024) throw new HttpError(413, 'ZIP不能超过50MB。');
      kind = 'archive';
      mime = 'application/zip';
      outputExt = 'zip';
    } else throw new HttpError(400, '文件内容与格式不符。支持图片、PDF、MP4、WebM和ZIP。');
    const id = randomUUID(),
      filename = id + '.' + outputExt;
    destination = storedPath(filename);
    if (kind === 'image') {
      await sharp(temp, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toFile(destination);
    } else {
      await rename(temp, destination);
      temp = '';
    }
    const bytes = (await stat(destination)).size;
    const usage = db
      .prepare(
        'SELECT coalesce(sum(a.bytes),0) as total FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner_id=?',
      )
      .get(req.user!.id) as { total: number };
    if (usage.total + bytes > config.maxUserBytes)
      throw new HttpError(413, '账号文件存储已达到上限，请删除不需要的项目。');
    owned(projectId, req.user!.id);
    db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?)').run(
      id,
      projectId,
      filename,
      name,
      mime,
      kind,
      bytes,
      Date.now(),
    );
    destination = '';
    res.status(201).json({
      asset: {
        id,
        name,
        src: '/api/assets/' + id,
        kind,
        size: bytes,
        visible: kind === 'video',
        caption: '',
      },
    });
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    if (destination) await unlink(destination).catch(() => {});
  }
});
assets.get('/assets/:id', requireUser, (req, res, next) => {
  const asset = db
    .prepare(
      'SELECT a.* FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.owner_id=?',
    )
    .get(String(req.params.id), req.user!.id) as Record<string, any> | undefined;
  if (!asset) throw new HttpError(404, '文件不存在或没有访问权限。');
  sendAsset(asset, req, res, next);
});
export function sendAsset(
  asset: Record<string, any>,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.set('Cache-Control', 'private, no-store');
  res.type(asset.mime);
  if (asset.kind === 'archive' || (asset.kind === 'pdf' && req.query.inline !== '1'))
    res.attachment(asset.original_name);
  res.sendFile(storedPath(asset.filename), (error) => {
    if (error) next(error);
  });
}
assets.delete('/projects/:id', requireUser, async (req, res) => {
  const files = removeProject(String(req.params.id), req.user!.id);
  await Promise.all(files.map((file) => unlink(storedPath(file)).catch(() => {})));
  res.json({ ok: true });
});
