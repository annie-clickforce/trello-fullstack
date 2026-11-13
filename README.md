# Trello Full Stack

Trello 風格的看板（Kanban）應用：使用者可以建立看板，在看板裡新增列表與卡片，並用拖拉調整順序、把卡片移到別的列表。

這是一個學習型專案，重點在後端：資料建模、權限控管（只能存取自己的資料）、交易與排序的一致性、資安（Session、CSRF、密碼雜湊、速率限制）、自動化測試與 CI，以及自己架設與維運 VPS。

> **目前進度：規劃階段**。規格與開發步驟已寫成文件，尚未開始寫程式。實際進度以 [docs/roadmap.md](docs/roadmap.md) 的打勾狀態為準。

## 技術選型

| 項目 | 選擇 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router、`vuedraggable` |
| 後端 | Node.js 24 LTS + Express 5（JavaScript ES Modules） |
| 資料庫存取 | Knex（query builder + migration）+ `mysql2` |
| 資料庫 | MariaDB 11.4 |
| 認證 | `express-session`（Session 存在資料庫）+ 自己寫的 CSRF middleware，密碼用 Argon2 |
| 測試／CI | Vitest + Supertest、ESLint + Prettier、GitHub Actions |
| 部署 | Hostinger VPS + Docker Compose + Caddy（保留改部署到 Hostinger Cloud Startup 的彈性） |

選型理由見 [docs/architecture.md](docs/architecture.md)「技術選型」。

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 系統架構、技術選型、擁有權檢查、目錄結構、Docker 服務、搬到 Hostinger Cloud Startup 的做法 |
| [docs/api.md](docs/api.md) | REST API 規格（認證、CSRF、看板、列表、卡片、錯誤格式） |
| [docs/database.md](docs/database.md) | 資料表設計與排序（position）的做法 |
| [docs/roadmap.md](docs/roadmap.md) | 一步一步的開發路線圖與目前進度 |

## 本機開發

尚未開始實作。完成 [roadmap](docs/roadmap.md) 第一階段後，這裡會補上啟動方式（`docker compose up`）、如何跑測試，以及 CI 狀態徽章。

預計使用的本機連接埠：`3020`（前端）、`3021`（API）、`3307`（MariaDB）。

## 參考

本專案參考先前完成的 [todo-fullstack](https://github.com/annie-clickforce/todo-fullstack)（Vue 3 + Laravel 8 + MySQL），全新建立、不複製其檔案。
