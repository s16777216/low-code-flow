## Why

`typed-function-ports` 與 `file-driven-projects` 會帶出大量 Editor chrome：port Type badge、相容性 highlighting、Inspector 面板、save conflict 提示、degraded Project banner 等。目前所有樣式都散落在 `packages/frontend` 的 scoped CSS 中，且節點顏色直接 hardcode，沒有共用 token。在這些 UI 大量出現之前，先建立獨立、與 domain 無關的 UI 元件 package，並由它定義統一的樣式規格，可以用 package 依賴方向強制分層，避免 Type／Port／Asset 等 domain 概念滲入通用元件，也讓 canvas 節點與周邊 chrome 共用同一套視覺語言；application 則在這套規格之上做自定義。

## What Changes

- 新增 workspace package `@low-code-flow/ui`（`packages/ui`），作為 domain-agnostic 的 Vue UI 元件庫，並以單一 entry point 統一匯出所有元件與型別；`frontend` 只從該 entry point 匯入。
- `ui` package 以 source-only 形式提供（`exports` 指向 TypeScript／Vue SFC source），由使用端的 Vite 編譯；不建立獨立 build output，也不發佈至 registry。
- 導入 Tailwind CSS v4 作為樣式基礎；`ui` 元件以 utility classes 撰寫樣式。
- `ui` package 定義樣式規格：以 Tailwind theme 表達的 design tokens（色彩、圓角、間距、字級等，含 light／dark 值），同時以 CSS custom properties 與 utility classes 形式提供。規格取代 Tailwind 預設色盤，使色彩只能來自規格或 application 的明確擴充。
- `frontend` 以 `ui` 的樣式規格為基礎自定義：可覆寫既有 token 值，也可擴充 domain 專屬 token（如依 Type root kind 區分的顏色），且不需修改 `ui` package。
- 現有 `packages/frontend/src/assets/base.css` 的語意變數與 reset 由 `ui` 規格與 Tailwind preflight 取代。
- `FunctionNode`、`DefaultEdge` 等手刻 canvas 元件中的 hardcoded 顏色改為引用 tokens；Vue Flow 的 theme 變數對應到 tokens。
- 有互動行為的元件以 Reka UI 為 headless 基礎，外觀由 `ui` package 定義；第一批包含 Dialog 與 Tooltip。行為單純的元件（Button、Badge、Collapsible、Banner）由 `ui` package 自行實作。
- `ui` 元件內建的 icon 使用 `@lucide/vue`，與 `frontend` 共用同一套 icon。
- Dark mode 只跟隨系統色彩偏好；tokens 只有單層語意 token，不定義原始色階。
- 定義分層規則：`ui` 不得依賴 `frontend` 或任何 domain module；props 需要 domain 型別（如 `TypeRef`、`Diagnostic`、`PortDefinition`）的元件留在 `frontend`，並以組合 `ui` 元件的方式實作。
- `vue`、`tailwindcss` 與 `@lucide/vue` 以 peer dependency 宣告；`reka-ui` 是 `ui` 的內部實作依賴，`frontend` 不直接使用 Reka 原件。
- `ui` package 具備自己的 type-check、lint 與 unit test 設定，並與 `frontend` 的 `vue-tsc --build` 串接。
- 本 change 不包含元件預覽工具（如 Histoire），以及 domain-aware 元件（TypeBadge、PortTooltip、DiagnosticsPanel）的實作。

## Capabilities

### New Capabilities

- `ui-component-library`: 定義 domain-agnostic UI 元件 package 的邊界與統一匯出、樣式規格（design tokens）的所有權與 application 端的覆寫／擴充方式、以 headless 基礎實作之互動元件的可及性與行為保證，以及 source-only 的消費方式。

### Modified Capabilities

無；目前尚無既有 OpenSpec capabilities。

## Impact

- 新增 `packages/ui`（package.json、tsconfig、eslint、vitest 設定、元件與樣式規格）。
- `packages/frontend`：新增對 `@low-code-flow/ui`、`tailwindcss`、`@tailwindcss/vite` 的依賴；`vite.config.ts` 加入 Tailwind plugin；`main.css` 改為引入 Tailwind 與 `ui` 樣式規格並定義自定義 tokens；`base.css` 移除或大幅縮減；`FunctionNode.vue`、`DefaultEdge.vue` 改用 tokens。
- 依賴：新增 `tailwindcss`、`@tailwindcss/vite`、`reka-ui`。
- Tailwind preflight 與 Vue Flow 預設樣式並存，需處理 CSS cascade layer 順序，使 utilities 能覆寫 Vue Flow 樣式。
- 工具鏈：`vue-tsc --build` 需透過 project references 涵蓋 `ui`；root workspace 需能執行各 package 的 lint／test。
- 實作順序：先 commit `typed-function-ports` 進行中的前端工作，再實作本 change；之後 `typed-function-ports` 與 `file-driven-projects` 的 Editor UI 以 `ui` 元件與樣式規格為基礎實作。
