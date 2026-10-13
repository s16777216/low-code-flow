# Backend

Fastify + SQLite（Drizzle）。定義的儲存與 Registry 見 `openspec/changes/definition-store`。

## 啟動開發伺服器

從專案根目錄執行：

```sh
npm run -w packages/backend dev
```

Backend 預設監聽 `http://127.0.0.1:3000`。npm 的 `-w` 使用 workspace 套件名稱（`@low-code-flow/backend`）或路徑（`packages/backend`），不能只寫 `backend`。

## HTTP endpoint

在 Function Inspector 設定 path 後，以 `POST /run/{projectId}/{path}` 呼叫，JSON body 的 key 對應 input port 名稱。沒有 input port 時可省略 body 與 Content-Type；GET 一律不執行 Function。成功回傳以 output port 名稱為 key 的 JSON，`date` 使用含時區的 ISO 字串，`function` 使用同 Project 的 Function ID。

`ENDPOINT_TIMEOUT_MS` 設定同步等待上限（預設 30000 毫秒）；504 只結束等待，執行繼續。重試會建立另一次執行，可能重複產生副作用。回應的 `X-Execution-Id` 可貼到編輯器的 Inspect execution 查看 trace。

`PUBLIC_BASE_URL` 可指定外部呼叫 URL 的根位址（例如 `https://flows.example.com`）；未設定時使用 API 請求的 protocol 與 host。透過 reverse proxy 部署時請設定此值。Endpoint 不要求驗證，POC 僅限內部網路使用。

## 資料庫可移植性規則（SQLite → Postgres）

新增或修改 schema、查詢時逐項確認：

- [ ] ID 為文字（`crypto.randomUUID()`），不用 autoincrement 整數、不依賴 `rowid`
- [ ] 定義存成單一 JSON 欄位（SQLite `text`，Postgres 之後改 `jsonb`），SQL 不查詢 JSON 內部；需要查詢的值另存一般欄位
- [ ] 時間存 ISO 8601 文字，由應用程式產生，不用 SQLite 日期函式
- [ ] 只用兩邊都支援的語法：`INSERT ... ON CONFLICT ... DO UPDATE`、`UPDATE ... WHERE ... RETURNING`；不用 `INSERT OR REPLACE`
- [ ] 布林值存成明確欄位，不依賴 SQLite 的弱型別
- [ ] 資料庫存取只放在 `src/db/`；其餘模組不得 import `drizzle-orm` 或 `better-sqlite3`（由 lint 規則強制）
- [ ] Migration 由 `npm run db:generate` 產生並納入版本控制
