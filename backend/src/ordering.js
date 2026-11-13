// 卡片排序邏輯，步驟見 docs/database.md「排序（position）」。
//
// 規則：同一個使用者、同一欄（status）裡的 position 是從 0 開始的連續整數。
// 所有函式都要在交易裡、而且先呼叫 lockUser() 之後才能使用。
//
// MariaDB 的唯一約束每更新一列就檢查一次，所以批次更新一定要指定順序：
// 往後挪（+1）從最大的開始，往前補（-1）從最小的開始，每一列移動時目標位置都已經空出來。

// 鎖定目前使用者那一列，讓同一個使用者的排序操作一個一個排隊執行
export function lockUser(trx, userId) {
  return trx('users').where({ id: userId }).forUpdate().first('id');
}

async function countInColumn(trx, userId, status) {
  const row = await trx('cards').where({ user_id: userId, status }).count({ n: '*' }).first();
  return Number(row.n);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// 把某一欄 position >= from 的卡片往後挪一格（排除 excludeId）
function shiftDown(trx, userId, status, from, excludeId) {
  const query = trx('cards').where({ user_id: userId, status }).andWhere('position', '>=', from);
  if (excludeId) query.whereNot({ id: excludeId });
  return query.orderBy('position', 'desc').increment('position', 1);
}

// 把某一欄 position > from 的卡片往前補一格（排除 excludeId）
function shiftUp(trx, userId, status, from, excludeId) {
  const query = trx('cards').where({ user_id: userId, status }).andWhere('position', '>', from);
  if (excludeId) query.whereNot({ id: excludeId });
  return query.orderBy('position', 'asc').decrement('position', 1);
}

// 新增卡片前：把待辦欄的卡片全部往後挪一格，讓出 position 0
export function makeRoomAtTop(trx, userId) {
  return shiftDown(trx, userId, 'todo', 0);
}

// 移動卡片。target.status 沒給就留在原欄；target.position 沒給時，換欄放到最後面、同欄不動
export async function moveCard(trx, userId, card, target) {
  const fromStatus = card.status;
  const toStatus = target.status ?? fromStatus;
  const from = card.position;
  const n = await countInColumn(trx, userId, fromStatus);

  if (toStatus === fromStatus) {
    if (target.position === undefined) return;
    const to = clamp(target.position, 0, n - 1);
    if (to === from) return;

    // 先把卡片停到一定沒人用的位置 n，讓出原本的位置
    await trx('cards').where({ id: card.id }).update({ position: n });
    await shiftUp(trx, userId, fromStatus, from, card.id);
    await shiftDown(trx, userId, fromStatus, to, card.id);
    await trx('cards').where({ id: card.id }).update({ position: to });
    return;
  }

  const m = await countInColumn(trx, userId, toStatus);
  const to = clamp(target.position ?? m, 0, m);

  // 原欄：卡片先停到 n，後面的往前補
  await trx('cards').where({ id: card.id }).update({ position: n });
  await shiftUp(trx, userId, fromStatus, from, card.id);
  // 目標欄：騰出 to 這個位置，再把卡片放進去
  await shiftDown(trx, userId, toStatus, to);
  await trx('cards').where({ id: card.id }).update({ status: toStatus, position: to });
}

// 刪除卡片後：同一欄後面的卡片往前補一格
export function closeGap(trx, userId, card) {
  return shiftUp(trx, userId, card.status, card.position);
}
