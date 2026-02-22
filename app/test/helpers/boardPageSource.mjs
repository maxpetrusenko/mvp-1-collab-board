import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const pagesDir = path.resolve(process.cwd(), 'src/pages')
const hooksDir = path.resolve(process.cwd(), 'src/hooks')
const boardPagePath = path.join(pagesDir, 'BoardPage.tsx')
const boardPageRuntimePath = path.join(pagesDir, 'BoardPageRuntime.tsx')
const boardRuntimeControllerPath = path.join(pagesDir, 'boardRuntimeController.tsx')
const boardRuntimeControllerImplPath = path.join(pagesDir, 'boardRuntimeControllerImpl.tsx')
const supplementalPaths = [
  path.join(pagesDir, 'boardPageRuntimePrimitives.tsx'),
  path.join(pagesDir, 'boardPanels.tsx'),
  path.join(pagesDir, 'boardCommandOverlays.tsx'),
  path.join(pagesDir, 'boardBoardsListPanel.tsx'),
  path.join(pagesDir, 'boardHeaderBar.tsx'),
  path.join(pagesDir, 'boardSidebarPanels.tsx'),
  path.join(pagesDir, 'boardFloatingToolbar.tsx'),
  path.join(pagesDir, 'boardStickyObjectRenderer.tsx'),
  path.join(pagesDir, 'boardShapeObjectRenderer.tsx'),
  path.join(pagesDir, 'boardFrameObjectRenderer.tsx'),
  path.join(pagesDir, 'boardConnectorObjectRenderer.tsx'),
  path.join(pagesDir, 'boardTextObjectRenderer.tsx'),
  path.join(pagesDir, 'boardObjectRendererShared.ts'),
  path.join(pagesDir, 'boardKeyboardShortcuts.ts'),
  path.join(pagesDir, 'boardAiCommandSubmit.ts'),
  path.join(pagesDir, 'useBoardCreationActions.ts'),
  path.join(pagesDir, 'useBoardSidebarActions.ts'),
  path.join(pagesDir, 'useBoardWorkspaceActions.ts'),
  path.join(pagesDir, 'useBoardShareActions.ts'),
  path.join(pagesDir, 'useBoardZoomActions.ts'),
  path.join(pagesDir, 'useBoardHistoryActions.ts'),
  path.join(pagesDir, 'useBoardInteractionActions.ts'),
  path.join(pagesDir, 'useBoardCommandPalette.ts'),
  path.join(pagesDir, 'useBoardRealtimeDataEffects.ts'),
  path.join(pagesDir, 'useBoardDerivedViewModels.ts'),
  path.join(pagesDir, 'useBoardObjectActions.ts'),
  path.join(pagesDir, 'useBoardRuntimeComputedState.ts'),
  path.join(pagesDir, 'useBoardRuntimeLiveActions.ts'),
  path.join(pagesDir, 'useBoardSelectionMarqueeEffect.ts'),
  path.join(pagesDir, 'useBoardSpatialInteractions.ts'),
  path.join(pagesDir, 'boardTemplateActions.ts'),
  path.join(hooksDir, 'useBoardSelection.ts'),
]

export const readBoardPageSource = () => {
  const chunks = []
  if (existsSync(boardPagePath)) {
    chunks.push(readFileSync(boardPagePath, 'utf8'))
  }
  if (existsSync(boardPageRuntimePath)) {
    chunks.push(readFileSync(boardPageRuntimePath, 'utf8'))
  }
  if (existsSync(boardRuntimeControllerPath)) {
    chunks.push(readFileSync(boardRuntimeControllerPath, 'utf8'))
  }
  if (existsSync(boardRuntimeControllerImplPath)) {
    chunks.push(readFileSync(boardRuntimeControllerImplPath, 'utf8'))
  }

  for (const filePath of supplementalPaths) {
    if (existsSync(filePath)) {
      chunks.push(readFileSync(filePath, 'utf8'))
    }
  }

  return chunks.join('\n\n')
}
