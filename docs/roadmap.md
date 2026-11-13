# 開發路線圖

本文件將 Trello MVP（見 [architecture.md](architecture.md)「第一階段範圍」）拆成可以一步一步完成、每步都能獨立驗證的小任務。建議一次只做一步，做完就實際測試（curl、Postman、瀏覽器、DBeaver 或自動化測試）再進到下一步。

> 標記說明：完成並實際測過的步驟，在標題或步驟前加上 ✅️。

> **參考 Todo 專案**：本專案是全新建立，不從 `todo-fullstack` 複製檔案，但很多觀念可以直接對照。每個階段開頭的「📖 參考」列出可以回去看的地方。Django 跟 Laravel 的概念很接近，對照表如下：

| Laravel（Todo） | Django（本專案） |
| --- | --- |
| `routes/api.php` | `urls.py` |
| Controller | DRF View／ViewSet |
| Eloquent Model | Django Model |
| `$request->validate([...])` | DRF Serializer |
| `php artisan make:migration` + `migrate` | `python manage.py makemigrations` + `migrate` |
| `php artisan tinker` | `python manage.py shell` |
| Sanctum SPA Cookie 認證 | Django Session 認證 + CSRF |
| `throttle:5,1` | DRF Throttling |
| `auth:sanctum` middleware | DRF `IsAuthenticated` permission |
| `composer.json` | `requirements.txt` |

> **測試原則**：從第三階段開始，每做完一支 API 就補上對應的自動化測試，並確認 CI 通過才算完成這一步。尤其「別人的資料要回 `404`」每支端點都要有測試。

## 第一階段：專案初始化與本機環境

📖 參考：`todo-fullstack/docker-compose.yml`、`todo-fullstack/.env.example`

1. 建立 `trello-fullstack` 資料夾並 `git init`，加上 `.gitignore`（至少排除 `.env`、`__pycache__/`、`.venv/`、`node_modules/`、`dist/`、`staticfiles/`）。在 GitHub 建立新的 repository 並推上去。
2. 建立後端：`backend/requirements.txt` 寫入 `Django>=5.2,<5.3`、`djangorestframework`、`psycopg[binary]`（PostgreSQL 驅動）、`argon2-cffi`；寫 `backend/Dockerfile`（`python:3.13-slim`，安裝 requirements）。
3. 用容器建立 Django 專案：`django-admin startproject config .`（在 `backend/` 裡執行，`config` 是設定資料夾的名稱）。
4. 寫 `docker-compose.yml`：`db`（`postgres:17`，對外 port `5433`，加上資料卷）、`api`（`python manage.py runserver 0.0.0.0:8000`，對外 port `3021`）。`settings.py` 的資料庫、`SECRET_KEY`、`DEBUG`、`ALLOWED_HOSTS` 都改成讀環境變數（`os.environ`），根目錄寫 `.env.example`。
5. 設定時區與語言：`TIME_ZONE = "UTC"`、`USE_TZ = True`。
6. **先不要執行 `migrate`**（下一階段要先建立自訂使用者模型）。驗證：`docker compose up --build` 後，瀏覽器開 `http://localhost:3021` 看到 Django 的歡迎頁（上面會提示有未執行的 migration，正常）。
7. 建立前端：`npm create vite@latest frontend -- --template vue`，安裝 `vue-router`；寫 `frontend/Dockerfile`，在 `docker-compose.yml` 加上 `frontend` 服務（port `3020`）。
8. 在 `frontend/vite.config.js` 設定開發伺服器 proxy：`/api` 轉發到 `http://api:8000`。前端呼叫 API 時一律用相對路徑 `/api/v1/...`。
9. 驗證：瀏覽器開 `http://localhost:3020` 看到 Vue 預設畫面；DBeaver 用 `localhost:5433` 連得進 PostgreSQL。

> **已知問題（Todo 專案踩過）**：Windows 上 Docker 掛載的資料夾，檔案變更通知有時候傳不進容器，`runserver` 不會自動重新載入。改完後端程式打 API 發現行為沒變，先 `docker compose restart api` 再測。

## 第二階段：自訂使用者模型與資料庫

📖 參考：`todo-fullstack/docs/database.md`（UUID、UTC 的決策理由）

10. 建立 `accounts` app（`python manage.py startapp accounts`），依 [database.md](database.md) 寫 `User` model：繼承 `AbstractUser`、UUID 主鍵、移除 `username`／`first_name`／`last_name`、加上 `name`、`email` 設為唯一並當作登入欄位（`USERNAME_FIELD = "email"`）、`db_table = "users"`。因為移除了 `username`，要另外寫一個 `UserManager`（`create_user`／`create_superuser` 改用 email，並把 email 轉小寫）。
11. `settings.py` 設定 `AUTH_USER_MODEL = "accounts.User"`，`PASSWORD_HASHERS` 第一個放 `Argon2PasswordHasher`。
12. 執行 `makemigrations` 與 `migrate`，用 DBeaver 確認 `users` 表的欄位與型別符合 database.md（`id` 是 `uuid`、沒有 `username`）。
13. 在 `accounts/admin.py` 註冊 User（要繼承 `UserAdmin` 並調整欄位設定，因為沒有 `username`），執行 `createsuperuser` 建立管理員，登入 `http://localhost:3021/admin/` 確認看得到使用者清單。
14. 安裝並設定 DRF（`INSTALLED_APPS` 加入 `rest_framework`），在 `config/urls.py` 建立 `/api/v1/` 路由前綴，實作 `GET /api/v1/health`：真的查一次資料庫，成功回 `200`，失敗回 `503`。驗證：`docker compose stop db` 後打 health 會回 `503`。

## 第三階段：測試與 CI 基礎

> **為什麼這麼早做**：Todo 專案一直沒有自動化測試，只能手動測。測試環境越早建好，之後每一步都能順手補測試，而不是最後才一次補（通常就不會補了）。

15. `requirements-dev.txt` 加入 `pytest`、`pytest-django`、`ruff`；在 `pyproject.toml` 設定 pytest（`DJANGO_SETTINGS_MODULE`）與 ruff。
16. 寫第一個測試：`GET /api/v1/health` 回 `200` 與 `{ "status": "ok" }`。用 `docker compose exec api pytest` 執行（pytest-django 會自動建立一個獨立的測試資料庫，不會動到開發資料）。
17. 執行 `ruff check .` 與 `ruff format .`，修掉所有警告。
18. 寫 `.github/workflows/ci.yml`：在 GitHub Actions 啟動 PostgreSQL 17 服務容器，安裝 Python 3.13 與相依套件，依序執行 `ruff check`、`ruff format --check`、`pytest`。
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
27. 安裝 `gunicorn`、`whitenoise`（加到 `requirements.txt`），設定 WhiteNoise 提供 Django Admin 的靜態檔，`settings.py` 加上 `STATIC_ROOT`。
28. 寫 `Caddyfile`：網域、`/api/*` 與 `/admin/*` 反向代理到 `api:8000`，其他路徑提供前端靜態檔並在找不到檔案時回 `index.html`。
29. 寫 `docker-compose.prod.yml`：`caddy`（只有它開放 `80`／`443`，映像檔建置時先用 Node 編譯前端再複製進去）、`api`（`gunicorn config.wsgi`，**不開放連接埠**）、`db`（**不開放連接埠**，資料卷保存資料）。Caddy 的憑證資料也要用資料卷保存，否則每次重建都要重新申請。
30. 正式環境的 `settings.py` 設定（由環境變數控制）：`DEBUG=False`、`ALLOWED_HOSTS`、`CSRF_TRUSTED_ORIGINS`、`SECURE_PROXY_SSL_HEADER`（Django 在 Caddy 後面，要靠這個判斷原始請求是不是 HTTPS）、`SESSION_COOKIE_SECURE`、`CSRF_COOKIE_SECURE`。

### 4-3　部署與驗證

31. 在 VPS 上 `git clone` 專案，建立正式環境的 `.env`（`SECRET_KEY` 用 `python -c "import secrets; print(secrets.token_urlsafe(50))"` 產生新的，不要跟開發環境共用）。
32. `docker compose -f docker-compose.prod.yml up -d --build`，接著執行 `migrate` 與 `createsuperuser`。
33. 驗證：
    - `https://trello.你的網域/api/v1/health` 回 `200`，瀏覽器網址列顯示安全的 HTTPS。
    - `https://trello.你的網域/` 看得到 Vue 畫面；`/admin/` 能用 superuser 登入，而且畫面樣式正常（代表靜態檔設定正確）。
    - 從自己的電腦連 VPS 的 `5432` 連接埠會失敗（代表資料庫沒有對外開放）。
34. 在容器內執行 `python manage.py check --deploy`，依照提示修正正式環境的安全設定。

## 第五階段：使用者認證（註冊、登入、登出）

📖 參考：`todo-fullstack/backend-laravel/app/Http/Controllers/AuthController.php`、`todo-fullstack/frontend/src/api.js`（CSRF Cookie 的處理流程）

35. 設定 DRF 預設值（`REST_FRAMEWORK`）：認證只用 `SessionAuthentication`、權限預設 `IsAuthenticated`、只接受 `JSONParser`（其他格式自動回 `415`）。
36. 寫自訂 exception handler，把 DRF 的錯誤統一轉成 [api.md](api.md) 的格式：驗證錯誤改回 `422`、未登入改回 `401`（DRF 搭配 Session 認證時預設回 `403`）。先為這個 handler 寫測試。
37. 實作 `GET /auth/csrf`（用 `ensure_csrf_cookie` 設定 Cookie，回 `204`）。
38. 實作 `POST /auth/register`：用 Serializer 驗證欄位（email 轉小寫、檢查重複、執行 Django 的密碼驗證器），用 `create_user` 建立使用者，回傳 `201`。**注意**：DRF 的 `SessionAuthentication` 只會對「已登入」的請求檢查 CSRF，註冊和登入是未登入狀態，要另外加上 `csrf_protect`，否則這兩支沒有 CSRF 保護。
39. 實作 `POST /auth/login`：用 `authenticate()` 驗證帳密，成功後 `login()`（會自動更換 Session ID），回傳使用者資料；失敗一律回 `401` 與相同訊息。同樣加上 `csrf_protect`。
40. 實作 `GET /auth/me` 與 `POST /auth/logout`（`logout()` 會清除 Session，回 `204`）。
41. 速率限制：設定資料庫快取（`DatabaseCache`），執行 `createcachetable`；登入、註冊加上 `ScopedRateThrottle`，設定 `5/min`。正式環境在 Caddy 後面，要設定 DRF 的 `NUM_PROXIES = 1`，否則所有請求看起來都來自 Caddy 的 IP，會一起被擋。
42. 測試（pytest）至少涵蓋：註冊成功、email 重複、email 大小寫視為同一個、密碼太短；登入成功、密碼錯誤、帳號不存在（兩者訊息相同）；未登入打 `/auth/me` 回 `401`；登出後 `/auth/me` 回 `401`；沒帶 CSRF Token 的登入請求回 `403`（測試用 `APIClient(enforce_csrf_checks=True)`）；第 6 次登入回 `429`。
43. 手動用 curl 或 Postman 走一次：取得 CSRF Cookie → 註冊 → 登入 → `/auth/me` → 登出。並在 Django Admin 確認使用者已建立、DBeaver 確認 `django_session` 有寫入。

## 第六階段：看板 CRUD

📖 參考：`todo-fullstack/backend-laravel/app/Http/Controllers/TodoController.php`（「只查自己的資料、別人的回 404」的寫法）

44. 建立 `boards` app，寫 `Board` model（`owner` 外鍵、索引、`db_table = "boards"`），跑 migration，在 Django Admin 註冊。
45. 寫 `BoardSerializer` 與 View，`get_queryset()` 一律用 `owner=request.user` 過濾；建立時由後端填入 `owner`，不接受前端傳。URL 用 `<uuid:id>`。
46. 實作 `GET /boards`、`POST /boards`、`GET /boards/:id`（先只回看板本身）、`PATCH /boards/:id`、`DELETE /boards/:id`。
47. 測試：每支端點的成功情境；`title` 空白、超過 100 字回 `422`；**用第二個使用者查、改、刪第一個使用者的看板都回 `404`**；`GET /boards` 只會看到自己的看板。
48. 部署到 VPS（照 `docs/deployment-roadmap.md`），在正式環境用 curl 簡單測一次。

## 第七階段：列表 CRUD 與排序

49. 寫 `BoardList` model（含延遲檢查的唯一約束 `uniq_list_position` 與 `position >= 0` 的檢查，見 [database.md](database.md)），跑 migration 後用 DBeaver 確認約束有建立（`DEFERRABLE INITIALLY DEFERRED`）。
50. 寫 `boards/ordering.py`：一個「把某個項目移到新位置」的函式（處理夾範圍、補空位、騰空位），以及「刪除後往前補」的函式。這兩個函式會給列表與卡片共用。
51. 先為 `ordering.py` 寫測試：往前移、往後移、移到原位置、移到最前面、移到最後面、超出範圍被夾住、刪除中間的項目。每個測試都檢查結果的 position 是連續的 0～n-1。
52. 實作 `POST /boards/:board_id/lists`（看板要屬於自己，否則 `404`；position = 目前列表數量）。
53. 實作 `PATCH /lists/:id`（改名稱、調整 position；調整時在 `transaction.atomic()` 裡先用 `select_for_update()` 鎖定看板）與 `DELETE /lists/:id`。
54. 補上 `GET /boards/:id` 回傳 `lists`（依 position 排序）。
55. 測試：所有列表端點的跨帳號 `404`；建 4 個列表後各種移動，確認 API 回傳與資料庫的順序都正確。

## 第八階段：卡片 CRUD 與移動

56. 寫 `Card` model（同樣的延遲唯一約束 `uniq_card_position`），跑 migration。
57. 實作 `POST /lists/:list_id/cards`（擁有權要追到看板）與 `GET /cards/:id`。
58. 實作 `PATCH /cards/:id` 修改 `title`／`description`，以及同列表內調整 `position`（用 `ordering.py`）。
59. 加上跨列表移動（`list_id` + `position`）：確認目標列表跟卡片在同一個看板（否則 `422`），交易內同時處理原列表與目標列表的 position。
60. 實作 `DELETE /cards/:id`。
61. 補上 `GET /boards/:id` 回傳每個列表的 `cards`，用 `prefetch_related` 避免 N+1 查詢。寫一個測試用 `django_assert_num_queries` 確認查詢次數是固定的，不會隨列表數量增加。
62. 測試：所有卡片端點的跨帳號 `404`；把自己的卡片移到別人的列表回 `422`；兩個列表各 3 張卡片，各種跨列表移動後兩邊的 position 都連續；刪除卡片後後面的往前補。
63. 部署到 VPS。

## 第九階段：前端

📖 參考：`todo-fullstack/frontend/src/`（`api.js` 的 fetch 包裝與錯誤處理、路由守衛、登入／註冊頁）

先把版面／路由骨架建好（這時候先不呼叫 API，用假資料），確認整體動線沒問題後，再依序串上 API，最後才做拖拉。

### 9-1　版面與路由骨架

64. 建立註冊頁、登入頁版面。
65. 建立看板清單頁版面：看板卡片格狀排列、「新增看板」按鈕。
66. 建立看板頁版面：橫向排列的列表，每個列表裡有卡片、「新增卡片」按鈕，最右邊有「新增列表」；用假資料。
67. 建立卡片詳細內容的彈出視窗（modal）：可以編輯標題、說明，有刪除按鈕。
68. 建立前端路由：`/register`、`/login`、`/boards`、`/boards/:id`。

### 9-2　串接 API

69. 寫 `src/api.js`：包裝 `fetch`（相對路徑 `/api/v1`、`Content-Type: application/json`）；非 GET 請求前確認有 `csrftoken` Cookie（沒有就先打 `GET /auth/csrf`），**每次都重新讀取** Cookie 放進 `X-CSRFToken` header；把 [api.md](api.md) 的錯誤格式轉成前端好處理的形式；收到 `401` 時導向登入頁。
70. 註冊、登入、登出串接 API；加上路由守衛（用 `GET /auth/me` 判斷是否登入）。
71. 看板清單頁串接 `GET /boards`、`POST /boards`；看板的改名、刪除。
72. 看板頁串接 `GET /boards/:id`，把假資料換成真資料。
73. 串接新增／改名／刪除列表、新增卡片、卡片 modal 的編輯與刪除。

### 9-3　拖拉

74. 安裝 `vuedraggable@next`（Vue 3 版本），先做**列表**的左右拖拉排序，放開時呼叫 `PATCH /lists/:id` 帶新的 `position`。
75. 做**卡片**在同一個列表內上下拖拉，放開時呼叫 `PATCH /cards/:id`。
76. 做**卡片跨列表**拖拉（`vuedraggable` 的 `group` 設定），放開時帶 `list_id` + `position`。
77. 拖拉採「樂觀更新」：畫面先變，API 失敗時重新載入 `GET /boards/:id` 還原，並顯示錯誤訊息。驗證：拖完重新整理頁面，順序要跟拖完時一樣。
78. CI 加上前端建置檢查（`npm ci && npm run build`），確保前端改壞時 CI 會失敗。

## 第十階段：維運與正式上線

📖 參考：`todo-fullstack/docs/operations.md`（備份還原、看 log 的流程）

79. 寫 `deploy/backup.sh`：用 `docker compose exec -T db pg_dump` 匯出資料庫並壓縮，檔名帶日期，只保留最近 14 天；用 `crontab` 設定每天凌晨自動執行。驗證：隔天確認有新的備份檔產生。
80. **實際演練一次還原**：在本機用最新的備份檔還原到一個空的資料庫，確認資料完整。沒有測試過還原的備份，不能算是備份。
81. 備份檔不能只放在同一台 VPS（VPS 壞掉時會一起不見）：定期下載到自己的電腦，或開啟 Hostinger VPS 的備份／快照功能。
82. 安全性 HTTP 標頭：Django 的 `SecurityMiddleware` 設定（HSTS 等）加上 Caddy 的 `header` 設定（對應 Todo 專案在 `.htaccess` 加的那些標頭），部署後用同一個安全檢測工具再測一次，並再跑一次 `check --deploy`。
83. 確認看 log 的方式：`docker compose logs -f api`、`docker compose logs -f caddy`，把常用指令寫進 `docs/operations.md`。
84. 部署完整版本，在正式網址完整走一次：註冊 → 登入 → 建看板 → 建列表 → 建卡片 → 拖拉 → 重新整理確認順序 → 登出。
85. 寫 `README.md`（專案介紹、技術選型、本機啟動方式、如何跑測試、CI 徽章）與 `CLAUDE.md`。

## 範圍之外（暫緩）

依 [architecture.md](architecture.md)「後續規劃」，看板成員共享、標籤、到期日、留言、封存、即時同步、忘記密碼、自動部署（CD）先不做，MVP 完成並上線後再評估優先順序。
