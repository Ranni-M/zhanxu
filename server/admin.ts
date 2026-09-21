import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { readdir, stat, statfs, unlink } from 'node:fs/promises';
import path from 'node:path';
import { db, transaction } from './db/index.ts';
import { config, isAdminEmail } from './config.ts';
import { fileDir } from './assets.ts';
import { storedPath } from './assets.ts';
import { removeProject } from './projects.ts';
import { HttpError } from './http.ts';

// 管理员由 ADMIN_EMAILS 环境变量指定，不引入角色表：
// 授权与撤销都只是改一行配置，不需要数据库迁移。
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, '请先登录。'));
  if (!isAdminEmail(req.user.email))
    return next(new HttpError(403, '只有管理员可以访问管理接口。'));
  next();
}

type Document = {
  images?: { id: string }[];
  attachments?: { id: string }[];
  sections?: { imageIds?: string[] }[];
  [key: string]: unknown;
};

// 删掉一个素材后，必须同时把它从项目文档与已发布快照里摘掉，
// 否则作者的编辑器会留下指向已删除文件的坏引用，公开页会显示裂图。
function stripAsset(document: Document, assetId: string): Document {
  return {
    ...document,
    images: (document.images || []).filter((item) => item.id !== assetId),
    attachments: (document.attachments || []).filter((item) => item.id !== assetId),
    sections: (document.sections || []).map((section) => ({
      ...section,
      imageIds: (section.imageIds || []).filter((id) => id !== assetId),
    })),
  };
}

function references(document: Document, assetId: string) {
  return Boolean(
    (document.images || []).some((item) => item.id === assetId) ||
    (document.attachments || []).some((item) => item.id === assetId) ||
    (document.sections || []).some((section) => (section.imageIds || []).includes(assetId)),
  );
}

const filePattern = /^[a-f0-9-]+\.(jpg|pdf|mp4|webm|zip|png)$/;

export async function removeStoredFiles(filenames: (string | null | undefined)[]) {
  const results = await Promise.allSettled(
    filenames
      .filter((name): name is string => Boolean(name) && filePattern.test(String(name)))
      .map((name) => unlink(path.join(fileDir, name))),
  );
  return results.filter((result) => result.status === 'fulfilled').length;
}

export const admin = Router();
admin.use(requireAdmin);

admin.get('/overview', async (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.created_at,
        (SELECT count(*) FROM projects p WHERE p.owner_id=u.id) AS project_count,
        (SELECT count(*) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner_id=u.id) AS file_count,
        (SELECT coalesce(sum(a.bytes),0) FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner_id=u.id) AS bytes,
        (SELECT count(*) FROM publications b JOIN projects p ON p.id=b.project_id WHERE p.owner_id=u.id AND b.is_live=1) AS live_count,
        (SELECT count(*) FROM publications b JOIN projects p ON p.id=b.project_id WHERE p.owner_id=u.id AND b.is_live=1 AND b.visibility='private') AS private_count
      FROM users u ORDER BY bytes DESC, u.created_at ASC`,
    )
    .all();
  const totals = db
    .prepare(
      `SELECT (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM projects) AS projects,
        (SELECT count(*) FROM publications WHERE is_live=1) AS live,
        (SELECT count(*) FROM publications WHERE is_live=1 AND visibility='private') AS live_private,
        (SELECT count(*) FROM assets) AS files,
        (SELECT coalesce(sum(bytes),0) FROM assets) AS bytes`,
    )
    .get();
  let disk: { free: number; total: number } | null = null;
  try {
    const info = await statfs(config.dataDir);
    disk = { free: info.bsize * info.bavail, total: info.bsize * info.blocks };
  } catch {
    disk = null;
  }
  res.json({
    users,
    totals: { ...(totals as object), adminEmails: config.adminEmails },
    disk,
    maxUserBytes: config.maxUserBytes,
  });
});

admin.get('/projects', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.revision, p.created_at, p.updated_at, p.document,
        u.id AS owner_id, u.email AS owner_email, u.name AS owner_name,
        (SELECT count(*) FROM assets a WHERE a.project_id=p.id) AS file_count,
        (SELECT coalesce(sum(a.bytes),0) FROM assets a WHERE a.project_id=p.id) AS bytes,
        (SELECT slug FROM publications b WHERE b.project_id=p.id AND b.is_live=1) AS slug,
        (SELECT visibility FROM publications b WHERE b.project_id=p.id AND b.is_live=1) AS visibility
      FROM projects p JOIN users u ON u.id=p.owner_id
      ORDER BY p.updated_at DESC LIMIT 1000`,
    )
    .all() as Record<string, any>[];
  res.json({
    projects: rows.map((row) => {
      const document = JSON.parse(row.document) as Document & {
        title?: string;
        category?: string;
        year?: string;
      };
      return {
        id: row.id,
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ownerId: row.owner_id,
        ownerEmail: row.owner_email,
        ownerName: row.owner_name,
        fileCount: row.file_count,
        bytes: row.bytes,
        slug: row.slug || null,
        visibility: row.slug ? (row.visibility === 'private' ? 'private' : 'public') : null,
        title: document.title || '(未命名项目)',
        category: document.category || '',
        year: document.year || '',
      };
    }),
  });
});

admin.get('/projects/:id/assets', (req, res) => {
  const id = String(req.params.id);
  const project = db.prepare('SELECT id, document FROM projects WHERE id=?').get(id) as
    { id: string; document: string } | undefined;
  if (!project) throw new HttpError(404, '项目不存在。');
  const document = JSON.parse(project.document) as Document;
  const assets = db
    .prepare(
      'SELECT id, original_name, mime, kind, bytes, created_at FROM assets WHERE project_id=? ORDER BY created_at',
    )
    .all(id) as Record<string, any>[];
  res.json({
    project: { id: project.id, title: (document.title as string) || '(未命名项目)' },
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.original_name,
      mime: asset.mime,
      kind: asset.kind,
      bytes: asset.bytes,
      createdAt: asset.created_at,
      used: references(document, asset.id),
    })),
  });
});

admin.delete('/assets/:id', async (req, res) => {
  const id = String(req.params.id);
  const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(id) as
    Record<string, any> | undefined;
  if (!asset) throw new HttpError(404, '文件不存在。');
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(asset.project_id) as
    Record<string, any> | undefined;
  let removedFromSnapshot = false;
  transaction(() => {
    if (project) {
      const document = JSON.parse(project.document) as Document;
      db.prepare(
        'UPDATE projects SET document=?, revision=revision+1, updated_at=? WHERE id=?',
      ).run(JSON.stringify(stripAsset(document, asset.id)), Date.now(), project.id);
      const publication = db
        .prepare('SELECT * FROM publications WHERE project_id=?')
        .get(project.id) as Record<string, any> | undefined;
      if (publication) {
        db.prepare('UPDATE publications SET snapshot=? WHERE project_id=?').run(
          JSON.stringify(stripAsset(JSON.parse(publication.snapshot) as Document, asset.id)),
          project.id,
        );
        removedFromSnapshot = true;
      }
    }
    db.prepare('DELETE FROM assets WHERE id=?').run(asset.id);
  });
  const removed = await removeStoredFiles([asset.filename]);
  res.json({ ok: true, name: asset.original_name, removedFromSnapshot, diskRemoved: removed });
});

admin.delete('/projects/:id', async (req, res) => {
  const id = String(req.params.id);
  const row = db.prepare('SELECT owner_id FROM projects WHERE id=?').get(id) as
    { owner_id: string } | undefined;
  if (!row) throw new HttpError(404, '项目不存在。');
  // 复用项目删除逻辑：它会连带清理发布快照与收藏记录
  const files = removeProject(id, row.owner_id);
  const removed = await removeStoredFiles(files);
  res.json({ ok: true, removedFiles: removed });
});

admin.delete('/users/:id', async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, '不能删除自己的账号。');
  const user = db.prepare('SELECT email FROM users WHERE id=?').get(id) as
    { email: string } | undefined;
  if (!user) throw new HttpError(404, '账号不存在。');
  const assets = db
    .prepare(
      'SELECT a.filename FROM assets a JOIN projects p ON p.id=a.project_id WHERE p.owner_id=?',
    )
    .all(id) as { filename: string }[];
  const results = db
    .prepare(
      'SELECT j.result_filename FROM export_jobs j JOIN projects p ON p.id=j.project_id WHERE p.owner_id=? AND j.result_filename IS NOT NULL',
    )
    .all(id) as { result_filename: string }[];
  // 外键级联会清掉 projects/assets/publications/sessions，
  // 但不会碰磁盘上的文件，所以必须先收集文件名再删行。
  transaction(() => {
    db.prepare('DELETE FROM users WHERE id=?').run(id);
  });
  const removed = await removeStoredFiles([
    ...assets.map((row) => row.filename),
    ...results.map((row) => row.result_filename),
  ]);
  res.json({ ok: true, email: user.email, removedFiles: removed });
});

admin.get('/orphans', async (_req, res) => {
  const known = new Set<string>();
  for (const row of db.prepare('SELECT filename FROM assets').all() as { filename: string }[])
    known.add(row.filename);
  for (const row of db
    .prepare('SELECT result_filename FROM export_jobs WHERE result_filename IS NOT NULL')
    .all() as { result_filename: string }[])
    known.add(row.result_filename);
  const files: { name: string; bytes: number; ageHours: number }[] = [];
  for (const name of await readdir(fileDir).catch(() => [])) {
    if (known.has(name)) continue;
    const info = await stat(path.join(fileDir, name)).catch(() => null);
    if (!info?.isFile()) continue;
    files.push({
      name,
      bytes: info.size,
      ageHours: Math.round((Date.now() - info.mtimeMs) / 3600000),
    });
  }
  files.sort((a, b) => b.bytes - a.bytes);
  res.json({ files, total: files.reduce((sum, file) => sum + file.bytes, 0) });
});

admin.delete('/orphans', async (_req, res) => {
  const known = new Set<string>();
  for (const row of db.prepare('SELECT filename FROM assets').all() as { filename: string }[])
    known.add(row.filename);
  for (const row of db
    .prepare('SELECT result_filename FROM export_jobs WHERE result_filename IS NOT NULL')
    .all() as { result_filename: string }[])
    known.add(row.result_filename);
  const removed: string[] = [];
  for (const name of await readdir(fileDir).catch(() => [])) {
    if (known.has(name)) continue;
    const info = await stat(path.join(fileDir, name)).catch(() => null);
    // 只清理 1 小时前的孤儿，避免删掉正在上传的临时文件
    if (!info?.isFile() || Date.now() - info.mtimeMs < 3600000) continue;
    if (await removeStoredFiles([name])) removed.push(name);
  }
  res.json({ removed: removed.length });
});
