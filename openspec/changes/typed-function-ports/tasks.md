## 1. Project Integration and Type Foundations

- [x] 1.1 Complete the `definition-store` change through its Project Asset Registry boundary, and verify its contract resolves project-local Type, Function, and Code assets by stable ID without cross-project lookup
- [x] 1.2 Add the typed-port domain and test modules to the backend scaffolded by `definition-store`, and verify the project typecheck and test suite run successfully
- [x] 1.3 Implement immutable system base Type definitions for `string`, `number`, `date`, `function`, `object`, `boolean`, `array`, and `any`, and verify tests reject creating, modifying, or deleting base Types and reject user Types that inherit `any`
- [x] 1.4 Implement user Type definitions with stable IDs, one parent, root-kind resolution, canonical definition hashing, and verify unit tests cover custom and multi-level ancestry
- [x] 1.5 Implement inheritance cycle detection and nominal assignability, and verify tests cover same-Type, descendant-to-ancestor, reverse, sibling, structurally identical unrelated Types, and bidirectional `any` connections

## 2. Type Constraints and Runtime Values

- [x] 2.1 Implement inherited object property definitions and validation, and verify tests cover added properties, missing inherited properties, and rejected incompatible overrides
- [x] 2.2 Implement primitive narrowing constraints and array element Type definitions, and verify tests cover valid constraints, parent-violating constraints, and missing array element Types
- [x] 2.3 Implement the TypedValue envelope and full-ancestry value validator, and verify equal raw values retain distinct nominal identities and invalid declared values are rejected
- [x] 2.4 Implement `any` value transfer, and verify values entering an `any` port keep their Type identity while values leaving `any` are validated against and relabeled as the target Type, failing the receiving Node on mismatch
- [x] 2.5 Implement canonical date and Function-reference transport codecs, and verify round-trip tests preserve ISO instants and Function IDs while rejecting JavaScript closures, and that a Function reference resolves from the execution snapshot or, if outside it, from the latest definition with the used hash recorded in the trace
- [x] 2.6 Implement explicit target-Type construction through Code Node outputs, and verify unrelated Types cannot pass directly but a validated explicit conversion can produce the target Type

## 3. Multi-Port Definition Model

- [x] 3.1 Implement immutable named typed input/output port definitions for Functions and executable Nodes, and verify tests cover multiple ports, duplicate-name rejection, and rename-with-stable-ID behavior
- [x] 3.2 Implement Function signature projection onto Input and Output boundary Nodes, and verify tests prove the signature is the only source of truth with no divergent boundary copies
- [x] 3.3 Implement Function Node projection of the Child Function's current signature by Child ID only, and verify tests expose all public ports, hide Child internals, invalidate Parent Edges when a Child port is removed or changed, and keep the Parent valid after internal-only Child changes
- [x] 3.4 Implement port-to-port Edge definitions and endpoint validation, and verify tests reject missing ports, wrong directions, and nominally incompatible connections
- [x] 3.5 Enforce one producer per required input and output fan-out, and verify tests reject unconnected or multiply connected inputs while allowing one output to feed multiple compatible inputs
- [x] 3.6 Extend DAG validation and cycle detection to derive dependencies from port Edges, and verify invalid graphs cannot start execution

## 4. Runner and Execution Engine

- [x] 4.1 Update the Runner protocol to accept raw inputs keyed by port name and return raw outputs keyed by port name, and verify protocol contract tests cover multiple inputs and outputs
- [x] 4.2 Implement Backend-controlled output typing and validation, and verify tests prevent Runner-supplied Type identity from overriding the Node port declaration
- [x] 4.3 Implement atomic required-output publication, and verify missing, extra, or invalid outputs fail the Node without exposing partial results
- [x] 4.4 Update the DAG scheduler to mark a Node ready only after all input ports receive validated values, and verify tests cover joins, parallel fan-out, pending state, and upstream-failure skipping
- [x] 4.5 Implement multi-port nested Function execution with a single Child Execution per Function Node, and verify tests cover input transfer, atomic Child outputs, Child references, and failure propagation
- [x] 4.6 Resolve and pin the complete Function and Type definition closure at execution start, and verify mid-execution definition changes do not alter the running execution

## 5. Project Asset Integration and Runtime APIs

- [x] 5.1 Integrate Type and Function resolution with the `definition-store` Registry and its validation interface, and verify stable asset IDs, dependencies, diagnostics, executability, and change notifications resolve through the Registry only
- [x] 5.2 Implement a bounded in-memory execution registry keyed by Execution ID, and verify it retains running executions, temporarily retains terminal traces, enforces TTL/count/log/output limits, and never evicts running executions
- [x] 5.3 Add Type query, validation, and dependency-impact APIs over Registry snapshots, and verify integration tests cover inheritance validation, immutable base Types, immediate revalidation of dependents after a Type change, and affected Function discovery without cross-project lookup
- [x] 5.4 Add Function query and validation APIs for multi-port Assets that always resolve the latest Type and Child definitions, and verify invalid or non-executable definitions are reported and blocked from execution while persistence remains owned by `definition-store`
- [x] 5.5 Update the execute API to accept raw values for every Function input port, and verify valid inputs become declared TypedValues while port-specific validation failures prevent execution creation
- [x] 5.6 Update execution query and cancel APIs to use the in-memory registry, and verify they return multi-port nested traces while retained and return not found after eviction or runtime shutdown

## 6. Workflow Editor and Execution UX

- [x] 6.1 Build Type management UI against the Project Asset APIs for browsing ancestry and editing allowed constraints, and verify users cannot edit base Types or pick a parent that would create an inheritance cycle, and that an invalid child definition is saved as a draft but flagged with its problems and as not executable
- [x] 6.2 Render Function and Node input/output ports with Type names and immutable connection handles, and verify rename operations preserve existing Edges
- [x] 6.3 Enforce nominal compatibility while creating Edges and surface actionable validation messages, and verify sibling Types cannot connect while subtype-to-parent connections succeed
- [x] 6.4 Update Function Node and Code Node inspectors for projected signatures and multi-port code bindings, and verify saved definitions round-trip without exposing Child internals
- [x] 6.5 Update the execution inspector to display values, Type identities, hashes, errors, and nested executions per port while traces remain in memory, and verify it handles retained execution-time snapshots and trace eviction explicitly
- [x] 6.6 Highlight the ports that would accept the connection being dragged (inputs when dragging an output, outputs when dragging an input) and dim the rest, and verify the highlight matches the drop validation (type, existing producer, cycle) and clears when the connection ends
- [ ] 6.7 Provide a Monaco-based Code Node editor in the frontend with TypeScript typings generated from the Node's input/output ports, and verify `ctx.inputs` completion and missing-output errors appear in the editor while backend output validation remains authoritative

## 7. End-to-End Verification

- [x] 7.1 Add an end-to-end workflow using multiple primitive-derived and object-derived Types, and verify nominally compatible multi-port data completes successfully through parallel and join paths
- [x] 7.2 Add an end-to-end nested Function case with multiple inputs and outputs, and verify the final result and in-memory parent/child execution traces record the Type and Function definition hashes pinned at execution start
- [x] 7.3 Add negative end-to-end cases for sibling-Type edges, missing inputs, invalid output values, missing outputs, inheritance cycles, DAG cycles, and Parent Edges broken by a changed Child port, and verify each fails at the specified validation boundary
- [x] 7.4 Add runtime lifecycle tests, and verify definition changes during execution do not alter its immutable snapshot, terminal traces obey retention limits, and restart does not restore executions
- [ ] 7.5 Update `docs/poc.md` and example definitions to use nominal Types, typed ports, Project Asset Registry integration, and ephemeral execution traces, then verify terminology and examples agree with the accepted OpenSpec artifacts
- [ ] 7.6 Run the complete lint, typecheck, unit, integration, and end-to-end suites plus `openspec validate typed-function-ports --strict`, and verify all checks pass without a definition or execution database dependency
