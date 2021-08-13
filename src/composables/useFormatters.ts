export function useFormatters() {
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  function formatNumber(num: number): string {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`
    }
    if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`
    }
    return num.toString()
  }

  function formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`
    }
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}m ${secs}s`
    }
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  function formatTimestamp(timestamp: string | undefined): string {
    if (!timestamp) return '-'
    const date = new Date(timestamp)
    const formatted = date.toLocaleString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false
    })
    // Add milliseconds for precision
    const millis = date.getMilliseconds().toString().padStart(3, '0')
    return `${formatted}.${millis}`
  }

  function formatRelativeTime(timestamp: string | undefined): string {
    if (!timestamp) return '-'
    const date = new Date(timestamp)
    const now = new Date()
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffSeconds < 60) return `${diffSeconds}s ago`
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
    return `${Math.floor(diffSeconds / 86400)}d ago`
  }

  function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`
  }

  function formatRate(value: number): string {
    return `${value.toFixed(2)}/s`
  }

  return {
    formatBytes,
    formatNumber,
    formatDuration,
    formatTimestamp,
    formatRelativeTime,
    formatPercent,
    formatRate
  }
}
