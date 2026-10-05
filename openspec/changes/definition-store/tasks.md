## 1. Backend 骨架與資料庫連線

- [ ] 1.1 建立 `packages/backend`（TypeScript、Fastify、vitest、lint 與 type-check 設定），並驗證 root 的 `npm test`、`npm run lint`、`npm run type-check` 都會涵蓋 backend
- [ ] 1.2 建立 SQLite 連線（`better-sqlite3`、WAL 模式、資料庫檔案路徑可設定），並驗證測試可使用獨立的暫存資料庫
- [ ] 1.3 撰寫可移植性規則的檢查清單（文字 ID、JSON 文件欄位、ISO 時間、禁用 `INSERT OR REPLACE` 與 `rowid`），並在 code review 範本或 README 中引用

## 2. Schema 與 Migrations

- [ ] 2.1 以 Drizzle 定義 `projects` 與 `assets` 資料表（含 `project_id` cascade 刪除與 `(project_id, kind)` 索引），並以 `drizzle-kit` 產生第一個 migration
- [ ] 2.2 啟動時自動套用 migrations，並驗證全新資料庫與已套用過的資料庫都能正常啟動

## 3. Repository

- [ ] 3.1 實作 Project repository（建立、列出、改名、刪除），並驗證刪除 Project 會一併刪除其 Assets
- [ ] 3.2 實作 Asset repository 的建立與讀取，驗證 ID 由系統產生、`system:` 前綴被拒絕，且重新開啟資料庫後讀回的定義（含 Code 原始碼）與寫入時相同
- [ ] 3.3 以 `UPDATE ... WHERE id = ? AND revision = ? RETURNING revision` 實作更新，並驗證過期的 revision 不會修改任何內容且回傳目前 revision
- [ ] 3.4 實作 Asset 刪除，並驗證被同 Project 內其他 Asset 引用時拒絕刪除且回傳引用者清單

## 4. Registry

- [ ] 4.1 定義 `ProjectAssetRegistry`、`AssetRecord`、`RegistryChange` 介面與語意驗證的 plug-in 介面，並確認 engine 相關模組無法 import Drizzle 或資料庫模組（以 lint 規則檢查）
- [ ] 4.2 實作結構驗證（JSON、schema version、kind 與文件形狀、ID 規則），並驗證格式錯誤的文件被拒絕寫入且原內容不變
- [ ] 4.3 實作引用擷取與依賴／反向依賴索引，並驗證 Type parent、port Type、Function Node 子 Function 三種引用都被索引，且跨 Project 的 ID 被視為無法解析
- [ ] 4.4 實作 canonical content hash，並驗證 JSON key 順序與空白不影響 hash
- [ ] 4.5 實作可執行狀態的計算（自身無錯誤且所有依賴可執行），並驗證 invalid 草稿會讓所有反向依賴者變為不可執行，且 diagnostics 指出原因來源
- [ ] 4.6 啟動時由資料庫建立每個 Project 的 snapshot，並驗證重新啟動後的 snapshot 與重啟前一致
- [ ] 4.7 實作「寫入資料庫 → 重算該 Asset 與反向依賴者 → 單一步驟替換 snapshot → 通知訂閱者」流程，並驗證資料庫寫入失敗時 snapshot 不變、consumer 持有的舊 snapshot 不受影響
- [ ] 4.8 驗證一律使用最新版本：修改被引用 Function 的內部 Code 後，引用者不需任何操作即解析到新定義；刪除被連線的 port 後，引用者立即出現 diagnostics 並變為不可執行

## 5. HTTP API

- [ ] 5.1 實作 Project API（列出、建立、改名、刪除），並以整合測試驗證
- [ ] 5.2 實作 Asset API（列出、建立、讀取、更新、刪除），回應包含 revision、diagnostics 與 executable，並以整合測試驗證
- [ ] 5.3 實作錯誤對應（結構錯誤 400、不存在 404、revision 衝突與刪除被引用者 409），並驗證兩個 client 以相同 revision 先後更新時第二個收到 409 與目前 revision
- [ ] 5.4 刪除 Project 時釋放其 Registry，並提供取消該 Project 執行中 executions 的掛鉤供執行模組使用

## 6. 整合

- [ ] 6.1 將 `typed-function-ports` 的語意驗證接上 Registry 的驗證介面，並驗證 diagnostics 包含 port 連線、Type 相容性與 cycle 錯誤
- [ ] 6.2 以一個含多個 Type 與多層 Function 的 Project 進行端對端測試：建立、互相引用、存 invalid 草稿、修正、刪除，並驗證每一步的 diagnostics 與可執行狀態
- [ ] 6.3 從 root 執行 `npm test`、`npm run lint`、`npm run type-check` 皆通過，並執行 `openspec validate definition-store --strict`
