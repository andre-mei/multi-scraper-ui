import { defineSetupStore } from './defineSetupStore'
import { ref } from 'vue'
import type { Command, CommandType, CommandResponse } from '@/types'
import { api } from '@/api'

export const useCommandsStore = defineSetupStore('commands', () => {
  // State: scraperId -> commands array
  const commandsByScraperId = ref<Map<string, Command[]>>(new Map())
  const pendingCommands = ref<Map<string, Command>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  function getCommandsForScraper(scraperId: string): Command[] {
    return commandsByScraperId.value.get(scraperId) || []
  }

  function getPendingCommand(commandId: string): Command | undefined {
    return pendingCommands.value.get(commandId)
  }

  // Actions
  async function sendCommand(
    scraperId: string,
    type: CommandType,
    options?: {
      workerId?: string
      workerIds?: string[]
      parameters?: Record<string, unknown>
    }
  ): Promise<CommandResponse | null> {
    loading.value = true
    error.value = null
    try {
      const response = await api.sendCommand(
        scraperId,
        type,
        options?.workerId,
        options?.workerIds,
        options?.parameters
      )
      
      // Refresh command history
      await fetchCommands(scraperId)
      
      return response
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to send command'
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchCommands(scraperId: string, limit = 50) {
    try {
      const data = await api.getCommandHistory(scraperId, limit)
      commandsByScraperId.value.set(scraperId, data)
      return data
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch commands'
      return []
    }
  }

  function updateCommand(command: Command) {
    // Update in pending
    if (pendingCommands.value.has(command.commandId)) {
      if (command.status === 'COMPLETED' || command.status === 'FAILED' || command.status === 'EXPIRED') {
        pendingCommands.value.delete(command.commandId)
      } else {
        pendingCommands.value.set(command.commandId, command)
      }
    }
    
    // Update in history
    const commands = commandsByScraperId.value.get(command.scraperId)
    if (commands) {
      const index = commands.findIndex(c => c.commandId === command.commandId)
      if (index >= 0) {
        commands[index] = command
      } else {
        commands.unshift(command)
      }
    }
  }

  function addQueuedCommands(commands: Command[]) {
    for (const cmd of commands) {
      pendingCommands.value.set(cmd.commandId, cmd)
      
      const scraperCommands = commandsByScraperId.value.get(cmd.scraperId)
      if (scraperCommands) {
        scraperCommands.unshift(cmd)
      } else {
        commandsByScraperId.value.set(cmd.scraperId, [cmd])
      }
    }
  }

  return {
    // State
    commandsByScraperId,
    pendingCommands,
    loading,
    error,
    // Getters
    getCommandsForScraper,
    getPendingCommand,
    // Actions
    sendCommand,
    fetchCommands,
    updateCommand,
    addQueuedCommands
  }
})
