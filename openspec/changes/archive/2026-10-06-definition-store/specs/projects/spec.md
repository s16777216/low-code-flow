## Purpose

定義 Project 容器：Project 是 Type 與 Function 的擁有者、引用範圍與 Registry 範圍，讓多人共用的伺服器能以 Project 為單位組織與隔離工作流程定義。

## ADDED Requirements

### Requirement: Project as a container
系統 SHALL 支援多個 Project。每個 Project MUST 具有建立後不可變的 ID 與可修改的顯示名稱，並擁有零個或多個 Type 與 Function Assets。每個 Asset MUST 恰好屬於一個 Project。

#### Scenario: Create a project
- **WHEN** 使用者以名稱「訂單自動化」建立 Project
- **THEN** 系統建立具有新 ID 的空 Project，並可在 Project 清單中看到它

#### Scenario: Rename a project
- **WHEN** 使用者修改 Project 的顯示名稱
- **THEN** Project ID 不變，其內所有 Assets 與引用維持不變

### Requirement: Project-local reference scope
Asset 之間的引用 SHALL 只能指向同一個 Project 內的 Asset，或 `system:*` 內建型別。系統 MUST NOT 解析指向其他 Project 的引用。

#### Scenario: Reference an asset in the same project
- **WHEN** Function 引用同一個 Project 內的 Type
- **THEN** 系統成功解析該引用

#### Scenario: Reject a reference into another project
- **WHEN** Function 引用的 Asset ID 屬於另一個 Project
- **THEN** 系統將該引用視為無法解析，並在該 Function 的 diagnostics 中回報

### Requirement: Project deletion
刪除 Project 時，系統 SHALL 一併刪除該 Project 的所有 Assets 並釋放其 Registry。該 Project 尚在執行中的 executions MUST 被取消。

#### Scenario: Delete a project with assets
- **WHEN** 使用者刪除含有 Types 與 Functions 的 Project
- **THEN** 該 Project 與其所有 Assets 不再能被查詢

#### Scenario: Cancel running executions of a deleted project
- **WHEN** 使用者刪除仍有 execution 在執行中的 Project
- **THEN** 這些 executions 被取消，且不再建立新的 execution

### Requirement: Shared access without authentication
POC SHALL 讓所有能連到伺服器的使用者存取所有 Projects，不要求登入或權限檢查。

#### Scenario: Two users open the same project
- **WHEN** 兩位使用者在不同瀏覽器開啟同一個 Project
- **THEN** 兩人看到相同的 Assets，且都能編輯
