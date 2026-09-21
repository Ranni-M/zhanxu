import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from './db/index.ts';
import { HttpError, requireUser } from './http.ts';
export type ProjectRow = {
  id: string;
  owner_id: string;
  document: string;
  revision: number;
  created_at: number;
  updated_at: number;
};
export function owned(id: string, owner: string): ProjectRow {
  const row = db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(id, owner) as
    ProjectRow | undefined;
  if (!row) throw new HttpError(404, '项目不存在或没有访问权限。');
  return row;
}
export function serialize(row: ProjectRow) {
  const publication = db
    .prepare('SELECT slug,revision,is_live FROM publications WHERE project_id=?')
    .get(row.id) as { slug: string; revision: number; is_live: number } | undefined;
  return {
    ...JSON.parse(row.document),
    id: row.id,
    revision: row.revision,
    updatedAt: row.updated_at,
    publishedSlug: publication?.is_live ? publication.slug : undefined,
    publishedRevision: publication?.is_live ? publication.revision : undefined,
  };
}
const url = z
  .string()
  .max(1000)
  .refine(
    (v) =>
      !v ||
      (() => {
        try {
          const parsed = new URL(v);
          return (
            ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password
          );
        } catch {
          return false;
        }
      })(),
    '请输入完整的 http 或 https 地址。',
  )
  .default('');
const input = z.object({
  title: z.string().trim().min(1, '请填写项目名称。').max(64),
  subtitle: z.string().max(80).default(''),
  author: z.string().max(80).default(''),
  category: z.enum([
    '视觉传达',
    '数字媒体',
    '空间设计',
    '产品设计',
    '软件开发',
    '动画影视',
    '其他',
  ]),
  year: z.string().regex(/^\d{4}$/),
  intro: z.string().max(2000).default(''),
  process: z.string().max(2000).default(''),
  role: z.string().max(1200).default(''),
  tools: z.string().max(250).default(''),
  demoUrl: url,
  repositoryUrl: url,
  template: z.enum(['editorial', 'gallery', 'bold']),
  revision: z.number().int().min(1),
  images: z.array(z.object({ id: z.string().uuid(), name: z.string().max(160) })).max(24),
  attachments: z
    .array(
      z.object({
        id: z.string().uuid(),
        visible: z.boolean().default(false),
        caption: z.string().max(160).default(''),
      }),
    )
    .max(12)
    .default([]),
  sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(80),
        body: z.string().max(2000),
        imageIds: z.array(z.string().uuid()).max(24).default([]),
      }),
    )
    .max(8)
    .default([]),
});
export function savedDocument(body: unknown, projectId: string) {
  const value = input.parse(body);
  const assets = db.prepare('SELECT * FROM assets WHERE project_id=?').all(projectId) as Record<
    string,
    any
  >[];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const images = value.images.map((image) => {
    const asset = byId.get(image.id);
    if (!asset || asset.kind !== 'image')
      throw new HttpError(400, '图片不属于当前项目，请重新上传。');
    return {
      id: asset.id,
      name: image.name || asset.original_name,
      src: '/api/assets/' + asset.id,
    };
  });
  if (new Set(images.map((i) => i.id)).size !== images.length)
    throw new HttpError(400, '请勿重复添加同一图片。');
  const attachments = value.attachments.map((item) => {
    const asset = byId.get(item.id);
    if (!asset || asset.kind === 'image') throw new HttpError(400, '附件不属于当前项目。');
    return {
      id: asset.id,
      name: asset.original_name,
      src: '/api/assets/' + asset.id,
      kind: asset.kind,
      size: asset.bytes,
      visible: item.visible,
      caption: item.caption,
    };
  });
  const imageIds = new Set(images.map((i) => i.id));
  for (const section of value.sections)
    if (section.imageIds.some((id) => !imageIds.has(id)))
      throw new HttpError(400, '模块引用了已移除的图片。');
  const { revision, ...rest } = value;
  return { document: { ...rest, images, attachments }, revision };
}
export const projects = Router();
projects.use(requireUser);
projects.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC')
    .all(req.user!.id) as ProjectRow[];
  res.json({ projects: rows.map(serialize) });
});
projects.post('/', (req, res) => {
  const { template } = z
    .object({ template: z.enum(['editorial', 'gallery', 'bold']).default('editorial') })
    .parse(req.body);
  const count = db
    .prepare('SELECT count(*) as n FROM projects WHERE owner_id=?')
    .get(req.user!.id) as { n: number };
  if (count.n >= 100) throw new HttpError(400, '最多创建100个项目，请整理已有项目。');
  const id = randomUUID(),
    now = Date.now();
  const doc = {
    title: '',
    subtitle: '',
    author: req.user!.name,
    category: '视觉传达',
    year: String(new Date().getFullYear()),
    intro: '',
    process: '',
    role: '',
    tools: '',
    demoUrl: '',
    repositoryUrl: '',
    template,
    images: [],
    attachments: [],
    sections: [],
  };
  db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?)').run(
    id,
    req.user!.id,
    JSON.stringify(doc),
    1,
    now,
    now,
  );
  res.status(201).json({ project: serialize(owned(id, req.user!.id)) });
});
projects.get('/:id', (req, res) =>
  res.json({ project: serialize(owned(String(req.params.id), req.user!.id)) }),
);
projects.put('/:id', (req, res) => {
  const id = String(req.params.id);
  const row = owned(id, req.user!.id);
  const parsed = savedDocument(req.body, id);
  if (row.revision !== parsed.revision)
    throw new HttpError(409, '此项目已在其他页面更新，请重新打开后再编辑。');
  db.prepare('UPDATE projects SET document=?,revision=revision+1,updated_at=? WHERE id=?').run(
    JSON.stringify(parsed.document),
    Date.now(),
    id,
  );
  res.json({ project: serialize(owned(id, req.user!.id)) });
});
projects.post('/:id/publish', (req, res) => {
  const row = owned(String(req.params.id), req.user!.id);
  const { revision } = z.object({ revision: z.number().int() }).parse(req.body);
  if (row.revision !== revision) throw new HttpError(409, '项目已有新版本，请先刷新。');
  const document = JSON.parse(row.document);
  if (!document.title?.trim() || !document.images?.length || !document.intro?.trim())
    throw new HttpError(400, '发布前请填写项目名称、介绍，并上传至少一张封面图片。');
  let pub = db.prepare('SELECT slug FROM publications WHERE project_id=?').get(row.id) as
    { slug: string } | undefined;
  const slug = pub?.slug || randomUUID();
  const snapshot = {
    ...document,
    id: row.id,
    sample: false,
    attachments: (document.attachments || []).filter((a: { visible: boolean }) => a.visible),
  };
  db.prepare(
    'INSERT INTO publications VALUES(?,?,?,?,?,1) ON CONFLICT(project_id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,published_at=excluded.published_at,is_live=1',
  ).run(slug, row.id, JSON.stringify(snapshot), revision, Date.now());
  res.json({ slug, project: serialize(owned(row.id, req.user!.id)) });
});
projects.delete('/:id/publication', (req, res) => {
  const row = owned(String(req.params.id), req.user!.id);
  db.prepare('UPDATE publications SET is_live=0 WHERE project_id=?').run(row.id);
  res.json({ project: serialize(owned(row.id, req.user!.id)) });
});
export function removeProject(id: string, owner: string) {
  owned(id, owner);
  const files = db
    .prepare(
      'SELECT filename FROM assets WHERE project_id=? UNION SELECT result_filename as filename FROM export_jobs WHERE project_id=? AND result_filename IS NOT NULL',
    )
    .all(id, id) as { filename: string }[];
  transaction(() => {
    db.prepare('DELETE FROM bookmarks WHERE project_id=?').run(id);
    db.prepare('DELETE FROM projects WHERE id=?').run(id);
  });
  return files.map((f) => f.filename);
}
