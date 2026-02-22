/**
 * Regression guard for voting mode behavior:
 * object click handlers must route through voting-aware selection.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readBoardPageSource } from './helpers/boardPageSource.mjs'

const boardPageSource = readBoardPageSource()

describe('BUGFIX-VOTING-ALL-OBJECTS', () => {
  it('uses unified voting-aware object selection handler', () => {
    const selectionStart = boardPageSource.indexOf('const handleObjectSelection = useCallback(')
    const selectionEnd = boardPageSource.indexOf('const applyColorToSelection = useCallback(', selectionStart)
    assert.ok(selectionStart >= 0 && selectionEnd > selectionStart, 'handleObjectSelection function not found')

    const selectionBody = boardPageSource.slice(selectionStart, selectionEnd)
    assert.ok(selectionBody.includes('if (isVotingMode)'), 'selection handler should branch on voting mode')
    assert.ok(selectionBody.includes('toggleVoteOnObject(boardObject)'), 'selection handler should toggle vote')
  })

  it('routes sticky/shape/connector/frame/text clicks through handleObjectSelection', () => {
    const clickBindings = boardPageSource.match(/onClick=\{\(event\) => handleObjectSelection\(boardObject/g) || []
    assert.ok(clickBindings.length >= 5, 'all object render branches should use handleObjectSelection')

    assert.equal(
      boardPageSource.includes('onClick={(event) => selectObjectId(boardObject.id, Boolean(event.evt.shiftKey))}'),
      false,
      'direct selectObjectId click handlers bypass voting mode',
    )
  })
})
