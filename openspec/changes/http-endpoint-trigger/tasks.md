## 0. 前置

- [ ] 0.1 確認 `definition-store` 已完成 backend、資料庫、Registry 與 Asset API，`typed-function-ports` 已完成執行服務（task 5.5）與 in-memory execution registry，並以一次編輯器內執行驗證兩者可用

## 1. Endpoint 設定

- [ ] 1.1 新增 `endpoints` 資料表 migration（`function_id` 主鍵、`project_id` cascade、`(project_id, path)` 唯一），並驗證全新與既有資料庫都能套用
- [ ] 1.2 實作 path 格式驗證（小寫英數與連字號的段落、以 `/` 分隔、最長 128 字元），並驗證大寫、空白、`..`、空段落與過長 path 都被拒絕
- [ ] 1.3 實作 endpoint repository 的設定、讀取、列出與移除，並驗證同一 Project 內重複 path 被拒絕且指出衝突的 Function、不同 Project 可使用相同 path、只有 Function 能設定 endpoint
- [ ] 1.4 驗證修改 endpoint path 不會改變 Function 定義與 revision
- [ ] 1.5 在 `definition-store` 的 Asset 刪除流程中加入檢查：設有 endpoint 的 Function 回 409 並要求先移除 endpoint；並驗證刪除 Project 會一併移除其 endpoints
- [ ] 1.6 實作編輯器 API（列出、設定、移除 endpoint），並讓 Asset 讀取回應附上 endpoint path 與完整 URL

## 2. 路由與請求解析

- [ ] 2.1 註冊 `POST /run/:projectId/*` 路由（body 上限 1 MB），以 Project ID 與完整 path 精確比對，並驗證找不到 Project 或 endpoint 時回 404 且不建立 execution
- [ ] 2.2 對已存在的 endpoint 以其他 method 請求時回 405，並驗證不建立 execution
- [ ] 2.3 驗證 Content-Type 不是 `application/json` 時回 415、body 不是合法 JSON 或頂層不是 object 時回 400、超過大小上限時回 413，且都不建立 execution

## 3. 輸入對應與驗證

- [ ] 3.1 在輸入驗證之前檢查 Function 可執行狀態，不可執行時回 409 並附上 diagnostics 摘要，並驗證依賴的 Function 為 invalid 草稿時同樣回 409
- [ ] 3.2 實作 body 與 input ports 的對應，並驗證缺少的 port、多餘的 key、Type 不符都以 `invalid_input` 格式依 port 列出且回 400
- [ ] 3.3 實作 `date`（ISO 8601 字串）與 `function`（同 Project 的 Function ID 字串）的 HTTP 表示與內部 tagged transport 的雙向轉換，並驗證不含時區的日期字串與其他 Project 的 Function ID 被拒絕
- [ ] 3.4 驗證沒有 input port 的 Function 接受空 object 與空 body

## 4. 執行與回應

- [ ] 4.1 以 in-process 方式呼叫執行服務（與編輯器執行共用入口），並驗證 endpoint 執行的是 Function 最新儲存的定義
- [ ] 4.2 實作成功回應：200，body 以 output port 名稱為 key，`date` 與 `function` 值轉回 HTTP 表示，並帶 `X-Execution-Id` header
- [ ] 4.3 實作執行失敗回應：500，包含 execution ID、失敗的 Node ID 與錯誤訊息
- [ ] 4.4 實作可設定的逾時（預設 30 秒）：逾時回 504 並附 execution ID，並驗證執行不會被取消、完成後仍可在 execution registry 查到結果
- [ ] 4.5 在 execution record 加上執行來源（`editor` 或 `http`）與 endpoint path，並驗證 Inspector 能顯示 HTTP 執行的來源

## 5. 前端

- [ ] 5.1 在 Function 設定區塊加入 endpoint path 輸入、格式即時檢查、重複 path 錯誤提示、完整 URL 顯示與複製按鈕
- [ ] 5.2 Function 設有 endpoint 時，在編輯器顯示「此 Function 目前對外提供服務」提示，並在嘗試刪除時顯示需先移除 endpoint 的訊息

## 6. 端對端驗證

- [ ] 6.1 以含多個 input／output ports（包含 `date`）的 Function 建立 endpoint，透過實際 HTTP 請求驗證成功、輸入錯誤、不可執行、執行失敗與逾時五種回應，以及 `X-Execution-Id` 可在 Inspector 查到對應 execution
- [ ] 6.2 驗證修改 Function 的 Code 並儲存後，下一次 endpoint 呼叫立即使用新定義
- [ ] 6.3 從 root 執行 `npm test`、`npm run lint`、`npm run type-check` 皆通過，並執行 `openspec validate http-endpoint-trigger --strict`
