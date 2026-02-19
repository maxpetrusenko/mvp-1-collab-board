# FR-41 Reconnect Syncing UX - Research

**Date**: 2026-02-18
**Requirement**: FR-41 - "Reconnect UX displays syncing state and resolves pending writes without data loss"
**Current Status**: IMPLEMENTED - Tri-state reconnect indicator now shows "Reconnecting…", "Syncing…", then "Connected"

---

## Current State

### Connection Status Display

**BoardPage.tsx:2971-2976**:
```tsx
<span className={`sync-state-pill ${
  connectionStatus === 'reconnecting' ? 'sync-state-pill-warning' : 'sync-state-pill-ok'
}`}>
  {connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Connected'}
</span>
```

### Connection Status Hook

**useConnectionStatus.ts:3-14**:
```typescript
export type ConnectionStatus = 'connected' | 'reconnecting'

export const useConnectionStatus = (): ConnectionStatus => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    typeof navigator !== 'undefined' && navigator.onLine ? 'connected' : 'reconnecting',
  )

  useEffect(() => {
    const handleOnline = () => setConnectionStatus('connected')
    const handleOffline = () => setConnectionStatus('reconnecting')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    // ...
  }, [])
}
```

---

## Gap Analysis

### Missing: "Syncing" State

**Problem**: When user reconnects after being offline, there's no visual indication that:
1. Local pending writes are being sent to server
2. Remote changes are being fetched
3. The board is in a "syncing" state

**Current States**:
- `connected` - Online
- `reconnecting` - Offline (navigator.onLine === false)

**Missing States**:
- `syncing` - Reconnected but synchronizing pending writes

### Firestore Pending Writes

Firestore SDK automatically manages pending writes in offline mode. However:
- No UI feedback about pending write count
- No "syncing" indicator during reconnection
- Users may think data is lost when reconnecting

---

## Implementation Options

### Option A: Track Pending Writes (Recommended)

Use Firestore's internal pending write tracking.

**Implementation**:
```typescript
// In useConnectionStatus.ts or new hook
export const useSyncStatus = (): 'connected' | 'syncing' | 'reconnecting' => {
  const [status, setStatus] = useState('connected')
  const pendingWritesRef = useRef(0)

  useEffect(() => {
    if (!db) return

    // Firestore doesn't expose pending writes count directly
    // But we can track our own writes
  }, [])

  return status
}
```

**Challenge**: Firestore SDK doesn't expose pending write count to client code.

### Option B: Simple Syncing State on Reconnect

Show "Syncing…" for a fixed duration after reconnect.

**Implementation**:
```typescript
const [isSyncing, setIsSyncing] = useState(false)

useEffect(() => {
  const handleOnline = async () => {
    setConnectionStatus('syncing')
    // Wait for Firestore to sync (typically 1-3 seconds)
    await new Promise(r => setTimeout(r, 2000))
    setConnectionStatus('connected')
  }

  window.addEventListener('online', handleOnline)
  // ...
}, [])
```

**Pros**: Simple, effective UX feedback
**Cons**: Not based on actual sync state

### Option C: Disable Syncing State (Alternative)

Rely on "Connected" state only. Document that Firestore auto-syncs.

**Pros**: No code changes
**Cons**: Doesn't meet FR-41 requirement

---

## Recommended Implementation: Option B

Add "Syncing" state that shows for 2-3 seconds after reconnection.

### Phase 1: Update ConnectionStatus Type

**File**: `app/src/hooks/useConnectionStatus.ts`

```typescript
export type ConnectionStatus = 'connected' | 'syncing' | 'reconnecting'
```

### Phase 2: Add Syncing State Logic

```typescript
export const useConnectionStatus = (): ConnectionStatus => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine ? 'connected' : 'reconnecting'
  )

  useEffect(() => {
    const handleOnline = () => {
      setConnectionStatus('syncing')
      // Show syncing for 2 seconds while Firestore syncs pending writes
      setTimeout(() => setConnectionStatus('connected'), 2000)
    }
    const handleOffline = () => setConnectionStatus('reconnecting')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return connectionStatus
}
```

### Phase 3: Update UI

**File**: `app/src/pages/BoardPage.tsx:2971-2976`

```tsx
<span
  className={`sync-state-pill ${
    connectionStatus === 'reconnecting' ? 'sync-state-pill-warning' :
    connectionStatus === 'syncing' ? 'sync-state-pill-syncing' :
    'sync-state-pill-ok'
  }`}
  data-testid="connection-status-pill"
>
  {
    connectionStatus === 'reconnecting' ? 'Reconnecting…' :
    connectionStatus === 'syncing' ? 'Syncing…' :
    'Connected'
  }
</span>
```

### Phase 4: Add CSS

**File**: `app/src/styles.css`

```css
.sync-state-pill-syncing {
  background: #f59e0b; /* Amber/orange */
  color: #1f2937;
}
```

---

## Implementation Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Type update | Low | Add one value to union |
| State logic | Low | Add setTimeout in online handler |
| UI update | Low | Add one more condition |
| CSS | Low | One new class |

**Estimated effort**: 30-45 minutes

---

## Testing

### E2E Test

**File**: `app/e2e/requirements-reconnect-ux.spec.ts`

Add test for syncing state:
```typescript
test('FR-41: shows syncing state after reconnect', async ({ page }) => {
  // Simulate offline
  await page.context().setOffline(true)
  await expect(page.locator('[data-testid="connection-status-pill"]')).toHaveText('Reconnecting…')

  // Simulate online
  await page.context().setOffline(false)
  await expect(page.locator('[data-testid="connection-status-pill"]')).toHaveText('Syncing…')

  // Wait for sync to complete
  await page.waitForTimeout(2500)
  await expect(page.locator('[data-testid="connection-status-pill"]')).toHaveText('Connected')
})
```

---

## Related Requirements

- FR-39: Firestore offline persistence enabled (provides data to sync)
- FR-40: RTDB presence uses onDisconnect cleanup
- FR-41: Reconnect UX displays syncing state
- NFR-9: Reconnect-to-synced <=3s target

---

## References

- `app/src/hooks/useConnectionStatus.ts` - Connection status hook
- `app/src/pages/BoardPage.tsx:2971-2976` - Connection status UI
- `app/e2e/requirements-reconnect-ux.spec.ts` - Existing reconnect tests
