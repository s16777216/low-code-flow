# Code Workflow Engine POC 計劃書 v0.3

> v0.3 相對 v0.2 的主要變更：
>
> - 資料契約由「單一 Object 進、單一 Object 出」改為 **具名、有型別的多個 Input / Output Port**，並以 **名義式型別（nominal type）** 驗證連線。
> - Node 之間以 **Port 對 Port 的 Edge** 傳遞資料，取代 Input Mapping 與 Path Expression。
> - 定義存放在 **共用伺服器上的資料庫**（SQLite，保留換 Postgres 的空間），以 **Project** 為容器；不再使用檔案作為真相來源。
> - **一律使用最新版本**，沒有發布、版本與 Draft / Published；可以儲存不完整的草稿，但不可執行。
> - **Execution 只存在記憶體**，不持久化。
> - Code Node 在 **受限的 Node 子行程** 執行（取代 Deno）。
> - 前端為 Vue 3 + Vue Flow（取代 React + React Flow）。
>
> 可驗證的行為以 `openspec/specs/` 為準；本文件說明設計理由與整體脈絡。對應關係見最後一節。

## 1. 專案目標

本 POC 旨在驗證一套以 **TypeScript／JavaScript Code 為核心、Function Composition 為複用模型、DAG 為執行模型、名義式型別為資料契約** 的 Developer-oriented Workflow Engine。

部署形態是 **一台共用伺服器、多人透過視覺編輯器編輯**；定義只經由編輯器寫入。

本 POC 不以完整複製 n8n 為目標，而是聚焦於：

- 視覺化建立執行流程
- Code Node
- Function 組合與複用
- Nested Function
- 具名、有型別的 Input / Output Port
- 名義式型別與連線驗證
- Execution Tracking
- Node Input / Output / Error Debugging

---

# 2. 核心設計理念

## 2.1 Function 是唯一可複用單位

系統不另外提供：

- Reusable Code Node
- Reusable Node

所有複用都透過 Function 完成。

```text
Code Node
    ↓
包裝成 Function
    ↓
被其他 Function 引用
```

例如：

```text
Function: GetUser

userId: UserId ──→ Code: fetchUser ──→ user: User
```

其他 Function 可以透過 Function Node 使用：

```text
Function: ProcessOrder

Inputs ──→ Function Node: GetUser ──→ Code: ValidateOrder ──→ Outputs
```

## 2.2 資料只沿名義式型別傳遞

兩個型別即使資料結構完全相同，也不會因此相容：

```text
UserId  (繼承 string)
OrderId (繼承 string)

UserId → OrderId   ✗  結構相同，但是不同的領域概念
UserId → string    ✓  子型別可以傳給父型別
string → UserId    ✗  父型別不能傳給子型別
```

只有 **相同型別，或來源型別繼承目標型別** 時才能直接連線。要把一種型別變成另一種，必須經過明確的 Code Node 並在輸出時驗證。

## 2.3 一律使用最新版本

Function、Type 之間的引用只記錄 Asset ID，一律解析為目前儲存的定義。沒有發布、版本鎖定或升級流程。

代價是：他人儲存的半成品會立即被引用者使用；他人儲存了不完整的草稿，引用它的 Function 立即變成不可執行。POC 接受這個代價；若成為實際問題，改為發布制時只需新增版本表與「已發布版本」指標，引用格式不必改變。

---

# 3. Domain Model

```text
Project
├── Type            （名義式型別，單一繼承）
└── Function
    ├── Signature   （具名、有型別的 Input / Output Ports）
    ├── Input Boundary    ($input)
    ├── Code Node
    ├── Function Node
    ├── Output Boundary   ($output)
    └── Edge        （Output Port → Input Port）
```

Type 與 Function 都是 **Asset**：以建立後不可變的 Asset ID 識別，儲存在資料庫，名稱可修改而不影響引用。

Node 分成兩類：

```text
Boundary Node（由 Function 的 Signature 投影，不另外儲存 Port）
├── Input Boundary   ($input)   提供 Function 的 Inputs
└── Output Boundary  ($output)  接收 Function 的 Outputs

Executable Node
├── Code Node        自己定義 Ports 與程式碼
└── Function Node    只記錄 Child Function ID，Ports 來自 Child 目前的 Signature
```

---

# 4. Project

Project 是 Type 與 Function 的容器，也是引用範圍：

- 一台伺服器可有多個 Project，Project 內含多個 Type 與 Function。
- 引用只能指向同一個 Project 內的 Asset，或 `system:*` 內建型別；**不支援跨 Project 引用**。
- 刪除 Project 會一併刪除其所有 Asset，並取消其執行中的 Execution。
- POC 不做登入與權限：任何能連到伺服器的人都能存取所有 Project。

---

# 5. Type

## 5.1 系統基礎型別

八個不可變的系統型別，ID 為 `system:*`：

```text
string  number  boolean  date  function  object  array  any
```

使用者型別必須直接或間接繼承 `any` 以外的其中一個基礎型別；`any` 不能作為任何型別的 parent。

## 5.2 使用者型別

```json
{
  "parentTypeId": "system:string",
  "constraints": { "minLength": 3, "pattern": "^u-" }
}
```

- 單一繼承，不允許環。
- 約束依「根型別」（沿繼承鏈到系統基礎型別）決定：

| 根型別 | 可用約束 |
|---|---|
| string | `minLength`、`maxLength`、`pattern` |
| number | `min`、`max`、`integer` |
| object | `properties`（完整屬性清單：`name`、`typeId`、`required`） |
| array | `elementType` |
| boolean、date、function、any | 無 |

- 子型別只能**收窄**：不能放寬範圍、不能移除或放寬繼承來的屬性、屬性型別只能覆寫為可指派的子型別。
- 省略 `properties` 代表完整繼承父型別的屬性。
- Array 型別必須定義元素型別（父型別已定義時可省略）。

## 5.3 名義式指派（assignability）

```text
可指派 = 相同型別
       ∨ 來源是目標的子孫
       ∨ 任一端是 any
```

`any` 是唯一例外，且雙向都允許：

- **傳入 `any`**：設計期一律接受，值保留原本的型別身分。
- **從 `any` 傳出**：設計期接受；**執行期**依目標型別驗證，通過後才重新標記為目標型別，失敗則接收的 Node 失敗並回報該 Input Port 的驗證錯誤。

## 5.4 有型別的值（Typed Value）

跨 Port 或 Function 邊界的資料同時帶有 **型別身分** 與 **值**：

```ts
interface TypedValue {
  typeId: string;
  typeDefinitionHash: string; // 該型別定義的 canonical hash，只用於 trace
  value: JsonValue;
}
```

- 值依其型別與**完整繼承鏈**驗證；型別身分不由資料結構推測。
- 使用者程式碼**不能偽造型別身分**：Backend 只信任 Port 的宣告，程式碼回傳的任何「型別」欄位都只是資料。

## 5.5 date 與 function 的傳輸表示

JSON 無法直接表示，採標記格式：

```json
{ "$kind": "date", "iso": "2026-10-02T08:30:15.123Z" }
{ "$kind": "function-ref", "functionId": "..." }
```

- `date` 必須是含時區的 ISO 8601。程式碼收到的是 `Date` 物件，回傳 `Date` 會自動編碼。
- `function` 只是 **Function 的引用**，不是 JavaScript closure；Runner 拒絕 closure 與任何不可序列化的值。

---

# 6. Function

Function 是：

> 一個具有明確 Signature（具名、有型別的 Input / Output Ports），並由 DAG 組成的可執行、可複用單位。

```ts
interface FunctionDefinition {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  layout?: Record<string, { x: number; y: number }>; // 編輯器畫布位置
}

interface PortDefinition {
  id: string;     // 建立後不可變
  name: string;   // 同一方向、同一擁有者內唯一
  typeId: string; // 引用的型別 ID
}
```

規則：

- **Port ID 不可變**：改名、改型別都不影響既有的 Edge。
- 所有 Port 都是**必要**的；沒有 optional port。可為空值的資料用允許該值的型別表示。
- Signature 是 Boundary 的唯一來源：`$input` 的輸出 Port 就是 Function 的 Inputs，`$output` 的輸入 Port 就是 Function 的 Outputs，不另存副本。
- POC 禁止 Recursive Function（直接或間接呼叫自己）。

---

# 7. Code Node

Code Node 是最小程式執行單位。程式碼是一個 **async function 的內容**（因此可以直接 `return`、`await`）：

```js
const response = await fetch(`https://api.example.com/users/${ctx.inputs.userId}`);
const user = await response.json();
ctx.log("fetched", user.id);
return { user };
```

- 以 `ctx.inputs.<portName>` 讀取輸入；以 `{ <outputPortName>: value }` 回傳**所有**宣告的輸出。
- 程式碼是 **JavaScript**（實際執行的就是這段文字，不會經過 TypeScript 轉譯）；編輯器以 Port 產生的型別提供補全與檢查。
- `date` 輸入是 `Date`；`function` 輸入是 `{ $kind: "function-ref", functionId }`。
- 可以失敗、可以逾時。
- Code Node 本身不直接 reusable。

---

# 8. Function Node

Function Node 用於引用另外一個 Function。它**只記錄 Child Function 的 ID**：

```json
{ "id": "call-1", "kind": "function", "name": "GetUser", "functionId": "<asset id>" }
```

- 它對外的 Input / Output Ports 一律是 Child **目前**的 Signature，不另存。
- 只能看到 Child 的 Signature，不能存取其內部 Node。
- 每個 Function Node 的每次呼叫建立**一個** Child Execution，一次傳入全部 Input、成功時一次取得全部 Output。

---

# 9. Port 與 Edge

## 9.1 Edge

```ts
interface EdgeDefinition {
  id: string;
  sourceNodeId: string;
  sourcePortId: string; // 必須是 source Node 的 Output Port
  targetNodeId: string;
  targetPortId: string; // 必須是 target Node 的 Input Port
}
```

- 兩端型別必須可指派（見 5.3）。
- 每個 Input Port **恰有一個** producer；一個 Output Port 可以連到多個 Input Port（fan-out）。
- 多來源要合併，必須由有多個 Input Port 的 Node 明確完成，沒有隱含的 concat / zip。
- 沒有 producer 的必要 Input、沒有 producer 的 Function Output 都是錯誤。

## 9.2 不再有 Input Mapping 與 Expression

v0.2 的 Path Reference（`nodes.getUser.output.user`）與 Mapping 已移除。資料流完全由 Edge 表達，相依關係可直接由 Edge 推導，不需要第二套來源。

## 9.3 Node 與 Edge 的身分

- Node ID、Edge ID、Port ID 都是不可變的識別；顯示名稱可以修改，不影響連線。
- `$input`、`$output` 是保留的 Node ID。
- 同一個 Function 可以在同一個 Parent 使用多次：它們的 Function ID 相同、Node ID 不同、各自有獨立的 Execution。

---

# 10. 驗證與可執行狀態

## 10.1 兩層驗證

| 層級 | 檢查內容 | 不通過時 |
|---|---|---|
| 結構 | 文件格式、`schemaVersion`、`kind`、ID 規則（不可用 `system:` 前綴、不可改變 ID） | 拒絕寫入（400） |
| 語意 | Port 連線、型別相容、引用是否存在、環、必要 Port 是否連線、型別繼承與約束 | **照常儲存**，成為診斷（diagnostics） |

這讓使用者可以**隨時儲存編輯到一半的草稿**。

## 10.2 可執行（Executable）

一個 Asset 只有在「自身沒有錯誤，且它依賴的所有 Asset 都可執行」時才可執行。不可執行會沿相依關係向上傳遞，診斷會指出原因來自哪個被引用的 Asset。

不可執行的 Function **不能開始 Execution**。

## 10.3 三種相依圖

系統實際驗證三種圖：

```text
1. Function 內部的 Node DAG（由 Port-to-Port Edge 推導）
2. Function Dependency DAG（Function 之間的呼叫）
3. Type Inheritance（型別繼承，不可成環）
```

## 10.4 Contract 變更

Child Function 改變 Signature 時，Parent **立即**重新驗證：

- 刪除或改變 Parent 已連線的 Port → Parent 的對應 Edge 失效、Parent 變成不可執行，診斷指出原因。
- 只修改 Child 內部（程式碼、內部 Node）而 Signature 不變 → Parent 完全不受影響，下一次執行用新的 Child。
- 修改 Type 使原本相容的 Edge 不再相容 → 所有相依的 Function 立即以新定義重新驗證。

編輯器提供「影響範圍」：列出某個 Asset 被哪些 Asset 使用（遞迴）以及它們目前是否可執行。

被其他 Asset 引用的 Asset **不能刪除**，回應會列出引用者。

---

# 11. 不做版本與發布

完整 Function Versioning、Draft / Published 皆 Out of Scope。

保留的只有：

- 每份定義的 **`revision`**：用於多人同時編輯的樂觀鎖，與版本或發布無關。
- 每個 Asset 的 **canonical content hash**：只用於 Execution 的快照與 trace，標示「當時執行的是哪個內容」，不參與合法性判斷。

多人同時存檔時，存檔須附上讀取時的 `revision`；不符就拒絕並提示重新載入，POC 不做合併或即時協同。

---

# 12. Execution Model

Execution 分成：

```text
Function Execution
Node Execution
```

其中 Function Node 建立 Child Execution：

```text
Execution A
├── Code A
├── Function Node → Execution B
│                  ├── Code B1
│                  └── Code B2
└── Code C
```

## 12.1 開始執行時固定定義

Execution 開始時：

1. 驗證 Function 為可執行。
2. 依 Function 的每個 Input Port 驗證外部傳入的 raw 值並標記型別；任何一個失敗，**不建立 Execution**，並回報是哪個 Port。
3. 取得 Registry 的**不可變快照**，並記錄整個相依閉包（Function 與 Type）的 Asset ID、revision 與 content hash。

之後他人修改定義**不影響進行中的 Execution**；下一次執行才會用新定義。

## 12.2 Execution 是暫時的

Execution 與 Node Execution 只存在 Backend 的記憶體：

- 執行中的 Execution 不會被淘汰；結束後保留一段時間（預設 10 分鐘），並限制保留數量（預設 100 棵）。
- 每個 Node 的 log 與 output 有大小上限。
- Backend 重新啟動後，所有 Execution 都不存在；UI 會明確顯示「此 Execution 已不存在，請重新執行」。
- **不提供**歷史查詢、分頁、統計或重啟後復原。

Trace 以不可變的 Port ID 記錄各 Input / Output 的 Typed Value、型別身分、hash、錯誤與當時的 Port 顯示名稱，因此事後改名不影響已保留的 trace。

---

# 13. Execution Status

Function Execution：

```text
running
success
failed
cancelled
```

Node Execution：

```text
pending
running
success
failed
skipped
cancelled
```

upstream failed 時 downstream 必須能表示 `skipped`，所以狀態不只 `pending / running / success / failed`。

---

# 14. Error Propagation

> 任一必要 Dependency Failed，Downstream Node 全部 Skipped，Function Execution Failed。

```text
A
├── B ✗
└── C ✓
     ↓
     D   （同時依賴 B 與 C）
```

```text
D = skipped
Function = failed
```

---

# 15. Join Semantics 與 Node 的就緒條件

Node 有多個 Input Port 時：

```text
B ─┐
   ├→ D
C ─┘
```

> 所有 Input Port 都收到成功產生、且通過型別驗證的值後，Node 才會開始。

- 只有部分 Input 就緒：Node 保持 `pending`。
- 任一 producer 失敗、略過或取消：Node 變成 `skipped`，**不會**以部分 Input 執行。
- 沿 Edge 傳遞時才套用 `any` 的重新標記：值離開 `any` 但不符合目標型別時，**接收的 Node 失敗**，錯誤指向該 Input Port。

POC 不支援 Conditional Edge、OR Dependency、Branch Condition。

---

# 16. Output 原子發布

成功的 Node 對**每個宣告的 Output Port 產生且僅產生一個**通過驗證的值。

- 缺少、多出（未宣告）、或型別不符的輸出，都讓 Node 失敗，且**不發布任何部分結果**。
- Backend 先驗證全部輸出，才在單一步驟發布並將 Node 標為 success。
- 空值（`0`、`false`、`""`、`[]`、`{}`）與「沒有輸出」不同：只有**缺少**才算沒有輸出。

---

# 17. Parallel Execution

DAG 可以：

```text
       B
      ↗
A
      ↘
       C
```

B、C 在各自的輸入都就緒後立即開始，彼此平行；排程是事件驅動的（不分批次等待）。

**目前尚未限制並行數。** 若要避免同時建立過多 Runner 行程，需要加入 `maxConcurrency`（建議 4）；這是已知的後續工作。

---

# 18. Execution Cancel

支援取消整棵 Execution 樹：

- 執行中的 Runner 行程被終止。
- 尚未開始的 Node → `cancelled`。
- Function → `cancelled`。

刪除 Project 時，其執行中的 Execution 一併取消。

---

# 19. Timeout

Code Node 有逾時（預設 30 秒）：超過就終止 Runner 行程，Node 失敗。

Function 層級的逾時不在 POC 範圍。

---

# 20. Code Runtime

```text
Node.js Backend
+
受限的 Node 子行程（每個 Code Node 一個）
```

Backend 負責 API、DAG、Execution、定義的儲存與驗證；子行程只負責執行使用者的程式碼。

子行程以 Node 的權限模型啟動（`node --permission`）：

| 項目 | 預設 |
|---|---|
| 檔案系統 | **拒絕**（只能讀取 Runner 自己的腳本） |
| 子行程 | **拒絕** |
| Worker | **拒絕** |
| 環境變數 | **不傳入**父行程的環境（Windows 只傳入 Winsock 需要的 `SystemRoot`） |
| 網路 | 允許 |
| 記憶體 | 預設上限 256 MB |

這樣在共用伺服器上，使用者的程式碼無法讀取資料庫檔案、環境變數，也不能結束服務。

如果 POC 目的包含「執行不可信任的第三方程式碼」，Sandbox 仍須升級為核心研究項目；本 POC 的目標是可信任的內部開發者。

---

# 21. Runner Contract

Backend 只依賴 Runner Protocol，與傳輸方式無關：

```ts
// 以 Port 名稱為 key，值為 JSON 傳輸格式（date 是標記格式）
interface RunnerRequest {
  code: string;
  inputs: Record<string, unknown>;
}

type RunnerResponse =
  | { ok: true;  outputs: Record<string, unknown>; logs: string[] }
  | { ok: false; error: { kind: "error" | "timeout" | "cancelled" | "protocol"; message: string; stack?: string }; logs: string[] };
```

- Runner **不回報**型別身分；型別一律由 Backend 依 Port 宣告驗證與標記。
- `console.log` 與 `ctx.log` 進入 `logs`，不混入輸出。

未來可將子行程替換成：

```text
Deno
Docker
gVisor
Firecracker
Remote Runner
```

而不需要修改 Orchestrator。

---

# 22. Package Dependency

POC 不支援：

```js
import axios from "axios";
import lodash from "lodash";
```

第一版只允許：

- Runtime built-in API
- `fetch`
- 基礎 JS API

暫不實作：npm install、Dependency version、Package cache、External package sandbox。

---

# 23. Secrets

Code 不應直接 hardcode token。完整 Credential Manager 不在 POC 範圍；目前**也沒有**實作 `ctx.secrets`。因為子行程的環境變數是空的，需要密鑰時必須在日後透過明確的機制注入。

---

# 24. Output Size Limit

Node 的輸出與 log 必須限制大小：

- 單一 Node 輸出：預設 1 MB。
- 單一 Node 的 log：預設 64 KB（超過會截斷並標示）。
- Runner 的整體輸出：預設 2 MB。

避免 Backend 記憶體耗盡、Browser Memory 問題與 Inspector 卡頓。

---

# 25. Log 與 Output 分離

必須區分 Log 與 Output：

```js
console.log("fetch user");
return { user };
```

```text
logs:   fetch user
output: { user: ... }
```

stdout 不能同時作為 Function Output。

---

# 26. Persistence

使用 SQLite + Drizzle ORM；Backend 其他模組**不直接**碰資料庫，只透過 Registry。

```text
projects
  id, name, created_at, updated_at

assets
  id, project_id, kind ('type' | 'function'), name,
  schema_version, definition (JSON), revision,
  created_at, updated_at
```

定義採 Document Pattern：整份定義存成一個 JSON 欄位，SQL 不查詢 JSON 內部。

為了日後可換成 Postgres：

- ID 用文字（UUID），不用自動遞增整數。
- 時間存 ISO 字串，由應用程式產生。
- 只用兩邊都支援的語法。
- 診斷、可執行狀態、相依索引都是由定義推導的，**不寫入資料庫**，啟動與每次寫入時重新計算。
- 設計假設只有**單一 Backend 實例**；多實例需要額外機制同步各實例的 Registry。

---

# 27. Execution 不持久化

v0.2 規劃的 `executions`、`node_executions` 資料表**不再需要**：Execution 只存在記憶體（見 12.2）。

這個決定可以日後改變：資料庫已存在，持久化的成本很低；但「重啟後大家的紀錄消失」是目前 POC 明確接受的限制。

---

# 28. Registry

Registry 是 Backend 其他模組讀取定義的**唯一**入口：

```ts
interface ProjectAssetRegistry {
  getSnapshot(): AssetRegistrySnapshot;
  getAsset(assetId: string): AssetRecord | undefined;
  getDependencies(assetId: string): readonly string[];
  getDependents(assetId: string): readonly string[];
  subscribe(listener: (change: RegistryChange) => void): () => void;
}
```

- 每個 Project 在記憶體中有一個 Registry，啟動時由資料庫建立。
- 每次寫入的順序：寫入資料庫 → 重算該 Asset 與其所有反向依賴者的診斷與可執行狀態 → **單一步驟**替換快照 → 通知訂閱者。資料庫寫入失敗時快照不變。
- 快照不可變：Execution 持有快照期間，後續的寫入不會改變它。

---

# 29. Definition Schema

```ts
type AssetKind = "type" | "function";
// definition 的 JSON 形狀見第 5.2 與第 6 節
```

範例：先在同一個 Project 建立兩個 Type Asset。`UserId` 繼承 `system:string`，`User` 繼承 `system:object`；`User` 的 `id` 屬性引用 `UserId`，因此下方 Code Node 的輸出會依這些約束驗證。

```json
{ "parentTypeId": "system:string", "constraints": { "pattern": "^u-" } }
{ "parentTypeId": "system:object", "constraints": { "properties": [{ "name": "id", "typeId": "<UserId asset id>", "required": true }, { "name": "name", "typeId": "system:string", "required": true }] } }
```

這兩份是各自 Asset 的 `definition`，不是同一個 JSON 文件。下方為 Function Asset 的 `definition`（省略 layout）；尖括號表示建立 Asset 後取得的穩定 ID：

```json
{
  "inputs":  [{ "id": "in-user",  "name": "userId", "typeId": "<UserId asset id>" }],
  "outputs": [{ "id": "out-user", "name": "user",   "typeId": "<User asset id>" }],
  "nodes": [
    {
      "id": "fetch",
      "kind": "code",
      "name": "Fetch user",
      "code": "return { user: { id: ctx.inputs.userId, name: 'Example' } }",
      "inputs":  [{ "id": "f-in",  "name": "userId", "typeId": "<UserId asset id>" }],
      "outputs": [{ "id": "f-out", "name": "user",   "typeId": "<User asset id>" }]
    }
  ],
  "edges": [
    { "id": "e1", "sourceNodeId": "$input", "sourcePortId": "in-user", "targetNodeId": "fetch",   "targetPortId": "f-in" },
    { "id": "e2", "sourceNodeId": "fetch",  "sourcePortId": "f-out",   "targetNodeId": "$output", "targetPortId": "out-user" }
  ]
}
```

---

# 30. Frontend 技術

```text
Vue 3
TypeScript
Vite
Vue Flow          （畫布）
Pinia             （狀態）
Vue Router
Tailwind CSS v4   （樣式）
Reka UI           （headless 元件，包在 @low-code-flow/ui）
Monaco Editor     （Code 編輯）
Lucide            （icon）
```

前端分成兩個 workspace package：

```text
@low-code-flow/ui   與 domain 無關的元件與樣式規格（design tokens）
frontend            應用程式；擁有 domain 元件（TypeBadge、Port 顯示…）與 domain tokens
```

`ui` 不得依賴 `frontend`；需要 Type、Port 等 domain 型別的元件留在 `frontend`，以組合 `ui` 元件的方式實作。

---

# 31. Frontend State

Server State（Project、Type、Function 清單，目前開啟的 Function）：以 **Pinia store** 搭配 `fetch` 管理，Function 的完整定義在編輯器載入時取得。

Editor State：畫布的 Node / Edge、選取的 Node、Inspector 狀態、未存檔狀態，都在編輯畫面內管理；離開頁面前若有未存檔的修改會要求確認。

多人編輯的衝突：存檔回應 409 時提示「此定義已被修改」並提供重新載入，不自動合併。

---

# 32. Workflow Editor

畫布顯示：

```text
Inputs ──→ Code ──→ Function Node ──→ Outputs
```

- 每個 Port 有固定的 handle（以 Port ID 為識別）；Port 名稱旁以 tooltip 顯示 **型別名稱**，並依根型別著色。
- 開始連線時，**可接受的 Port 高亮、其餘變暗**：從 Output 拖曳高亮可接的 Input，從 Input 拖曳高亮可接的 Output。高亮與放開時的驗證結果一致（型別、該 Input 是否已有 producer、是否成環）。
- 在不能接受的 Port 上放開連線時，**說明原因**（例如「UserId is not assignable to OrderId」），而不是靜默地什麼都不做。
- Function Node 的 Port 是唯讀投影；雙擊可開啟被呼叫的 Function。
- 右側 Inspector 依選取的對象顯示：Function 的 Signature、Code Node 的 Port 與程式碼、Function Node 的投影與連結。
- 診斷（問題清單）與「可執行／不可執行」狀態顯示在畫面上方。

另有：

- **Type 管理**：繼承鏈、依根型別切換的約束欄位、不提供自己與子孫作為 parent（避免成環）、系統型別唯讀、影響範圍（被誰使用）。
- 草稿可以儲存；不完整的定義會顯示問題並標示為不可執行。

---

# 33. Code Editor

Code Node 使用 Monaco Editor（第一次編輯 Code Node 時才載入）：

- JavaScript 語法標示與基本補全。
- `ctx.inputs.` 依 Input Port 的名稱與根型別補全。
- 缺少、多出或型別不符的輸出，直接在對應的行顯示錯誤；改名 Port 後立即更新。
- 跟隨系統的深色主題。

這是設計期的**提示**；執行後 Backend 對輸出的驗證才是準則。不需要完整的 TypeScript Language Server。

---

# 34. Execution UX

- Run：依各 Input Port 的型別收集輸入（文字、數字、布林、含時區的日期、其餘為 JSON），送出前先在本機解析，伺服器再逐 Port 驗證。
- 輪詢取得 trace，直到不再 `running`；可以取消。
- Execution 檢視：每個 Port 的值、**型別身分**（若是子型別會標示「as 宣告的型別」）、定義 hash、錯誤；每個 Node 的狀態、耗時、log；Function Node 展開 Child Execution（遞迴）。
- Trace 不存在時（已淘汰或 Backend 已重啟）明確顯示，而非空白。

即時推送（SSE）目前**沒有**實作，以輪詢代替。

---

# 35. Backend 技術

```text
Node.js 24（直接執行 TypeScript，不需建置步驟）
TypeScript
Fastify
Drizzle ORM + better-sqlite3
Vitest
```

---

# 36. DAG Engine

核心流程：

```text
Registry 快照
    ↓
驗證可執行、驗證並標記外部輸入的型別
    ↓
固定相依閉包（ID、revision、hash）
    ↓
就緒的 Node（所有 Input Port 都有值）→ 執行
    ↓
驗證全部 Output → 原子發布
    ↓
沿 Edge 傳遞（名義指派；離開 any 時驗證並重新標記）
    ↓
解鎖下游；失敗則下游 skipped
```

Node 之間的順序由 Port-to-Port Edge 推導；環以 Kahn 演算法偵測。

---

# 37. API

## Project

```http
GET    /projects
POST   /projects
PATCH  /projects/:projectId
DELETE /projects/:projectId
```

## Asset（Type 與 Function）

```http
GET    /projects/:projectId/assets
POST   /projects/:projectId/assets
GET    /projects/:projectId/assets/:assetId
PUT    /projects/:projectId/assets/:assetId      # 需附 expectedRevision
DELETE /projects/:projectId/assets/:assetId      # 被引用時 409
GET    /projects/:projectId/assets/:assetId/impact
```

## Type 與 Function 查詢

```http
GET /system-types
GET /projects/:projectId/types
GET /projects/:projectId/types/:assetId          # 含 rootKind 與繼承鏈
GET /projects/:projectId/functions
GET /projects/:projectId/functions/:assetId      # 含 Signature 與 Node 的投影 Port
```

## Execution

```http
POST /projects/:projectId/functions/:assetId/execute   # body: { inputs: { <portName>: <raw> } }，回 202
GET  /executions/:executionId                          # 含巢狀的 Child Execution
POST /executions/:executionId/cancel
```

主要的狀態碼：結構錯誤 `400`、不存在 `404`、`revision` 衝突或被引用 `409`；執行：輸入錯誤 `400`（逐 Port 說明）、Function 不可執行 `409`。

---

# 38. POC Scope

## Must Have

```text
Project 與 Asset 的 CRUD

名義式型別（單一繼承、約束、any）

具名、有型別的多個 Input / Output Port

Code Node

Function Node（Signature 投影）

Port-to-Port Edge 與連線驗證

DAG 與 Cycle Detection（Node、Function 呼叫、型別繼承）

Function Reuse 與 Nested Execution

草稿與可執行狀態

Code 在受限行程執行

Execution Trace（記憶體）

Error Propagation
```

## Should Have

```text
視覺化編輯器（Vue Flow）

Monaco Editor（依 Port 產生型別）

Execution Inspector

連線時的相容 Port 高亮與原因說明

Node Timeout

Cancel Execution

Parallel Execution
```

## Could Have

```text
maxConcurrency

SSE

HTTP Endpoint 作為 Function 入口（http-endpoint-trigger）

Function Import / Export
```

## Out of Scope

```text
Webhook Trigger 與 Schedule / Cron（HTTP Endpoint 除外）

Conditional Edge

Retry

Queue

Distributed Worker

Authentication / RBAC / Multi-tenancy

發布、版本歷史與還原

跨 Project 引用

Secrets Manager / Credential Manager

npm packages

Binary Data / Files

Human Approval / Pause / Resume

Long-running Workflow

Execution 的持久化與歷史查詢

多個 Backend 實例

Marketplace
```

---

# 39. POC 核心驗證案例

每個案例都有對應的自動化測試（Backend 的單元、整合與端對端測試；後者走 HTTP API 並使用真實的沙箱 Runner）。

## Case 1 — Single Code

```text
Inputs ──→ Code ──→ Outputs
```

## Case 2 — Linear DAG

```text
Inputs ──→ Code A ──→ Code B ──→ Outputs
```

## Case 3 — Nested Function

```text
Function A:  Inputs ──→ Function Node (B) ──→ Outputs
```

多個 Input / Output Port 一次傳入、一次取得。

## Case 4 — Nested Multiple Levels

```text
Function A ──→ Function B ──→ Function C
```

## Case 5 — Parallel

```text
         ┌→ Code B
Inputs ──┤
         └→ Code C
```

B、C 同時進行。

## Case 6 — Join

```text
B ─┐
   ├→ D
C ─┘
```

D 必須等待 B、C。

## Case 7 — Node Error

```text
Code B → throw Error
```

Downstream `skipped`；Function `failed`。

## Case 8 — Timeout

```js
for (;;) {}
```

Runner 行程必須被終止。

## Case 9 — DAG Cycle

```text
A → B → A
```

必須標示為不可執行。

## Case 10 — Function Dependency Cycle

```text
Function A → Function B → Function A
```

必須標示為不可執行。

## Case 11 — Sibling Types

```text
UserId ──✗──→ OrderId     （都繼承 string，但互不相容）
```

連線被拒；即使強行存成草稿，Function 也是不可執行。

## Case 12 — Subtype to Parent

```text
UserId ──✓──→ string
```

值保留 `UserId` 的型別身分。

## Case 13 — any

```text
任何型別 ──→ any ──→ UserId
```

設計期接受；執行期依 `UserId` 驗證，不符則接收的 Node 失敗。

## Case 14 — Output Validation

Code 缺少輸出、回傳多出的輸出、或型別不符：Node 失敗且不發布任何結果。

## Case 15 — Contract Change

Child 刪除一個 Parent 已連線的 Port：Parent 立即變為不可執行；只改 Child 內部則 Parent 不受影響。

## Case 16 — Concurrent Edit

兩人以同一個 `revision` 存檔：第二個被拒絕（409）並取得目前的 `revision`。

## Case 17 — Sandbox

Code 嘗試讀檔、啟動子行程、開 Worker、讀環境變數：全部被拒絕；網路仍可使用。

---

# 40. 建議開發階段

## Phase 1 — Domain Model

Type、Function、Port、Edge、Execution、Node Execution；不可變的 ID；`schemaVersion`；Execution 狀態。

## Phase 2 — 儲存與 Registry

SQLite、Project 與 Asset、`revision` 樂觀鎖、Registry 與診斷／可執行狀態。（`definition-store`）

## Phase 3 — 型別與 Execution

名義式型別、Port-to-Port Edge、Runner、DAG 排程、Nested Function、原子輸出、記憶體中的 Execution Registry。（`typed-function-ports`）

## Phase 4 — Editor UI

畫布、Inspector、Type 管理、Monaco、Execution Inspector。（`add-ui-package`、`typed-function-ports`）

## Phase 5 — 外部入口

以 HTTP Endpoint 觸發 Function。（`http-endpoint-trigger`，尚未開始）

---

# 41. POC Success Criteria

最小成功標準：

建立兩個 Function：

```text
Function B:  Inputs (id: UserId)  ──→ Code ──→ Outputs (label: string, length: number)
```

```text
Function A:  Inputs (id: UserId) ──→ Function Node (B) ──→ Outputs (label, length)
```

執行 Function A 後，系統必須正確完成：

```text
輸入驗證並標記型別
        ↓
Function B 的 Child Execution（一次傳入全部 Input）
        ↓
Function B 的輸出驗證與原子發布
        ↓
沿 Edge 傳遞（名義指派）
        ↓
Function A 的 Outputs
```

同時可追蹤：

```text
Function Execution
Node Execution
每個 Port 的值與型別身分
定義 hash
錯誤
狀態與耗時
```

若上述流程成立，即代表核心架構成立。

---

# 42. 最重要的待驗證假設

POC 不只是驗證技術是否能做出來，而是驗證以下產品假設。

## 假設一

```text
Function 作為唯一 Reusable Unit
```

是否比 `Reusable Node + Workflow` 更容易理解。

## 假設二

```text
名義式的 Typed Port
```

是否真的能提高 Function Reuse 的可靠性：相同結構但不同意義的資料（如 `UserId` 與 `OrderId`）不會被誤接；代價是必須明確建立型別與轉換。

## 假設三

```text
Nested Function Composition
```

是否比直接 Copy Code Node 更好維護。

## 假設四

```text
一律使用最新版本
```

在多人同時修改被引用的 Function 時，是否可以接受（他人的草稿會立即影響引用者），還是很快就需要發布制。

## 假設五

```text
Developer-first Code Workflow
```

是否有足夠明確的使用價值，而不是單純的「簡化版 n8n」。

---

# 43. 核心架構原則

### Function 是唯一 reusable unit

```text
Function = Reusable Boundary
```

### Node 是 Function 內部 Instance

```text
Node ≠ Reusable Asset
```

### Code Node 只處理明確的 Input

```text
ctx.inputs.<portName>
```

不要直接依賴整個 Workflow Context。

### Function 只能透過 Signature 溝通

Parent 不應直接讀 Child Function 內部 Node。

### 型別是名義式的

```text
結構相同 ≠ 相容
```

### 型別身分只來自宣告

使用者程式碼不能宣稱自己產生的是什麼型別。

### Orchestrator 與 Runner 分離

```text
Orchestrator ≠ Code Runtime
```

### Definition 與 Execution 分離

```text
Definition = 應該如何執行（持久化，一律最新）
Execution  = 這次實際怎麼執行（暫時，固定當時的定義）
```

### 其他模組只透過 Registry 讀取定義

資料庫、檔案或快取是 Registry 背後的實作細節。

---

# 44. POC 的真正核心

本 POC 最重要的並不是：

```text
Vue Flow
Monaco
SQLite
子行程沙箱
```

而是驗證這四個 abstraction 是否成立：

```text
Function
Node
Contract（具名、有型別的 Port）
Execution
```

如果這四者能形成簡單、一致且可預期的模型，後續才值得繼續擴充：

```text
Trigger / Schedule
Secrets
Packages
發布與版本
Distributed Execution
Production Sandbox
```

因此 POC 第一優先應驗證：

```text
Function Composition
+
名義式的 Typed Data Contract
+
Nested Execution
+
Execution Observability
```

而非提早建立完整的 Automation Platform。

---

# 45. 與 OpenSpec 的對應

可驗證的需求在 `openspec/specs/`（已歸檔）與 `openspec/changes/`（進行中）：

| 本文件 | OpenSpec |
|---|---|
| 4 Project | `projects` |
| 5 Type、5.3 指派、5.4 Typed Value | `nominal-type-system`（`typed-function-ports`） |
| 6–9 Function、Port、Edge | `typed-function-ports` |
| 10、11、26–28 驗證、版本、儲存、Registry | `project-asset-registry` |
| 12–17 Execution | `typed-function-ports` |
| 30–34 前端 | `ui-component-library`、`typed-function-ports`（Editor 的需求） |
| 外部入口（Could Have） | `http-endpoint-trigger` |

詞彙以 `openspec/GLOSSARY.md` 為準：Project、Asset、Revision、草稿、可執行（Executable）、Registry Snapshot、樣式規格、語意 token、Domain token、Ui 元件。
