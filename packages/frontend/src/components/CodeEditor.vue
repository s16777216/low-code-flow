<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { editor, IDisposable } from 'monaco-editor'
import type { PortDefinition } from '@/api/types'
import type { TypeCatalog } from '@/domain/catalog'
import { ctxDeclarations, flattenMessage, mapLine, wrapForCheck } from '@/domain/codeTypings'
import { loadMonaco, type Monaco } from './monacoLoader'

const props = defineProps<{ inputs: PortDefinition[]; outputs: PortDefinition[]; catalog: TypeCatalog }>()
const code = defineModel<string>({ required: true })

const host = ref<HTMLElement>()
const loadError = ref('')
const problems = ref<Array<{ line: number; message: string }>>([])
const uid = useId().replace(/[^\w-]/g, '')

let monaco: Monaco | undefined
let instance: editor.IStandaloneCodeEditor | undefined
let model: editor.ITextModel | undefined
let checkModel: editor.ITextModel | undefined
const libs: IDisposable[] = []
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let media: MediaQueryList | undefined

const theme = () => (media?.matches ? 'vs-dark' : 'vs')
const applyTheme = () => monaco?.editor.setTheme(theme())

function applyTypings() {
  if (!monaco) return
  libs.splice(0).forEach((lib) => lib.dispose())
  const declarations = ctxDeclarations(props.inputs, props.outputs, props.catalog)
  libs.push(monaco.typescript.javascriptDefaults.addExtraLib(declarations, `inmemory://typings/${uid}.d.ts`))
}

// The visible model is plain JavaScript, because that is what runs (its completions come from the extra lib).
// A hidden TypeScript copy, wrapped in a typed function and carrying its own declarations, lets the
// compiler report outputs that are missing or of the wrong kind.
async function checkOnce() {
  if (!monaco || !model || !checkModel || disposed) return
  const { source, lineOffset } = wrapForCheck(model.getValue(), ctxDeclarations(props.inputs, props.outputs, props.catalog))
  if (checkModel.getValue() !== source) checkModel.setValue(source)
  const worker = await monaco.typescript.getTypeScriptWorker()
  const client = await worker(checkModel.uri)
  const uri = checkModel.uri.toString()
  const found = [...(await client.getSyntacticDiagnostics(uri)), ...(await client.getSemanticDiagnostics(uri))]
  if (disposed || !model || !checkModel) return

  const lines = model.getLineCount()
  const markers = found.map((d) => {
    const start = checkModel!.getPositionAt(d.start ?? 0)
    const end = checkModel!.getPositionAt((d.start ?? 0) + (d.length ?? 0))
    const startLineNumber = mapLine(start.lineNumber, lineOffset, lines)
    const endLineNumber = mapLine(end.lineNumber, lineOffset, lines)
    const onWrapper = start.lineNumber <= lineOffset || start.lineNumber > lines + lineOffset
    return {
      severity: monaco!.MarkerSeverity.Error,
      message: flattenMessage(d.messageText),
      startLineNumber,
      endLineNumber,
      startColumn: onWrapper ? 1 : start.column,
      endColumn: onWrapper ? model!.getLineMaxColumn(startLineNumber) : end.column,
    }
  })
  monaco.editor.setModelMarkers(model, 'ports', markers)
  problems.value = markers.map((m) => ({ line: m.startLineNumber, message: m.message }))
}

// Checks run one at a time: the worker drops a sync request when the model changes underneath it.
let running = false
let rerun = false
async function check() {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      await Promise.race([checkOnce(), new Promise<void>((resolve) => setTimeout(resolve, 20_000))])
    } while (rerun && !disposed)
  } finally {
    running = false
  }
}

// Monaco cancels in-flight worker requests when the text changes or the editor goes away; that is not an error.
const runCheck = () => void check().catch(() => undefined)

const scheduleCheck = () => {
  clearTimeout(timer)
  timer = setTimeout(runCheck, 300)
}

onMounted(async () => {
  try {
    monaco = await loadMonaco()
  } catch (e) {
    loadError.value = (e as Error).message
    return
  }
  if (disposed || !host.value) return
  media = window.matchMedia('(prefers-color-scheme: dark)')
  model = monaco.editor.createModel(code.value, 'javascript', monaco.Uri.parse(`inmemory://node/${uid}.js`))
  checkModel = monaco.editor.createModel('', 'typescript', monaco.Uri.parse(`inmemory://check/${uid}.ts`))
  applyTypings()
  instance = monaco.editor.create(host.value, { model, theme: theme(), automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 13, tabSize: 2, ariaLabel: 'Code', editContext: false })
  media.addEventListener('change', applyTheme)
  model.onDidChangeContent(() => {
    const value = model!.getValue()
    if (value !== code.value) code.value = value
    scheduleCheck()
  })
  runCheck()
})

watch(code, (value) => {
  if (model && value !== model.getValue()) model.setValue(value)
})
watch(() => [props.inputs, props.outputs, props.catalog], () => {
  applyTypings()
  scheduleCheck()
}, { deep: true })

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  media?.removeEventListener('change', applyTheme)
  libs.forEach((lib) => lib.dispose())
  instance?.dispose()
  model?.dispose()
  checkModel?.dispose()
})
</script>

<template>
  <div>
    <p v-if="loadError" class="text-sm text-danger">The code editor could not be loaded: {{ loadError }}</p>
    <div v-else ref="host" class="h-72 overflow-hidden rounded-md border border-border" aria-label="Code editor" />
    <ul v-if="problems.length" class="mt-2 space-y-1 text-xs text-danger" aria-label="Code problems">
      <li v-for="(problem, i) in problems" :key="i">Line {{ problem.line }}: {{ problem.message }}</li>
    </ul>
  </div>
</template>
