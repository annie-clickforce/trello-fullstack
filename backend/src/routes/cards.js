// 卡片端點：所有查詢都帶上 user_id，不屬於自己的卡片一律當作不存在（404）
import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createCardSchema, updateCardSchema } from '../schemas/cards.js';

const router = Router();

const STATUSES = ['todo', 'doing', 'done'];
// 回傳給前端的卡片欄位（不含 user_id）
const CARD_FIELDS = ['id', 'title', 'description', 'status', 'position', 'created_at', 'updated_at'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAuth);

// 路徑裡的 id 不是 UUID 格式就不可能存在，不用查資料庫
router.param('id', (req, res, next, id) => {
  if (!UUID_PATTERN.test(id)) return next(new HttpError(404, 'Not found'));
  next();
});

// 查詢條件一開始就帶上擁有者；查不到（不存在或不是自己的）就回 404
async function findOwnedCard(conn, userId, id) {
  const card = await conn('cards').select(CARD_FIELDS).where({ id, user_id: userId }).first();
  if (!card) throw new HttpError(404, 'Not found');
  return card;
}

// 鎖定目前使用者那一列，讓同一個使用者的排序操作一個一個排隊執行
function lockUser(trx, userId) {
  return trx('users').where({ id: userId }).forUpdate().first('id');
}

router.get('/', async (req, res) => {
  const cards = await db('cards')
    .select(CARD_FIELDS)
    .where({ user_id: req.session.userId })
    .orderBy([{ column: 'status' }, { column: 'position' }]);

  const grouped = Object.fromEntries(STATUSES.map((status) => [status, []]));
  for (const card of cards) grouped[card.status].push(card);
  res.json(grouped);
});

router.post('/', async (req, res) => {
  const input = createCardSchema.parse(req.body ?? {});
  const userId = req.session.userId;
  const id = crypto.randomUUID();

  const card = await db.transaction(async (trx) => {
    await lockUser(trx, userId);
    // 新卡片放在待辦最上面：先把原本的待辦卡片往後挪一格。
    // 從最大的開始更新，每一列移動時目標位置都已經空出來，不會撞到唯一約束
    await trx('cards').where({ user_id: userId, status: 'todo' }).orderBy('position', 'desc').increment('position', 1);
    await trx('cards').insert({
      id,
      user_id: userId,
      title: input.title,
      description: input.description,
      status: 'todo',
      position: 0,
    });
    return findOwnedCard(trx, userId, id);
  });

  res.status(201).json(card);
});

router.patch('/:id', async (req, res) => {
  const input = updateCardSchema.parse(req.body ?? {});
  const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  if (Object.keys(fields).length === 0) {
    throw new HttpError(422, 'At least one field is required');
  }

  const userId = req.session.userId;
  await findOwnedCard(db, userId, req.params.id);
  await db('cards')
    .where({ id: req.params.id, user_id: userId })
    .update({ ...fields, updated_at: db.fn.now(3) });

  res.json(await findOwnedCard(db, userId, req.params.id));
});

export default router;
