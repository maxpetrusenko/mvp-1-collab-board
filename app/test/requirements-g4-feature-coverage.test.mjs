import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const boardPageSource = readFileSync(new URL('../src/pages/BoardPage.tsx', import.meta.url), 'utf8')
const aiPanelSource = readFileSync(new URL('../src/components/AICommandPanel.tsx', import.meta.url), 'utf8')
const boardEntrySource = readFileSync(new URL('../src/pages/BoardEntryPage.tsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const loginPageSource = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8')
const authContextSource = readFileSync(new URL('../src/state/AuthContext.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('TS-011 / RQ-011: board create UI exposes name/description form controls', () => {
  assert.equal(boardPageSource.includes('data-testid="board-create-form"'), true)
  assert.equal(boardPageSource.includes('data-testid="board-name-input"'), true)
  assert.equal(boardPageSource.includes('data-testid="board-description-input"'), true)
  assert.equal(boardPageSource.includes('data-testid="create-board-button"'), true)
  assert.equal(boardPageSource.includes('const createBoard = useCallback(async () => {'), true)
})

test('TS-012 / RQ-012: board list panel exists for board switching', () => {
  assert.equal(boardPageSource.includes('data-testid="board-list"'), true)
  assert.equal(boardPageSource.includes('data-testid="open-boards-panel"'), true)
  assert.equal(boardPageSource.includes('data-testid="board-list-owned"'), true)
  assert.equal(boardPageSource.includes('data-testid="board-list-shared"'), true)
  assert.equal(boardPageSource.includes('ownedBoards.map((boardMeta) => renderBoardListItem(boardMeta))'), true)
  assert.equal(boardPageSource.includes('scheduleBoardNavigate(boardMeta.id)'), true)
})

test('TS-013 / RQ-013: sticky palette is exactly five colors', () => {
  const match = boardPageSource.match(/const STICKY_COLOR_OPTIONS = \[(.*?)\]/s)
  assert.ok(match, 'STICKY_COLOR_OPTIONS array not found')
  const colors = [...match[1].matchAll(/#[0-9a-fA-F]{6}/g)].map((entry) => entry[0])
  assert.equal(colors.length, 5)
})

test('TS-014 / RQ-014: AI command history is collected and rendered in the panel', () => {
  assert.equal(boardPageSource.includes("collection(db, 'boards', boardId, 'aiCommands')"), true)
  assert.equal(boardPageSource.includes('history={aiCommandHistory}'), true)
  assert.equal(aiPanelSource.includes('data-testid="ai-command-history"'), true)
})

test('TS-015 / FR-7 / RQ-015: shift+click additive multi-select logic is present', () => {
  assert.equal(boardPageSource.includes('if (!additive) {'), true)
  assert.equal(boardPageSource.includes('if (prev.includes(objectId)) {'), true)
  assert.equal(boardPageSource.includes('onClick={(event) => handleStickySelection(boardObject, Boolean(event.evt.shiftKey))}'), true)
})

test('TS-016 / FR-7 / RQ-016: drag-box marquee selection handlers are wired', () => {
  assert.equal(boardPageSource.includes('const beginSelectionBox = useCallback('), true)
  assert.equal(boardPageSource.includes('const completeSelectionBox = useCallback('), true)
  assert.equal(boardPageSource.includes('beginSelectionBox(worldPoint)'), true)
  assert.equal(boardPageSource.includes('completeSelectionBox(Boolean(event.evt.shiftKey))'), true)
})

test('TS-017 / FR-7 / RQ-017: selected objects have explicit visual indicator rendering', () => {
  const selectedIndicatorCount = (boardPageSource.match(/dash=\{\[6, 4\]\}/g) || []).length
  assert.ok(selectedIndicatorCount >= 2, 'Expected dashed selection visuals in object rendering')
  assert.equal(boardPageSource.includes('const selected = selectedIdSet.has(boardObject.id)'), true)
})

test('TS-018 / FR-7 / RQ-018: bulk move for selected groups uses shared drag snapshot', () => {
  assert.equal(boardPageSource.includes('const multiDragSnapshotRef = useRef'), true)
  assert.equal(boardPageSource.includes('const beginObjectDrag = useCallback('), true)
  assert.equal(boardPageSource.includes('const moveObjectDrag = useCallback('), true)
  assert.equal(boardPageSource.includes('const endObjectDrag = useCallback('), true)
  assert.equal(boardPageSource.includes("selectedIds.length > 1 ? 'moved selection'"), true)
})

test('TS-019 / FR-7 / RQ-020: bulk duplicate duplicates every selected object', () => {
  assert.equal(boardPageSource.includes('const duplicateSelected = useCallback(async () => {'), true)
  assert.equal(boardPageSource.includes('for (const boardObject of selectedObjects) {'), true)
  assert.equal(boardPageSource.includes('setSelectedIds(duplicatedIds)'), true)
})

test('TS-020 / FR-7 / RQ-021: bulk color change applies selected color to all selected objects', () => {
  assert.equal(boardPageSource.includes('const applyColorToSelection = useCallback('), true)
  assert.equal(boardPageSource.includes('for (let index = 0; index < selectedObjects.length; index += 1)'), true)
  assert.equal(boardPageSource.includes('{ color },'), true)
})

test('TS-021 / RQ-023: resize handles exist and commit object size changes', () => {
  assert.equal(boardPageSource.includes('const RESIZE_HANDLE_SIZE = 14'), true)
  assert.equal(boardPageSource.includes('const commitResizeObject = useCallback('), true)
  assert.equal(boardPageSource.includes('data-testid={`resize-handle-${boardObject.id}`}'), true)
})

test('TS-022 / RQ-024: sticky single-click edit shortcut is implemented', () => {
  assert.equal(
    boardPageSource.includes('if (canEditBoard && !additive && selectedIds.length === 1 && selectedId === boardObject.id) {'),
    true,
  )
  assert.equal(boardPageSource.includes("startInlineEdit(boardObject, 'text')"), true)
})

test('TS-023 / UX: Escape clears current multi-selection', () => {
  assert.equal(boardPageSource.includes("if (event.key === 'Escape' && selectedIds.length > 0)"), true)
  assert.equal(boardPageSource.includes('setSelectedIds([])'), true)
})

test('TS-024 / UX: Cmd/Ctrl+A selects all board objects', () => {
  assert.equal(boardPageSource.includes("if (isMetaCombo && keyLower === 'a')"), true)
  assert.equal(
    boardPageSource.includes('setSelectedIds(objectsRef.current.map((boardObject) => boardObject.id))'),
    true,
  )
})

test('TS-025 / AI: submit path resolves auth token defensively for dev bypass sessions', () => {
  assert.equal(boardPageSource.includes('const resolveAuthToken = async () => {'), true)
  assert.equal(boardPageSource.includes("if (typeof user.getIdToken === 'function')"), true)
  assert.equal(
    boardPageSource.includes('if (auth?.currentUser && typeof auth.currentUser.getIdToken === \'function\')'),
    true,
  )
  assert.equal(boardPageSource.includes('const credentials = await signInAnonymously(auth)'), true)
})

test('TS-050 / FR-22+FR-16 UX: AI panel submit is disabled when board is not editable', () => {
  assert.equal(boardPageSource.includes('history={aiCommandHistory}'), true)
  assert.equal(boardPageSource.includes('disabled={!user || !canEditBoard || !hasLiveBoardAccess}'), true)
  assert.equal(aiPanelSource.includes('disabled={disabled || !command.trim()}'), true)
  assert.equal(boardPageSource.includes("throw new Error('Switch to edit mode to run AI commands.')"), true)
})

test('TS-026 / UX: toolbar exposes explicit Select and Area selection modes', () => {
  assert.equal(boardPageSource.includes('data-testid="selection-mode-select"'), true)
  assert.equal(boardPageSource.includes('data-testid="selection-mode-area"'), true)
  assert.equal(boardPageSource.includes("setSelectionMode('area')"), true)
  assert.equal(boardPageSource.includes("setSelectionMode('select')"), true)
})

test('TS-027 / UX: bottom toolbar creation actions open feature-specific popovers', () => {
  assert.equal(boardPageSource.includes('data-testid="add-shape-button"'), true)
  assert.equal(boardPageSource.includes('data-testid="shape-create-popover"'), true)
  assert.equal(boardPageSource.includes('data-testid="new-connector-style-picker"'), true)
  assert.equal(boardPageSource.includes('data-testid="connector-create-popover"'), true)
  assert.equal(boardPageSource.includes('data-testid="text-create-popover"'), true)
})

test('TS-028 / FR-41: interaction mode pill shows edit vs view state', () => {
  assert.equal(boardPageSource.includes('data-testid="interaction-mode-pill"'), true)
  assert.equal(boardPageSource.includes("'Edit mode'"), true)
  assert.equal(boardPageSource.includes("'View mode'"), true)
})

test('TS-030 / FR-22: board share controls and denied-access UI are present', () => {
  assert.equal(boardPageSource.includes('data-testid="board-access-denied"'), true)
  assert.equal(boardPageSource.includes('data-testid={`share-board-${boardMeta.id}`}'), true)
  assert.equal(boardPageSource.includes('data-testid="share-board-form"'), true)
  assert.equal(boardPageSource.includes('data-testid="share-email-input"'), true)
  assert.equal(boardPageSource.includes('data-testid="share-submit-button"'), true)
})

test('TS-043 / FR-22: denied-state fallback avoids routing loops when user has zero accessible boards', () => {
  assert.equal(boardPageSource.includes('onClick={() => navigate(\'/\')}'), true)
  assert.equal(boardPageSource.includes('Go to workspace'), true)
})

test('TS-044 / UX: workspace entry route resolves last-accessed or creates a new board', () => {
  assert.equal(boardEntrySource.includes("const LAST_BOARD_STORAGE_PREFIX = 'collabboard-last-board-id'"), true)
  assert.equal(boardEntrySource.includes('window.localStorage.getItem(lastBoardStorageKey)'), true)
  assert.equal(boardEntrySource.includes('if (!targetBoardId) {'), true)
  assert.equal(boardEntrySource.includes('name: \'My first board\''), true)
  assert.equal(boardEntrySource.includes('navigate(`/b/${targetBoardId}`, { replace: true })'), true)
})

test('TS-045 / UX: app/login route through workspace entry instead of fixed default board id', () => {
  assert.equal(appSource.includes('<Route path="/" element={<BoardEntryPage />} />'), true)
  assert.equal(appSource.includes('<Route path="*" element={<BoardEntryPage />} />'), true)
  assert.equal(loginPageSource.includes('return <Navigate to="/" replace />'), true)
})

test('TS-046 / FR-22: legacy owner-only board metadata is accepted and backfilled', () => {
  assert.equal(boardEntrySource.includes('const ownerIdCandidate ='), true)
  assert.equal(boardEntrySource.includes('const createdBy = createdByCandidate || ownerId'), true)
  assert.equal(boardPageSource.includes('const ownerIdCandidate ='), true)
  assert.equal(boardPageSource.includes('const createdBy = createdByCandidate || ownerId'), true)
  assert.equal(boardPageSource.includes('typeof rawData.createdBy !== \'string\''), true)
  assert.equal(boardPageSource.includes('createdBy: boardMeta.createdBy,'), true)
})

test('TS-047 / FR-22: share flow accepts handle lookup (uid/displayName/email-prefix) in addition to full email', () => {
  const functionsIndexSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
  assert.equal(functionsIndexSource.includes('const resolveCollaboratorId = async ({ email, userId }) => {'), true)
  assert.equal(functionsIndexSource.includes(".where('displayNameLower', '==', normalizedInput)"), true)
  assert.equal(functionsIndexSource.includes(".where('emailLower', '>=', emailPrefixStart)"), true)
  assert.equal(functionsIndexSource.includes('const emailPrefixStart = `${normalizedInput}@`'), true)
  assert.equal(boardPageSource.includes('Invite by email'), true)
  assert.equal(authContextSource.includes('displayNameLower: (user.displayName || \'\').trim().toLowerCase(),'), true)
})

test('TS-033 / T-060: board rename supports double-click inline edit in boards panel', () => {
  assert.equal(boardPageSource.includes('const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null)'), true)
  assert.equal(boardPageSource.includes('onDoubleClick={(event) => {'), true)
  assert.equal(boardPageSource.includes('data-testid={`rename-board-input-${boardMeta.id}`}'), true)
  assert.equal(boardPageSource.includes('const submitBoardRename = useCallback('), true)
})

test('TS-034 / T-061: slash command palette UI + keyboard handlers are present', () => {
  assert.equal(boardPageSource.includes('if (!isMetaCombo && !event.altKey && !event.shiftKey && event.key === \'/\')'), true)
  assert.equal(boardPageSource.includes('data-testid="command-palette"'), true)
  assert.equal(boardPageSource.includes('data-testid="command-palette-input"'), true)
  assert.equal(boardPageSource.includes('runCommandPaletteEntry(activeEntry)'), true)
})

test('TS-035 / T-068: object hover state is tracked and rendered for board objects', () => {
  assert.equal(boardPageSource.includes('const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)'), true)
  assert.equal(boardPageSource.includes("const hovered = hoveredObjectId === boardObject.id"), true)
  assert.equal(boardPageSource.includes('onMouseEnter={() => {'), true)
  assert.equal(boardPageSource.includes("container.style.cursor = 'pointer'"), true)
})

test('TS-049 / T-032 UX: vote badges render icon + numeric count with dynamic width for multi-vote clarity', () => {
  assert.equal(boardPageSource.includes('const voteCount = Object.keys(boardObject.votesByUser || {}).length'), true)
  assert.equal(boardPageSource.includes('voteCount > 0'), true)
  assert.equal(boardPageSource.includes('fill="#1d4ed8"'), true)
  assert.equal(boardPageSource.includes('String(voteCount)'), true)
})

test('TS-051 / FR-22: share dialog exposes role selection, defaults to edit, and renders collaborator role labels', () => {
  assert.equal(boardEntrySource.includes('const normalizeSharedRoles = ('), true)
  assert.equal(boardEntrySource.includes('sharedRoles: {},'), true)
  assert.equal(boardEntrySource.includes("Record<string, 'edit' | 'view'>"), true)
  assert.equal(boardPageSource.includes("const [shareRole, setShareRole] = useState<'edit' | 'view'>('edit')"), true)
  assert.equal(boardPageSource.includes('data-testid="share-role-select"'), true)
  assert.equal(boardPageSource.includes('data-testid={`share-collaborator-role-${collaboratorId}`}'), true)
  assert.equal(boardPageSource.includes('role: shareRole'), true)
  assert.equal(boardPageSource.includes('disabled={!roleCanEditBoard}'), true)
})

test('TS-052 / FR-16: local AI sticky parser accepts note alias to keep simple commands fast', () => {
  const functionsIndexSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
  assert.equal(functionsIndexSource.includes('\\b(?:sticky(?:\\s*note)?|sticker|note)s?\\b'), true)
  assert.equal(boardPageSource.includes('parseLocalMultiStickyCommand'), true)
})

test('TS-036 / T-062: template chooser modal and template apply wiring are present', () => {
  assert.equal(boardPageSource.includes('const [showTemplateChooser, setShowTemplateChooser] = useState(false)'), true)
  assert.equal(boardPageSource.includes('const applyTemplate = useCallback('), true)
  assert.equal(boardPageSource.includes('data-testid="template-chooser-button"'), true)
  assert.equal(boardPageSource.includes('data-testid="template-chooser"'), true)
  assert.equal(boardPageSource.includes("data-testid=\"template-option-retro\""), true)
})

test('TS-037 / T-063: dark mode state, persistence, and toggle UI are present', () => {
  assert.equal(boardPageSource.includes("const THEME_STORAGE_KEY = 'collabboard-theme'"), true)
  assert.equal(boardPageSource.includes("const [themeMode, setThemeMode] = useState<'light' | 'dark'>("), true)
  assert.equal(boardPageSource.includes('document.documentElement.dataset.theme = themeMode'), true)
  assert.equal(boardPageSource.includes('data-testid="theme-toggle-button"'), true)
})

test('TS-038 / T-067: view/edit mode toggle and edit-lock gating are present', () => {
  assert.equal(boardPageSource.includes("const [interactionMode, setInteractionMode] = useState<'edit' | 'view'>('edit')"), true)
  assert.equal(boardPageSource.includes('const roleCanEditBoard = useMemo(() => {'), true)
  assert.equal(boardPageSource.includes("const canEditBoard = interactionMode === 'edit' && roleCanEditBoard"), true)
  assert.equal(boardPageSource.includes('data-testid="interaction-mode-edit"'), true)
  assert.equal(boardPageSource.includes('data-testid="interaction-mode-view"'), true)
  assert.equal(boardPageSource.includes("if (!isMetaCombo && event.shiftKey && keyLower === 'e')"), true)
})

test('TS-039 / T-069: board duplicate action clones board metadata and objects', () => {
  assert.equal(boardPageSource.includes('const duplicateBoardMeta = useCallback('), true)
  assert.equal(boardPageSource.includes("getDocs(collection(dbInstance, 'boards', targetBoardId, 'objects'))"), true)
  assert.equal(boardPageSource.includes('data-testid={`duplicate-board-${boardMeta.id}`}'), true)
  assert.equal(boardPageSource.includes("run: () => duplicateBoardMeta(boardId)"), true)
})

test('TS-040 / T-070: minimap click-to-navigate wiring and viewport indicator are present', () => {
  assert.equal(boardPageSource.includes('const handleMinimapNavigate = useCallback('), true)
  assert.equal(boardPageSource.includes('onClick={handleMinimapNavigate}'), true)
  assert.equal(boardPageSource.includes('data-testid="minimap"'), true)
  assert.equal(boardPageSource.includes('data-testid="minimap-viewport"'), true)
})

test('G4-A11Y-001: contrast-aware text colors are used for board objects', () => {
  // Should import the contrast utility
  assert.equal(boardPageSource.includes("from '../lib/contrast'"), true)

  // Should use getContrastingTextColor for dynamic text color
  assert.equal(
    boardPageSource.includes('fill={getContrastingTextColor(boardObject.color)}'),
    true,
    'Expected getContrastingTextColor to be used for text fill',
  )

  // Verify utility exists
  const contrastSource = readFileSync(new URL('../src/lib/contrast.ts', import.meta.url), 'utf8')
  assert.equal(contrastSource.includes('export const getContrastingTextColor'), true)
  assert.equal(contrastSource.includes('getLuminance'), true)
  assert.equal(contrastSource.includes('getContrastRatio'), true)
})

test('G4-SHARE-001: share button is present in toolbar for board owners', () => {
  assert.equal(boardPageSource.includes('data-testid={`share-board-${boardMeta.id}`}'), true)
  assert.equal(boardPageSource.includes('title="Share board"'), true)
  assert.equal(boardPageSource.includes('openShareDialog(boardMeta.id)'), true)
})

test('G4-TIMER-001: timer editing functionality is present', () => {
  assert.equal(boardPageSource.includes('className="timer-widget"'), true)
  assert.equal(boardPageSource.includes('formatTimerLabel(effectiveTimerMs)'), true)
  assert.equal(boardPageSource.includes('title="Start timer"'), true)
  assert.equal(boardPageSource.includes('title="Pause timer"'), true)
  assert.equal(boardPageSource.includes('title="Reset timer"'), true)
})

test('G4-OFFSET-001: auto-offset is applied to newly created objects', () => {
  assert.equal(boardPageSource.includes('const duplicateObject = useCallback('), true)
  assert.equal(boardPageSource.includes('x: source.position.x + 24'), true)
  assert.equal(boardPageSource.includes('y: source.position.y + 24'), true)
  assert.equal(boardPageSource.includes('x: source.start.x + 24'), true)
  assert.equal(boardPageSource.includes('y: source.end.y + 24'), true)
})

test('G4-VOTING-001: voting works on all object types not just sticky notes', () => {
  // Should use toggleVoteOnObject (not toggleVoteOnSticky)
  assert.equal(boardPageSource.includes('const toggleVoteOnObject = useCallback('), true)

  // Should check permissions (canEditBoard, user) but NOT type restriction
  const voteFunctionStart = boardPageSource.indexOf('const toggleVoteOnObject = useCallback(')
  const voteFunctionEnd = boardPageSource.indexOf('const addComment = useCallback(', voteFunctionStart)
  assert.ok(voteFunctionStart >= 0 && voteFunctionEnd > voteFunctionStart, 'toggleVoteOnObject function not found')

  // Should NOT have sticky-note-only type checks.
  const voteFunctionBody = boardPageSource.slice(voteFunctionStart, voteFunctionEnd)
  assert.equal(voteFunctionBody.includes('stickyNote'), false, 'Should not check for stickyNote type')
  assert.equal(voteFunctionBody.includes('boardObject.id'), true, 'Should patch current object id')
  assert.equal(voteFunctionBody.includes('voted on ${boardObject.type}'), true, 'Should log action with object type')

  // Vote badges exist for shapes
  assert.equal(boardPageSource.includes('shapeType === \'rectangle\''), true)
  const shapeRenderIncludesVote = boardPageSource.includes('voteCount > 0') || boardPageSource.includes('{voteCount > 0')
  assert.ok(shapeRenderIncludesVote, 'Shape rendering should include vote badge')
})

test('G4-VOTING-002: vote badges are rendered on frames and shapes', () => {
  assert.equal(boardPageSource.includes('const voteCount = Object.keys(boardObject.votesByUser || {}).length'), true)
  assert.equal(boardPageSource.includes('voteCount > 0'), true)
  assert.equal(boardPageSource.includes('fill="#1d4ed8"'), true) // Blue vote badge
  assert.equal(boardPageSource.includes('String(voteCount)'), true)
})

test('G4-ROTATION-001: Miro-style drag-to-rotate handle is present', () => {
  // Rotation state tracking
  assert.equal(boardPageSource.includes('const [rotatingObjectId, setRotatingObjectId]'), true)
  assert.equal(boardPageSource.includes('const [localObjectRotations, setLocalObjectRotations]'), true)

  // Rotation handle UI (Circle at top of object with drag handlers)
  assert.equal(boardPageSource.includes('data-testid={`rotation-handle-${boardObject.id}`}'), true)
  assert.equal(boardPageSource.includes('cursor="grab"'), true)

  // Rotation handle has Line stem and Circle handle
  assert.equal(boardPageSource.includes('y2={-ROTATION_HANDLE_OFFSET}'), true)
  assert.equal(boardPageSource.includes('radius={ROTATION_HANDLE_SIZE / 2}'), true)

  // Drag handlers calculate angle from mouse position and normalize it
  assert.equal(boardPageSource.includes('Math.atan2(mouseY - centerY, mouseX - centerX)'), true)
  assert.equal(boardPageSource.includes('normalizeRotationDegrees'), true)

  // Uses local rotation state during drag and persists final value
  assert.equal(
    boardPageSource.includes('calculateRotationFromHandleTarget(event.target'),
    true,
  )
  assert.equal(
    boardPageSource.includes('localObjectRotationsRef.current[boardObject.id]'),
    true,
  )
  assert.equal(
    boardPageSource.includes('{ rotation: resolvedRotation }') ||
      boardPageSource.includes('{ rotation: finalRotation }'),
    true,
  )
})

test('G4-ROTATION-002: DOM overlay rotation handles support Playwright drag automation', () => {
  assert.equal(boardPageSource.includes('const rotationOverlayHandles = useMemo(() => {'), true)
  assert.equal(boardPageSource.includes('data-testid={`rotation-overlay-handle-${handle.objectId}`}'), true)
  assert.equal(boardPageSource.includes('const startRotationOverlayDrag = useCallback('), true)
  assert.equal(boardPageSource.includes('rotationOverlayDragRef.current = {'), true)
  assert.equal(boardPageSource.includes("window.addEventListener('mousemove', handleMouseMove)"), true)
  assert.equal(boardPageSource.includes("window.addEventListener('mouseup', handleMouseUp)"), true)
  assert.equal(stylesSource.includes('.rotation-overlay-layer'), true)
  assert.equal(stylesSource.includes('.rotation-overlay-handle'), true)
})

test('G4-GLM-001: GLM tool registry includes rotateObject, deleteObject, duplicateObject', () => {
  const glmSource = readFileSync(new URL('../../functions/src/tool-registry.js', import.meta.url), 'utf8')

  // rotateObject tool
  assert.equal(glmSource.includes("name: 'rotateObject'"), true)
  assert.equal(glmSource.includes('description: \'Rotate an object to a specific angle in degrees\''), true)
  assert.equal(glmSource.includes('angle'), true) // parameter

  // deleteObject tool
  assert.equal(glmSource.includes("name: 'deleteObject'"), true)
  assert.equal(glmSource.includes('description: \'Delete an object from the board\''), true)

  // duplicateObject tool
  assert.equal(glmSource.includes("name: 'duplicateObject'"), true)
  assert.equal(glmSource.includes('description: \'Create a duplicate of an existing object on the board\''), true)
  assert.equal(glmSource.includes('offsetX'), true) // optional offset parameter
  assert.equal(glmSource.includes('offsetY'), true)
})

test('G4-GLM-002: GLM function handlers implemented in index.js', () => {
  const glmIndexSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')

  // Handler functions
  assert.equal(glmIndexSource.includes('const rotateObject = async (ctx, args)'), true)
  assert.equal(glmIndexSource.includes('const deleteObject = async (ctx, args)'), true)
  assert.equal(glmIndexSource.includes('const duplicateObject = async (ctx, args)'), true)

  // normalizeRotationDegrees helper
  assert.equal(glmIndexSource.includes('const normalizeRotationDegrees = (degrees)'), true)

  // Registered in switch case
  assert.equal(glmIndexSource.includes("case 'rotateObject':"), true)
  assert.equal(glmIndexSource.includes("await rotateObject(ctx, toolCall.arguments)"), true)
  assert.equal(glmIndexSource.includes("case 'deleteObject':"), true)
  assert.equal(glmIndexSource.includes("case 'duplicateObject':"), true)

  // deleteObject marks as deleted
  assert.equal(glmIndexSource.includes('deleted: true'), true)
  assert.equal(glmIndexSource.includes('deletedAt: updatedAt'), true)

  // duplicateObject creates new ID and offsets position
  assert.equal(glmIndexSource.includes('const id = crypto.randomUUID()'), true)
  assert.equal(glmIndexSource.includes('const offsetX = parseNumber(args.offsetX, 30)'), true)
})
