// CSRF 防護（Synchronizer Token），流程見 docs/api.md「CSRF」
import crypto from 'node:crypto';
import config from '../config.js';
import { HttpError } from '../errors.js';

export const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const cookieOptions = {
  httpOnly: false, // 前端要讀得到
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

// 確保 Session 裡有 token（沒有就產生一組），並寫進 Cookie
export function issueCsrfToken(req, res, { rotate = false } = {}) {
  if (rotate || !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.cookie(CSRF_COOKIE, req.session.csrfToken, cookieOptions);
}

export function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, cookieOptions);
}

// 所有會改變資料的請求都要比對 header 與 Session 裡的 token
export function verifyCsrf(req, res, next) {
  if (!UNSAFE_METHODS.includes(req.method)) return next();

  const expected = req.session?.csrfToken;
  const received = req.get(CSRF_HEADER);
  if (!expected || !received) {
    return next(new HttpError(403, 'Invalid CSRF token'));
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  // timingSafeEqual 要求長度相同；長度不同本來就不相等
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new HttpError(403, 'Invalid CSRF token'));
  }
  next();
}
