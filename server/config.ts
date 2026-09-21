import path from 'node:path';
// 所有体积上限都能用环境变量覆盖；客户端 src/domain/limits.ts 用同一套默认值做前置提示。
const megabytes = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback) * 1024 * 1024;
};
export const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(process.env.DATA_DIR || 'data'),
  production: process.env.NODE_ENV === 'production',
  origin: process.env.PUBLIC_ORIGIN || '',
  secureCookie: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (process.env.PUBLIC_ORIGIN || '').startsWith('https:'),
  maxUserBytes: megabytes(process.env.MAX_USER_STORAGE_MB, 1024),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 600000),
  // 单文件上限；uploads.request 是 multer 的兜底闸门，必须不小于上面几项。
  uploads: {
    image: megabytes(process.env.MAX_IMAGE_MB, 25),
    pdf: megabytes(process.env.MAX_PDF_MB, 60),
    video: megabytes(process.env.MAX_VIDEO_MB, 200),
    archive: megabytes(process.env.MAX_ARCHIVE_MB, 200),
    request: megabytes(process.env.MAX_UPLOAD_MB, 256),
  },
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
};
if (config.production && !config.origin)
  throw new Error('Production requires PUBLIC_ORIGIN (for example https://example.com).');
if (config.origin && !['http:', 'https:'].includes(new URL(config.origin).protocol))
  throw new Error('PUBLIC_ORIGIN must be an http(s) origin.');
export const cookieName = 'zhanxu_session';
export function isAdminEmail(email?: string | null) {
  return Boolean(email) && config.adminEmails.includes(String(email).toLowerCase());
}
