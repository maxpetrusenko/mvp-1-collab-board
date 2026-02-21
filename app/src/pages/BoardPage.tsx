import { lazy, Suspense, useMemo } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'

import { defaultBoardId } from '../config/env'

const BoardPageRuntime = lazy(async () => {
  const module = await import('./BoardPageRuntime')
  return { default: module.BoardPageRuntime }
})

const BOARD_ID_MAX_LENGTH = 120
const BOARD_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

const normalizeBoardIdParam = (boardIdParam: string | undefined) => {
  const trimmed = (boardIdParam || '').trim()
  if (!trimmed) {
    return defaultBoardId
  }
  return trimmed
}

const isValidBoardId = (boardId: string) => {
  if (!boardId) {
    return false
  }

  if (boardId.length > BOARD_ID_MAX_LENGTH) {
    return false
  }

  return BOARD_ID_PATTERN.test(boardId)
}

const buildBoardPath = (boardId: string) => `/b/${encodeURIComponent(boardId)}`

const BoardPageSkeleton = ({ boardId }: { boardId: string }) => (
  <main className="board-page board-page-loading" aria-busy="true" aria-live="polite" data-testid="board-page-loading">
    <header className="board-header">
      <div className="board-title-group">
        <h1>Loading board…</h1>
        <p className="board-subtitle">{boardId}</p>
      </div>
    </header>
    <section className="board-content board-loading-content">
      <div className="board-loading-canvas" />
    </section>
  </main>
)

export const BoardPage = () => {
  const { boardId: boardIdParam } = useParams()
  const location = useLocation()

  const normalizedBoardId = useMemo(() => normalizeBoardIdParam(boardIdParam), [boardIdParam])

  if (!isValidBoardId(normalizedBoardId)) {
    return <Navigate to={buildBoardPath(defaultBoardId)} replace />
  }

  const canonicalPath = buildBoardPath(normalizedBoardId)
  if (location.pathname !== canonicalPath) {
    return <Navigate to={canonicalPath} replace />
  }

  return (
    <Suspense fallback={<BoardPageSkeleton boardId={normalizedBoardId} />}>
      <BoardPageRuntime />
    </Suspense>
  )
}
