import type { ScraperStatus, WorkerStatus, LogLevel, CommandStatus } from '@/types'

export function useStatusColors() {
  function getScraperStatusColor(status: ScraperStatus): string {
    const colors: Record<ScraperStatus, string> = {
      CONNECTED: '#18a058',
      RUNNING: '#18a058',
      IDLE: '#666666',
      STARTING: '#2080f0',
      PAUSED: '#f0a020',
      ERROR: '#d03050',
      ABORTED: '#d03050',
      VALIDATION_FAILED: '#d03050',
      DISCONNECTED: '#666666',
      STOPPING: '#f0a020',
      WAITING_APPROVAL: '#f0a020',
      COMPLETED: '#18a058'
    }
    return colors[status] || '#666666'
  }

  function getWorkerStatusColor(status: WorkerStatus): string {
    const colors: Record<WorkerStatus, string> = {
      INITIALIZING: '#2080f0', // SCP-15: browser starting
      RUNNING: '#18a058',
      IDLE: '#f0a020',
      PAUSED: '#f0a020',
      COMPLETED: '#18a058',
      ERROR: '#d03050',
      STOPPED: '#666666'
    }
    return colors[status] || '#666666'
  }

  function getLogLevelColor(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      TRACE: '#738274d3',
      DEBUG: '#c8c6c6e8',
      INFO: '#2080f0',
      WARN: '#f0a020',
      ERROR: '#d03050',
      FATAL: '#ff0000'
    }
    return colors[level] || '#ffffff'
  }

  function getCommandStatusColor(status: CommandStatus): string {
    const colors: Record<CommandStatus, string> = {
      PENDING: '#f0a020',
      DELIVERED: '#2080f0',
      ACKNOWLEDGED: '#2080f0',
      EXECUTING: '#2080f0',
      COMPLETED: '#18a058',
      FAILED: '#d03050',
      EXPIRED: '#666666'
    }
    return colors[status] || '#666666'
  }

  function getStatusType(status: ScraperStatus | WorkerStatus): 'success' | 'info' | 'warning' | 'error' | 'default' {
    if (status === 'INITIALIZING') return 'info' // SCP-15: blue tag while the browser starts
    if (status === 'RUNNING' || status === 'CONNECTED' || status === 'COMPLETED') return 'success'
    if (status === 'IDLE') return 'default'
    if (status === 'PAUSED' || status === 'STOPPING' || status === 'WAITING_APPROVAL') return 'warning'
    if (status === 'ERROR' || status === 'VALIDATION_FAILED' || status === 'ABORTED') return 'error'
    if (status === 'DISCONNECTED' || status === 'STOPPED') return 'default'
    return 'info'
  }

  return {
    getScraperStatusColor,
    getWorkerStatusColor,
    getLogLevelColor,
    getCommandStatusColor,
    getStatusType
  }
}
