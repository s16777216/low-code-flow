# project-asset-registry Specification

## Purpose
定義 Type 與 Function Assets 的持久化、identity、多人編輯的衝突處理、草稿與可執行狀態，以及提供給執行引擎的 immutable Registry snapshot，使 Function composition 能在共用伺服器上一律以最新定義運作。

## Requirements

### Requirement: Asset persistence
系統 SHALL 將每個 Type 與 Function Asset 的完整定義持久化，包含 Function 所擁有 Code Nodes 的原始碼。伺服器重新啟動後，所有已儲存的 Assets MUST 能以相同內容讀回。

#### Scenario: Read assets after restart
- **WHEN** 使用者儲存一個含 Code Node 的 Function，之後伺服器重新啟動
- **THEN** 讀回的 Function 定義與 Code 原始碼與儲存時相同

### Requirement: Stable asset identity
每個 Asset SHALL 具有建立後不可變、在系統內唯一的 ID。Asset 的顯示名稱可修改，且修改名稱 MUST NOT 影響任何引用。`system:` 前綴的 ID 保留給 engine 內建型別，使用者 MUST NOT 以此建立 Asset。

#### Scenario: Rename a referenced function
- **WHEN** 使用者修改被其他 Function 引用的 Function 名稱
- **THEN** 引用者仍指向同一個 Function，且不需任何修改

#### Scenario: Reject a reserved identity
- **WHEN** 使用者嘗試以 `system:string` 作為 ID 建立 Asset
- **THEN** 系統拒絕該請求

### Requirement: Optimistic concurrency on save
每個 Asset SHALL 具有 revision。讀取 Asset 時 MUST 回傳目前 revision；更新時 MUST 附上預期的 revision。預期 revision 與目前不符時，系統 MUST 拒絕更新、不修改任何內容，並回傳目前 revision。

#### Scenario: Save with the current revision
- **WHEN** 使用者以讀取時取得的 revision 儲存修改，且期間無人修改
- **THEN** 系統儲存內容並回傳遞增後的 revision

#### Scenario: Reject a stale save
- **WHEN** 使用者甲與乙讀取同一個 Function，甲先儲存，乙再以舊 revision 儲存
- **THEN** 乙的儲存被拒絕，Function 內容維持甲儲存的版本，乙收到目前 revision

### Requirement: Draft saves and executability
系統 SHALL 接受語意上未完成的定義（例如 input 未連線、引用不存在的 port、Type 不相容的 Edge），並為每個 Asset 提供 diagnostics 與是否可執行的狀態。Asset 只有在自身無錯誤，且其依賴的所有 Assets 皆可執行時才可執行。不可執行的 Function MUST NOT 開始 execution。格式錯誤、不支援的 schema version，或違反 identity 規則的文件 MUST 被拒絕寫入。

#### Scenario: Save an incomplete draft
- **WHEN** 使用者儲存一個仍有 input 未連線的 Function
- **THEN** 儲存成功，該 Function 的 diagnostics 指出未連線的 input，且狀態為不可執行

#### Scenario: Propagate non-executability to dependents
- **WHEN** Function `Checkout` 引用 Function `GetUser`，而 `GetUser` 被儲存為不可執行的草稿
- **THEN** `Checkout` 也被標示為不可執行，其 diagnostics 指出原因來自 `GetUser`

#### Scenario: Reject a malformed document
- **WHEN** 請求內容不是合法的 Asset 文件，或 schema version 不受支援
- **THEN** 系統拒絕寫入，且該 Asset 原有內容不變

### Requirement: Always the latest definition
Asset 之間的引用 SHALL 只記錄被引用 Asset 的 ID，並一律解析為該 Asset 目前儲存的定義。系統 MUST NOT 鎖定被引用 Asset 的版本或 hash，也不提供發布或版本歷史。被引用 Asset 的變更 SHALL 立即反映在引用者的 diagnostics 與可執行狀態上。

#### Scenario: Use the latest child definition
- **WHEN** 使用者修改 `GetUser` 內部的 Code 並儲存，而 `Checkout` 引用 `GetUser`
- **THEN** 之後開始的 `Checkout` execution 使用修改後的 `GetUser`，`Checkout` 不需任何操作

#### Scenario: Reflect a removed port immediately
- **WHEN** 使用者刪除 `GetUser` 的某個 output port，而 `Checkout` 有 Edge 連到該 port
- **THEN** `Checkout` 的 diagnostics 立即指出該 Edge 失效，且 `Checkout` 變為不可執行

### Requirement: Dependency index
Registry SHALL 能查詢每個 Asset 直接依賴的 Assets，以及直接依賴它的 Assets。

#### Scenario: Find dependents of a type
- **WHEN** 查詢某個 Type 的反向依賴
- **THEN** 系統回傳所有 port 或 Type 繼承關係引用該 Type 的 Assets

### Requirement: Deleting referenced assets
系統 MUST 拒絕刪除仍被同一 Project 內其他 Asset 引用的 Asset，並回傳引用者清單。未被引用的 Asset SHALL 可被刪除。

#### Scenario: Reject deleting a referenced function
- **WHEN** 使用者刪除被 `Checkout` 引用的 `GetUser`
- **THEN** 刪除被拒絕，回應中列出 `Checkout`

#### Scenario: Delete an unreferenced type
- **WHEN** 使用者刪除未被任何 Asset 引用的 Type
- **THEN** 該 Type 被刪除，之後無法再查詢

### Requirement: Transactional registry snapshots
Registry SHALL 以 immutable snapshot 的形式提供 Project 的已解析定義、diagnostics 與依賴索引。每次寫入成功後，系統 MUST 在單一步驟中以新 snapshot 取代舊 snapshot，使 consumers 不會看到部分更新。已被 consumer 持有的舊 snapshot MUST 保持不變。

#### Scenario: Keep a held snapshot stable
- **WHEN** 執行引擎持有某個 snapshot，期間有使用者儲存了新的定義
- **THEN** 執行引擎持有的 snapshot 內容不變，之後取得的 snapshot 才包含新定義

#### Scenario: Notify consumers after a write
- **WHEN** 某個 Asset 儲存成功
- **THEN** 訂閱者收到包含新舊 snapshot 識別與受影響 Asset IDs 的通知，受影響範圍包含該 Asset 與其所有反向依賴者

### Requirement: Registry consumer contract
Registry SHALL 提供以 Asset ID 取得已解析定義、查詢依賴與反向依賴、取得目前 snapshot，以及訂閱變更通知的介面。Type、Function 與執行模組 MUST 只透過此介面讀取定義，不得直接存取資料庫。

#### Scenario: Resolve a definition through the registry
- **WHEN** 執行引擎需要某個 Function 的定義
- **THEN** 它透過 Registry 以 Asset ID 取得，而非查詢資料庫
