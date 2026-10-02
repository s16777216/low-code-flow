## 0. 前置

- [x] 0.1 Commit `typed-function-ports` 進行中的前端工作（`src/domain/`、`FunctionNode.vue`、`DefaultEdge.vue`、`DemoView.vue`、`types/FunctionNode.ts`），並確認 `frontend` 的 test 與 type-check 通過，作為本 change 的起點

## 1. Package 骨架與工具鏈

- [x] 1.1 建立 `packages/ui`，package name 為 `@low-code-flow/ui`、`private: true`、`type: module`，`exports` 只包含 `.`（`./src/index.ts`）與 `./theme.css`，`vue` 與 `tailwindcss` 為 peer dependency；驗證 `npm install` 後 `node_modules/@low-code-flow/ui` 連結到 workspace
- [x] 1.2 安裝 `reka-ui` 為 `ui` 的 dependency，將 `@lucide/vue` 宣告為 `ui` 的 peer 與 dev dependency（版本範圍與 `frontend` 相同），並驗證 `npm ls vue` 與 `npm ls @lucide/vue` 都只解析出一個版本
- [x] 1.3 建立 `ui` 的 `tsconfig.json`（composite）與 `tsconfig.vitest.json`，並讓 `frontend/tsconfig.app.json` reference `ui`；驗證 `frontend` 的 `npm run type-check` 也會檢查 `ui` source
- [x] 1.4 建立 `ui` 的 eslint、oxlint、prettier、vitest（jsdom）設定，並驗證空 package 的 lint 與 test 可執行
- [x] 1.5 在 `ui` eslint 加入 `no-restricted-imports`，禁止 `frontend`、`@/*` 與指向 `packages/frontend` 的相對路徑；驗證刻意加入的違規 import 會讓 lint 失敗
- [x] 1.6 加入讀取 `ui` package manifest 的測試，驗證任何 dependency 欄位都不包含 application package
- [x] 1.7 驗證 `frontend` 匯入 `@low-code-flow/ui/src/...` 之類的 deep path 時解析失敗
- [x] 1.8 在 root `package.json` 新增 `lint`、`test`、`type-check` scripts（`--workspaces --if-present`），並驗證可從 root 執行

## 2. Tailwind 導入與 Cascade Layers

- [x] 2.1 在 `frontend` 安裝 `tailwindcss` 與 `@tailwindcss/vite`，於 `vite.config.ts` 加入 plugin，`main.css` 加入 `@import "tailwindcss"`
- [x] 2.2 在 `main.css` 最前面宣告 `@layer theme, base, vendor, components, utilities;`，並將三個 Vue Flow CSS import 移入 `vendor` layer
- [x] 2.3 驗證在 Vue Flow 元素上使用與其預設樣式衝突的 utility 時，utility 生效
- [x] 2.4 在 `frontend` 與 `ui` 的 prettier 設定加入 `prettier-plugin-tailwindcss`
- [x] 2.5 手動檢查 preflight 對 DemoView 中 edges、handles、controls、minimap 沒有造成破版

## 3. 樣式規格（ui）

- [x] 3.1 建立 `ui/src/theme/theme.css`：`@source ".."`、`@theme` 中以 `--color-*: initial` 移除預設色盤並定義 design.md 所列的色彩、圓角、字級、字型 tokens；`@layer base` 中定義 `--z-overlay`、`--z-tooltip` 與 dark mode 色彩覆寫
- [x] 3.2 加入測試：解析 `theme.css`，驗證 dark 區塊覆寫的色彩 token 集合與 `@theme` 中的色彩 token 集合相同，且沒有以 type／port／asset／execution 命名的 token
- [x] 3.3 `frontend` 的 `main.css` 引入 `@low-code-flow/ui/theme.css`；刪除 `base.css` 中的 `--vt-c-*`、`--color-*` 定義與 reset，將 `body` 樣式改寫在 `@layer base` 並使用 tokens；驗證 `frontend` 中不再引用 `--vt-c-*`

## 4. Application 自定義（frontend）

- [x] 4.1 在 `main.css` 新增 `@theme` 區塊，加入第一批 domain tokens（`--color-type-*` 對應各 system root kind）及其 dark 值
- [x] 4.2 在 `main.css` 的 `@layer base` 將 Vue Flow 的 `--vf-*` 變數對應到 tokens
- [x] 4.3 驗證覆寫：暫時覆寫 `--color-accent`（light 與 dark 各一次），確認 `ui` 元件與 `frontend` 元件都改變顏色且 `ui` source 未修改，然後還原
- [x] 4.4 驗證擴充：確認 `text-type-string` 等 `type-*` utility 可用且隨 dark mode 切換

## 5. Canvas 元件改用 Tokens

- [x] 5.1 將 `FunctionNode.vue` 的背景、邊框、文字、選取外框、port label 色彩、圓角與字級改用 utilities 或 tokens；handle 與 label 定位可保留 scoped CSS；驗證元件中不再有 hex／rgb 色彩值
- [x] 5.2 將 `DefaultEdge.vue` 的色彩改用 tokens；驗證元件中不再有 hardcoded 色彩值
- [x] 5.3 確認既有 `FunctionNode` unit test 仍通過

Sections 0–5 verification (2026-10-02): root `npm test` (frontend 14 tests, ui 3 tests), `npm run lint`, and `npm run type-check` pass. Frontend production build passes. Workspace link and single Vue/Lucide versions verified. Deliberate UI → frontend imports fail ESLint; deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`; an intentional UI source type error fails frontend type-check (probe removed). Tailwind compilation verifies domain utilities, dark overrides, vendor layering, UI source registration, and default palette removal. Items 2.3, 2.5, 4.3, and 4.4 were verified afterwards in headless Chrome (2026-10-02): in the production build, `bg-danger` overrides vendor-layer backgrounds on `.vue-flow__node-default` and `.vue-flow__controls-button`; 7 nodes, 5 edges, 16 handles, minimap (7 nodes) and 4 controls buttons render in light and dark with no layout breakage (handles measure 20px because fit-view zoom is 1.25 on 16px CSS); all 8 `text-type-*` utilities resolve to their light and dark token values; overriding `--color-accent` changes the UI primary button while `packages/ui` stays untouched, but dark mode needs a second override in `@layer base` (see design.md decision 6).

## 6. 互動元件（Reka UI 基礎）

- [x] 6.1 實作 `UiDialog`（`v-model:open`、`title`、`description`、`dismissible`、default／footer slots，透過 Portal 渲染並使用 `z-(--z-overlay)`），樣式以 utilities 撰寫
- [x] 6.2 為 `UiDialog` 撰寫測試：開啟時焦點移入、Tab 循環不離開 Dialog、Escape 關閉並還原焦點到觸發元素、`dismissible=false` 時點擊外部不關閉、role 為 dialog 且名稱來自標題
- [x] 6.3 實作 `UiTooltipProvider` 與 `UiTooltip`（`content`／`#content` slot、`side`、`delay`、預設 collision padding、Portal、`z-(--z-tooltip)`）
- [x] 6.4 為 `UiTooltip` 撰寫測試：鍵盤 focus 時顯示、觸發元素具 `aria-describedby` 指向內容、Escape 隱藏且焦點留在觸發元素

## 7. 非互動／輕量元件（自建）

- [x] 7.0 實作 `UiButton`（原生 `<button>`、primary／secondary／ghost／danger variants、`disabled`、`type` 預設 `button`、`focus-visible:` focus ring）；撰寫測試驗證 Enter／Space 觸發 click、disabled 不觸發 click、form 內預設不送出、variant 對應的 class
- [x] 7.1 實作 `UiBadge`，以 class map 支援 neutral、info、success、warning、danger variants；撰寫測試驗證 variant 對應的 class
- [x] 7.2 實作 `UiBanner`，同樣 variants，warning／danger 使用 `role="alert"`、其餘 `role="status"`；撰寫測試驗證各 variant 的 role 與 class
- [x] 7.3 實作 `UiCollapsible`（`v-model:open`，trigger 為 button 並設定 `aria-expanded`、`aria-controls`）；撰寫測試驗證 Enter／Space 切換與 expanded state 更新
- [x] 7.4 由 `ui/src/index.ts` 匯出所有元件與其 props 型別，並驗證 `frontend` 以錯誤 props 型別使用元件時 type-check 失敗

## 8. 整合與驗證

- [x] 8.1 在 `frontend` 的 `App.vue` 掛上 `UiTooltipProvider`
- [x] 8.2 在 `DemoView` 中為 Function Node 的 port label 加上 `UiTooltip`（顯示 port 名稱與 Type，並以 `type-*` token 上色的 `UiBadge` 呈現 Type），並以 `UiButton` 加入一個示範 `UiDialog`（觸發按鈕與 footer 動作都使用 `UiButton`，關閉鈕使用 lucide icon）
- [x] 8.3 執行 `frontend` production build，驗證只出現在 `ui` 元件的 utilities 存在於輸出 CSS，且 `bg-red-500` 等預設色盤 utility 不存在；若 `@source ".."` 未生效，改在 `main.css` 宣告 `@source` 並更新 design.md
- [x] 8.4 手動驗證：dev server 執行中修改 `ui` 元件的 template 或 utilities，`frontend` 不需重啟即反映變更
- [x] 8.5 手動驗證：靠近 viewport 邊緣的 port tooltip 會翻轉或位移且完整顯示；在 canvas 內觸發的 Dialog 不被裁切或遮蓋，且位於 controls 與 minimap 之上
- [x] 8.6 手動驗證：切換系統 dark mode 後，nodes、edges、controls、minimap、Dialog、Tooltip、Badge、Banner 皆正確變色
- [x] 8.7 從 root 執行 `lint`、`type-check`、`test` 皆通過，並執行 `openspec validate add-ui-package --strict`

Section 6–8 verification (2026-10-02): `ui/src/index.ts` now exports all seven components and their public props types; a deliberate wrong-variant prop on `UiButton` in a frontend probe file failed `vue-tsc --build` as expected, then the probe was removed and type-check was re-confirmed clean. `App.vue` mounts `UiTooltipProvider` once at the root. `FunctionNode.vue` wraps each port label in `UiTooltip`, showing the port name plus a `UiBadge` colored via a static `PrimitiveType -> class` map (`text-type-*`/`border-type-*`, required for Tailwind's static content scan — a template-literal class name would not have been picked up). `DemoView.vue` adds a `UiButton`-triggered `UiDialog` (Panel overlay) with `UiButton` footer actions; the dialog's close button uses `UiDialog`'s built-in lucide `X` icon. `FunctionNode.spec.ts` was updated to mount under `UiTooltipProvider` (required by `TooltipRoot`) and to assert the new handle text (name only, type moved into the tooltip). Root `npm run lint`, `npm run type-check`, and `npm run test` all pass (ui: 31 tests; frontend: 14 tests). `frontend` production build succeeds; inspecting the built CSS confirms `text-type-*`/`border-type-*` and ui-only utilities (e.g. Dialog's `max-h-[calc(100vh-2rem)]`, Button's `focus-visible:outline-accent`) are present, and no default-palette utility (`bg-red-500` or any `bg|text|border-(red|blue|green|gray|slate|zinc|yellow|purple|pink|indigo)-*`) appears — `ui`'s own `@source ".."` is sufficient; no change to `main.css` or design.md was needed. `openspec validate add-ui-package --strict` passes. `npm run dev` starts cleanly with no errors. 8.4/8.5/8.6 remain unchecked — they require interactive browser verification (HMR, tooltip viewport-edge collision, dark-mode switching) that this worker could not perform; the user should verify these manually.

Sections 8.4–8.6 verification (2026-10-02, headless Chrome against the Vite dev server): editing `UiButton.vue` to use a utility that appeared nowhere else (`bg-info`) updated the rendered button in ~0.1 s without a page reload, and restoring the file reverted it the same way. A port tooltip requested on the left side at the viewport edge flipped to the right and stayed fully inside the viewport. The Dialog overlay covered the minimap and controls, Escape closed it and returned focus to the trigger, and the dialog stayed inside the viewport. A temporary gallery (removed afterwards) rendered every Button/Badge/Banner/Collapsible/Dialog variant in light and dark: all text/background pairs measured at contrast ≥ 4.5 (min 4.76 light, 6.91 dark). This surfaced one defect, fixed here: the Dialog overlay used `bg-fg/50`, which in dark mode lightened the page; it now uses a dedicated `--color-overlay` token with light and dark values.
