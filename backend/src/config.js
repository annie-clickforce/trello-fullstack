// 集中讀取環境變數。必要的值缺少時直接讓程式啟動失敗，不默默使用預設值。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/ 資料夾；FRONTEND_DIST 的相對路徑以這裡為基準，不受啟動時所在目錄影響
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SESSION_SECRET'];

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`缺少必要的環境變數：${missing.join(', ')}`);
}

const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET,
  // 正式環境（HTTPS、在反向代理後面）才打開；本機開發維持預設值
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  // 正式環境由 Express 提供 Vue 建置檔；本機開發不設定，由 Vite 提供前端
  frontendDist: process.env.FRONTEND_DIST
    ? path.resolve(BACKEND_DIR, process.env.FRONTEND_DIST)
    : null,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
};

export default config;
