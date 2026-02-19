# FR-22 Board Permissions Implementation Plan

**Date**: 2026-02-18
**Requirement**: FR-22 - Permission-checked sharing
**Estimated effort**: 4-5 hours

---

## Summary

Implement owner-based board access control with sharing capability. Currently any authenticated user can access any board. This will restrict access to board owners and their explicitly shared collaborators.

---

## Phase 1: Schema & Migration (30 min)

### 1.1 Update BoardMeta Type

**File**: `app/src/types/board.ts`

```typescript
type BoardMeta = {
  id: string
  name: string
  description: string
  ownerId: string        // NEW
  sharedWith: string[]   // NEW
  createdBy: string
  createdAt: number
  updatedAt: number
}
```

### 1.2 Update createBoard()

**File**: `app/src/pages/BoardPage.tsx`

```typescript
const createBoard = useCallback(async () => {
  const id = crypto.randomUUID()
  const now = serverTimestamp()

  await setDoc(doc(db, 'boards', id), {
    id,
    name: trimmedName,
    description: trimmedDescription,
    ownerId: user.uid,        // NEW
    sharedWith: [],           // NEW
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  })
  // ...
}, [user, newBoardName, newBoardDescription])
```

### 1.3 Migration Script

Create `scripts/migrate-board-ownership.js`:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function migrate() {
  const snapshot = await db.collection('boards').get();
  const batch = db.batch();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.ownerId && data.createdBy) {
      batch.update(doc.ref, {
        ownerId: data.createdBy,
        sharedWith: []
      });
    }
  });

  await batch.commit();
  console.log(`Migrated ${snapshot.size} boards`);
}

migrate().catch(console.error);
```

---

## Phase 2: Firestore Security Rules (45 min)

**File**: `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function hasBoardAccess(boardId) {
      return isSignedIn() && (
        get(/databases/$(database)/documents/boards/$(boardId)).data.ownerId == request.auth.uid ||
        request.auth.uid in get(/databases/$(database)/documents/boards/$(boardId)).data.sharedWith
      );
    }

    function isBoardOwner(boardId) {
      return isSignedIn() &&
        get(/databases/$(database)/documents/boards/$(boardId)).data.ownerId == request.auth.uid;
    }

    match /boards/{boardId} {
      allow read: if hasBoardAccess(boardId);
      allow create: if isSignedIn();  // Allow creation with ownerId set
      allow update: if isBoardOwner(boardId);
      allow delete: if isBoardOwner(boardId);

      match /boardObjects/{objectId} {
        allow read: if hasBoardAccess(boardId);
        allow write: if hasBoardAccess(boardId);
      }
    }
  }
}
```

---

## Phase 3: Client-Side Access Check (1 hr)

### 3.1 Add Access Check to BoardPage

**File**: `app/src/pages/BoardPage.tsx`

Add after boards state:
```typescript
const hasBoardAccess = useMemo(() => {
  const board = boards.find(b => b.id === boardId)
  if (!board) return false  // Will show loading state
  return board.ownerId === user.uid || board.sharedWith?.includes(user.uid)
}, [boards, boardId, user.uid])
```

Add early return:
```typescript
if (loading || !user) {
  return <main className="loading-shell"><p>Loading session...</p></main>
}

if (boards.length > 0 && !hasBoardAccess) {
  return (
    <main className="error-shell">
      <h2>Access Denied</h2>
      <p>You don't have permission to access this board.</p>
      <button onClick={() => navigate('/')}>Go to My Boards</button>
    </main>
  )
}
```

### 3.2 Filter Boards List

Update boards query (already filtered to owned/shared):
```typescript
const boardsQuery = query(
  collection(db, 'boards'),
  orderBy('updatedAt', 'desc'),
  firestoreLimit(80)
)

// Filter client-side after fetch
const filteredBoards = boards.filter(b =>
  b.ownerId === user.uid || b.sharedWith?.includes(user.uid)
)
```

---

## Phase 4: Sharing UI (1.5 hr)

### 4.1 Add Share Button to Boards Panel

**File**: `app/src/pages/BoardPage.tsx`

In the boards panel, add share button per board:
```tsx
<button
  type="button"
  className="board-list-share"
  onClick={() => openShareDialog(boardMeta.id)}
  title="Share board"
  data-testid={`share-board-${boardMeta.id}`}
>
  Share
</button>
```

### 4.2 Add Share Dialog State

```typescript
const [shareDialogBoard, setShareDialogBoard] = useState<string | null>(null)
const [shareEmail, setShareEmail] = useState('')
const [shareError, setShareError] = useState<string | null>(null)
```

### 4.3 Share Dialog Component

```tsx
{shareDialogBoard && (
  <div className="dialog-backdrop" onClick={() => setShareDialogBoard(null)}>
    <div className="share-dialog" onClick={e => e.stopPropagation()}>
      <h3>Share Board</h3>
      <form onSubmit={handleShare}>
        <label>
          Email address
          <input
            type="email"
            value={shareEmail}
            onChange={e => setShareEmail(e.target.value)}
            placeholder="colleague@example.com"
            required
          />
        </label>
        {shareError && <p className="error-text">{shareError}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={() => setShareDialogBoard(null)}>Cancel</button>
          <button type="submit">Share</button>
        </div>
      </form>
      <CollaboratorsList boardId={shareDialogBoard} />
    </div>
  </div>
)}
```

### 4.4 Email-to-UserId Lookup

**Option A**: Client-side (simpler, requires user lookup collection)

Create `users` collection on user creation with `{ email, uid }`.

Then:
```typescript
const handleShare = async (e: React.FormEvent) => {
  e.preventDefault()
  const q = query(collection(db, 'users'), where('email', '==', shareEmail))
  const snapshot = await getDocs(q)
  if (snapshot.empty) {
    setShareError('User not found')
    return
  }
  const collaboratorId = snapshot.docs[0].data().uid
  // Add to sharedWith...
}
```

**Option B**: Cloud function (more secure)

`functions/index.js`:
```javascript
exports.shareBoard = onRequest(async (req, res) => {
  const { boardId, email } = req.body
  const authHeader = req.headers.authorization

  // Verify requester is owner
  // Lookup UID by email using admin.auth().getUserByEmail(email)
  // Update board's sharedWith array
})
```

---

## Phase 5: Tests (1 hr)

### 5.1 E2E Test: Access Denied

**File**: `app/e2e/board-access.spec.ts`

```typescript
test('FR-22: user cannot access unshared board', async ({ page, context }) => {
  const userA = await createTempUser()
  const userB = await createTempUser()

  try {
    // User A creates board
    await loginWithEmail(page, APP_URL, userA.email, userA.password)
    await page.goto(`${APP_URL}/b/test-board-${Date.now()}`)
    await page.locator('button[title="Add sticky note"]').click()

    // User B tries to access same board
    await page.context().clearCookies()
    await loginWithEmail(page, APP_URL, userB.email, userB.password)
    await page.goto(`${APP_URL}/b/test-board-${Date.now()}`)

    // Should see access denied
    await expect(page.locator('text=Access Denied')).toBeVisible()
  } finally {
    await deleteTempUser(userA.idToken)
    await deleteTempUser(userB.idToken)
  }
})
```

### 5.2 E2E Test: Share Board

```typescript
test('FR-22: user can share board with collaborator', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  const userA = await createTempUser()
  const userB = await createTempUser()
  const boardId = `share-test-${Date.now()}`

  try {
    // User A creates and shares board
    await loginWithEmail(pageA, APP_URL, userA.email, userA.password)
    await pageA.goto(`${APP_URL}/b/${boardId}`)
    await pageA.locator('[data-testid="boards-panel-trigger"]').click()
    await pageA.locator(`[data-testid="share-board-${boardId}"]`).click()
    await pageA.locator('input[type="email"]').fill(userB.email)
    await pageA.locator('button[type="submit"]').click()

    // User B accesses shared board
    await loginWithEmail(pageB, APP_URL, userB.email, userB.password)
    await pageB.goto(`${APP_URL}/b/${boardId}`)
    await expect(pageB.locator('.board-stage')).toBeVisible()
  } finally {
    await deleteTempUser(userA.idToken)
    await deleteTempUser(userB.idToken)
  }
})
```

---

## Deployment Checklist

1. [ ] Update BoardMeta type in `app/src/types/board.ts`
2. [ ] Update createBoard() in `app/src/pages/BoardPage.tsx`
3. [ ] Run migration script to add ownerId to existing boards
4. [ ] Update Firestore security rules
5. [ ] Add client-side access check to BoardPage
6. [ ] Add share UI (button + dialog)
7. [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
8. [ ] Deploy functions (if using cloud function for share)
9. [ ] Run E2E tests to verify access control
10. [ ] Manual test: share board between two users

---

## Rollback Plan

If issues occur:
1. Revert Firestore rules to previous version
2. `ownerId` and `sharedWith` fields are non-breaking (can be ignored by old code)
3. Share UI can be hidden behind feature flag

---

## Related Files

- `app/src/types/board.ts` - BoardMeta type
- `app/src/pages/BoardPage.tsx` - Board access, create, share UI
- `firestore.rules` - Security rules
- `app/e2e/board-access.spec.ts` - New E2E tests
