import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import type { FunctionSummary, Project, SystemType, TypeInfo } from '@/api/types'
import { createCatalog } from '@/domain/catalog'

/** The projects, and the Types and Functions of the open project. */
export const useWorkspace = defineStore('workspace', () => {
  const projects = ref<Project[]>([])
  const projectId = ref<string>()
  const systemTypes = ref<SystemType[]>([])
  const types = ref<TypeInfo[]>([])
  const functions = ref<FunctionSummary[]>([])

  const project = computed(() => projects.value.find((p) => p.id === projectId.value))
  const catalog = computed(() => createCatalog(systemTypes.value, types.value))
  const signatureOf = (functionId: string) => functions.value.find((f) => f.id === functionId)?.signature

  async function loadProjects() {
    projects.value = await api.get<Project[]>('/projects')
  }

  async function createProject(name: string) {
    const created = await api.post<Project>('/projects', { name })
    await loadProjects()
    return created
  }

  async function deleteProject(id: string) {
    await api.delete(`/projects/${id}`)
    if (projectId.value === id) projectId.value = undefined
    await loadProjects()
  }

  /** Loads everything the editors need for one project. */
  async function open(id: string) {
    if (!projects.value.length) await loadProjects()
    projectId.value = id
    if (!systemTypes.value.length) systemTypes.value = await api.get<SystemType[]>('/system-types')
    await refresh()
  }

  async function refresh() {
    if (!projectId.value) return
    const id = projectId.value
    const [loadedTypes, loadedFunctions] = await Promise.all([
      api.get<TypeInfo[]>(`/projects/${id}/types`),
      api.get<FunctionSummary[]>(`/projects/${id}/functions`),
    ])
    if (projectId.value !== id) return
    types.value = loadedTypes
    functions.value = loadedFunctions
  }

  return { projects, projectId, project, systemTypes, types, functions, catalog, signatureOf, loadProjects, createProject, deleteProject, open, refresh }
})
