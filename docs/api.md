# API 規格

## 基本約定

- Base URL：`/api/v1`
- 資料格式：請求與回應皆使用 JSON。有 body 的請求（`POST`／`PATCH`）只接受 `Content-Type: application/json`，其他格式回 `415`；JSON 本身格式錯誤（無法解析）回 `400`。
- 認證：登入後以 HTTP-only Cookie 保存 Session；需要登入的端點必須帶上有效的 Session Cookie，否則回 `401`。
- CSRF：所有 `POST`／`PATCH`／`DELETE` 請求都必須在 `X-CSRF-Token` header 帶上 `csrf_token` Cookie 的值，否則回 `403`（見下方「CSRF」）。
- 日期格式：ISO 8601 UTC 字串，固定到毫秒、以 `Z` 結尾，例如 `2026-11-13T12:00:00.123Z`（就是 JavaScript `Date` 的 `toISOString()` 格式：資料庫的 `DATETIME(3)` 以 UTC 儲存，`mysql2` 設定 `timezone: 'Z'` 後讀出來是 `Date` 物件，`JSON.stringify` 會自動輸出這個格式）。
- 欄位命名：JSON 一律使用 `snake_case`（例如 `created_at`、`password_hash`），與資料庫欄位名稱一致，不另外轉換（JavaScript 程式裡的變數仍用 `camelCase`，只有資料庫欄位與 JSON 欄位用 `snake_case`）。

成功回應使用 `2xx` 狀態碼並直接回傳資源資料；失敗回應統一使用下列格式：

```json
{
  "message": "Validation failed",
  "errors": {
    "title": ["Title is required"]
  }
}
```

沒有欄位錯誤時（例如 `401`、`403`、`404`、`500`），`errors` 可以省略。所有錯誤都由 Express 最後的錯誤處理 middleware 統一轉成這個格式（Zod 的驗證錯誤也在這裡轉成 `errors` 物件）。非預期的伺服器錯誤一律回 `{ "message": "Internal server error" }`，錯誤細節只寫進伺服器 log，不可把錯誤堆疊（stack trace）回傳給呼叫端。找不到的 API 路徑回 `404` 與同樣格式的 JSON（不是 Express 預設的 HTML 頁面）。

## 健康檢查

`GET /health`

不需要登入。真的對資料庫執行一次 `SELECT 1`，成功回傳 `200 OK` 與 `{ "status": "ok" }`；連不到資料庫時回 `503` 與 `{ "status": "error" }`。部署後（VPS 或 Hostinger Cloud）用來確認 API 與資料庫都正常。

## CSRF

`GET /auth/csrf`

不需要登入。回傳 `204 No Content`，並設定 `csrf_token` Cookie（這個 Cookie 不是 HTTP-only，前端需要讀取它）。

運作方式（Synchronizer Token）：

1. 後端用 `crypto.randomBytes(32)` 產生一組隨機 token，存進目前的 Session（未登入的訪客也會因此建立一個 Session），同時寫進 `csrf_token` Cookie。Session 裡已經有 token 時沿用原本的。
2. 前端在送出任何 `POST`／`PATCH`／`DELETE` 之前，先確認有 `csrf_token` Cookie（沒有就先呼叫這支），再把它的值放進 `X-CSRF-Token` header。
3. 後端的 CSRF middleware 對所有 `POST`／`PATCH`／`DELETE`（**包含未登入時的註冊、登入**）比對 header 與 Session 裡的 token，用 `crypto.timingSafeEqual` 比較，不一致或缺少就回 `403`。

別的網站雖然能讓瀏覽器自動帶上 Cookie，但讀不到 Cookie 的內容，也就放不進 header，所以偽造的請求會被擋下。登入成功後會換一個新的 Session 與新的 token（並更新 Cookie），所以前端每次送出請求時都要**重新讀取** Cookie，不要只在啟動時讀一次。

## 認證

登入、註冊有速率限制：同一個 IP 每分鐘最多 5 次，超過回 `429 Too Many Requests`。

### 註冊

`POST /auth/register`

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secure-password"
}
```

回傳 `201 Created` 與新使用者資料（使用者資源格式見下方）。註冊後**不會**自動登入，需另外呼叫登入。

驗證規則：`name` 必填、最多 100 字；`email` 必填、格式正確、最多 255 字、不可重複（去除前後空白並轉小寫後比對）；`password` 至少 8 個、最多 128 個字元，不可全是數字，不可與 email 相同。

email 重複的檢查除了先查一次，還要處理資料庫唯一約束的錯誤（MariaDB／MySQL 錯誤碼 `ER_DUP_ENTRY`，errno `1062`）：兩個請求同時註冊同一個 email 時，先查詢的檢查兩邊都會通過，最後由唯一約束擋下其中一個，這時也要回 `422`，而不是 `500`。

### 登入

`POST /auth/login`

```json
{
  "email": "jane@example.com",
  "password": "secure-password"
}
```

回傳 `200 OK`、設定 Session Cookie，並回傳目前使用者資料。帳號不存在或密碼錯誤時一律回傳 `401 Unauthorized` 與相同訊息（不區分是哪一項錯，避免被猜出哪些 email 有註冊）。

登入成功時先呼叫 `req.session.regenerate()` 更換 Session ID，避免 Session 固定攻擊（session fixation），再把 `userId` 存進新的 Session，並產生新的 CSRF token。

### 登出

`POST /auth/logout`

需要登入。回傳 `204 No Content`，用 `req.session.destroy()` 刪除伺服器端 Session，並清除 Session Cookie 與 `csrf_token` Cookie。

### 目前使用者

`GET /auth/me`

需要登入。回傳 `200 OK` 與目前使用者資料；前端用它判斷登入狀態（路由守衛）。

使用者資源格式（任何回應都不可包含密碼雜湊）：

```json
{
  "id": "uuid",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "created_at": "2026-11-13T12:00:00.123Z"
}
```

## 卡片（Cards）

看板固定分成三欄，每張卡片都屬於其中一欄，用 `status` 表示：

| `status` | 畫面上的欄位 |
| --- | --- |
| `todo` | 待辦 |
| `doing` | 進行中 |
| `done` | 完成 |

欄位是固定的，不能新增、改名或刪除；欄位名稱（待辦、進行中、完成）由前端顯示，API 只用 `status` 的值。

### 共同規則

- 以下所有端點都需要登入。
- 使用者只能存取自己的卡片。**卡片不存在，或存在但不屬於目前使用者，一律回 `404 Not Found`**（不回 `403`）。
- 路徑中的 id 不是合法 UUID 格式時回 `404`。在查資料庫**之前**先檢查格式（例如用 `router.param()` 統一處理），格式不對的 id 不可能存在，不用浪費一次查詢。
- `position` 是卡片在**所屬欄位內**從 `0` 開始的索引，規則見 [database.md](database.md)「排序（position）」。新增的卡片一律放在「待辦」欄最上面（`position = 0`）；移動時超出範圍的值會自動夾在合法範圍內。
- `title` 會先去除前後空白再驗證，去除後為空字串視為未填。

卡片資源格式：

```json
{
  "id": "uuid",
  "title": "設計登入頁",
  "description": "包含錯誤訊息的顯示",
  "status": "todo",
  "position": 0,
  "created_at": "2026-11-13T12:00:00.123Z",
  "updated_at": "2026-11-13T12:00:00.123Z"
}
```

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/cards` | 取得目前使用者的所有卡片，依欄位分組（格式見下方）。 |
| `POST` | `/cards` | 新增卡片，放在「待辦」欄最上面，回傳 `201`。 |
| `PATCH` | `/cards/:id` | 修改標題、說明，或移動位置（含移到另一欄）。 |
| `DELETE` | `/cards/:id` | 刪除卡片，同一欄後面卡片的 `position` 往前補，回傳 `204`。 |

### 取得所有卡片

`GET /cards` 回傳三個欄位各自的卡片陣列，每欄依 `position` 排序。沒有卡片的欄位回傳空陣列（三個 key 一定都在）。用一次查詢取出所有卡片，再在程式裡依 `status` 分組：

```json
{
  "todo": [
    {
      "id": "uuid",
      "title": "設計登入頁",
      "description": "",
      "status": "todo",
      "position": 0,
      "created_at": "2026-11-13T12:00:00.123Z",
      "updated_at": "2026-11-13T12:00:00.123Z"
    }
  ],
  "doing": [],
  "done": []
}
```

### 新增卡片

```json
{
  "title": "設計登入頁",
  "description": "包含錯誤訊息的顯示"
}
```

`title` 必填、最多 255 字；`description` 選填，預設為空字串，最多 10000 字。新卡片固定放在「待辦」欄最上面（`status = "todo"`、`position = 0`），原本的待辦卡片 `position` 各加 1；要放到別欄就新增後再拖過去。

### 修改卡片

所有欄位都是選填，至少要有一個：

```json
{
  "title": "設計登入頁（含錯誤訊息）",
  "description": "",
  "status": "doing",
  "position": 1
}
```

- 只傳 `title`／`description`：修改內容（前端在卡片上直接編輯後送出）。
- 只傳 `position`：在原欄位內調整順序。
- 傳 `status`（可同時傳 `position`）：移到另一欄；沒傳 `position` 時放在目標欄最後面。`status` 只能是 `todo`、`doing`、`done`。
- 移動在單一交易內完成，回傳更新後的卡片。

## 常用狀態碼

| 狀態碼 | 使用時機 |
| --- | --- |
| `200` | 成功讀取或更新資源。 |
| `201` | 成功建立資源。 |
| `204` | 成功完成且沒有回應內容（取得 CSRF Cookie、登出、刪除）。 |
| `400` | 請求 body 不是合法的 JSON。 |
| `401` | 未登入、Session 失效，或登入帳密錯誤。 |
| `403` | CSRF 驗證失敗（缺少或不正確的 `X-CSRF-Token`）。 |
| `404` | 找不到資源，或資源不屬於目前使用者。 |
| `415` | 請求不是 `application/json`。 |
| `422` | 請求欄位驗證失敗。 |
| `429` | 登入／註冊請求過於頻繁。 |
| `500` | 非預期的伺服器錯誤。 |
| `503` | 健康檢查時資料庫無法連線。 |
