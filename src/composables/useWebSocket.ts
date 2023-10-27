import { ref, onUnmounted } from 'vue'
import { useScrapersStore, useLogsStore, useCommandsStore, useWorkersStore, useDataStore, useSinksStore, useRecordsStore } from '@/stores'
import type { 
  WSMessage, 
  WSScraperStatusPayload, 
  WSHealthUpdatePayload, 
  WSLogsPayload,
  WSCommandsPayload,
  Command
} from '@/types'

const WS_URL = `ws://${window.location.hostname}:8090/api/ws`
const RECONNECT_DELAY = 3000
const PING_INTERVAL = 30000

let socket: WebSocket | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const isConnected = ref(false)
const connectionError = ref<string | null>(null)

// ========== Event emitter for UI components ==========
type EventHandler = (payload: unknown) => void
const eventHandlers = new Map<string, Set<EventHandler>>()

function emitEvent(type: string, payload: unknown) {
  const handlers = eventHandlers.get(type)
  if (handlers) {
    handlers.forEach(handler => handler(payload))
  }
}

export function onWSEvent(type: string, handler: EventHandler) {
  if (!eventHandlers.has(type)) {
    eventHandlers.set(type, new Set())
  }
  eventHandlers.get(type)!.add(handler)
  
  // Return cleanup function
  return () => {
    eventHandlers.get(type)?.delete(handler)
  }
}

export function useWebSocket() {
  const scrapersStore = useScrapersStore()
  const logsStore = useLogsStore()
  const commandsStore = useCommandsStore()
  const dataStore = useDataStore()
  const sinksStore = useSinksStore()
  const recordsStore = useRecordsStore()

  function connect() {
    if (socket?.readyState === WebSocket.OPEN) {
      return
    }

    connectionError.value = null

    try {
      socket = new WebSocket(WS_URL)

      socket.onopen = () => {
        console.log('[WS] Connected to manager')
        isConnected.value = true
        connectionError.value = null
        
        // Start ping interval
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }))
          }
        }, PING_INTERVAL)
        
        // Initial data fetch
        scrapersStore.fetchScrapers()
      }

      socket.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (e) {
          console.error('[WS] Failed to parse message:', e)
        }
      }

      socket.onclose = (event) => {
        console.log('[WS] Connection closed:', event.code, event.reason)
        isConnected.value = false
        cleanup()
        scheduleReconnect()
      }

      socket.onerror = (error) => {
        console.error('[WS] Error:', error)
        connectionError.value = 'WebSocket connection error'
        isConnected.value = false
      }
    } catch (e) {
      console.error('[WS] Failed to connect:', e)
      connectionError.value = e instanceof Error ? e.message : 'Failed to connect'
      scheduleReconnect()
    }
  }

  function handleMessage(message: WSMessage) {
    switch (message.type) {
      case 'CONNECTED':
        console.log('[WS] Server acknowledged connection')
        break

      case 'SCRAPER_REGISTERED': {
        // New scraper registered - add to store reactively without refresh
        const payload = message.payload as { scraper: import('@/types').Scraper }
        console.log('[WS] New scraper registered:', payload.scraper.scraperId)
        scrapersStore.updateScraper(payload.scraper)
        break
      }

      case 'SCRAPER_STATUS_CHANGE': {
        const payload = message.payload as WSScraperStatusPayload
        scrapersStore.updateScraperStatus(
          payload.scraperId,
          payload.status,
          payload.currentStage,
          payload.statusHistory
        )
        // If scraper disconnected, reset logs initialization state
        if (payload.status === 'DISCONNECTED') {
          logsStore.resetInitialization(payload.scraperId)
        }
        break
      }

      case 'HEALTH_UPDATE': {
        const payload = message.payload as WSHealthUpdatePayload
        scrapersStore.updateScraper(payload.scraper)
        // Update workers if present in health update
        if (payload.scraper.workers && payload.scraper.workers.length > 0) {
          const workersStore = useWorkersStore()
          workersStore.updateWorkersForScraper(payload.scraper.scraperId, payload.scraper.workers)
        }
        break
      }

      case 'LOGS': {
        const payload = message.payload as WSLogsPayload
        logsStore.addLogs(payload.scraperId, payload.logs)
        break
      }

      case 'LOGS_CLEARED': {
        const payload = message.payload as { scraperId: string }
        logsStore.clearLogsLocally(payload.scraperId)
        break
      }

      case 'PAGINATION_COMPLETE': {
        const payload = message.payload as { scraperId: string }
        logsStore.markPaginationComplete(payload.scraperId)
        break
      }

      case 'DATA_UPDATE': {
        const payload = message.payload as import('@/types').DataUpdatePayload
        dataStore.handleDataUpdate(payload)
        break
      }

      case 'SINK_STATE': {
        const payload = message.payload as import('@/types').SinkStatePayload
        sinksStore.handleState(payload)
        break
      }

      case 'SINK_PAGE': {
        const payload = message.payload as import('@/types').SinkPagePayload
        sinksStore.handlePage(payload)
        break
      }

      case 'RECORD_JSON': {
        const payload = message.payload as import('@/types').RecordJsonPayload
        recordsStore.handle(payload)
        break
      }

      case 'COMMANDS_QUEUED':
      case 'COMMANDS_DELIVERED': {
        const payload = message.payload as WSCommandsPayload
        commandsStore.addQueuedCommands(payload.commands)
        break
      }

      case 'COMMAND_ACKNOWLEDGED': {
        const payload = message.payload as { command: Command }
        commandsStore.updateCommand(payload.command)
        break
      }

      case 'CONFIG_UPDATE': {
        const payload = message.payload as { scraperId: string }
        // Refresh scraper to get the updated setting values
        scrapersStore.fetchScraper(payload.scraperId)
        break
      }

      case 'SCRAPER_REMOVED': {
        const payload = message.payload as { scraperId: string }
        scrapersStore.removeScraper(payload.scraperId)
        // Reset logs initialization state for this scraper
        logsStore.resetInitialization(payload.scraperId)
        break
      }

      // ========== NEW gRPC-based Event Types ==========
      
      case 'SCRAPER_EVENT': {
        // Events from gRPC status stream (errors, warnings, stage changes)
        const payload = message.payload as {
          scraperId: string
          eventType: string
          severity: string
          message: string
          metadata: Record<string, string>
          timestamp: string
        }
        // Status history is managed server-side and delivered via
        // SCRAPER_STATUS_CHANGE and HEALTH_UPDATE — no local event creation.
        
        // Emit for any subscribers (e.g., notification system)
        emitEvent('SCRAPER_EVENT', payload)
        break
      }

      case 'CURATED_LOGS': {
        // Curated logs from gRPC log stream (UI-friendly logs selected by scraper)
        const payload = message.payload as {
          scraperId: string
          logs: Array<{
            timestamp: string
            level: string
            message: string
            context?: string
            workerId?: string
          }>
          count: number
          timestamp: string
        }
        // Add to logs store (they come formatted for UI display)
        logsStore.addCuratedLogs(payload.scraperId, payload.logs)
        emitEvent('CURATED_LOGS', payload)
        break
      }

      case 'TEST_STARTED': {
        // Test execution started
        const payload = message.payload as {
          scraperId: string
          testType: string
          testId: string
          correlationId: string
          timestamp: string
        }
        scrapersStore.setTestStatus(payload.scraperId, {
          running: true,
          testId: payload.testId,
          testType: payload.testType,
          progress: 0,
          correlationId: payload.correlationId
        })
        emitEvent('TEST_STARTED', payload)
        break
      }

      case 'TEST_PROGRESS': {
        // Test execution progress
        const payload = message.payload as {
          scraperId: string
          testId: string
          progress: number
          currentStep: string
          timestamp: string
        }
        scrapersStore.updateTestProgress(payload.scraperId, payload.progress, payload.currentStep)
        emitEvent('TEST_PROGRESS', payload)
        break
      }

      case 'TEST_COMPLETED': {
        // Test execution completed
        const payload = message.payload as {
          scraperId: string
          testId: string
          success: boolean
          summary: string
          errors: string[]
          timestamp: string
        }
        scrapersStore.setTestStatus(payload.scraperId, {
          running: false,
          testId: payload.testId,
          success: payload.success,
          summary: payload.summary,
          errors: payload.errors,
          completedAt: payload.timestamp
        })
        emitEvent('TEST_COMPLETED', payload)
        break
      }

      case 'GRPC_CONNECTION_STATE': {
        // gRPC connection state change
        const payload = message.payload as {
          scraperId: string
          state: 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING'
          details: string
          timestamp: string
        }
        scrapersStore.updateGrpcState(payload.scraperId, payload.state, payload.details)
        emitEvent('GRPC_CONNECTION_STATE', payload)
        break
      }

      case 'PONG':
        // Heartbeat response - connection is alive
        break

      default:
        console.log('[WS] Unknown message type:', message.type)
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    
    if (socket) {
      socket.close()
      socket = null
    }
    
    cleanup()
  }

  function cleanup() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return
    
    console.log(`[WS] Reconnecting in ${RECONNECT_DELAY}ms...`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, RECONNECT_DELAY)
  }

  function send(data: unknown) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data))
    }
  }

  // Cleanup on component unmount
  onUnmounted(() => {
    // Don't disconnect on unmount - keep connection alive
    // disconnect()
  })

  return {
    isConnected,
    connectionError,
    connect,
    disconnect,
    send
  }
}
