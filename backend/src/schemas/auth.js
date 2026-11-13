// 註冊與登入的輸入驗證，規則見 docs/api.md「認證」
import { z } from 'zod';

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email is invalid' }).max(255, { error: 'Email must be at most 255 characters' }));

export const registerSchema = z
  .object({
    name: z
      .string({ error: 'Name is required' })
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' }),
    email,
    password: z
      .string({ error: 'Password is required' })
      .min(8, { error: 'Password must be at least 8 characters' })
      .max(128, { error: 'Password must be at most 128 characters' })
      .refine((value) => !/^\d+$/.test(value), { error: 'Password cannot be entirely numeric' }),
  })
  .refine((data) => data.password.toLowerCase() !== data.email, {
    path: ['password'],
    error: 'Password cannot be the same as email',
  });

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Password is required' }).min(1, { error: 'Password is required' }),
});
