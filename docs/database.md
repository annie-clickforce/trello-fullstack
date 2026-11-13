# 資料庫設計

本專案使用 MariaDB（本機開發與 VPS 正式環境都用 Docker 的 `mariadb:11.4` 映像檔，11.4 是長期支援版本）。選 MariaDB 是為了讓程式可以直接搬到 **Hostinger Cloud Startup**（只提供 MariaDB／MySQL 相容資料庫，見 [architecture.md](architecture.md)「搬到 Hostinger Cloud Startup」），本機、VPS、Cloud 用同一種資料庫，才不會出現「本機測過、上線才壞」的差異。

資料表由 Knex migration 建立（`backend/migrations/` 裡每個檔案描述一次結構變更，`npx knex migrate:make <名稱>` 產生新檔，`npm run migrate`（即 `knex migrate:latest`）執行）。

- **相容性**：Hostinger Cloud 上的 MariaDB／MySQL 版本不一定跟本機一樣新，所以只使用 MariaDB 10.6 與 MySQL 8.0 都支援的功能（例如**不用** MariaDB 10.7 才有的原生 `UUID` 型別）。
- **連線**：API 與 migration 都從環境變數 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` 讀取連線資訊（跟 hPanel 提供資料庫資訊的方式一致），驅動用 `mysql2`。
- **編碼**：資料庫與資料表一律 `utf8mb4` + `utf8mb4_unicode_ci`，中文與 emoji 都能正常儲存（MySQL 舊的 `utf8` 只有 3 bytes，存不了 emoji）。引擎用 InnoDB（支援交易、外鍵、列鎖定）。
- **主鍵**：採用 UUID，存成 `CHAR(36)`（字元集 `ascii`，比 `utf8mb4` 省空間），由程式用 `crypto.randomUUID()` 產生後寫入。MySQL 不支援 `INSERT ... RETURNING`（MariaDB 10.5 起才有），為了兩邊都能用，id 先在程式產生，新增後直接用這個 id 查回完整資料。
- **時間**：時間欄位用 `DATETIME(3)`（精確到毫秒），**一律存 UTC**。`DATETIME` 本身不帶時區，所以連線時要設定 `timezone: 'Z'`（`mysql2` 讀寫 `Date` 都當成 UTC），並在每條連線建立時執行 `SET time_zone = '+00:00'`（讓 `CURRENT_TIMESTAMP` 也是 UTC）。`created_at`、`updated_at` 預設值都是 `CURRENT_TIMESTAMP(3)`；**更新資料時由程式寫入 `updated_at`**（不用 `ON UPDATE CURRENT_TIMESTAMP`，讓行為都看得到）。
- **命名**：資料表用複數（`users`、`boards`、`lists`、`cards`），欄位用 `snake_case`，與 API 的 JSON 欄位一致，查出來直接就是回應格式，不需要轉換。
- **外鍵刪除**：外鍵設定 `ON DELETE CASCADE`，由**資料庫**負責連帶刪除，不管從 API、phpMyAdmin 還是直接用 SQL 刪除，結果都一致。
- **migration 只用 Knex 產生**：不要手動到資料庫（包含 phpMyAdmin）建表或改欄位；已經在正式環境跑過的 migration 不要修改，要改就新增一個 migration。每個 migration 都要寫 `down`（還原），開發時可以用 `knex migrate:rollback` 確認能正確還原。注意 MariaDB／MySQL 的 DDL（`CREATE TABLE`、`ALTER TABLE`）不能包在交易裡回滾，migration 跑到一半失敗時要手動清理，所以一個 migration 只做一件事。

## `users`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `char(36)` | PK | 使用者識別碼（UUID）。 |
| `name` | `varchar(100)` | NOT NULL | 顯示名稱。 |
| `email` | `varchar(255)` | NOT NULL、UNIQUE | 登入帳號，儲存前去除前後空白並轉小寫。 |
| `password_hash` | `varchar(255)` | NOT NULL | Argon2id 雜湊結果（PHC 格式字串，例如 `$argon2id$v=19$m=...,t=...,p=...$salt$hash`，演算法、參數、salt 都在字串裡）。 |
| `created_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 建立時間（UTC）。 |
| `updated_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 最後更新時間（UTC）。 |

`password_hash` 絕對不能出現在 API 回應裡：查詢使用者時明確列出要回傳的欄位（`select('id', 'name', 'email', 'created_at')`），不要 `select *` 後再整包回傳。

## `boards`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `char(36)` | PK | 看板識別碼。 |
| `owner_id` | `char(36)` | NOT NULL、FK → `users.id`，`ON DELETE CASCADE` | 擁有者。 |
| `title` | `varchar(100)` | NOT NULL | 看板名稱。 |
| `created_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 建立時間。 |
| `updated_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 最後更新時間。 |

建立索引 `(owner_id, created_at)`，支援「取得目前使用者的看板清單，依建立時間排序」（這個索引也滿足外鍵需要的索引，InnoDB 不會再另外建一個）。

## `lists`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `char(36)` | PK | 列表識別碼。 |
| `board_id` | `char(36)` | NOT NULL、FK → `boards.id`，`ON DELETE CASCADE` | 所屬看板。 |
| `title` | `varchar(100)` | NOT NULL | 列表名稱，例如「待辦」。 |
| `position` | `int unsigned` | NOT NULL | 在看板內的順序，從 `0` 開始，見下方「排序」。用 `unsigned`，資料庫本身就不接受負數。 |
| `created_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 建立時間。 |
| `updated_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 最後更新時間。 |

唯一約束 `uniq_list_position`：`(board_id, position)`。這個約束同時會建立索引（也滿足 `board_id` 外鍵需要的索引），不需要另外加。

## `cards`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `char(36)` | PK | 卡片識別碼。 |
| `list_id` | `char(36)` | NOT NULL、FK → `lists.id`，`ON DELETE CASCADE` | 所屬列表。 |
| `title` | `varchar(255)` | NOT NULL | 卡片標題。 |
| `description` | `text` | NOT NULL | 補充說明。用空字串表示「沒有內容」，不使用 `NULL`，前端就不用同時處理兩種「空」。MySQL 的 `TEXT` 欄位不能設預設值，所以新增時由程式寫入空字串。 |
| `position` | `int unsigned` | NOT NULL | 在列表內的順序，從 `0` 開始，見下方「排序」。 |
| `created_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 建立時間。 |
| `updated_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 最後更新時間。 |

唯一約束 `uniq_card_position`：`(list_id, position)`。

`lists`、`cards` 都不存擁有者，擁有權沿著 `card → list → board → owner` 往上追（見 [architecture.md](architecture.md)「擁有權檢查」），避免同一份資訊存在多個地方、移動卡片時還要同步更新。

## 排序（position）

列表與卡片的順序用 `position` 欄位表示，規則如下：

- 同一個看板內的列表、同一個列表內的卡片，`position` 是從 `0` 開始的**連續整數**（0、1、2…），就是在畫面上的索引。
- 所有會改變 position 的操作（新增、移動、刪除）都用 `db.transaction(async (trx) => { ... })` 在一個交易裡完成，交易內的每個查詢都要用 `trx`，不能用外面的 `db`；而且第一步一律用 `trx('boards').where({ id }).forUpdate().first()` 鎖定所屬的**看板**那一列（`SELECT ... FOR UPDATE`），讓同一個看板裡的排序操作一個一個排隊執行。
- **新增**：鎖定看板後，放在最後面，`position = 目前數量`。沒有鎖定的話，兩個同時新增的請求會算出相同的 position，其中一個會被唯一約束擋下。
- 傳入的 `position` 超出範圍時，後端自動夾在 `0` 到「最後一個位置」之間。

### 為什麼更新時要指定順序（`UPDATE ... ORDER BY`）

MariaDB／MySQL 的唯一約束是**每更新一列就立刻檢查**。例如列表裡有 position 0、1、2 三張卡片，要把 1、2 都 +1 騰出空位：如果資料庫先更新 position 1 那列，它會變成 2，跟還沒更新的那列撞號，整句 SQL 直接失敗。

解法是**指定更新順序**，讓每一列移動時，目標位置都已經空出來：

- 往後挪（`position + 1`）：從**最大的**開始更新（`ORDER BY position DESC`），2 先變 3，1 再變 2。
- 往前補（`position - 1`）：從**最小的**開始更新（`ORDER BY position ASC`）。

`UPDATE ... ORDER BY` 是 MariaDB／MySQL 的語法（PostgreSQL 沒有），Knex 在 `mysql2` 底下可以把 `.orderBy()` 接在 `.increment()`／`.decrement()` 前面使用；實作時用 `.toString()` 印出產生的 SQL，確認真的有 `ORDER BY`，沒有的話改用 `trx.raw()` 自己寫這句 SQL。被移動的項目本身則先「停」到一個一定沒人用的位置（`目前數量`，也就是最後一個位置的下一號），讓出原本的位置，最後再寫入新位置。

> 對照：PostgreSQL 可以把唯一約束設成「延遲到交易提交時才檢查」（`DEFERRABLE INITIALLY DEFERRED`），就不用在意更新順序；MariaDB／MySQL 沒有這個功能，所以改用指定順序的做法。兩種做法的目標一樣：**讓資料庫本身保證 position 不會重複**，排序邏輯寫錯時 SQL 會失敗、整個交易回滾，而不是默默存進重複的資料。

### 移動步驟

**同一個父層內移動**（列表在看板內、卡片在列表內），項目從 `from` 移到 `to`，父層目前有 `n` 個項目：

1. 鎖定看板（見上方）。`to` 夾在 `0`～`n-1`；`from == to` 時直接結束。
2. 把被移動的項目暫時改到 `position = n`（讓出 `from`）。
3. 把 `from` 後面的項目往前補：`position > from` 且不是被移動項目的，`position - 1`，`ORDER BY position ASC`。
4. 在 `to` 騰出空位：`position >= to` 且不是被移動項目的，`position + 1`，`ORDER BY position DESC`。
5. 把被移動的項目寫入 `position = to`。

**卡片移到另一個列表**（原列表有 `n` 張、目標列表有 `m` 張，目標位置 `to` 夾在 `0`～`m`）：

1. 鎖定看板。
2. 把卡片暫時改到原列表的 `position = n`，原列表 `position > from` 的卡片 `position - 1`（`ORDER BY position ASC`）。
3. 目標列表 `position >= to` 的卡片 `position + 1`（`ORDER BY position DESC`）。
4. 把卡片寫入新的 `list_id` 與 `position = to`。

**刪除**：鎖定看板後刪除該筆，再把後面的項目 `position - 1`（`ORDER BY position ASC`）。

這些步驟寫成 `src/ordering.js` 裡的共用函式，列表與卡片共用（驗證方式見 [roadmap.md](roadmap.md) 第五階段）。

### 為什麼用連續整數

這個做法每次移動要更新多筆資料，但一個列表通常只有幾十張卡片，影響不大，好處是邏輯直觀、`position` 跟畫面索引一致、容易驗證。另一種常見做法是用小數（例如插在 1000 和 2000 中間就用 1500），移動只要更新一筆，但數字會越插越密、需要定期重新編號，目前不採用。

## 其他資料表

| 資料表 | 用途 |
| --- | --- |
| `sessions` | 登入 Session，由 `express-mysql-session` 使用（欄位 `session_id`、`expires`、`data`）。**用自己的 Knex migration 建立**（照套件文件提供的結構），關閉套件的 `createDatabaseTable`，讓所有資料表都由 migration 管理。過期的 Session 由套件定期自動清除。 |
| `knex_migrations`、`knex_migrations_lock` | Knex 自動建立，記錄跑過哪些 migration，以及避免兩個地方同時執行 migration。 |

## 關聯

```text
users  1 --- N boards
boards 1 --- N lists
lists  1 --- N cards
```

刪除使用者會連帶刪除其看板；刪除看板會連帶刪除其列表；刪除列表會連帶刪除其卡片（由資料庫的 `ON DELETE CASCADE` 處理）。

## 連線與帳號

MariaDB 容器用 `MARIADB_DATABASE`、`MARIADB_USER`、`MARIADB_PASSWORD`、`MARIADB_ROOT_PASSWORD` 初始化；API 用 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` 連線（在 `docker-compose.yml` 裡由前面幾個值帶入；搬到 Hostinger Cloud 時改填 hPanel 提供的值）。API 使用一般帳號，不用 root。不可將正式環境密碼納入版本控制。

VPS 正式環境的資料庫只在 Docker 內部網路，不對外開放；每日備份方式見 [roadmap.md](roadmap.md) 第十階段。
