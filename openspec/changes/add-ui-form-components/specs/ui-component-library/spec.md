## ADDED Requirements

### Requirement: Field and Label association
UI package SHALL 提供 `UiLabel` 與 `UiField` 兩個 Ui 元件。`UiLabel` MUST 渲染與表單控制項關聯的標籤元素。`UiField` SHALL 接收標籤文字、選用的提示文字（`hint`）與選用的錯誤訊息（`error`），並將內部控制項與對應的標籤及說明文字建立可及性關聯。當 `UiField` 帶有 `error` 時，內部控制項 MUST 標示為 invalid，且錯誤訊息 MUST 優先於提示文字顯示並使用 `danger` 語意 token 的色彩。

#### Scenario: Associate label and control automatically
- **WHEN** `UiInput` 置於設定了 `label="Function name"` 的 `UiField` 內且未手動指定 `id`
- **THEN** `UiLabel` 的 `for` 屬性與 `UiInput` 的 `id` 屬性具有相同的值

#### Scenario: Preserve an explicit control id
- **WHEN** `UiField` 設定了 `id="endpoint-path"` 且內含 `UiInput`
- **THEN** `UiLabel` 的 `for` 與 `UiInput` 的 `id` 皆為 `"endpoint-path"`

#### Scenario: Expose error state and message
- **WHEN** `UiField` 設定了 `error="Enter a number"` 且內含 `UiInput`
- **THEN** `UiInput` 的 `aria-invalid` 為 `"true"`，`aria-describedby` 指向顯示 `"Enter a number"` 的元素，且該元素使用 `danger` 語意 token 色彩

#### Scenario: Expose hint when there is no error
- **WHEN** `UiField` 設定了 `hint="Maximum 128 characters."` 且未設定 `error`
- **THEN** `UiInput` 的 `aria-invalid` 不為 `"true"`，且 `aria-describedby` 指向顯示該提示文字的元素

### Requirement: Text inputs
UI package SHALL 提供 `UiInput` 與 `UiTextarea` 兩個 Ui 元件，支援雙向綁定（`v-model`）、`disabled`、`readonly` 與 `placeholder`，並以樣式規格中的語意 token 呈現邊框、背景、文字與鍵盤焦點外框。`UiInput` SHALL 預設占滿容器寬度，並支援 `inline` 模式以省略滿版寬度設定。

#### Scenario: Update string model on input
- **WHEN** 使用者在 `UiInput` 或 `UiTextarea` 中輸入文字
- **THEN** 元件發出 `update:modelValue` 事件並帶入新字串

#### Scenario: Render inline input without full-width class
- **WHEN** 使用端以 `inline` 為 `true` 渲染 `UiInput`
- **THEN** 渲染出的 `<input>` 不包含 `w-full` class

#### Scenario: Respect disabled and readonly states
- **WHEN** `UiInput` 設定 `disabled` 或 `readonly`
- **THEN** 原生 `<input>` 具備對應的 `disabled` 或 `readonly` 屬性

### Requirement: Select behavior
UI package SHALL 提供 `UiSelect` 元件，支援單層 `options` 或分組 `groups` 選項清單、雙向綁定（`v-model`）、`placeholder`、`disabled` 與 `inline` 寬度模式。`UiSelect` MUST 可由鍵盤開啟並選擇項目，選單浮層 MUST 渲染於 canvas 與其他 application 內容之上，且不得將內部 headless 函式庫的原件暴露於公開 API。

#### Scenario: Select an option and emit update
- **WHEN** 使用者開啟 `UiSelect` 並選取某個未禁用的選項
- **THEN** `UiSelect` 發出 `update:modelValue` 事件並帶入該選項的 `value`

#### Scenario: Render grouped options
- **WHEN** 使用端傳入包含多個群組的 `groups` prop 至 `UiSelect`
- **THEN** 開啟選單後顯示各群組標題及其下的選項

#### Scenario: Ignore a disabled select or option
- **WHEN** `UiSelect` 設定為 `disabled`，或某選項設定為 `disabled`
- **THEN** 禁用的觸發元素無法開啟選單，且禁用的選項無法被選取

### Requirement: Checkbox behavior
UI package SHALL 提供 `UiCheckbox` 元件，支援布林值雙向綁定（`v-model`）、`disabled` 狀態與行內標籤 slot。`UiCheckbox` MUST 具備 `checkbox` role、反映勾選狀態的 `aria-checked`，且可由鍵盤切換。

#### Scenario: Toggle checkbox state
- **WHEN** 使用者點擊未禁用的 `UiCheckbox` 或在其聚焦時按下 Space
- **THEN** `UiCheckbox` 發出 `update:modelValue` 事件並切換布林值，且 `aria-checked` 隨之更新

#### Scenario: Ignore a disabled checkbox
- **WHEN** 使用者點擊 `disabled` 的 `UiCheckbox`
- **THEN** 不發出 `update:modelValue` 事件，且勾選狀態不變
