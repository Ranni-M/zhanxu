import { Router } from 'express';
import { z } from 'zod';
import { birth } from './activity.ts';
import { db } from './db/index.ts';
import { isAdminEmail } from './config.ts';
import { HttpError, requireUser } from './http.ts';
import { sendAsset, sendColorway } from './assets.ts';
type Viewer = { id: string; email: string } | null | undefined;
// 私密作品：只有作者本人（与站点管理员）能看到，其他人一律当作不存在，
// 不用 403 是为了不泄露「这个链接背后有东西」。
function canViewPrivate(row: Record<string, any>, viewer: Viewer) {
  if (!viewer) return false;
  if (isAdminEmail(viewer.email)) return true;
  const owner = db.prepare('SELECT owner_id FROM projects WHERE id=?').get(row.project_id) as
    { owner_id: string } | undefined;
  return owner?.owner_id === viewer.id;
}
export function publication(slug: string, viewer?: Viewer) {
  const row = db.prepare('SELECT * FROM publications WHERE slug=? AND is_live=1').get(slug) as
    Record<string, any> | undefined;
  if (!row || (row.visibility !== 'public' && !canViewPrivate(row, viewer)))
    throw new HttpError(404, '作品未发布或已被撤回。');
  return row;
}
export function publicDocument(row: Record<string, any>) {
  const doc = JSON.parse(row.snapshot);
  return {
    ...doc,
    publishedSlug: row.slug,
    publishedRevision: row.revision,
    publishedVisibility: row.visibility === 'public' ? 'public' : 'private',
    updatedAt: row.published_at,
    images: doc.images.map((a: any) => ({
      ...a,
      src: '/api/public-assets/' + row.slug + '/' + a.id,
    })),
    attachments: doc.attachments.map((a: any) => ({
      ...a,
      src: '/api/public-assets/' + row.slug + '/' + a.id,
    })),
  };
}
export const publications = Router();
publications.get('/publications', (req, res) => {
  const cursor = Math.max(0, Number(req.query.offset) || 0);
  // 发现页只列出公开作品，私密作品不进列表（作者在「我的作品」里能看到入口）
  const rows = db
    .prepare(
      "SELECT * FROM publications WHERE is_live=1 AND visibility='public' ORDER BY published_at DESC LIMIT 50 OFFSET ?",
    )
    .all(cursor);
  res.json({
    projects: rows.map((row) => {
      const doc = publicDocument(row);
      return { ...doc, images: doc.images.slice(0, 1), attachments: [], sections: [] };
    }),
    nextOffset: rows.length === 50 ? cursor + 50 : null,
  });
});
publications.get('/publications/:slug', (req, res) => {
  const row = publication(String(req.params.slug), req.user);
  // 出生证明实时读取：作者今天改了草稿，访客也能看到热力图上多一格
  res.json({ project: { ...publicDocument(row), birth: birth(row.project_id) } });
});
/** 公开素材的共用查询：不在快照里或已被删除的一律 404 */
function publicAsset(req: Record<string, any>) {
  const row = publication(String(req.params.slug), req.user);
  const doc = JSON.parse(row.snapshot);
  const allowed = [...doc.images, ...doc.attachments].some((a: any) => a.id === req.params.id);
  if (!allowed) throw new HttpError(404, '此文件未公开。');
  const asset = db
    .prepare('SELECT * FROM assets WHERE id=? AND project_id=?')
    .get(String(req.params.id), row.project_id) as Record<string, any> | undefined;
  if (!asset) throw new HttpError(404, '文件不存在。');
  return asset;
}
publications.get('/public-assets/:slug/:id', (req, res, next) => {
  sendAsset(publicAsset(req), req, res, next);
});
// 访客也能切换配色：复用同一套烘焙缓存
publications.get('/public-assets/:slug/:id/colorway', async (req, res, next) => {
  await sendColorway(publicAsset(req), req, res, next);
});
publications.get('/bookmarks', requireUser, (req, res) => {
  res.json({
    ids: db
      .prepare('SELECT project_id FROM bookmarks WHERE user_id=?')
      .all(req.user!.id)
      .map((row) => row.project_id),
  });
});
publications.put('/bookmarks/:id', requireUser, (req, res) => {
  const id = z
    .string()
    .max(80)
    .regex(/^[a-zA-Z0-9-]+$/)
    .parse(req.params.id);
  const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
  if (saved) {
    const visible = db
      .prepare(
        "SELECT 1 FROM publications WHERE project_id=? AND is_live=1 AND visibility='public'",
      )
      .get(id);
    if (!visible) throw new HttpError(404, '作品不存在或未公开。');
    db.prepare('INSERT OR IGNORE INTO bookmarks VALUES(?,?)').run(req.user!.id, id);
  } else db.prepare('DELETE FROM bookmarks WHERE user_id=? AND project_id=?').run(req.user!.id, id);
  res.json({ ok: true });
});
