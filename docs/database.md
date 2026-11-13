# 資料庫設計

本專案使用 MariaDB（本機開發用 Docker 的 `mariadb:11.4` 映像檔，11.4 是長期支援版本；正式環境用 Hostinger Unlimited Web Hosting 提供的 MariaDB，見 [deployment.md](deployment.md)）。本機與正式環境用同一種資料庫，才不會出現「本機測過、上線才壞」的差異。

資料表由 Knex migration 建立（`backend/migrations/` 裡每個檔案描述一次結構變更，`npx knex migrate:make <名稱>` 產生新檔，`npm run migrate`（即 `knex migrate:latest`）執行）。

- **相容性**：Hostinger 提供的 MariaDB／MySQL 版本不一定跟本機一樣新，所以只使用 MariaDB 10.6 與 MySQL 8.0 都支援的功能（例如**不用** MariaDB 10.7 才有的原生 `UUID` 型別）。
- **連線**：API 與 migration 都從環境變數 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` 讀取連線資訊（跟 hPanel 提供資料庫資訊的方式一致），驅動用 `mysql2`。
- **編碼**：資料庫與資料表一律 `utf8mb4` + `utf8mb4_unicode_ci`，中文與 emoji 都能正常儲存（MySQL 舊的 `utf8` 只有 3 bytes，存不了 emoji）。引擎用 InnoDB（支援交易、外鍵、列鎖定）。
- **主鍵**：採用 UUID，存成 `CHAR(36)`（字元集 `ascii`，比 `utf8mb4` 省空間），由程式用 `crypto.randomUUID()` 產生後寫入。MySQL 不支援 `INSERT ... RETURNING`（MariaDB 10.5 起才有），為了兩邊都能用，id 先在程式產生，新增後直接用這個 id 查回完整資料。
- **時間**：時間欄位用 `DATETIME(3)`（精確到毫秒），**一律存 UTC**。`DATETIME` 本身不帶時區，所以連線時要設定 `timezone: 'Z'`（`mysql2` 讀寫 `Date` 都當成 UTC），並在每條連線建立時執行 `SET time_zone = '+00:00'`（讓 `CURRENT_TIMESTAMP` 也是 UTC）。`created_at`、`updated_at` 預設值都是 `CURRENT_TIMESTAMP(3)`；**更新資料時由程式寫入 `updated_at`**（不用 `ON UPDATE CURRENT_TIMESTAMP`，讓行為都看得到）。
- **命名**：資料表用複數（`users`、`cards`），欄位用 `snake_case`，與 API 的 JSON 欄位一致，查出來直接就是回應格式，不需要轉換。
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

## `cards`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `char(36)` | PK | 卡片識別碼。 |
| `user_id` | `char(36)` | NOT NULL、FK → `users.id`，`ON DELETE CASCADE` | 擁有者。 |
| `title` | `varchar(255)` | NOT NULL | 卡片標題。 |
| `description` | `text` | NOT NULL | 補充說明。用空字串表示「沒有內容」，不使用 `NULL`，前端就不用同時處理兩種「空」。MySQL 的 `TEXT` 欄位不能設預設值，所以新增時由程式寫入空字串。 |
| `status` | `enum('todo','doing','done')` | NOT NULL | 卡片所在的欄位（待辦、進行中、完成）。用 `ENUM`，資料庫本身就不接受其他值。 |
| `position` | `int unsigned` | NOT NULL | 在所屬欄位內的順序，從 `0` 開始，見下方「排序」。用 `unsigned`，資料庫本身就不接受負數。 |
| `created_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 建立時間。 |
| `updated_at` | `datetime(3)` | NOT NULL，預設 `CURRENT_TIMESTAMP(3)` | 最後更新時間。 |

唯一約束 `uniq_card_position`：`(user_id, status, position)`，保證同一個使用者的同一欄裡不會有兩張卡片在同一個位置。這個約束同時會建立索引，剛好支援「取得目前使用者的所有卡片，依欄位與順序排列」的查詢，也滿足 `user_id` 外鍵需要的索引，不需要另外加。

## 排序（position）

卡片的順序用 `position` 欄位表示，規則如下：

- 同一個使用者、同一欄（`status`）裡的卡片，`position` 是從 `0` 開始的**連續整數**（0、1、2…），就是在畫面上的索引。
- 所有會改變 position 的操作（新增、移動、刪除）都用 `db.transaction(async (trx) => { ... })` 在一個交易裡完成，交易內的每個查詢都要用 `trx`，不能用外面的 `db`；而且第一步一律用 `trx('users').where({ id: userId }).forUpdate().first()` 鎖定**目前使用者**那一列（`SELECT ... FOR UPDATE`），讓同一個使用者的排序操作一個一個排隊執行。
- **新增**：新卡片一律放在「待辦」欄最上面。鎖定使用者後，先把待辦欄所有卡片 `position + 1`（`ORDER BY position DESC`，原因見下一節），再寫入新卡片 `position = 0`。沒有鎖定的話，兩個同時新增的請求（例如開了兩個分頁）會互相干擾，其中一個會被唯一約束擋下。
- 傳入的 `position` 超出範圍時，後端自動夾在 `0` 到「最後一個位置」之間。

### 為什麼更新時要指定順序（`UPDATE ... ORDER BY`）

MariaDB／MySQL 的唯一約束是**每更新一列就立刻檢查**。例如一欄裡有 position 0、1、2 三張卡片，要把 1、2 都 +1 騰出空位：如果資料庫先更新 position 1 那列，它會變成 2，跟還沒更新的那列撞號，整句 SQL 直接失敗。

解法是**指定更新順序**，讓每一列移動時，目標位置都已經空出來：

- 往後挪（`position + 1`）：從**最大的**開始更新（`ORDER BY position DESC`），2 先變 3，1 再變 2。
- 往前補（`position - 1`）：從**最小的**開始更新（`ORDER BY position ASC`）。

`UPDATE ... ORDER BY` 是 MariaDB／MySQL 的語法，Knex 在 `mysql2` 底下可以把 `.orderBy()` 接在 `.increment()`／`.decrement()` 前面使用；實作時用 `.toString()` 印出產生的 SQL，確認真的有 `ORDER BY`，沒有的話改用 `trx.raw()` 自己寫這句 SQL。被移動的卡片本身則先「停」到一個一定沒人用的位置（`該欄目前數量`，也就是最後一個位置的下一號），讓出原本的位置，最後再寫入新位置。

這樣資料庫本身就能保證 position 不會重複：排序邏輯寫錯時 SQL 會失敗、整個交易回滾，而不是默默存進重複的資料。

### 移動步驟

**同一欄內移動**，卡片從 `from` 移到 `to`，這一欄目前有 `n` 張：

1. 鎖定使用者（見上方）。`to` 夾在 `0`～`n-1`；`from == to` 時直接結束。
2. 把被移動的卡片暫時改到 `position = n`（讓出 `from`）。
3. 把 `from` 後面的卡片往前補：`position > from` 且不是被移動卡片的，`position - 1`，`ORDER BY position ASC`。
4. 在 `to` 騰出空位：`position >= to` 且不是被移動卡片的，`position + 1`，`ORDER BY position DESC`。
5. 把被移動的卡片寫入 `position = to`。

**移到另一欄**（原欄有 `n` 張、目標欄有 `m` 張，目標位置 `to` 夾在 `0`～`m`）：

1. 鎖定使用者。
2. 把卡片暫時改到原欄的 `position = n`，原欄 `position > from` 的卡片 `position - 1`（`ORDER BY position ASC`）。
3. 目標欄 `position >= to` 的卡片 `position + 1`（`ORDER BY position DESC`）。
4. 把卡片寫入新的 `status` 與 `position = to`。

**刪除**：鎖定使用者後刪除該張卡片，再把同一欄後面的卡片 `position - 1`（`ORDER BY position ASC`）。

以上每一句 `UPDATE` 都要帶上 `user_id = 目前使用者` 與 `status = 該欄` 的條件，只動到同一欄的卡片。這些步驟寫成 `src/ordering.js` 裡的共用函式（驗證方式見 [roadmap.md](roadmap.md) 第五階段）。

### 為什麼用連續整數

這個做法每次移動要更新多筆資料，但一欄通常只有幾十張卡片，影響不大，好處是邏輯直觀、`position` 跟畫面索引一致、容易驗證。另一種常見做法是用小數（例如插在 1000 和 2000 中間就用 1500），移動只要更新一筆，但數字會越插越密、需要定期重新編號，目前不採用。

## 其他資料表

| 資料表 | 用途 |
| --- | --- |
| `sessions` | 登入 Session，由 `express-mysql-session` 使用（欄位 `session_id`、`expires`、`data`）。**用自己的 Knex migration 建立**（照套件文件提供的結構），關閉套件的 `createDatabaseTable`，讓所有資料表都由 migration 管理。過期的 Session 由套件定期自動清除。 |
| `knex_migrations`、`knex_migrations_lock` | Knex 自動建立，記錄跑過哪些 migration，以及避免兩個地方同時執行 migration。 |

## 關聯

```text
users 1 --- N cards
```

刪除使用者會連帶刪除其所有卡片（由資料庫的 `ON DELETE CASCADE` 處理）。

## 連線與帳號

MariaDB 容器用 `MARIADB_DATABASE`、`MARIADB_USER`、`MARIADB_PASSWORD`、`MARIADB_ROOT_PASSWORD` 初始化；API 用 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD` 連線（在 `docker-compose.yml` 裡由前面幾個值帶入；正式環境在 hPanel 的 Web App 環境變數填入 hPanel 提供的資料庫資訊）。API 使用一般帳號，不用 root。不可將正式環境密碼納入版本控制。

正式環境的資料庫由 Hostinger 代管，用 phpMyAdmin 管理；遠端連線預設關閉，只在需要時暫時開放自己的 IP。備份與還原方式見 [deployment.md](deployment.md)「維運」。
