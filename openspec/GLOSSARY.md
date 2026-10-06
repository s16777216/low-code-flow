# Glossary

## core

- **ExampleTerm** — Definition of example domain term. Aliases: alias1, alias2.

## ui-component-library

- **樣式規格** — `ui` package 的 `theme.css` 所定義的一組語意 design tokens 與預設值，是色彩與樣式的唯一來源；application 只能覆寫或擴充，不能繞過。 Aliases: Style Specification、theme。
- **語意 token** — 以用途命名的 design token（如 accent、danger、border），同時是 CSS custom property 與 utility class；本 change 不定義原始色階。 Aliases: Semantic Token。
- **Domain token** — 由 application 擴充、以 domain 概念命名的 token（如 `type-string`），不得出現在 `ui` package。 Aliases: 擴充 token。
- **Ui 元件** — 由 `@low-code-flow/ui` 統一匯出、以 `Ui` 前綴命名、公開 API 不含 domain 型別的元件。 Aliases: UI primitive。


## projects

- **Project** — Type 與 Function 的容器，也是引用範圍與 Registry 範圍；一個伺服器可有多個 Project，Project 之間不能互相引用。 Aliases: 專案。

## project-asset-registry

- **Asset** — Project 內被儲存的 Type 或 Function 定義，以建立後不可變的 Asset ID 識別。 Aliases: 定義、Project Asset。
- **Revision** — Asset 每次成功儲存後遞增的數字，用於樂觀鎖；與版本或發布無關。 Aliases: 修訂號。
- **草稿** — 可儲存但不一定可執行的 Asset 目前內容；本系統沒有「已發布版本」，所有引用者都使用草稿。 Aliases: Draft。
- **可執行（Executable）** — Asset 自身無 diagnostics 錯誤，且其依賴的 Assets 皆可執行；只有可執行的 Function 能開始 execution。 Aliases: Executable。
- **Registry Snapshot** — Registry 在某次寫入後發布的 immutable 已解析視圖，含定義、diagnostics 與依賴索引。 Aliases: Snapshot。
