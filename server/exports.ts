import { Router } from 'express';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import { db } from './db/index.ts';
import { owned } from './projects.ts';
import { storedPath } from './assets.ts';
import { HttpError, requireUser } from './http.ts';
let active = false;
let activeWorker: Worker | null = null;
export function stopExports() {
  activeWorker?.terminate();
}
export function startExports() {
  db.prepare("UPDATE export_jobs SET status='queued' WHERE status='running'").run();
  drain();
}
async function drain() {
  if (active) return;
  active = true;
  try {
    for (;;) {
      const job = db
        .prepare("SELECT * FROM export_jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
        .get() as Record<string, any> | undefined;
      if (!job) break;
      db.prepare("UPDATE export_jobs SET status='running',updated_at=? WHERE id=?").run(
        Date.now(),
        job.id,
      );
      const filename = randomUUID() + '.' + (job.format === 'cover' ? 'png' : 'zip');
      try {
        const project = JSON.parse(job.snapshot);
        project.images = project.images.map((image: any) => {
          const asset = db
            .prepare('SELECT filename FROM assets WHERE id=? AND project_id=?')
            .get(image.id, job.project_id) as { filename: string } | undefined;
          if (!asset) throw new Error('项目图片已被删除');
          return { ...image, src: storedPath(asset.filename) };
        });
        await new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL('./export-worker.mjs', import.meta.url), {
            workerData: { project, format: job.format, destination: storedPath(filename) },
          });
          activeWorker = worker;
          let settled = false;
          const timer = setTimeout(() => {
            worker.terminate();
            finish(new Error('导出超时，请减少素材后重试。'));
          }, 120000);
          function finish(error?: Error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            activeWorker = null;
            error ? reject(error) : resolve();
          }
          worker.on('message', (message) =>
            finish(message.ok ? undefined : new Error(message.error)),
          );
          worker.on('error', (error) =>
            finish(error instanceof Error ? error : new Error(String(error))),
          );
          worker.on('exit', (code) => {
            if (!settled) finish(new Error('导出进程退出（' + code + '）'));
          });
        });
        const updated = db
          .prepare(
            "UPDATE export_jobs SET status='succeeded',result_filename=?,error=NULL,updated_at=? WHERE id=?",
          )
          .run(filename, Date.now(), job.id);
        if (!updated.changes) await unlink(storedPath(filename)).catch(() => {});
      } catch (error) {
        db.prepare("UPDATE export_jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(
          error instanceof Error ? error.message : '导出失败',
          Date.now(),
          job.id,
        );
        await unlink(storedPath(filename)).catch(() => {});
      }
    }
  } finally {
    active = false;
  }
}
export const exportsApi = Router();
exportsApi.use(requireUser);
exportsApi.post('/projects/:id/exports', (req, res) => {
  const row = owned(String(req.params.id), req.user!.id);
  const { format, revision } = z
    .object({ format: z.enum(['cover', 'bundle']), revision: z.number().int() })
    .parse(req.body);
  if (revision !== row.revision) throw new HttpError(409, '请先保存最新修改再导出。');
  const project = JSON.parse(row.document);
  if (!project.title || !project.images.length)
    throw new HttpError(400, '请填写标题并上传至少一张图片。');
  let job = db
    .prepare('SELECT * FROM export_jobs WHERE project_id=? AND revision=? AND format=?')
    .get(row.id, revision, format) as Record<string, any> | undefined;
  if (job?.status === 'failed') {
    db.prepare("UPDATE export_jobs SET status='queued',error=NULL WHERE id=?").run(job.id);
  } else if (!job) {
    const id = randomUUID(),
      now = Date.now();
    db.prepare(
      'INSERT INTO export_jobs(id,project_id,revision,format,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
    ).run(id, row.id, revision, format, row.document, now, now);
    job = { id };
  }
  setImmediate(drain);
  res.status(202).json({ id: job.id });
});
exportsApi.get('/jobs/:id', (req, res) => {
  const job = db
    .prepare(
      'SELECT j.id,j.status,j.error,j.format FROM export_jobs j JOIN projects p ON p.id=j.project_id WHERE j.id=? AND p.owner_id=?',
    )
    .get(String(req.params.id), req.user!.id) as Record<string, any> | undefined;
  if (!job) throw new HttpError(404, '导出任务不存在。');
  res.json({
    job: {
      ...job,
      downloadUrl: job.status === 'succeeded' ? '/api/jobs/' + job.id + '/download' : null,
    },
  });
});
exportsApi.get('/jobs/:id/download', (req, res, next) => {
  const job = db
    .prepare(
      'SELECT j.*,p.document FROM export_jobs j JOIN projects p ON p.id=j.project_id WHERE j.id=? AND p.owner_id=?',
    )
    .get(String(req.params.id), req.user!.id) as Record<string, any> | undefined;
  if (!job || job.status !== 'succeeded') throw new HttpError(404, '导出文件尚未生成。');
  const title = JSON.parse(job.snapshot).title;
  res.set('Cache-Control', 'private, no-store');
  res.download(
    storedPath(job.result_filename),
    title + (job.format === 'cover' ? '-封面.png' : '-图文展示包.zip'),
    (error) => {
      if (error) next(error);
    },
  );
});
