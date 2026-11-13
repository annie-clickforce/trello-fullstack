// 卡片的輸入驗證，規則見 docs/api.md「卡片」
import { z } from 'zod';

const title = z
  .string({ error: 'Title is required' })
  .trim()
  .min(1, { error: 'Title is required' })
  .max(255, { error: 'Title must be at most 255 characters' });

const description = z
  .string({ error: 'Description must be a string' })
  .max(10000, { error: 'Description must be at most 10000 characters' });

export const createCardSchema = z.object({
  title,
  description: description.optional().default(''),
});

// 所有欄位都是選填；「至少要有一個」在路由裡檢查
export const updateCardSchema = z.object({
  title: title.optional(),
  description: description.optional(),
});
