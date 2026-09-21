# Code Workflow Engine POC 計劃書 v0.2

## 1. 專案目標

本 POC 旨在驗證一套以 **TypeScript Code 為核心、Function Composition 為複用模型、DAG 為執行模型** 的 Developer-oriented Workflow Engine。

本 POC 不以完整複製 n8n 為目標，而是聚焦於：

- 視覺化建立執行流程
- TypeScript Code Node
- Function 組合與複用
- Nested Function
- Input / Output Contract
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

Input
  ↓
Code: GetUser
  ↓
Output
```

其他 Function 可以透過 Function Node 使用：

```text
Function: ProcessOrder

Input
  ↓
Function: GetUser
  ↓
Code: ValidateOrder
  ↓
Output
```

---

# 3. Domain Model

基本模型：

```text
Function
├── Input Node
├── Code Node
├── Function Node
└── Output Node
```

Node 分成兩類：

```text
Boundary Node
├── Input Node
└── Output Node

Executable Node
├── Code Node
└── Function Node
```

---

# 4. Function

Function 是：

> 一個具有明確 Input / Output Contract，並由 DAG 組成的可執行、可複用單位。

Function 可以：

- 包含 Code Node
- 包含 Function Node
- 呼叫其他 Function
- 被其他 Function 呼叫
- 定義 Input
- 定義 Output

POC 階段禁止 Recursive Function。

---

# 5. Input Node

Input Node 負責定義 Function Input Contract。

例如：

```text
Input

userId: string
includeOrders: boolean
```

POC 規則：

- 每個 Function 只允許一個 Input Node
- Input Node 不執行 Code
- Input Node 作為 DAG 的資料來源

範例：

```json
{
  "userId": "123",
  "includeOrders": true
}
```

---

# 6. Code Node

Code Node 是最小程式執行單位。

使用 TypeScript：

```ts
export default async function run(ctx) {
  const userId = ctx.input.userId;

  const response = await fetch(
    `https://api.example.com/users/${userId}`
  );

  return await response.json();
}
```

Code Node：

- 接收 Input Mapping
- 執行 TypeScript
- 回傳 JSON-compatible Output
- 可以 Failed
- 可以 Timeout

Code Node 本身不直接 reusable。

---

# 7. Function Node

Function Node 用於引用另外一個 Function。

例如：

```text
Function A

Input
  ↓
Function Node: GetUser
  ↓
Output
```

Function Node 必須包含：

```text
functionId
inputMapping
```

Function Node 只能看到 Child Function：

```text
Input Contract
Output Contract
```

不可直接存取 Child Function 內部 Node。

---

# 8. Output Node

Output Node 負責定義 Function Output Contract。

例如：

```text
Output

user =
nodes.getUser.output.user

orders =
nodes.getOrders.output.orders
```

Output Node：

- 不執行 TypeScript
- 只負責 Mapping
- 每個 Function 僅允許一個 Output Node

---

# 9. Input / Output Contract

POC 採：

```text
One Object In
      ↓
Function
      ↓
One Object Out
```

例如：

```json
{
  "userId": "123"
}
```

Output：

```json
{
  "user": {
    "id": "123",
    "name": "Leo"
  }
}
```

第一版支援型別：

```text
string
number
boolean
object
array
unknown
```

不建議使用 `any` 作為主要 contract type。

---

# 10. Node Input Mapping

Code Node 不直接存取整個 Workflow Context。

推薦：

```text
Previous Node Output
        ↓
Input Mapping
        ↓
Code Node ctx.input
```

例如：

```text
userId =
nodes.input.output.userId
```

Code：

```ts
export default async function run(ctx) {
  return getUser(ctx.input.userId);
}
```

避免：

```ts
ctx.nodes.someNode.output.userId
```

原因是避免 Code Node 與 Workflow DAG 結構直接耦合。

---

# 11. Expression Model

POC 第一版只支援 **Path Reference**。

例如：

```text
nodes.input.output.userId
nodes.getUser.output.user
nodes.getOrders.output.orders
```

暫不支援：

```text
nodes.a.output.price * 1.05
nodes.a.output.user?.name
complex expressions
inline JavaScript
```

也就是：

> POC 不建立 Expression Language。

---

# 12. Node Identity

每個 Node 必須包含：

```text
id
name
```

其中：

- `id`：immutable UUID
- `name`：UI display name

Expression 必須依賴：

```text
node.id
```

而不是 Node Name。

避免 Rename Node 導致 Mapping 失效。

---

# 13. Function Dependency

Function 可以引用 Function：

```text
Function A
  ↓
Function B
  ↓
Function C
```

但禁止：

```text
A → B → A
```

或：

```text
A → B → C → A
```

因此系統實際需要驗證兩種 DAG：

```text
1. Function Internal DAG
2. Function Dependency DAG
```

---

# 14. Function Instance Identity

必須明確區分：

```text
Function Definition ID
Function Node Instance ID
Function Execution ID
```

例如：

```text
GetUser Function
```

可以在同一個 Parent Function 使用兩次：

```text
Input
 ├── GetUser(A)
 └── GetUser(B)
```

兩個 Function Node：

```text
definitionId 相同
nodeId 不同
executionId 不同
```

---

# 15. Function Contract Change

Function B 被 A 引用：

```text
A
↓
B
```

如果 B 原本：

```text
Input:
userId

Output:
user
```

改為：

```text
Input:
accountId

Output:
profile
```

A 將成為 invalid。

POC 至少需要做到：

- 修改 Function Contract 時檢查 caller
- 顯示 breaking change warning
- Parent Function validation fail

---

# 16. Versioning 策略

完整 Function Versioning 暫時 Out of Scope。

但建議 POC 保留：

```text
schemaVersion
definitionHash
```

例如：

```json
{
  "schemaVersion": 1,
  "definitionHash": "..."
}
```

Execution 應保存執行當下的：

```text
functionDefinitionHash
```

方便後續 Debug。

---

# 17. Draft / Published

可考慮增加：

```text
draft
published
```

Function Node 只能引用：

```text
published Function
```

如此避免：

> Parent Function 執行到一半引用到正在編輯中的 Child Function。

若 POC 時程有限，可暫緩實作，但 Domain Model 應保留擴充空間。

---

# 18. Execution Model

Execution 分成：

```text
Function Execution
Node Execution
```

例如：

```text
Function A Execution

Code A
  ↓
Function B
  ↓
Code C
```

其中 Function B 可建立 Child Execution：

```text
Execution A
├── Code A
├── Function B
│   └── Execution B
│       ├── Code B1
│       └── Code B2
└── Code C
```

---

# 19. Execution Status

建議狀態：

```text
pending
running
success
failed
skipped
cancelled
```

不只：

```text
pending
running
success
failed
```

因為 upstream failed 時 downstream 必須能表示：

```text
skipped
```

---

# 20. Error Propagation

POC 建議採最簡單規則：

> 任一必要 Dependency Failed，Downstream Node 全部 Skipped，Function Execution Failed。

例如：

```text
A
├── B ✗
└── C ✓
     ↓
     D
```

若 D 同時依賴 B 與 C：

```text
D = skipped
Function = failed
```

---

# 21. Join Semantics

Node 有多條 Incoming Edge 時：

```text
B ─┐
   ├→ D
C ─┘
```

規則：

> 所有 Incoming Dependency Success 後，D 才能執行。

POC 不支援：

- Conditional Edge
- OR Dependency
- Branch Condition

---

# 22. Parallel Execution

DAG 可以：

```text
       B
      ↗
A
      ↘
       C
```

B、C 可以平行執行。

但不能直接無限制：

```ts
Promise.all(allReadyNodes)
```

需要：

```text
maxConcurrency
```

POC 建議：

```text
maxConcurrency = 4
```

避免同時建立過多 Runner Process。

---

# 23. Execution Cancel

建議 POC 支援：

```text
Cancel Execution
```

取消時：

- Running Runner 終止
- Pending Node → Cancelled
- Function → Cancelled

此功能可以同時驗證 Runner Lifecycle 是否合理。

---

# 24. Timeout

POC 至少支援：

```text
Code Node Timeout
```

例如：

```text
30 seconds
```

未來可增加：

```text
Function Execution Timeout
```

但 POC 可暫不實作。

---

# 25. Code Runtime

推薦：

```text
Node.js Backend
+
Deno Runner
```

Backend 負責：

```text
API
DAG
Execution
Persistence
```

Deno 負責：

```text
User TypeScript Execution
```

---

# 26. Runner Contract

Backend 傳入：

```json
{
  "input": {},
  "code": ""
}
```

Runner 成功：

```json
{
  "success": true,
  "output": {}
}
```

Runner 失敗：

```json
{
  "success": false,
  "error": {
    "name": "Error",
    "message": ""
  }
}
```

Backend 只依賴 Runner Protocol。

未來可將：

```text
Deno Runner
```

替換成：

```text
Docker
gVisor
Firecracker
Remote Runner
```

而不需要修改 Orchestrator。

---

# 27. Code Runtime Permission

POC 預設：

```text
Filesystem   Deny
Environment  Deny
Subprocess   Deny
FFI          Deny
Network      Allow
```

若使用者皆為可信任 Internal Developer，可降低 Sandbox 優先級。

如果 POC 目的包含：

> 執行不可信任第三方 Code

那 Sandbox 必須升級為核心研究項目。

這兩種 POC 目的不可混為一談。

---

# 28. Package Dependency

POC 不支援：

```ts
import axios from "axios";
import lodash from "lodash";
```

第一版只允許：

- Runtime built-in API
- `fetch`
- 基礎 JS / TS API

暫不實作：

- npm install
- Dependency version
- Package cache
- External package sandbox

---

# 29. Secrets

Code 不應直接 hardcode：

```ts
const token = "abc123";
```

POC 可以預留：

```ts
ctx.secrets.get("API_KEY")
```

第一版實作可以先由：

```text
Backend Environment
```

注入。

完整 Credential Manager 不在 POC 範圍。

---

# 30. Output Size Limit

Code Node Output 必須限制大小。

建議：

```text
Max Output Payload:
1 MB ~ 2 MB
```

避免：

- SQLite 過度膨脹
- SSE 傳輸問題
- Browser Memory 問題
- Inspector 卡頓

---

# 31. Log 與 Output 分離

必須區分：

```text
Log
Output
```

例如：

```ts
console.log("fetch user");

return {
  user
};
```

應保存為：

```text
logs:
fetch user

output:
{
  user: ...
}
```

不能把 stdout 同時作為 Function Output。

---

# 32. Persistence

使用：

```text
SQLite
Drizzle ORM
```

Function Definition POC 採 Document Pattern：

```text
functions

id
name
definition_json
schema_version
definition_hash
created_at
updated_at
```

---

# 33. Execution Persistence

## executions

```text
id
function_id

parent_execution_id
parent_node_execution_id

status

input
output
error

definition_hash

started_at
completed_at
```

## node_executions

```text
id
execution_id
node_id

status

input
output
error
logs

child_execution_id

started_at
completed_at
duration_ms
```

---

# 34. Definition Schema

建議：

```ts
interface FunctionDefinition {
  schemaVersion: number;

  id: string;
  name: string;

  nodes: Node[];
  edges: Edge[];
}
```

Node：

```ts
type Node =
  | InputNode
  | CodeNode
  | FunctionNode
  | OutputNode;
```

---

# 35. Frontend 技術

推薦：

```text
React
TypeScript
Vite
```

核心套件：

```text
@xyflow/react
@monaco-editor/react
@tanstack/react-query
zustand
zod
tailwindcss
shadcn/ui
lucide-react
```

---

# 36. Frontend State

Server State：

```text
TanStack Query
```

管理：

- Function List
- Function Detail
- Execution
- Execution History

Client / Editor State：

```text
Zustand
```

管理：

- Nodes
- Edges
- Selected Node
- Inspector State
- Unsaved State

---

# 37. Workflow Editor

React Flow 顯示：

```text
Input
  ↓
Code
  ↓
Function
  ↓
Code
  ↓
Output
```

右側 Inspector 根據 Node Type 顯示不同設定。

---

# 38. Code Editor

Code Node 使用：

```text
Monaco Editor
```

第一版需要：

- TypeScript Syntax Highlight
- Basic Completion
- Formatting
- Error Marker

不需要完整 TypeScript Language Server。

---

# 39. Realtime Execution

如果第一版需要 Execution Live Status，可使用：

```text
Server-Sent Events
```

事件：

```text
execution.started
node.started
node.completed
node.failed
execution.completed
execution.failed
```

若 POC Scope 需要縮小，SSE 可延後。

---

# 40. Backend 技術

推薦：

```text
Node.js
TypeScript
Fastify
Zod
```

Backend 負責：

```text
Function CRUD
Function Validation
DAG Validation
Execution
Runner
Persistence
```

---

# 41. DAG Engine

核心流程：

```text
Load Function
    ↓
Validate
    ↓
Build DAG
    ↓
Topological Sort
    ↓
Ready Nodes
    ↓
Execute
    ↓
Persist
    ↓
Unlock Dependencies
```

使用：

```text
Kahn Algorithm
```

---

# 42. API

## Function

```http
GET    /functions
POST   /functions

GET    /functions/:id
PUT    /functions/:id
DELETE /functions/:id
```

## Execution

```http
POST /functions/:id/execute

GET /executions/:id

POST /executions/:id/cancel
```

若加入 SSE：

```http
GET /executions/:id/events
```

---

# 43. POC Scope

## Must Have

```text
Function CRUD

Input Contract

Code Node

Function Node

Output Contract

DAG

Function Reuse

Nested Function Execution

Input Mapping

Output Mapping

Cycle Detection

Code Execution

Execution Trace

Error Propagation
```

---

# 44. Should Have

```text
React Flow UI

Monaco Editor

Execution Inspector

Node Timeout

Cancel Execution

Parallel Execution

Max Concurrency
```

---

# 45. Could Have

```text
SSE

Draft / Published

Breaking Change Warning

Function Import / Export

Definition Hash
```

---

# 46. Out of Scope

```text
Webhook Trigger

Schedule / Cron

Conditional Edge

Retry

Queue

Distributed Worker

Authentication

RBAC

Multi-tenancy

Full Versioning

Secrets Manager

Credential Manager

npm packages

Binary Data

Files

Human Approval

Pause / Resume

Long-running Workflow

Marketplace
```

---

# 47. POC 核心驗證案例

## Case 1 — Single Code

```text
Input
  ↓
Code
  ↓
Output
```

---

## Case 2 — Linear DAG

```text
Input
  ↓
Code A
  ↓
Code B
  ↓
Output
```

---

## Case 3 — Nested Function

```text
Function A

Input
  ↓
Function B
  ↓
Output
```

---

## Case 4 — Nested Multiple Levels

```text
Function A
  ↓
Function B
  ↓
Function C
```

---

## Case 5 — Parallel

```text
        Code B
       ↗
Input
       ↘
        Code C
```

---

## Case 6 — Join

```text
B ─┐
   ├→ D
C ─┘
```

D 必須等待 B、C。

---

## Case 7 — Node Error

```text
Code B
  ↓
throw Error
```

Downstream：

```text
Skipped
```

Function：

```text
Failed
```

---

## Case 8 — Timeout

```ts
while (true) {}
```

Runner 必須被終止。

---

## Case 9 — DAG Cycle

```text
A → B → A
```

必須拒絕。

---

## Case 10 — Function Dependency Cycle

```text
Function A → Function B
Function B → Function A
```

必須拒絕。

---

# 48. 建議開發階段

## Phase 1 — Domain Model

定義：

```text
FunctionDefinition
Node
Edge
Input Contract
Output Contract
Execution
Node Execution
```

同時定義：

- Immutable Node ID
- Schema Version
- Mapping Path
- Execution Status

---

## Phase 2 — Execution Prototype

先不做完整 UI。

完成：

```text
JSON Function Definition
        ↓
DAG Engine
        ↓
Code Runner
        ↓
Result
```

---

## Phase 3 — Function Composition

完成：

```text
Function A
   ↓
Function B
```

驗證：

- Input Mapping
- Child Execution
- Output Mapping
- Error Propagation

---

## Phase 4 — Persistence

完成：

- SQLite
- Function Definition
- Execution
- Node Execution
- Input / Output / Error

---

## Phase 5 — Editor UI

加入：

```text
React Flow
Monaco
Inspector
```

---

## Phase 6 — Execution UX

加入：

- Execution Inspector
- Node Status
- Timeout
- Cancel
- Optional SSE

---

# 49. POC Success Criteria

最小成功標準：

建立兩個 Function：

```text
Function B

Input
  ↓
Code
  ↓
Output
```

再建立：

```text
Function A

Input
  ↓
Code A
  ↓
Function B
  ↓
Code C
  ↓
Output
```

執行 Function A 後，系統必須正確完成：

```text
Input Validation
        ↓
Code A
        ↓
Function B Input Mapping
        ↓
Nested Execution
        ↓
Function B Output
        ↓
Code C
        ↓
Output Mapping
        ↓
Final Output
```

同時可追蹤：

```text
Function Execution
Node Execution
Input
Output
Error
Status
Duration
```

若上述流程成立，即代表核心架構成立。

---

# 50. 最重要的待驗證假設

POC 不只是驗證技術是否能做出來，而是驗證以下產品假設。

## 假設一

```text
Function 作為唯一 Reusable Unit
```

是否比：

```text
Reusable Node + Workflow
```

更容易理解。

---

## 假設二

```text
Typed Input / Output
```

是否真的能提高 Function Reuse 的可靠性。

---

## 假設三

```text
Nested Function Composition
```

是否比直接 Copy Code Node 更好維護。

---

## 假設四

```text
Developer-first Code Workflow
```

是否有足夠明確的使用價值，而不是單純：

```text
簡化版 n8n
```

---

# 51. 核心架構原則

整個 POC 建議保持以下原則。

### Function 是唯一 reusable unit

```text
Function = Reusable Boundary
```

### Node 是 Function 內部 Instance

```text
Node ≠ Reusable Asset
```

### Code Node 只處理明確 Input

```text
ctx.input
```

不要直接依賴整個 Workflow Context。

### Function 只能透過 Contract 溝通

```text
Input
Output
```

Parent 不應直接讀 Child Function 內部 Node。

### Orchestrator 與 Runner 分離

```text
Orchestrator
≠
Code Runtime
```

### Definition 與 Execution 分離

```text
Definition
= 應該如何執行

Execution
= 這次實際怎麼執行
```

---

# 52. POC 的真正核心

本 POC 最重要的並不是：

```text
React Flow
Deno
SQLite
SSE
```

而是驗證這四個 abstraction 是否成立：

```text
Function
Node
Contract
Execution
```

如果這四者能形成簡單、一致且可預期的模型，後續才值得繼續擴充：

```text
Trigger
Schedule
Secrets
Packages
Versioning
Distributed Execution
Production Sandbox
```

因此 POC 第一優先應驗證：

```text
Function Composition
+
Typed Data Contract
+
Nested Execution
+
Execution Observability
```

而非提早建立完整的 Automation Platform。
