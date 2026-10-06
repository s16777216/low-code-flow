# Backend

Fastify + SQLite（Drizzle）。定義的儲存與 Registry 見 `openspec/changes/definition-store`。

## 資料庫可移植性規則（SQLite → Postgres）

新增或修改 schema、查詢時逐項確認：

- [ ] ID 為文字（`crypto.randomUUID()`），不用 autoincrement 整數、不依賴 `rowid`
- [ ] 定義存成單一 JSON 欄位（SQLite `text`，Postgres 之後改 `jsonb`），SQL 不查詢 JSON 內部；需要查詢的值另存一般欄位
- [ ] 時間存 ISO 8601 文字，由應用程式產生，不用 SQLite 日期函式
- [ ] 只用兩邊都支援的語法：`INSERT ... ON CONFLICT ... DO UPDATE`、`UPDATE ... WHERE ... RETURNING`；不用 `INSERT OR REPLACE`
- [ ] 布林值存成明確欄位，不依賴 SQLite 的弱型別
- [ ] 資料庫存取只放在 `src/db/`；其餘模組不得 import `drizzle-orm` 或 `better-sqlite3`（由 lint 規則強制）
- [ ] Migration 由 `npm run db:generate` 產生並納入版本控制
