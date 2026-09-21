import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { db, transaction } from './db/index.ts';
import { config, cookieName } from './config.ts';
import { HttpError, requireUser } from './http.ts';
const hashToken = (s: string) => createHash('sha256').update(s).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
async function hashPassword(password: string) {
  const salt = randomBytes(24).toString('hex');
  return salt + ':' + (await derive(password, salt)).toString('hex');
}
async function verify(password: string, encoded: string) {
  const [salt, value] = encoded.split(':');
  const expected = Buffer.from(value, 'hex');
  const actual = await derive(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.secureCookie,
  path: '/',
};
function session(res: Response, userId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = Date.now() + 7 * 86400000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token), userId, expires);
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: 7 * 86400000 });
}
export function identify(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string' && token.length === 64) {
    const user = db
      .prepare(
        'SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
      )
      .get(hashToken(token), Date.now());
    if (user) req.user = user as { id: string; email: string; name: string };
  }
  next();
}
export const auth = Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: '尝试次数过多，请稍后再试。' },
});
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, '密码至少需要 10 个字符。').max(128),
});
auth.get('/me', (req, res) => res.json({ user: req.user || null }));
auth.post('/register', authLimit, async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false')
    throw new HttpError(403, '当前站点暂不开放注册。');
  const input = credentials.extend({ name: z.string().trim().min(1).max(40) }).parse(req.body);
  if (db.prepare('SELECT id FROM users WHERE email=?').get(input.email))
    throw new HttpError(409, '这个邮箱已注册，请直接登录。');
  const user = { id: randomUUID(), email: input.email, name: input.name };
  const encoded = await hashPassword(input.password);
  try {
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
      user.id,
      user.email,
      user.name,
      encoded,
      Date.now(),
    );
  } catch {
    throw new HttpError(409, '这个邮箱已注册，请直接登录。');
  }
  session(res, user.id);
  res.status(201).json({ user });
});
auth.post('/login', authLimit, async (req, res) => {
  const input = credentials.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(input.email) as
    { id: string; email: string; name: string; password_hash: string } | undefined;
  const placeholder = '0'.repeat(48) + ':' + '0'.repeat(128);
  if (!(await verify(input.password, user?.password_hash || placeholder)) || !user)
    throw new HttpError(401, '邮箱或密码不正确。');
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string')
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  session(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});
auth.post('/logout', (req, res) => {
  const token = req.cookies?.[cookieName];
  if (typeof token === 'string')
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  res.clearCookie(cookieName, cookieOptions);
  res.json({ ok: true });
});
auth.post('/password', requireUser, authLimit, async (req, res) => {
  const input = z
    .object({ currentPassword: z.string().max(128), password: z.string().min(10).max(128) })
    .parse(req.body);
  const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user!.id) as {
    password_hash: string;
  };
  if (!(await verify(input.currentPassword, user.password_hash)))
    throw new HttpError(400, '当前密码不正确。');
  const encoded = await hashPassword(input.password);
  transaction(() => {
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded, req.user!.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user!.id);
  });
  session(res, req.user!.id);
  res.json({ ok: true });
});
