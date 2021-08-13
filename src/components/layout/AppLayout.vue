<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useWebSocket } from "@/composables/useWebSocket";
import { useScrapersStore } from "@/stores/scrapers";

const route = useRoute();
const { isConnected } = useWebSocket();
const scrapersStore = useScrapersStore();

const sidebarCollapsed = ref(false);

const activeKey = computed(() => {
  const path = route.path;
  if (path === "/") return "dashboard";
  if (path.startsWith("/scrapers")) return "scrapers";
  if (path.startsWith("/logs")) return "logs";
  if (path.startsWith("/config")) return "config";
  if (path.startsWith("/proxies")) return "proxies";
  return "dashboard";
});

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}
</script>

<template>
  <div class="app-main-layout">
    <!-- App Header -->
    <header class="app-header">
      <div class="app-header-content">
        <div class="app-header-left">
          <h1 class="app-title">Scrapers Visualizer</h1>
          <span
            :class="[
              'connection-badge',
              isConnected ? 'connected' : 'disconnected',
            ]"
          >
            {{ isConnected ? "Connected" : "Disconnected" }}
          </span>
        </div>
        <div class="app-header-right">
          <span class="stats-text scrapers-status">
            {{ scrapersStore.connectedScrapers.length }} /
            {{ scrapersStore.scraperList.length }} scrapers online
          </span>
          <span class="stats-divider">|</span>
          <span class="stats-text workers-status">
            {{ scrapersStore.activeWorkers }} /
            {{ scrapersStore.totalWorkers }} workers active
          </span>
        </div>
      </div>
    </header>

    <!-- App Body (Sidebar + Content) -->
    <div class="app-body">
      <!-- Sidebar Navigation -->
      <aside :class="['app-sidebar', { collapsed: sidebarCollapsed }]">
        <nav class="sidebar-nav">
          <ul class="nav-menu">
            <li :class="['nav-item', { active: activeKey === 'dashboard' }]">
              <RouterLink to="/" class="nav-link">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"
                  />
                </svg>
                <span class="nav-label">Dashboard</span>
              </RouterLink>
            </li>
            <li :class="['nav-item', { active: activeKey === 'scrapers' }]">
              <RouterLink to="/scrapers" class="nav-link">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-5 3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 8h-8v-1c0-1.33 2.67-2 4-2s4 .67 4 2v1z"
                  />
                </svg>
                <span class="nav-label">Scrapers</span>
              </RouterLink>
            </li>
            <li :class="['nav-item', { active: activeKey === 'logs' }]">
              <RouterLink to="/logs" class="nav-link">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
                  />
                </svg>
                <span class="nav-label">Logs</span>
              </RouterLink>
            </li>
            <li :class="['nav-item', { active: activeKey === 'config' }]">
              <RouterLink to="/config" class="nav-link">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
                  />
                </svg>
                <span class="nav-label">Config</span>
              </RouterLink>
            </li>
            <li :class="['nav-item', { active: activeKey === 'proxies' }]">
              <RouterLink to="/proxies" class="nav-link">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
                  />
                </svg>
                <span class="nav-label">Proxies</span>
              </RouterLink>
            </li>
          </ul>
        </nav>

        <!-- Sidebar Toggle Button -->
        <button
          @click="toggleSidebar"
          class="sidebar-toggle-btn"
          title="Toggle sidebar"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path v-if="!sidebarCollapsed" d="M3 7h10v2H3z" />
            <path v-else d="M7 3v10h2V3z" />
          </svg>
        </button>
      </aside>

      <!-- Main Content Area -->
      <main class="app-main-content">
        <div class="content-wrapper">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ============================================
   APP MAIN LAYOUT
   ============================================ */
.app-main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: #101014;
  color: rgba(255, 255, 255, 0.82);
}

/* ============================================
   APP HEADER
   ============================================ */
.app-header {
  flex-shrink: 0;
  height: 56px;
  background: #18181c;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  z-index: 100;
}

.app-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
}

.app-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
}

/* Connection Badge */
.connection-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.connection-badge.connected {
  background: rgba(99, 226, 183, 0.15);
  color: #63e2b7;
  border: 1px solid rgba(99, 226, 183, 0.3);
}

.connection-badge.disconnected {
  background: rgba(232, 128, 128, 0.15);
  color: #e88080;
  border: 1px solid rgba(232, 128, 128, 0.3);
}

/* Header Right Stats */
.app-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stats-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.stats-divider {
  color: rgba(255, 255, 255, 0.2);
}

/* ============================================
   APP BODY (Sidebar + Content)
   ============================================ */
.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ============================================
   APP SIDEBAR
   ============================================ */
.app-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #18181c;
  border-right: 1px solid rgba(255, 255, 255, 0.09);
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.app-sidebar.collapsed {
  width: 64px;
}

.app-sidebar.collapsed .nav-label {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

/* Sidebar Navigation */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-menu {
  list-style: none;
  margin: 0;
  padding: 8px;
}

.nav-item {
  margin-bottom: 4px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  border-radius: 4px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.nav-item.active .nav-link {
  background: rgba(99, 226, 183, 0.1);
  color: #63e2b7;
  border-left: 3px solid #63e2b7;
  padding-left: 13px;
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.nav-label {
  transition:
    opacity 0.3s,
    width 0.3s;
}

/* Sidebar Toggle Button */
.sidebar-toggle-btn {
  width: 100%;
  height: 40px;
  padding: 0;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}

.sidebar-toggle-btn svg {
  width: 16px;
  height: 16px;
}

/* ============================================
   APP MAIN CONTENT
   ============================================ */
.app-main-content {
  flex: 1;
  overflow: hidden;
  background: #101014;
  min-width: 0;
}

.content-wrapper {
  height: 100%;
  padding: 16px 0 0 16px;
  overflow: auto;
}

/* Scrollbar styling for content */
.content-wrapper::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.content-wrapper::-webkit-scrollbar-track {
  background: #18181c;
}

.content-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.content-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Sidebar scrollbar */
.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
