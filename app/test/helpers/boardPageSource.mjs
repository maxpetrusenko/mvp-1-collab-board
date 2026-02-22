import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const pagesDir = path.resolve(process.cwd(), 'src/pages')
const hooksDir = path.resolve(process.cwd(), 'src/hooks')
const boardPagePath = path.join(pagesDir, 'BoardPage.tsx')
const boardPageRuntimePath = path.join(pagesDir, 'BoardPageRuntime.tsx')
const supplementalPaths = [
  path.join(pagesDir, 'boardPageRuntimePrimitives.tsx'),
  path.join(pagesDir, 'boardPanels.tsx'),
  path.join(pagesDir, 'boardStickyObjectRenderer.tsx'),
  path.join(pagesDir, 'boardShapeObjectRenderer.tsx'),
  path.join(pagesDir, 'boardTextObjectRenderer.tsx'),
  path.join(pagesDir, 'boardObjectRendererShared.ts'),
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

  for (const filePath of supplementalPaths) {
    if (existsSync(filePath)) {
      chunks.push(readFileSync(filePath, 'utf8'))
    }
  }

  return chunks.join('\n\n')
}
