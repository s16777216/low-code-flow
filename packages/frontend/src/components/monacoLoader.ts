export type Monaco = typeof import('monaco-editor')

let loading: Promise<Monaco> | undefined

/** Monaco is large, so it is only fetched the first time a Code node is edited. */
export function loadMonaco(): Promise<Monaco> {
  loading ??= (async () => {
    const [monaco, editorWorker, tsWorker] = await Promise.all([
      import('monaco-editor'),
      import('monaco-editor/editor/editor.worker?worker').then((m) => m.default),
      import('monaco-editor/language/typescript/ts.worker?worker').then((m) => m.default),
    ])
    ;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
      getWorker: (_id: string, label: string) => (label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker()),
    }

    const { javascriptDefaults, typescriptDefaults, ScriptTarget } = monaco.typescript
    const compilerOptions = { allowJs: true, allowNonTsExtensions: true, target: ScriptTarget.ESNext, strict: false, noImplicitAny: false, noLib: false }
    javascriptDefaults.setCompilerOptions({ ...compilerOptions, checkJs: true })
    typescriptDefaults.setCompilerOptions(compilerOptions)
    // The code is the body of an async function, so a top-level return and await are normal here.
    javascriptDefaults.setDiagnosticsOptions({ diagnosticCodesToIgnore: [1108, 1375, 1378] })
    return monaco
  })()
  return loading
}
