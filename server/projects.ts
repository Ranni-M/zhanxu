import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { birth, recordActivity } from './activity.ts';
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
/** 没标题、没图、没介绍 = 从没保存过的空草稿（发布拦截和额度回收共用同一个口径） */
export function isEmptyDraft(document: { title?: string; intro?: string; images?: unknown[] }) {
  return !document.title?.trim() && !document.images?.length && !document.intro?.trim();
}
export function owned(id: string, owner: string): ProjectRow {
  const row = db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(id, owner) as
    ProjectRow | undefined;
  if (!row) throw new HttpError(404, '项目不存在或没有访问权限。');
  return row;
}
export function serialize(row: ProjectRow) {
  const publication = db
    .prepare('SELECT slug,revision,is_live,visibility FROM publications WHERE project_id=?')
    .get(row.id) as
    { slug: string; revision: number; is_live: number; visibility: string } | undefined;
  return {
    ...JSON.parse(row.document),
    id: row.id,
    revision: row.revision,
    updatedAt: row.updated_at,
    publishedSlug: publication?.is_live ? publication.slug : undefined,
    publishedRevision: publication?.is_live ? publication.revision : undefined,
    publishedVisibility: publication?.is_live
      ? publication.visibility === 'public'
        ? 'public'
        : 'private'
      : undefined,
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
const templateIds = [
  'editorial',
  'gallery',
  'bold',
  'paper',
  'ink',
  'neon',
  'kraft',
  'mono',
  'cobalt',
] as const;
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
  template: z.enum(templateIds),
  coverIndex: z.number().int().min(0).max(23).default(0),
  skeleton: z
    .enum(['auto', 'stack', 'banner', 'statement', 'split', 'grid', 'type-only'])
    .default('auto'),
  posterSize: z.enum(['a4', 'print', 'story', 'og', 'square']).default('a4'),
  meta: z
    .object({
      school: z.string().max(80).default(''),
      major: z.string().max(80).default(''),
      advisor: z.string().max(80).default(''),
      booth: z.string().max(40).default(''),
      period: z.string().max(60).default(''),
      tagline: z.string().max(120).default(''),
    })
    .default(() => ({ school: '', major: '', advisor: '', booth: '', period: '', tagline: '' })),
  colorways: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().max(24).default(''),
        source: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#808080'),
        hue: z.number().min(-180).max(180),
        saturation: z.number().min(0.5).max(1.5),
        brightness: z.number().min(0.5).max(1.5),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#000000'),
      }),
    )
    .max(8)
    .default([]),
  options: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().max(24).default(''),
        note: z.string().max(200).default(''),
        imageIds: z.array(z.string().uuid()).max(24).default([]),
        colorwayId: z.string().uuid().optional(),
      }),
    )
    .max(6)
    .default([]),
  compares: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().max(40).default(''),
        before: z.string().uuid(),
        after: z.string().uuid(),
      }),
    )
    .max(6)
    .default([]),
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
  // 方案与对比组引用到已删除的图片时静默收敛，不让一次误删把整次保存拦下来
  const colorwayIds = new Set(value.colorways.map((c) => c.id));
  const options = value.options
    .map((option) => ({
      ...option,
      imageIds: option.imageIds.filter((id) => imageIds.has(id)),
      colorwayId:
        option.colorwayId && colorwayIds.has(option.colorwayId) ? option.colorwayId : undefined,
    }))
    .filter((option) => option.label && option.imageIds.length > 0);
  const compares = value.compares.filter(
    (pair) => imageIds.has(pair.before) && imageIds.has(pair.after) && pair.before !== pair.after,
  );
  const coverIndex = Math.min(Math.max(value.coverIndex, 0), Math.max(value.images.length - 1, 0));
  const { revision, ...rest } = value;
  return {
    document: { ...rest, images, attachments, options, compares, coverIndex },
    revision,
  };
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
    .object({ template: z.enum(templateIds).default('editorial') })
    .parse(req.body);
  const count = db
    .prepare('SELECT count(*) as n FROM projects WHERE owner_id=?')
    .get(req.user!.id) as { n: number };
  // 额度满了先把“点了创建、一个字没写”的空草稿回收掉（它们本来也不在作品列表里显示）
  if (count.n >= 100) {
    const rows = db
      .prepare('SELECT id,document FROM projects WHERE owner_id=?')
      .all(req.user!.id) as { id: string; document: string }[];
    const stale = rows.filter((row) => isEmptyDraft(JSON.parse(row.document)));
    const drop = db.prepare('DELETE FROM projects WHERE id=? AND owner_id=?');
    transaction(() => stale.forEach((row) => drop.run(row.id, req.user!.id)));
    count.n -= stale.length;
  }
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
    coverIndex: 0,
    skeleton: 'auto',
    posterSize: 'a4',
    meta: { school: '', major: '', advisor: '', booth: '', period: '', tagline: '' },
    colorways: [],
    options: [],
    compares: [],
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
// 出生证明（创作热力图）。只给项目所有者，服务端算好再下发。
projects.get('/:id/birth', (req, res) => {
  const id = String(req.params.id);
  owned(id, req.user!.id);
  res.json({ birth: birth(id) });
});
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
  recordActivity(id);
  res.json({ project: serialize(owned(id, req.user!.id)) });
});
projects.post('/:id/publish', (req, res) => {
  const row = owned(String(req.params.id), req.user!.id);
  const { revision, visibility } = z
    .object({ revision: z.number().int(), visibility: z.enum(['public', 'private']).optional() })
    .parse(req.body);
  if (row.revision !== revision) throw new HttpError(409, '项目已有新版本，请先刷新。');
  const document = JSON.parse(row.document);
  if (isEmptyDraft(document))
    throw new HttpError(400, '发布前请填写项目名称、介绍，并上传至少一张封面图片。');
  let pub = db
    .prepare('SELECT slug,visibility FROM publications WHERE project_id=?')
    .get(row.id) as { slug: string; visibility: string } | undefined;
  const slug = pub?.slug || randomUUID();
  // 客户端没传就沿用上一次的选择，不会把私密作品意外变回公开
  const nextVisibility = visibility ?? (pub?.visibility === 'private' ? 'private' : 'public');
  const snapshot = {
    ...document,
    id: row.id,
    sample: false,
    attachments: (document.attachments || []).filter((a: { visible: boolean }) => a.visible),
  };
  db.prepare(
    'INSERT INTO publications(slug,project_id,snapshot,revision,published_at,is_live,visibility) VALUES(?,?,?,?,?,1,?) ON CONFLICT(project_id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,published_at=excluded.published_at,is_live=1,visibility=excluded.visibility',
  ).run(slug, row.id, JSON.stringify(snapshot), revision, Date.now(), nextVisibility);
  recordActivity(row.id);
  res.json({ slug, visibility: nextVisibility, project: serialize(owned(row.id, req.user!.id)) });
});
// 不重新发布，只切换已发布作品的公开范围
projects.put('/:id/publication', (req, res) => {
  const row = owned(String(req.params.id), req.user!.id);
  const { visibility } = z.object({ visibility: z.enum(['public', 'private']) }).parse(req.body);
  const result = db
    .prepare('UPDATE publications SET visibility=? WHERE project_id=? AND is_live=1')
    .run(visibility, row.id);
  if (!result.changes) throw new HttpError(404, '这个项目还没有发布。');
  res.json({ visibility, project: serialize(owned(row.id, req.user!.id)) });
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
