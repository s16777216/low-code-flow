import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'projects', component: () => import('@/views/ProjectsView.vue') },
    {
      path: '/projects/:projectId',
      component: () => import('@/views/ProjectLayout.vue'),
      props: true,
      children: [
        { path: '', name: 'project', component: () => import('@/views/ProjectHome.vue') },
        { path: 'functions/:assetId', name: 'function', component: () => import('@/views/FunctionEditorView.vue'), props: true },
        { path: 'types/:assetId', name: 'type', component: () => import('@/views/TypeEditorView.vue'), props: true },
      ],
    },
  ],
})

export default router
