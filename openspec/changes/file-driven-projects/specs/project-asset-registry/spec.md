## Purpose

提供 Project 內可重建的 Asset Registry，以 stable identity 解析檔案、計算 deterministic hashes、追蹤 dependencies，並安全協調 Editor 與外部工具造成的檔案變更。

## ADDED Requirements

### Requirement: Asset discovery
Asset Registry SHALL 遞迴掃描目前 Project 的 `Assets/`，識別受支援的 Type manifests 與 Function manifests，並將 Function manifest 引用的 Code files 納入該 Function asset。未被受支援 manifest 引用的一般檔案 MUST NOT 自動成為可引用 Asset。

#### Scenario: Discover Type and Function assets
- **WHEN** `Assets/` 包含受支援的 Type manifest 與 Function manifest
- **THEN** Registry 為每個 definition 建立 Asset record

#### Scenario: Associate Function-owned code
- **WHEN** Function manifest 引用其 Project 內的 TypeScript Code file
- **THEN** Registry 將 Code file 納入該 Function 的 content 與 definition hash，而不建立獨立 reusable Code asset

#### Scenario: Ignore an unrelated file
- **WHEN** `Assets/` 中存在不符合支援格式且未被 manifest 引用的檔案
- **THEN** Registry 不允許其他 assets 以 Asset ID 引用該檔案

### Requirement: Stable asset identity
每個 Project asset SHALL 在其 manifest 內具有 immutable asset ID、display name、kind 與 schema version。Asset ID MUST 在目前 Project 中唯一，且 file path 或 display name MUST NOT 作為 reference identity。

#### Scenario: Move an asset file
- **WHEN** asset manifest 移至 `Assets/` 內另一個位置但保留 asset ID
- **THEN** 既有 references 在 Registry reload 後仍解析至同一 asset

#### Scenario: Rename an asset
- **WHEN** asset display name 或 file name 改變但 asset ID 不變
- **THEN** 既有 references 保持有效

#### Scenario: Detect a duplicate asset ID
- **WHEN** 兩個 discovered manifests 宣告相同 asset ID
- **THEN** Registry 將該 ID 標示為 ambiguous、Project 進入 degraded state，且依賴該 ID 的 Functions 不可執行

### Requirement: Reserved system identities
Engine-owned system Type IDs SHALL 使用保留 namespace，且不得由 Project asset 宣告或覆寫。Registry SHALL 先區分 system reference 與 project-local reference，再由對應 authority 解析。

#### Scenario: Resolve a system Type
- **WHEN** Project Type parent 引用受支援的 system Type ID
- **THEN** Registry 將 reference 交由 engine system Type registry 解析

#### Scenario: Reject a Project asset using a reserved ID
- **WHEN** Project manifest 宣告保留的 system namespace asset ID
- **THEN** Registry 拒絕該 asset 並回報 reserved identity error

### Requirement: Deterministic content and definition hashes
Registry SHALL 為每個 asset 計算 deterministic content hash，並使用自身 canonical content 與直接 dependency definition hashes 計算 transitive definition hash。相同語意內容及 dependency closure MUST 產生相同 definition hash，不得受絕對 Project path、檔案列舉順序或非語意格式差異影響。

#### Scenario: Reopen unchanged content
- **WHEN** 相同 Project files 在不同絕對路徑或不同 process 中載入
- **THEN** 每個 asset 產生相同 definition hash

#### Scenario: Change Function code
- **WHEN** Function-owned Code file 的語意內容改變
- **THEN** 該 Function definition hash 改變

#### Scenario: Change a dependency
- **WHEN** Type 或 Child Function dependency 的 definition hash 改變
- **THEN** 所有 transitive dependents 的 definition hashes 隨之改變

### Requirement: Dependency and reverse-dependency indexing
Registry SHALL 記錄每個 asset 的 direct dependencies 與 reverse dependents，並偵測 Type inheritance 及 Function reference cycles。Missing、ambiguous 或 cyclic dependencies MUST 產生可定位到 source asset 與 reference 的 diagnostics。

#### Scenario: Query affected assets
- **WHEN** asset definition hash 改變
- **THEN** Registry 能列出所有需要重新驗證的 direct 與 transitive dependents

#### Scenario: Report a broken dependency
- **WHEN** referenced asset 被刪除或 ID 不存在
- **THEN** Registry 將 referring asset 標示為 invalid 並回報 missing asset ID 與 reference location

#### Scenario: Detect a dependency cycle
- **WHEN** Project assets 形成禁止的 Type inheritance 或 Function dependency cycle
- **THEN** Registry 回報完整 cycle path 並阻止受影響 Functions 執行

### Requirement: Transactional registry snapshots
Registry SHALL 只向 consumers 發布完整且內部一致的 immutable snapshot。Initial scan 或 reload 過程中的 partial state MUST NOT 被 execution 或 editor query 當成 current resolved Project view。

#### Scenario: Publish an initial snapshot
- **WHEN** discovery、resolution、hashing 與 validation 完成
- **THEN** Registry 原子發布包含全部 Asset records 與 diagnostics 的 snapshot

#### Scenario: Keep readers on a consistent snapshot
- **WHEN** filesystem reload 正在建立下一個 snapshot
- **THEN** concurrent readers 繼續使用前一個完整 snapshot，直到新 snapshot 原子發布

### Requirement: Incremental external-change handling
Registry SHALL 偵測 Project authored files 的外部新增、修改、移動與刪除，合併同一變更批次的 filesystem events，重新載入受影響 assets，並重新驗證其 dependents。

#### Scenario: Reload an externally edited asset
- **WHEN** IDE 將有效修改寫入已註冊 asset file
- **THEN** Registry 發布包含新 definition hash 的 snapshot 並通知該 asset 與其 dependents 已改變

#### Scenario: Handle an asset move
- **WHEN** filesystem watcher 將 move 回報為 delete 與 create，但新 manifest 保留 asset ID
- **THEN** Registry 將其視為同一 asset 的 path change，而不是 identity replacement

#### Scenario: Handle an invalid external edit
- **WHEN** 外部修改使 asset 無法 parse 或 validate
- **THEN** Registry 保留前一個 valid definition 供 editor 比較、將 disk state 標示為 invalid，並阻止該 asset 及其 dependents 執行

### Requirement: Atomic editor saves with conflict detection
Editor save SHALL 以開啟或最後 reload 時觀察到的 content hash 作為 precondition。若 disk content 已改變，系統 MUST 拒絕覆寫並回報 conflict。通過 precondition 與 validation 的 save SHALL 使用同目錄 temporary file 與 atomic replacement，且失敗時 MUST 保留原檔。

#### Scenario: Save an unchanged asset
- **WHEN** editor 提交有效內容且 disk content hash 等於 expected hash
- **THEN** 系統原子替換 asset file 並發布更新後的 Registry snapshot

#### Scenario: Reject a stale editor save
- **WHEN** editor 開啟後外部工具已修改同一檔案
- **THEN** 系統拒絕 editor save、保留外部內容並回報 current 與 expected hashes

#### Scenario: Reject invalid editor content
- **WHEN** editor 提交無法 parse 或違反 asset schema 的內容
- **THEN** 系統不修改正式檔案並回報 validation diagnostics

#### Scenario: Recover from interrupted save
- **WHEN** temporary write 或 atomic replacement 失敗
- **THEN** 原正式檔案保持可讀，且下次 Project open 清理可辨識的 stale temporary files

### Requirement: Path containment and canonical resolution
所有 discovered manifests、referenced Code files、settings paths 與 save targets SHALL 在解析 symlink、relative segments 與 platform-specific path forms 後保持於 Project root 允許的目錄內。系統 MUST NOT 讀寫逃逸 Project boundary 的 target。

#### Scenario: Reject path traversal
- **WHEN** manifest 使用 `..` 或其他 path form 指向 Project root 之外
- **THEN** Registry 拒絕該 path 並回報 containment diagnostic

#### Scenario: Reject a symlink escape
- **WHEN** Project 內 path 經 real-path resolution 後指向 Project root 之外
- **THEN** Registry 不讀取或寫入該 target

### Requirement: Registry consumer contract
Registry SHALL 向其他 capabilities 提供依 asset ID 取得 resolved definition、取得 content 與 definition hashes、列出 dependencies 與 dependents、取得 diagnostics，以及訂閱 immutable snapshot changes 的能力。

#### Scenario: Resolve an asset for execution planning
- **WHEN** execution planner 以 asset ID 查詢 ready Project snapshot
- **THEN** Registry 回傳 resolved definition、definition hash 與 dependency information

#### Scenario: Notify consumers after a change
- **WHEN** 新 Registry snapshot 原子發布
- **THEN** subscribed consumers 收到 snapshot identity 與 changed asset IDs，並可重新驗證自己的 state
