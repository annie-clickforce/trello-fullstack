// 建立 Express app 並掛上路由。這裡不呼叫 listen()，啟動交給 server.js。
import express from 'express';
import db from './db.js';

const app = express();

// 健康檢查：真的查一次資料庫，連不到時回 503
app.get('/api/v1/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ status: 'error' });
  }
});

export default app;
