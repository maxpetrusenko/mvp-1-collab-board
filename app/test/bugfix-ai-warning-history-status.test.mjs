import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageTypesSource = readFileSync(new URL('../src/pages/boardPageTypes.ts', import.meta.url), 'utf8')
const aiPanelSource = readFileSync(new URL('../src/components/AICommandPanel.tsx', import.meta.url), 'utf8')
const runtimeSource = readBoardPageSource()

test('BUGFIX-AI-WARNING-HISTORY-STATUS: warning states are represented in AI history status typing and UI pills', () => {
  assert.match(
    boardPageTypesSource,
    /status:\s*'queued'\s*\|\s*'running'\s*\|\s*'success'\s*\|\s*'warning'\s*\|\s*'error'/,
  )
  assert.match(
    aiPanelSource,
    /status:\s*'queued'\s*\|\s*'running'\s*\|\s*'success'\s*\|\s*'warning'\s*\|\s*'error'/,
  )
  assert.match(runtimeSource, /data\.status === 'success' && data\.result\?\.level === 'warning' \? 'warning' : data\.status/)
  assert.match(aiPanelSource, /className=\{`status-pill \$\{item\.status\}`\}/)
})
