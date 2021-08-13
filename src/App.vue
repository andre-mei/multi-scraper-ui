<script setup lang="ts">
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
} from "naive-ui";
import { RouterView } from "vue-router";
import AppLayout from "./components/layout/AppLayout.vue";
import { useWebSocket } from "./composables/useWebSocket";

// Initialize WebSocket connection
const { connect } = useWebSocket();
connect();
</script>

<template>
  <NConfigProvider :theme="darkTheme">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <AppLayout>
            <RouterView />
          </AppLayout>
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
/* Global dark theme styles */
:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu,
    Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #101014;
  color: rgba(255, 255, 255, 0.82);
}

#app {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
