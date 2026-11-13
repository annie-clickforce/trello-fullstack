// 建立 Express app 並掛上路由。這裡不呼叫 listen()，啟動交給 server.js。
import express from 'express';

const app = express();

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
