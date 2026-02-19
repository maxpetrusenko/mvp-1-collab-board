# FR-22 Permission-Checked Sharing - Research

**Date**: 2026-02-18
**Requirement**: FR-22 - "Share URL resolves board route, while edit rights are still permission-checked"
**Current Status**: PASS - Permission checking implemented and covered by tests

---

## Implementation Snapshot (Completed)

- Firestore rules enforce owner/shared access on board metadata + board subcollections.
- Frontend board route gate denies unshared access and prevents realtime listeners when denied.
- Backend API (`/api/boards/share`, `/api/ai/command`) enforces board access and owner-only sharing mutation.
- Share UI supports invite by email, collaborator listing, and revoke.
- Coverage includes:
  - `app/e2e/requirements-board-sharing.spec.ts`
  - `app/test/requirements-board-permissions-rules.test.mjs`
  - `functions/test/requirements-board-access.test.js`

> Historical pre-implementation analysis preserved below for traceability.

---

## Current State

### URL Routing

**App.tsx:22-23**:
```tsx
<Route path="/b/:boardId" element={<BoardPage />} />
```

Any `/b/{boardId}` URL resolves to `BoardPage` without permission check.

### Auth Gate

**App.tsx**:
- Unauthenticated users are redirected to `/login`
- After login, user can navigate to ANY board ID

**Missing**: Post-auth permission check.

### Firestore Security Rules

**firestore.rules:8-14**:
```javascript
match /boards/{boardId} {
  allow read, write: if isSignedIn();

  match /{document=**} {
    allow read, write: if isSignedIn();
  }
}
```

**Critical Gap**: Any signed-in user can read/write ANY board.

### BoardPage Access

**BoardPage.tsx** does not check:
- Is the user the owner of this board?
- Has the owner shared this board with the user?

**Result**: Authenticated users can access any board by guessing the URL.

---

## Requirements Breakdown

### FR-20: Canonical Share URL ✅
- Each board has `/b/{boardId}` URL pattern
- **Status**: IMPLEMENTED

### FR-21: Auth Required ✅
- Opening share URL requires authentication
- Unauthenticated users redirected to sign-in
- **Status**: IMPLEMENTED

### FR-22: Permission Check ❌ (Historical Pre-Implementation Snapshot)
- Share URL resolves board route
- **Edit rights are permission-checked**
- **Status**: NOT IMPLEMENTED

---

## Design Options

### Option A: Owner-Based Access Control (Recommended)

**Data Model**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string        // NEW: owner's userId
  sharedWith: string[]   // NEW: collaborators' userIds
  createdAt: number
  updatedAt: number
}
```

**Access Rules**:
- Owner: full read/write access
- Shared users: full read/write access
- Others: no access

**Firestore Rules**:
```javascript
match /boards/{boardId} {
  allow read: if isSignedIn() && (
    resource.data.ownerId == request.auth.uid ||
    request.auth.uid in resource.data.sharedWith
  );
  allow write: if isSignedIn() && resource.data.ownerId == request.auth.uid;

  match /boardObjects/{objectId} {
    allow read: if isSignedIn() && (
      get(/databases/$(database)/documents/boards/$(boardId)).data.ownerId == request.auth.uid ||
      request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.sharedWith
    );
    allow write: if isSignedIn() && (
      get(/databases/$(database)/documents/boards/$(boardId)).data.ownerId == request.auth.uid ||
      request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.sharedWith
    );
  }
}
```

**Pros**:
- Simple model
- Fits "sharing" use case well
- Clear ownership

**Cons**:
- No view-only mode (all shared users can edit)
- Migration needed for existing boards

### Option B: Role-Based Access Control

**Data Model**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  collaborators: Array<{
    userId: string
    role: 'viewer' | 'editor'
  }>
}
```

**Access Rules**:
- Owner: full access
- Editors: read/write
- Viewers: read-only

**Pros**:
- More professional
- View-only mode useful

**Cons**:
- More complex UI
- View-only requires disabling edit controls in UI
- More complex Firestore rules

### Option C: Public/Private Boards

**Data Model**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  visibility: 'private' | 'public'
  sharedWith: string[]
}
```

**Access Rules**:
- Public: anyone with URL can view (auth required)
- Private: only owner + shared users

**Pros**:
- Good for template boards
- Simple public/private toggle

**Cons**:
- Public boards have security implications
- More complex

---

## Recommended Implementation: Option A

### Phase 1: Data Migration

1. **Add `ownerId` field to boards**
   - Migration script: set `ownerId = createdBy` for existing boards
   - Update `createBoard()` to set `ownerId` on creation

2. **Add `sharedWith` field**
   - Initialize empty array `[]` for existing boards
   - Update `BoardMeta` type

### Phase 2: Firestore Rules Update

1. **Update board metadata rules**
   - Only owner can write
   - Owner + shared can read

2. **Update board object rules**
   - Inherit permissions from parent board
   - Use `get()` to lookup board permissions

3. **Update presence/activity rules**
   - Only users with board access can publish presence

### Phase 3: Client-Side Access Check

1. **Add access check on BoardPage mount**
   ```typescript
   const hasAccess = useMemo(() => {
     return boards.some(b => b.id === boardId && (
       b.ownerId === user.uid || b.sharedWith?.includes(user.uid)
     ))
   }, [boards, boardId, user.uid])

   if (!hasAccess) {
     return <Navigate to="/boards" replace />
   }
   ```

2. **Filter boards list**
   - Only show boards where user is owner or in `sharedWith`

### Phase 4: Sharing UI

1. **Add share button to board panel**
   - Opens share dialog

2. **Share dialog**:
   - Input: email address
   - Button: "Share"
   - List of current collaborators with remove option

3. **Backend: Email to userId lookup**
   - Cloud function: `shareBoard(boardId, email)`
   - Uses Firebase Admin SDK to lookup UID from email

---

## Files Requiring Changes

1. **Types**: `app/src/types/board.ts`
   - Add `ownerId`, `sharedWith` to BoardMeta

2. **BoardPage**: `app/src/pages/BoardPage.tsx`
   - `createBoard()` - set ownerId
   - Add access check on mount
   - Filter boards list
   - Add share UI

3. **Firestore Rules**: `firestore.rules`
   - Add permission checks

4. **Functions**: `functions/index.js`
   - Add `shareBoard` cloud function

5. **Migration Script** (one-time)
   - Add ownerId to existing boards

6. **Tests**
   - E2E: User A creates board, User B cannot access
   - E2E: User A shares with User B, User B can access
   - E2E: User A removes User B, access revoked

---

## Implementation Complexity

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Schema change | Low | Add 2 fields |
| Migration script | Low | One-time batch update |
| Firestore rules | Medium | Needs careful testing |
| Access check UI | Low | Simple conditional |
| Share UI | Medium | Dialog + email lookup |
| Email → userId | Medium | Cloud function |
| Tests | Medium | Multi-user E2E |

**Estimated effort**: 4-5 hours

---

## Edge Cases

1. **Board with no ownerId**: Treat as public during migration, then require ownership
2. **Deleted user in sharedWith**: Clean up on user deletion or ignore
3. **Owner leaves**: Transfer ownership or delete board
4. **Last collaborator removed**: Owner retains access

---

## Related Requirements

- FR-20: `/b/{boardId}` URL pattern
- FR-21: Auth required before board access
- FR-22: Edit rights permission-checked
- FR-9: Object changes sync across users (within access control)

---

## References

- `app/src/types/board.ts:114-121` - BoardMeta type (needs ownerId, sharedWith)
- `app/src/pages/BoardPage.tsx` - Board access and rendering
- `firestore.rules:8-14` - Current open access rules (needs tightening)
- `app/src/state/AuthContext.tsx` - User auth state (user.uid needed)
