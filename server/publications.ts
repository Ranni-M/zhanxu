import { Router } from 'express';
import { z } from 'zod';
import { db } from './db/index.ts';
import { HttpError, requireUser } from './http.ts';
import { sendAsset } from './assets.ts';
export function publication(slug: string) {
  const row = db.prepare('SELECT * FROM publications WHERE slug=? AND is_live=1').get(slug) as
    Record<string, any> | undefined;
  if (!row) throw new HttpError(404, '作品未发布或已被撤回。');
  return row;
}
export function publicDocument(row: Record<string, any>) {
  const doc = JSON.parse(row.snapshot);
  return {
    ...doc,
    publishedSlug: row.slug,
    publishedRevision: row.revision,
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
  const rows = db
    .prepare(
      'SELECT * FROM publications WHERE is_live=1 ORDER BY published_at DESC LIMIT 50 OFFSET ?',
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
publications.get('/publications/:slug', (req, res) =>
  res.json({ project: publicDocument(publication(String(req.params.slug))) }),
);
publications.get('/public-assets/:slug/:id', (req, res, next) => {
  const row = publication(String(req.params.slug));
  const doc = JSON.parse(row.snapshot);
  const allowed = [...doc.images, ...doc.attachments].some((a: any) => a.id === req.params.id);
  if (!allowed) throw new HttpError(404, '此文件未公开。');
  const asset = db
    .prepare('SELECT * FROM assets WHERE id=? AND project_id=?')
    .get(String(req.params.id), row.project_id);
  if (!asset) throw new HttpError(404, '文件不存在。');
  sendAsset(asset, req, res, next);
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
  if (saved) db.prepare('INSERT OR IGNORE INTO bookmarks VALUES(?,?)').run(req.user!.id, id);
  else db.prepare('DELETE FROM bookmarks WHERE user_id=? AND project_id=?').run(req.user!.id, id);
  res.json({ ok: true });
});
