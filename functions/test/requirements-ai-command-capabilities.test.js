const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const toolRegistry = require('../src/tool-registry.js')
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
  try {
    await run()
  } finally {
    __test.__setObjectWriterForTests(null)
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

test('AI-CMDS-016 / FR-16: runtime dispatcher routes grid, spacing, and journey-map tool calls', () => {
  const executeBlock = extractTopLevelBlock(functionsSource, 'const executeLlmToolCall = async (ctx, toolName, rawArgs, options = {}) => {')
  assert.match(executeBlock, /case 'createStickyGridTemplate'/)
  assert.match(executeBlock, /case 'spaceElementsEvenly'/)
  assert.match(executeBlock, /case 'createJourneyMap'/)
  assert.match(executeBlock, /case 'createBusinessModelCanvas'/)
  assert.match(executeBlock, /case 'createWorkflowFlowchart'/)
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
