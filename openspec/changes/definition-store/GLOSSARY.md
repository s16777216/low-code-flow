# Glossary

## projects

- **Project** — Type 與 Function 的容器，也是引用範圍與 Registry 範圍；一個伺服器可有多個 Project，Project 之間不能互相引用。 Aliases: 專案。

## project-asset-registry

- **Asset** — Project 內被儲存的 Type 或 Function 定義，以建立後不可變的 Asset ID 識別。 Aliases: 定義、Project Asset。
- **Revision** — Asset 每次成功儲存後遞增的數字，用於樂觀鎖；與版本或發布無關。 Aliases: 修訂號。
- **草稿** — 可儲存但不一定可執行的 Asset 目前內容；本系統沒有「已發布版本」，所有引用者都使用草稿。 Aliases: Draft。
- **可執行（Executable）** — Asset 自身無 diagnostics 錯誤，且其依賴的 Assets 皆可執行；只有可執行的 Function 能開始 execution。 Aliases: Executable。
- **Registry Snapshot** — Registry 在某次寫入後發布的 immutable 已解析視圖，含定義、diagnostics 與依賴索引。 Aliases: Snapshot。
