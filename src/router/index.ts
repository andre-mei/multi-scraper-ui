/// <reference types="vite/client" />
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue')
    },
    {
      path: '/scrapers',
      name: 'scrapers',
      component: () => import('@/views/ScrapersView.vue')
    },
    {
      path: '/scrapers/:scraperId/:tab?/:subTab?',
      name: 'scraper-detail',
      component: () => import('@/views/ScraperDetailView.vue')
    },
    {
      path: '/scrapers/:scraperId/workers/:workerId',
      name: 'worker-detail',
      component: () => import('@/views/WorkerDetailView.vue')
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/LogsView.vue')
    },
    {
      path: '/config',
      name: 'config',
      component: () => import('@/views/ConfigView.vue')
    },
    {
      path: '/proxies',
      name: 'proxies',
      component: () => import('@/views/ProxiesView.vue')
    }
  ]
})

export default router
