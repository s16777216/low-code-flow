## Context

`packages/backend` 目前仍是空目錄。`docs/poc.md` 原本規劃 Node.js + Fastify backend、Deno Runner，以及 SQLite + Drizzle 的 Document Pattern 持久化；之後的 `file-driven-projects` 曾改為以檔案為真相來源，現已刪除。本 change 回到資料庫方案，但沿用該設計中與儲存方式無關的部分：穩定 Asset ID、保留的 `system:*` 命名空間、依賴索引、immutable snapshot 與變更通知。

已確認的產品條件：

- 一台共用伺服器、多人使用，定義只經由視覺編輯器寫入。
- 多人同時修改彼此引用的 Function 是常見情況。
- 一律使用最新版本，不做發布與版本歷史。
- 可儲存 invalid 草稿，但不可執行。
- 不做登入、不做跨 Project 引用。
- 執行紀錄維持只放記憶體（由 `typed-function-ports` 負責）。

動機與範圍見 `proposal.md`，可觀察行為見 `specs/projects/spec.md` 與 `specs/project-asset-registry/spec.md`。

## Goals / Non-Goals

**Goals:**

- 以 SQLite 持久化 Project、Type、Function 與 Code，且資料存取可在不改動 engine 的情況下換成 Postgres。
- 用 revision 樂觀鎖防止多人編輯時互相覆蓋。
- 讓草稿可以隨時儲存，同時以 diagnostics 與可執行狀態阻擋不完整的定義被執行。
- 提供 `typed-function-ports` 需要的 Registry boundary：以 ID 解析定義、依賴查詢、immutable snapshot 與變更通知。

**Non-Goals:**

- 登入、使用者身分、權限。
- 跨 Project 引用、共用函式庫、套件。
- 發布、版本歷史、還原、分支。
- 即時協同編輯（CRDT、游標同步）。
- 執行紀錄持久化。
- 多個 backend 實例或水平擴充。
- Postgres 的實際實作與測試；本 change 只保證可移植性規則。
- 以 API endpoint 作為 Function 入口；由後續 change 處理。

## Decisions

### 1. Backend 技術與資料庫存取層

Backend 使用 Node.js + Fastify（依 `docs/poc.md` §40）。資料庫使用 SQLite，透過 Drizzle ORM 存取；SQLite driver 採 `better-sqlite3`，並以 WAL 模式開啟。

資料庫存取集中在 `packages/backend` 的 repository 模組；engine、Type 與 Function 模組只依賴 Registry 介面（決策 7），不得 import Drizzle 或 SQLite。Drizzle 的 SQLite 與 Postgres schema 是不同的 API（`sqlite-core` 與 `pg-core`），換資料庫時 schema 需要另寫一份；Document Pattern 讓資料表很少，這個成本可以接受。替代方案是 Kysely 這類對方言更中立的 query builder，但 `docs/poc.md` 已選定 Drizzle，可移植性需求也不足以抵銷更換的成本。

### 2. 可移植性規則

為了之後換成 Postgres，schema 與查詢遵守：

- ID 一律為文字（Asset ID 由系統產生 UUID 或 ULID），不使用 autoincrement 整數或 `rowid`。
- 定義以 JSON 文件存成單一欄位：SQLite 為 `text`，Postgres 之後改為 `jsonb`。SQL 中不查詢 JSON 內部欄位，需要的索引資料（kind、name）另存成一般欄位。
- 時間存 ISO 8601 文字，由應用程式產生，不使用 SQLite 日期函式。
- 只使用兩邊都支援的語法：`INSERT ... ON CONFLICT ... DO UPDATE`、`UPDATE ... WHERE ... RETURNING`；不使用 `INSERT OR REPLACE`。
- 布林值存成明確欄位，不依賴 SQLite 的弱型別。
- Migrations 由 `drizzle-kit` 產生並納入版本控制。

### 3. 資料表

```text
projects
  id            text  primary key
  name          text  not null
  created_at    text  not null
  updated_at    text  not null

assets
  id             text  primary key
  project_id     text  not null  references projects(id) on delete cascade
  kind           text  not null  -- 'type' | 'function'
  name           text  not null
  schema_version integer not null
  definition     text  not null  -- JSON 文件
  revision       integer not null
  created_at     text  not null
  updated_at     text  not null
  index (project_id, kind)
```

Function 的 Code Node 原始碼存在 Function 定義 JSON 內（以 node ID 為 key）。如此一個 revision 就涵蓋 graph 與 code 的所有修改；代價是兩人同時改同一個 Function 的不同部分時也會衝突，在 POC 可以接受。

diagnostics、可執行狀態、依賴索引都是由定義推導出的資料，不寫入資料庫，每次啟動與寫入時由 Registry 重新計算，避免與定義不一致。

### 4. Revision 樂觀鎖

更新以單一陳述式完成比對與寫入：

```sql
UPDATE assets
SET definition = ?, name = ?, revision = revision + 1, updated_at = ?
WHERE id = ? AND revision = ?
RETURNING revision
```

沒有回傳列時，代表 revision 已改變（或 Asset 不存在），API 回傳 409 與目前 revision，前端提示「此定義已被修改，請重新載入」。因為不做登入，提示無法指出修改者。

### 5. 寫入驗證分兩層

| 層級 | 檢查內容 | 不通過時 |
|---|---|---|
| 結構 | JSON 可解析、`schema_version` 受支援、`kind` 與文件形狀相符、ID 規則（不可用 `system:` 前綴、不可改變既有 ID） | 拒絕寫入（400） |
| 語意 | port 連線、Type 相容性、引用是否存在、cycle、繼承規則 | 照常寫入，記為 diagnostics |

語意驗證規則屬於 `typed-function-ports` 與 nominal type system；本 change 只負責呼叫它們、保存結果並計算可執行狀態。Asset 可執行的條件是：自身沒有錯誤等級的 diagnostics，且所有直接依賴皆可執行。

### 6. 一律使用最新版本

定義中的引用只存 Asset ID（Type 的 parent、port 的 Type、Function Node 的子 Function）。Registry 一律以目前儲存的定義解析，不保存被引用者的 hash 或 revision。

每個 Asset 仍會計算 canonical content hash，但僅供執行 snapshot 與執行紀錄標示「當時跑的是哪個內容」，不參與合法性判斷。

已知代價：

- 他人存下但尚未完成的程式（驗證通過）會立即被引用者的 execution 使用。
- 他人存下 invalid 草稿或修改 port，引用者會立即變為不可執行。

之後若要改成發布制，只需新增版本表與「已發布版本」指標，並把 Registry 的解析來源由「目前定義」改為「已發布定義」；引用格式不必改變。

### 7. Registry 與 snapshot

每個 Project 在記憶體中維護一個 Registry：

```ts
interface ProjectAssetRegistry {
  getSnapshot(): AssetRegistrySnapshot
  getAsset(assetId: string): AssetRecord | undefined
  getDependencies(assetId: string): readonly string[]
  getDependents(assetId: string): readonly string[]
  subscribe(listener: (change: RegistryChange) => void): Unsubscribe
}

interface AssetRecord {
  assetId: string
  kind: 'type' | 'function'
  name: string
  revision: number
  contentHash: string
  definition: unknown
  dependencies: string[]
  diagnostics: Diagnostic[]
  executable: boolean
}

interface RegistryChange {
  previousSnapshotId: string
  snapshotId: string
  changedAssetIds: string[]
}
```

啟動時從資料庫載入全部 Assets 建立 snapshot。每次寫入的順序是：在資料庫 transaction 中寫入，成功後重新計算該 Asset 與其所有反向依賴者的 diagnostics 與可執行狀態，最後以單一步驟替換目前 snapshot 並通知訂閱者。資料庫寫入失敗時不更新 snapshot。

這個設計假設只有一個 backend 實例，因此記憶體中的 snapshot 永遠與資料庫一致。若之後要多實例，需要改用資料庫通知（例如 Postgres `LISTEN/NOTIFY`）同步各實例的 Registry。

### 8. 刪除

- 刪除 Asset：若同一 Project 內仍有其他 Asset 引用它，拒絕刪除並回傳引用者清單（409）。這避免在「一律最新版」下，一個刪除動作讓多個他人的 Function 同時失效。
- 刪除 Project：以 `on delete cascade` 刪除所有 Assets，釋放該 Project 的 Registry，並通知執行模組取消該 Project 正在執行的 executions。

### 9. HTTP API

```text
GET    /projects
POST   /projects                         { name }
PATCH  /projects/:projectId              { name }
DELETE /projects/:projectId

GET    /projects/:projectId/assets       列表含 kind、name、revision、executable、diagnostics 摘要
POST   /projects/:projectId/assets       { kind, name, definition }
GET    /projects/:projectId/assets/:id   定義、revision、diagnostics、executable
PUT    /projects/:projectId/assets/:id   { name, definition, expectedRevision }
DELETE /projects/:projectId/assets/:id
```

錯誤對應：結構驗證失敗 400、Asset 或 Project 不存在 404、revision 衝突或刪除被引用者 409。即時推送變更給編輯器（SSE）不在本 change 範圍，前端在衝突時重新載入即可。

## Risks / Trade-offs

- **[他人的半成品被執行]** → 為「一律最新版」的已知代價；編輯器顯示 Asset 最後修改時間，之後若變成實際問題，依決策 6 改為發布制。
- **[他人的 invalid 草稿卡住引用者]** → diagnostics 指出原因來自哪個被引用的 Asset，讓使用者知道該找誰處理；禁止刪除被引用者，減少大規模失效。
- **[同一 Function 多人同時編輯頻繁衝突]** → revision 衝突時前端提示重新載入；POC 不做合併或即時協作。
- **[Drizzle 換資料庫要重寫 schema]** → 資料表少，加上可移植性規則，重寫成本低。
- **[SQLite 單一寫入者]** → POC 寫入量小，WAL 模式足夠；多實例或高寫入量時再換 Postgres。
- **[Registry 與資料庫不一致]** → 只有單一 backend 實例且所有寫入都經過 Registry；資料庫寫入失敗時不更新 snapshot。
- **[沒有登入，任何人都能刪除 Project]** → POC 僅部署於內部網路；登入與權限為後續工作。

## Migration Plan

目前沒有 production 資料，也沒有既有資料庫。實作順序：

1. 建立 `packages/backend`（Fastify、TypeScript、測試設定）與 SQLite 連線。
2. 建立 Drizzle schema 與第一個 migration。
3. 實作 repository 與 revision 樂觀鎖。
4. 實作 Registry、snapshot、依賴索引與通知；語意驗證先以介面接上，等 `typed-function-ports` 提供實際規則。
5. 實作 HTTP API。
6. `typed-function-ports` 改為透過 Registry 取得定義。

前端 DemoView 目前的寫死資料不需遷移，之後改為從 API 載入。Rollback 為移除資料庫層與 API；不影響前端 UI package。

## Related Changes

- **API endpoint 作為 Function 入口**：由 `http-endpoint-trigger` change 定義。本 change 的資料模型不需為此預留欄位；endpoint 設定存在獨立資料表，以 Function ID 關聯，並會在本 change 的 Asset 刪除流程中加入「設有 endpoint 的 Function 不可刪除」的檢查。
