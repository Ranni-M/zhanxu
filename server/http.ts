import type { Request, Response, NextFunction } from 'express';
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type User = { id: string; email: string; name: string };
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, '请先登录。'));
  next();
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败';
}
