# Glossary

## file-driven-projects

- **Project** — 由 `flow.project.yaml` 識別的自包含創作與解析邊界；POC 同時只開啟一個 Project，且不解析其他 Project。 Aliases: Flow Project、Workflow Project。
- **Project Context** — Backend 對目前 active Project 建立的 runtime scope，擁有 lifecycle state 與目前 Asset Registry，但不保存 durable execution history。 Aliases: Active Project Context。
- **Authored Asset** — 位於 Project `Assets/` 下、由使用者與團隊維護並可進入版本控制的 Type 或 Function definition；生成內容與 runtime state 不屬於 Authored Asset。 Aliases: Project Asset、Source Asset。

## project-asset-registry

- **Asset Registry** — 從目前 Project files 重建的 immutable resolved view，負責 Asset identity、path、hash、dependencies、diagnostics 與 change notifications。 Aliases: Project Asset Registry、Registry。
- **Asset ID** — 寫入 Asset manifest、在單一 Project 內唯一且不可因 rename 或 move 改變的 reference identity。 Aliases: Asset Identity。
- **Definition Hash** — 由 Asset canonical content 與 dependency definition hashes 決定的 deterministic transitive hash，用於 invalidation 與 execution snapshot pinning。 Aliases: Resolved Definition Hash。
- **Degraded Project** — Project manifest 有效但至少一個 Asset 或 dependency 無效的可修復狀態；Editor 可繼續操作，但受影響 Functions 不可執行。 Aliases: Degraded State。
