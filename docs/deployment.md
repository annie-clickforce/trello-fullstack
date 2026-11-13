# 部署規劃

本文件描述把本專案部署上線的架構與步驟。**部署要等 [roadmap.md](roadmap.md) 的本機開發全部完成後才進行**；開發期間只要遵守下方「開發時就要遵守的原則」，之後部署就不需要回頭改程式。

部署目標是 **Hostinger Unlimited Web Hosting**：用 hPanel 的 **Web App**（Node.js 應用程式）執行 Express，資料庫用 Hostinger 提供的 MariaDB，HTTPS 與網域由 Hostinger 代管。正式環境**不使用 Docker Compose，也沒有 Caddy**；Docker 只用在本機開發。

> 標記說明：完成並實際測過的步驟，在步驟前加上 ✅️。

## 開發時就要遵守的原則

這些原則讓同一份程式碼可以跑在本機 Docker 與 Hostinger Web App，在本機開發時就要做到：

- **資料庫統一用 MariaDB**，只使用 MariaDB 10.6 與 MySQL 8.0 都支援的功能（見 [database.md](database.md)「相容性」）。Hostinger 提供的資料庫版本不一定跟本機的 11.4 一樣新。
- **API 不存狀態**：Session 存在資料庫，不存在記憶體或本機檔案；程式也不寫任何本機檔案（上傳、log 檔都不寫）。
- **設定全部來自環境變數**：資料庫連線用 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`，監聽的 port 讀 `PORT`；程式碼裡不寫死任何主機（例如 Docker 的 `db`）、密碼。程式不讀 `.env` 檔，本機由 Docker Compose 帶入，正式環境在 hPanel 的 Web App 設定環境變數。
- **正式環境才需要的設定也用環境變數開關**：Cookie 的 `secure` 由 `COOKIE_SECURE=true` 打開，Express 的 `trust proxy` 由 `TRUST_PROXY=1` 設定（API 前面有幾層反向代理就填幾），Express 提供前端檔案由 `FRONTEND_DIST` 打開。本機開發不設定（預設關閉）。錯誤訊息一律不回傳細節，本機與正式環境相同。
- **程式碼不依賴 Docker**：`npm ci && npm start` 在任何裝了 Node.js 24 的地方都要能跑。
- **不使用 top-level await**：Hostinger 的 Web App 由 LiteSpeed（`lsnode.js`）用 `require()` 載入 entry file。Node.js 24 可以 `require()` ESM，但整個 import 鏈裡只要有一個模組在最外層 `await`，就會啟動失敗（`ERR_REQUIRE_ASYNC_MODULE`），網站回 LiteSpeed 的 `503`。需要非同步初始化的值，改成第一次用到時才產生並快取（例如 `routes/auth.js` 的 dummy hash）。本機可以用 `node -e "require('./src/server.js')"` 模擬。
- **migration 是獨立指令**（`npm run migrate`），不在 API 啟動時自動執行。
- **log 一律輸出到 stdout／stderr**，由 Hostinger 的 Web App 收集。
- **健康檢查**（`GET /api/v1/health`）用來確認 API 與資料庫正常。

## 正式環境架構（Hostinger Unlimited Web Hosting）

```mermaid
flowchart TD
    User[使用者] --> Browser[瀏覽器]
    Browser -->|HTTPS 443| Proxy

    subgraph Hostinger["Hostinger Unlimited Web Hosting（hPanel 代管）"]
        Proxy[Hostinger 網域與 HTTPS<br/>反向代理]
        subgraph WebApp[Web App（Node.js 24）]
            API[Express<br/>/api/* → API 路由<br/>其他路徑 → Vue 建置檔]
        end
        DB[(Hostinger MariaDB)]
        Backup[Hostinger 每日備份]

        Proxy --> API
        API --> DB
        Backup -.-> DB
    end
```

- **Hostinger 網域與 HTTPS**：在 hPanel 綁定網域、開啟 SSL，憑證由 Hostinger 自動申請與更新。請求經過 Hostinger 的反向代理再轉給 Web App，所以要設定 `TRUST_PROXY`。
- **Web App（Express）**：用 `npm start`（`node src/server.js`）執行，監聽 Hostinger 指定的 `PORT`。設定 `FRONTEND_DIST` 後，Express 同時提供 Vue 建置後的靜態檔：`/api/*` 交給 API 路由，其他路徑先找靜態檔，找不到就回 `index.html`（交給 Vue Router）。
- **MariaDB**：在 hPanel 的「資料庫」建立資料庫與帳號，用 phpMyAdmin 查看資料。
- 前端與 API 在同一個網域，不需要 CORS，Session Cookie 與 CSRF Cookie 也不會有跨網域問題。

跟本機開發的對照：

| 項目 | 本機開發 | 正式環境 |
| --- | --- | --- |
| 執行 API | Docker Compose 的 `api` 容器（`node --watch`） | hPanel 的 Web App（`npm start`） |
| 前端 | Vite 開發伺服器（`3020`），`/api` 由 Vite proxy 轉給 API | `npm run build` 的建置檔，由 Express 提供（`FRONTEND_DIST`） |
| 資料庫 | Docker 的 `mariadb:11.4` | Hostinger 提供的 MariaDB，用 phpMyAdmin 管理 |
| 環境變數 | `.env` + `docker-compose.yml` | hPanel 的 Web App 環境變數設定 |
| HTTPS、網域 | 無（`localhost`） | Hostinger 代管 |
| migration | `docker compose exec api npm run migrate` | 見「部署步驟」第 9 步 |
| 備份 | 不需要 | Hostinger 每日備份 + 定期從 phpMyAdmin 匯出 |
| 防火牆、系統更新 | 不需要 | Hostinger 代管 |

> **已知的單一實例假設**：速率限制用記憶體計數（只有一個 API 行程時是準的）。Web App 只跑一個行程時沒有問題；如果之後同時跑多個實例，要改成共享的 store，否則每個實例各算各的。

## 部署前要改的程式

1. ✅️ **Express 提供前端檔案（`FRONTEND_DIST`）**：`config.js` 讀取 `FRONTEND_DIST`（Vue 建置結果 `dist/` 的路徑，相對路徑以 `backend/` 為基準，不受啟動時所在目錄影響）。有設定時，`app.js` 在 API 路由之後、`notFound` 之前加上：
   - `express.static(FRONTEND_DIST)` 提供 JS、CSS、圖片。
   - 不是 `/api` 開頭、也沒有副檔名的 `GET` 請求都回 `index.html`，讓重新整理 `/login` 這類前端路由時不會 404。
   - `/api` 開頭但不存在的路徑、找不到的靜態檔（例如 `/assets/nope.js`）仍然交給 `notFound`，回 JSON 格式的 `404`。

   沒設定 `FRONTEND_DIST` 時行為跟以前一樣（本機開發由 Vite 提供前端）。
2. ✅️ **建置與啟動指令**：專案是 `frontend/`、`backend/` 兩個資料夾，Web App 需要一組指令同時完成「建置前端」與「安裝後端套件」，所以專案根目錄有一個 `package.json`：
   - `build`：`npm ci --include=dev --prefix frontend && npm run build --prefix frontend && npm ci --omit=dev --prefix backend`
   - `start`：`npm start --prefix backend`
   - `engines` 寫 `"node": "24.x"`，讓 Hostinger 自動選 Node.js 24。

   前端的 `npm ci` 一定要加 `--include=dev`：Web App 的環境變數在**建置時也會生效**，`NODE_ENV=production` 會讓 npm 跳過 devDependencies，而 Vite 與 `@vitejs/plugin-vue` 都是 devDependencies，少了它們前端建置會失敗（`Cannot find package '@vitejs/plugin-vue'`）。

   Web App 的 Root directory 保持 `./`（專案根目錄），不要設成 `backend/`，否則建置時看不到 `frontend/`。

## 部署步驟

> 實際做完後，把遇到的問題與修正補回這份文件，之後的部署照著做。

### 一、方案、網域與資料庫

1. ✅️ 確認方案是 **Unlimited Web Hosting**（含 Web Apps）。
2. ✅️ 網域：沿用現有網域的子網域 `trello.你的網域`，網域與 DNS 留在原本的網域商，不改 Nameserver。網域在第 6 步建立 Web App 時填入；DNS 與 SSL 見第 8 步。
3. 資料庫要建在網站底下，所以在第 6 步建好 Web App 之後做：網站管理頁 → **Databases** → **Hostinger MySQL** → **Create**，建立資料庫與一般使用者（hPanel 會自動加上 `u數字_` 前綴），密碼用新產生的隨機字串，**不要跟本機開發共用**。記下主機、連接埠、資料庫名稱、帳號、密碼（記在不進版本控制的 `docs/deployment-info.md`）。
4. 在 phpMyAdmin 確認資料庫的編碼是 `utf8mb4` / `utf8mb4_unicode_ci`，並記下 MariaDB 版本（要 10.6 以上）。

### 二、建立 Web App

5. ✅️ 在本機模擬正式環境：用 `node:24-alpine` 容器在專案根目錄執行 `npm run build`，再設定 `NODE_ENV=production`、`FRONTEND_DIST=../frontend/dist` 執行 `npm start`（連本機的 MariaDB）。確認首頁與直接開 `/login`、`/board` 都回 Vue 畫面，`/api/v1/health` 回 `200`，`/api/v1/nope` 回 JSON `404`，回應帶有 helmet 的 `Content-Security-Policy`、`Strict-Transport-Security`；用瀏覽器完整走一次註冊 → 登入 → 新增 → 編輯 → 拖到別欄 → 重新整理 → 刪除 → 登出，Console 沒有 CSP 錯誤。

   > 用新版 npm（11 以上）安裝時會出現 `argon2` 的 install script 沒有執行的警告。`argon2` 套件內附各平台編譯好的檔案，不需要 install script，實際註冊、登入都正常，可以忽略。
6. ✅️ 把程式 push 到 GitHub。在 hPanel 左邊選單 **Websites** →（方案區塊的）**Create site** → **Web App**，網域填 `trello.你的網域`（Domain type 為 Registered elsewhere），來源選 **Import your Git repository** → **Connect with GitHub**。GitHub 授權頁選 **Only select repositories**，只勾這個專案（Hostinger 要求的是程式碼讀寫權限，不要開放全部 repository）。Build and output settings 填：

   | 欄位 | 值 |
   | --- | --- |
   | Framework preset | Other |
   | Branch | `main` |
   | Node version | 24.x |
   | Root directory | `./` |
   | Build command | `npm run build` |
   | Package manager | npm |
   | Output directory | 留空（前端由 Express 提供，不是純靜態網站） |
   | Entry file | `backend/src/server.js` |

   Hostinger 會讀 `.env.example` 自動帶入變數名稱，其中 `DB_ROOT_PASSWORD`、`DB_PORT_HOST` 只給本機 Docker 用，要刪掉。
7. ✅️ 在 **Review build settings → Environment variables** 填入下列環境變數（可以逐筆新增，也可以匯入 `.env` 檔；正式環境的 `.env` 只放在自己電腦，不進版本控制）。建立 Web App 時資料庫還不存在，`DB_*` 先不填，第一次部署 API 會因為缺少環境變數而啟動失敗；第 3 步建好資料庫後，到網站管理頁的 **Environment variables** 補上 `DB_*`，再到 **Deployments** 按 **Redeploy**。

   | 變數 | 值 |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DB_HOST` | `localhost`（Web App 與資料庫在同一台主機；資料庫頁面顯示的 `srvXXXX.hstgr.io` 是給外部連線用的） |
   | `DB_PORT` | `3306` |
   | `DB_NAME`、`DB_USER`、`DB_PASSWORD` | 第 3 步建立的資料庫資訊（含 `u數字_` 前綴） |
   | `SESSION_SECRET` | 用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 產生新的 |
   | `COOKIE_SECURE` | `true` |
   | `TRUST_PROXY` | `1` |
   | `FRONTEND_DIST` | `../frontend/dist` |

   `PORT` 由 Hostinger 指定，不要自己填死。
8. ✅️ 部署 Web App，並把網域指到這個 Web App：網站 Dashboard 會出現「Domain isn't connected」，按 **Check guide** → 切到 **Connect via DNS records**（不要用 Nameservers 分頁），照顯示的值到網域商新增一筆 A 記錄（名稱 `trello`、值為主機 IP），原有記錄都不動。驗證 `nslookup trello.你的網域 8.8.8.8` 回傳該 IP 後，回到 guide 按 **I've updated DNS records**，Hostinger 會自動安裝免費的 Lifetime SSL（**Security → SSL** 從 Installing 變成 Active，約十幾分鐘），之後 `http://` 會自動 301 轉到 `https://`。SSL 裝好之前網頁會是白的（CSP 的 `upgrade-insecure-requests` 讓 JS 改走還不能用的 https），登入也會失敗（Cookie 設了 `Secure`），屬於正常現象。

### 三、執行 migration

9. ✅️ 用下面其中一種方式執行 `npm run migrate`（`knex migrate:latest`），建立 `users`、`cards`、`sessions` 資料表：
   - **SSH**：用 hPanel 的 SSH 登入，到 Web App 的 `backend/` 目錄執行。Web App 的環境變數是給執行中的應用程式用的，SSH 終端機不一定讀得到，要在同一行指令帶入 `DB_*` 與 `SESSION_SECRET`（`config.js` 會檢查這幾個變數）。
   - **從本機連線**（實際採用）：資料庫頁面的 **External connections** → **Allow IP**，選 **Specific IP address** 填自己電腦的對外 IP（不要選 Any IP address），然後在專案根目錄用本機的 Docker 執行（`DB_HOST` 用資料庫頁面顯示的外部主機名稱）：

     ```bash
     docker compose run --rm -e DB_HOST=srvXXXX.hstgr.io -e DB_NAME=u數字_trello -e DB_USER=u數字_trello -e DB_PASSWORD="資料庫密碼" api npm run migrate
     ```

     看到 `Batch 1 run: 3 migrations` 就完成了。做完回到 External connections 把剛才的 IP 刪掉。

   驗證：phpMyAdmin 看得到三張資料表與 `knex_migrations` 的紀錄。之後每次有新的 migration，部署後都要再執行一次。

### 四、驗證

10. ✅️ `https://trello.你的網域/api/v1/health` 回 `200` 與 `{ "status": "ok" }`，瀏覽器網址列顯示安全的 HTTPS。
11. ✅️ `https://trello.你的網域/` 看得到 Vue 畫面；直接開 `https://trello.你的網域/login` 並重新整理，不會 404。
12. ✅️ 檢查正式環境的回應：`curl -i` 打一個不存在的 API 路徑（例如 `/api/v1/nope`）與一個會出錯的情境，確認回的是 JSON 錯誤格式、沒有錯誤堆疊，也沒有 `X-Powered-By: Express` 標頭；回應有 `Strict-Transport-Security`、`Content-Security-Policy`、`X-Frame-Options: DENY`、`X-Content-Type-Options`、`Referrer-Policy` 等 helmet 加上的標頭（頁面、API、前端靜態檔都由 Express 提供，所以都有）。

    > Hostinger 會在回應另外加上 `Server: LiteSpeed`、`platform: hostinger`、`panel: hpanel`，以及第二個 `Content-Security-Policy: upgrade-insecure-requests`。前者是主機層加的，程式移除不了；後者跟我們的 CSP 同時生效（瀏覽器兩條都要符合），內容已經包含在我們的 CSP 裡，沒有影響。
13. 登入後在瀏覽器開發者工具確認 Session Cookie 與 `csrf_token` Cookie 都有 `Secure`；Console 沒有 Content-Security-Policy 擋掉資源的錯誤。
14. 確認 `trust proxy` 設定正確：連續登入失敗觸發速率限制後，用另一個網路（例如手機熱點）登入不受影響。如果另一個網路也被擋，代表所有人被當成同一個 IP，要調整 `TRUST_PROXY`。
15. 在正式網址完整走一次：註冊 → 登入 → 新增卡片 → 編輯 → 拖到別欄 → 重新整理確認順序 → 刪除 → 登出。

### 五、維運

16. 備份：確認 hPanel 的每日自動備份有包含資料庫；另外定期從 phpMyAdmin 匯出資料庫（SQL 檔）下載到自己的電腦。
17. **實際演練一次還原**：在本機用匯出的 SQL 檔還原到一個空的資料庫，確認資料完整。沒有實際還原過的備份，不能算是備份。
18. ✅️ 看 log 的位置：

    | log | 位置 |
    | --- | --- |
    | 建置 log（`npm run build` 的輸出） | Website Dashboard → Deployments → 選擇某次部署 |
    | 執行 log（API 的 stdout，例如 `API listening on port ...`） | Website Dashboard → Runtime logs |
    | Node.js 原始錯誤（啟動失敗、未處理的例外） | File Manager → `domains/你的網域/hbuilds/current/nodejs/stderr.log` |

    部署後開不起來時，先看建置 log 確認建置成功，再看 `stderr.log`（例如 `config.js` 丟出「缺少必要的環境變數」）。
19. ✅️ 更新流程：Web App 預設開啟自動部署（Dashboard 的 **Auto-deployment**），push 到 `main` 就會自動建置並部署，在 **Deployments** 看得到每一次的 commit 與結果；有新的 migration 時，部署後再執行第 9 步。
20. ✅️ README 補上正式網址。
