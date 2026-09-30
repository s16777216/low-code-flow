## Context

本專案尚無 implementation 或 production data。`typed-function-ports` change 已將 Type、Function 與 Code definition resolution 抽象成 Project Asset Registry boundary，並將 Execution state 定義為 ephemeral in-memory state。本設計提供該 boundary，但不實作 typed-port execution semantics。

Project 概念參考 Unreal／Unity 的核心分層：authored assets 與 project settings 可進版本控制；derived indexes、temporary data 與 runtime state 可捨棄並重建。POC 同時只開啟一個 Project，且不支援跨 Project 或 package resolution。

## Goals / Non-Goals

**Goals:**

- 讓完整 definition state 可從 Project files 確定性重建。
- 以 stable asset identity 將 reference 與 file path／display name 解耦。
- 為 Type 與 Function capabilities 提供 immutable、可訂閱的 resolved snapshot。
- 安全協調 visual editor 與 IDE／Git 等外部檔案修改。
- 在個別 asset 損壞時保留可修復的 degraded Project，而不執行 stale 或 invalid definitions。
- 使 definition hashes 對絕對路徑與非語意格式差異穩定。

**Non-Goals:**

- 多 Project 同時開啟、跨 Project references、packages、shared libraries 或 remote registries。
- Definition database、persistent generated index 或必須保存的 cache。
- Durable execution history、runtime recovery、execution logs persistence。
- 通用 virtual filesystem、cloud sync 或多人即時協作。
- 將 Code file 提升為獨立 reusable Asset；Function 仍是唯一 executable reusable unit。
- 自動 merge editor 與外部工具的衝突內容。

## Decisions

### 1. 固定 Project root manifest 與 conventional directories

Project 由 root 的 `flow.project.yaml` 識別：

```yaml
schemaVersion: 1
id: project-order-automation
name: Order Automation
engineVersion: "0.1"

settings:
  runtime: ./ProjectSettings/runtime.yaml
  permissions: ./ProjectSettings/permissions.yaml
```

POC layout：

```text
MyFlowProject/
├── flow.project.yaml
├── Assets/
│   ├── Types/
│   │   └── user.type.yaml
│   └── Functions/
│       └── GetUser/
│           ├── function.yaml
│           └── Nodes/
│               └── fetch-user.ts
├── ProjectSettings/
└── Tests/
```

`Assets/` 是唯一 authored asset root，不開放多 roots 或 search precedence。ProjectSettings 與 Tests 可被版本控制但不進入 Asset ID namespace。固定 conventions 降低 discovery、watching 與 path containment 的複雜度；替代方案是 manifest 任意配置 roots，但 POC 沒有足夠價值抵銷 duplicate resolution 與 precedence 問題。

### 2. Manifest 內嵌 stable identity，不使用 sidecar metadata

Type manifest 使用 `*.type.yaml`；Function 以目錄內 `function.yaml` 表示，Code paths 相對該 manifest 並屬於 Function content。

```yaml
id: type-user
kind: type
name: User
schemaVersion: 1
parentTypeId: system:object
```

Asset ID 是 Project 內唯一、建立後 immutable 的 opaque identifier。Path 與 display name 可變。直接在 manifest 保存 ID 比 Unity-style sidecar `.meta` 更適合目前只有 manifest-based assets 的 POC，可避免 orphan sidecars 與雙檔案 atomicity；若未來要讓任意 binary/file 成為 Asset，再評估 sidecar metadata。

### 3. System IDs 與 Project IDs 使用不同 authority

`system:*` namespace 由 engine 保留，例如：

```text
system:string
system:number
system:date
system:function
system:object
system:boolean
system:array
system:any
```

Project manifest 不得宣告 `system:*` ID。一般 reference 僅包含 `assetId`；resolver 先檢查 reserved namespace，否則只查 active Project Registry。資料模型不預留 `projectId` 或 `packageId` 欄位，以免未實作的跨 scope resolution 滲入 POC。

### 4. 每次開啟都從 files 建立 in-memory Registry

Project open pipeline：

```text
read manifest
    ↓
validate compatibility
    ↓
scan Assets
    ↓
parse manifests and owned code
    ↓
resolve references
    ↓
build dependency graph
    ↓
compute hashes
    ↓
validate
    ↓
publish immutable snapshot
```

不建立 SQLite asset index。若未來 profiling 顯示 scan 過慢，可加可刪除 cache，但 correctness 不能依賴它。Project Context 狀態依序為 `loading`、`indexing`、`validating`，最後進入 `ready` 或 `degraded`；無效 root manifest 在 Context 建立前失敗。

### 5. Registry snapshot 是 transactional read model

```ts
interface AssetRecord {
  assetId: string;
  kind: "type" | "function";
  displayName: string;
  manifestPath: string;
  contentHash: string;
  definitionHash?: string;
  dependencies: string[];
  diagnostics: Diagnostic[];
  resolvedDefinition?: unknown;
}

interface AssetRegistrySnapshot {
  snapshotId: string;
  projectId: string;
  assets: ReadonlyMap<string, AssetRecord>;
  dependents: ReadonlyMap<string, ReadonlySet<string>>;
  diagnostics: readonly Diagnostic[];
}
```

Scanner、resolver 與 validator 在私有 candidate state 工作。完成一個 filesystem event batch 後才原子替換 current snapshot，避免 consumers 看到部分更新。Snapshot object immutable；execution planner 可持有既有 snapshot，即使 Registry 後續 reload。

### 6. Content hash 與 definition hash 分離

`contentHash` 只代表 asset 自身 canonical semantic content：manifest parse 後以 stable key ordering 序列化；Code files 正規化 line endings 後以 path-relative ordered bytes 納入。註解與 YAML formatting 是否影響 hash 依內容類型決定：manifest 使用 parsed semantic form，Code 使用 normalized source bytes。

`definitionHash` 是 Merkle-style hash：

```text
hash(
  asset kind
  + contentHash
  + sorted(direct dependency asset ID + definitionHash)
)
```

Absolute paths、scan order 與 timestamps 不參與。Cycle 或 unresolved dependency 沒有 valid definitionHash，該 asset 與 dependents 標為 invalid。這讓 Type／Child Function 改變能確定性傳播，同時支援 typed execution snapshot pinning。

### 7. Invalid disk state 不得執行 last-valid definition

每個 path 可同時保留 disk diagnostic 與 last-valid parsed representation，後者只供 editor diff／repair。若目前 disk state invalid，Asset record 與 transitive dependents 都標記 non-executable；execution lookup 不回傳 last-valid definition。

這避免 external edit 出錯時偷偷執行舊版本。替代方案是熱重載常見的 last-known-good execution，但使用者難以辨識 disk 與 runtime divergence，不適合 workflow definition POC。

### 8. Filesystem events 合併後做 dependency-aware reload

Watcher 將短時間內的 add/change/delete/rename-like events debounce 成 batch。每個 batch 重新掃描受影響 paths，使用 asset ID 將 delete+create 配對為 move，接著重算 changed assets 及 reverse dependents。若事件模糊、overflow 或涉及 manifest，退回 full rescan；正確性優先於 incremental performance。

Registry 發布後通知 consumers：

```ts
interface RegistryChange {
  previousSnapshotId: string;
  snapshotId: string;
  changedAssetIds: string[];
}
```

### 9. Editor save 使用 optimistic concurrency 與 atomic replacement

Editor read 回傳 asset content 與 `contentHash`。Save request 必須帶 `expectedContentHash`；Backend 在寫入前重新讀取 disk 並比較，避免覆寫 IDE 或 Git checkout 的修改。

通過 conflict、schema、reference 與 containment validation 後，在 target 同目錄建立專用 temporary file、flush，再以 platform-safe atomic replacement 更新正式檔。失敗時移除 temp 並保留原檔；Project open 清理由系統命名且可安全識別的 stale temp files。Windows 實作必須以單一 PowerShell/native filesystem path handling 或 Node filesystem API 完成，不跨 shell 組合 destructive paths。

### 10. 所有 paths 在 real-path containment 後才使用

Project root、Assets root、manifest paths、owned Code files、settings 與 save targets 都先 canonicalize 並解析 symlinks；target 必須位於允許 root。Relative `..` 不是一律禁止，但 resolve 後逃逸即拒絕。New save target 的 parent real path 必須已在 allowed root，避免尚不存在檔案繞過檢查。

### 11. Project Context 提供窄 consumer boundary

```ts
interface ProjectAssetRegistry {
  getSnapshot(): AssetRegistrySnapshot;
  getAsset(assetId: string): AssetRecord | undefined;
  getDependencies(assetId: string): readonly string[];
  getDependents(assetId: string): readonly string[];
  subscribe(listener: (change: RegistryChange) => void): Unsubscribe;
}
```

Type、Function、editor 與 execution modules 只依賴此 read boundary；file parsing、watching 與 save coordination 留在 Project module。Project close 先停止接受 saves，通知 runtime consumers，停止 watcher，最後釋放 Registry snapshot。POC 不嘗試在 Project Context 之間保留 asset objects 或 runtime state。

### 12. Secrets 與 personal settings 不是 Assets

ProjectSettings 只保存可分享的 defaults 與 permission declarations。Secret definitions 可引用 key，但 secret values 來自 environment 或 ignored local settings；個人 editor preferences 同樣不進 authored assets。此 change 只建立 separation boundary，不實作完整 credential manager。

## Risks / Trade-offs

- **[Large Projects 每次 full scan 變慢]** → POC 優先 correctness；以 incremental watcher 減少平時成本，保留未來加入 disposable cache 的空間。
- **[Filesystem watcher 事件遺失或順序不同]** → debounce batch，遇到 overflow／ambiguous rename 時 full rescan，且永遠由 disk 重建 candidate snapshot。
- **[YAML merge 後可 parse 但語意破壞]** → 每次 reload 執行 schema、identity、dependency 與 domain validation，Project 進入 degraded 而非執行錯誤 definitions。
- **[Duplicate IDs 造成引用歧義]** → 不採 path precedence；所有 duplicate records 與 dependents invalid，直到使用者修正。
- **[Atomic replacement 的 platform behavior 不一致]** → temp 與 target 同 volume／directory，封裝 platform adapter，並以 failure-injection tests 驗證原檔保留。
- **[External edit 與 editor save race]** → content-hash compare-and-swap，衝突時拒絕覆寫並要求 reload；POC 不自動 merge。
- **[Symlink 與 path normalization 形成 boundary escape]** → 所有 read/write targets 在操作前以 canonical real paths 驗證 containment。
- **[Last-valid snapshot 可能被誤當可執行版本]** → Registry API 明確區分 repair representation 與 executable resolved definition；invalid disk state 不回傳 executable asset。

## Migration Plan

目前沒有 production definitions 或 database schema，因此無資料 migration。先建立 Project manifest、scanner、Registry snapshot 與 diagnostics，再加入 watcher/save coordination，最後讓 Type／Function modules 改由 Registry boundary 取得 definitions。

現有文件或測試中的 inline JSON definitions 轉為 `Assets/Types/*.type.yaml`、`Assets/Functions/<name>/function.yaml` 與 Function-owned Code files。轉換無法決定 stable identity 時必須明確產生新 ID，不從 file path 永久推導。Rollback 可移除 Project integration 並恢復 fixtures；authored source files不需 destructive migration。
