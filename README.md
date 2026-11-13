# Trello Full Stack

個人用的看板（Kanban）任務管理工具。註冊登入後，可以建立多個看板，在看板裡用「列表」區分階段（例如待辦、進行中、完成），再把任務寫成「卡片」放進列表，用拖拉調整順序、把卡片移到其他列表。

## 功能

- 註冊、登入、登出
- 看板：建立、改名、刪除
- 列表：新增、改名、刪除、左右拖拉排序
- 卡片：新增、編輯標題與說明、刪除、上下拖拉排序、拖到其他列表
- 拖拉後順序立即儲存，重新整理後維持不變
- 每個帳號的看板只有自己看得到，不提供分享

> 目前開發中，進度見 [docs/roadmap.md](docs/roadmap.md)。

## 技術選型

| 項目 | 選擇 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router、`vuedraggable` |
| 後端 | Node.js 24 LTS + Express 5（JavaScript ES Modules） |
| 資料庫存取 | Knex（query builder + migration）+ `mysql2` |
| 資料庫 | MariaDB 11.4 |
| 認證 | `express-session`（Session 存在資料庫）、CSRF 防護（Synchronizer Token）、Argon2 密碼雜湊、登入速率限制 |
| 部署 | Hostinger VPS + Docker Compose + Caddy（保留改部署到 Hostinger Cloud Startup 的彈性） |

選型理由見 [docs/architecture.md](docs/architecture.md)「技術選型」。

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 系統架構、技術選型、擁有權檢查、目錄結構、本機 Docker 服務 |
| [docs/api.md](docs/api.md) | REST API 規格（認證、CSRF、看板、列表、卡片、錯誤格式） |
| [docs/database.md](docs/database.md) | 資料表設計與排序（position）的做法 |
| [docs/roadmap.md](docs/roadmap.md) | 本機開發路線圖與目前進度 |
| [docs/deployment.md](docs/deployment.md) | 部署架構與步驟（Hostinger VPS／Cloud Startup） |

## 本機開發

啟動方式（`docker compose up`）將於專案初始化完成後補上。

本機連接埠：`3020`（前端）、`3021`（API）、`3307`（MariaDB）。
