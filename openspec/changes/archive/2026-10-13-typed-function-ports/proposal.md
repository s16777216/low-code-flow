## Why

目前的 POC 將 Function 視為可複用執行單位，但其資料邊界仍依賴單一、結構式的 Input / Output Contract，無法表達具領域意義的型別，也無法可靠限制不同語意但結構相同的資料互相傳遞。引入具名型別、名義式繼承與多個 typed ports，可讓 Function composition 在保有彈性的同時，於設計期及執行期提供一致的相容性保證。

## What Changes

- 新增獨立的 `Type` domain concept；系統提供 `string`、`number`、`date`、`function`、`object`、`boolean`、`array`、`any` 基礎型別，使用者型別必須直接或間接繼承 `any` 以外的其中之一。
- 採 nominal typing：兩個型別即使資料結構相同，也不因此相容；只有相同型別，或來源型別繼承目標型別時，資料才能直接傳遞。
- `any` 是唯一例外：任何型別都可傳入 `any`，`any` 也可傳入任何型別；後者於執行期依目標型別驗證 value。
- Type 除了 identity 與 inheritance 關係，也定義 runtime value validation 所需的資料形狀及限制。
- Function 與 Node 改用多個具名 Input / Output Ports；每個 Port 以 immutable ID 識別並引用一個 Type。
- DAG Edge 改為連接特定 Output Port 與 Input Port，並依兩端 Type 的繼承關係驗證連線是否合法。
- Function Node 對外呈現被引用 Function 的多輸入、多輸出 typed ports，但不暴露 Child Function 的內部 Nodes。
- 執行期間與短暫保留的 in-memory execution trace 保存 value 的 nominal Type identity，使 runtime 與 Inspector 不需依資料結構猜測型別。
- 不提供 structural assignability；無繼承關係的型別若要互相轉換，必須經過明確的建構或轉換操作。
- 第一階段不加入 union type、multiple inheritance 或以 optional output 驅動 conditional routing。
- POC 不保存 durable execution history，也不提供 restart recovery、history query、分頁或 execution analytics；完成的 trace 僅在 bounded in-memory registry 中短暫存在。
- **BREAKING**：原本單一 Object Input / Object Output，以及僅以 Node 為端點的 Edge 定義，將由多個 typed ports 與 port-to-port edges 取代。

## Capabilities

### New Capabilities

- `nominal-type-system`: 定義系統基礎型別、使用者型別、單一繼承、typed runtime values、value validation，以及以繼承關係為唯一依據的 assignability 規則。
- `typed-function-ports`: 定義 Function 與 Node 的多個具名 typed input/output ports、port-to-port edges、Function Node signature projection，以及執行時的 port readiness 與 typed output 行為。

### Modified Capabilities

無；目前尚無既有 OpenSpec capabilities。

## Impact

- Function、Node、Edge、Execution 與 Node Execution 的 domain model 需要納入 Type 與 Port identity。
- Function CRUD、validation、cycle detection、execution API 與 Runner Protocol 需要改用多輸入、多輸出 typed values。
- Workflow Editor 需要顯示可連接的 typed ports，並拒絕不符合 nominal inheritance 的連線。
- Code Editor 與 Runner 需要依 Code Node 的 port definitions 提供輸入並驗證輸出。
- Type 或 Child Function 的修改會立即影響所有引用者（一律使用最新版本，由 `definition-store` 定義）；Execution 開始時在 immutable in-memory snapshot 固定解析結果。
- `date` 與 `function` 無法直接以一般 JSON value 跨 Runner 邊界傳遞，其可序列化表示及 runtime semantics 需在後續 design 中明確定義。
- Execution state、Node trace、logs 與 nested execution tree 僅存於 bounded memory；Backend 或 Project 關閉後不保證保留。
