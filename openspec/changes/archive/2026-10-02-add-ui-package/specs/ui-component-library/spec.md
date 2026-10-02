## Purpose

定義與 domain 無關的共用 UI 元件 package：其依賴邊界與統一匯出、樣式規格（design tokens）的所有權與 application 端的自定義方式，以及互動元件必須提供的可及性與行為保證，讓 Editor chrome 與 canvas 元件共用一致的視覺語言。

## ADDED Requirements

### Requirement: Domain-agnostic package boundary
UI 元件 package SHALL 是獨立的 workspace package，且 MUST NOT 依賴 application package 或任何 domain module。UI 元件的公開 props、events 與 slots MUST NOT 引用 domain 型別（如 Type、Port、Asset、Diagnostic definitions）。需要 domain 型別的元件 SHALL 位於 application package，並以組合 UI 元件的方式實作。

#### Scenario: Reject an import from the application package
- **WHEN** UI package 內的 source 檔案 import application package 或其 path alias
- **THEN** lint 檢查失敗並指出違反分層規則的 import

#### Scenario: Reject an application dependency declaration
- **WHEN** UI package 的 package manifest 將 application package 列為任何種類的 dependency
- **THEN** 邊界檢查失敗

#### Scenario: Compose a domain-aware component
- **WHEN** application 需要依 Type 顯示標記
- **THEN** application 內的元件接收 domain 型別並將其轉換為 UI Badge 的 domain 無關 props（如文字與 variant）

### Requirement: Unified entry point
UI package SHALL 透過單一 entry point 匯出所有公開元件及其 props 型別。Application MUST 只經由該 entry point 與樣式規格的公開路徑使用 UI package，MUST NOT 匯入 UI package 的內部檔案。

#### Scenario: Import components from the entry point
- **WHEN** application 需要使用 Dialog、Tooltip 與 Badge
- **THEN** 三者皆可從 UI package 的 entry point 匯入，且 props 型別可供 application 使用

#### Scenario: Reject a deep import
- **WHEN** application source 匯入 UI package 內部檔案路徑
- **THEN** 解析失敗或 lint 檢查失敗

### Requirement: Source-only consumption
UI package SHALL 以 source 形式提供公開 entry points，由使用端的 build tool 編譯；UI package MUST NOT 需要獨立的 build step 才能被 workspace 內的 application 使用。UI package MUST 宣告 Vue 為 peer dependency，使 application 與 UI 元件共用同一個 Vue runtime。UI 元件使用的樣式 MUST 被包含在 application 的樣式輸出中，application 不需列舉 UI 元件內部使用的樣式。

#### Scenario: Use UI components without building the package
- **WHEN** 開發者在乾淨的 checkout 安裝 workspace dependencies 後啟動 application dev server
- **THEN** application 可 import 並渲染 UI 元件，且不需先執行 UI package 的 build

#### Scenario: Include styles used only by UI components
- **WHEN** 某個樣式 utility 只出現在 UI 元件中，application 進行 production build
- **THEN** 該樣式存在於 application 的 CSS 輸出中，UI 元件正確呈現

#### Scenario: Reflect UI source changes during development
- **WHEN** application dev server 執行中，開發者修改 UI 元件 source 或其樣式
- **THEN** application 反映修改，不需重新啟動 dev server

#### Scenario: Type-check across packages
- **WHEN** 執行 application 的 type-check
- **THEN** UI 元件的 props 型別被檢查，且以錯誤型別使用 UI 元件時 type-check 失敗

### Requirement: Style specification ownership
UI package SHALL 擁有並提供樣式規格，以 design tokens 表達，至少涵蓋背景、文字、邊框、強調、選取、info／success／warning／danger 狀態、圓角、間距、字級與 overlay 層級。每個色彩、圓角、間距與字級 token MUST 同時可作為 CSS custom property 與 utility class 使用。色彩 tokens MUST 同時定義 light 與 dark 值，並依使用者的系統色彩偏好套用。可用的色彩 SHALL 僅限於樣式規格與 application 明確擴充的 tokens；樣式框架的預設色盤 MUST NOT 可用。

#### Scenario: Use a token as a utility and as a variable
- **WHEN** 元件以 utility class 使用 danger 色彩，另一處以 CSS custom property 引用同一 token
- **THEN** 兩者解析為相同顏色

#### Scenario: Apply dark tokens
- **WHEN** 使用者的系統色彩偏好為 dark
- **THEN** 所有色彩 token 解析為 dark 值，UI 元件與 canvas 元件同時改變外觀，不需在元件中撰寫 dark 專屬樣式

#### Scenario: Reject colors outside the specification
- **WHEN** 開發者使用不屬於樣式規格或 application 擴充的色彩 utility（例如框架預設色盤的顏色）
- **THEN** 該 utility 不產生任何樣式

### Requirement: Application style customization
Application SHALL 能在不修改 UI package 的情況下，覆寫樣式規格中任何 token 的值，並擴充新的 tokens。覆寫的值 MUST 同時影響 UI 元件與 application 元件；擴充的 tokens MUST 與規格內的 tokens 一樣可作為 CSS custom property 與 utility class 使用。Domain 專屬的 tokens（例如依 Type root kind 區分的顏色）SHALL 定義在 application 中，而不是 UI package。

#### Scenario: Override a specification token
- **WHEN** application 將 accent token 覆寫為另一個顏色
- **THEN** 使用 accent 的 UI 元件（如 primary Button 與 Collapsible 的 focus 樣式）與 application 元件皆呈現新顏色，UI package source 未被修改

#### Scenario: Extend with a domain token
- **WHEN** application 新增 `type-string` 色彩 token 並提供 light 與 dark 值
- **THEN** application 可使用對應的 utility class 與 CSS custom property，且其值隨系統色彩偏好切換

#### Scenario: Keep domain tokens out of the UI package
- **WHEN** 檢視 UI package 的樣式規格
- **THEN** 其中不包含任何以 domain 概念（Type、Port、Asset、Execution）命名的 token

### Requirement: Canvas components use shared tokens
Application 的 canvas 元件（如 Function Node 與 Edge）SHALL 以 tokens 表達顏色、邊框、圓角與字級，MUST NOT 使用 hardcoded 色彩值。Canvas 元件的幾何與定位樣式可以保留在 application 中自行定義。Canvas 函式庫的預設外觀 SHALL 對應到 tokens，且 application 的 utility classes MUST 能覆寫 canvas 函式庫的預設樣式。

#### Scenario: Selected node uses the selection token
- **WHEN** 使用者選取 Function Node
- **THEN** 節點的選取外框使用選取狀態 token 的顏色

#### Scenario: Node follows dark mode
- **WHEN** 系統色彩偏好切換為 dark
- **THEN** Function Node、Edge 以及 canvas 的 controls 與 minimap 的顏色隨 tokens 改變，不需修改元件

#### Scenario: Utility overrides canvas library default
- **WHEN** application 在 canvas 元素上使用與函式庫預設樣式衝突的 utility class
- **THEN** utility class 的樣式生效

### Requirement: Dialog behavior
UI package SHALL 提供 modal Dialog 元件。開啟時 Dialog MUST 將鍵盤焦點移入 Dialog 並限制 Tab 循環於 Dialog 內；按下 Escape 或觸發關閉動作時 MUST 關閉；關閉後 MUST 將焦點還給開啟前的觸發元素。Dialog MUST 具有 dialog role、可存取名稱，並渲染於 canvas 與其他 application 內容之上。Dialog SHALL 支援由使用端控制的開啟狀態，並可設定為禁止以點擊外部區域關閉。

#### Scenario: Trap focus inside an open dialog
- **WHEN** Dialog 開啟且使用者在最後一個可聚焦元素上按下 Tab
- **THEN** 焦點移至 Dialog 內第一個可聚焦元素，不會移到背景內容

#### Scenario: Close with Escape and restore focus
- **WHEN** 使用者從某按鈕開啟 Dialog 後按下 Escape
- **THEN** Dialog 關閉，且焦點回到該按鈕

#### Scenario: Require explicit choice
- **WHEN** Dialog 設定為禁止點擊外部關閉，且使用者點擊 Dialog 外部
- **THEN** Dialog 維持開啟

#### Scenario: Render above the canvas
- **WHEN** Dialog 在 canvas 元件內被開啟
- **THEN** Dialog 不被 canvas 的 overflow 或堆疊層級裁切或遮蓋

#### Scenario: Expose accessible name
- **WHEN** 輔助技術讀取開啟中的 Dialog
- **THEN** 其 role 為 dialog，且名稱來自 Dialog 標題

### Requirement: Tooltip behavior
UI package SHALL 提供 Tooltip 元件，於觸發元素被 pointer hover 或取得鍵盤焦點時顯示，於離開、失焦或按下 Escape 時隱藏。Tooltip MUST 以 accessible description 關聯至觸發元素，MUST 保持在 viewport 內（必要時翻轉或位移），並渲染於 canvas 之上。Tooltip SHALL 支援可設定的顯示延遲與偏好方向。

#### Scenario: Show on keyboard focus
- **WHEN** 使用者以鍵盤將焦點移到具有 Tooltip 的元素
- **THEN** Tooltip 顯示，且觸發元素以 Tooltip 內容作為 accessible description

#### Scenario: Dismiss with Escape
- **WHEN** Tooltip 顯示中且使用者按下 Escape
- **THEN** Tooltip 隱藏，焦點留在觸發元素

#### Scenario: Stay within the viewport
- **WHEN** 觸發元素靠近 viewport 邊緣，使偏好方向沒有足夠空間
- **THEN** Tooltip 改變方向或位移，使內容完整顯示於 viewport 內

### Requirement: Button
UI package SHALL 提供 Button 元件，支援 primary、secondary、ghost、danger variants，色彩皆來自 tokens。Button MUST 以原生 button 語意呈現，可由鍵盤聚焦並以 Enter 或 Space 觸發，且取得鍵盤焦點時 MUST 顯示可見的 focus 樣式。Disabled 狀態的 Button MUST NOT 觸發 click 事件。Button 預設 MUST NOT 送出表單。

#### Scenario: Activate with the keyboard
- **WHEN** 焦點位於 Button 且使用者按下 Enter 或 Space
- **THEN** Button 觸發 click 事件

#### Scenario: Ignore a disabled button
- **WHEN** 使用者點擊 disabled 的 Button
- **THEN** 不觸發 click 事件

#### Scenario: Render a danger action
- **WHEN** 使用端以 danger variant 渲染 Button
- **THEN** Button 使用 danger token 的色彩

#### Scenario: Do not submit a form by default
- **WHEN** 未指定 type 的 Button 位於 form 內且被觸發
- **THEN** form 不會送出

### Requirement: Non-interactive primitives
UI package SHALL 提供 Badge、Banner 與 Collapsible 元件。Badge 與 Banner SHALL 支援由 tokens 定義的語意 variants（至少 neutral、info、success、warning、danger）。Banner MUST 以適當的 live region 或 alert role 傳達狀態訊息。Collapsible MUST 可由鍵盤切換，並以 expanded state 標示觸發元素。

#### Scenario: Render a semantic badge
- **WHEN** 使用端以 danger variant 渲染 Badge
- **THEN** Badge 使用 danger token 的色彩

#### Scenario: Announce a warning banner
- **WHEN** application 顯示 warning variant 的 Banner
- **THEN** 輔助技術可得知該狀態訊息

#### Scenario: Toggle a collapsible with the keyboard
- **WHEN** 焦點位於 Collapsible 觸發元素且使用者按下 Enter 或 Space
- **THEN** 內容展開或收合，且觸發元素的 expanded state 隨之更新
