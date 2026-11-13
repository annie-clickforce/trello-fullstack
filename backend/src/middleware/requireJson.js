import { HttpError } from '../errors.js';

// 有 body 的 POST／PATCH 只接受 application/json，其他格式回 415
export function requireJson(req, res, next) {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0');

  if (['POST', 'PATCH'].includes(req.method) && hasBody && !req.is('application/json')) {
    return next(new HttpError(415, 'Content-Type must be application/json'));
  }
  next();
}
