## Why

POC 目前只能在編輯器裡手動執行 Function，外部系統無法觸發工作流程。使用者希望以 HTTP API endpoint 作為 Function 的入口，讓 Project 內的 Function 能被其他服務以一般的 HTTP 請求呼叫並取得結果。`typed-function-ports` 已規劃以 raw 值呼叫 Function、依 port 驗證輸入的執行 API，endpoint 可以建立在它之上，只需補上路由、輸入輸出對應與錯誤對應，因此能以有限範圍納入 POC。

## What Changes

- 新增 HTTP endpoint 入口：Function 可設定一個 endpoint path（同一個 Project 內唯一），外部以 `POST /run/:projectId/:path` 呼叫。
- 請求只支援 JSON body；body 的頂層 key 對應 Function 的 input port 名稱，並依各 port 的 Type 驗證，未知或缺少的 key 視為輸入錯誤。
- 以同步方式等待執行完成，並設有逾時；成功時以 output port 名稱為 key 回傳 JSON。
- 錯誤以 HTTP 狀態碼區分：輸入驗證失敗 400（指出哪些 port）、找不到 endpoint 404、Function 目前不可執行 409、執行失敗 500、逾時 504。執行失敗與逾時的回應附上 execution ID，可在 Inspector 查看記憶體中的 trace。
- 逾時只結束 HTTP 回應，不取消執行；執行完成後仍依原有規則保留在記憶體中的 execution registry。
- Endpoint 一律執行 Function 目前儲存的定義（一律使用最新版本），與編輯器內執行相同；Function 不可執行時 endpoint 回傳 409。
- 編輯器可為 Function 設定、修改與移除 endpoint path，並顯示完整的呼叫 URL。
- 不在本 change 範圍：API key 與身分驗證、query／header／path 參數對應、POST 以外的 method、非同步模式與 callback、速率限制、OpenAPI 文件產生、CORS 的細部設定、Test URL 與 Production URL 的區分。

## Capabilities

### New Capabilities

- `http-endpoints`: 定義 Function 的 endpoint 設定與 path 唯一性、HTTP 請求與 input ports 的對應及驗證、同步執行與逾時、output ports 與回應的對應，以及錯誤狀態碼。

### Modified Capabilities

無；`projects` 與 `project-asset-registry` 由 `definition-store` 定義，尚未歸檔。

## Impact

- 依賴 `definition-store`（Project、Function 定義與可執行狀態）與 `typed-function-ports`（執行 API、port 驗證、in-memory execution registry），必須在兩者的執行引擎可用後才能實作。
- `packages/backend`：新增 endpoint 設定的儲存（以 Function ID 關聯、`(project_id, path)` 唯一）、Fastify 路由與輸入輸出對應。
- `packages/frontend`：Function 的 endpoint 設定介面。
- 安全性：沒有登入與 API key，任何能連到伺服器的人都能呼叫 endpoint；POC 僅限內部網路使用。
- 已知風險：因為一律使用最新版本，他人儲存的半成品會立即被外部呼叫執行，invalid 草稿會讓 endpoint 開始回傳 409。若之後 endpoint 被正式系統依賴，應重新評估發布制，或區分 Test URL 與 Production URL（類似 n8n）。
