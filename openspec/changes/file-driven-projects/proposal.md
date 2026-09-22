## Why

Developer-first workflow definitions should behave like source assets in an Unreal or Unity project: visible on disk, reviewable in Git, editable by both the visual editor and normal development tools, and reproducible without a definition database. A Project boundary and Asset Registry are needed now so the nominal Type and typed Function work can resolve stable definitions without embedding storage assumptions in the execution engine.

## What Changes

- Add a `Project` domain concept represented by a root directory and `flow.project.yaml` manifest.
- Make Project files the source of truth for Type, Function, Code, settings, and test assets; no definition database is required.
- Add an in-memory Project Asset Registry that scans project assets, resolves stable asset IDs to files, computes canonical definition hashes, records dependencies, and reports validation errors.
- Restrict all asset references to the currently open Project. The POC does not support cross-project references, packages, shared libraries, or remote asset registries.
- Reserve engine-owned system Type IDs separately from project-local assets.
- Preserve references across file moves, directory moves, and display-name changes by resolving immutable asset IDs instead of paths.
- Support external file edits through filesystem change detection, incremental reload, dependent revalidation, and editor conflict notification.
- Write editor changes atomically and reject invalid content without silently replacing the last valid in-memory snapshot.
- Allow a Project with asset errors to open in a degraded state for inspection and repair while preventing invalid Functions from executing.
- Keep runtime execution state ephemeral and out of the Project asset model; durable execution history remains outside the POC.

## Capabilities

### New Capabilities

- `file-driven-projects`: Defines Project identity, manifest discovery, authored directory boundaries, lifecycle states, project-local reference scope, settings separation, and file-based source-of-truth behavior.
- `project-asset-registry`: Defines asset discovery, stable identity, ID-to-path resolution, definition hashing, dependency indexing, validation, incremental reload, atomic saves, and change notifications consumed by other capabilities.

### Modified Capabilities

None; there are no archived project capabilities yet.

## Impact

- Backend startup and APIs become scoped to one open Project for the POC.
- Type and Function repositories consume the Project Asset Registry rather than a definition database.
- The visual editor reads and writes Project asset files and must surface external-change conflicts and degraded-state diagnostics.
- Asset definitions require stable IDs, schema versions, canonical serialization, and deterministic hashes.
- File watching, path containment, atomic replacement, duplicate-ID handling, and dependency invalidation become foundational infrastructure.
- Generated indexes and transient files, if any, are disposable and excluded from version control; authored Assets, Project settings, tests, and the Project manifest remain Git-friendly.
- Execution state remains in memory and is not stored alongside Project Assets.
