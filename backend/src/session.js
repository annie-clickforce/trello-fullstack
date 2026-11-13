// Session 設定：存在 MariaDB 的 sessions 表（由 migration 建立）
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import config from './config.js';

const MySQLStore = MySQLStoreFactory(session);

export const SESSION_COOKIE = 'sid';

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
};

const store = new MySQLStore({
  ...config.db,
  createDatabaseTable: false, // 資料表由 migration 管理
  clearExpired: true,
});

export const sessionMiddleware = session({
  name: SESSION_COOKIE,
  secret: config.sessionSecret,
  store,
  resave: false,
  saveUninitialized: false,
  cookie: {
    ...sessionCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  },
});
