import { useEffect, useState } from 'react'

export type ConnectionStatus = 'connected' | 'syncing' | 'reconnecting'
const SYNCING_PILL_DURATION_MS = 2_000

export const useConnectionStatus = (): ConnectionStatus => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'connected' : 'reconnecting',
  )

  useEffect(() => {
    let syncingTimer: ReturnType<typeof window.setTimeout> | null = null

    const clearSyncingTimer = () => {
      if (syncingTimer === null) {
        return
      }
      window.clearTimeout(syncingTimer)
      syncingTimer = null
    }

    const handleOnline = () => {
      clearSyncingTimer()
      setConnectionStatus('syncing')
      syncingTimer = window.setTimeout(() => {
        setConnectionStatus('connected')
        syncingTimer = null
      }, SYNCING_PILL_DURATION_MS)
    }
    const handleOffline = () => {
      clearSyncingTimer()
      setConnectionStatus('reconnecting')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearSyncingTimer()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return connectionStatus
}
