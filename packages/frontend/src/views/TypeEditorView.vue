<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRightIcon, LockIcon, PlusIcon, SaveIcon, Trash2Icon } from '@lucide/vue'
import { UiBadge, UiBanner, UiButton } from '@low-code-flow/ui'
import { ApiError, api } from '@/api/client'
import type { AssetDetail, RootKind } from '@/api/types'
import DiagnosticsList from '@/components/DiagnosticsList.vue'
import TypeSelect from '@/components/TypeSelect.vue'
import { inputClass, labelClass } from '@/components/formClasses'
import { inheritedProperties, toDefinition, toForm, type PropertyForm, type TypeForm } from '@/domain/typeDefinition'
import { useWorkspace } from '@/stores/workspace'

const props = defineProps<{ projectId: string; assetId: string }>()
const workspace = useWorkspace()
const router = useRouter()
const catalog = computed(() => workspace.catalog)

const detail = ref<(AssetDetail & { rootKind: RootKind | null; ancestry: string[] }) | null>(null)
const form = ref<TypeForm | null>(null)
const baseline = ref('')
const impact = ref<Array<{ id: string; kind: string; name: string; executable: boolean }>>([])
const inherited = ref<PropertyForm[]>([])
const error = ref('')
const conflict = ref(false)
const referrers = ref<string[]>([])
const saving = ref(false)

const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== baseline.value)
// The root kind follows the chosen parent, so the constraint fields switch as soon as the parent changes.
const rootKind = computed(() => (form.value ? catalog.value.rootKind(form.value.parentTypeId) : null))
const excludedParents = computed(() => ['system:any', props.assetId, ...catalog.value.descendantsOf(props.assetId)])
const inheritedNames = computed(() => new Set(inherited.value.map((p) => p.name)))

async function load() {
  error.value = ''
  conflict.value = false
  const base = `/projects/${props.projectId}`
  const loaded = await api.get<NonNullable<typeof detail.value>>(`${base}/types/${props.assetId}`)
  detail.value = loaded
  form.value = toForm(loaded.name, loaded.definition)
  baseline.value = JSON.stringify(form.value)
  impact.value = (await api.get<{ dependents: typeof impact.value }>(`${base}/assets/${props.assetId}/impact`)).dependents
}

async function loadInherited(parentTypeId: string) {
  const chain = (catalog.value.ancestryOf(parentTypeId) ?? []).filter((id) => !id.startsWith('system:')).reverse()
  const definitions = await Promise.all(chain.map((id) => api.get<AssetDetail>(`/projects/${props.projectId}/types/${id}`).then((d) => d.definition)))
  inherited.value = inheritedProperties(definitions)
}

watch(() => props.assetId, () => load().catch((e: Error) => (error.value = e.message)), { immediate: true })
watch(
  () => form.value?.parentTypeId,
  (parent) => parent && loadInherited(parent).catch(() => (inherited.value = [])),
  { immediate: true },
)

function customizeProperties() {
  if (form.value) form.value.properties = inherited.value.map((p) => ({ ...p }))
}

function addProperty() {
  if (form.value) form.value.properties = [...(form.value.properties ?? []), { name: `property${(form.value.properties?.length ?? 0) + 1}`, typeId: 'system:string', required: true }]
}

function removeProperty(index: number) {
  if (form.value?.properties) form.value.properties = form.value.properties.filter((_, i) => i !== index)
}

async function save() {
  if (!form.value || !detail.value) return
  saving.value = true
  error.value = ''
  try {
    await api.put(`/projects/${props.projectId}/assets/${props.assetId}`, {
      name: form.value.name,
      definition: toDefinition(form.value, rootKind.value),
      expectedRevision: detail.value.revision,
    })
    await Promise.all([workspace.refresh(), load()])
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) conflict.value = true
    else error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove() {
  referrers.value = []
  try {
    await api.delete(`/projects/${props.projectId}/assets/${props.assetId}`)
    await workspace.refresh()
    await router.push({ name: 'project', params: { projectId: props.projectId } })
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const ids = (e.body.referencedBy as string[]) ?? []
      referrers.value = ids.map((id) => workspace.catalog.get(id)?.name ?? workspace.functions.find((f) => f.id === id)?.name ?? id)
    } else error.value = (e as Error).message
  }
}
</script>

<template>
  <div v-if="form && detail" class="h-full overflow-y-auto p-6">
    <div class="mx-auto max-w-2xl space-y-6">
      <header class="flex items-end gap-3">
        <div class="flex-1">
          <label for="type-name" :class="labelClass">Type name</label>
          <input id="type-name" v-model="form.name" :class="inputClass" />
        </div>
        <UiBadge :variant="detail.executable ? 'success' : 'warning'">{{ detail.executable ? 'Executable' : 'Not executable' }}</UiBadge>
        <UiButton :disabled="!dirty || saving" @click="save"><SaveIcon class="size-4" aria-hidden="true" /> Save</UiButton>
        <UiButton variant="danger" aria-label="Delete type" @click="remove"><Trash2Icon class="size-4" aria-hidden="true" /></UiButton>
      </header>

      <UiBanner v-if="conflict" variant="warning">
        Someone else changed this Type. <UiButton variant="secondary" @click="load">Reload</UiButton>
      </UiBanner>
      <UiBanner v-if="error" variant="danger">{{ error }}</UiBanner>
      <UiBanner v-if="referrers.length" variant="warning">Still used by: {{ referrers.join(', ') }}. Remove those references first.</UiBanner>

      <section aria-label="Inheritance">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Inheritance</h2>
        <ol class="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Ancestry">
          <li v-for="(id, i) in detail.ancestry" :key="id" class="flex items-center gap-1">
            <ChevronRightIcon v-if="i" class="size-3 text-fg-muted" aria-hidden="true" />
            <RouterLink v-if="!catalog.get(id)?.system" :to="{ name: 'type', params: { projectId, assetId: id } }" class="text-accent hover:underline">{{ catalog.name(id) }}</RouterLink>
            <span v-else class="flex items-center gap-1 text-fg-muted"><LockIcon class="size-3" aria-hidden="true" />{{ catalog.name(id) }}</span>
          </li>
        </ol>
        <label :class="labelClass">Inherits from</label>
        <TypeSelect v-model="form.parentTypeId" :catalog="catalog" :exclude="excludedParents" aria-label="Parent type" />
        <p class="mt-1 text-xs text-fg-muted">Itself, its subtypes and any are not offered, so the inheritance can never form a cycle.</p>
      </section>

      <section aria-label="Constraints">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Constraints ({{ rootKind ?? 'unknown' }})</h2>

        <div v-if="rootKind === 'string'" class="grid grid-cols-3 gap-3">
          <div><label for="min-length" :class="labelClass">Min length</label><input id="min-length" v-model.number="form.minLength" type="number" min="0" :class="inputClass" /></div>
          <div><label for="max-length" :class="labelClass">Max length</label><input id="max-length" v-model.number="form.maxLength" type="number" min="0" :class="inputClass" /></div>
          <div><label for="pattern" :class="labelClass">Pattern</label><input id="pattern" v-model="form.pattern" :class="inputClass" placeholder="^[A-Z]+$" /></div>
        </div>

        <div v-else-if="rootKind === 'number'" class="grid grid-cols-3 gap-3">
          <div><label for="min" :class="labelClass">Min</label><input id="min" v-model.number="form.min" type="number" :class="inputClass" /></div>
          <div><label for="max" :class="labelClass">Max</label><input id="max" v-model.number="form.max" type="number" :class="inputClass" /></div>
          <label class="flex items-end gap-2 pb-1 text-sm"><input v-model="form.integer" type="checkbox" /> Integer only</label>
        </div>

        <div v-else-if="rootKind === 'object'" class="space-y-2">
          <div v-if="form.properties === undefined" class="rounded-md border border-border p-3 text-sm">
            <p v-if="inherited.length" class="mb-2">Inherits {{ inherited.map((p) => p.name).join(', ') }}.</p>
            <p v-else class="mb-2 text-fg-muted">No properties.</p>
            <UiButton variant="secondary" @click="customizeProperties"><PlusIcon class="size-4" aria-hidden="true" /> Customize properties</UiButton>
          </div>
          <template v-else>
            <p class="text-xs text-fg-muted">The list is complete: inherited properties must stay, and may only be narrowed.</p>
            <ul class="space-y-2">
              <li v-for="(prop, i) in form.properties" :key="i" class="flex items-center gap-2">
                <input v-model="prop.name" :class="inputClass" :disabled="inheritedNames.has(prop.name)" aria-label="Property name" />
                <div class="w-48 shrink-0"><TypeSelect v-model="prop.typeId" :catalog="catalog" aria-label="Property type" /></div>
                <label class="flex items-center gap-1 text-xs"><input v-model="prop.required" type="checkbox" :disabled="inheritedNames.has(prop.name) && inherited.find((p) => p.name === prop.name)?.required" /> required</label>
                <UiButton variant="ghost" :disabled="inheritedNames.has(prop.name)" :aria-label="`Remove ${prop.name}`" @click="removeProperty(i)"><Trash2Icon class="size-4" aria-hidden="true" /></UiButton>
              </li>
            </ul>
            <div class="flex gap-2">
              <UiButton variant="secondary" @click="addProperty"><PlusIcon class="size-4" aria-hidden="true" /> Add property</UiButton>
              <UiButton v-if="!inherited.length" variant="ghost" @click="form.properties = undefined">Remove all</UiButton>
            </div>
          </template>
        </div>

        <div v-else-if="rootKind === 'array'">
          <label :class="labelClass">Element type</label>
          <TypeSelect :model-value="form.elementTypeId ?? ''" :catalog="catalog" aria-label="Element type" @update:model-value="form.elementTypeId = $event" />
          <p v-if="!form.elementTypeId" class="mt-1 text-xs text-warning">An array type must define its element type unless a parent already does.</p>
        </div>

        <p v-else class="text-sm text-fg-muted">This kind of Type has no constraints.</p>
      </section>

      <section v-if="detail.diagnostics.length" aria-label="Problems">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Problems</h2>
        <DiagnosticsList :diagnostics="detail.diagnostics" />
        <p class="mt-2 text-xs text-fg-muted">An invalid Type can be saved as a draft, but it and everything that uses it cannot run.</p>
      </section>

      <section aria-label="Impact">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">Used by</h2>
        <p v-if="!impact.length" class="text-sm text-fg-muted">Nothing uses this Type yet.</p>
        <ul class="space-y-1 text-sm">
          <li v-for="item in impact" :key="item.id" class="flex items-center gap-2">
            <RouterLink :to="{ name: item.kind, params: { projectId, assetId: item.id } }" class="text-accent hover:underline">{{ item.name }}</RouterLink>
            <UiBadge variant="neutral">{{ item.kind }}</UiBadge>
            <UiBadge v-if="!item.executable" variant="warning">not executable</UiBadge>
          </li>
        </ul>
      </section>
    </div>
  </div>
  <p v-else-if="error" class="p-6 text-sm text-danger">{{ error }}</p>
</template>
