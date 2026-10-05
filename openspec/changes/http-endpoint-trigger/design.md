## Context

本 change 建立在兩個尚未實作的 change 之上：

- `definition-store`：Project、Function 定義、可執行狀態、SQLite 與 Fastify backend。
- `typed-function-ports`：以 raw 值呼叫 Function 並依 port 驗證輸入的執行 API（task 5.5）、執行開始時固定的 snapshot、記憶體中的 execution registry、`date` 與 `function` 的 transport 表示。

已確認的條件：一律使用最新版本、不做登入、執行紀錄只放記憶體、POC 部署於內部網路。動機與範圍見 `proposal.md`，可觀察行為見 `specs/http-endpoints/spec.md`。

## Goals / Non-Goals

**Goals:**

- 讓外部系統能以一般 HTTP POST 執行 Function 並取得 outputs。
- 盡量重用執行 API 與 port 驗證，endpoint 只負責路由、對應與錯誤轉換。
- 錯誤回應能讓呼叫端知道是輸入、狀態、執行還是逾時的問題，並能以 execution ID 追查。

**Non-Goals:**

- API key、身分驗證、權限。
- Query、header、path 參數對應；POST 以外的 method。
- 非同步模式、callback、輪詢 API。
- 速率限制、並行數限制。
- OpenAPI 文件產生。
- Test URL 與 Production URL 的區分、發布制。
- 自訂 HTTP 狀態碼或 response header。

## Decisions

### 1. Endpoint 設定存在獨立資料表

```text
endpoints
  function_id  text  primary key  references assets(id)
  project_id   text  not null     references projects(id) on delete cascade
  path         text  not null
  created_at   text  not null
  updated_at   text  not null
  unique (project_id, path)
```

`function_id` 作為主鍵，保證每個 Function 至多一個 endpoint；`(project_id, path)` 唯一索引由資料庫保證 path 不重複，並遵守 `definition-store` 的可移植性規則。

不把 endpoint 放進 Function 定義 JSON：endpoint 是「如何被外部呼叫」的部署設定，不是 Function 的語意。放在定義外面，修改 path 不會改變 Function revision，也不會和正在編輯 Function 的人發生 revision 衝突。Endpoint 設定採最後寫入者為準，唯一索引負責擋下 path 衝突。

`assets(id)` 的外鍵不設 cascade：刪除設有 endpoint 的 Function 時由 API 先檢查並拒絕（決策 8），避免使用者無意間讓外部依賴的 endpoint 消失。

### 2. Path 規則與路由

Path 規則：一或多個以 `/` 分隔的段落，每段為 `[a-z0-9]+(-[a-z0-9]+)*`，總長不超過 128 字元。只允許小寫可避免大小寫不同卻視為不同 path 的混淆，也排除 `..`、空段落與需要編碼的字元。

路由使用 Fastify 的 wildcard：`POST /run/:projectId/*`，以 Project ID 與完整 path 精確比對，不支援 path 參數。`/run` 與編輯器使用的 `/projects` API 分屬不同前綴，之後若要對 endpoint 套用不同的 body 限制、逾時或 CORS 設定較容易。

同一個 wildcard 也註冊其他 method，找到 endpoint 時回 405，找不到時回 404。

### 3. 請求處理流程

```text
POST /run/:projectId/*
  │
  ├─ Content-Type 不是 application/json        → 415
  ├─ body 不是合法 JSON 或頂層不是 object        → 400
  ├─ 找不到 Project 或 endpoint                  → 404
  ├─ 從 Registry snapshot 取得 Function
  │   └─ 不可執行                               → 409（附 diagnostics 摘要）
  ├─ body 對應 input ports 並驗證
  │   └─ 缺少、多餘或 Type 不符                  → 400（依 port 列出錯誤）
  ├─ 呼叫執行服務（in-process，不經 HTTP）
  │   ├─ 成功                                   → 200（outputs）
  │   ├─ 失敗                                   → 500（executionId、nodeId、message）
  │   └─ 超過逾時                               → 504（executionId），執行繼續
  └─ 建立 execution 後的所有回應帶 X-Execution-Id
```

可執行狀態檢查放在輸入驗證之前：Function 不可執行時，輸入是否正確已無意義，而且這樣的錯誤對呼叫端更明確。

Endpoint 直接呼叫 backend 內部的執行服務，與 `typed-function-ports` 的執行 API 共用同一個入口函式，不經由 HTTP 迴圈呼叫自己。

### 4. 輸入與輸出的 JSON 表示

| Port root kind | HTTP JSON 表示 |
|---|---|
| `string`、`number`、`boolean` | 對應的 JSON 純量 |
| `object`、`array` | JSON object、array，依 Type 定義驗證 |
| `date` | 含時區的 ISO 8601 字串 |
| `function` | 同一個 Project 內的 Function ID 字串 |
| `any` | 任何 JSON 值；`date` 與 `function` 不會被自動辨識 |

Endpoint 層負責在 HTTP 表示與 `typed-function-ports` 的 tagged transport（`{ $kind: "date", iso }`、`{ $kind: "function-ref", functionId }`）之間轉換，讓外部呼叫端不需要知道內部的 tagged 格式。輸出採相同規則反向轉換。

輸入錯誤的回應格式：

```json
{
  "error": "invalid_input",
  "ports": {
    "orderId": ["missing"],
    "quantity": ["expected number"]
  },
  "unknownKeys": ["coupon"]
}
```

### 5. 同步等待與逾時

逾時預設 30 秒，以伺服器設定調整，POC 不做每個 endpoint 個別設定。逾時只放棄等待、回 504，不取消執行；執行完成後照常進入記憶體中的 execution registry，呼叫端可用 execution ID 在 Inspector 查看結果。

選擇不取消是因為 Function 可能已對外部系統產生副作用（例如呼叫其他 API），中途取消反而讓狀態更難推斷。代價是呼叫端無法從 HTTP 回應得知最終結果，POC 不提供查詢 API。

### 6. 執行來源標記

Execution 紀錄新增執行來源欄位（`editor` 或 `http`），以及 HTTP 呼叫的 endpoint path，讓 Inspector 能分辨外部呼叫與編輯器內的執行。這需要 `typed-function-ports` 的 execution record 增加一個欄位，屬於非破壞性擴充。

### 7. Body 大小限制

`/run` 路由的 body 上限設為 1 MB，與 `docs/poc.md` 建議的 payload 上限一致；超過時回 413。Output 大小沿用執行引擎既有的單一 Node output 限制。

### 8. 與 Function、Project 生命週期的關係

- 刪除 Function：若設有 endpoint，API 回 409 並要求先移除 endpoint。這延續 `definition-store`「被引用的 Asset 不能刪除」的精神，把外部呼叫端也視為一種引用。
- 刪除 Project：`projects` 外鍵 cascade 刪除所有 endpoints。
- Function 改名：endpoint 以 Function ID 關聯，不受影響。

### 9. 編輯器 API 與介面

```text
GET    /projects/:projectId/endpoints
PUT    /projects/:projectId/assets/:functionId/endpoint   { path }
DELETE /projects/:projectId/assets/:functionId/endpoint
```

Asset 的讀取回應附上 endpoint 資訊（path 與完整 URL）。前端在 Function 的設定區塊提供 path 輸入、即時的格式檢查、重複 path 的錯誤提示、完整 URL 顯示與複製按鈕。

## Risks / Trade-offs

- **[他人的半成品被外部呼叫執行]** → 一律使用最新版本的已知代價；若 endpoint 開始被正式系統依賴，改為發布制或區分 Test URL 與 Production URL。
- **[有人存了 invalid 草稿，endpoint 開始回 409]** → 回應附上不可執行的原因；編輯器在 Function 設有 endpoint 時提示「此 Function 目前對外提供服務」。
- **[沒有驗證，任何人都能觸發執行]** → POC 僅部署於內部網路；API key 為後續工作。
- **[大量請求耗盡記憶體]** → 執行中的 execution 不會被 registry 淘汰，POC 不做速率限制；以內部網路與低使用量為前提。
- **[逾時後呼叫端無法取得結果]** → 回應附 execution ID，可在 Inspector 查看；非同步模式為後續工作。
- **[錯誤訊息暴露內部細節]** → 500 回應包含 Node 錯誤訊息，僅適合內部網路；對外開放前需改為只回傳 execution ID。

## Migration Plan

1. 等 `definition-store` 完成 backend、資料庫與 Registry，`typed-function-ports` 完成執行服務與 in-memory execution registry。
2. 新增 `endpoints` 資料表的 migration。
3. 實作 endpoint 設定的 repository 與編輯器 API。
4. 實作 `/run` 路由、輸入輸出對應、錯誤對應與逾時。
5. 在 execution record 加上執行來源。
6. 前端加入 endpoint 設定介面。

Rollback 為移除 `/run` 路由與 `endpoints` 資料表；Function 定義不受影響。
