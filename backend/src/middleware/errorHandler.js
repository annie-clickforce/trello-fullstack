// 找不到的路由與所有錯誤，都轉成 docs/api.md 定義的 JSON 錯誤格式
import { z } from 'zod';
import { HttpError } from '../errors.js';

export function notFound(req, res, next) {
  next(new HttpError(404, 'Not found'));
}

// Express 靠「四個參數」辨認錯誤處理 middleware，next 即使沒用到也不能省略
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { message: err.message };
    if (err.errors) body.errors = err.errors;
    return res.status(err.status).json(body);
  }

  if (err instanceof z.ZodError) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: z.flattenError(err).fieldErrors,
    });
  }

  // express.json() 解析失敗
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON' });
  }

  // 其他由 body parser 標好狀態碼的 4xx（例如 body 太大）
  if (err.status >= 400 && err.status < 500 && err.expose) {
    return res.status(err.status).json({ message: err.message });
  }

  // 非預期錯誤：細節只寫進 log，不回傳給呼叫端
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}
