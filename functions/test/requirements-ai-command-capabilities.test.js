const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const toolRegistry = require('../src/tool-registry.js')
const bulkColorOperations = require('../src/bulk-color-operations')
const bulkOperations = require('../src/bulk-operations')
const shapeComposition = require('../src/shape-composition')
const { __test } = require('../index')
const functionsSource = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

const buildContext = (overrides = {}) => ({
  boardId: 'test-board',
  userId: 'test-user',
  state: [],
  executedTools: [],
  commandPlacement: {
    anchor: { x: 640, y: 360 },
    pointer: { x: 650, y: 368 },
    viewportCenter: { x: 640, y: 360 },
    viewport: { x: 320, y: 180, width: 640, height: 360 },
  },
  ...overrides,
})

const withMockGlmClient = async (mockClient, run) => {
  __test.__setGlmClientForTests(mockClient)
  try {
    await run()
  } finally {
    __test.__setGlmClientForTests(null)
  }
}

const withMockObjectWriter = async (writer, run) => {
  __test.__setObjectWriterForTests(writer)
  // Also mock commitObjectBatchWrites for tests that use bulk operations
  __test.__setCommitBatchWritesForTests(async ({ objects }) => {
    for (const object of objects || []) {
      await writer({ boardId: object.boardId, objectId: object.id, payload: object, merge: false })
    }
  })
  try {
    await run()
  } finally {
    __test.__setObjectWriterForTests(null)
    __test.__setCommitBatchWritesForTests(null)
  }
}

const withMockModuleMethods = async (moduleRef, replacements, run) => {
  const originalMethods = {}
  for (const [name, method] of Object.entries(replacements)) {
    originalMethods[name] = moduleRef[name]
    moduleRef[name] = method
  }

  try {
    await run()
  } finally {
    for (const [name, method] of Object.entries(originalMethods)) {
      moduleRef[name] = method
    }
  }
}

const parseToolCallsFromResponse = (response) =>
  (response?.choices?.[0]?.message?.tool_calls || []).map((toolCall) => ({
    id: toolCall?.id || '',
    name: toolCall?.function?.name,
    arguments: JSON.parse(toolCall?.function?.arguments || '{}'),
  }))

const extractTopLevelBlock = (source, marker) => {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `Unable to locate marker: ${marker}`)
  const nextTopLevelConst = source.indexOf('\nconst ', start + marker.length)
  if (nextTopLevelConst === -1) {
    return source.slice(start)
  }
  return source.slice(start, nextTopLevelConst)
}

test('AI-CMDS-001 / T-102 / T-103: tool schema supports command breadth, frame positioning, and batch execution', () => {
  const toolNames = new Set(toolRegistry.TOOL_DEFINITIONS.map((tool) => tool?.function?.name).filter(Boolean))

  assert.ok(toolNames.size >= 6, `Expected >=6 command types, got ${toolNames.size}`)

  const requiredTools = [
    'createStickyNote',
    'createShape',
    'createFrame',
    'createConnector',
    'moveObject',
    'resizeObject',
    'updateText',
    'changeColor',
    'getBoardState',
    'executeBatch',
  ]
  for (const requiredTool of requiredTools) {
    assert.ok(toolNames.has(requiredTool), `Missing required tool: ${requiredTool}`)
  }

  const frameTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'createFrame')
  assert.ok(frameTool, 'Expected createFrame tool schema')
  assert.equal(frameTool?.function?.parameters?.properties?.color?.type, 'string')
  assert.ok(frameTool?.function?.parameters?.properties?.color?.enum?.includes('gray'))
  assert.ok(frameTool?.function?.parameters?.properties?.color?.enum?.includes('red'))
  assert.ok(frameTool?.function?.parameters?.properties?.color?.enum?.includes('brown'))
  assert.equal(frameTool?.function?.parameters?.properties?.position?.type, 'string')
  assert.ok(frameTool?.function?.parameters?.properties?.position?.enum?.includes('top left'))
  assert.ok(frameTool?.function?.parameters?.properties?.position?.enum?.includes('center'))

  const shapeTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'createShape')
  assert.ok(shapeTool, 'Expected createShape tool schema')
  assert.equal(shapeTool?.function?.parameters?.properties?.text?.type, 'string')
})

test('AI-CMDS-002: planner routes open-ended prompts through LLM-first flow', async () => {
  const calls = []

  await withMockGlmClient(
    {
      callGLM: async (command, context) => {
        calls.push({ command, context })
        return {
          choices: [
            {
              message: {
                content:
                  '1. He is kind. 2. He is smart. 3. He is supportive. 4. He is honest. 5. He is thoughtful.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: () => [],
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const result = await __test.runCommandPlan(
        buildContext(),
        'give me 5 reasons why my husband is good',
      )

      assert.equal(calls.length, 1)
      assert.ok(calls[0].command.includes('5 reasons'))
      assert.deepEqual(calls[0].context.commandPlacement.anchor, { x: 640, y: 360 })
      assert.match(result.message, /supportive/i)
      assert.equal(result.level, undefined)
    },
  )
})

test('AI-CMDS-025: conversational prompts suppress accidental tool calls and return a chat-vs-board hint', async () => {
  const writeCalls = []
  const context = buildContext()
  let result = null

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '4',
                  tool_calls: [
                    {
                      id: 'accidental-tool-1',
                      function: {
                        name: 'createStickyNote',
                        arguments: JSON.stringify({ text: '4', color: 'yellow' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          result = await __test.runCommandPlan(context, '2+2')
        },
      )
    },
  )

  assert.equal(result.level, 'warning')
  assert.match(result.message, /reply in chat or create board objects/i)
  assert.equal(context.state.length, 0)
  assert.equal(writeCalls.length, 0)
  assert.equal(context.executedTools.length, 1)
  assert.equal(context.executedTools[0].tool, 'assistantResponse')
  assert.equal(context.executedTools[0].conversationalIntent, true)
  assert.equal(context.executedTools[0].suppressedToolCalls, 1)
})

test('AI-CMDS-026: board noun prompts continue to execute returned tool calls', async () => {
  const context = buildContext()

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'board-tool-1',
                      function: {
                        name: 'createStickyNote',
                        arguments: JSON.stringify({ text: 'launch risk', color: 'red' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          await __test.runCommandPlan(context, 'sticky note saying launch risk')
        },
      )
    },
  )

  assert.equal(context.state.length, 1)
  assert.equal(context.state[0].type, 'stickyNote')
  assert.equal(context.state[0].text, 'launch risk')
  assert.equal(context.executedTools.some((entry) => entry.tool === 'createStickyNote'), true)
})

test('AI-CMDS-031: no-tool color-edit prompts recover by matching target text to existing board objects', async () => {
  const writeCalls = []
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'sticky-hello',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'hello world',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Done.',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change hello world stiky color to red')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed sticky note color to red/i)
        },
      )
    },
  )

  assert.equal(context.state[0].color, '#fca5a5')
  assert.equal(writeCalls.length, 1)
  assert.equal(writeCalls[0].objectId, 'sticky-hello')
  assert.equal(writeCalls[0].payload.color, '#fca5a5')
  assert.equal(context.executedTools.some((entry) => entry.tool === 'changeColor' && entry.id === 'sticky-hello'), true)
})

test('AI-CMDS-032: frame-plus-sticky prompts recover from partial tool output by creating frames and applying color layouts', async () => {
  const context = buildContext()
  const command = 'create 3 frames with 2 stikies in each with different colors'

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Created sticky notes.',
                  tool_calls: [
                    {
                      id: 'partial-frame-layout-1',
                      function: {
                        name: 'executeBatch',
                        arguments: JSON.stringify({
                          operations: Array.from({ length: 6 }, (_, index) => ({
                            tool: 'createStickyNote',
                            args: { text: `Idea ${index + 1}` },
                          })),
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, command)
          assert.equal(result.level, undefined)
        },
      )
    },
  )

  const frames = context.state.filter((item) => item.type === 'frame')
  const stickies = context.state.filter((item) => item.type === 'stickyNote')

  assert.equal(frames.length, 3)
  assert.equal(stickies.length, 6)
  assert.ok(new Set(frames.map((frame) => frame.color)).size >= 2)
  assert.ok(new Set(stickies.map((sticky) => sticky.color)).size >= 2)

  const stickyCountPerFrame = frames.map((frame) =>
    stickies.filter((sticky) => {
      const stickyWidth = sticky.size?.width || 180
      const stickyHeight = sticky.size?.height || 110
      return (
        sticky.position.x >= frame.position.x &&
        sticky.position.x + stickyWidth <= frame.position.x + frame.size.width &&
        sticky.position.y >= frame.position.y &&
        sticky.position.y + stickyHeight <= frame.position.y + frame.size.height
      )
    }).length,
  )
  assert.equal(stickyCountPerFrame.every((count) => count >= 2), true)
})

test('AI-CMDS-035: frame-plus-sticky shorthand prompts infer per-frame sticky quantities', async () => {
  const context = buildContext()
  const command = 'add 2 frames with 2 stickies'

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Created sticky notes.',
                  tool_calls: [
                    {
                      id: 'partial-frame-layout-shorthand-1',
                      function: {
                        name: 'executeBatch',
                        arguments: JSON.stringify({
                          operations: Array.from({ length: 2 }, (_, index) => ({
                            tool: 'createStickyNote',
                            args: { text: `Idea ${index + 1}` },
                          })),
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, command)
          assert.equal(result.level, undefined)
        },
      )
    },
  )

  const frames = context.state.filter((item) => item.type === 'frame')
  const stickies = context.state.filter((item) => item.type === 'stickyNote')

  assert.equal(frames.length, 2)
  assert.equal(stickies.length, 4)
})

test('AI-CMDS-036: relation parser handles frame-plus-sticky quantity phrasing variants through one generalized fallback', async () => {
  const variants = [
    'create 2 frames with 2 stickies',
    'create 2 frames, each with 2 stickies',
    'create 2 frames each containing 2 sticky notes',
    'create 2 frames and place 2 stickies in each frame',
    'create two frames with two notes each',
  ]

  for (const command of variants) {
    const context = buildContext()

    await withMockObjectWriter(
      async () => {},
      async () => {
        await withMockGlmClient(
          {
            callGLM: async () => ({
              choices: [
                {
                  message: {
                    content: 'Created board layout.',
                    tool_calls: [],
                  },
                },
              ],
            }),
            parseToolCalls: () => [],
            getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
          },
          async () => {
            const result = await __test.runCommandPlan(context, command)
            assert.equal(result.level, undefined)
          },
        )
      },
    )

    const frames = context.state.filter((item) => item.type === 'frame')
    const stickies = context.state.filter((item) => item.type === 'stickyNote')

    assert.equal(frames.length, 2, `Expected 2 frames for "${command}"`)
    assert.equal(stickies.length, 4, `Expected 4 stickies for "${command}"`)
  }
})

test('AI-CMDS-037: parse-error executeBatch responses fall back to bulk recolor intent for typo-tolerant commands', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'sticky-yellow-1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Alpha',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-yellow-2',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Beta',
        color: '#fde68a',
        position: { x: 360, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-green-1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Gamma',
        color: '#86efac',
        position: { x: 600, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 3,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [
            {
              id: 'broken-batch-1',
              name: 'executeBatch',
              arguments: {},
              parseError: true,
            },
          ],
          getTextResponse: () => '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change yellow collor stickies to brown')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 2 sticky notes from yellow to brown/i)
        },
      )
    },
  )

  const yellowStickies = context.state.filter((item) => item.id.startsWith('sticky-yellow-'))
  const greenSticky = context.state.find((item) => item.id === 'sticky-green-1')
  assert.equal(yellowStickies.every((item) => item.color === '#a16207'), true)
  assert.equal(greenSticky?.color, '#86efac')
})

test('AI-CMDS-038: quantity shortfall fallback fills requested create count when model returns partial output', async () => {
  const context = buildContext()
  const requestedCount = 100
  const partialCount = 36

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'partial-bulk-create-1',
                      function: {
                        name: 'executeBatch',
                        arguments: JSON.stringify({
                          operations: Array.from({ length: partialCount }, (_, index) => ({
                            tool: 'createStickyNote',
                            args: { text: `Item ${index + 1}` },
                          })),
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: () => '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, `add ${requestedCount} items`)
          assert.equal(result.level, undefined)
          assert.match(result.message, /created 100 sticky notes/i)
        },
      )
    },
  )

  const stickies = context.state.filter((item) => item.type === 'stickyNote')
  assert.equal(stickies.length, requestedCount)
})

test('AI-CMDS-039: broad delete commands recover when model emits no actionable tool calls', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'sticky-delete-1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Alpha',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'shape-delete-1',
        boardId: 'test-board',
        type: 'shape',
        shapeType: 'circle',
        color: '#93c5fd',
        text: 'Node',
        position: { x: 360, y: 120 },
        size: { width: 130, height: 130 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'frame-delete-1',
        boardId: 'test-board',
        type: 'frame',
        title: 'Frame 1',
        color: '#e2e8f0',
        position: { x: 560, y: 120 },
        size: { width: 420, height: 300 },
        zIndex: 3,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'connector-delete-1',
        boardId: 'test-board',
        type: 'connector',
        color: '#1d4ed8',
        style: 'arrow',
        start: { x: 160, y: 200 },
        end: { x: 430, y: 180 },
        x: 160,
        y: 180,
        width: 270,
        height: 20,
        zIndex: 4,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: () => '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'delete all items from the board')
          assert.equal(result.level, undefined)
          assert.match(result.message, /deleted 4 objects/i)
        },
      )
    },
  )

  assert.equal(context.state.length, 0)
  const deletedToolCalls = context.executedTools.filter((entry) => entry.tool === 'deleteObject')
  assert.equal(deletedToolCalls.length, 4)
})

test('AI-CMDS-040: bulk recolor commands top up remaining matching stickies after partial model mutation output', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'sticky-yellow-a',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Alpha',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-yellow-b',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Beta',
        color: '#e8d98b',
        position: { x: 340, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-green-c',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Gamma',
        color: '#86efac',
        position: { x: 560, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 3,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Updated one sticky.',
                  tool_calls: [
                    {
                      id: 'partial-color-change-1',
                      function: {
                        name: 'changeColor',
                        arguments: JSON.stringify({
                          objectId: 'sticky-yellow-a',
                          color: 'green',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change yellow collor stickies to green')
          assert.equal(result.level, undefined)
        },
      )
    },
  )

  const changedToGreen = context.state.filter((item) => item.type === 'stickyNote' && item.color === '#86efac')
  assert.equal(changedToGreen.length, 3)
})

test('AI-CMDS-041: bulk recolor falls back to same-color objects when requested type is absent', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'frame-yellow-a',
        boardId: 'test-board',
        type: 'frame',
        title: 'Frame A',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 420, height: 300 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'frame-yellow-b',
        boardId: 'test-board',
        type: 'frame',
        title: 'Frame B',
        color: '#e8d98b',
        position: { x: 580, y: 120 },
        size: { width: 420, height: 300 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: () => '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change yellow collor stickies to green')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 2 objects from yellow to green/i)
        },
      )
    },
  )

  const greenFrames = context.state.filter((item) => item.type === 'frame' && item.color === '#86efac')
  assert.equal(greenFrames.length, 2)
})

test('AI-CMDS-048: legacy note rows recolor via sticky bulk fallback', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      {
        id: 'note-yellow-a',
        boardId: 'test-board',
        type: 'note',
        text: 'Legacy note',
        color: '#fde68a',
        position: { x: 140, y: 150 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: () => '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change yellow collor stickies to green')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 1 object from yellow to green/i)
        },
      )
    },
  )

  const changed = context.state.filter((item) => item.type === 'note' && item.color === '#86efac')
  assert.equal(changed.length, 1)
})

test('AI-CMDS-049: no-tool recolor accepts singular "stickie" spelling', async () => {
  const now = Date.now()
  const writeCalls = []
  const context = buildContext({
    state: [
      {
        id: 'sticky-yellow',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Legacy spelling',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'change yellow stickie to green')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 1 sticky note from yellow to green/i)
        },
      )
    },
  )

  const changed = context.state.filter((item) => item.color === '#86efac')
  assert.equal(changed.length, 1)
  assert.equal(writeCalls.filter((entry) => entry.payload?.color === '#86efac').length, 1)
})

test('AI-CMDS-033: no-tool bulk color prompts update all matching sticky notes', async () => {
  const now = Date.now()
  const writeCalls = []
  const context = buildContext({
    state: [
      {
        id: 'sticky-green-1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Alpha',
        color: '#86efac',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-green-2',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Beta',
        color: '#86efac',
        position: { x: 340, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-yellow',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Gamma',
        color: '#fde68a',
        position: { x: 560, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 3,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'changing all green stikies to red')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 2 sticky notes from green to red/i)
        },
      )
    },
  )

  const redStickies = context.state.filter((item) => item.type === 'stickyNote' && item.color === '#fca5a5')
  const yellowStickies = context.state.filter((item) => item.type === 'stickyNote' && item.color === '#fde68a')
  assert.equal(redStickies.length, 2)
  assert.equal(yellowStickies.length, 1)
  assert.equal(writeCalls.filter((entry) => entry.payload?.color === '#fca5a5').length, 2)
})

test('AI-CMDS-034: typo-tolerant bulk recolor prompts update all target stickies without source-color filtering', async () => {
  const now = Date.now()
  const writeCalls = []
  const context = buildContext({
    state: [
      {
        id: 'sticky-1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Alpha',
        color: '#86efac',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-2',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Beta',
        color: '#fde68a',
        position: { x: 340, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
      {
        id: 'sticky-3',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'Gamma',
        color: '#93c5fd',
        position: { x: 560, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 3,
        createdBy: 'test-user',
        createdAt: now,
        updatedBy: 'test-user',
        updatedAt: now,
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'chaneg color of all stikies to red')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 3 sticky notes to red/i)
        },
      )
    },
  )

  const redStickies = context.state.filter((item) => item.type === 'stickyNote' && item.color === '#fca5a5')
  assert.equal(redStickies.length, 3)
  assert.equal(writeCalls.filter((entry) => entry.payload?.color === '#fca5a5').length, 3)
})

test('AI-CMDS-007 / T-142: planner keeps sticky-style creation prompts on LLM-first path', async () => {
  const calls = []

  await withMockGlmClient(
    {
      callGLM: async (command) => {
        calls.push(command)
        return {
          choices: [
            {
              message: {
                content: 'Created requested board notes.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: () => [],
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const stickyStyleCommand = 'add 2 red sticky notes at top right saying launch risks'
      const result = await __test.runCommandPlan(buildContext(), stickyStyleCommand)

      assert.equal(calls.length, 2)
      assert.equal(calls[0], stickyStyleCommand)
      assert.match(calls[1], /BOARD EXECUTION MODE \(RETRY\)/)
      assert.equal(result.message, 'Created requested board notes.')
    },
  )
})

test('AI-CMDS-034: single-sticky text-only first pass applies parser fallback without a second LLM round-trip', async () => {
  const calls = []
  const context = buildContext()

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async (command) => {
            calls.push(command)
            return {
              choices: [
                {
                  message: {
                    content: 'Created requested board note.',
                    tool_calls: [],
                  },
                },
              ],
            }
          },
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'add 1 red stikie saying launch risk')
          assert.equal(result.level, undefined)
          assert.equal(result.message, 'Created requested board note.')
        },
      )
    },
  )

  assert.equal(calls.length, 1)
  const stickies = context.state.filter((item) => item.type === 'stickyNote')
  assert.equal(stickies.length, 1)
  assert.equal(stickies[0].text, 'launch risk')
  assert.equal(stickies[0].color, '#fca5a5')
  assert.equal(context.executedTools.some((entry) => entry.tool === 'singleStickyTextOnlyFallback'), true)
})

test('AI-CMDS-010: non-BMC board framework prompts trigger compound-tool retry when the first LLM pass is text-only', async () => {
  const calls = []

  await withMockGlmClient(
    {
      callGLM: async (command) => {
        calls.push(command)
        return {
          choices: [
            {
              message: {
                content: calls.length === 1 ? 'Drafted a business model canvas in text.' : 'Created the canvas on the board.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: () => [],
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const command =
        'Generate a journey map for onboarding, including channels and handoff steps.'
      const result = await __test.runCommandPlan(buildContext(), command)

      assert.equal(calls.length, 2)
      assert.equal(calls[0], command)
      assert.match(calls[1], /BOARD EXECUTION MODE \(RETRY\)/)
      assert.match(calls[1], /executeBatch/i)
      assert.equal(result.message, 'Created the canvas on the board.')
      assert.equal(result.level, 'warning')
    },
  )
})

test('AI-CMDS-017: business model canvas prompts stay LLM-driven and execute board tool calls', async () => {
  const llmCalls = []
  const context = buildContext()
  const command = 'Generate a Business Model Canvas for ai chat bot, including example channels and revenue streams.'

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async (issuedCommand) => {
            llmCalls.push(issuedCommand)
            return {
              choices: [
                {
                  message: {
                    content: 'Created the canvas on the board.',
                    tool_calls: [
                      {
                        id: 'bmc-batch-1',
                        function: {
                          name: 'executeBatch',
                          arguments: JSON.stringify({
                            operations: [
                              {
                                tool: 'createStickyNote',
                                args: { text: 'Key Partners', color: 'yellow' },
                              },
                              {
                                tool: 'createStickyNote',
                                args: { text: 'Channels', color: 'blue' },
                              },
                              {
                                tool: 'createStickyNote',
                                args: { text: 'Revenue Streams', color: 'green' },
                              },
                            ],
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }
          },
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, command)
          assert.equal(result.level, undefined)
          assert.equal(result.message, 'Created the canvas on the board.')
        },
      )
    },
  )

  assert.equal(llmCalls.length, 1)
  assert.equal(llmCalls[0], command)
  const stickies = context.state.filter((item) => item.type === 'stickyNote')
  assert.equal(stickies.length, 3)
  assert.equal(stickies.some((item) => item.text?.includes('Channels')), true)
  assert.equal(stickies.some((item) => item.text?.includes('Revenue Streams')), true)
  assert.equal(stickies.some((item) => item.text?.includes('Key Partners')), true)
})

test('AI-CMDS-020: workflow flowchart prompts stay LLM-driven and execute shape/connector tools', async () => {
  const llmCalls = []
  const context = buildContext()
  const command = 'Create a password reset flowchart for an email account with arrows between every step.'

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async (issuedCommand) => {
            llmCalls.push(issuedCommand)
            return {
              choices: [
                {
                  message: {
                    content: 'Created workflow flowchart on the board.',
                    tool_calls: [
                      {
                        id: 'flow-batch-1',
                        function: {
                          name: 'executeBatch',
                          arguments: JSON.stringify({
                            operations: [
                              {
                                tool: 'createShape',
                                args: {
                                  type: 'rectangle',
                                  text: 'Start',
                                  x: 180,
                                  y: 180,
                                },
                              },
                              {
                                tool: 'createShape',
                                args: {
                                  type: 'diamond',
                                  text: 'Account exists?',
                                  x: 520,
                                  y: 180,
                                },
                              },
                              {
                                tool: 'createConnector',
                                args: {
                                  style: 'arrow',
                                  startX: 360,
                                  startY: 250,
                                  endX: 520,
                                  endY: 250,
                                },
                              },
                            ],
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }
          },
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, command)
          assert.equal(result.level, undefined)
          assert.equal(result.message, 'Created workflow flowchart on the board.')
        },
      )
    },
  )

  assert.equal(llmCalls.length, 1)
  assert.equal(llmCalls[0], command)
  const shapes = context.state.filter((item) => item.type === 'shape')
  const connectors = context.state.filter((item) => item.type === 'connector')

  assert.equal(shapes.length, 2)
  assert.equal(connectors.length, 1)
  assert.equal(shapes.every((item) => typeof item.text === 'string' && item.text.trim().length > 0), true)
  assert.equal(shapes.some((item) => item.shapeType === 'diamond'), true)
  assert.equal(shapes.some((item) => item.text?.includes('Account exists?')), true)
  assert.equal(connectors.every((item) => item.color === '#1d4ed8'), true)
  assert.equal(connectors.every((item) => item.style === 'arrow'), true)
})

test('AI-CMDS-023: repeated workflow prompts stay LLM-driven across consecutive calls', async () => {
  const context = buildContext()
  const command = 'Create a password reset flowchart for an email account with arrows between every step.'
  const llmCalls = []

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async (issuedCommand) => {
            llmCalls.push(issuedCommand)
            return {
              choices: [
                {
                  message: {
                    content: `Created step ${llmCalls.length}.`,
                    tool_calls: [
                      {
                        id: `flow-step-${llmCalls.length}`,
                        function: {
                          name: 'createShape',
                          arguments: JSON.stringify({
                            type: 'rectangle',
                            text: `Step ${llmCalls.length}`,
                            x: 180 + llmCalls.length * 120,
                            y: 220,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }
          },
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const first = await __test.runCommandPlan(context, command)
          assert.equal(first.level, undefined)
          assert.equal(first.message, 'Created step 1.')
          const second = await __test.runCommandPlan(context, command)
          assert.equal(second.level, undefined)
          assert.equal(second.message, 'Created step 2.')
        },
      )
    },
  )

  assert.equal(llmCalls.length, 2)
  assert.equal(llmCalls[0], command)
  assert.equal(llmCalls[1], command)
  const shapes = context.state.filter((item) => item.type === 'shape')
  assert.equal(shapes.length, 2)
  assert.equal(shapes.some((item) => item.text === 'Step 1'), true)
  assert.equal(shapes.some((item) => item.text === 'Step 2'), true)
})

test('AI-CMDS-021: LLM connector tool calls default to visible blue and side anchors for object links', async () => {
  const context = buildContext({
    state: [
      {
        id: 'shape-start',
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 120, y: 220 },
        size: { width: 220, height: 140 },
      },
      {
        id: 'shape-end',
        type: 'shape',
        shapeType: 'rectangle',
        position: { x: 520, y: 220 },
        size: { width: 220, height: 140 },
      },
    ],
  })

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'connected',
                  tool_calls: [
                    {
                      id: 'connector-1',
                      function: {
                        name: 'createConnector',
                        arguments: JSON.stringify({
                          fromId: 'shape-start',
                          toId: 'shape-end',
                          style: 'arrow',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'connect these two steps with an arrow')
          assert.equal(result.level, undefined)
        },
      )
    },
  )

  const connectors = context.state.filter((item) => item.type === 'connector')
  assert.equal(connectors.length, 1)
  assert.equal(connectors[0].color, '#1d4ed8')
  assert.equal(connectors[0].fromAnchor, 'right')
  assert.equal(connectors[0].toAnchor, 'left')
})

test('AI-CMDS-011: board-mutation prompts trigger a compound-tools retry when first pass is text-only', async () => {
  const calls = []

  await withMockGlmClient(
    {
      callGLM: async (command) => {
        calls.push(command)
        if (calls.length === 1) {
          return {
            choices: [
              {
                message: {
                  content: 'Drafted a journey map outline.',
                  tool_calls: [],
                },
              },
            ],
          }
        }

        return {
          choices: [
            {
              message: {
                content: 'Created journey map columns on the board.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: () => [],
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const command = 'create a user journey map for onboarding'
      const result = await __test.runCommandPlan(buildContext(), command)

      assert.equal(calls.length, 2)
      assert.match(calls[1], /BOARD EXECUTION MODE \(RETRY\)/)
      assert.equal(result.level, 'warning')
      assert.equal(result.message, 'Created journey map columns on the board.')
    },
  )
})

test('AI-CMDS-012: no-op executeBatch triggers no-op recovery and returns warning when board is unchanged', async () => {
  const calls = []

  await withMockGlmClient(
    {
      callGLM: async (command) => {
        calls.push(command)
        if (calls.length === 1) {
          return {
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'noop-1',
                      function: {
                        name: 'executeBatch',
                        arguments: JSON.stringify({ operations: [] }),
                      },
                    },
                  ],
                },
              },
            ],
          }
        }

        return {
          choices: [
            {
              message: {
                content: 'No board changes were applied.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: parseToolCallsFromResponse,
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const result = await __test.runCommandPlan(
        buildContext(),
        'Generate a journey map for customer support handoffs.',
      )

      assert.equal(calls.length, 2)
      assert.match(calls[1], /NO-OP RECOVERY/)
      assert.equal(result.level, 'warning')
      assert.match(result.message, /No board changes/i)
    },
  )
})

test('AI-CMDS-013: runCommandPlan creates board objects from executeBatch operations', async () => {
  const command = 'add 1 red round sticky and 1 green triangle with words boo'
  const context = buildContext()

  await withMockObjectWriter(
    async () => {},
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'created',
                  tool_calls: [
                    {
                      id: 'batch-1',
                      function: {
                        name: 'executeBatch',
                        arguments: JSON.stringify({
                          operations: [
                            {
                              tool: 'createStickyNote',
                              args: { text: 'boo', color: 'red', shapeType: 'circle' },
                            },
                            {
                              tool: 'createStickyNote',
                              args: { text: 'boo', color: 'green', shapeType: 'triangle' },
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, command)
          assert.equal(result.level, undefined)
        },
      )
    },
  )

  const stickies = context.state.filter((item) => item.type === 'stickyNote')
  assert.equal(stickies.length, 2)
  assert.equal(new Set(stickies.map((item) => item.shapeType)).has('circle'), true)
  assert.equal(new Set(stickies.map((item) => item.shapeType)).has('triangle'), true)
  assert.equal(new Set(stickies.map((item) => item.color)).has('#fca5a5'), true)
  assert.equal(new Set(stickies.map((item) => item.color)).has('#86efac'), true)
})

test('AI-CMDS-014 / T-142: mixed create prompts stay LLM-driven and avoid deterministic sticky fallbacks', async () => {
  const calls = []
  const command = 'add 1 red round sticky and 1 green triangle with words boo'
  const context = buildContext()

  await withMockGlmClient(
    {
      callGLM: async (issuedCommand) => {
        calls.push(issuedCommand)
        return {
          choices: [
            {
              message: {
                content: 'I can draft this as board notes once tool calls are emitted.',
                tool_calls: [],
              },
            },
          ],
        }
      },
      parseToolCalls: () => [],
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const result = await __test.runCommandPlan(context, command)
      assert.equal(result.level, 'warning')
      assert.match(result.message, /board notes|explicit board actions/i)
    },
  )

  assert.equal(calls.length, 2)
  assert.equal(calls[0], command)
  assert.match(calls[1], /BOARD EXECUTION MODE \(RETRY\)/)
  assert.equal(context.state.filter((item) => item.type === 'stickyNote').length, 0)
})

test('AI-CMDS-015 / FR-16: tool schema includes layout and complex-template actions for grid, spacing, and journey maps', () => {
  const toolNames = new Set(toolRegistry.TOOL_DEFINITIONS.map((tool) => tool?.function?.name).filter(Boolean))
  const required = ['createStickyGridTemplate', 'spaceElementsEvenly', 'createJourneyMap']

  for (const toolName of required) {
    assert.ok(toolNames.has(toolName), `Missing tool definition: ${toolName}`)
  }
})

test('AI-CMDS-045: MAX-45 bulk operation schema includes create/change/delete/group/template tools', () => {
  const toolNames = new Set(toolRegistry.TOOL_DEFINITIONS.map((tool) => tool?.function?.name).filter(Boolean))
  const requiredTools = [
    'createObjects',
    'changeColors',
    'deleteObjects',
    'groupObjects',
    'ungroupObjects',
    'createShapeTemplate',
  ]

  for (const toolName of requiredTools) {
    assert.ok(toolNames.has(toolName), `Missing bulk/composition tool: ${toolName}`)
  }

  const createObjectsTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'createObjects')
  assert.equal(createObjectsTool?.function?.parameters?.properties?.objects?.type, 'array')
  assert.equal(createObjectsTool?.function?.parameters?.properties?.objects?.minItems, 1)

  const changeColorsTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'changeColors')
  assert.equal(changeColorsTool?.function?.parameters?.required?.join(','), 'objectIds,color')

  const deleteObjectsTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'deleteObjects')
  assert.equal(deleteObjectsTool?.function?.parameters?.properties?.objectIds?.type, 'array')

  const templateTool = toolRegistry.TOOL_DEFINITIONS.find((tool) => tool?.function?.name === 'createShapeTemplate')
  assert.equal(templateTool?.function?.parameters?.required?.[0], 'templateType')
  assert.equal(templateTool?.function?.parameters?.properties?.templateType?.enum?.length >= 6, true)
})

test('AI-CMDS-016 / FR-16: runtime dispatcher routes grid, spacing, and journey-map tool calls', () => {
  const executeBlock = extractTopLevelBlock(functionsSource, 'const executeLlmToolCall = async (ctx, toolName, rawArgs, options = {}) => {')
  assert.match(executeBlock, /case 'createStickyGridTemplate'/)
  assert.match(executeBlock, /case 'spaceElementsEvenly'/)
  assert.match(executeBlock, /case 'createJourneyMap'/)
  assert.match(executeBlock, /case 'createBusinessModelCanvas'/)
  assert.match(executeBlock, /case 'createWorkflowFlowchart'/)
})

test('AI-CMDS-046: runtime dispatcher executes MAX-45 bulk tools directly', async () => {
  const context = buildContext({
    state: [
      {
        id: 'sh1',
        boardId: 'test-board',
        type: 'shape',
        shapeType: 'rectangle',
        text: 'Node 1',
        color: '#93c5fd',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: Date.now(),
        updatedBy: 'test-user',
        updatedAt: Date.now(),
        version: 1,
      },
      {
        id: 'sh2',
        boardId: 'test-board',
        type: 'shape',
        shapeType: 'rectangle',
        text: 'Node 2',
        color: '#93c5fd',
        position: { x: 340, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: Date.now(),
        updatedBy: 'test-user',
        updatedAt: Date.now(),
        version: 1,
      },
    ],
  })
  let templateGroupId = ''

  await withMockObjectWriter(async () => {}, async () => {
    await withMockModuleMethods(
      bulkOperations,
      {
        createObjects: async (ctx, args = {}) => {
          const created = (Array.isArray(args.objects) ? args.objects : []).map((objectSpec = {}, index) => {
            const rawType = String(objectSpec.type || 'stickyNote').trim().toLowerCase()
            const isShape = ['rectangle', 'circle', 'diamond', 'triangle'].includes(rawType)
            const type = isShape ? 'shape' : rawType === 'frame' ? 'frame' : 'stickyNote'
            const color = objectSpec.color || (isShape ? '#93c5fd' : '#fde68a')
            return {
              id: `bulk-${index + 1}`,
              boardId: ctx.boardId,
              type,
              ...(type === 'shape' ? { shapeType: rawType === 'rectangle' ? 'rectangle' : rawType } : {}),
              ...(type === 'frame' ? { title: objectSpec.text || `Frame ${index + 1}` } : { text: objectSpec.text || `Note ${index + 1}` }),
              color,
              position: { x: 400 + index * 22, y: 300 + index * 22 },
              size: isShape ? { width: 160, height: 110 } : { width: 180, height: 110 },
              zIndex: index + 3,
              createdBy: ctx.userId,
              createdAt: Date.now(),
              updatedBy: ctx.userId,
              updatedAt: Date.now(),
              version: 1,
            }
          })
          ctx.state.push(...created)
          ctx.executedTools.push({
            tool: 'createObjects',
            count: created.length,
          })
          return { count: created.length, objects: created }
        },
        applyBatchColorMutation: async (ctx, objectIds, color) => {
          const colorMap = { purple: '#c4b5fd' }
          const resolvedColor = colorMap[String(color || '').toLowerCase()] || color
          const ids = Array.isArray(objectIds) ? objectIds : []
          const validIds = [...new Set(ids.map((entry) => String(entry || '').trim()).filter(Boolean))]
          for (const objectId of validIds) {
            const object = ctx.state.find((item) => item?.id === objectId)
            if (object) {
              object.color = resolvedColor
            }
          }
          ctx.executedTools.push({
            tool: 'changeColors',
            count: validIds.length,
          })
          return { count: validIds.length }
        },
      },
      async () => {
        await withMockModuleMethods(
          shapeComposition,
          {
            groupObjects: async (ctx, args = {}) => {
              const memberIds = Array.isArray(args.objectIds)
                ? [...new Set(args.objectIds.map((entry) => String(entry || '').trim()).filter(Boolean))]
                : []
              const members = memberIds
                .map((id) => ctx.state.find((item) => item?.id === id))
                .filter(Boolean)
              const groupId = 'group-mock-1'
              const groupPayload = {
                id: groupId,
                boardId: ctx.boardId,
                type: 'group',
                memberIds,
                position: { x: 120, y: 120 },
                size: { width: 1, height: 1 },
                zIndex: 10,
                createdBy: ctx.userId,
                createdAt: Date.now(),
                updatedBy: ctx.userId,
                updatedAt: Date.now(),
                version: 1,
              }
              for (const member of members) {
                member.groupId = groupId
              }
              ctx.state.push(groupPayload)
              ctx.executedTools.push({ tool: 'groupObjects', groupId, count: members.length })
              return { groupId, count: members.length }
            },
            createShapeTemplate: async (ctx, args = {}) => {
              const parts = [
                { id: 'tree-part-1', type: 'shape', shapeType: 'rectangle', position: { x: 800, y: 300 } },
                { id: 'tree-part-2', type: 'shape', shapeType: 'circle', position: { x: 846, y: 300 } },
              ].map((part, index) => ({
                id: part.id,
                boardId: ctx.boardId,
                type: part.type,
                shapeType: part.shapeType,
                text: '',
                color: '#86efac',
                position: part.position,
                size: { width: 80, height: 80 },
                zIndex: 11 + index,
                createdBy: ctx.userId,
                createdAt: Date.now(),
                updatedBy: ctx.userId,
                updatedAt: Date.now(),
                version: 1,
              }))
              ctx.state.push(...parts)
              ctx.executedTools.push({ tool: 'createShapeTemplate', templateType: String(args.templateType || ''), count: parts.length })
              return { templateType: args.templateType, count: parts.length }
            },
          },
          async () => {
            await withMockGlmClient(
              {
                callGLM: async () => ({
                  choices: [
                    {
                      message: {
                        content: 'Created grouped objects.',
                        tool_calls: [
                          {
                            id: 'bulk-create-1',
                            function: {
                              name: 'createObjects',
                              arguments: JSON.stringify({
                                objects: [
                                  { type: 'stickyNote', text: 'Node A', color: '#fde68a' },
                                  { type: 'stickyNote', text: 'Node B', color: '#fde68a' },
                                  { type: 'rectangle', text: 'Node C', color: '#93c5fd' },
                                ],
                              }),
                            },
                          },
                        ],
                      },
                    },
                  ],
                }),
                parseToolCalls: parseToolCallsFromResponse,
                getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
              },
              async () => {
                const result = await __test.runCommandPlan(context, 'run bulk tool call test')
                assert.equal(result.level, undefined)
              },
            )
          },
        )
      },
    )
  })

  assert.equal(context.state.filter((item) => item.type === 'stickyNote').length, 3)
  assert.equal(context.state.filter((item) => item.type === 'shape').length, 5)
  assert.equal(context.state.filter((item) => item.type === 'group').length, 1)
  assert.equal(context.state.find((item) => item.id === 'sh1')?.groupId, context.state.find((item) => item.type === 'group')?.id)
  assert.equal(context.state.find((item) => item.id === 'sh2')?.groupId, context.state.find((item) => item.type === 'group')?.id)
  const group = context.state.find((item) => item.type === 'group')
  assert.equal(group?.memberIds?.length >= 2, true)
  templateGroupId = group?.id || ''
  assert.match(group?.id || '', /^.{8}/)
  const purpleShapes = context.state.filter((item) => item.type === 'shape' && item.color === '#c4b5fd')
  assert.ok(purpleShapes.length >= 2, `Expected recolored shapes, got ${purpleShapes.length}`)
  assert.ok(context.executedTools.some((entry) => entry.tool === 'groupObjects'), true)
  assert.ok(context.executedTools.some((entry) => entry.tool === 'createObjects'), true)
  assert.ok(context.executedTools.some((entry) => entry.tool === 'createShapeTemplate'), true)
  assert.ok(templateGroupId)

  await withMockObjectWriter(async () => {}, async () => {
    await withMockModuleMethods(
      shapeComposition,
      {
        ungroupObjects: async (ctx, args = {}) => {
          const groupId = String(args.groupId || '').trim()
          const group = ctx.state.find((item) => item?.id === groupId && item?.type === 'group')
          if (!group) {
            return { count: 0 }
          }

          const memberIds = Array.isArray(group?.memberIds) ? group.memberIds : []
          for (const memberId of memberIds) {
            const member = ctx.state.find((item) => item.id === memberId)
            if (member) {
              delete member.groupId
            }
          }
          const index = ctx.state.findIndex((item) => item?.id === groupId)
          if (index !== -1) {
            ctx.state.splice(index, 1)
          }
          ctx.executedTools.push({ tool: 'ungroupObjects', groupId, count: memberIds.length })
          return { groupId, count: memberIds.length }
        },
      },
      async () => {
        await withMockGlmClient(
          {
            callGLM: async () => ({
              choices: [
                {
                  message: {
                    content: '',
                    tool_calls: [
                      {
                        id: 'ungroup-1',
                        function: {
                          name: 'ungroupObjects',
                          arguments: JSON.stringify({
                            groupId: templateGroupId,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            parseToolCalls: parseToolCallsFromResponse,
            getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
          },
          async () => {
            const result = await __test.runCommandPlan(context, `ungroup ${templateGroupId}`)
            assert.equal(result.level, undefined)
          },
        )
      },
    )
  })

  const removedGroup = context.state.find((item) => item.id === templateGroupId)
  assert.equal(removedGroup, undefined)
  assert.equal(context.state.filter((item) => item.type === 'shape' && item.id === 'sh1').length, 1)
  assert.equal(context.state.filter((item) => item.type === 'shape' && item.id === 'sh2').length, 1)
})

test('AI-CMDS-047: runtime dispatcher executes bulk deleteObject command', async () => {
  const context = buildContext({
    state: [
      {
        id: 'd1',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'A',
        color: '#fde68a',
        position: { x: 120, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 1,
        createdBy: 'test-user',
        createdAt: Date.now(),
        updatedBy: 'test-user',
        updatedAt: Date.now(),
        version: 1,
      },
      {
        id: 'd2',
        boardId: 'test-board',
        type: 'stickyNote',
        text: 'B',
        color: '#fde68a',
        position: { x: 320, y: 120 },
        size: { width: 180, height: 110 },
        zIndex: 2,
        createdBy: 'test-user',
        createdAt: Date.now(),
        updatedBy: 'test-user',
        updatedAt: Date.now(),
        version: 1,
      },
    ],
  })

  await withMockObjectWriter(async () => {}, async () => {
    await withMockModuleMethods(
      bulkOperations,
      {
        applyBatchDelete: async (ctx, objectIds) => {
          const validIds = [...new Set((Array.isArray(objectIds) ? objectIds : []).map((entry) => String(entry || '').trim()).filter(Boolean))]
          const removed = []
          for (const objectId of validIds) {
            const index = ctx.state.findIndex((item) => item?.id === objectId)
            if (index >= 0) {
              removed.push(objectId)
              ctx.state.splice(index, 1)
            }
          }

          ctx.executedTools.push({
            tool: 'deleteObjects',
            count: removed.length,
          })
          return { count: removed.length }
        },
          },
          async () => {
            await withMockGlmClient(
              {
                callGLM: async () => ({
                  choices: [
                    {
                      message: {
                        content: 'Deleted requested items.',
                        tool_calls: [
                          {
                            id: 'bulk-delete-1',
                            function: {
                              name: 'deleteObjects',
                          arguments: JSON.stringify({
                            objectIds: ['d1', 'd2'],
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            parseToolCalls: parseToolCallsFromResponse,
            getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
              },
              async () => {
                const result = await __test.runCommandPlan(context, 'delete bulk items')
                assert.equal(result.level, undefined)
              },
            )
          },
        )
      })

  assert.equal(context.state.length, 0)
  assert.equal(context.executedTools.some((entry) => entry.tool === 'deleteObject'), false)
})


test('AI-CMDS-018 / T-103: runtime enforces latency/queue budgets for command execution', () => {
  assert.equal(__test.AI_RESPONSE_TARGET_MS, 2_000)
  assert.equal(__test.AI_PROVIDER_TIMEOUT_DEFAULT_MS, 20_000)
  assert.ok(__test.AI_LOCK_WAIT_TIMEOUT_MS >= 30_000)
  assert.ok(__test.AI_LOCK_WAIT_TIMEOUT_MS <= 120_000)
  assert.ok(__test.AI_LOCK_RETRY_INTERVAL_MS <= 100)

  const executeViaLlmBlock = extractTopLevelBlock(functionsSource, 'const executeViaLLM = async (ctx, command) => {')
  assert.match(executeViaLlmBlock, /callGLM\(commandText, boardContext, \{\s*timeoutMs:/)
  assert.match(executeViaLlmBlock, /AI latency budget exhausted before model call/)

  const lockBlock = extractTopLevelBlock(functionsSource, 'const acquireBoardLock = async (boardId, commandId, _queueSequence) => {')
  assert.match(lockBlock, /AI_LOCK_WAIT_TIMEOUT_MS/)
  assert.match(lockBlock, /AI_LOCK_RETRY_INTERVAL_MS/)
  assert.equal(lockBlock.includes('processingSequence !== queueSequence'), false)

  const heartbeatBlock = extractTopLevelBlock(functionsSource, 'const startBoardLockHeartbeat = ({')
  assert.equal(heartbeatBlock.includes('processingSequence !== queueSequence'), false)
})

test('AI-CMDS-027: create-first prompts can skip board-state hydration while edit prompts require it', () => {
  assert.equal(__test.shouldLoadBoardStateForCommand('create 6 boxes with message -'), false)
  assert.equal(__test.shouldLoadBoardStateForCommand('generate a business model canvas'), false)
  assert.equal(__test.shouldLoadBoardStateForCommand('move object-1 to x 200 y 100'), true)
  assert.equal(__test.shouldLoadBoardStateForCommand('resize f7f05d9b-2d12-4b7e-8cc1-999999999999'), true)
  assert.equal(__test.shouldLoadBoardStateForCommand('change hello world stiky color to red'), true)
  assert.equal(__test.shouldLoadBoardStateForCommand('set selected color to blue'), true)
})

test('AI-CMDS-030: typo-tolerant color-change commands are classified as board mutations', () => {
  assert.equal(__test.isLikelyBoardMutationCommand('change hello world stiky color to red'), true)
  assert.equal(__test.isLikelyBoardMutationCommand('chaneg color of all stikies to red'), true)
  assert.equal(__test.isLikelyBoardMutationCommand('set selected color to blue'), true)
})

test('AI-CMDS-028: repetitive box/sticky create prompts trigger grid-template execution hinting', () => {
  assert.equal(__test.shouldHintGridTemplateCommand('create 6 boxes with message -'), true)
  assert.equal(__test.shouldHintGridTemplateCommand('add three sticky notes for launch ideas'), true)
  assert.equal(__test.shouldHintGridTemplateCommand('Generate a Business Model Canvas for ai chat bot'), false)
  assert.equal(__test.shouldHintGridTemplateCommand('move object-1 to center'), false)
})

test('AI-CMDS-029: max token budget scales by command complexity', () => {
  assert.equal(__test.resolveLlmMaxTokensForCommand('create one sticky note hello'), 90)
  assert.equal(__test.resolveLlmMaxTokensForCommand('create 6 boxes with message -'), 140)
  assert.equal(
    __test.resolveLlmMaxTokensForCommand(
      'Generate a Business Model Canvas for ai chat bot, including example channels and revenue streams.',
    ),
    160,
  )
  assert.equal(__test.resolveLlmMaxTokensForCommand('change color to blue'), 320)
})

test('AI-CMDS-022: warning-level command results persist warning status for command history parity', () => {
  const apiBlock = extractTopLevelBlock(functionsSource, 'exports.api = onRequest({ timeoutSeconds: 120, cors: true }, async (req, res) => {')
  assert.match(apiBlock, /const normalizedExistingStatus = resolveCommandStatus\(existingData\.status, existingData\.result\)/)
  assert.match(apiBlock, /status: normalizedExistingStatus/)
  assert.match(apiBlock, /const resultLevel = planResult\?\.level === 'warning' \? 'warning' : undefined/)
  assert.match(apiBlock, /const commandStatus = resolveCommandStatus\('success', result\)/)
  assert.match(apiBlock, /status: commandStatus/)
  assert.match(apiBlock, /res\.status\(200\)\.json\(\{ status: commandStatus, commandId: clientCommandId, result \}\)/)
})

test('AI-CMDS-024: status normalization upgrades success records with warning-level result payloads', () => {
  assert.equal(__test.resolveCommandStatus('success', { level: 'warning' }), 'warning')
  assert.equal(__test.resolveCommandStatus('warning', { level: 'warning' }), 'warning')
  assert.equal(__test.resolveCommandStatus('success', { level: undefined }), 'success')
})

test('AI-CMDS-025: queue-timeout errors return explicit board-busy responses with 429 status', () => {
  const apiBlock = extractTopLevelBlock(functionsSource, 'exports.api = onRequest({ timeoutSeconds: 120, cors: true }, async (req, res) => {')
  assert.match(apiBlock, /const queueTimeoutError = \/another ai command is still running\/i\.test\(errorMessage\)/)
  assert.match(apiBlock, /const responseStatus = queueTimeoutError \? 429 : 500/)
  assert.match(apiBlock, /res\.status\(responseStatus\)\.json\(\{ error: responseErrorMessage \}\)/)
})

test('AI-CMDS-026: aggregated provider-chain failures return classified, human-readable diagnostics', () => {
  const error = new Error(
    'All AI providers failed: [zai-glm] 429: 1113 quota | [minimax] 401: invalid api key | [deepseek] The operation was aborted due to timeout',
  )
  const message = __test.toHumanReadableAiErrorMessage(error)
  assert.match(message, /Z\.ai provider quota is exhausted/i)
  assert.match(message, /MiniMax provider credentials are invalid/i)
  assert.match(message, /DeepSeek provider timed out/i)
})

test('AI-CMDS-003: planner returns warning when LLM provider is unavailable', async () => {
  __test.__setGlmClientForTests(null)
  const noProviderResult = await __test.runCommandPlan(buildContext(), 'create a sticky note')

  assert.equal(noProviderResult.level, 'warning')
  assert.match(noProviderResult.message, /temporarily unavailable/i)

  await withMockGlmClient(
    {
      callGLM: async () => {
        throw new Error('provider timeout')
      },
      parseToolCalls: () => [],
      getTextResponse: () => '',
    },
    async () => {
      const result = await __test.runCommandPlan(buildContext(), 'create a sticky note')
      assert.equal(result.level, 'warning')
      assert.match(result.message, /temporarily unavailable/i)
    },
  )
})

test('AI-CMDS-004: placement helpers anchor single and batch create operations near viewport intent', () => {
  const placement = {
    anchor: { x: 640, y: 360 },
  }

  const single = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'A' },
    placement,
  )

  assert.equal(single.x, 550)
  assert.equal(single.y, 305)

  const inferredPlacementFallback = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'A', position: 'top left', x: 40, y: 60 },
    placement,
    null,
    false,
  )
  assert.equal(inferredPlacementFallback.x, 550)
  assert.equal(inferredPlacementFallback.y, 305)
  assert.equal(inferredPlacementFallback.position, undefined)

  const explicitPlacementPreserved = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'A', x: 40, y: 60 },
    placement,
    null,
    true,
  )
  assert.equal(explicitPlacementPreserved.x, 40)
  assert.equal(explicitPlacementPreserved.y, 60)

  const stalePointerPlacement = {
    anchor: { x: -3000, y: -3000 },
    viewportCenter: { x: 640, y: 360 },
    viewport: { x: 320, y: 180, width: 640, height: 360 },
  }
  const stalePointerFallback = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'A' },
    stalePointerPlacement,
    null,
    false,
  )
  assert.equal(stalePointerFallback.x, 550)
  assert.equal(stalePointerFallback.y, 305)

  const stickySequentialFirst = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'First' },
    placement,
    null,
    false,
    0,
  )
  const stickySequentialSecond = __test.resolveLlmCreateArgsWithPlacement(
    'createStickyNote',
    { text: 'Second' },
    placement,
    null,
    false,
    1,
  )
  assert.ok(stickySequentialSecond.x > stickySequentialFirst.x)
  assert.equal(stickySequentialSecond.y, stickySequentialFirst.y)

  const shapeSequentialFirst = __test.resolveLlmCreateArgsWithPlacement(
    'createShape',
    { type: 'rectangle' },
    placement,
    null,
    false,
    0,
  )
  const shapeSequentialSecond = __test.resolveLlmCreateArgsWithPlacement(
    'createShape',
    { type: 'rectangle' },
    placement,
    null,
    false,
    1,
  )
  assert.ok(shapeSequentialSecond.x > shapeSequentialFirst.x)
  assert.equal(shapeSequentialSecond.y, shapeSequentialFirst.y)

  const frameSequentialFirst = __test.resolveLlmCreateArgsWithPlacement(
    'createFrame',
    { title: 'One' },
    placement,
    null,
    false,
    0,
  )
  const frameSequentialSecond = __test.resolveLlmCreateArgsWithPlacement(
    'createFrame',
    { title: 'Two' },
    placement,
    null,
    false,
    1,
  )
  assert.ok(frameSequentialSecond.x > frameSequentialFirst.x)
  assert.equal(frameSequentialSecond.y, frameSequentialFirst.y)

  const batch = Array.from({ length: 4 }, (_, index) =>
    __test.resolveLlmCreateArgsWithPlacement(
      'createStickyNote',
      { text: `Note ${index + 1}` },
      placement,
      { index, total: 4 },
    ),
  )

  const centers = batch.map((entry) => ({ x: entry.x + 90, y: entry.y + 55 }))
  const avgX = centers.reduce((sum, point) => sum + point.x, 0) / centers.length
  const avgY = centers.reduce((sum, point) => sum + point.y, 0) / centers.length

  assert.ok(Math.abs(avgX - 640) <= 8)
  assert.ok(Math.abs(avgY - 360) <= 8)
  assert.equal(new Set(batch.map((entry) => `${entry.x}:${entry.y}`)).size, batch.length)
})

test('AI-CMDS-005: executeBatch operation normalization supports tool/name formats and rejects invalid entries', () => {
  const operations = __test.toBatchOperations({
    operations: [
      { tool: 'createStickyNote', args: { text: 'One' } },
      { name: 'createShape', args: { type: 'triangle' } },
      { tool: '   ', args: {} },
      { args: { text: 'missing tool' } },
      null,
    ],
  })

  assert.deepEqual(operations, [
    { tool: 'createStickyNote', args: { text: 'One' } },
    { tool: 'createShape', args: { type: 'triangle' } },
  ])
})

test('AI-CMDS-019: sticky shortfall accounting is derived from parsed LLM tool calls', () => {
  const planned = __test.countPlannedStickyOperations([
    { name: 'createStickyNote', arguments: { text: 'A' } },
    {
      name: 'executeBatch',
      arguments: {
        operations: [
          { tool: 'createStickyNote', args: { text: 'B' } },
          { tool: 'createShape', args: { type: 'rectangle' } },
          { tool: 'createStickyNote', args: { text: 'C' } },
        ],
      },
    },
    { name: 'moveObject', arguments: { objectId: 'x', x: 100, y: 100 } },
  ])

  assert.equal(planned, 3)
})

test('AI-CMDS-008 / T-103: template creation paths commit staged writes through Firestore batches', () => {
  const templateMarkers = [
    'const createSwotTemplate = async (ctx) => {',
    'const createRetrospectiveTemplate = async (ctx) => {',
    'const createStickyGridTemplate = async (ctx, args = {}) => {',
    'const createJourneyMap = async (ctx, stages) => {',
    'const createBusinessModelCanvas = async (ctx, spec = {}) => {',
  ]

  for (const marker of templateMarkers) {
    const block = extractTopLevelBlock(functionsSource, marker)
    assert.match(block, /await commitObjectBatchWrites\(\{ boardId: ctx\.boardId, objects: stagedObjects \}\)/)
    assert.equal(block.includes('await createStickyNote('), false, `Sequential sticky writes remain in ${marker}`)
    assert.equal(block.includes('await createShape('), false, `Sequential shape writes remain in ${marker}`)
  }
})

test('AI-CMDS-009 / T-142: runtime planning path is fully LLM-first without deterministic command gating', () => {
  const runPlanBlock = extractTopLevelBlock(functionsSource, 'const runCommandPlan = async (ctx, command) => {')
  assert.match(runPlanBlock, /executeViaLLM/)
  assert.equal(runPlanBlock.includes('executeDeterministicStickyPlan'), false)
  assert.equal(runPlanBlock.includes('parseStickyCommand'), false)
  assert.equal(runPlanBlock.includes('parseReasonListCommand'), false)
  assert.equal(runPlanBlock.includes('parseBusinessModelCanvasCommand'), false)
  assert.equal(runPlanBlock.includes('parseWorkflowFlowchartCommand'), false)
  assert.equal(runPlanBlock.includes('createBusinessModelCanvas'), false)
  assert.equal(runPlanBlock.includes('createWorkflowFlowchart'), false)
})

test('AI-CMDS-006 / T-102 / T-103 / T-142: system prompt includes placement, batching, and intent handling guidance', () => {
  const prompt = toolRegistry.buildSystemPrompt({
    state: [
      {
        id: 's1',
        type: 'stickyNote',
        position: { x: 120, y: 140 },
        size: { width: 180, height: 110 },
        text: 'hello',
        color: '#fde68a',
      },
      {
        id: 'f1',
        type: 'frame',
        position: { x: 420, y: 220 },
        size: { width: 480, height: 300 },
        title: 'Sprint',
        color: '#e2e8f0',
      },
    ],
    commandPlacement: {
      anchor: { x: 640, y: 360 },
      viewportCenter: { x: 640, y: 360 },
      viewport: { x: 320, y: 180, width: 640, height: 360 },
    },
  })

  assert.match(prompt, /PLACEMENT HINTS FROM CLIENT/)
  assert.match(prompt, /OBJECT SNAPSHOT/)
  assert.match(prompt, /executeBatch/i)
  assert.match(prompt, /Convert placement language into tool args/i)
  assert.match(prompt, /board artifacts\/frameworks/i)
  assert.match(prompt, /chat-only output/i)
  assert.match(prompt, /Sticky notes: 1/)
  assert.match(prompt, /Frames: 1/)
})

// ============================================================================
// BULK OPERATION TESTS (MAX-45)
// ============================================================================

test('AI-BULK-001: bulk create fallback creates multiple stickies without overlap', async () => {
  const writeCalls = []
  const context = buildContext()

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'create 10 stickies')
          // Should succeed via fallback, not return warning
          assert.equal(result.level, undefined)
          assert.match(result.message, /created 10 sticky notes/i)
        },
      )
    },
  )

  assert.equal(context.state.length, 10)
  assert.equal(context.state.filter(o => o.type === 'stickyNote').length, 10)

  // Verify no overlaps (check positions are distinct)
  const positions = new Set(context.state.map(o => `${o.position.x},${o.position.y}`))
  assert.equal(positions.size, 10, 'All positions should be unique (no overlap)')

  // Verify write calls were chunked properly
  assert.ok(writeCalls.length > 0, 'Expected write calls')
})

test('AI-BULK-002: bulk create creates colored shapes', async () => {
  const writeCalls = []
  const context = buildContext()

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'add 5 blue shapes')
          assert.equal(result.level, undefined)
          assert.match(result.message, /created 5 shapes/i)
        },
      )
    },
  )

  assert.equal(context.state.length, 5)
  assert.equal(context.state.filter(o => o.type === 'shape').length, 5)

  // Verify all shapes have the blue color
  for (const obj of context.state) {
    if (obj.type === 'shape') {
      assert.equal(obj.color, '#93c5fd', `Expected blue color, got ${obj.color}`)
    }
  }
})

test('AI-BULK-003: bulk create handles >400 objects with chunking', async () => {
  const writeCalls = []
  const context = buildContext()

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Creating 500 sticky notes...',
                  tool_calls: [],
                },
              },
            ],
          }),
          parseToolCalls: () => [],
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'create 500 stickies')
          assert.equal(result.level, undefined)
          assert.match(result.message, /created 500 sticky notes/i)
        },
      )
    },
  )

  assert.equal(context.state.length, 500)
  // With 500 items and chunk size of 400, we should have at least 2 write calls
  assert.ok(writeCalls.length >= 2, `Expected at least 2 write calls for chunking, got ${writeCalls.length}`)
})

test('AI-BULK-004: bulk color mutation changes multiple items', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      { id: 's1', boardId: 'test-board', type: 'stickyNote', text: 'Note 1', color: '#fde68a', position: { x: 100, y: 100 }, size: { width: 180, height: 110 }, zIndex: 1, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 's2', boardId: 'test-board', type: 'stickyNote', text: 'Note 2', color: '#fde68a', position: { x: 300, y: 100 }, size: { width: 180, height: 110 }, zIndex: 2, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 's3', boardId: 'test-board', type: 'stickyNote', text: 'Note 3', color: '#93c5fd', position: { x: 500, y: 100 }, size: { width: 180, height: 110 }, zIndex: 3, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
    ],
  })

  await withMockModuleMethods(
    bulkColorOperations,
    {
      changeColors: async (ctx, args = {}) => {
        const ids = [...new Set((Array.isArray(args.objectIds) ? args.objectIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
        const normalized = bulkColorOperations
          ? bulkColorOperations
          : null
        const targetColor = args.color === 'red' ? '#fca5a5' : args.color
        const changed = []

        for (const id of ids) {
          const object = ctx.state.find((entry) => entry?.id === id)
          if (object) {
            object.color = targetColor
            changed.push(id)
          }
        }

        ctx.executedTools.push({
          tool: 'changeColors',
          count: changed.length,
          color: targetColor,
          objectIds: changed,
        })

        return { count: changed.length, normalizedColor: targetColor, ...(normalized || {}) }
      },
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Changed 2 sticky notes to red.',
                  tool_calls: [
                    {
                      id: 'bulk-color-004',
                      function: {
                        name: 'changeColors',
                        arguments: JSON.stringify({
                          objectIds: ['s1', 's2'],
                          color: 'red',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'make all yellow stickies red')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 2 sticky notes/i)
        },
      )
    },
  )

  // Verify the yellow stickies changed to red
  const s1 = context.state.find(o => o.id === 's1')
  const s2 = context.state.find(o => o.id === 's2')
  const s3 = context.state.find(o => o.id === 's3')

  assert.equal(s1.color, '#fca5a5', 'Expected red color')
  assert.equal(s2.color, '#fca5a5', 'Expected red color')
  assert.equal(s3.color, '#93c5fd', 'Blue sticky should remain unchanged')
})

test('AI-BULK-005: bulk delete removes multiple items', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      { id: 's1', boardId: 'test-board', type: 'stickyNote', text: 'Note 1', color: '#fde68a', position: { x: 100, y: 100 }, size: { width: 180, height: 110 }, zIndex: 1, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 's2', boardId: 'test-board', type: 'stickyNote', text: 'Note 2', color: '#fde68a', position: { x: 300, y: 100 }, size: { width: 180, height: 110 }, zIndex: 2, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 's3', boardId: 'test-board', type: 'stickyNote', text: 'Note 3', color: '#93c5fd', position: { x: 500, y: 100 }, size: { width: 180, height: 110 }, zIndex: 3, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
    ],
  })

  await withMockGlmClient(
    {
      callGLM: async () => ({
        choices: [
          {
            message: {
              content: 'Deleted 2 sticky notes.',
              tool_calls: [
                {
                  id: 'bulk-delete-005',
                  function: {
                    name: 'deleteObjects',
                    arguments: JSON.stringify({
                      objectIds: ['s1', 's2'],
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
      parseToolCalls: parseToolCallsFromResponse,
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const result = await __test.runCommandPlan(context, 'delete all yellow stickies')
      assert.equal(result.level, undefined)
      assert.match(result.message, /deleted 2 sticky notes/i)
    },
  )

  // Verify the yellow stickies are deleted (marked as deleted)
  const s1 = context.state.find(o => o.id === 's1')
  const s2 = context.state.find(o => o.id === 's2')
  const s3 = context.state.find(o => o.id === 's3')

  // After chunked delete, items should be removed from state
  assert.equal(s1, undefined, 's1 should be removed from state')
  assert.equal(s2, undefined, 's2 should be removed from state')
  assert.notEqual(s3, undefined, 's3 should still exist')
})

test('AI-BULK-006: bulk operations at scale (>400 items)', async () => {
  const now = Date.now()
  const items = []
  for (let i = 0; i < 450; i++) {
    items.push({
      id: `s${i}`,
      boardId: 'test-board',
      type: 'stickyNote',
      text: `Note ${i}`,
      color: '#fde68a',
      position: { x: 100 + (i % 10) * 200, y: 100 + Math.floor(i / 10) * 150 },
      size: { width: 180, height: 110 },
      zIndex: i + 1,
      createdBy: 'test-user',
      createdAt: now,
      updatedBy: 'test-user',
      updatedAt: now,
      version: 1,
    })
  }

  const context = buildContext({ state: items })

  const objectIds = items.map((item) => item.id)
  await withMockModuleMethods(
    bulkColorOperations,
    {
      changeColors: async (ctx, args = {}) => {
        const ids = [...new Set((Array.isArray(args.objectIds) ? args.objectIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
        let changed = 0

        for (const objectId of ids) {
          const object = ctx.state.find((entry) => entry?.id === objectId)
          if (object) {
            object.color = '#93c5fd'
            changed += 1
          }
        }

        ctx.executedTools.push({
          tool: 'changeColors',
          count: changed,
          color: '#93c5fd',
          objectIds: ids,
        })

        return { count: changed }
      },
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Changed 450 sticky notes to blue.',
                  tool_calls: [
                    {
                      id: 'bulk-color-006',
                      function: {
                        name: 'changeColors',
                        arguments: JSON.stringify({
                          objectIds,
                          color: 'blue',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'make all stickies blue')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 450 sticky notes/i)
        },
      )
    },
  )

  // Verify all items changed color
  const blueCount = context.state.filter(o => o.color === '#93c5fd').length
  assert.equal(blueCount, 450, 'All 450 items should be blue')
})

test('AI-BULK-007: bulk create creates frames', async () => {
  const writeCalls = []
  const context = buildContext()

  await withMockObjectWriter(
    async (payload) => {
      writeCalls.push(payload)
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Created 3 frames.',
                  tool_calls: [
                    {
                      id: 'bulk-create-007',
                      function: {
                        name: 'createObjects',
                        arguments: JSON.stringify({
                          objects: [
                            { type: 'frame', title: 'Frame 1' },
                            { type: 'frame', title: 'Frame 2' },
                            { type: 'frame', title: 'Frame 3' },
                          ],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          const result = await __test.runCommandPlan(context, 'create 3 frames')
          assert.equal(result.level, undefined)
          assert.match(result.message, /created 3 frames/i)
        },
      )
    },
  )

  assert.equal(context.state.length, 3)
  assert.equal(context.state.filter(o => o.type === 'frame').length, 3)
})

test('AI-BULK-008: changing shape, content, and color on multiple items', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      { id: 's1', boardId: 'test-board', type: 'stickyNote', text: 'Note 1', color: '#fde68a', position: { x: 100, y: 100 }, size: { width: 180, height: 110 }, zIndex: 1, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 's2', boardId: 'test-board', type: 'stickyNote', text: 'Note 2', color: '#fde68a', position: { x: 300, y: 100 }, size: { width: 180, height: 110 }, zIndex: 2, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
      { id: 'sh1', boardId: 'test-board', type: 'shape', shapeType: 'rectangle', color: '#93c5fd', position: { x: 500, y: 100 }, size: { width: 100, height: 100 }, zIndex: 3, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
    ],
  })

  await withMockModuleMethods(
    bulkColorOperations,
    {
      changeColors: async (ctx, args = {}) => {
        const ids = [...new Set((Array.isArray(args.objectIds) ? args.objectIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
        let changed = 0

        for (const objectId of ids) {
          const object = ctx.state.find((entry) => entry?.id === objectId)
          if (object) {
            object.color = '#86efac'
            changed += 1
          }
        }

        ctx.executedTools.push({
          tool: 'changeColors',
          count: changed,
          color: '#86efac',
          objectIds: ids,
        })

        return { count: changed }
      },
    },
    async () => {
      await withMockGlmClient(
        {
          callGLM: async () => ({
            choices: [
              {
                message: {
                  content: 'Changed 3 objects to green.',
                  tool_calls: [
                    {
                      id: 'bulk-color-008',
                      function: {
                        name: 'changeColors',
                        arguments: JSON.stringify({
                          objectIds: ['s1', 's2', 'sh1'],
                          color: 'green',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          parseToolCalls: parseToolCallsFromResponse,
          getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
        },
        async () => {
          // Change all items to green
          const result = await __test.runCommandPlan(context, 'make everything green')
          assert.equal(result.level, undefined)
          assert.match(result.message, /changed 3 objects/i)
        },
      )
    },
  )

  // Verify all items changed to green
  for (const obj of context.state) {
    assert.equal(obj.color, '#86efac', `Expected green color for ${obj.id}, got ${obj.color}`)
  }
})

test('AI-BULK-009: positions avoid existing objects', async () => {
  const now = Date.now()
  const context = buildContext({
    state: [
      { id: 'existing', boardId: 'test-board', type: 'stickyNote', text: 'Existing', color: '#fde68a', position: { x: 640, y: 360 }, size: { width: 180, height: 110 }, zIndex: 1, createdBy: 'test-user', createdAt: now, updatedBy: 'test-user', updatedAt: now, version: 1 },
    ],
  })

  await withMockGlmClient(
    {
      callGLM: async () => ({
        choices: [
          {
            message: {
              content: 'Created 5 sticky notes.',
              tool_calls: [
                {
                  id: 'bulk-create-009',
                  function: {
                    name: 'createObjects',
                    arguments: JSON.stringify({
                      objects: [
                        { type: 'stickyNote', text: 'Frame note 1' },
                        { type: 'stickyNote', text: 'Frame note 2' },
                        { type: 'stickyNote', text: 'Frame note 3' },
                        { type: 'stickyNote', text: 'Frame note 4' },
                        { type: 'stickyNote', text: 'Frame note 5' },
                      ],
                    }),
                  },
                },
              ],
            },
          },
        ],
      }),
      parseToolCalls: parseToolCallsFromResponse,
      getTextResponse: (response) => response?.choices?.[0]?.message?.content || '',
    },
    async () => {
      const result = await __test.runCommandPlan(context, 'create 5 stickies')
      assert.equal(result.level, undefined)
      assert.match(result.message, /created 5 sticky notes/i)
    },
  )

  // Verify new stickies don't overlap with existing one
  const existing = context.state.find(o => o.id === 'existing')
  const newStickies = context.state.filter(o => o.id !== 'existing')

  assert.equal(newStickies.length, 5)

  for (const sticky of newStickies) {
    // Simple bounding box check - should not overlap
    const overlapsX = Math.abs(sticky.position.x - existing.position.x) < 180
    const overlapsY = Math.abs(sticky.position.y - existing.position.y) < 110
    assert.ok(!(overlapsX && overlapsY), `Sticky at (${sticky.position.x}, ${sticky.position.y}) overlaps with existing at (${existing.position.x}, ${existing.position.y})`)
  }
})
