<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { UiBanner, UiButton } from '@low-code-flow/ui'
import { api } from '@/api/client'
import type { EndpointInfo } from '@/api/types'
import { inputClass, labelClass } from './formClasses'

const props = defineProps<{ projectId: string; assetId: string; endpoint: EndpointInfo | null }>()
const emit = defineEmits<{ updated: [endpoint: EndpointInfo | null] }>()
const path = ref('')
const error = ref('')
const busy = ref(false)
const copied = ref(false)
watch(() => props.endpoint, (value) => { path.value = value?.path ?? ''; copied.value = false }, { immediate: true })
const valid = computed(() => path.value.length <= 128 && /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(path.value))
const url = computed(() => `/projects/${props.projectId}/assets/${props.assetId}/endpoint`)
async function save() {
  busy.value = true
  error.value = ''
  try { emit('updated', await api.put<EndpointInfo>(url.value, { path: path.value })) }
  catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
async function remove() {
  busy.value = true
  error.value = ''
  try { await api.delete(url.value); emit('updated', null) }
  catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
async function copy() {
  error.value = ''
  try { await navigator.clipboard.writeText(props.endpoint!.url); copied.value = true }
  catch { error.value = 'Could not copy. Select the URL and copy it manually.' }
}
</script>

<template>
  <section class="space-y-2 border-t border-border pt-3" aria-label="HTTP endpoint">
    <h3 class="text-xs font-semibold tracking-wide text-fg-muted uppercase">HTTP endpoint</h3>
    <label for="endpoint-path" :class="labelClass">POST path</label>
    <input id="endpoint-path" v-model="path" :class="inputClass" placeholder="orders/checkout" :aria-invalid="!!path && !valid" aria-describedby="endpoint-help" />
    <p id="endpoint-help" class="text-xs" :class="path && !valid ? 'text-danger' : 'text-fg-muted'">Lowercase letters, numbers and hyphens; separate segments with /. Maximum 128 characters.</p>
    <div class="flex gap-2">
      <UiButton variant="secondary" :disabled="busy || !valid || path === endpoint?.path" @click="save">Save endpoint</UiButton>
      <UiButton v-if="endpoint" variant="danger" :disabled="busy" @click="remove">Remove endpoint</UiButton>
    </div>
    <template v-if="endpoint">
      <label for="endpoint-url" :class="labelClass">Call URL</label>
      <input id="endpoint-url" :value="endpoint.url" readonly :class="inputClass" />
      <UiButton variant="ghost" @click="copy">{{ copied ? 'Copied' : 'Copy URL' }}</UiButton>
      <p class="text-xs text-fg-muted">Calls use the latest saved Function. Anyone who can reach the server can call this endpoint.</p>
    </template>
    <UiBanner v-if="error" variant="danger" role="alert">{{ error }}</UiBanner>
  </section>
</template>
