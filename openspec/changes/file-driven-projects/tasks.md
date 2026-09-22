## 1. Project Core

- [ ] 1.1 Scaffold Project, manifest, registry, filesystem adapter, diagnostics, and test modules, and verify the project typecheck and baseline test suite run successfully
- [ ] 1.2 Implement `flow.project.yaml` parsing with stable identity, schema version, display name, and engine compatibility validation, and verify valid manifests open while missing or incompatible manifests fail with actionable diagnostics
- [ ] 1.3 Implement canonical Project-root discovery and the single-active-Project lifecycle state machine, and verify tests cover open, close, switch, no-active-Project access, and ordered consumer shutdown
- [ ] 1.4 Implement conventional `Assets/`, `ProjectSettings/`, and `Tests/` path handling, and verify only `Assets/` participates in the Asset namespace while shared settings load separately

## 2. Asset Discovery and Identity

- [ ] 2.1 Implement recursive discovery for `*.type.yaml` and Function-directory `function.yaml` manifests, and verify supported manifests are indexed while unrelated files are ignored
- [ ] 2.2 Implement immutable project-local Asset IDs, kind/schema metadata, and `system:*` namespace reservation, and verify tests reject missing, duplicate, changed, or reserved Project identities
- [ ] 2.3 Associate manifest-referenced TypeScript files with their owning Function without creating reusable Code assets, and verify Code changes are attributed to the correct Function
- [ ] 2.4 Implement canonical real-path containment for discovered files, Code references, settings, and future save targets, and verify traversal and symlink escape tests cannot read or write outside allowed Project roots
- [ ] 2.5 Implement Project settings and local-secret separation, and verify shared defaults load while authored manifests cannot persist secret values or personal editor settings

## 3. Registry Resolution and Hashing

- [ ] 3.1 Implement canonical semantic serialization and content hashing for manifests plus normalized Function-owned Code, and verify hashes are independent of absolute Project path, scan order, timestamps, YAML formatting, and line-ending differences where specified
- [ ] 3.2 Implement project-local and system-reference resolution with no fallback to other Projects, packages, shared libraries, or remote registries, and verify missing and project-qualified references produce broken-reference diagnostics
- [ ] 3.3 Implement direct dependency and reverse-dependency indexes, and verify affected-asset queries return all direct and transitive dependents
- [ ] 3.4 Implement dependency-cycle reporting for Type and Function graphs, and verify diagnostics include the complete cycle path and mark affected Functions non-executable
- [ ] 3.5 Implement Merkle-style definition hashes from canonical content and sorted dependency hashes, and verify Type, Child Function, and owned-Code changes deterministically propagate to transitive dependents
- [ ] 3.6 Implement immutable transactional Registry snapshots and atomic publication, and verify concurrent readers never observe partial discovery, resolution, hashing, or validation state

## 4. Validation and Degraded Projects

- [ ] 4.1 Implement Project-wide diagnostics and `ready` versus `degraded` transitions, and verify an invalid asset opens a repairable degraded Project while an invalid root manifest prevents Project Context creation
- [ ] 4.2 Track last-valid parsed representations separately from current disk validity, and verify editor repair data remains available while execution lookup refuses invalid or stale definitions
- [ ] 4.3 Propagate invalid, missing, ambiguous, and cyclic dependency status through reverse dependents, and verify only unaffected Functions remain executable in a degraded Project
- [ ] 4.4 Implement recovery after corrected asset content, and verify a valid reload clears applicable diagnostics, recomputes hashes, and returns the Project to ready when no blocking errors remain

## 5. External File Change Handling

- [ ] 5.1 Implement filesystem watching with event debounce and batch processing, and verify rapid editor/IDE writes produce one consistent Registry reload
- [ ] 5.2 Implement add, modify, delete, and move handling using stable Asset IDs, and verify a delete-plus-create rename preserves identity while a true deletion breaks and invalidates dependents
- [ ] 5.3 Implement dependency-aware incremental reload with full-rescan fallback for watcher overflow, ambiguous events, or manifest changes, and verify both paths produce equivalent Registry snapshots
- [ ] 5.4 Publish Registry change notifications containing previous/current snapshot IDs and changed Asset IDs, and verify subscribed Type, Function, and editor test consumers revalidate exactly after snapshot publication

## 6. Atomic Editor Saves

- [ ] 6.1 Implement asset reads that return current content and content hash, and verify editor clients can use the hash as an optimistic-concurrency token
- [ ] 6.2 Implement pre-save hash comparison, parsing, schema validation, reference validation, and path containment checks, and verify stale or invalid submissions never alter the target file
- [ ] 6.3 Implement same-directory temporary writes, flush, and platform-safe atomic replacement, and verify failure-injection tests preserve the original file at every interrupted stage
- [ ] 6.4 Implement safe cleanup limited to recognizable Project save temporary files, and verify unrelated files are never deleted and stale temp files are recoverably cleaned on Project open
- [ ] 6.5 Trigger Registry reload only after a successful save and return conflict/current-hash diagnostics on stale saves, and verify the visual editor never silently overwrites external changes

## 7. Project and Registry APIs

- [ ] 7.1 Add Project open, close, status, and diagnostics APIs scoped to one active Project, and verify API tests cover ready, degraded, incompatible, switching, and no-active-Project responses
- [ ] 7.2 Add Registry query APIs for assets, resolved definitions, hashes, dependencies, dependents, and diagnostics, and verify consumers cannot query another Project or obtain non-executable last-valid definitions
- [ ] 7.3 Add validated asset read/save APIs using expected content hashes, and verify integration tests cover successful atomic saves, editor conflicts, external edits, and invalid content
- [ ] 7.4 Build minimal Project UI for selecting a root, showing lifecycle state and diagnostics, refreshing after Registry changes, and resolving save conflicts, and verify observable workflows work without a definition database

## 8. Integration and Documentation

- [ ] 8.1 Add a fixture Project containing Type, Function, Function-owned Code, settings, and tests, and verify a clean process reconstructs identical Asset IDs, dependencies, content hashes, and definition hashes solely from files
- [ ] 8.2 Add degraded-Project end-to-end cases for duplicate IDs, missing references, invalid YAML, cycles, and invalid external edits, and verify affected execution lookups are blocked while repair remains possible
- [ ] 8.3 Add filesystem safety and concurrency end-to-end cases for traversal, symlink escape, stale editor save, atomic-write failure, watcher overflow, and Project switching, and verify no out-of-scope file is modified
- [ ] 8.4 Integrate the Registry consumer boundary expected by `typed-function-ports`, and verify it can resolve project-local Type/Function definitions, pin immutable snapshots, and receive dependency change notifications
- [ ] 8.5 Update `docs/poc.md` with the Project layout, file-source-of-truth rules, project-local scope, degraded lifecycle, and ephemeral runtime boundary, and verify terminology agrees with both related OpenSpec changes
- [ ] 8.6 Run the complete lint, typecheck, unit, integration, and end-to-end suites plus `openspec validate file-driven-projects --strict`, and verify all checks pass without definition-database, cross-project, package, or execution-history dependencies
