# 資料庫設計

本專案使用 PostgreSQL 17（本機開發與正式環境都用 Docker 的 `postgres:17` 映像檔）。資料表由 Django migration 建立（各 app 的 `models.py` 描述資料模型，`python manage.py makemigrations` 產生 migration 檔，`python manage.py migrate` 執行），資料庫編碼為 `UTF8`，中文與 emoji 都能正常儲存。

- **主鍵**：採用 UUID，使用 PostgreSQL 原生的 `uuid` 型別。由 Django 產生（`models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`），資料庫端沒有預設值。
- **時間**：Django 設定 `USE_TZ = True`、`TIME_ZONE = "UTC"`，時間欄位建成 `timestamp with time zone`（`timestamptz`），一律以 UTC 儲存，API 回應時輸出 ISO 8601 UTC 格式。`created_at` 用 `auto_now_add=True`，`updated_at` 用 `auto_now=True`，由 Django 自動寫入。
- **命名**：欄位用 `snake_case`（Python 與 PostgreSQL 的慣例相同，不需要另外對應）。資料表名稱用 Model 的 `Meta.db_table` 指定成簡潔的複數形式（例如 `boards`），不用 Django 預設的 `boards_board`。
- **外鍵刪除**：Model 用 `on_delete=models.CASCADE`。注意 Django 5.2 的 CASCADE 是由 **Django ORM** 執行（刪除時 Django 會先刪掉關聯資料），資料庫的外鍵本身沒有 `ON DELETE CASCADE`。所以刪除資料一律透過 Django（API 或 Admin），不要直接在資料庫下 `DELETE`。
- **migration 只用 Django 產生**：不要手動到資料庫建表或改欄位。

## `users`

自訂使用者模型（`accounts.User`，繼承 Django 的 `AbstractUser`），用 email 登入、移除 `username`。**必須在第一次執行 `migrate` 之前建立並設定 `AUTH_USER_MODEL`**，之後再換會非常麻煩（Django 官方文件也這樣建議）。

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | 使用者識別碼。 |
| `name` | `varchar(100)` | NOT NULL | 顯示名稱。 |
| `email` | `varchar(255)` | NOT NULL、UNIQUE | 登入帳號，儲存前轉小寫並去除前後空白。 |
| `password` | `varchar(128)` | NOT NULL | Django 格式的雜湊密碼（`演算法$參數$salt$hash`），使用 Argon2。 |
| `is_active` | `boolean` | NOT NULL | 帳號是否啟用（Django 內建）。 |
| `is_staff` | `boolean` | NOT NULL | 能否登入 Django Admin（Django 內建）。 |
| `is_superuser` | `boolean` | NOT NULL | 是否擁有所有權限（Django 內建）。 |
| `last_login` | `timestamptz` | NULL | 最後登入時間（Django 內建）。 |
| `created_at` | `timestamptz` | NOT NULL | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL | 最後更新時間。 |

繼承 `AbstractUser` 時，把用不到的 `username`、`first_name`、`last_name` 設為 `None` 移除，並把內建的 `date_joined` 換成 `created_at`。密碼欄位沿用 Django 內建的 `password`（不改名成 `password_hash`），因為 Django 的認證機制依賴這個名稱。

## `boards`

Model：`boards.Board`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | 看板識別碼。 |
| `owner_id` | `uuid` | NOT NULL、FK | 擁有者，參照 `users.id`。 |
| `title` | `varchar(100)` | NOT NULL | 看板名稱。 |
| `created_at` | `timestamptz` | NOT NULL | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL | 最後更新時間。 |

建立索引 `(owner_id, created_at)`，支援「取得目前使用者的看板清單，依建立時間排序」。

## `lists`

Model：`boards.BoardList`（不命名成 `List`，避免跟 Python 內建的 `list` 混淆）

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | 列表識別碼。 |
| `board_id` | `uuid` | NOT NULL、FK | 所屬看板，參照 `boards.id`。 |
| `title` | `varchar(100)` | NOT NULL | 列表名稱，例如「待辦」。 |
| `position` | `integer` | NOT NULL、`CHECK (position >= 0)` | 在看板內的順序，從 `0` 開始，見下方「排序」。 |
| `created_at` | `timestamptz` | NOT NULL | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL | 最後更新時間。 |

唯一約束 `uniq_list_position`：`(board_id, position)`，**延遲到交易提交時才檢查**（`DEFERRABLE INITIALLY DEFERRED`）。這個約束同時會建立索引，不需要另外加。

## `cards`

Model：`boards.Card`

| 欄位 | 型別 | 限制 | 說明 |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | 卡片識別碼。 |
| `list_id` | `uuid` | NOT NULL、FK | 所屬列表，參照 `lists.id`。 |
| `title` | `varchar(255)` | NOT NULL | 卡片標題。 |
| `description` | `text` | NOT NULL、預設空字串 | 補充說明。依 Django 慣例，文字欄位用空字串表示「沒有內容」，不使用 `NULL`。 |
| `position` | `integer` | NOT NULL、`CHECK (position >= 0)` | 在列表內的順序，從 `0` 開始，見下方「排序」。 |
| `created_at` | `timestamptz` | NOT NULL | 建立時間。 |
| `updated_at` | `timestamptz` | NOT NULL | 最後更新時間。 |

唯一約束 `uniq_card_position`：`(list_id, position)`，同樣延遲到交易提交時才檢查。

`lists`、`cards` 都不存擁有者，擁有權沿著 `card → list → board → owner` 往上追（見 [architecture.md](architecture.md)「擁有權檢查」），避免同一份資訊存在多個地方、移動卡片時還要同步更新。

## 排序（position）

列表與卡片的順序用 `position` 欄位表示，規則如下：

- 同一個看板內的列表、同一個列表內的卡片，`position` 是從 `0` 開始的**連續整數**（0、1、2…），就是在畫面上的索引。
- **新增**：放在最後面，`position = 目前數量`。
- **移動**（同一個父層內調整順序，或卡片移到另一個列表）：在一個交易（`transaction.atomic()`）裡完成：
  1. 用 `select_for_update()` 鎖定所屬的**看板**那一列，避免同時有其他請求在移動同一個看板裡的東西。
  2. 原本位置後面的項目 `position - 1`（把空位補起來）。
  3. 目標位置之後（含）的項目 `position + 1`（騰出空位）。
  4. 把被移動的項目寫入新的 `position`（與新的 `list_id`）。
  
  第 2、3 步用 `F()` 表達式一次更新多筆（`.update(position=F("position") + 1)`），由資料庫直接計算，不用把資料一筆一筆讀出來。
- **刪除**：在交易裡刪除該筆，並把後面的項目 `position - 1`。
- 傳入的 `position` 超出範圍時，後端自動夾在 `0` 到「最後一個位置」之間。

### 為什麼唯一約束要「延遲檢查」

移動過程中，position 會短暫出現重複（例如把後面的項目 +1 時，還沒寫入被移動項目的新位置）。一般的唯一約束是**每一行 SQL 執行完就檢查**，會讓交易中途失敗；PostgreSQL 的延遲約束（`deferrable=models.Deferrable.DEFERRED`）改成**交易提交時才檢查**，中間狀態可以暫時重複，但只要最後結果有重複（代表排序邏輯寫錯），整個交易就會失敗並回滾。這樣資料庫本身就能保證 position 不會重複，不只靠程式邏輯。

> 延遲約束是 PostgreSQL 的功能，MySQL 沒有，這也是本專案改用 PostgreSQL 的理由之一。

這個做法每次移動要更新多筆資料，但一個列表通常只有幾十張卡片，影響不大，好處是邏輯直觀、`position` 跟畫面索引一致、容易驗證。另一種常見做法是用小數（例如插在 1000 和 2000 中間就用 1500），移動只要更新一筆，但數字會越插越密、需要定期重新編號，目前不採用。

## 其他資料表

Django 內建功能會建立下列資料表：

| 資料表 | 用途 |
| --- | --- |
| `django_session` | 登入 Session（Session 存在資料庫）。 |
| `django_cache` | 資料庫快取，給 DRF 的速率限制使用（由 `python manage.py createcachetable` 建立，不是 migration）。用資料庫快取而不是記憶體快取，是因為 Gunicorn 有多個 worker，記憶體快取每個 worker 各算各的，速率限制會失準。 |
| `django_migrations` | 記錄跑過哪些 migration。 |
| `django_admin_log` | Django Admin 的操作紀錄。 |
| `django_content_type`、`auth_permission`、`auth_group` 等 | Django 權限系統，目前只有 Admin 會用到。 |

## 關聯

```text
users  1 --- N boards
boards 1 --- N lists
lists  1 --- N cards
```

刪除使用者會連帶刪除其看板；刪除看板會連帶刪除其列表；刪除列表會連帶刪除其卡片（由 Django ORM 處理，見上方「外鍵刪除」）。

## 連線與帳號

連線資訊透過環境變數提供（`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_HOST`、`POSTGRES_PORT`），不可將正式環境密碼納入版本控制。正式環境的資料庫只在 Docker 內部網路，不對外開放；每日備份方式見 [roadmap.md](roadmap.md) 第十階段。
