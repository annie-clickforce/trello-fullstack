# 資料庫設計

本專案使用 PostgreSQL 17（本機開發與正式環境都用 Docker 的 `postgres:17` 映像檔）。資料表由 Knex migration 建立（`backend/migrations/` 裡每個檔案描述一次結構變更，`npx knex migrate:make <名稱>` 產生新檔，`npm run migrate`（即 `knex migrate:latest`）執行），資料庫編碼為 `UTF8`，中文與 emoji 都能正常儲存。

- **連線**：API、migration、測試都用 `DATABASE_URL` 一個連線字串（例如 `postgres://trello:密碼@db:5432/trello`），換成雲端代管資料庫時只改這個值。
- **主鍵**：採用 UUID，使用 PostgreSQL 原生的 `uuid` 型別，預設值 `gen_random_uuid()`（PostgreSQL 13 起內建，不用另外裝擴充套件），新增資料時由資料庫產生，用 `INSERT ... RETURNING *` 拿回完整資料。
- **時間**：時間欄位一律用 `timestamp with time zone`（`timestamptz`），以 UTC 儲存；`pg` 驅動會把它讀成 JavaScript 的 `Date`，API 回應時輸出 ISO 8601 UTC 格式。`created_at`、`updated_at` 預設值都是 `now()`；**更新資料時由程式寫入 `updated_at = now()`**（不用 trigger，讓行為都看得到）。
- **命名**：資料表用複數（`users`、`boards`、`lists`、`cards`），欄位用 `snake_case`，與 API 的 JSON 欄位一致，查出來直接就是回應格式，不需要轉換。
- **外鍵刪除**：外鍵設定 `ON DELETE CASCADE`，由**資料庫**負責連帶刪除，不管從 API 還是直接用 SQL 刪除，結果都一致。
- **migration 只用 Knex 產生**：不要手動到資料庫建表或改欄位；已經在正式環境跑過的 migration 不要修改，要改就新增一個 migration。每個 migration 都要寫 `down`（還原），開發時可以用 `knex migrate:rollback` 測試。

## `users`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK，預設 `gen_random_uuid()` | 使用者識別碼。 |
| `name` | `varchar(100)` | NOT NULL | 顯示名稱。 |
| `email` | `varchar(255)` | NOT NULL、UNIQUE | 登入帳號，儲存前去除前後空白並轉小寫。 |
| `password_hash` | `varchar(255)` | NOT NULL | Argon2id 雜湊結果（PHC 格式字串，例如 `$argon2id$v=19$m=...,t=...,p=...$salt$hash`，演算法、參數、salt 都在字串裡）。 |
| `created_at` | `timestamptz` | NOT NULL，預設 `now()` | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL，預設 `now()` | 最後更新時間。 |

`password_hash` 絕對不能出現在 API 回應裡：查詢使用者時明確列出要回傳的欄位（`select('id', 'name', 'email', 'created_at')`），不要 `select *` 後再整包回傳。

## `boards`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK，預設 `gen_random_uuid()` | 看板識別碼。 |
| `owner_id` | `uuid` | NOT NULL、FK → `users.id`，`ON DELETE CASCADE` | 擁有者。 |
| `title` | `varchar(100)` | NOT NULL | 看板名稱。 |
| `created_at` | `timestamptz` | NOT NULL，預設 `now()` | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL，預設 `now()` | 最後更新時間。 |

建立索引 `(owner_id, created_at)`，支援「取得目前使用者的看板清單，依建立時間排序」。

## `lists`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK，預設 `gen_random_uuid()` | 列表識別碼。 |
| `board_id` | `uuid` | NOT NULL、FK → `boards.id`，`ON DELETE CASCADE` | 所屬看板。 |
| `title` | `varchar(100)` | NOT NULL | 列表名稱，例如「待辦」。 |
| `position` | `integer` | NOT NULL、`CHECK (position >= 0)` | 在看板內的順序，從 `0` 開始，見下方「排序」。 |
| `created_at` | `timestamptz` | NOT NULL，預設 `now()` | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL，預設 `now()` | 最後更新時間。 |

唯一約束 `uniq_list_position`：`(board_id, position)`，**延遲到交易提交時才檢查**（`DEFERRABLE INITIALLY DEFERRED`）。這個約束同時會建立索引，不需要另外加。Knex 的寫法：

```js
table.unique(['board_id', 'position'], {
  indexName: 'uniq_list_position',
  deferrable: 'deferred',
});
table.check('?? >= 0', ['position'], 'chk_list_position');
```

## `cards`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK，預設 `gen_random_uuid()` | 卡片識別碼。 |
| `list_id` | `uuid` | NOT NULL、FK → `lists.id`，`ON DELETE CASCADE` | 所屬列表。 |
| `title` | `varchar(255)` | NOT NULL | 卡片標題。 |
| `description` | `text` | NOT NULL、預設空字串 | 補充說明。用空字串表示「沒有內容」，不使用 `NULL`，前端就不用同時處理兩種「空」。 |
| `position` | `integer` | NOT NULL、`CHECK (position >= 0)` | 在列表內的順序，從 `0` 開始，見下方「排序」。 |
| `created_at` | `timestamptz` | NOT NULL，預設 `now()` | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL，預設 `now()` | 最後更新時間。 |

唯一約束 `uniq_card_position`：`(list_id, position)`，同樣延遲到交易提交時才檢查。

`lists`、`cards` 都不存擁有者，擁有權沿著 `card → list → board → owner` 往上追（見 [architecture.md](architecture.md)「擁有權檢查」），避免同一份資訊存在多個地方、移動卡片時還要同步更新。

## 排序（position）

列表與卡片的順序用 `position` 欄位表示，規則如下：

- 同一個看板內的列表、同一個列表內的卡片，`position` 是從 `0` 開始的**連續整數**（0、1、2…），就是在畫面上的索引。
- **新增**：放在最後面，`position = 目前數量`。新增也要在交易裡先鎖定看板（同下方第 1 步），否則兩個同時新增的請求會算出相同的 position，交易提交時被唯一約束擋下。
- **移動**（同一個父層內調整順序，或卡片移到另一個列表）：用 `db.transaction(async (trx) => { ... })` 在一個交易裡完成，交易內的每個查詢都要用 `trx`，不能用外面的 `db`：
  1. 用 `trx('boards').where({ id }).forUpdate().first()` 鎖定所屬的**看板**那一列（`SELECT ... FOR UPDATE`），避免同時有其他請求在移動同一個看板裡的東西。
  2. 原本位置後面的項目 `position - 1`（把空位補起來）。
  3. 目標位置之後（含）的項目 `position + 1`（騰出空位）。
  4. 把被移動的項目寫入新的 `position`（與新的 `list_id`）。

  第 2、3 步用 Knex 的 `.increment('position', 1)`／`.decrement('position', 1)` 一次更新多筆（產生 `UPDATE ... SET position = position + 1 WHERE ...`），由資料庫直接計算，不用把資料一筆一筆讀出來。
- **刪除**：在交易裡（同樣先鎖定看板）刪除該筆，並把後面的項目 `position - 1`。
- 傳入的 `position` 超出範圍時，後端自動夾在 `0` 到「最後一個位置」之間。

### 為什麼唯一約束要「延遲檢查」

移動過程中，position 會短暫出現重複（例如把後面的項目 +1 時，還沒寫入被移動項目的新位置）。一般的唯一約束是**每一行 SQL 執行完就檢查**，會讓交易中途失敗；PostgreSQL 的延遲約束（`DEFERRABLE INITIALLY DEFERRED`）改成**交易提交時才檢查**，中間狀態可以暫時重複，但只要最後結果有重複（代表排序邏輯寫錯），整個交易就會失敗並回滾。這樣資料庫本身就能保證 position 不會重複，不只靠程式邏輯。

> 延遲約束是 PostgreSQL 的功能，MySQL 沒有，這也是本專案改用 PostgreSQL 的理由之一。

這個做法每次移動要更新多筆資料，但一個列表通常只有幾十張卡片，影響不大，好處是邏輯直觀、`position` 跟畫面索引一致、容易驗證。另一種常見做法是用小數（例如插在 1000 和 2000 中間就用 1500），移動只要更新一筆，但數字會越插越密、需要定期重新編號，目前不採用。

## 其他資料表

| 資料表 | 用途 |
| --- | --- |
| `session` | 登入 Session，由 `connect-pg-simple` 使用（欄位 `sid`、`sess`（`json`）、`expire`）。**用自己的 Knex migration 建立**（照套件文件提供的結構），不開啟套件的 `createTableIfMissing`，讓所有資料表都由 migration 管理。過期的 Session 由套件定期自動清除。 |
| `knex_migrations`、`knex_migrations_lock` | Knex 自動建立，記錄跑過哪些 migration，以及避免兩個地方同時執行 migration。 |

## 關聯

```text
users  1 --- N boards
boards 1 --- N lists
lists  1 --- N cards
```

刪除使用者會連帶刪除其看板；刪除看板會連帶刪除其列表；刪除列表會連帶刪除其卡片（由資料庫的 `ON DELETE CASCADE` 處理）。

## 連線與帳號

連線資訊透過環境變數提供：PostgreSQL 容器用 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD` 初始化，API 用 `DATABASE_URL` 連線（在 `docker-compose.yml` 裡由前面幾個值組成）。不可將正式環境密碼納入版本控制。

測試使用另一個資料庫（例如 `trello_test`，用 `TEST_DATABASE_URL` 指定），測試前先跑 migration，每個測試開始前清空資料表，不會動到開發資料。

正式環境的資料庫只在 Docker 內部網路，不對外開放；每日備份方式見 [roadmap.md](roadmap.md) 第十階段。
