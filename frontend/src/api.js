// 包裝 fetch：統一 /api/v1 前綴、JSON、CSRF token 與錯誤格式

const BASE = '/api/v1';
const CSRF_COOKIE = 'csrf_token';

export class ApiError extends Error {
  constructor(status, message, errors = {}) {
    super(message);
    this.status = status;
    this.errors = errors; // { 欄位: [訊息, ...] }
  }
}

// 後端訊息是英文，畫面上顯示中文
const MESSAGES = {
  'Invalid email or password': 'Email 或密碼錯誤',
  'Email is already registered': '這個 Email 已經註冊過了',
  'Email is required': '請輸入 Email',
  'Email is invalid': 'Email 格式不正確',
  'Name is required': '請輸入名稱',
  'Name must be at most 100 characters': '名稱最多 100 個字',
  'Password is required': '請輸入密碼',
  'Password must be at least 8 characters': '密碼至少要 8 個字元',
  'Password must be at most 128 characters': '密碼最多 128 個字元',
  'Password cannot be entirely numeric': '密碼不能全是數字',
  'Password cannot be the same as email': '密碼不能跟 Email 相同',
  'Title is required': '請輸入標題',
  'Title must be at most 255 characters': '標題最多 255 個字',
  'Description must be at most 10000 characters': '說明最多 10000 個字',
  'Too many requests, please try again later': '嘗試次數太多，請稍後再試',
  'Not found': '找不到這張卡片，可能已經被刪除',
  'Internal server error': '伺服器發生錯誤，請稍後再試',
};
export const translate = (message) => MESSAGES[message] ?? message;

let onUnauthorized = () => {};
// 由 main.js 設定：Session 失效時要做的事（導向登入頁）
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function readCookie(name) {
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function refreshCsrfToken() {
  await fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' });
}

async function send(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    if (!readCookie(CSRF_COOKIE)) await refreshCsrfToken();
    // 每次都重新讀取：登入後 token 會更換
    headers['X-CSRF-Token'] = readCookie(CSRF_COOKIE) ?? '';
  }
  return fetch(BASE + path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiFetch(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await send(method, path, body);
    // CSRF token 失效（例如 Session 已過期）：重新取得一次再試
    if (res.status === 403 && method !== 'GET') {
      await refreshCsrfToken();
      res = await send(method, path, body);
    }
  } catch {
    throw new ApiError(0, '無法連線到伺服器，請稍後再試');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errors = Object.fromEntries(
      Object.entries(data?.errors ?? {}).map(([field, list]) => [field, list.map(translate)]),
    );
    const error = new ApiError(res.status, translate(data?.message ?? '發生錯誤，請稍後再試'), errors);
    // 登入失敗與檢查登入狀態的 401 由呼叫端自己處理，其他的代表 Session 失效
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthorized();
    throw error;
  }
  return data;
}
