## Context

目前 `@low-code-flow/ui` 已提供 `UiButton`、`UiBadge`、`UiBanner`、`UiCollapsible`、`UiDialog` 與 `UiTooltip`，但尚未提供表單相關的 Ui 元件。`packages/frontend` 內的 8 個檔案共用 `src/components/formClasses.ts`（`inputClass`、`compactInputClass`、`labelClass`）搭配原生表單元素，且 `<input type="checkbox">` 完全未套用樣式規格。動機與範圍見 `proposal.md`，行為要求見 `specs/ui-component-library/spec.md`。

## Goals / Non-Goals

**Goals:**

- 在 `@low-code-flow/ui` 提供 `UiLabel`、`UiField`、`UiInput`、`UiTextarea`、`UiSelect`、`UiCheckbox`，統一表單視覺與可及性行為。
- 透過 `UiField` 的 Vue context 自動連結 `id`、`for`、`aria-invalid` 與 `aria-describedby`，同時允許控制項在無 `UiField` 的情境（如工具列或列表列）獨立使用。
- 以 Reka UI 實作 `UiSelect`、`UiCheckbox` 與 `UiLabel`，維持不向 `frontend` 暴露 Reka 原件的封裝邊界。
- 移除 `packages/frontend/src/components/formClasses.ts`。

**Non-Goals:**

- 表單驗證框架（如 VeeValidate、Zod form schema 綁定）；驗證邏輯仍由各畫面或 domain 函式負責，僅將錯誤字串傳入 `UiField`。
- Combobox（可搜尋下拉選單）、RadioGroup、Switch、Slider 等目前 `frontend` 未使用的控制項。
- 跨欄位的表單容器或自動送出管理（`<form>` 仍由使用端自行宣告）。

## Decisions

### 1. 元件清單與實作基礎

| 元件 | 基礎 | 說明 |
|---|---|---|
| `UiLabel` | Reka `Label` | 接收 `for?: string`，預設套用 `mb-1 block text-xs font-medium text-fg-muted` |
| `UiField` | 自建 + `UiLabel` | 接收 `label?: string`、`id?: string`、`hint?: string`、`error?: string`；透過 `provide` 提供欄位上下文 |
| `UiInput` | 原生 `<input>` | `v-model`（`string \| number`）、`type`、`placeholder`、`disabled`、`readonly`、`required`、`inline?: boolean` |
| `UiTextarea` | 原生 `<textarea>` | `v-model`（`string`）、`rows`、`placeholder`、`disabled`、`readonly`、`required` |
| `UiSelect` | Reka `Select*` | `v-model`（`string`）、`options`／`groups`、`placeholder`、`disabled`、`inline?: boolean`、`ariaLabel` |
| `UiCheckbox` | Reka `Checkbox*` | `v-model`（`boolean`）、`disabled`、`id`、default slot 作為行內標籤文字 |

**為什麼 `UiInput` 與 `UiTextarea` 用原生元素，而 `UiSelect`、`UiCheckbox`、`UiLabel` 用 Reka UI？**
Reka UI 並未提供一般文字 `<input>` 或 `<textarea>` 原件，原生元素已具備完整鍵盤與表單行為。相對地，原生 `<select>` 的彈出選單無法套用樣式規格的語意 token（尤其在 dark mode 與跨平台瀏覽器下外觀不一致），而原生 `<input type="checkbox">` 在不同作業系統的勾選外觀與對齊方式差異大；改用 Reka `Select` 與 `Checkbox` 可完全以語意 token 控制外觀並確保鍵盤與 ARIA 行為一致。

### 2. `UiField` Context 與獨立使用雙模式

新增內部模組 `packages/ui/src/components/fieldContext.ts`，定義 `InjectionKey<UiFieldContext>`：

```ts
export interface UiFieldContext {
  id: ComputedRef<string>
  describedBy: ComputedRef<string | undefined>
  invalid: ComputedRef<boolean>
}
```

- `UiField` 使用 `props.id ?? useId()` 產生穩定 ID；當 `props.error` 或 `props.hint` 存在時，底部說明段落設定 `id="${fieldId}-description"`，並將 `describedBy` 設為該 ID。
- `UiInput`、`UiTextarea`、`UiSelect`、`UiCheckbox` 內部呼叫 `inject(uiFieldKey, null)`：
  - 若控制項自身被傳入明確的 `id`、`aria-invalid` 或 `aria-describedby` prop，優先使用明確傳入的值。
  - 若未傳入且位於 `UiField` 內，自動套用 context 提供的值。
  - 若不在 `UiField` 內（如 `PortsEditor` 列表列或 `FunctionEditorView` 工具列），則正常獨立運作。

**替代方案**：透過 scoped slot `<UiField v-slot="{ id, ariaInvalid, ariaDescribedby }">` 手動綁定。捨棄原因：每個使用處仍需重複撰寫 `v-bind` 樣板碼，不如 `provide`/`inject` 簡潔。

### 3. `UiSelect` 以資料結構 Props 封裝 Reka Select

Reka 的 `Select` 由 10 個以上的複合原件（`SelectRoot`、`SelectTrigger`、`SelectValue`、`SelectPortal`、`SelectContent`、`SelectViewport`、`SelectGroup`、`SelectLabel`、`SelectItem`、`SelectItemText`、`SelectItemIndicator`）組成。根據 `ui-component-library` 規範，`frontend` 不直接接觸 Reka 原件，因此 `UiSelect` 對外提供結構化 props：

```ts
export interface UiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface UiSelectGroup {
  label: string
  options: UiSelectOption[]
}

export interface UiSelectProps {
  options?: readonly UiSelectOption[]
  groups?: readonly UiSelectGroup[]
  placeholder?: string
  disabled?: boolean
  inline?: boolean
  id?: string
  ariaLabel?: string
}
```

- 浮層透過 `SelectPortal` 渲染至 `body`，並使用 `z-(--z-overlay)`，避免被 Vue Flow canvas 或側邊面板的 `overflow` 裁切。
- **空值與未知值處理**：Reka `SelectItem` 不允許 `value=""`（空字串會被視為未選取並顯示 placeholder）。
  - 在 `FunctionEditorView.vue` 的「Call function...」選單中，`childToAdd` 初始為 `""`，正好對應 `UiSelect` 的 `placeholder="Call function..."`，選取後在 `@update:model-value` 新增節點並重設回 `""`。
  - 在 `TypeSelect.vue` 中，若目前綁定的 `model` 不在 `catalog` 內，將其作為一個 `disabled: true` 的 fallback option 放入列表（當 `model` 非空字串時），或交由 `placeholder` 顯示。

### 4. 以 `inline` Prop 取代 `compactInputClass`

先前 `formClasses.ts` 透過 `inputClass.replace('w-full ', '')` 產生 `compactInputClass`，因為專案不引入 `tailwind-merge`。
在 `UiInput` 與 `UiSelect` 加入 `inline?: boolean`（預設 `false`）：
- `inline === false`：套用 `w-full`。
- `inline === true`：不套用 `w-full`，讓使用端可安全加上 `w-44` 或 `flex-1` 等寬度／彈性版面 class。

### 5. `UiCheckbox` 封裝行內標籤

核取方塊在 `RunDialog.vue` 與 `TypeEditorView.vue` 中皆伴隨右側短文字（如 `true`、`Integer only`、`required`）。
`UiCheckbox` 在提供 default slot 時，外層以 `<label class="inline-flex items-center gap-2 text-sm text-fg">` 包覆 `CheckboxRoot` 與 `<slot />`，使點擊文字也能切換勾選；未提供 default slot 時則只渲染 `CheckboxRoot`（可搭配外部 `UiField` 或 `UiLabel`）。

## Risks / Trade-offs

- **[Reka Select 在 jsdom 測試環境中的 DOM 與原生 `<select>` 不同]** → 原有 `PortsEditor.spec.ts` 使用 `wrapper.findAll('select')[0]!.setValue(...)`。改用 Reka `Select` 後，觸發元素為 `button[role="combobox"]`。在 `UiSelect.spec.ts` 中完整測試 Reka `Select` 的開啟與選取行為；在 `PortsEditor.spec.ts` 等上層領域元件測試中，可透過 `findComponent(UiSelect).vm.$emit('update:modelValue', ...)` 或點擊選項互動進行驗證。
- **[`v-model.number` 在自訂元件上的行為]** → Vue 3 對自訂元件的 `v-model.number` modifier 會在 `emit('update:modelValue', rawString)` 時自動轉為 `Number(val)`，但當輸入框清空為 `""` 時，`Number("")` 在原生 `<input type="number">` 會是 `""` 或 `undefined`，需確保 `UiInput` 在 `type="number"` 且值為空字串時正確處理，讓 `TypeEditorView.vue` 的 `min`／`max` 欄位維持既有行為。

## Migration Plan

1. 在 `packages/ui` 建立 `fieldContext.ts`、`UiLabel`、`UiField`、`UiInput`、`UiTextarea`、`UiCheckbox`、`UiSelect`，更新 `packages/ui/src/index.ts`。
2. 為 6 個新元件撰寫 `.spec.ts` 單元測試與 `.story.vue` Histoire stories。
3. 依序將 `packages/frontend` 的 `TypeSelect`、`PortsEditor`、`EndpointSettings`、`FunctionInspector`、`RunDialog`、`FunctionEditorView`、`ProjectLayout`、`ProjectsView`、`TypeEditorView` 改用新元件，並刪除 `formClasses.ts`。
4. 更新受影響的前端測試並執行全專案 `test`、`lint`、`type-check`。
