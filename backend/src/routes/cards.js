// 卡片端點：所有查詢都帶上 user_id，不屬於自己的卡片一律當作不存在（404）
import crypto from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createCardSchema, updateCardSchema, STATUSES } from '../schemas/cards.js';
import { lockUser, makeRoomAtTop, moveCard, closeGap } from '../ordering.js';

const router = Router();

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
    // 新卡片放在待辦最上面：先把原本的待辦卡片往後挪一格
    await makeRoomAtTop(trx, userId);
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
  const { title, description, status, position } = input;
  const content = Object.fromEntries(Object.entries({ title, description }).filter(([, v]) => v !== undefined));
  const moving = status !== undefined || position !== undefined;
  if (Object.keys(content).length === 0 && !moving) {
    throw new HttpError(422, 'At least one field is required');
  }

  const userId = req.session.userId;
  const card = await db.transaction(async (trx) => {
    await lockUser(trx, userId);
    // 鎖定之後才讀卡片，拿到的 status／position 才是最新的
    const current = await findOwnedCard(trx, userId, req.params.id);
    if (moving) await moveCard(trx, userId, current, { status, position });
    await trx('cards')
      .where({ id: current.id })
      .update({ ...content, updated_at: trx.fn.now(3) });
    return findOwnedCard(trx, userId, current.id);
  });

  res.json(card);
});

router.delete('/:id', async (req, res) => {
  const userId = req.session.userId;
  await db.transaction(async (trx) => {
    await lockUser(trx, userId);
    const card = await findOwnedCard(trx, userId, req.params.id);
    await trx('cards').where({ id: card.id }).del();
    await closeGap(trx, userId, card);
  });
  res.status(204).end();
});

export default router;
