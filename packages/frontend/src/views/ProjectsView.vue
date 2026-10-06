<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Trash2Icon } from '@lucide/vue'
import { UiBanner, UiButton, UiDialog } from '@low-code-flow/ui'
import type { Project } from '@/api/types'
import { inputClass, labelClass } from '@/components/formClasses'
import { useWorkspace } from '@/stores/workspace'

const workspace = useWorkspace()
const router = useRouter()
const name = ref('')
const error = ref('')
const pendingDelete = ref<Project | null>(null)
const confirmOpen = ref(false)

onMounted(() => workspace.loadProjects().catch((e: Error) => (error.value = e.message)))

async function create() {
  error.value = ''
  try {
    const project = await workspace.createProject(name.value)
    name.value = ''
    await router.push({ name: 'project', params: { projectId: project.id } })
  } catch (e) {
    error.value = (e as Error).message
  }
}

function askDelete(project: Project) {
  pendingDelete.value = project
  confirmOpen.value = true
}

async function confirmDelete() {
  if (pendingDelete.value) await workspace.deleteProject(pendingDelete.value.id).catch((e: Error) => (error.value = e.message))
  confirmOpen.value = false
}
</script>

<template>
  <main class="mx-auto h-full max-w-2xl overflow-y-auto p-8">
    <h1 class="mb-6 text-xl font-semibold text-heading">Projects</h1>
    <UiBanner v-if="error" variant="danger" class="mb-4">{{ error }}</UiBanner>

    <form class="mb-8 flex items-end gap-2" @submit.prevent="create">
      <div class="flex-1">
        <label for="project-name" :class="labelClass">New project</label>
        <input id="project-name" v-model="name" :class="inputClass" placeholder="Project name" required />
      </div>
      <UiButton type="submit">Create</UiButton>
    </form>

    <p v-if="!workspace.projects.length" class="text-sm text-fg-muted">No projects yet.</p>
    <ul class="divide-y divide-border rounded-md border border-border">
      <li v-for="project in workspace.projects" :key="project.id" class="flex items-center justify-between px-4 py-3">
        <RouterLink :to="{ name: 'project', params: { projectId: project.id } }" class="font-medium text-accent hover:underline">{{ project.name }}</RouterLink>
        <UiButton variant="ghost" :aria-label="`Delete ${project.name}`" @click="askDelete(project)"><Trash2Icon class="size-4" aria-hidden="true" /></UiButton>
      </li>
    </ul>

    <UiDialog v-model:open="confirmOpen" title="Delete project" :description="`Delete ${pendingDelete?.name ?? ''} with all of its Types and Functions? Running executions are cancelled.`">
      <template #footer>
        <UiButton variant="ghost" @click="confirmOpen = false">Cancel</UiButton>
        <UiButton variant="danger" @click="confirmDelete">Delete</UiButton>
      </template>
    </UiDialog>
  </main>
</template>
