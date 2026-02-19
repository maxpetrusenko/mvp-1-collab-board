# Per-User Boards with Sharing - Research

**Date**: 2026-02-18
**Requirements**: FR-20, FR-21, FR-22 from PRD.md
**Focus**: Implement per-user boards with sharing capability

---

## Status Refresh (Implemented)

- Owner/shared board model is now active (`ownerId`, `sharedWith`).
- Board list is filtered to owned/shared entries.
- Share/revoke flow is available in boards panel.
- Route-level access denied UX blocks unshared users.

> Historical pre-implementation notes are retained below for architecture traceability.

---

## Current State Analysis

### Board Model

**Firestore Collection**: `boards`

**BoardMeta Type** (`BoardPage.tsx:114-121`):
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt?: number
  updatedAt?: number
}
```

**Key Finding**: Board metadata is stored but **ownership is not enforced**. The `createdBy` field exists but is not used for access control.

### Current Access Control

**Firestore Rules** (`firestore.rules:8-14`):
```javascript
match /boards/{boardId} {
  allow read, write: if isSignedIn();

  match /{document=**} {
    allow read, write: if isSignedIn();
  }
}
```

**Critical Gap**: Any authenticated user can read/write ANY board. There is no:
- Per-user board ownership
- Sharing mechanism
- Permission checking (edit vs view-only)

### Current Routing

**App.tsx:22-24**:
```tsx
<Route path="/b/:boardId" element={<BoardPage />} />
<Route path="*" element={<Navigate to={`/b/${defaultBoardId}`} replace />} />
```

- URL pattern: `/b/{boardId}` (matches FR-20 requirement)
- No ownership check on navigation
- Default board fallback from env var

### Existing Board Management UI

**BoardPage.tsx** has board management:
- Boards panel: `showBoardsPanel` state
- Board list from Firestore query (line 568)
- Create board form (lines 3108-3150+)
- Delete board functionality: `deleteBoardMeta`
- Query: `query(collection(db, 'boards'), orderBy('updatedAt', 'desc'), firestoreLimit(80))`

**Missing**: Boards list shows ALL boards, not just user's own or shared boards.

---

## Requirements (from PRD.md)

### FR-20: Canonical Share URL
- Each board has `/b/{boardId}` URL pattern ✅ (implemented)
- Share URL resolves board route ✅ (implemented)

### FR-21: Authentication Requirement
- Opening share URL requires auth ✅ (implemented in LoginPage)
- Unauthenticated users redirected to sign-in ✅ (App.tsx redirects to login)

### FR-22: Permission Check
- Share URL resolves board route, but **edit rights are permission-checked** ❌ (NOT implemented)

---

## Implementation Options

### Option A: Simple Owner-Based Sharing (Recommended for MVP)

**Schema Changes**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string           // NEW: explicit owner
  sharedWith: string[]      // NEW: array of userIds with access
  createdAt: number
  updatedAt: number
}
```

**Firestore Rules**:
```javascript
match /boards/{boardId} {
  allow read: if isSignedIn() && (
    resource.data.ownerId == request.auth.uid ||
    request.auth.uid in resource.data.sharedWith
  );
  allow write: if isSignedIn() && (
    resource.data.ownerId == request.auth.uid
  );

  match /boardObjects/{objectId} {
    allow read, write: if isSignedIn() && (
      get(/databases/$(database)/documents/boards/$(boardId)).data.ownerId == request.auth.uid ||
      request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.sharedWith
    );
  }
}
```

**UI Changes Needed**:
1. Boards panel filters to show only user's own + shared boards
2. Add "Share" button to board settings
3. Share dialog: invite by email (lookup userId from Firebase Auth)
4. Show "Owner" vs "Can edit" indicators

**Pros**:
- Simple to understand
- Minimal schema change
- Fits MVP timeline
- Clear ownership model

**Cons**:
- No permission levels (all shared users can edit)
- Email lookup requires additional implementation

### Option B: Role-Based Permissions (Post-MVP)

**Schema**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  // Roles: 'owner', 'editor', 'viewer'
  collaborators: Array<{ userId: string, role: string }>
  createdAt: number
  updatedAt: number
}
```

**Pros**:
- View-only mode possible
- More professional

**Cons**:
- More complex UI
- More complex rules
- View-only mode requires UI changes (disable editing)

### Option C: Public/Private Boards

**Schema**:
```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string
  visibility: 'private' | 'public' | 'organization'
  sharedWith: string[]  // for private boards
  createdAt: number
  updatedAt: number
}
```

**Pros**:
- Public boards can be accessed by anyone with URL
- Good for templates/demos

**Cons**:
- More complex
- Public boards have security implications

---

## Recommended Implementation Plan (Option A)

### Phase 1: Data Model Migration

1. **Add `ownerId` to boards collection**
   - Migration script to set `ownerId = createdBy` for existing boards
   - Update `createBoard()` to set `ownerId` on creation

2. **Add `sharedWith` array**
   - Initialize empty for existing boards
   - Update type definitions

### Phase 2: Firestore Security Rules

1. **Update rules to enforce ownership**
   - Board metadata: owner can write, owner+shared can read
   - Board objects: inherit board permissions
   - Presence/activity: inherit board permissions

### Phase 3: UI Changes

1. **Filter boards list**
   - Only show boards where user is owner or in `sharedWith`
   - Update Firestore query with multiple conditions (needs query restructuring or composite)

2. **Add sharing UI**
   - "Share" button in board panel
   - Input for email address
   - Convert email to userId (via Firebase Admin SDK or client-side auth lookup)
   - Add to `sharedWith` array
   - List of collaborators with remove option

3. **Board access check**
   - On `/b/{boardId}` navigation, verify access
   - Redirect to board list if no access
   - Show "You don't have access to this board" message

### Phase 4: Tests

1. **Unit tests**: Permission checking logic
2. **E2E tests**:
   - User A creates board, User B cannot access
   - User A shares with User B, User B can access
   - User B can edit shared board
   - User A removes User B, access revoked

---

## Implementation Complexity Assessment

| Aspect | Complexity | Notes |
|--------|-----------|-------|
| Schema change | Low | Add 2 fields to BoardMeta |
| Firestore rules | Medium | Need to test thoroughly |
| Migration script | Low | One-time update |
| Boards list filtering | Medium | Firestore doesn't support OR queries efficiently |
| Email-to-userId lookup | Medium | Need Firebase Admin function or client lookup |
| Share UI | Low | Simple form |
| Access check on navigation | Low | Simple conditional |
| Tests | Medium | Multi-user E2E tests |

**Estimated effort**: 4-6 hours for complete implementation

---

## Files Requiring Changes

1. **Types**: `app/src/types/board.ts` - Update BoardMeta
2. **BoardPage**: `app/src/pages/BoardPage.tsx`
   - `createBoard()` - set ownerId
   - Boards query - filter for access
   - Add share UI
   - Add access check on mount
3. **Firestore rules**: ` firestore.rules` - Add permission checks
4. **Functions**: `functions/index.js` - Add `shareBoard` cloud function (email → userId)
5. **Tests**: Add sharing E2E tests
6. **Migration**: One-time script to add `ownerId` to existing boards

---

## Related Requirements Coverage

After implementation:
- ✅ FR-20: `/b/{boardId}` URL pattern (done)
- ✅ FR-21: Auth required before access (done)
- ✅ FR-22: Edit rights permission-checked (implemented)
- ✅ PRD FR: "Each user has their own boards with sharing capability"

---

## Risks & Considerations

1. **Firestore Query Limitations**: Cannot efficiently query `where owner == uid OR sharedWith contains uid`. Solutions:
   - Denormalize: create `userBoards` subcollection
   - Client-side filter (not scalable for many boards)
   - Use array-contains for sharedWith only, separate query for owned

2. **Email Lookup**: Firebase Auth doesn't provide uid-by-email lookup from client. Solutions:
   - Cloud function with Admin SDK
   - Maintain users collection for lookup

3. **Migration Safety**: Existing boards need `ownerId` set correctly

4. **Test Data**: E2E tests create boards with random IDs - need to account for ownership

---

## References

- `app/src/types/board.ts` - BoardObject, BoardMeta types
- `app/src/pages/BoardPage.tsx` - Board list, create, delete
- `app/src/state/AuthContext.tsx` - User auth state
- `firestore.rules` - Security rules
- `docs/PRD.md` - FR-20, FR-21, FR-22
- `docs/Requirements.md` - Board access and sharing section
