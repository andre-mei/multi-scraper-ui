<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NTimeline, NTimelineItem, NText, NTag, NSpace, NEmpty } from 'naive-ui'
import type { Command } from '@/types'
import { useCommandsStore } from '@/stores/commands'
import { useStatusColors } from '@/composables/useStatusColors'
import { useFormatters } from '@/composables/useFormatters'

const props = defineProps<{
  scraperId: string
  limit?: number
}>()

const commandsStore = useCommandsStore()
const { getCommandStatusColor } = useStatusColors()
const { formatRelativeTime } = useFormatters()

const commands = computed(() => 
  commandsStore.getCommandsForScraper(props.scraperId).slice(0, props.limit || 20)
)

function getTimelineType(status: Command['status']): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'COMPLETED': return 'success'
    case 'FAILED': return 'error'
    case 'EXPIRED': return 'warning'
    case 'EXECUTING': return 'info'
    case 'PENDING':
    case 'DELIVERED':
    case 'ACKNOWLEDGED':
    default: return 'default'
  }
}

onMounted(() => {
  commandsStore.fetchCommands(props.scraperId)
})
</script>

<template>
  <div>
    <NEmpty v-if="commands.length === 0" description="No command history" />
    <NTimeline v-else>
      <NTimelineItem
        v-for="cmd in commands"
        :key="cmd.commandId"
        :type="getTimelineType(cmd.status)"
        :title="cmd.type"
        :time="formatRelativeTime(cmd.createdAt)"
      >
        <NSpace vertical :size="4">
          <NSpace align="center" :size="8">
            <NTag :color="{ color: getCommandStatusColor(cmd.status) + '33', textColor: getCommandStatusColor(cmd.status) }" size="small">
              {{ cmd.status }}
            </NTag>
            <NText v-if="cmd.workerId" code depth="3" class="text-xs">
              {{ cmd.workerId }}
            </NText>
          </NSpace>
          <NText v-if="cmd.errorMessage" type="error" class="text-xs">
            {{ cmd.errorMessage }}
          </NText>
        </NSpace>
      </NTimelineItem>
    </NTimeline>
  </div>
</template>
