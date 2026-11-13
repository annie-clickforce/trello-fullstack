// 建立 Express app、掛上 middleware 與路由。這裡不呼叫 listen()，啟動交給 server.js。
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

// 在反向代理（Caddy）後面時才設定，才拿得到使用者真正的 IP；本機開發維持 0
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

app.use(helmet());
app.use(requireJson);
app.use(express.json());
app.use(sessionMiddleware);
app.use(verifyCsrf);

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/cards', cardsRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
