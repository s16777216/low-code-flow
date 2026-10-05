## Purpose

定義以 HTTP endpoint 作為 Function 入口的行為：endpoint 的設定與路由、請求內容與 input ports 的對應及驗證、同步執行與逾時，以及 output ports 與錯誤的回應格式，讓外部系統能以一般 HTTP 請求執行 Project 內的 Function。

## ADDED Requirements

### Requirement: Endpoint configuration
每個 Function SHALL 可設定零個或一個 endpoint path。Path MUST 由小寫英文字母、數字與連字號組成的一或多個以 `/` 分隔的段落構成，長度不超過 128 字元，且在同一個 Project 內唯一。只有 Function 可以設定 endpoint。Endpoint 設定 MUST NOT 改變 Function 定義或其 revision。

#### Scenario: Assign a path to a function
- **WHEN** 使用者為 Function `Checkout` 設定 path `orders/checkout`
- **THEN** 系統儲存該設定，並顯示完整的呼叫 URL

#### Scenario: Reject a duplicate path
- **WHEN** 同一個 Project 內已有 Function 使用 path `orders/checkout`，使用者再為另一個 Function 設定相同 path
- **THEN** 系統拒絕該設定並指出衝突的 Function

#### Scenario: Allow the same path in different projects
- **WHEN** 兩個不同的 Project 各有一個 Function 使用 path `orders/checkout`
- **THEN** 兩個設定都被接受，且各自以其 Project ID 區分

#### Scenario: Reject an invalid path
- **WHEN** 使用者設定的 path 含有大寫字母、空白、`..` 或空段落
- **THEN** 系統拒絕該設定並說明 path 規則

#### Scenario: Endpoint changes do not affect the function revision
- **WHEN** 使用者修改 Function 的 endpoint path
- **THEN** 該 Function 的定義與 revision 不變，其他人編輯該 Function 時不會因此發生 revision 衝突

#### Scenario: Remove an endpoint
- **WHEN** 使用者移除 Function 的 endpoint
- **THEN** 之後對原 path 的請求回傳 404

### Requirement: Endpoint routing
系統 SHALL 以 `POST /run/{projectId}/{path}` 接受 endpoint 請求，並以 Project ID 與完整 path 精確比對找到 Function。找不到對應的 Project 或 endpoint 時 MUST 回傳 404。對已存在 endpoint 使用 POST 以外的 method 時 MUST 回傳 405。

#### Scenario: Route a request to the function
- **WHEN** 外部系統對 `POST /run/{projectId}/orders/checkout` 送出請求
- **THEN** 系統執行設定該 path 的 Function

#### Scenario: Unknown endpoint
- **WHEN** 請求的 path 在該 Project 內沒有對應的 endpoint
- **THEN** 系統回傳 404，且不建立 execution

#### Scenario: Wrong method
- **WHEN** 外部系統以 GET 請求已存在的 endpoint
- **THEN** 系統回傳 405，且不建立 execution

### Requirement: Request to input port mapping
Endpoint 請求 SHALL 使用 JSON body，其頂層 MUST 為 object，key 對應 Function 的 input port 名稱。每個 input port MUST 恰好有一個對應的 key，且不得有多餘的 key；每個值 MUST 通過該 port Type 的驗證。`date` port 的值 MUST 為含時區的 ISO 8601 字串；`function` port 的值 MUST 為同一個 Project 內的 Function ID 字串。沒有 input port 的 Function SHALL 接受空 object 或空 body。任何輸入錯誤 MUST 回傳 400，且不建立 execution。

#### Scenario: Accept valid inputs
- **WHEN** Function 有 `orderId: string` 與 `quantity: number` 兩個 input ports，請求 body 為 `{"orderId": "A-1", "quantity": 2}`
- **THEN** 系統以這兩個值開始執行

#### Scenario: Report port-level validation errors
- **WHEN** 請求 body 缺少 `orderId`，且 `quantity` 的值為字串
- **THEN** 系統回傳 400，回應中分別列出 `orderId` 缺少與 `quantity` Type 不符

#### Scenario: Reject unknown keys
- **WHEN** 請求 body 含有 Function 沒有的 key `coupon`
- **THEN** 系統回傳 400 並列出未知的 key

#### Scenario: Reject a non-JSON request
- **WHEN** 請求的 Content-Type 不是 `application/json`，或 body 不是合法 JSON
- **THEN** 系統回傳 415 或 400，且不建立 execution

#### Scenario: Reject a non-object body
- **WHEN** 請求 body 為 JSON 陣列或純量值
- **THEN** 系統回傳 400，且不建立 execution

### Requirement: Executability gate
Endpoint SHALL 一律執行 Function 目前儲存的定義。Function 目前不可執行時，系統 MUST 回傳 409 並附上不可執行的原因摘要，且不建立 execution。

#### Scenario: Run the latest saved definition
- **WHEN** 使用者修改並儲存 `Checkout` 的 Code，之後外部系統呼叫其 endpoint
- **THEN** 該次執行使用修改後的定義

#### Scenario: Reject a non-executable function
- **WHEN** `Checkout` 或其依賴的 Function 被儲存為不可執行的草稿，外部系統呼叫 `Checkout` 的 endpoint
- **THEN** 系統回傳 409，回應中說明不可執行的原因，且不建立 execution

### Requirement: Synchronous execution and response mapping
系統 SHALL 在輸入驗證通過後開始執行，並等待執行完成再回應。執行成功時 MUST 回傳 200，body 為以 output port 名稱為 key 的 JSON object，`date` 與 `function` 值採與輸入相同的表示方式。所有建立了 execution 的回應 MUST 帶有 `X-Execution-Id` header。

#### Scenario: Return outputs on success
- **WHEN** Function 執行成功，output ports 為 `receipt: string` 與 `total: number`
- **THEN** 系統回傳 200，body 為 `{"receipt": "...", "total": 120}`，並帶有 `X-Execution-Id` header

#### Scenario: Trace an endpoint execution
- **WHEN** 使用者以回應中的 execution ID 在 Inspector 查詢
- **THEN** 只要該 execution 仍保留在記憶體中，即可看到其各 port 的 inputs、outputs 與執行來源為 HTTP endpoint

### Requirement: Execution timeout
系統 SHALL 對 endpoint 的同步等待套用可設定的逾時。逾時時 MUST 回傳 504 並附上 execution ID；逾時只結束 HTTP 回應，MUST NOT 取消執行，執行完成後依原有規則保留在記憶體中的 execution registry。

#### Scenario: Respond on timeout without cancelling
- **WHEN** Function 的執行時間超過逾時設定
- **THEN** 系統回傳 504 並附上 execution ID，執行繼續直到完成，之後可在 Inspector 查看結果

### Requirement: Execution failure response
執行失敗時，系統 SHALL 回傳 500，body 包含 execution ID、失敗的 Node 與錯誤訊息。

#### Scenario: Report a failed execution
- **WHEN** Function 中某個 Code Node 拋出錯誤
- **THEN** 系統回傳 500，回應中包含 execution ID、失敗的 Node ID 與錯誤訊息

### Requirement: Endpoint lifecycle with functions and projects
Function 設有 endpoint 時，系統 MUST 拒絕刪除該 Function，並要求先移除 endpoint。刪除 Project 時 SHALL 一併移除其所有 endpoints。

#### Scenario: Reject deleting a function that has an endpoint
- **WHEN** 使用者刪除設有 endpoint 的 Function
- **THEN** 刪除被拒絕，回應中指出需先移除 endpoint

#### Scenario: Remove endpoints with the project
- **WHEN** 使用者刪除含有 endpoints 的 Project
- **THEN** 對該 Project 任何 endpoint path 的請求都回傳 404

### Requirement: Unauthenticated access
POC SHALL 不要求 endpoint 請求提供任何驗證資訊；任何能連到伺服器的人都能呼叫所有 endpoints。

#### Scenario: Call an endpoint without credentials
- **WHEN** 外部系統未帶任何驗證 header 呼叫 endpoint
- **THEN** 系統照常處理該請求
