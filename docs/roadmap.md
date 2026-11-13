# 開發路線圖

本文件將 Trello MVP（見 [architecture.md](architecture.md)「MVP 範圍」）拆成可以一步一步完成、每步都能獨立驗證的小任務。建議一次只做一步，做完就實際驗證（curl、Postman、瀏覽器、DBeaver）再進到下一步。部署不在這份文件裡，等本機開發完成後再照 [deployment.md](deployment.md) 進行。

> 標記說明：完成並實際測過的步驟，在標題或步驟前加上 ✅️。

> **驗證原則**：每做完一支 API 就用 curl 或 Postman 實際打一次，成功與失敗的情境都要試。尤其「別人的資料要回 `404`」：準備兩個帳號（建議在 Postman 開兩個環境，各自保存 Cookie），每支端點都用第二個帳號試著存取第一個帳號的資料。

## 第一階段：專案初始化與本機環境

1. ✅️ 建立 `trello-fullstack` 資料夾並 `git init`，加上 `.gitignore`（至少排除 `.env`、`node_modules/`、`dist/`）。在 GitHub 建立新的 repository 並推上去。
2. 建立後端：在 `backend/` 執行 `npm init -y`，`package.json` 加上 `"type": "module"`，安裝 `express`（5.x）、`knex`、`mysql2`；寫 `backend/Dockerfile`（`node:24-alpine`，先複製 `package*.json` 執行 `npm ci`，再複製程式碼）與 `.dockerignore`（排除 `node_modules`）。
3. 寫最小的 `src/app.js`（建立 Express app 並匯出，先只有 `GET /api/v1/health` 回 `{ "status": "ok" }`）與 `src/server.js`（import app、讀 `PORT` 環境變數（預設 `3000`）並 `listen`）。`package.json` 的 scripts 加上 `dev`（`node --watch src/server.js`）與 `start`（`node src/server.js`）。
4. 寫 `docker-compose.yml`：`db`（`mariadb:11.4`，對外 port `3307`，加上資料卷；字元集設為 `utf8mb4`）、`api`（`npm run dev`，對外 port `3021` 對應容器內的 `3000`，掛載原始碼）。資料庫連線、`SESSION_SECRET`、`NODE_ENV` 都讀環境變數，集中在 `src/config.js` 讀取並檢查（缺少必要的值就直接啟動失敗，不要默默用預設值），根目錄寫 `.env.example`。
5. 寫 `knexfile.js`（client `mysql2`，連線讀 `DB_HOST`／`DB_PORT`／`DB_NAME`／`DB_USER`／`DB_PASSWORD`，設定 `timezone: 'Z'` 與 `charset: 'utf8mb4'`，pool 的 `afterCreate` 執行 `SET time_zone = '+00:00'`；migration 資料夾 `migrations/`）與 `src/db.js`（建立 Knex 實例）；scripts 加上 `migrate`（`knex migrate:latest`）。
6. 驗證：`docker compose up --build` 後，`curl http://localhost:3021/api/v1/health` 回 `{"status":"ok"}`；改一下回傳內容，確認 `node --watch` 會自動重啟。
7. 建立前端：`npm create vite@latest frontend -- --template vue`，安裝 `vue-router`；寫 `frontend/Dockerfile`，在 `docker-compose.yml` 加上 `frontend` 服務（port `3020`）。
8. 在 `frontend/vite.config.js` 設定開發伺服器 proxy：`/api` 轉發到 `http://api:3000`。前端呼叫 API 時一律用相對路徑 `/api/v1/...`。
9. 驗證：瀏覽器開 `http://localhost:3020` 看到 Vue 預設畫面；DBeaver 用 `localhost:3307` 連得進 MariaDB。

> **已知問題**：Windows 上 Docker 掛載的資料夾，檔案變更通知有時候傳不進容器，`node --watch` 不會自動重啟。改完後端程式打 API 發現行為沒變，先 `docker compose restart api` 再測。

## 第二階段：資料庫與 migration

10. 用 `npx knex migrate:make create_users` 建立第一個 migration，依 [database.md](database.md) 建立 `users` 表：`id` 用 `char(36)`（由程式 `crypto.randomUUID()` 產生）、`email` 唯一、`password_hash`、`created_at`／`updated_at` 用 `datetime(3)` 並預設 `CURRENT_TIMESTAMP(3)`；資料表字元集 `utf8mb4`、引擎 InnoDB。記得寫 `down`。
11. 建立 `sessions` 表的 migration（`express-mysql-session` 用的結構：`session_id` 主鍵、`expires`、`data`）。
12. 執行 `npm run migrate`，用 DBeaver 確認兩張表的欄位與型別符合 database.md（`id` 是 `char(36)`、時間是 `datetime(3)`、字元集是 `utf8mb4`）；在資料表存一筆中文加 emoji 的資料確認沒有變成問號。再執行一次 `npx knex migrate:rollback` 確認能還原，然後重新 migrate。
13. 讓 `GET /api/v1/health` 真的查一次資料庫（`SELECT 1`），成功回 `200`，失敗回 `503`。驗證：`docker compose stop db` 後打 health 會回 `503`。

## 第三階段：使用者認證（註冊、登入、登出）

14. 安裝 `helmet`、`express-session`、`express-mysql-session`、`argon2`、`zod`、`express-rate-limit`。設定全域 middleware：`helmet()`、`express.json()`、Content-Type 檢查（`POST`／`PATCH` 不是 `application/json` 回 `415`）、`express-session`（store 用 `express-mysql-session` 並關閉 `createDatabaseTable`、`secret` 讀 `SESSION_SECRET`、`resave: false`、`saveUninitialized: false`、Cookie `httpOnly`、`sameSite: 'lax'`）。Cookie 的 `secure` 與 `trust proxy` 先做成由環境變數控制，本機關閉、部署時打開（見 [deployment.md](deployment.md)「開發時就要遵守的原則」）。
15. 寫錯誤處理：定義一個帶狀態碼的錯誤類別（例如 `HttpError(status, message, errors)`），以及最後的錯誤處理 middleware，把 `HttpError`、Zod 驗證錯誤（轉成 `422` 與 `errors` 物件）、JSON 解析錯誤（`400`）、其他未預期錯誤（`500`，只記 log）統一轉成 [api.md](api.md) 的格式；找不到的路由回 JSON 的 `404`。驗證：用 curl 送壞掉的 JSON、送 `text/plain`、打不存在的路徑，確認都回 JSON 格式的錯誤。
16. 寫 CSRF middleware 與 `GET /auth/csrf`（流程見 [api.md](api.md)「CSRF」）：token 存在 Session 並寫進 `csrf_token` Cookie，所有 `POST`／`PATCH`／`DELETE` 都比對 `X-CSRF-Token` header，**包含未登入時的註冊與登入**。
17. 寫 `requireAuth` middleware：Session 裡沒有 `userId` 就回 `401`。
18. 實作 `POST /auth/register`：用 Zod 驗證欄位（email 去空白、轉小寫），密碼用 `argon2.hash()` 雜湊後寫入，回傳 `201`（不含 `password_hash`）。email 重複時回 `422`，並處理同時註冊時資料庫唯一約束的錯誤（錯誤碼 `ER_DUP_ENTRY`）。
19. 實作 `POST /auth/login`：查出使用者後用 `argon2.verify()` 比對密碼；成功後 `req.session.regenerate()` 更換 Session ID，存入 `userId`、產生新的 CSRF token，回傳使用者資料；失敗一律回 `401` 與相同訊息（帳號不存在時也要花差不多的時間，可以對一個假的雜湊值做一次 `verify`，避免從回應時間猜出帳號是否存在）。
20. 實作 `GET /auth/me` 與 `POST /auth/logout`（`req.session.destroy()`，清除 Cookie，回 `204`）。
21. 速率限制：登入、註冊加上 `express-rate-limit`（每個 IP 每分鐘 5 次，超過回 `429` 與 API 的錯誤格式）。
22. 用 curl 或 Postman 走一次完整流程：取得 CSRF Cookie → 註冊 → 登入 → `/auth/me` → 登出 → 再打 `/auth/me` 回 `401`。並確認以下情境：
    - 註冊：email 重複、email 只差大小寫、密碼太短，都回 `422`；回應裡沒有 `password_hash`。
    - 登入：密碼錯誤與帳號不存在回一樣的 `401` 訊息；不帶 `X-CSRF-Token` 回 `403`；連續第 6 次回 `429`。
    - DBeaver：`users` 有新資料、`password_hash` 是 `$argon2id$` 開頭；`sessions` 表有寫入，登出後該筆被刪除。

## 第四階段：看板 CRUD

23. 寫 `boards` 表的 migration（`owner_id` 外鍵 `ON DELETE CASCADE`、`(owner_id, created_at)` 索引），跑 migration 並用 DBeaver 確認。
24. 寫路徑 id 的 UUID 格式檢查（`router.param()`），不合法直接回 `404`；寫 `findOwnedBoard(db, userId, id)`，查詢條件一律帶上 `owner_id`。建立時由後端填入 `owner_id`（取自 Session），不接受前端傳。
25. 實作 `GET /boards`、`POST /boards`、`GET /boards/:id`（先只回看板本身）、`PATCH /boards/:id`（記得更新 `updated_at`）、`DELETE /boards/:id`。
26. 驗證：每支端點的成功情境；`title` 空白、超過 100 字回 `422`；id 不是 UUID 回 `404`；**用第二個帳號查、改、刪第一個帳號的看板都回 `404`**；`GET /boards` 只會看到自己的看板。

## 第五階段：列表 CRUD 與排序

27. 寫 `lists` 表的 migration（`position` 用 `int unsigned`、唯一約束 `uniq_list_position`，見 [database.md](database.md)），跑 migration 後用 DBeaver 確認約束有建立。再用 SQL 手動試一次：對 position 0、1、2 執行不帶 `ORDER BY` 的 `UPDATE lists SET position = position + 1`，確認會撞到唯一約束失敗，加上 `ORDER BY position DESC` 就會成功（理解為什麼排序要指定更新順序）。
28. 寫 `src/ordering.js`：一個「把某個項目移到新位置」的函式（處理夾範圍、暫停到最後一號、補空位、騰空位，步驟見 [database.md](database.md)「移動步驟」），以及「刪除後往前補」的函式。函式接收交易物件 `trx`、資料表名稱與父層條件（例如 `{ board_id }`），給列表與卡片共用；每個 `increment`／`decrement` 都要指定 `orderBy`。
29. 實作 `POST /boards/:board_id/lists`（看板要屬於自己，否則 `404`；在交易裡鎖定看板後，position = 目前列表數量）。
30. 實作 `PATCH /lists/:id`（改名稱、調整 position；調整時在 `db.transaction()` 裡先用 `forUpdate()` 鎖定看板）與 `DELETE /lists/:id`。
31. 補上 `GET /boards/:id` 回傳 `lists`（依 position 排序）。
32. 驗證：所有列表端點用第二個帳號存取都回 `404`。建 4 個列表後試各種移動：往前移、往後移、移到原位置、移到最前面、移到最後面、position 超出範圍被夾住、刪除中間的列表；每次都用 DBeaver 確認 position 是連續的 0～n-1，且跟 API 回傳的順序一致。

## 第六階段：卡片 CRUD 與移動

33. 寫 `cards` 表的 migration（同樣的唯一約束 `uniq_card_position`；`description` 是 `text`，不能設預設值，新增時由程式寫入空字串），跑 migration。
34. 實作 `POST /lists/:list_id/cards`（擁有權要追到看板）與 `GET /cards/:id`。
35. 實作 `PATCH /cards/:id` 修改 `title`／`description`，以及同列表內調整 `position`（用 `ordering.js`）。
36. 加上跨列表移動（`list_id` + `position`）：確認目標列表跟卡片在同一個看板（否則 `422`），交易內同時處理原列表與目標列表的 position。
37. 實作 `DELETE /cards/:id`。
38. 補上 `GET /boards/:id` 回傳每個列表的 `cards`：固定三次查詢（看板、列表、`whereIn` 查所有卡片），在程式裡分組，避免 N+1 查詢。驗證：開發時用 Knex 的 `query` 事件（`db.on('query', ...)`）把 SQL 印到 log，確認不管有幾個列表都只有三句查詢。
39. 驗證：所有卡片端點用第二個帳號存取都回 `404`；把自己的卡片移到別人的列表回 `422`；兩個列表各 3 張卡片，試各種跨列表移動，用 DBeaver 確認兩邊的 position 都連續；刪除卡片後後面的往前補。

## 第七階段：前端

先把版面／路由骨架建好（這時候先不呼叫 API，用假資料），確認整體動線沒問題後，再依序串上 API，最後才做拖拉。

### 7-1　版面與路由骨架

40. 建立註冊頁、登入頁版面。
41. 建立看板清單頁版面：看板卡片格狀排列、「新增看板」按鈕。
42. 建立看板頁版面：橫向排列的列表，每個列表裡有卡片、「新增卡片」按鈕，最右邊有「新增列表」；用假資料。
43. 建立卡片詳細內容的彈出視窗（modal）：可以編輯標題、說明，有刪除按鈕。
44. 建立前端路由：`/register`、`/login`、`/boards`、`/boards/:id`。

### 7-2　串接 API

45. 寫 `src/api.js`：包裝 `fetch`（相對路徑 `/api/v1`、`Content-Type: application/json`）；非 GET 請求前確認有 `csrf_token` Cookie（沒有就先打 `GET /auth/csrf`），**每次都重新讀取** Cookie 放進 `X-CSRF-Token` header；把 [api.md](api.md) 的錯誤格式轉成前端好處理的形式；收到 `401` 時導向登入頁。
46. 註冊、登入、登出串接 API；加上路由守衛（用 `GET /auth/me` 判斷是否登入）。
47. 看板清單頁串接 `GET /boards`、`POST /boards`；看板的改名、刪除。
48. 看板頁串接 `GET /boards/:id`，把假資料換成真資料。
49. 串接新增／改名／刪除列表、新增卡片、卡片 modal 的編輯與刪除。

### 7-3　拖拉

50. 安裝 `vuedraggable@next`（Vue 3 版本），先做**列表**的左右拖拉排序，放開時呼叫 `PATCH /lists/:id` 帶新的 `position`。
51. 做**卡片**在同一個列表內上下拖拉，放開時呼叫 `PATCH /cards/:id`。
52. 做**卡片跨列表**拖拉（`vuedraggable` 的 `group` 設定），放開時帶 `list_id` + `position`。
53. 拖拉採「樂觀更新」：畫面先變，API 失敗時重新載入 `GET /boards/:id` 還原，並顯示錯誤訊息。驗證：拖完重新整理頁面，順序要跟拖完時一樣。

## 第八階段：本機收尾

54. 在本機瀏覽器完整走一次：註冊 → 登入 → 建看板 → 建列表 → 建卡片 → 拖拉 → 重新整理確認順序 → 登出；再用第二個帳號登入，確認看不到第一個帳號的看板。
55. 開兩個分頁同時操作同一個看板（例如一邊拖卡片、一邊新增卡片），重新整理後確認順序正確、沒有錯誤。
56. 執行 `npm audit`（前後端各一次），處理已知有漏洞的套件。
57. 補完 `README.md`：本機啟動方式（`.env` 怎麼建、`docker compose up`、`npm run migrate`），並更新 `CLAUDE.md`。

完成後即可照 [deployment.md](deployment.md) 部署上線。
