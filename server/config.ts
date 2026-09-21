import path from 'node:path';
export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(process.env.DATA_DIR || 'data'),
  production: process.env.NODE_ENV === 'production',
  origin: process.env.PUBLIC_ORIGIN || '',
  secureCookie: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : (process.env.PUBLIC_ORIGIN || '').startsWith('https:'),
  maxUserBytes: Number(process.env.MAX_USER_STORAGE_MB || 500) * 1024 * 1024,
};
if (config.production && !config.origin)
  throw new Error('Production requires PUBLIC_ORIGIN (for example https://example.com).');
if (config.origin && !['http:', 'https:'].includes(new URL(config.origin).protocol))
  throw new Error('PUBLIC_ORIGIN must be an http(s) origin.');
export const cookieName = 'zhanxu_session';
