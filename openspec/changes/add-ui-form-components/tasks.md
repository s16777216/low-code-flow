## 1. `@low-code-flow/ui` 表單基礎與欄位上下文

- [ ] 1.1 新增 `packages/ui/src/components/fieldContext.ts`、`UiLabel.vue` 與 `UiField.vue`，並建立 `UiField.spec.ts` 驗證 `id`/`for` 自動綁定、明確 `id` 保留、`hint` 與 `error`（`aria-invalid`、`aria-describedby`、`text-danger`）行為通過測試
- [ ] 1.2 新增 `packages/ui/src/components/UiInput.vue` 與 `UiTextarea.vue`（支援 `v-model`、`inline`、唯讀、禁用與 `UiField` 上下文繼承），並建立 `UiInput.spec.ts` 與 `UiTextarea.spec.ts` 驗證單元測試通過
- [ ] 1.3 以 Reka UI `Checkbox` 新增 `packages/ui/src/components/UiCheckbox.vue`（支援 `v-model`、`disabled` 與行內標籤 slot），並建立 `UiCheckbox.spec.ts` 驗證點擊、鍵盤切換與禁用狀態測試通過
- [ ] 1.4 以 Reka UI `Select` 與 Portal 新增 `packages/ui/src/components/UiSelect.vue`（支援 `options`、`groups`、`placeholder`、`disabled`、`inline` 與 `UiField` 上下文繼承），並建立 `UiSelect.spec.ts` 驗證選取、分組渲染與禁用狀態測試通過
- [ ] 1.5 在 `packages/ui/src/index.ts` 匯出 `UiLabel`、`UiField`、`UiInput`、`UiTextarea`、`UiCheckbox`、`UiSelect` 及其 props 型別，並新增對應 `.story.vue` 檔案，執行 `npm test --workspace @low-code-flow/ui` 確認包含邊界測試在內全部通過

## 2. `packages/frontend` 表單遷移與清理

- [ ] 2.1 將 `packages/frontend/src/components/TypeSelect.vue` 與 `PortsEditor.vue` 改用 `UiSelect` 與 `UiInput`，並更新 `PortsEditor.spec.ts` 確認測試通過
- [ ] 2.2 將 `packages/frontend/src/components/EndpointSettings.vue`、`FunctionInspector.vue` 與 `RunDialog.vue` 改用 `UiField`、`UiLabel`、`UiInput`、`UiTextarea`、`UiCheckbox`，並執行 `EndpointSettings.spec.ts` 與 `RunDialog.spec.ts` 確認測試通過
- [ ] 2.3 將 `packages/frontend/src/views/FunctionEditorView.vue`、`ProjectLayout.vue`、`ProjectsView.vue` 與 `TypeEditorView.vue` 改用新表單 Ui 元件，並刪除 `packages/frontend/src/components/formClasses.ts`
- [ ] 2.4 在專案根目錄執行 `npm test`、`npm run lint` 與 `npm run type-check`，確認所有 packages 檢查皆通過且無殘留 `formClasses` 引用
