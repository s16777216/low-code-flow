## Context

目前 monorepo 使用 npm workspaces（`packages/*`），實際有內容的只有 `packages/frontend`（Vue 3 + Vite + Vue Flow）；`backend`、`utils` 仍為空目錄。樣式全部是各元件的 scoped CSS，`base.css` 沿用 Vue scaffold 的 `--vt-c-*`／`--color-*` 變數與 reset，而 `FunctionNode.vue` 直接 hardcode `#fff`、`#222`、`rgb(255, 13, 1)` 等色彩，與 `base.css` 沒有關聯，也不跟隨 dark mode。

`typed-function-ports` 與 `file-driven-projects` 之後會需要 type badge、相容性 highlighting、`any` edge 標記、Inspector、save conflict Dialog、degraded Project banner、port Type tooltip 等 UI。動機與範圍見 `proposal.md`，可觀察行為見 `specs/ui-component-library/spec.md`。

主要約束：

- POC 階段，沒有需要相容的既有 UI 元件或使用者。
- Package 為 workspace 內部使用，不發佈。
- Canvas 節點的幾何、handle 定位屬於 Vue Flow 特定邏輯，不適合抽成通用元件。
- 樣式框架選定 Tailwind CSS v4（CSS-first 設定）。

## Goals / Non-Goals

**Goals:**

- 以 package 依賴方向強制 UI 元件與 domain 分離，並以單一 entry point 對外。
- 由 `ui` 定義統一樣式規格，`frontend` 在其上覆寫與擴充，chrome 與 canvas 共用視覺語言並支援 dark mode。
- 以最少自建行為取得可靠的 Dialog 與 Tooltip（focus 管理、定位、可及性）。
- 開發體驗與單一 package 相同：無額外 build step、HMR 有效、type-check 跨 package。

**Non-Goals:**

- 元件預覽／文件工具（Histoire、Storybook）。
- Domain-aware 元件（TypeBadge、PortTooltip、DiagnosticsPanel、Asset tree）；由後續 Editor 相關 change 實作。
- 手動 theme 切換、多品牌 theming。
- 發佈到 npm registry 或提供 dist build。
- Per-instance 的 class 衝突合併（如 `tailwind-merge`）；見決策 9。
- Tree、Combobox、Menu 等第一批以外的互動元件；需要時再以同樣模式加入。

## Decisions

### 1. Package 命名與位置

建立 `packages/ui`，package name 為 `@low-code-flow/ui`，`private: true`。`frontend` 以 `"@low-code-flow/ui": "*"` 依賴，由 npm workspaces 連結。

### 2. Source-only exports 與統一匯出

```json
{
  "name": "@low-code-flow/ui",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./src/theme/theme.css"
  },
  "peerDependencies": {
    "vue": "^3.5.0",
    "tailwindcss": "^4.0.0",
    "@lucide/vue": "<same range as frontend>"
  },
  "dependencies": {
    "reka-ui": "<pinned at install>"
  }
}
```

只有兩個公開路徑：`.`（元件與型別）與 `./theme.css`（樣式規格）。`exports` map 會讓其他 subpath 在解析時失敗，因此 `frontend` 無法 deep import 內部檔案。

`frontend` 的 Vite 經由 workspace symlink 解析 `.ts`／`.vue` source 並套用 `@vitejs/plugin-vue`，不需要 dist，也保有 HMR。替代方案是 Vite library mode 產生 dist + `.d.ts`，但會多出 watch/build 流程且沒有發佈需求。

`reka-ui` 放 `dependencies`：它是 `ui` 的實作細節，`frontend` 不應直接使用 Reka 原件。`vue` 必須是 peer，確保只有一份 Vue runtime。`tailwindcss` 是 peer，因為 `theme.css` 的 `@theme` 語法由使用端的 Tailwind 處理，`ui` 本身不產生 CSS。`@lucide/vue` 是 peer：`ui` 內建 icon（Dialog 關閉鈕、Collapsible 箭頭）使用 lucide，而 `frontend` 已依賴它，宣告為 peer 可確保兩邊共用同一份，icon 風格也一致。替代方案是 inline SVG 或由 slot 傳入，但要自行維護 SVG，而且 `frontend` 本來就用 lucide。

### 3. `ui` 內部不使用 path alias

`ui` source 之間一律使用相對路徑 import。若使用 `@/` 之類的 alias，在 `frontend` 的 Vite 編譯時會被解析成 `frontend/src`，造成錯誤或靜默地跨越邊界。這也讓 lint 規則可以單純禁止 `@/*`。

### 4. 邊界以 lint 與 manifest 檢查強制

- `ui` 的 ESLint 設定加入 `no-restricted-imports`，禁止 `frontend`、`@/*` 與任何 `packages/frontend` 相對路徑。
- `ui` 的 unit test 讀取 manifest，確保 dependencies／peer／dev 都不包含 application package。
- 判斷元件該放哪裡：**公開 API 需要 domain 型別就留在 `frontend`**。例如 `UiBadge` 接收 `variant` 與文字；`TypeBadge` 在 `frontend` 依 `TypeRef.rootKind` 決定顏色並渲染 `UiBadge`。

### 5. 樣式規格：`ui/src/theme/theme.css`

樣式規格以 Tailwind v4 `@theme` 撰寫。`@theme` 中的變數會同時輸出為 `:root` 上的 CSS custom properties 並產生對應 utilities（`--color-danger` → `bg-danger`、`text-danger`、`border-danger`…），符合 spec「token 同時是變數與 utility」。

```css
/* packages/ui/src/theme/theme.css */
@source "..";                       /* 讓使用端掃描 ui/src 中使用的 utilities */

@theme {
  --color-*: initial;               /* 移除 Tailwind 預設色盤 */

  --color-bg: …;          --color-bg-soft: …;       --color-bg-mute: …;
  --color-fg: …;          --color-fg-muted: …;      --color-heading: …;
  --color-border: …;      --color-border-strong: …;
  --color-accent: …;      --color-accent-fg: …;
  --color-selection: …;
  --color-info: …;        --color-success: …;
  --color-warning: …;     --color-danger: …;

  --radius-sm: …;         --radius-md: …;           --radius-lg: …;
  --text-xs: …;           --text-sm: …;             --text-base: …;
  --font-sans: …;
}

@layer base {
  :root {
    --z-overlay: 50;
    --z-tooltip: 60;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg: …;      /* 只覆寫色彩 token 的值 */
      …
    }
  }
}
```

要點：

- **移除預設色盤**（`--color-*: initial`）：讓「顏色只能來自規格或明確擴充」由框架保證，而不是靠 code review。間距（`--spacing`）與其餘預設 scale 保留 Tailwind 預設，只覆寫需要的部分。
- **不加前綴**：Vue Flow 使用 `--vf-*`，與 Tailwind 的 `--color-*` 等 namespace 不衝突；原 scaffold 的 `--color-*` 會被移除，不再有重名。加前綴會讓 utilities 變成 `bg-ui-accent`，反而降低可讀性。
- **Dark mode 只換變數值**：utilities 預設以 `var(--color-*)` 引用 token（不使用 `@theme inline`），所以覆寫 `:root` 變數即可切換，元件不需寫 `dark:` variant。
- **z-index 不放進 `@theme`**：Tailwind v4 沒有 z-index theme namespace，以一般 custom properties 提供，使用時寫 `z-(--z-overlay)`。
- **`@source ".."`** 寫在 `ui` 自己的 `theme.css`，路徑相對於該檔案，因此 `frontend` 只要 import 規格就會自動掃描 `ui/src`，不需要知道 `ui` 的目錄結構。實作時須驗證 production build 包含只出現在 `ui` 的 utilities。
- `theme.css` 不 `@import "tailwindcss"`，避免使用端產生重複的 Tailwind 輸出。

### 6. Application 自定義：`frontend/src/assets/main.css`

```css
@import "tailwindcss";
@import "@low-code-flow/ui/theme.css";

@layer vendor {                         /* 見決策 7 */
  @import "@vue-flow/core/dist/style.css";
  @import "@vue-flow/core/dist/theme-default.css";
  @import "@vue-flow/controls/dist/style.css";
}

@theme {
  /* 覆寫規格 */
  --color-accent: …;

  /* 擴充 domain tokens */
  --color-type-string: …;
  --color-type-number: …;
  --color-type-any: …;
}

@layer base {
  @media (prefers-color-scheme: dark) {
    :root { --color-type-string: …; … }
  }

  :root {                               /* Vue Flow 外觀對應到 tokens */
    --vf-node-bg: var(--color-bg);
    --vf-node-text: var(--color-fg);
    --vf-connection-path: var(--color-border-strong);
    --vf-handle: var(--color-fg-muted);
  }
}
```

`frontend` 的 `@theme` 出現在 `ui` 規格之後，同名變數後者覆寫前者；新名稱則自動產生 utilities。Domain tokens（`type-*`、`port-*`、`execution-*`）只能出現在這裡。

**覆寫規格內的色彩 token 時，light 與 dark 都要各覆寫一次。** `ui` 的 dark 值寫在 `@layer base`，順序晚於 `@theme` 所在的 `theme` layer，因此只覆寫 `@theme` 時，dark mode 仍會使用 `ui` 的值（以覆寫 `--color-accent` 實測：light 變了、dark 沒變）。Dark 覆寫須與 `ui` 一樣寫在 `@layer base` 的 `prefers-color-scheme: dark` 區塊內，且出現在 `ui` 規格之後。此限制只影響「覆寫既有色彩 token」；新增的 domain tokens 本來就同時定義兩組值。

`base.css` 的 reset 與 Tailwind preflight 重複，予以移除；`body` 字型、背景、文字色改寫在 `@layer base`，以 tokens 表達。

### 7. Cascade layers 與 Vue Flow

Tailwind v4 將 preflight 放在 `@layer base`、utilities 放在 `@layer utilities`。未分層（unlayered）的 CSS 永遠優先於任何 layer，因此若照現狀直接 import Vue Flow 的 CSS，utilities 無法覆寫 Vue Flow 的預設樣式。

解法是把 Vue Flow CSS 放入 `vendor` layer，並明確宣告順序：

```css
@layer theme, base, vendor, components, utilities;
```

如此 Vue Flow 會覆寫 preflight（保留其必要的 SVG／定位樣式），而 utilities 能覆寫 Vue Flow。宣告須出現在 `main.css` 最前面，實作時確認與 Tailwind 自身的 layer 宣告一致。

需要手動檢查的 preflight 影響：`svg { display: block }`、`img, svg { vertical-align: middle }`、`* { border: 0 solid }` 對 edges、handles、minimap、controls 的影響。

### 8. 元件清單與實作基礎

| 元件 | 基礎 | 說明 |
|---|---|---|
| `UiDialog` | Reka `Dialog*` | `v-model:open`、`title`、`description`、`dismissible`（false 時攔截 pointer-down-outside）、default／footer slots |
| `UiTooltip` | Reka `Tooltip*` | `content` 或 `#content` slot、`side`、`delay`；預設 collision padding |
| `UiTooltipProvider` | Reka `TooltipProvider` | 由 app root 包一次，統一 delay 行為 |
| `UiButton` | 自建 | `variant: primary \| secondary \| ghost \| danger`、`disabled`、`type` 預設 `button`；以 `focus-visible:` 顯示 focus ring |
| `UiBadge` | 自建 | `variant: neutral \| outline \| info \| success \| warning \| danger`；`outline` 只有框線，邊框與文字色來自 `currentColor`，供 application 以 `text-*` 指定顏色（如 Type 顏色），避免與 variant 內建色彩 utility 競爭 |
| `UiBanner` | 自建 | 同 variants；warning／danger 使用 `role="alert"`，其餘 `role="status"` |
| `UiCollapsible` | 自建 | `v-model:open`；trigger 為 `<button>`，設定 `aria-expanded`、`aria-controls` |

元件以 `Ui` 前綴命名，避免與原生元素或 `frontend` 的 domain 元件撞名，並全部由 `ui/src/index.ts` 匯出。

樣式以 template 中的 utility classes 撰寫。Variants 以 `Record<Variant, string>` 的 class map 表達，不引入 `class-variance-authority`；utilities 無法表達的少數情況（例如 Reka 的 `data-state` 動畫）使用 Tailwind 的 `data-[state=open]:` variant，仍不需 scoped CSS。

Button 與 Collapsible 不使用 Reka：Button 直接使用原生 `<button>`；Collapsible 的行為只有一個 button 與 `aria-expanded`。自建比引入抽象更簡單，符合「只有行為成本高的元件才用 headless 庫」的原則。Dialog 的 footer 由使用端放入 `UiButton`，`UiDialog` 本身不內建動作按鈕。

第一版只提供單一尺寸；Editor chrome 需要更緊湊的尺寸時，再加入 `size` prop。

### 9. 自定義的兩個層級

- **全域自定義**：一律透過 token 覆寫／擴充（決策 6）。這是 spec 要求的機制。
- **單一實例調整**：`ui` 元件允許 `class` fallthrough，但僅用於版面（margin、width、flex 等）。外觀變化應透過 props（如 `variant`）或 tokens。

不做 class 衝突合併：當使用端傳入的 utility 與元件內部 utility 衝突（如兩個 `bg-*`），結果取決於 CSS 產生順序，而不是 class 順序。若之後確實需要外觀層級的 per-instance 覆寫，再評估引入 `tailwind-merge`。

### 10. Overlay 層級與 Portal

Dialog 與 Tooltip 透過 Reka 的 Portal 渲染到 `body`，避免被 Vue Flow viewport 的 `overflow: hidden` 與 transform 影響（transform 會建立新的 containing block，使 `position: fixed` 失效）。z-index 使用 `z-(--z-overlay)`／`z-(--z-tooltip)`，數值需高於 Vue Flow controls 與 minimap。

### 11. Canvas 元件

`FunctionNode.vue`、`DefaultEdge.vue` 的色彩、邊框、圓角、字級改用 utilities 或 `var(--color-*)`。Handle 定位、label 絕對定位等與 Vue Flow DOM 結構緊密相關的幾何樣式可留在 scoped CSS，但其中不得出現 hardcoded 色彩值。Vue Flow 會在 Handle 上加入自己的 class，若 utilities 需覆寫其樣式，依賴決策 7 的 layer 順序。

### 12. TypeScript 與工具鏈

- `frontend/vite.config.ts` 加入 `@tailwindcss/vite` plugin。
- `ui/tsconfig.json` 採 `@vue/tsconfig/tsconfig.dom.json`，`composite: true`；另有 `tsconfig.vitest.json` 處理測試。
- `frontend/tsconfig.app.json` 加入 `references` 指向 `../ui`，讓 `vue-tsc --build` 一併檢查。
- `ui` 擁有自己的 `eslint.config.ts`、`vitest.config.ts`（jsdom）、`.oxlintrc.json`。設定先複製 `frontend` 的版本再加上邊界規則；抽出共用 config package 留到第三個前端類 package 出現時再做。
- `ui` 的 vitest 不處理 Tailwind；元件測試只驗證行為與 class／attribute，不驗證計算後的樣式。
- Root `package.json` 新增 `lint`、`test`、`type-check` scripts，以 `npm run <script> --workspaces --if-present` 執行各 package。
- 建議安裝 Tailwind CSS IntelliSense 與 `prettier-plugin-tailwindcss`（class 排序）；後者加入 `frontend` 與 `ui` 的 prettier 設定。

### 13. 測試策略

- 行為測試以 `@vue/test-utils` + jsdom：Dialog 的 focus trap、Escape 關閉、focus restore、`dismissible=false`；Tooltip 的 focus 顯示、Escape 隱藏、`aria-describedby`；Collapsible 的鍵盤切換與 `aria-expanded`；Banner 的 role；Badge／Banner variant 對應的 class。
- 樣式規格測試：解析 `theme.css`，確認 dark 區塊覆寫的色彩 token 集合與 `@theme` 中的色彩 token 集合相同，避免 dark mode 遺漏；並確認沒有 domain 命名的 token。
- Build 層級驗證：`frontend` production build 後，確認只出現在 `ui` 的 utility 存在於輸出 CSS，且預設色盤 utility（如 `bg-red-500`）不存在。
- Viewport collision、Portal 疊層、cascade layer 覆寫與 dark mode 在 jsdom 中無法可靠驗證，改在 `DemoView` 手動檢查並記錄於 tasks。

## Risks / Trade-offs

- **[Source-only 讓 `ui` 綁定使用端必須能編譯 Vue SFC 與 Tailwind]** → 目前唯一使用端就是 Vite + Vue + Tailwind；若未來需要給其他環境使用，再加 library build。
- **[`@source` 寫在被 import 的 CSS 中，路徑解析行為需驗證]** → tasks 中以 production build 驗證；若不如預期，退回在 `frontend` 的 `main.css` 宣告 `@source "../../../ui/src"`。
- **[移除預設色盤後，第三方範例（如 shadcn-vue）的 class 無法直接使用]** → 這正是目的；移植範例時改用規格 tokens。
- **[Preflight 與 Vue Flow 預設樣式衝突]** → Vue Flow CSS 放入 `vendor` layer 並在 DemoView 檢查 edges、handles、controls、minimap。
- **[Per-instance class 衝突結果不直覺]** → 以決策 9 限制 `class` 用途；需要時再評估 `tailwind-merge`。
- **[工具設定在兩個 package 重複]** → 先接受重複；出現第三個 package 時抽出共用 config。
- **[Reka UI 版本升級可能改變 API 或 DOM 結構]** → `frontend` 不直接使用 Reka；所有使用集中在 `ui` 的少數 wrapper。
- **[npm workspaces hoisting 造成兩份 Vue]** → `vue` 只作為 `ui` 的 peer 與 devDependency，驗證時確認 `npm ls vue` 只解析出一個版本。
- **[Tokens 數量過早定型]** → 第一版只放目前元件與節點實際用到的 tokens；新增 token 是非破壞性變更。

## Migration Plan

0. 先 commit `typed-function-ports` 進行中的前端工作（`src/domain/`、`FunctionNode.vue`、`DefaultEdge.vue`、`DemoView.vue` 等），避免與步驟 4 改到同一批檔案而產生衝突。本 change 完成後，再繼續 `typed-function-ports` 的 Editor UI。
1. 建立 `packages/ui` 骨架與工具鏈，確認 lint、type-check、test 在空 package 上可執行。
2. 在 `frontend` 安裝並設定 Tailwind，建立 layer 順序並將 Vue Flow CSS 移入 `vendor` layer，確認現有畫面未損壞。
3. 加入 `ui` 樣式規格並由 `frontend` 引入；移除 `base.css` 中的 scaffold 變數與 reset；加入 Vue Flow 外觀對應與第一批 domain tokens。
4. 將 `FunctionNode.vue`、`DefaultEdge.vue` 的 hardcoded 色彩改為 tokens。
5. 加入各元件與測試。
6. 在 `DemoView` 使用 Tooltip（port Type）與一個示範 Dialog，進行手動驗證。

此 change 不涉及資料或 API。Rollback 為移除 `packages/ui` 與 Tailwind 相關依賴、還原 `frontend` 的 CSS。
