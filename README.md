# Trello Full Stack

🔗 線上網站：<https://trello.annie-clickforce.xyz>　<sub>2026-11-13 上線</sub>

個人用的看板（Kanban）任務管理工具。註冊登入後就是自己的看板，分成「待辦」「進行中」「完成」三欄，把要做的事寫成卡片，用拖拉的方式在欄內排序、移到下一個階段。

## 功能

- 註冊、登入、登出
- 看板上方顯示待辦／進行中的數量與完成進度
- 從看板上方新增卡片（標題、說明），新卡片放進「待辦」最上面
- 卡片直接在看板上編輯，不用另開頁面
- 刪除前跳出確認視窗
- 拖拉卡片調整順序，或拖到其他欄；順序立即儲存，重新整理後維持不變
- 每個帳號的卡片只有自己看得到，不提供分享

> 已部署到 Hostinger（Node.js Web App + MariaDB，HTTPS），push 到 `main` 會自動重新部署；部署步驟見 [docs/deployment.md](docs/deployment.md)。

## 技術選型

| 項目 | 選擇 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router、`vuedraggable` |
| 後端 | Node.js 24 LTS + Express 5（JavaScript ES Modules） |
| 資料庫存取 | Knex（query builder + migration）+ `mysql2` |
| 資料庫 | MariaDB 11.4 |
| 認證 | `express-session`（Session 存在資料庫）、CSRF 防護（Synchronizer Token）、Argon2 密碼雜湊、登入速率限制 |
| 開發環境 | Docker Compose（前端、API、資料庫各一個容器，一個指令啟動） |
| 部署 | Hostinger Unlimited Web Hosting（Node.js Web App + MariaDB，HTTPS 由 Hostinger 代管） |

選型理由見 [docs/architecture.md](docs/architecture.md)「技術選型」。

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 系統架構、技術選型、擁有權檢查、目錄結構、本機 Docker 服務 |
| [docs/api.md](docs/api.md) | REST API 規格（認證、CSRF、卡片、錯誤格式） |
| [docs/database.md](docs/database.md) | 資料表設計與排序（position）的做法 |
| [docs/roadmap.md](docs/roadmap.md) | 本機開發路線圖 |
| [docs/deployment.md](docs/deployment.md) | 部署架構與步驟（Hostinger Web App） |

## 本機開發

本機開發環境全部用 Docker Compose 管理，電腦上只需要安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)，不用另外安裝 Node.js 或 MariaDB。

| 服務 | 內容 | 本機連接埠 |
| --- | --- | --- |
| `frontend` | Vue 3 + Vite 開發伺服器 | `3020`（瀏覽器開這個） |
| `api` | Node.js + Express | `3021` |
| `db` | MariaDB 11.4 | `3308`（給 DBeaver 等資料庫工具連線） |

### 第一次啟動

1. 建立環境變數檔，並修改裡面的密碼與 `SESSION_SECRET`：

   ```bash
   cp .env.example .env
   # 產生一組隨機的 SESSION_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. 建置並啟動所有服務：

   ```bash
   docker compose up -d --build
   ```

3. 建立資料表（第一次啟動，或之後有新的 migration 時執行）：

   ```bash
   docker compose exec api npm run migrate
   ```

4. 瀏覽器開 <http://localhost:3020>，註冊一個帳號後登入。

確認 API 正常：<http://localhost:3021/api/v1/health> 會回傳 `{"status":"ok"}`。

### 用資料庫工具連線

DBeaver 等工具選 MariaDB，連 `localhost:3308`，資料庫、帳號、密碼為 `.env` 裡的 `DB_NAME`、`DB_USER`、`DB_PASSWORD`。
