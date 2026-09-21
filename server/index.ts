import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import multer from 'multer';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { config } from './config.ts';
import { db } from './db/index.ts';
import { auth, identify } from './auth.ts';
import { projects } from './projects.ts';
import { assets } from './assets.ts';
import { publications } from './publications.ts';
import { exportsApi, startExports, stopExports } from './exports.ts';
import { HttpError } from './http.ts';
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.origin.startsWith('https:') ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.origin.startsWith('https:') ? undefined : false,
  }),
);
app.use(cookieParser());
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('X-Zhanxu-Request') !== '1')
      return next(new HttpError(403, '请求来源无效，请从展序页面操作。'));
    const origin = req.get('Origin');
    const allowed = config.origin
      ? [new URL(config.origin).origin]
      : [
          'http://127.0.0.1:5173',
          'http://localhost:5173',
          'http://127.0.0.1:' + config.port,
          'http://localhost:' + config.port,
        ];
    if (origin && !allowed.includes(origin)) return next(new HttpError(403, '不允许的请求来源。'));
  }
  next();
});
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: process.env.NODE_ENV === 'test' ? 10000 : 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后重试。' },
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(identify);
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', auth);
app.use('/api/projects', projects);
app.use('/api', assets, publications, exportsApi);
app.use('/api', (_req, _res, next) => next(new HttpError(404, '接口不存在。')));
const dist = path.resolve('dist');
if (existsSync(path.join(dist, 'index.html'))) {
  app.use('/assets', (req, res, next) => {
    const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
    if (!['GET', 'HEAD'].includes(req.method) || !['br', 'gzip'].includes(String(encoding)))
      return next();
    const original = path.resolve(dist, 'assets', '.' + req.path);
    if (!original.startsWith(path.join(dist, 'assets') + path.sep)) return next();
    const compressed = original + (encoding === 'br' ? '.br' : '.gz');
    if (!existsSync(compressed)) return next();
    res.set('Content-Encoding', String(encoding));
    res.vary('Accept-Encoding');
    res.type(path.extname(original));
    res.set('Cache-Control', 'public,max-age=31536000,immutable');
    res.sendFile(compressed, (error) => {
      if (error) next(error);
    });
  });
  app.use(express.static(dist, { index: false, maxAge: config.production ? '1h' : 0 }));
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(readFileSync(path.join(dist, 'index.html'), 'utf8'));
  });
}
app.use((error: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError)
    return res.status(400).json({ error: error.issues[0]?.message || '输入内容不符合要求。' });
  if (error instanceof multer.MulterError)
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error:
        error.code === 'LIMIT_FILE_SIZE' ? '文件不能超过100MB。' : '上传失败，每次请选择一个文件。',
    });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: '提交内容过大。' });
  if (error instanceof SyntaxError && (error as any).status === 400)
    return res.status(400).json({ error: '请求内容不是有效JSON。' });
  console.error('Server error:', error.message);
  res.status(500).json({ error: '服务暂时无法完成操作，请稍后重试。' });
});
const server = app.listen(config.port, config.host, () => {
  console.log('ZHANXU server: http://' + config.host + ':' + config.port);
  startExports();
});
server.requestTimeout = 180000;
function shutdown() {
  stopExports();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
