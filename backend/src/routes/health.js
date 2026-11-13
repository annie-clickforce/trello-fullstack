import { Router } from 'express';
import db from '../db.js';

const router = Router();

// 健康檢查：真的查一次資料庫，連不到時回 503
router.get('/', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ status: 'error' });
  }
});

export default router;
