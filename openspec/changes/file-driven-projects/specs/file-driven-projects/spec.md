## Purpose

定義以檔案為 source of truth 的單一 Project 工作空間，使開發者能以 Git、IDE 與視覺化編輯器共同管理 Type、Function、Code 與設定，而不依賴 definition database。

## ADDED Requirements

### Requirement: Project manifest discovery
Project root SHALL 包含唯一的 `flow.project.yaml` manifest。系統 SHALL 以該 manifest 的所在目錄作為 Project root，並驗證 stable Project ID、display name、schema version 與 engine compatibility。

#### Scenario: Open a valid Project
- **WHEN** 使用者選擇包含有效 `flow.project.yaml` 的目錄
- **THEN** 系統以 manifest identity 開啟該 Project，且不以目錄名稱推測 Project identity

#### Scenario: Reject a directory without a manifest
- **WHEN** 使用者嘗試開啟不包含 `flow.project.yaml` 的目錄
- **THEN** 系統拒絕開啟並回報 missing Project manifest

#### Scenario: Reject an incompatible manifest
- **WHEN** manifest schema 或要求的 engine version 不受目前 engine 支援
- **THEN** 系統拒絕建立 Project Context 並回報 compatibility error

### Requirement: Conventional authored directories
POC Project SHALL 使用 Project root 下唯一的 `Assets/` 作為 authored asset root，並 MAY 使用 `ProjectSettings/` 與 `Tests/` 保存可版本控制的設定及測試資料。系統 MUST NOT 將生成內容或 runtime execution state 視為 authored assets。

#### Scenario: Discover authored content
- **WHEN** Project 在 `Assets/` 中包含 Type、Function 與其 Code files
- **THEN** 系統將這些檔案視為 Project authored source

#### Scenario: Ignore generated content as assets
- **WHEN** Project 包含 editor temporary files、generated indexes 或 runtime state
- **THEN** 系統不將這些內容註冊為 authored assets

#### Scenario: Reject an asset outside the authored root
- **WHEN** definition reference 經路徑解析後位於 Project root 或 `Assets/` 之外
- **THEN** 系統拒絕該 reference 並回報 path containment error

### Requirement: Files are the definition source of truth
Type、Function 與 Function-owned Code definitions SHALL 由 Project files 決定。系統 MUST NOT 要求 definition database，且任何可重建的 in-memory index 或 cache MUST NOT 成為 authority。

#### Scenario: Rebuild from Project files
- **WHEN** Project 在沒有既有 index、cache 或 database 的狀態下開啟
- **THEN** 系統僅依 manifest 與 authored files 重建完整 Project definition view

#### Scenario: Reflect an authored file change
- **WHEN** 有效的 authored definition file 被修改
- **THEN** 重新載入後的 Project definition view 反映檔案內容，而不是較舊的 cache content

### Requirement: One active Project context
POC Backend SHALL 同時只維護一個 active Project Context。開啟另一個 Project 前，系統 MUST 關閉目前 Project、通知 runtime consumers 釋放 project-scoped state，並移除目前 Asset Registry。

#### Scenario: Switch Projects
- **WHEN** 已有 Project 開啟且使用者選擇另一個有效 Project
- **THEN** 系統先關閉目前 Project，再建立只屬於新 Project 的 Context 與 Asset Registry

#### Scenario: Resolve without an active Project
- **WHEN** 沒有 active Project 時 client 要求存取 Type 或 Function asset
- **THEN** 系統拒絕該要求並回報 no active Project

### Requirement: Project-local reference scope
所有非 system asset references SHALL 只在目前 Project 的 Asset Registry 中解析。POC MUST NOT 搜尋其他 Project、package、shared library 或 remote registry。

#### Scenario: Resolve a local reference
- **WHEN** Function 引用目前 Project 中存在且唯一的 Type asset ID
- **THEN** 系統解析為該 Project asset

#### Scenario: Reject a missing local reference
- **WHEN** reference ID 不存在於目前 Project 且不是 engine-owned system ID
- **THEN** 系統將該 reference 標示為 broken，而不搜尋其他位置

#### Scenario: Reject a project-qualified reference
- **WHEN** asset definition 嘗試指定其他 Project identity 或 package identity
- **THEN** 系統拒絕該 definition

### Requirement: Project lifecycle and degraded state
Project lifecycle SHALL 至少區分 `closed`、`loading`、`indexing`、`validating`、`ready` 與 `degraded`。Manifest 無效時 Project MUST NOT 開啟；個別 asset 無效時 Project SHALL 進入 `degraded`，允許檢視及修復，但 MUST 阻止受影響 Function 執行。

#### Scenario: Reach ready state
- **WHEN** manifest、所有 discovered assets 與 references 都有效
- **THEN** Project 完成驗證並進入 `ready`

#### Scenario: Open with an invalid asset
- **WHEN** manifest 有效但至少一個 asset 無法解析或驗證
- **THEN** Project 進入 `degraded` 並列出 asset diagnostics

#### Scenario: Block an affected Function
- **WHEN** Function 本身或其 transitive dependency 無效
- **THEN** 系統禁止該 Function 開始 execution，即使 Project 仍可在 degraded state 中編輯

#### Scenario: Recover from degraded state
- **WHEN** 所有 blocking asset errors 被有效檔案修改修復
- **THEN** 系統重新驗證 Project 並進入 `ready`

### Requirement: Project-scoped settings and secrets separation
可分享的 runtime 與 editor defaults MAY 存放於 `ProjectSettings/` 並受版本控制。Secret values 與使用者個人設定 MUST NOT 寫入 authored asset definitions，且 SHALL 經獨立的 ignored local source 或 runtime environment 提供。

#### Scenario: Load shared Project settings
- **WHEN** manifest 引用有效的 Project settings files
- **THEN** 系統在 Project Context 中套用這些 shared settings

#### Scenario: Reject embedded secret values
- **WHEN** authored asset 將欄位宣告為 runtime secret 但同時包含 secret value
- **THEN** 系統拒絕保存該 secret value 並提示使用 local secret source

### Requirement: Ephemeral runtime state boundary
Project assets SHALL NOT 包含 durable Execution、Node Execution、runtime logs 或 execution history。關閉 Project 或 Backend 後，系統 MUST NOT 從 Project files 恢復先前 runtime executions。

#### Scenario: Reopen a Project
- **WHEN** 使用者關閉再重新開啟 Project
- **THEN** Type、Function、Code 與 settings 從 authored files 恢復，但先前 execution state 不存在

#### Scenario: Keep runtime state out of authored files
- **WHEN** Function 執行並產生 inputs、outputs、logs 與 errors
- **THEN** 系統不修改 authored asset files 以保存該 runtime state
