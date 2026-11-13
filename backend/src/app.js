// 建立 Express app、掛上 middleware 與路由。這裡不呼叫 listen()，啟動交給 server.js。
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import config from './config.js';
import { sessionMiddleware } from './session.js';
import { requireJson } from './middleware/requireJson.js';
import { verifyCsrf } from './middleware/csrf.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import cardsRouter from './routes/cards.js';

const app = express();

// 在反向代理（Hostinger）後面時才設定，才拿得到使用者真正的 IP；本機開發維持 0
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.use(helmet());
app.use(requireJson);
app.use(express.json());
app.use(sessionMiddleware);
app.use(verifyCsrf);

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/cards', cardsRouter);

// 正式環境：同一個 Express 提供 Vue 建置檔，前後端同網域，不需要 CORS
if (config.frontendDist) {
  app.use(express.static(config.frontendDist));

  // 前端路由（例如重新整理 /login）一律回 index.html，交給 Vue Router。
  // /api 開頭與有副檔名的路徑（找不到的靜態檔）不處理，交給 notFound 回 JSON 404。
  app.use((req, res, next) => {
    const isApi = req.path === '/api' || req.path.startsWith('/api/');
    const isFile = path.extname(req.path) !== '';
    if (!['GET', 'HEAD'].includes(req.method) || isApi || isFile) return next();
    res.sendFile(path.join(config.frontendDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
