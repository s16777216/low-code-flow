## Purpose

定義 Function 與 Node 的多輸入、多輸出 typed port 資料流，使 DAG 的每條連線、執行就緒條件及執行紀錄都具有明確且可驗證的資料邊界。

## ADDED Requirements

### Requirement: Multiple named typed ports
Function 與可執行 Node SHALL 支援零個或多個具名 input ports 與 output ports。每個 port MUST 具有 immutable ID、在其所屬 signature 內唯一的名稱，以及包含 Type stable ID 與 definition hash 的 Type reference。

#### Scenario: Define multiple Function inputs and outputs
- **WHEN** 使用者定義具有 `userId`、`orderId` inputs 與 `order`、`receipt` outputs 的 Function
- **THEN** 系統保存四個各自具有 identity 與 Type reference 的 ports

#### Scenario: Reject duplicate port names
- **WHEN** 同一個 Node 或 Function signature 包含兩個同方向且同名的 ports
- **THEN** 系統拒絕該 definition

#### Scenario: Preserve a renamed port connection
- **WHEN** 使用者修改 port display name 但保留其 port ID
- **THEN** 既有 edges 與 execution references 仍指向同一個 port

### Requirement: Function boundary projection
每個 Function SHALL 具有一個 Input boundary 與一個 Output boundary。Function input ports SHALL 投影為 Input boundary 的 output ports；Function output ports SHALL 投影為 Output boundary 的 input ports。Function signature SHALL 是 boundary projection 的唯一 source of truth。

#### Scenario: Project Function inputs into the graph
- **WHEN** Function signature 新增一個 typed input port
- **THEN** 其 Input boundary 顯示對應且具有相同 port ID 與 Type reference 的 output port

#### Scenario: Project Function outputs from the graph
- **WHEN** Function signature 包含一個 typed output port
- **THEN** 其 Output boundary 顯示對應且具有相同 port ID 與 Type reference 的 input port

### Requirement: Port-to-port edges
每條 DAG Edge SHALL 從特定 Node output port 連接到特定 Node input port。系統 MUST 僅在來源 port Type 可 assign 至目標 port Type 時接受 Edge。

**Edge 必須從特定 Output Port 連接到特定 Input Port**，並依據 **nominal assignability** 驗證連線是否合法。
- **範例**：
  ```ts
  interface Edge {
    sourceNodeId: string;
    sourcePortId: string;  // 必須明確指定 Port ID
    targetNodeId: string;
    targetPortId: string;  // 必須明確指定 Port ID
  }
  ```

#### Scenario: Connect compatible ports
- **WHEN** source output Type 是 target input Type 的相同 Type 或 descendant
- **THEN** 系統接受該 Edge

#### Scenario: Connect ports through any
- **WHEN** source output Type 或 target input Type 其中之一是 `any`
- **THEN** 系統接受該 Edge；若 source 是 `any` 而 target 不是，該 Edge 的 value 於執行期依 target Type 驗證

#### Scenario: Reject incompatible ports
- **WHEN** source output Type 與 target input Type 不同、不存在 descendant-to-ancestor 關係，且兩者皆不是 `any`
- **THEN** 系統拒絕該 Edge 並回報兩端 Type 不相容

#### Scenario: Reject an edge without valid ports
- **WHEN** Edge 引用不存在或方向錯誤的 source 或 target port ID
- **THEN** 系統拒絕該 DAG definition

### Requirement: Input connection cardinality and output fan-out
每個 input port MUST 恰有一個 producer，Function invocation 所提供的 boundary inputs 除外。系統 SHALL 允許一個 output port 透過多條 edges 傳遞至多個相容的 input ports。

#### Scenario: Reject multiple producers for one input
- **WHEN** 兩條 edges 指向同一個 input port
- **THEN** 系統拒絕該 DAG definition

#### Scenario: Fan out one output
- **WHEN** 一個 output port 連接至多個型別相容的 downstream input ports
- **THEN** 每個 downstream input port 收到保有相同 nominal Type identity 的 value

#### Scenario: Reject an unconnected required input
- **WHEN** 非 boundary Node 的 input port 沒有 producer
- **THEN** 系統判定該 Function definition 無效

### Requirement: Function Node signature projection
Function Node SHALL 投影被引用 Child Function 的完整 input/output port signature，並保存 Child Function identity 與 definition hash。Parent Function MUST NOT 透過該 Function Node 存取 Child Function 的內部 Nodes 或 ports。

#### Scenario: Use a multi-port Child Function
- **WHEN** Child Function 具有兩個 inputs 與三個 outputs
- **THEN** Parent 中的 Function Node 對外提供對應的兩個 input ports 與三個 output ports

#### Scenario: Detect a changed Child Function signature
- **WHEN** Child Function signature hash 與 Function Node 保存的 definition hash 不同
- **THEN** Parent Function 被標示為需要重新驗證，且不得在未驗證狀態開始新 execution

#### Scenario: Hide Child Function internals
- **WHEN** Parent Function 使用 Child Function 的 Function Node
- **THEN** Parent 只能引用該 Function Node 的公開 ports

### Requirement: Node readiness by input ports
Node SHALL 僅在所有 input ports 都收到成功產生且通過 Type validation 的 values 後進入 running。若任一必要 producer failed 或 cancelled，尚未執行的 dependent Node MUST 進入 skipped 或 cancelled，而不得以部分 inputs 執行。

**下游 Node 執行條件**：
- 所有 `required` Input 必須 `settled`（不再 `pending`）。
- 所有 `required` Input 必須都是 `emitted`（不能有 `not_emitted`）。
- 如果任一 `required` Input 是 `not_emitted` → **SKIP** 此 Node。
- 如果任一 `required` Input 仍是 `pending` → **WAIT**。

#### Scenario: Wait for all inputs
- **WHEN** Node 的一個 input 已就緒而另一個 input 尚在執行
- **THEN** 該 Node 保持 pending

#### Scenario: Run after all inputs arrive
- **WHEN** Node 的所有 input ports 都收到有效 Typed Values
- **THEN** 該 Node 可以進入 running

#### Scenario: Skip after an upstream failure
- **WHEN** 任一 input port 的 producer failed
- **THEN** dependent Node 進入 skipped，且 Function Execution 最終為 failed

### Requirement: Atomic required outputs
成功完成的 Node SHALL 為每個 declared output port 產生且僅產生一個通過 validation 的 value。所有 declared outputs 構成單次原子完成結果；缺少、未知或無效的 output MUST 使 Node failed，且不得發布部分 outputs。

**Output 狀態必須明確區分 `emitted`/`not_emitted`**，並遵循以下規則：
- **`emitted`**：Output 有正式回傳（包括 `null`、`""`、`[]`、`{}`、`0`、`false` 等）。
- **`not_emitted`**：Output 在此次執行中未產生。

**禁止使用 `truthy`/`falsy` 判斷**：
```ts
// 錯誤：
if (output.value) { ... }

// 正確：
if (output.status === "emitted") { ... }
```

**Output 必須在 Node `execute()` 完成後一次性發布**，不得在執行期間對外公開。
- **範例**：
  ```text
  RUNNING → 不 publish output
  COMPLETED → 一次 return 全部 outputs → runtime publish
  ```

#### Scenario: Publish all valid outputs
- **WHEN** Node 為每個 declared output port 回傳有效 value
- **THEN** 系統原子發布所有 typed outputs 並將 Node 標示為 success

#### Scenario: Fail on a missing output
- **WHEN** Node 未回傳其中一個 declared output
- **THEN** 系統將 Node 標示為 failed，且不發布其他 outputs

#### Scenario: Fail on an invalid output type
- **WHEN** Node output value 不符合該 port 的 declared Type
- **THEN** 系統將 Node 標示為 failed 並記錄 port-specific validation error

#### Scenario: Reject an undeclared output
- **WHEN** Node 回傳不存在於其 signature 的 output name 或 port ID
- **THEN** 系統將 Node 標示為 failed

### Requirement: Multi-port Code Node execution
Code Node SHALL 以 port name 提供所有 validated input values，並要求 code 以 port name 回傳 declared outputs。Code 執行環境 MUST NOT 允許使用者偽造 output 的 nominal Type identity；Backend SHALL 在驗證成功後依 port Type 建立 Typed Values。

#### Scenario: Execute code with multiple inputs
- **WHEN** Code Node 的所有 typed inputs 已就緒
- **THEN** code 可透過各 input port name 取得對應 raw value

#### Scenario: Return multiple code outputs
- **WHEN** code 回傳以所有 declared output port names 為 keys 的 values
- **THEN** Backend 逐一驗證並以各 port declared Type 標記 outputs

#### Scenario: Prevent type identity forgery
- **WHEN** code 在 raw output 中放入自行宣告的 Type ID
- **THEN** 系統忽略該宣告或拒絕輸出，並只信任 Node definition 中的 port Type

### Requirement: Multi-port nested execution
Function Node SHALL 將其 input port values 傳入單一 Child Function Execution，並在 Child 成功後將其全部 output ports 原子發布至 Parent Execution。Child failure MUST 使 Function Node failed。

#### Scenario: Complete a nested multi-port call
- **WHEN** Function Node 的所有 inputs 有效且 Child Function 成功產生全部 outputs
- **THEN** Function Node 發布對應 typed outputs，並保存 Child Execution reference

#### Scenario: Propagate a Child failure
- **WHEN** Child Function 任一必要 output 無效或 Child Execution failed
- **THEN** Function Node failed，且 Parent downstream Nodes 依 error propagation 規則 skipped

### Requirement: Ephemeral typed port execution trace
Function Execution 與 Node Execution SHALL 在執行期間及 bounded in-memory retention 期間，以 immutable port IDs 保留各 input/output Typed Values、Type definition hashes、validation errors、時間資訊與執行當時的 port display names。系統 MUST NOT 要求 durable execution history，且 Backend 或 Project 關閉後不保證 trace 仍可取得。

#### Scenario: Inspect a multi-port execution
- **WHEN** 使用者在 trace 尚未自 in-memory registry 清除前查看已完成的 Node Execution
- **THEN** 系統顯示每個 input/output port 的當時名稱、immutable ID、Type identity、definition hash 與 value

#### Scenario: Preserve an in-memory trace after rename
- **WHEN** Execution 完成後 port 被重新命名，且該 trace 仍在 in-memory registry 中
- **THEN** 系統依 immutable port ID 與執行時的 display-name snapshot 呈現該次資料

#### Scenario: Evict an ephemeral trace
- **WHEN** trace 超過 retention TTL、registry 容量上限，或 Backend／Project 關閉
- **THEN** 後續查詢回報該 Execution 不存在，且系統不嘗試從 persistent storage 恢復

### Requirement: Port-aware DAG validation
Function validation SHALL 同時驗證 Node graph 無 cycle、所有 required ports 已連接、edge endpoints 存在、每個 input connection cardinality 合法，以及每條 Edge 的 nominal Type assignability。任一驗證失敗時 Function MUST NOT 開始 execution。

#### Scenario: Reject a cyclic port graph
- **WHEN** port-to-port edges 形成 Node dependency cycle
- **THEN** 系統拒絕該 Function definition

#### Scenario: Block execution of an invalid graph
- **WHEN** Function 存在未連接 input 或 incompatible Edge
- **THEN** execute request 在建立 running execution 前失敗並回報 validation errors
