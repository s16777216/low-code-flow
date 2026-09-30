## Purpose

提供可重用且具領域身份的型別系統，使工作流程只能沿明確的名義式繼承關係傳遞資料，並能在設計期與執行期驗證資料的型別及內容。

## ADDED Requirements

### Requirement: System base types
系統 SHALL 提供 immutable 的 `string`、`number`、`date`、`function`、`object`、`boolean`、`array` 與 `any` 基礎型別。每個使用者定義型別 MUST 直接或間接繼承 `any` 以外的一個系統基礎型別；`any` MUST NOT 作為任何 Type 的 parent。

#### Scenario: Create a type from a base type
- **WHEN** 使用者建立 `UserId` 並指定其 parent 為 `string`
- **THEN** 系統接受該定義，並將 `UserId` 的 root type 識別為 `string`

#### Scenario: Reject a type without a base ancestry
- **WHEN** 使用者建立一個無 parent 且不是系統基礎型別的 Type
- **THEN** 系統拒絕該 Type definition

#### Scenario: Reject a type inheriting any
- **WHEN** 使用者建立 `Payload` 並指定其 parent 為 `any`
- **THEN** 系統拒絕該 Type definition

#### Scenario: Prevent changes to system base types
- **WHEN** 使用者嘗試修改或刪除系統基礎型別
- **THEN** 系統拒絕該操作

### Requirement: Single acyclic inheritance
每個使用者定義型別 SHALL 具有且僅具有一個 direct parent。Type inheritance graph MUST 保持 acyclic。

#### Scenario: Extend a custom type
- **WHEN** `User` 繼承 `Entity`，且 `Entity` 最終繼承 `object`
- **THEN** 系統接受該繼承關係

#### Scenario: Reject multiple parents
- **WHEN** 一個 Type definition 同時指定兩個 direct parents
- **THEN** 系統拒絕該定義

#### Scenario: Reject an inheritance cycle
- **WHEN** 更新 Type parent 會形成 `A → B → C → A`
- **THEN** 系統拒絕該更新

### Requirement: Nominal assignability
系統 SHALL 僅在來源 Type 與目標 Type 相同，或來源 Type 是目標 Type 的 descendant 時，允許 Typed Value 直接傳遞。系統 MUST NOT 以資料結構相同作為 assignability 依據。

`any` 是唯一例外：來源或目標任一方為 `any` 時，系統 SHALL 判定可傳遞。傳入 `any` 的 value SHALL 保留原本的 Type identity。從 `any` 傳至其他 Type 時，系統 MUST 在執行期依目標 Type 驗證 value，通過後才標記為目標 Type；驗證失敗時接收的 Node MUST 失敗並回報該 input port 的 validation error。

**Schema 兼容性必須依據 nominal assignability 驗證**：
- **合法**：
  ```text
  CurrentUser Output → BaseUser Input  // 合法（子類型 → 父類型）
  ```
- **不合法**：
  ```text
  BaseUser Output → CurrentUser Input  // 不合法（父類型 → 子類型）
  ```

#### Scenario: Pass a subtype to a parent type
- **WHEN** `AdminUser` 繼承 `User`，且來源 Type 是 `AdminUser`、目標 Type 是 `User`
- **THEN** 系統判定來源可傳遞至目標

#### Scenario: Reject a parent value for a subtype target
- **WHEN** `AdminUser` 繼承 `User`，且來源 Type 是 `User`、目標 Type 是 `AdminUser`
- **THEN** 系統判定來源不可傳遞至目標

#### Scenario: Reject structurally identical unrelated types
- **WHEN** `UserId` 與 `OrderId` 都繼承 `string`，但彼此沒有繼承關係
- **THEN** 系統拒絕 `UserId` 與 `OrderId` 之間的直接傳遞

#### Scenario: Pass any type into any
- **WHEN** 來源 Type 是 `UserId`、目標 Type 是 `any`
- **THEN** 系統判定來源可傳遞至目標，且 value 保留 `UserId` Type identity

#### Scenario: Pass any into a specific type
- **WHEN** 來源 Type 是 `any`、目標 Type 是 `UserId`
- **THEN** 系統於設計期判定來源可傳遞至目標，並於執行期依 `UserId` 驗證 value

#### Scenario: Accept a valid value leaving any
- **WHEN** 執行期從 `any` port 傳至 `UserId` input port 的 value 符合 `UserId` 所有限制
- **THEN** 接收的 Node 取得 Type identity 為 `UserId` 的 value

#### Scenario: Reject an invalid value leaving any
- **WHEN** 執行期從 `any` port 傳至 `UserId` input port 的 value 是 number
- **THEN** 接收的 Node 失敗，並回報該 input port 的 validation error

### Requirement: Type definition constraints
Type definition SHALL 依其 root type 定義可驗證的資料限制。Object subtype MAY 新增 properties，但 MUST NOT 移除、放寬或以不相容 Type 覆寫 inherited properties。Array subtype SHALL 定義 element Type。Primitive subtype MAY 增加不違反 parent 的收窄限制。

#### Scenario: Add an object property in a subtype
- **WHEN** `User` 繼承具有 `id` property 的 `Entity`，並新增 `name` property
- **THEN** 系統接受該 Type definition，且 `User` value 必須同時符合 inherited 與新增 properties

#### Scenario: Reject removal of an inherited property
- **WHEN** Object subtype 嘗試移除 parent 的 required property
- **THEN** 系統拒絕該 Type definition

#### Scenario: Define an array element type
- **WHEN** 使用者建立繼承 `array` 的 `UserList`
- **THEN** 系統要求該 Type definition 指定 element Type

#### Scenario: Narrow a primitive value
- **WHEN** `PositiveNumber` 繼承 `number` 並設定大於零的限制
- **THEN** 系統接受該限制並於 value validation 時套用

### Requirement: Typed runtime values
任何跨 Node port 或 Function boundary 傳遞的資料 SHALL 同時具有 Type identity 與 value。系統 MUST 依該 Type definition 及其完整 inheritance chain 驗證 value，而不得從 value 結構推測 nominal Type。

**`null`、`""`、`[]`、`{}`、`0`、`false` 都是合法的 `emitted` 值**，不能與 `not_emitted` 混淆。

**範例**：
```ts
// 合法：
emit(null)    // emitted
emit("")      // emitted
emit([])      // emitted

// 不合法：
if (output.value) { ... } // 錯誤：無法區分 emitted(null) 與 not_emitted
```

#### Scenario: Preserve type identity for equal primitive values
- **WHEN** `UserId` 與 `OrderId` 的 value 都是字串 `123`
- **THEN** execution data 仍可分辨兩者的 Type identity

#### Scenario: Reject a value that violates its declared type
- **WHEN** Typed Value 宣告為繼承 `string` 的 `UserId`，但 value 是 number
- **THEN** 系統拒絕該 Typed Value

#### Scenario: Validate inherited constraints
- **WHEN** `AdminUser` value 缺少 `User` parent 所要求的 property
- **THEN** 系統判定該 value validation 失敗

### Requirement: External input typing
Function invocation boundary SHALL 依每個 input port 的 declared Type 驗證外部 raw value，並只在驗證成功後將其標記為該 nominal Type。

#### Scenario: Accept valid raw invocation input
- **WHEN** 外部呼叫為 `UserId` input port 提供符合其限制的 string
- **THEN** 系統建立 Type 為 `UserId` 的 runtime value

#### Scenario: Reject invalid raw invocation input
- **WHEN** 外部呼叫提供不符合 input port declared Type 的 raw value
- **THEN** Function execution 不開始，並回報對應 input port 的 validation error

### Requirement: Explicit type construction and conversion
沒有 assignability 關係的 Types MUST NOT 直接傳遞。系統 SHALL 要求透過明確宣告目標 Type 的建構或轉換操作產生新的 Typed Value，且 MUST 在產生時驗證目標 Type。

#### Scenario: Construct a target object type
- **WHEN** mapping 從多個來源 values 建構 `CreateOrderInput`
- **THEN** 系統只在所有 required properties 均存在且符合 declared Types 時產生 `CreateOrderInput` value

#### Scenario: Reject implicit conversion between sibling types
- **WHEN** `UserId` 與 `OrderId` 都繼承 `string`，且沒有顯式轉換操作
- **THEN** 系統拒絕將 `UserId` value 當作 `OrderId` value

### Requirement: Serializable date and function values
`date` 與 `function` Typed Values SHALL 具有可跨 Runner protocol 傳輸並在 in-memory execution trace 中表示的 canonical representation。`function` SHALL 表示穩定的 Function definition reference，而 MUST NOT 表示 JavaScript closure 或任意 executable source value。

#### Scenario: Encode and decode a date value
- **WHEN** Node output 產生 `date` value
- **THEN** 系統以保留時區語意的 canonical ISO 8601 representation 跨 Runner boundary 傳輸並還原該 value

#### Scenario: Transport a function reference
- **WHEN** Node output 產生 `function` value
- **THEN** 系統傳輸可識別 Function definition 與其 definition hash 的 reference

#### Scenario: Reject a JavaScript closure as data
- **WHEN** Node 嘗試將 JavaScript closure 作為 `function` output value
- **THEN** 系統拒絕該 output

### Requirement: Stable Type references
Function definitions SHALL 記錄所引用 Type 的 stable ID 與 definition hash。Execution 開始時，系統 SHALL 在 immutable in-memory snapshot 中固定本次執行使用的 Type IDs 與 definition hashes。Type definition 改變後，系統 MUST 將尚未接受新 hash 的相依 Function 標示為需要重新驗證，不得靜默改變其既有 contract 或已開始的 Execution。

#### Scenario: Detect a changed referenced type
- **WHEN** Function port 引用的 Type definition hash 已改變
- **THEN** 系統將該 Function 標示為需要以新 Type definition 重新驗證

#### Scenario: Isolate a running execution from type changes
- **WHEN** Type 在 Execution 開始後被更新
- **THEN** 該 Execution 在其 in-memory lifecycle 期間繼續使用開始時固定的 Type IDs 與 definition hashes
