## 0. 前置

- [ ] 0.1 Commit `typed-function-ports` 進行中的前端工作（`src/domain/`、`FunctionNode.vue`、`DefaultEdge.vue`、`DemoView.vue`、`types/FunctionNode.ts`），並確認 `frontend` 的 test 與 type-check 通過，作為本 change 的起點

## 1. Package 骨架與工具鏈

- [ ] 1.1 建立 `packages/ui`，package name 為 `@low-code-flow/ui`、`private: true`、`type: module`，`exports` 只包含 `.`（`./src/index.ts`）與 `./theme.css`，`vue` 與 `tailwindcss` 為 peer dependency；驗證 `npm install` 後 `node_modules/@low-code-flow/ui` 連結到 workspace
- [ ] 1.2 安裝 `reka-ui` 為 `ui` 的 dependency，將 `@lucide/vue` 宣告為 `ui` 的 peer 與 dev dependency（版本範圍與 `frontend` 相同），並驗證 `npm ls vue` 與 `npm ls @lucide/vue` 都只解析出一個版本
- [ ] 1.3 建立 `ui` 的 `tsconfig.json`（composite）與 `tsconfig.vitest.json`，並讓 `frontend/tsconfig.app.json` reference `ui`；驗證 `frontend` 的 `npm run type-check` 也會檢查 `ui` source
- [ ] 1.4 建立 `ui` 的 eslint、oxlint、prettier、vitest（jsdom）設定，並驗證空 package 的 lint 與 test 可執行
- [ ] 1.5 在 `ui` eslint 加入 `no-restricted-imports`，禁止 `frontend`、`@/*` 與指向 `packages/frontend` 的相對路徑；驗證刻意加入的違規 import 會讓 lint 失敗
- [ ] 1.6 加入讀取 `ui` package manifest 的測試，驗證任何 dependency 欄位都不包含 application package
- [ ] 1.7 驗證 `frontend` 匯入 `@low-code-flow/ui/src/...` 之類的 deep path 時解析失敗
- [ ] 1.8 在 root `package.json` 新增 `lint`、`test`、`type-check` scripts（`--workspaces --if-present`），並驗證可從 root 執行

## 2. Tailwind 導入與 Cascade Layers

- [ ] 2.1 在 `frontend` 安裝 `tailwindcss` 與 `@tailwindcss/vite`，於 `vite.config.ts` 加入 plugin，`main.css` 加入 `@import "tailwindcss"`
- [ ] 2.2 在 `main.css` 最前面宣告 `@layer theme, base, vendor, components, utilities;`，並將三個 Vue Flow CSS import 移入 `vendor` layer
- [ ] 2.3 驗證在 Vue Flow 元素上使用與其預設樣式衝突的 utility 時，utility 生效
- [ ] 2.4 在 `frontend` 與 `ui` 的 prettier 設定加入 `prettier-plugin-tailwindcss`
- [ ] 2.5 手動檢查 preflight 對 DemoView 中 edges、handles、controls、minimap 沒有造成破版

## 3. 樣式規格（ui）

- [ ] 3.1 建立 `ui/src/theme/theme.css`：`@source ".."`、`@theme` 中以 `--color-*: initial` 移除預設色盤並定義 design.md 所列的色彩、圓角、字級、字型 tokens；`@layer base` 中定義 `--z-overlay`、`--z-tooltip` 與 dark mode 色彩覆寫
- [ ] 3.2 加入測試：解析 `theme.css`，驗證 dark 區塊覆寫的色彩 token 集合與 `@theme` 中的色彩 token 集合相同，且沒有以 type／port／asset／execution 命名的 token
- [ ] 3.3 `frontend` 的 `main.css` 引入 `@low-code-flow/ui/theme.css`；刪除 `base.css` 中的 `--vt-c-*`、`--color-*` 定義與 reset，將 `body` 樣式改寫在 `@layer base` 並使用 tokens；驗證 `frontend` 中不再引用 `--vt-c-*`

## 4. Application 自定義（frontend）

- [ ] 4.1 在 `main.css` 新增 `@theme` 區塊，加入第一批 domain tokens（`--color-type-*` 對應各 system root kind）及其 dark 值
- [ ] 4.2 在 `main.css` 的 `@layer base` 將 Vue Flow 的 `--vf-*` 變數對應到 tokens
- [ ] 4.3 驗證覆寫：暫時覆寫 `--color-accent`，確認 `ui` 元件與 `frontend` 元件都改變顏色且 `ui` source 未修改，然後還原
- [ ] 4.4 驗證擴充：確認 `bg-type-string` 等 utility 可用且隨 dark mode 切換

## 5. Canvas 元件改用 Tokens

- [ ] 5.1 將 `FunctionNode.vue` 的背景、邊框、文字、選取外框、port label 色彩、圓角與字級改用 utilities 或 tokens；handle 與 label 定位可保留 scoped CSS；驗證元件中不再有 hex／rgb 色彩值
- [ ] 5.2 將 `DefaultEdge.vue` 的色彩改用 tokens；驗證元件中不再有 hardcoded 色彩值
- [ ] 5.3 確認既有 `FunctionNode` unit test 仍通過

## 6. 互動元件（Reka UI 基礎）

- [ ] 6.1 實作 `UiDialog`（`v-model:open`、`title`、`description`、`dismissible`、default／footer slots，透過 Portal 渲染並使用 `z-(--z-overlay)`），樣式以 utilities 撰寫
- [ ] 6.2 為 `UiDialog` 撰寫測試：開啟時焦點移入、Tab 循環不離開 Dialog、Escape 關閉並還原焦點到觸發元素、`dismissible=false` 時點擊外部不關閉、role 為 dialog 且名稱來自標題
- [ ] 6.3 實作 `UiTooltipProvider` 與 `UiTooltip`（`content`／`#content` slot、`side`、`delay`、預設 collision padding、Portal、`z-(--z-tooltip)`）
- [ ] 6.4 為 `UiTooltip` 撰寫測試：鍵盤 focus 時顯示、觸發元素具 `aria-describedby` 指向內容、Escape 隱藏且焦點留在觸發元素

## 7. 非互動／輕量元件（自建）

- [ ] 7.0 實作 `UiButton`（原生 `<button>`、primary／secondary／ghost／danger variants、`disabled`、`type` 預設 `button`、`focus-visible:` focus ring）；撰寫測試驗證 Enter／Space 觸發 click、disabled 不觸發 click、form 內預設不送出、variant 對應的 class
- [ ] 7.1 實作 `UiBadge`，以 class map 支援 neutral、info、success、warning、danger variants；撰寫測試驗證 variant 對應的 class
- [ ] 7.2 實作 `UiBanner`，同樣 variants，warning／danger 使用 `role="alert"`、其餘 `role="status"`；撰寫測試驗證各 variant 的 role 與 class
- [ ] 7.3 實作 `UiCollapsible`（`v-model:open`，trigger 為 button 並設定 `aria-expanded`、`aria-controls`）；撰寫測試驗證 Enter／Space 切換與 expanded state 更新
- [ ] 7.4 由 `ui/src/index.ts` 匯出所有元件與其 props 型別，並驗證 `frontend` 以錯誤 props 型別使用元件時 type-check 失敗

## 8. 整合與驗證

- [ ] 8.1 在 `frontend` 的 `App.vue` 掛上 `UiTooltipProvider`
- [ ] 8.2 在 `DemoView` 中為 Function Node 的 port label 加上 `UiTooltip`（顯示 port 名稱與 Type，並以 `type-*` token 上色的 `UiBadge` 呈現 Type），並以 `UiButton` 加入一個示範 `UiDialog`（觸發按鈕與 footer 動作都使用 `UiButton`，關閉鈕使用 lucide icon）
- [ ] 8.3 執行 `frontend` production build，驗證只出現在 `ui` 元件的 utilities 存在於輸出 CSS，且 `bg-red-500` 等預設色盤 utility 不存在；若 `@source ".."` 未生效，改在 `main.css` 宣告 `@source` 並更新 design.md
- [ ] 8.4 手動驗證：dev server 執行中修改 `ui` 元件的 template 或 utilities，`frontend` 不需重啟即反映變更
- [ ] 8.5 手動驗證：靠近 viewport 邊緣的 port tooltip 會翻轉或位移且完整顯示；在 canvas 內觸發的 Dialog 不被裁切或遮蓋，且位於 controls 與 minimap 之上
- [ ] 8.6 手動驗證：切換系統 dark mode 後，nodes、edges、controls、minimap、Dialog、Tooltip、Badge、Banner 皆正確變色
- [ ] 8.7 從 root 執行 `lint`、`type-check`、`test` 皆通過，並執行 `openspec validate add-ui-package --strict`
