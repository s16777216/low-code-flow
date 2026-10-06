## Why

POC 的實際部署形態是一台共用伺服器、多人透過視覺編輯器編輯，定義只會經由編輯器寫入，Git 友好只是順帶的好處。先前的 `file-driven-projects` 以檔案作為定義的真相來源，必須付出檔案監聽、原子替換、外部修改衝突與路徑安全等成本，卻換不到對應的價值，而且不適合多人共用的伺服器。`typed-function-ports` 需要一個可解析 Type 與 Function 定義的 Project Asset Registry boundary 才能實作，因此現在以資料庫為基礎重新提供這個 boundary。

## What Changes

- 新增 `Project` 作為容器：一個 Project 內含多個 Type 與 Function，類似 n8n 的 Project；所有引用只限於同一個 Project，不支援跨 Project 引用。
- Type 與 Function 定義（含 Function 擁有的 Code Node 原始碼）以 JSON 文件形式存入 SQLite，經 Drizzle 存取，並隔離在 repository 介面之後；資料表設計與查詢遵守可移植規則，保留之後換成 Postgres 的空間。
- 每個 Asset 具有建立後不可變的文字 ID；`system:*` 命名空間保留給 engine 內建型別。
- 每份定義帶 `revision`，以樂觀鎖處理多人同時編輯：存檔時比對 revision，不符即拒絕並回傳目前 revision。
- 允許儲存語意上尚未完成（invalid）的草稿；系統為每個 Asset 計算 diagnostics 與是否可執行，不可執行狀態沿依賴關係向上傳遞。只有格式錯誤或違反 identity 規則的文件會被拒絕寫入。
- 一律使用最新版本：引用只記錄 Asset ID，不鎖定版本或 hash，不提供發布與版本歷史。執行開始時固定依賴內容的機制由 `typed-function-ports` 負責。
- 新增記憶體中的 Project Asset Registry：啟動時由資料庫建立，每次寫入後以 transactional 方式發布新的 immutable snapshot，並提供依賴與反向依賴查詢與變更通知。
- 被其他 Asset 引用的 Asset 不可刪除；刪除 Project 時一併刪除其所有 Asset。
- 提供 Project 與 Asset 的 HTTP API（Node.js + Fastify），供視覺編輯器使用。
- 不在本 change 範圍：登入與權限、跨 Project 引用、版本與發布、即時協同編輯、執行紀錄持久化、多個 backend 實例、Postgres 的實際實作，以及以 API endpoint 作為 Function 入口（由後續 change 處理）。

## Capabilities

### New Capabilities

- `projects`: 定義 Project 容器的建立、列出、改名與刪除，以及 Project 作為引用範圍與 Registry 範圍的邊界。
- `project-asset-registry`: 定義 Type 與 Function Asset 的儲存與 identity、revision 樂觀鎖、草稿與可執行狀態、依賴索引、immutable snapshot、變更通知，以及提供給 `typed-function-ports` 的 consumer contract。

### Modified Capabilities

無；目前尚無已歸檔的相關 capabilities。

## Impact

- 新增 `packages/backend` 的資料庫層：SQLite、Drizzle schema 與 migrations、repository、Registry、HTTP API。
- 新增依賴：`fastify`、`drizzle-orm`、`drizzle-kit`、SQLite driver。
- `typed-function-ports` 改為依賴本 change 提供的 Registry boundary；其 Type 與 Function Node 的 hash 鎖定改為一律使用最新版本，相關 design、spec 與 tasks 需同步修改。
- 前端之後改由 HTTP API 讀寫 Project 與 Asset，並需處理 revision 衝突提示；Code Node 的編輯改在瀏覽器內以 Monaco 進行（由 `typed-function-ports` 的 Editor 任務處理）。
- 多人同時編輯時，使用者存下的草稿會立即被所有引用者使用；invalid 草稿或 port 變更會讓引用它的 Function 立即無法執行。這是「一律使用最新版本」的已知代價。
