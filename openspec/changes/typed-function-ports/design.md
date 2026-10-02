## Context

本專案目前只有 POC 計畫，尚無 production implementation 或需要相容的持久化資料。既有概念以單一 Object Input / Output、Node-level Edge 與 JSON-compatible Runner protocol 為主；本設計將其替換為 nominal Type 與多個 typed ports。動機與範圍見 `proposal.md`，可觀察行為見 `specs/nominal-type-system/spec.md` 與 `specs/typed-function-ports/spec.md`。

主要約束：

- Type identity 必須跨 Backend、Runner 與 bounded in-memory execution trace 保留。
- 使用者 Code 在隔離 Runner 執行，但 Type authority 由 Backend definition 持有。
- Node 與 Function 可以有多個輸入與輸出，DAG dependency 必須能由 edges 唯一推導。
- POC 不引入 union、multiple inheritance、optional ports 或 conditional output routing。
- POC 不保存 durable execution history，也不在 process restart 後恢復 Execution。
- Type 與 Function definitions 的 file-driven Project source 及 project-local asset resolution 由獨立的 `file-driven-projects` change 定義；本設計只依賴一個可提供 resolved definitions 的 Project Asset Registry boundary。

## Goals / Non-Goals

**Goals:**

- 建立可計算且能跨 runtime boundary 表示的 nominal single-inheritance Type model。
- 讓 Function、Code Node 與 Function Node 使用一致的 multi-port execution contract。
- 使 graph validation、scheduling、nested execution 與 observability 都以 immutable port identity 運作。
- 保持 Runner protocol 可序列化，並防止使用者 Code 偽造 Type identity。
- 讓 Type 或 Function signature 變更可以識別受影響的 definitions。
- 以 bounded in-memory registry 支援 running 與短暫 completed Execution 的 Inspector 與取消操作。

**Non-Goals:**

- TypeScript 完整型別系統、structural typing、union、intersection、generics 或 multiple inheritance。
- Optional input/output ports、conditional routing、overload 或以 output presence 控制流程。
- 傳遞 JavaScript closure、任意 executable source 或 process-local object identity。
- 自動把無關 Type 轉換成目標 Type；轉換必須是明確的 workflow operation。
- 完整 published revision UI；POC 只保留 stable identity、hash 與重新驗證機制。
- Durable execution history、history query、分頁、analytics、restart recovery 或 crash reconciliation。
- Project manifest、Asset file format、filesystem watching、atomic file saving、跨專案引用或 package resolution；這些屬於獨立的 Project capability。

## Decisions

### 1. Type 使用 stable ID、single parent 與 definition hash

Type definition 的核心形狀：

```ts
interface TypeDefinition {
  id: string;
  name: string;
  parentTypeId: string | null;
  rootKind: "string" | "number" | "date" | "function" |
            "object" | "boolean" | "array" | "any";
  definition: TypeConstraintDefinition;
  definitionHash: string;
}

interface TypeRef {
  typeId: string;
  definitionHash: string;
}
```

System base Types 固定且不可修改；使用者 Type 只能有一個 parent。`rootKind` 由 ancestry 計算並在儲存時正規化，不能由 client 任意改變。Definition hash 由 canonicalized Type definition 計算。

選擇 single inheritance 是因為 assignability 等價於 ancestor walk，容易驗證、快取與解釋。Multiple inheritance 會引入 property conflict 與線性化規則，超出 POC。

替代方案是 structural schema compatibility；它會讓相同 shape 的 `UserId` 與 `OrderId` 可互傳，違反本 change 的 domain identity 目標。

### 2. Schema validation 與 nominal assignability 分離

每次傳遞分成兩個獨立判斷：

```text
value conforms to declared source Type
                     +
source Type == target Type OR source extends target
  OR source == any OR target == any
                     ↓
                  accepted
```

`any` 是唯一跳過 nominal 規則的系統型別，不參與繼承：使用者 Type 不得以 `any` 為 parent，`any` 也不是其他基礎型別的 ancestor，因此 `rootKind` 為 `any` 的只有 `system:any` 本身。

- **傳入 `any`**：設計期一律接受；value 保留原本的 Type identity，不改標為 `any`。
- **從 `any` 傳出**：設計期接受；執行期由 Backend 在交付給目標 port 前，依目標 Type 的完整 ancestor chain 驗證 value。驗證通過後改標為目標 Type；失敗則接收的 Node 失敗，並回報該 input port 的 validation error，downstream 依一般失敗規則處理。
- **外部輸入至 `any` port**：接受任何可序列化的 transport value，Type identity 為 `any`。

選擇雙向相容是為了讓通用 Function（logging、pass-through、動態資料處理）可以接受並回傳任意資料，而不必為每個型別各寫一份。代價是從 `any` 流出的連線失去設計期保證，錯誤延後到執行期才發現；Editor 應在此類 Edge 上標示需要執行期驗證。替代方案是只允許傳入 `any`（類似 TypeScript `unknown`），傳出必須經由 Code Node 明確轉換；這保留完整的設計期保證，但會讓通用 Function 的輸出難以直接使用。

Schema validator 展開完整 ancestor chain。Object child 只能新增 properties 或收窄限制，不允許移除或不相容 override；primitive child 可增加 constraints；array child 必須宣告 element Type。Array 間不依 element Type 自動產生繼承，只有顯式 Type ancestry 能建立 assignability。

這避免把 runtime value validation 與 graph connection compatibility 混為同一套 structural comparison。

### 3. Runtime envelope 僅存在於 orchestration boundary

Backend in-memory orchestration state 使用：

```ts
interface TypedValue {
  typeId: string;
  typeDefinitionHash: string;
  value: JsonTransportValue;
}
```

Runner 執行使用者 Code 時，`ctx.inputs.<portName>` 提供 raw decoded value；Code 回傳 `{ [outputPortName]: rawValue }`。Backend 依 Node definition 驗證 raw outputs，成功後才建立 TypedValue。Runner 回傳的任何 Type ID 都不具 authority。

這讓使用者 Code 保持簡單，也確保 Type identity 只能來自已驗證的 definitions。TypedValue 可出現在 Runner transport 與 in-memory execution trace，但不要求寫入 durable storage。替代方案是直接讓 Code 操作 typed envelopes，但會污染業務程式碼並允許偽造 identity。

### 4. Date 與 Function 採 tagged transport representation

JSON transport 對特殊 root kinds 使用 canonical tagged payload：

```ts
type DateTransport = {
  $kind: "date";
  iso: string;
};

type FunctionTransport = {
  $kind: "function-ref";
  functionId: string;
  definitionHash: string;
};
```

`date` 必須是含時區的 canonical ISO 8601 instant。`function` 表示 Function definition reference，不表示 JavaScript callable 或 closure；實際呼叫仍由 Function Node／orchestrator 完成。

這是維持 JSON protocol、runtime snapshot 與安全邊界的必要限制。若未來需要高階 Function composition，可以讓 Function Node 接受 function reference，但不將 executable closure 當資料傳輸。

### 5. Function signature 是 boundary ports 的 source of truth

```ts
interface PortDefinition {
  id: string;
  name: string;
  type: TypeRef;
}

interface FunctionSignature {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}
```

Input boundary 的 outputs 與 Output boundary 的 inputs 都是 signature projection，不另外保存可分歧的 copies。Port name 在各自方向與 owner 範圍內唯一；ID 永久穩定，rename 不改 Edge。

所有 ports 在 POC 都是 required。這避免 absence 同時表示「尚未完成」、「沒有值」或「條件分支未選取」。需要表達 nullable data 時應使用允許 null 的 Type，而不是 optional port。

### 6. Edge 精確連接 ports

```ts
interface Edge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}
```

一個 input port 最多一個 incoming Edge；一個 output port 可 fan-out。多來源合併必須由具有多個 input ports 的顯式 Node 完成。如此 dependency graph 可直接由 Edge 推導，不需要另外的 mapping reference 形成第二套 dependency source。

替代方案是允許多條 Edge 指向同一 input 並隱式 concat/zip；不同 Type 與 cardinality 下沒有一致語意，因此排除。

### 7. Node output 採原子發布

Node 必須等所有 inputs ready 才開始。Runner 完成後，Backend 先驗證全部 declared outputs；只有全部成功才在單一狀態轉換中發布 outputs 並將 Node 標為 success。任何缺少、額外或 invalid output 都使 Node failed，不留下可供 downstream 消費的部分結果。

這保留簡單的 DAG scheduler：downstream 只需要判斷 producer success，不需處理半完成 output set。Conditional output routing 留待未來以獨立 control-flow concept 設計。

### 8. Function Node 固定 Child definition 與 Type revisions

Function Node 保存 Child Function ID、definition hash，以及 projected signature 的 port IDs/TypeRefs。Parent validation 比對目前 Child hash；不同時 Parent invalid，直到使用者接受新 signature 並重新驗證。

Execution start 時從 Project Asset Registry 解析完整 Function dependency closure，並在 immutable in-memory snapshot 中固定所有 Function 與 Type definition hashes。後續 definition 變更不影響已開始的 Execution。Nested call 每個 Function Node 建立一個 Child Execution，傳入整組 ports 一次，而不是為每個 value 建立多個 executions。

### 9. 以 port ID 保留 bounded in-memory execution trace

RuntimeProjectContext 維護以 Execution ID keyed 的 in-memory registry。每個 Function／Node Execution 將 inputs/outputs 視為以 port ID keyed 的 typed records；同時 snapshot 當時的 display name 供 Inspector 顯示。Node Execution 保留 child execution ID、validation error 所屬 port ID，以及 definition hashes。

Registry 同時包含 running 與短暫 completed／failed／cancelled executions，並以 configurable TTL、最大 execution 數量及每個 Node 的 log/output size limit 控制記憶體。超過限制的 terminal executions 按完成時間淘汰；running executions 不因 TTL 或容量限制被淘汰。Backend 或 Project 關閉時 registry 消失，不進行 durable restore。

使用 immutable ID 可讓 rename 不破壞仍在 registry 中的 trace；保存 display snapshot 可避免 Inspector 錯用目前名稱。替代方案是使用 SQLite 保存 history，但會引入 schema migration、retention、query 與 recovery 工作，並非此 POC 要驗證的核心。

### 10. Type conversion 是顯式 operation

直接 Edge 只執行 nominal assignability。若要從無關來源 Type 產生目標 Type，workflow 必須經過明確宣告 output Type 的 Code/Construct Node。該 Node 的每個 input 仍依 nominal rules 連接，output 則在 Backend 完整驗證後取得新的 nominal identity。

第一版可由 Code Node 承擔 conversion；專用 Construct Node 是後續 editor usability enhancement，不是 engine correctness 的前置條件。

### 11. Definition storage 經由 Project Asset Registry boundary

Type、Function 與 Code definitions 的 durable source 不由本 change 決定。本 change 只依賴 Project Context 提供下列能力：以 stable asset ID 取得 definition、列出 dependency、取得 canonical definition hash，以及在 definitions 改變時觸發重新驗證。

已確認的產品方向是 file-driven Project、project-local references、無跨專案引用；其 manifest、目錄結構、Asset format、loading、saving 與 watcher semantics 必須由獨立的 `file-driven-projects` capability 規範。這可以避免 typed-port engine 同時擁有 filesystem 與 database storage assumptions。

## Risks / Trade-offs

- **[Type definitions 產生較高建模成本]** → 內建常用 base Types、提供從 parent 複製/新增 constraints 的 editor，並讓錯誤訊息指出不相容 ancestry。
- **[Type 修改造成大量 Function invalidation]** → 使用 dependency index 與 hash 精確列出受影響 Functions，更新必須顯式接受而非靜默漂移。
- **[Port 數量增加使 graph 視覺複雜]** → UI 預設收合未連接 ports，並以 Type name、方向與 compatibility highlighting 輔助連線。
- **[`function` 名稱容易被誤解為 JavaScript closure]** → UI 與文件明確顯示為 Function Reference，Runner 拒絕 callable/closure transport。
- **[原子 outputs 限制 error/success 分支用例]** → POC 使用 failed execution 與 trace 表達錯誤；conditional routing 留待獨立設計，避免隱含控制流。
- **[Definition hash pinning 增加更新流程]** → 提供 revalidate/accept 操作批次更新 references，但執行時永遠使用固定 closure。
- **[Nominal typing 需要顯式 conversion]** → 以 Code Node 先支援完整能力，再依實際使用摩擦決定是否加入 Construct Node。
- **[Process crash 或 restart 會遺失所有 Execution trace]** → POC 明確不提供 recovery；UI 在連線中斷後將 Execution 視為不存在，並提示重新執行。
- **[Logs 與 outputs 可能耗盡 Backend memory]** → 同時限制單一 Node payload、單一 Execution trace、completed execution 數量與 retention TTL。
- **[Completed trace 可能在使用者檢視時被淘汰]** → UI 顯示 ephemeral retention 語意；正在檢視不構成永久保存保證。
- **[Project Asset Registry 尚未規格化]** → 在套用此 change 前先建立並完成 `file-driven-projects` planning artifacts，讓 definition provider contract 有明確來源。

## Migration Plan

目前無 production definitions 或 Execution database，因此不需要 database migration。實作前先完成獨立的 `file-driven-projects` design，使 Project Asset Registry boundary 可用；之後依序建立 Type model、multi-port definitions、Runner protocol、in-memory execution registry 與 editor ports。在 multi-port model 完整可執行前不保留舊單一 Object contract 的相容模式。

Editor UI（port Type 標示、相容性 highlighting、`any` Edge 標記、Inspector 等）依賴 `add-ui-package` change：先完成該 change，再以其 Ui 元件、樣式規格與 domain tokens（如 `type-*` 色彩）實作，而不是在 `frontend` 內另寫樣式。

若開發期間已有舊格式 fixtures，可提供一次性的 fixture converter：將舊 Input Object 與 Output Object 分別建立單一 `input`／`output` ports，並把 Node-level edges 轉成相應 port edges；無法推導 Type 的 fixture 必須人工指定。Rollback 以回復 definitions 與 runtime code 至 change 前版本進行，所有 ephemeral executions 可直接捨棄。
