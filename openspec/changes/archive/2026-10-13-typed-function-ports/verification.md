# Verification: typed-function-ports

Verified on 2026-10-13 against implementation commit `0f52b58`.

## Assessment

Ready to archive, with two non-blocking scenario-coverage warnings below.
No missing requirement implementation or architectural contradiction was found.
Implementation mapping is based on code inspection and the existing tests; it is
not a claim that every specification scenario has a dedicated automated test.

| Dimension | Result |
| --- | --- |
| Completeness | 42/42 tasks complete; implementation evidence for all 21 requirements |
| Correctness | Nominal typing, projection, validation, scheduling, atomic outputs and retention covered by unit/integration/API end-to-end tests |
| Coherence | Registry supplies project-local definitions; the engine uses an execution-time snapshot; Runner handles raw values; execution traces remain in memory |

## Requirement mapping

Paths below are relative to `packages/backend/src/` unless prefixed otherwise.

| Capability / requirement | Implementation | Automated evidence |
| --- | --- | --- |
| nominal-type-system / System base types | `domain/types.ts`, `domain/validator.ts` | `domain/types.spec.ts`, `domain/validator.spec.ts` |
| Single acyclic inheritance | `domain/types.ts` | `domain/types.spec.ts`, `domain/validator.spec.ts` |
| Nominal assignability | `domain/types.ts`, `domain/values.ts` | `domain/types.spec.ts`, `domain/values.spec.ts`, `engine/engine.spec.ts` |
| Type definition constraints | `domain/types.ts` | `domain/types.spec.ts` |
| Typed runtime values | `domain/values.ts`, `engine/engine.ts` | `domain/values.spec.ts`, `engine/engine.spec.ts` |
| External input typing | `engine/engine.ts`, `api.ts` | `engine/engine.spec.ts`, `api-engine.spec.ts`, `e2e.spec.ts` |
| Explicit type construction and conversion | `domain/values.ts`, `engine/engine.ts` | `domain/values.spec.ts`, `e2e.spec.ts` |
| Serializable date and function values | `domain/values.ts`, `engine/runner-child.ts` | `domain/values.spec.ts`, `engine/runner.spec.ts` |
| Stable Type references | `registry.ts`, `engine/engine.ts` | `domain/validator.spec.ts`, `api-engine.spec.ts`; see warning 1 |
| typed-function-ports / Multiple named typed ports | `domain/functions.ts` | `domain/functions.spec.ts`; frontend `PortsEditor.spec.ts` |
| Function boundary projection | `domain/functions.ts` | `domain/functions.spec.ts`; frontend `flow.spec.ts` |
| Port-to-port edges | `domain/functions.ts` | `domain/functions.spec.ts`, `e2e.spec.ts`; frontend `connection.spec.ts` |
| Input connection cardinality and output fan-out | `domain/functions.ts`, `engine/engine.ts` | `domain/functions.spec.ts`, `e2e.spec.ts` |
| Function Node signature projection | `domain/functions.ts`, `api.ts` | `domain/functions.spec.ts`, `api-engine.spec.ts`, `store.spec.ts` |
| Node readiness by input ports | `engine/engine.ts` | `engine/engine.spec.ts`, `e2e.spec.ts` |
| Atomic required outputs | `engine/engine.ts` | `engine/engine.spec.ts`, `e2e.spec.ts` |
| Multi-port Code Node execution | `engine/engine.ts`, `engine/runner.ts` | `engine/engine.spec.ts`, `engine/runner.spec.ts` |
| Multi-port nested execution | `engine/engine.ts` | `engine/engine.spec.ts`, `e2e.spec.ts` |
| Ephemeral typed port execution trace | `engine/executions.ts`, `engine/engine.ts` | `engine/executions.spec.ts`, `api-engine.spec.ts`, `e2e.spec.ts`; frontend `ExecutionTraceView.spec.ts`; see warning 2 |
| Port-aware DAG validation | `domain/functions.ts`, `domain/validator.ts` | `domain/functions.spec.ts`, `domain/validator.spec.ts`, `e2e.spec.ts` |
| Connection compatibility highlighting | frontend `domain/connection.ts`, `components/FunctionNode.vue` | frontend `connection.spec.ts`, `FunctionNode.spec.ts` |

## Design and task checks

- `store.ts` and `registry.ts` own persistence and project-local resolution; the
  typed engine consumes `AssetRegistrySnapshot` without database access.
- Type constraints validate the full ancestry. `any` preserves incoming nominal
  identity and validates/relabels values when leaving an `any` source.
- Boundary ports derive from the Function signature; Function Nodes store the
  Child ID and project its public signature. Port names do not identify edges.
- The Runner supplies raw inputs/outputs. The backend assigns nominal output
  identity only after validating the full output set.
- Scheduling waits for every input; failed producers cause downstream skips.
  Child outputs are published only after successful Child completion.
- Retention uses root TTL/count limits, bounded node logs/outputs, and eviction
  of complete nested trees. Running roots are not evicted.
- Frontend Type editing, projected ports, connection feedback, Run input parsing
  and nested trace inspection have implementation evidence. Monaco typings and
  diagnostic mapping are covered by `domain/__tests__/codeTypings.spec.ts`.
- `docs/poc.md` documents nominal Types, typed ports, the Registry boundary,
  tagged transport and ephemeral execution traces, with example definitions.

## Executed checks

| Command | Result |
| --- | --- |
| `npm test` (project `openspec/VERIFY.md`) | Passed: backend 146, frontend 73, UI 32; total 251 tests in 31 files |
| `npm run lint` | Passed in all workspaces |
| `npm run type-check` | Passed in all workspaces |
| `openspec validate typed-function-ports --strict` | Passed |

No change-level `VERIFY.md` exists. No built-in verification dimension was
skipped. API end-to-end tests use the actual sandboxed Runner. Browser automation
was unavailable in this session; the user confirmed the numeric Run dialog fix
manually. Monaco completion and worker diagnostics were inspected in code, not
revalidated interactively in this verification run.

## Non-blocking warnings

1. **Type edits during an active execution lack a dedicated scenario test.**
   `engine/engine.ts:67` retains the starting snapshot and its Type context;
   `engine/engine.spec.ts:258` tests an active execution against a Child Function
   update. Type-change revalidation is tested separately in
   `api-engine.spec.ts:74`, but no single test combines an active execution with
   a changed Type constraint. Add a case in `engine/engine.spec.ts` that starts
   a delayed Code Node, changes its output Type constraint, then asserts the
   first execution uses the old constraint/hash and the next execution uses
   the new one.
2. **Renaming after completion lacks a dedicated trace-preservation test.**
   `engine/engine.ts:44` stores the port ID and execution-time name, and the
   frontend renders `record.portName`. Existing rename tests check stable
   connections/handles rather than an already-completed retained trace. Add a
   case in `api-engine.spec.ts` that completes an execution, renames a Function
   port without changing its ID, and checks the old trace retains its old name
   while a new execution uses the new name.

Neither warning identifies an observed implementation failure. Both are gaps
in direct automated scenario coverage, recorded for follow-up.
