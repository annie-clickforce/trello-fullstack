# API 規格

## 基本約定

- Base URL：`/api/v1`
- 資料格式：請求與回應皆使用 JSON。後端只接受 `Content-Type: application/json`，其他格式回 `415`。
- 認證：登入後以 HTTP-only Cookie 保存 Session；需要登入的端點必須帶上有效的 Session Cookie，否則回 `401`。
- CSRF：所有 `POST`／`PATCH`／`DELETE` 請求都必須在 `X-CSRFToken` header 帶上 `csrftoken` Cookie 的值，否則回 `403`（見下方「CSRF」）。
- 日期格式：ISO 8601 UTC 字串，以 `Z` 結尾，例如 `2026-11-13T12:00:00.123456Z`（小數秒位數不固定，前端用 `new Date()` 解析即可）。
- 欄位命名：JSON 一律使用 `snake_case`（例如 `list_id`、`created_at`），與 Python、資料庫的命名一致，不另外轉換。

成功回應使用 `2xx` 狀態碼並直接回傳資源資料；失敗回應統一使用下列格式：

```json
{
  "message": "Validation failed",
  "errors": {
    "title": ["Title is required"]
  }
}
```

沒有欄位錯誤時（例如 `401`、`403`、`404`、`500`），`errors` 可以省略。DRF 預設的錯誤格式跟這個不同（例如 `{"detail": "..."}`），要用自訂的 exception handler 統一轉換。非預期的伺服器錯誤一律回 `{ "message": "Internal server error" }`，不可把錯誤堆疊（stack trace）回傳給呼叫端（正式環境 `DEBUG` 必須是 `False`）。

## 健康檢查

`GET /health`

不需要登入。回傳 `200 OK` 與 `{ "status": "ok" }`；連不到資料庫時回 `503` 與 `{ "status": "error" }`。部署後用來確認 API 與資料庫都正常。

## CSRF

`GET /auth/csrf`

不需要登入。回傳 `204 No Content`，並設定 `csrftoken` Cookie（這個 Cookie 不是 HTTP-only，前端需要讀取它）。

前端在送出任何 `POST`／`PATCH`／`DELETE` 之前，先確認有 `csrftoken` Cookie（沒有就先呼叫這支），再把它的值放進 `X-CSRFToken` header。登入成功後 Django 會更換 CSRF Token，所以每次送出請求時都要**重新讀取** Cookie，不要只在啟動時讀一次。（這跟 Todo 專案 Laravel 版的 `XSRF-TOKEN` 流程是同樣的概念。）

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

驗證規則：`name` 必填、最多 100 字；`email` 必填、格式正確、最多 255 字、不可重複（比對前轉小寫）；`password` 至少 8 個字元，並通過 Django 內建的密碼驗證器（不可太常見、不可全是數字、不可跟 email／名稱太像）。

### 登入

`POST /auth/login`

```json
{
  "email": "jane@example.com",
  "password": "secure-password"
}
```

回傳 `200 OK`、設定 Session Cookie，並回傳目前使用者資料。帳號不存在或密碼錯誤時一律回傳 `401 Unauthorized` 與相同訊息（不區分是哪一項錯，避免被猜出哪些 email 有註冊）。Django 的 `login()` 會自動更換 Session ID，避免 Session 固定攻擊（session fixation）。

### 登出

`POST /auth/logout`

需要登入。回傳 `204 No Content`，刪除伺服器端 Session 並清除 Cookie。

### 目前使用者

`GET /auth/me`

需要登入。回傳 `200 OK` 與目前使用者資料；前端用它判斷登入狀態（路由守衛）。

使用者資源格式（任何回應都不可包含密碼雜湊）：

```json
{
  "id": "uuid",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "created_at": "2026-11-13T12:00:00.123456Z"
}
```

## 看板、列表、卡片的共同規則

- 以下所有端點都需要登入。
- 使用者只能存取自己的看板，以及自己看板底下的列表與卡片。**資源不存在，或存在但不屬於目前使用者，一律回 `404 Not Found`**（不回 `403`）。
- 路徑中的 id 不是合法 UUID 格式時回 `404`（URL 設定使用 `<uuid:id>`，格式不符的路徑根本不會對應到 View）。
- `position` 是從 `0` 開始的索引，規則見 [database.md](database.md)「排序（position）」。新增時一律放在最後面；超出範圍的值會自動夾在合法範圍內。
- `title` 會先去除前後空白再驗證，去除後為空字串視為未填。

## 看板（Boards）

看板資源格式：

```json
{
  "id": "uuid",
  "title": "產品開發",
  "created_at": "2026-11-13T12:00:00.123456Z",
  "updated_at": "2026-11-13T12:00:00.123456Z"
}
```

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/boards` | 取得目前使用者的看板清單，依建立時間由舊到新排序（不含列表與卡片）。 |
| `POST` | `/boards` | 建立看板，回傳 `201`。 |
| `GET` | `/boards/:id` | 取得單一看板，**包含其所有列表與卡片**（格式見下方）。 |
| `PATCH` | `/boards/:id` | 修改看板名稱。 |
| `DELETE` | `/boards/:id` | 刪除看板（連同其列表、卡片），回傳 `204`。 |

建立／修改請求：

```json
{
  "title": "產品開發"
}
```

`title` 必填、最多 100 字。

`GET /boards/:id` 回傳格式（看板頁面一次載入所需的全部資料；列表依 `position` 排序，每個列表裡的卡片也依 `position` 排序）。後端要用 `prefetch_related` 一次查出列表與卡片，避免 N+1 查詢（每個列表各查一次卡片）：

```json
{
  "id": "uuid",
  "title": "產品開發",
  "created_at": "2026-11-13T12:00:00.123456Z",
  "updated_at": "2026-11-13T12:00:00.123456Z",
  "lists": [
    {
      "id": "uuid",
      "board_id": "uuid",
      "title": "待辦",
      "position": 0,
      "created_at": "2026-11-13T12:00:00.123456Z",
      "updated_at": "2026-11-13T12:00:00.123456Z",
      "cards": [
        {
          "id": "uuid",
          "list_id": "uuid",
          "title": "設計登入頁",
          "description": "",
          "position": 0,
          "created_at": "2026-11-13T12:00:00.123456Z",
          "updated_at": "2026-11-13T12:00:00.123456Z"
        }
      ]
    }
  ]
}
```

## 列表（Lists）

列表資源格式：

```json
{
  "id": "uuid",
  "board_id": "uuid",
  "title": "待辦",
  "position": 0,
  "created_at": "2026-11-13T12:00:00.123456Z",
  "updated_at": "2026-11-13T12:00:00.123456Z"
}
```

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/boards/:board_id/lists` | 在看板最後面新增列表，回傳 `201`。看板不屬於目前使用者時回 `404`。 |
| `PATCH` | `/lists/:id` | 修改名稱，或調整在看板內的順序。 |
| `DELETE` | `/lists/:id` | 刪除列表（連同其卡片），後面列表的 `position` 往前補，回傳 `204`。 |

建立請求：

```json
{
  "title": "待辦"
}
```

修改請求（兩個欄位都是選填，至少要有一個）：

```json
{
  "title": "進行中",
  "position": 2
}
```

`title` 最多 100 字。列表只能在同一個看板內調整順序，不能移到別的看板。

## 卡片（Cards）

卡片資源格式：

```json
{
  "id": "uuid",
  "list_id": "uuid",
  "title": "設計登入頁",
  "description": "參考 Todo 專案的登入頁",
  "position": 0,
  "created_at": "2026-11-13T12:00:00.123456Z",
  "updated_at": "2026-11-13T12:00:00.123456Z"
}
```

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/lists/:list_id/cards` | 在列表最後面新增卡片，回傳 `201`。列表不屬於目前使用者時回 `404`。 |
| `GET` | `/cards/:id` | 取得單張卡片（開啟卡片詳細內容時使用）。 |
| `PATCH` | `/cards/:id` | 修改標題、說明，或移動位置（含移到另一個列表）。 |
| `DELETE` | `/cards/:id` | 刪除卡片，同列表後面卡片的 `position` 往前補，回傳 `204`。 |

建立請求：

```json
{
  "title": "設計登入頁",
  "description": "參考 Todo 專案的登入頁"
}
```

`title` 必填、最多 255 字；`description` 選填，預設為空字串，最多 10000 字。

修改請求（所有欄位都是選填，至少要有一個）：

```json
{
  "title": "設計登入頁（含錯誤訊息）",
  "description": "",
  "list_id": "目標列表的 uuid",
  "position": 1
}
```

- 只傳 `position`：在原列表內調整順序。
- 傳 `list_id`（可同時傳 `position`）：移到另一個列表；沒傳 `position` 時放在目標列表最後面。
- 目標列表必須跟卡片在**同一個看板**，否則回 `422`，錯誤欄位為 `list_id`。（別人的列表不可能在同一個看板，所以這個檢查不會洩漏別人的資料是否存在。）
- 移動在單一交易內完成，回傳更新後的卡片。

## 常用狀態碼

| 狀態碼 | 使用時機 |
| --- | --- |
| `200` | 成功讀取或更新資源。 |
| `201` | 成功建立資源。 |
| `204` | 成功完成且沒有回應內容（取得 CSRF Cookie、登出、刪除）。 |
| `401` | 未登入、Session 失效，或登入帳密錯誤。（DRF 預設對未登入回 `403`，要調整成 `401`。） |
| `403` | CSRF 驗證失敗。 |
| `404` | 找不到資源，或資源不屬於目前使用者。 |
| `415` | 請求不是 `application/json`。 |
| `422` | 請求欄位驗證失敗。（DRF 預設回 `400`，要調整成 `422`，跟 Todo 專案一致。） |
| `429` | 登入／註冊請求過於頻繁。 |
| `500` | 非預期的伺服器錯誤。 |
| `503` | 健康檢查時資料庫無法連線。 |

## 範圍之外

忘記密碼／重設密碼、看板成員共享、標籤、到期日、留言等功能不在 MVP 範圍內，見 [architecture.md](architecture.md)「後續規劃」。要開始做時再補上規格。
