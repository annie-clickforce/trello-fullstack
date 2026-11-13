import { HttpError } from '../errors.js';

// 需要登入的路由：Session 裡沒有 userId 就回 401
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return next(new HttpError(401, 'Unauthorized'));
  }
  next();
}
