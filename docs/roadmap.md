# 開發路線圖

本文件將 Trello MVP（見 [architecture.md](architecture.md)「第一階段範圍」）拆成可以一步一步完成、每步都能獨立驗證的小任務。建議一次只做一步，做完就實際測試（curl、Postman、瀏覽器、DBeaver 或自動化測試）再進到下一步。

> 標記說明：完成並實際測過的步驟，在標題或步驟前加上 ✅️。

> **參考 Todo 專案**：本專案是全新建立，不從 `todo-fullstack` 複製檔案，但很多觀念可以直接對照。每個階段開頭的「📖 參考」列出可以回去看的地方。Todo 的 `backend/`（Express + `pg` + `express-session` + `connect-pg-simple`）跟本專案用的套件幾乎一樣，可以直接對照寫法；Laravel 版的概念對照如下：

| Laravel（Todo） | Express（本專案） |
| --- | --- |
| `routes/api.php` | `express.Router()`（`src/routes/`） |
| Controller | 路由的處理函式 |
| Eloquent Model | Knex 查詢（沒有 Model 類別，直接寫查詢） |
| `$request->validate([...])` | Zod schema |
| `php artisan make:migration` + `migrate` | `npx knex migrate:make` + `npm run migrate` |
| `php artisan tinker` | `node`（REPL）或 DBeaver／`psql` |
| Sanctum SPA Cookie 認證 | `express-session` + 自己寫的 CSRF middleware |
| `throttle:5,1` | `express-rate-limit` |
| `auth:sanctum` middleware | 自己寫的 `requireAuth` middleware |
| `composer.json` | `package.json` |

> **測試原則**：從第三階段開始，每做完一支 API 就補上對應的自動化測試，並確認 CI 通過才算完成這一步。尤其「別人的資料要回 `404`」每支端點都要有測試。

## 第一階段：專案初始化與本機環境

📖 參考：`todo-fullstack/docker-compose.yml`、`todo-fullstack/.env.example`、`todo-fullstack/backend/`（Express 版的 `package.json`、`Dockerfile`、`src/server.js` 與 `src/app.js` 的拆法）

1. ✅️ 建立 `trello-fullstack` 資料夾並 `git init`，加上 `.gitignore`（至少排除 `.env`、`node_modules/`、`dist/`、`coverage/`）。在 GitHub 建立新的 repository 並推上去。
2. 建立後端：在 `backend/` 執行 `npm init -y`，`package.json` 加上 `"type": "module"`，安裝 `express`（5.x）、`knex`、`pg`；寫 `backend/Dockerfile`（`node:24-alpine`，先複製 `package*.json` 執行 `npm ci`，再複製程式碼）與 `.dockerignore`（排除 `node_modules`）。（之前為 Django 建立的 `requirements.txt` 與 Python 版 `Dockerfile` 要移除。）
3. 寫最小的 `src/app.js`（建立 Express app 並匯出，先只有 `GET /api/v1/health` 回 `{ "status": "ok" }`）與 `src/server.js`（import app、讀 `PORT` 環境變數（預設 `3000`）並 `listen`）。`package.json` 的 scripts 加上 `dev`（`node --watch src/server.js`）與 `start`（`node src/server.js`）。
4. 寫 `docker-compose.yml`：`db`（`postgres:17`，對外 port `5433`，加上資料卷）、`api`（`npm run dev`，對外 port `3021` 對應容器內的 `3000`，掛載原始碼）。資料庫連線、`SESSION_SECRET`、`NODE_ENV` 都讀環境變數，集中在 `src/config.js` 讀取並檢查（缺少必要的值就直接啟動失敗，不要默默用預設值），根目錄寫 `.env.example`。
5. 寫 `knexfile.js`（連線讀 `DATABASE_URL`、migration 資料夾 `migrations/`）與 `src/db.js`（建立 Knex 實例）；scripts 加上 `migrate`（`knex migrate:latest`）。
6. 驗證：`docker compose up --build` 後，`curl http://localhost:3021/api/v1/health` 回 `{"status":"ok"}`；改一下回傳內容，確認 `node --watch` 會自動重啟。
7. 建立前端：`npm create vite@latest frontend -- --template vue`，安裝 `vue-router`；寫 `frontend/Dockerfile`，在 `docker-compose.yml` 加上 `frontend` 服務（port `3020`）。
8. 在 `frontend/vite.config.js` 設定開發伺服器 proxy：`/api` 轉發到 `http://api:3000`。前端呼叫 API 時一律用相對路徑 `/api/v1/...`。
9. 驗證：瀏覽器開 `http://localhost:3020` 看到 Vue 預設畫面；DBeaver 用 `localhost:5433` 連得進 PostgreSQL。

> **已知問題（Todo 專案踩過）**：Windows 上 Docker 掛載的資料夾，檔案變更通知有時候傳不進容器，`node --watch` 不會自動重啟。改完後端程式打 API 發現行為沒變，先 `docker compose restart api` 再測。

## 第二階段：資料庫與 migration

📖 參考：`todo-fullstack/docs/database.md`（UUID、UTC 的決策理由）、`todo-fullstack/backend/db/migrations/`（Express 版用純 SQL 寫的 migration，可以跟 Knex 的寫法對照）

10. 用 `npx knex migrate:make create_users` 建立第一個 migration，依 [database.md](database.md) 建立 `users` 表：`id` 用 `uuid` 並預設 `gen_random_uuid()`、`email` 唯一、`password_hash`、`created_at`／`updated_at` 用 `timestamptz` 並預設 `now()`。記得寫 `down`。
11. 建立 `session` 表的 migration（`connect-pg-simple` 用的結構：`sid` 主鍵、`sess`、`expire` 與其索引）。
12. 執行 `npm run migrate`，用 DBeaver 確認兩張表的欄位與型別符合 database.md（`id` 是 `uuid`、時間是 `timestamptz`）。再執行一次 `npx knex migrate:rollback` 確認能還原，然後重新 migrate。
13. 讓 `GET /api/v1/health` 真的查一次資料庫（`SELECT 1`），成功回 `200`，失敗回 `503`。驗證：`docker compose stop db` 後打 health 會回 `503`。

## 第三階段：測試與 CI 基礎

> **為什麼這麼早做**：Todo 專案一直沒有自動化測試，只能手動測。測試環境越早建好，之後每一步都能順手補測試，而不是最後才一次補（通常就不會補了）。

14. 安裝開發用套件：`vitest`、`supertest`、`eslint`（含 `@eslint/js`、`globals`）、`prettier`、`eslint-config-prettier`；寫 `eslint.config.js`、`.prettierrc`；scripts 加上 `test`（`vitest run`）、`lint`（`eslint . && prettier --check .`）、`format`（`prettier --write .`）。
15. 設定測試資料庫：測試使用 `TEST_DATABASE_URL`（例如 `trello_test`，可以在 `db` 容器的初始化腳本建立）。在 Vitest 的 global setup 跑一次 migration，每個測試開始前清空資料表（`TRUNCATE ... CASCADE`）。測試共用同一個資料庫，所以在 `vitest.config.js` 關閉檔案平行執行（`fileParallelism: false`）。
16. 寫第一個測試：用 Supertest 對 `app` 發 `GET /api/v1/health`，確認回 `200` 與 `{ "status": "ok" }`。用 `docker compose exec api npm test` 執行。
17. 執行 `npm run lint`，修掉所有警告。
18. 寫 `.github/workflows/ci.yml`：在 GitHub Actions 啟動 PostgreSQL 17 服務容器，安裝 Node.js 24，依序執行 `npm ci`、`npm run lint`、`npm test`。
19. 驗證：push 後在 GitHub 的 Actions 分頁看到綠勾；故意改壞一個測試再 push，確認會變紅叉，再改回來。

## 第四階段：先部署一次最小版本到 VPS

📖 參考：`todo-fullstack/docs/deployment-roadmap-aws.md`（自己架伺服器的流程，跟 VPS 幾乎一樣）、`todo-fullstack/docs/deployment-roadmap.md`（網域 DNS 設定）

> **為什麼這麼早部署**：VPS 從零開始架設是本專案最陌生的部分。現在程式碼最少，出問題最好查；之後每完成一個功能就部署一次，不會等到最後才一次面對所有問題。

> 本階段完成後，把實際做過的完整步驟整理成 `docs/deployment-roadmap.md`（寫法比照 Todo 專案，每步都有驗證方式），之後的部署照著做。

### 4-1　購買與基本安全設定

20. 購買 Hostinger VPS KVM 1，作業系統選 **Ubuntu 24.04 LTS**（如果有內建 Docker 的範本就選它）。在本機產生 SSH 金鑰（`ssh-keygen -t ed25519`），把公鑰加到 hPanel 的 VPS 設定。記下 VPS 的 IP（記在不進版本控制的 `docs/deployment-info.md`，並加入 `.gitignore`）。
21. 用 root SSH 登入，建立一個一般使用者並給 `sudo` 權限，把 SSH 公鑰也複製給這個使用者。**先開一個新的終端機確認新使用者能用金鑰登入**，再進行下一步。
22. 修改 SSH 設定：禁止 root 登入（`PermitRootLogin no`）、禁止密碼登入（`PasswordAuthentication no`），重新啟動 SSH。一樣**保留原本的連線不要關**，另開終端機確認還登得進去，避免把自己鎖在外面。
23. 開啟防火牆 ufw：只允許 `22`（SSH）、`80`、`443`，然後 `ufw enable`。驗證：`ufw status` 只有這三個連接埠。
24. 開啟自動安全更新（`unattended-upgrades`），讓系統自動安裝安全性修補。
25. 安裝 Docker（範本已內建就跳過），驗證：`docker run hello-world` 成功。

### 4-2　網域與正式環境設定

26. 到網域的 DNS 設定新增一筆 A 紀錄，指向 VPS 的 IP（例如 `trello.你的網域`）。驗證：`nslookup trello.你的網域` 回傳 VPS 的 IP（DNS 生效可能需要幾分鐘到幾小時）。
27. 確認 API 的正式環境啟動方式：`NODE_ENV=production`、用 `npm start`（`node src/server.js`，不用 `--watch`）；Dockerfile 的正式環境映像檔用 `npm ci --omit=dev`，不安裝測試與 lint 工具。
28. 寫 `Caddyfile`：網域、`/api/*` 反向代理到 `api:3000`，其他路徑提供前端靜態檔並在找不到檔案時回 `index.html`。
29. 寫 `docker-compose.prod.yml`：`caddy`（只有它開放 `80`／`443`，映像檔建置時先用 Node 編譯前端再複製進去）、`api`（`npm start`，**不開放連接埠**）、`db`（**不開放連接埠**，資料卷保存資料）。Caddy 的憑證資料也要用資料卷保存，否則每次重建都要重新申請。
30. 正式環境的 Express 設定（由 `NODE_ENV` 與環境變數控制）：`app.set('trust proxy', 1)`（API 在 Caddy 後面，要靠這個才拿得到使用者真正的 IP，並判斷原始請求是 HTTPS）、Session Cookie 設定 `secure: true`、`httpOnly: true`、`sameSite: 'lax'`；`csrf_token` Cookie 也設 `secure`。錯誤處理 middleware 在正式環境絕對不回傳錯誤細節。

### 4-3　部署與驗證

31. 在 VPS 上 `git clone` 專案，建立正式環境的 `.env`（`SESSION_SECRET` 用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 產生新的、資料庫密碼也另外產生，不要跟開發環境共用）。
32. `docker compose -f docker-compose.prod.yml up -d --build`，接著執行 `docker compose -f docker-compose.prod.yml exec api npm run migrate`。
33. 驗證：
    - `https://trello.你的網域/api/v1/health` 回 `200`，瀏覽器網址列顯示安全的 HTTPS。
    - `https://trello.你的網域/` 看得到 Vue 畫面。
    - 從自己的電腦連 VPS 的 `5432`、`3000` 連接埠都會失敗（代表資料庫與 API 沒有直接對外開放）。
34. 檢查正式環境的回應：`curl -i` 打一個不存在的 API 路徑與一個會出錯的情境，確認回的是 JSON 錯誤格式、沒有錯誤堆疊，也沒有 `X-Powered-By: Express` 標頭（用 `helmet` 或 `app.disable('x-powered-by')` 關掉）。

## 第五階段：使用者認證（註冊、登入、登出）

📖 參考：`todo-fullstack/backend/src/app.js`（Express 版的 `express-session` + `connect-pg-simple` 設定與 `requireAuth`）、`todo-fullstack/backend-laravel/app/Http/Controllers/AuthController.php`、`todo-fullstack/frontend/src/api.js`（CSRF Cookie 的處理流程）

35. 安裝 `helmet`、`express-session`、`connect-pg-simple`、`argon2`、`zod`、`express-rate-limit`。設定全域 middleware：`helmet()`、`express.json()`、Content-Type 檢查（`POST`／`PATCH` 不是 `application/json` 回 `415`）、`express-session`（store 用 `connect-pg-simple`、`secret` 讀 `SESSION_SECRET`、`resave: false`、`saveUninitialized: false`、Cookie `httpOnly`）。
36. 寫錯誤處理：定義一個帶狀態碼的錯誤類別（例如 `HttpError(status, message, errors)`），以及最後的錯誤處理 middleware，把 `HttpError`、Zod 驗證錯誤（轉成 `422` 與 `errors` 物件）、JSON 解析錯誤（`400`）、其他未預期錯誤（`500`，只記 log）統一轉成 [api.md](api.md) 的格式；找不到的路由回 JSON 的 `404`。先為這些情況寫測試。
37. 寫 CSRF middleware 與 `GET /auth/csrf`（流程見 [api.md](api.md)「CSRF」）：token 存在 Session 並寫進 `csrf_token` Cookie，所有 `POST`／`PATCH`／`DELETE` 都比對 `X-CSRF-Token` header，**包含未登入時的註冊與登入**。
38. 寫 `requireAuth` middleware：Session 裡沒有 `userId` 就回 `401`。
39. 實作 `POST /auth/register`：用 Zod 驗證欄位（email 去空白、轉小寫），密碼用 `argon2.hash()` 雜湊後寫入，回傳 `201`（不含 `password_hash`）。email 重複時回 `422`，並處理同時註冊時資料庫唯一約束的錯誤（錯誤碼 `23505`）。
40. 實作 `POST /auth/login`：查出使用者後用 `argon2.verify()` 比對密碼；成功後 `req.session.regenerate()` 更換 Session ID，存入 `userId`、產生新的 CSRF token，回傳使用者資料；失敗一律回 `401` 與相同訊息（帳號不存在時也要花差不多的時間，可以對一個假的雜湊值做一次 `verify`，避免從回應時間猜出帳號是否存在）。
41. 實作 `GET /auth/me` 與 `POST /auth/logout`（`req.session.destroy()`，清除 Cookie，回 `204`）。
42. 速率限制：登入、註冊加上 `express-rate-limit`（每個 IP 每分鐘 5 次，超過回 `429` 與 API 的錯誤格式）。記得第 30 步的 `trust proxy` 設定，否則正式環境所有請求看起來都來自 Caddy 的 IP，會一起被擋。
43. 測試（Vitest + Supertest）至少涵蓋：註冊成功、email 重複、email 大小寫視為同一個、密碼太短；登入成功、密碼錯誤、帳號不存在（兩者訊息相同）；未登入打 `/auth/me` 回 `401`；登出後 `/auth/me` 回 `401`；沒帶 CSRF Token 的登入請求回 `403`；回應裡沒有 `password_hash`；第 6 次登入回 `429`。用 `supertest.agent(app)` 讓同一個測試裡的請求共用 Cookie。
44. 手動用 curl 或 Postman 走一次：取得 CSRF Cookie → 註冊 → 登入 → `/auth/me` → 登出。並在 DBeaver 確認 `users` 有新資料、`password_hash` 是 `$argon2id$` 開頭，`session` 表有寫入。

## 第六階段：看板 CRUD

📖 參考：`todo-fullstack/backend-laravel/app/Http/Controllers/TodoController.php`、`todo-fullstack/backend/src/app.js`（「只查自己的資料、別人的回 404」的寫法）

45. 寫 `boards` 表的 migration（`owner_id` 外鍵 `ON DELETE CASCADE`、`(owner_id, created_at)` 索引），跑 migration 並用 DBeaver 確認。
46. 寫路徑 id 的 UUID 格式檢查（`router.param()`），不合法直接回 `404`；寫 `findOwnedBoard(db, userId, id)`，查詢條件一律帶上 `owner_id`。建立時由後端填入 `owner_id`（取自 Session），不接受前端傳。
47. 實作 `GET /boards`、`POST /boards`、`GET /boards/:id`（先只回看板本身）、`PATCH /boards/:id`（記得更新 `updated_at`）、`DELETE /boards/:id`。
48. 測試：每支端點的成功情境；`title` 空白、超過 100 字回 `422`；id 不是 UUID 回 `404`；**用第二個使用者查、改、刪第一個使用者的看板都回 `404`**；`GET /boards` 只會看到自己的看板。
49. 部署到 VPS（照 `docs/deployment-roadmap.md`，記得跑 migration），在正式環境用 curl 簡單測一次。

## 第七階段：列表 CRUD 與排序

50. 寫 `lists` 表的 migration（含延遲檢查的唯一約束 `uniq_list_position` 與 `position >= 0` 的檢查，見 [database.md](database.md)），跑 migration 後用 DBeaver 確認約束有建立（`DEFERRABLE INITIALLY DEFERRED`）。
51. 寫 `src/ordering.js`：一個「把某個項目移到新位置」的函式（處理夾範圍、補空位、騰空位），以及「刪除後往前補」的函式。函式接收交易物件 `trx`、資料表名稱與父層條件（例如 `{ board_id }`），給列表與卡片共用。
52. 先為 `ordering.js` 寫測試：往前移、往後移、移到原位置、移到最前面、移到最後面、超出範圍被夾住、刪除中間的項目。每個測試都檢查結果的 position 是連續的 0～n-1。
53. 實作 `POST /boards/:board_id/lists`（看板要屬於自己，否則 `404`；在交易裡鎖定看板後，position = 目前列表數量）。
54. 實作 `PATCH /lists/:id`（改名稱、調整 position；調整時在 `db.transaction()` 裡先用 `forUpdate()` 鎖定看板）與 `DELETE /lists/:id`。
55. 補上 `GET /boards/:id` 回傳 `lists`（依 position 排序）。
56. 測試：所有列表端點的跨帳號 `404`；建 4 個列表後各種移動，確認 API 回傳與資料庫的順序都正確；同時送出多個新增列表的請求（`Promise.all`），確認 position 依然連續、沒有請求失敗。

## 第八階段：卡片 CRUD 與移動

57. 寫 `cards` 表的 migration（同樣的延遲唯一約束 `uniq_card_position`），跑 migration。
58. 實作 `POST /lists/:list_id/cards`（擁有權要追到看板）與 `GET /cards/:id`。
59. 實作 `PATCH /cards/:id` 修改 `title`／`description`，以及同列表內調整 `position`（用 `ordering.js`）。
60. 加上跨列表移動（`list_id` + `position`）：確認目標列表跟卡片在同一個看板（否則 `422`），交易內同時處理原列表與目標列表的 position。
61. 實作 `DELETE /cards/:id`。
62. 補上 `GET /boards/:id` 回傳每個列表的 `cards`：固定三次查詢（看板、列表、`whereIn` 查所有卡片），在程式裡分組，避免 N+1 查詢。寫一個測試用 Knex 的 `query` 事件（`db.on('query', ...)`）計算查詢次數，確認不會隨列表數量增加。
63. 測試：所有卡片端點的跨帳號 `404`；把自己的卡片移到別人的列表回 `422`；兩個列表各 3 張卡片，各種跨列表移動後兩邊的 position 都連續；刪除卡片後後面的往前補。
64. 部署到 VPS。

## 第九階段：前端

📖 參考：`todo-fullstack/frontend/src/`（`api.js` 的 fetch 包裝與錯誤處理、路由守衛、登入／註冊頁）

先把版面／路由骨架建好（這時候先不呼叫 API，用假資料），確認整體動線沒問題後，再依序串上 API，最後才做拖拉。

### 9-1　版面與路由骨架

65. 建立註冊頁、登入頁版面。
66. 建立看板清單頁版面：看板卡片格狀排列、「新增看板」按鈕。
67. 建立看板頁版面：橫向排列的列表，每個列表裡有卡片、「新增卡片」按鈕，最右邊有「新增列表」；用假資料。
68. 建立卡片詳細內容的彈出視窗（modal）：可以編輯標題、說明，有刪除按鈕。
69. 建立前端路由：`/register`、`/login`、`/boards`、`/boards/:id`。

### 9-2　串接 API

70. 寫 `src/api.js`：包裝 `fetch`（相對路徑 `/api/v1`、`Content-Type: application/json`）；非 GET 請求前確認有 `csrf_token` Cookie（沒有就先打 `GET /auth/csrf`），**每次都重新讀取** Cookie 放進 `X-CSRF-Token` header；把 [api.md](api.md) 的錯誤格式轉成前端好處理的形式；收到 `401` 時導向登入頁。
71. 註冊、登入、登出串接 API；加上路由守衛（用 `GET /auth/me` 判斷是否登入）。
72. 看板清單頁串接 `GET /boards`、`POST /boards`；看板的改名、刪除。
73. 看板頁串接 `GET /boards/:id`，把假資料換成真資料。
74. 串接新增／改名／刪除列表、新增卡片、卡片 modal 的編輯與刪除。

### 9-3　拖拉

75. 安裝 `vuedraggable@next`（Vue 3 版本），先做**列表**的左右拖拉排序，放開時呼叫 `PATCH /lists/:id` 帶新的 `position`。
76. 做**卡片**在同一個列表內上下拖拉，放開時呼叫 `PATCH /cards/:id`。
77. 做**卡片跨列表**拖拉（`vuedraggable` 的 `group` 設定），放開時帶 `list_id` + `position`。
78. 拖拉採「樂觀更新」：畫面先變，API 失敗時重新載入 `GET /boards/:id` 還原，並顯示錯誤訊息。驗證：拖完重新整理頁面，順序要跟拖完時一樣。
79. CI 加上前端建置檢查（`npm ci && npm run build`），確保前端改壞時 CI 會失敗。

## 第十階段：維運與正式上線

📖 參考：`todo-fullstack/docs/operations.md`（備份還原、看 log 的流程）

80. 寫 `deploy/backup.sh`：用 `docker compose exec -T db pg_dump` 匯出資料庫並壓縮，檔名帶日期，只保留最近 14 天；用 `crontab` 設定每天凌晨自動執行。驗證：隔天確認有新的備份檔產生。
81. **實際演練一次還原**：在本機用最新的備份檔還原到一個空的資料庫，確認資料完整。沒有測試過還原的備份，不能算是備份。
82. 備份檔不能只放在同一台 VPS（VPS 壞掉時會一起不見）：定期下載到自己的電腦，或開啟 Hostinger VPS 的備份／快照功能。
83. 安全性 HTTP 標頭：檢查 API 的 `helmet` 設定，並在 Caddy 加上 `header` 設定，讓前端靜態檔也有 HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Content-Security-Policy` 等標頭（對應 Todo 專案在 `.htaccess` 加的那些標頭），部署後用同一個安全檢測工具再測一次。另外執行 `npm audit`，處理已知有漏洞的套件。
84. 確認看 log 的方式：`docker compose logs -f api`、`docker compose logs -f caddy`，把常用指令寫進 `docs/operations.md`。
85. 部署完整版本，在正式網址完整走一次：註冊 → 登入 → 建看板 → 建列表 → 建卡片 → 拖拉 → 重新整理確認順序 → 登出。
86. 寫 `README.md`（專案介紹、技術選型、本機啟動方式、如何跑測試、CI 徽章）與 `CLAUDE.md`。

## 範圍之外（暫緩）

依 [architecture.md](architecture.md)「後續規劃」，看板成員共享、標籤、到期日、留言、封存、即時同步、忘記密碼、自動部署（CD）先不做，MVP 完成並上線後再評估優先順序。
