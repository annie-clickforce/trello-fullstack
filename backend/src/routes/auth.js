// 認證相關端點：CSRF、註冊、登入、登出、目前使用者
import crypto from 'node:crypto';
import { Router } from 'express';
import argon2 from 'argon2';
import { rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { HttpError } from '../errors.js';
import { issueCsrfToken, clearCsrfCookie } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../session.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';

const router = Router();

// 回傳給前端的使用者欄位（絕對不包含 password_hash）
const PUBLIC_USER_FIELDS = ['id', 'name', 'email', 'created_at'];

// 帳號不存在時也做一次密碼比對，讓回應時間跟「密碼錯誤」差不多，避免被猜出哪些 email 有註冊。
// 第一次用到時才產生並快取起來；不用 top-level await，因為 Hostinger（LiteSpeed）用 require() 載入程式，
// require() 遇到有 top-level await 的 ESM 會直接失敗（ERR_REQUIRE_ASYNC_MODULE）。
let dummyHashPromise;
function getDummyHash() {
  dummyHashPromise ??= argon2.hash(crypto.randomBytes(16).toString('hex')).catch((error) => {
    dummyHashPromise = undefined; // 失敗就不要快取，下次重試
    throw error;
  });
  return dummyHashPromise;
}

// 每個 IP 每分鐘最多 5 次；註冊與登入各自計算
function authRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Too many requests, please try again later')),
  });
}

function emailTakenError() {
  return new HttpError(422, 'Validation failed', { email: ['Email is already registered'] });
}

function findPublicUser(id) {
  return db('users').select(PUBLIC_USER_FIELDS).where({ id }).first();
}

// express-session 的 regenerate／destroy 是 callback 寫法，包成 Promise 方便 await
function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((error) => (error ? reject(error) : resolve())));
}

router.get('/csrf', (req, res) => {
  issueCsrfToken(req, res);
  res.status(204).end();
});

router.post('/register', authRateLimit(), async (req, res) => {
  const input = registerSchema.parse(req.body ?? {});

  const existing = await db('users').where({ email: input.email }).first('id');
  if (existing) throw emailTakenError();

  const id = crypto.randomUUID();
  const passwordHash = await argon2.hash(input.password);
  try {
    await db('users').insert({ id, name: input.name, email: input.email, password_hash: passwordHash });
  } catch (error) {
    // 兩個請求同時註冊同一個 email：先查詢的檢查都會通過，最後由唯一約束擋下其中一個
    if (error.code === 'ER_DUP_ENTRY') throw emailTakenError();
    throw error;
  }

  res.status(201).json(await findPublicUser(id));
});

router.post('/login', authRateLimit(), async (req, res) => {
  const input = loginSchema.parse(req.body ?? {});

  const user = await db('users').where({ email: input.email }).first('id', 'password_hash');
  const passwordOk = user
    ? await argon2.verify(user.password_hash, input.password)
    : (await argon2.verify(await getDummyHash(), input.password), false);
  if (!passwordOk) throw new HttpError(401, 'Invalid email or password');

  // 更換 Session ID，避免 Session 固定攻擊；新的 Session 也換一組新的 CSRF token
  await regenerateSession(req);
  req.session.userId = user.id;
  issueCsrfToken(req, res, { rotate: true });

  res.json(await findPublicUser(user.id));
});

router.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  clearCsrfCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await findPublicUser(req.session.userId);
  if (!user) {
    // 帳號已經不存在（例如被刪除），這個 Session 也一併作廢
    await destroySession(req);
    throw new HttpError(401, 'Unauthorized');
  }
  res.json(user);
});

export default router;
