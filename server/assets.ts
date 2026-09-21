import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { open, readdir, rename, unlink, stat } from 'node:fs/promises';
import { config, mb } from './config.ts';
import { db } from './db/index.ts';
import { recordActivity } from './activity.ts';
import { owned, removeProject } from './projects.ts';
import { HttpError, requireUser } from './http.ts';
const limits = config.uploads;
export const fileDir = path.join(config.dataDir, 'files');
// 配色烘焙出来的派生图单独放一个目录，管理端的孤儿扫描只看 files/
export const derivedDir = path.join(config.dataDir, 'derived');
const incoming = path.join(config.dataDir, 'incoming');
mkdirSync(fileDir, { recursive: true });
mkdirSync(derivedDir, { recursive: true });
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
  limits: { fileSize: limits.request, files: 1, fields: 0 },
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
      if (file.size > limits.image)
        throw new HttpError(413, `单张图片不能超过${mb(limits.image)}MB。`);
      const info = await sharp(temp, { limitInputPixels: 40_000_000 })
        .metadata()
        .catch(() => {
          throw new HttpError(400, '无法识别图片内容。');
        });
      if (!['jpeg', 'png', 'webp'].includes(info.format || ''))
        throw new HttpError(400, '图片格式不受支持。');
      kind = 'image';
      // 带透明通道的图必须存成 PNG：转 JPEG 会丢掉 alpha，透明区域会被压成黑块。
      mime = info.hasAlpha ? 'image/png' : 'image/jpeg';
      outputExt = info.hasAlpha ? 'png' : 'jpg';
    } else if (ext === '.pdf' && header.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
      if (file.size > limits.pdf) throw new HttpError(413, `PDF不能超过${mb(limits.pdf)}MB。`);
      kind = 'pdf';
      mime = 'application/pdf';
      outputExt = 'pdf';
    } else if (ext === '.mp4' && header.subarray(4, 8).toString() === 'ftyp') {
      if (file.size > limits.video) throw new HttpError(413, `视频不能超过${mb(limits.video)}MB。`);
      kind = 'video';
      mime = 'video/mp4';
      outputExt = 'mp4';
    } else if (
      ext === '.webm' &&
      header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ) {
      if (file.size > limits.video) throw new HttpError(413, `视频不能超过${mb(limits.video)}MB。`);
      kind = 'video';
      mime = 'video/webm';
      outputExt = 'webm';
    } else if (
      ext === '.zip' &&
      ['504b0304', '504b0506', '504b0708'].includes(header.subarray(0, 4).toString('hex'))
    ) {
      if (file.size > limits.archive)
        throw new HttpError(413, `ZIP不能超过${mb(limits.archive)}MB。`);
      kind = 'archive';
      mime = 'application/zip';
      outputExt = 'zip';
    } else throw new HttpError(400, '文件内容与格式不符。支持图片、PDF、MP4、WebM和ZIP。');
    const id = randomUUID(),
      filename = id + '.' + outputExt;
    destination = storedPath(filename);
    if (kind === 'image') {
      const image = sharp(temp, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });
      if (outputExt === 'png') await image.png().toFile(destination);
      else await image.jpeg({ quality: 88 }).toFile(destination);
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
    recordActivity(projectId);
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
assets.get('/assets/:id/colorway', requireUser, async (req, res, next) => {
  const asset = db
    .prepare(
      'SELECT a.* FROM assets a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.owner_id=?',
    )
    .get(String(req.params.id), req.user!.id) as Record<string, any> | undefined;
  if (!asset) throw new HttpError(404, '文件不存在或没有访问权限。');
  await sendColorway(asset, req, res, next);
});
/** 配色参数：先夹到合理范围，免得任意浮点数把缓存目录撑爆 */
function parseColorway(query: Record<string, unknown>) {
  const hue = Math.round(Number(query.hue) || 0);
  const saturation = Number(query.sat ?? 1);
  const brightness = Number(query.bri ?? 1);
  if (!Number.isFinite(saturation) || !Number.isFinite(brightness))
    throw new HttpError(400, '配色参数无效。');
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(value * 100) / 100));
  return {
    hue: Math.min(180, Math.max(-180, hue)),
    saturation: clamp(saturation, 0.5, 1.5),
    brightness: clamp(brightness, 0.5, 1.5),
  };
}
const baking = new Map<string, Promise<unknown>>();
/** 按需烘焙配色图，缓存进 data/derived，同一个地址只算一次 */
export async function sendColorway(
  asset: Record<string, any>,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { hue, saturation, brightness } = parseColorway(req.query as Record<string, unknown>);
  if (!hue && saturation === 1 && brightness === 1) return sendAsset(asset, req, res, next);
  if (asset.kind !== 'image') throw new HttpError(400, '只有图片可以切换配色。');
  const source = storedPath(asset.filename);
  const info = await sharp(source, { limitInputPixels: 40_000_000 })
    .metadata()
    .catch(() => {
      throw new HttpError(400, '图片无法读取。');
    });
  const extension = info.hasAlpha ? 'png' : 'jpg';
  const name = `${asset.id}-h${hue}_s${saturation}_b${brightness}.${extension}`;
  const target = path.join(derivedDir, name);
  if (!existsSync(target)) {
    let pending = baking.get(name);
    if (!pending) {
      const pipeline = sharp(source, { limitInputPixels: 40_000_000 }).modulate({
        hue,
        saturation,
        brightness,
      });
      pending = (extension === 'png' ? pipeline.png() : pipeline.jpeg({ quality: 88 }))
        .toFile(target)
        .catch((error: Error) => {
          throw new HttpError(400, '配色处理失败：' + error.message);
        })
        .finally(() => baking.delete(name));
      baking.set(name, pending);
    }
    await pending;
  }
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(extension === 'png' ? 'image/png' : 'image/jpeg');
  res.sendFile(target, (error) => {
    if (error) next(error);
  });
}
/** 启动时清掉指向已删除素材的派生病图 */
export async function sweepDerived() {
  const keep = new Set(
    (db.prepare('SELECT id FROM assets').all() as { id: string }[]).map((row) => row.id),
  );
  const names = await readdir(derivedDir).catch(() => [] as string[]);
  await Promise.all(
    names.map((name) =>
      keep.has(name.slice(0, 36)) ? undefined : unlink(path.join(derivedDir, name)).catch(() => {}),
    ),
  );
}
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
