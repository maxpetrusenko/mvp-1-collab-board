/* eslint-disable no-console */
// Tool definitions for GLM-5 function calling
// Maps LLM tools to existing handler functions in index.js

const COLOR_OPTIONS = ['yellow', 'blue', 'green', 'pink', 'red', 'orange', 'purple', 'gray']
const SHAPE_TYPES = ['rectangle', 'circle', 'diamond', 'triangle']
const POSITION_OPTIONS = ['top left', 'top right', 'bottom left', 'bottom right', 'center', 'top', 'bottom', 'left', 'right']
const ANCHOR_OPTIONS = ['top', 'right', 'bottom', 'left', 'center']

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'createStickyNote',
      description: 'Create a sticky note on the collaborative whiteboard',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Text content for the sticky note (maximum 300 characters)'
          },
          color: {
            type: 'string',
            enum: COLOR_OPTIONS,
            description: 'Background color of the sticky note (optional, defaults to yellow)'
          },
          shapeType: {
            type: 'string',
            enum: SHAPE_TYPES,
            description: 'Optional sticky note shape variant'
          },
          position: {
            type: 'string',
            enum: POSITION_OPTIONS,
            description: 'Relative position on the board (optional, e.g., "top left", "center", "bottom right")'
          },
          x: {
            type: 'number',
            description: 'X position in pixels (optional, defaults to 120, ignored if position is specified)'
          },
          y: {
            type: 'number',
            description: 'Y position in pixels (optional, defaults to 120, ignored if position is specified)'
          },
          width: {
            type: 'number',
            description: 'Optional width override in pixels'
          },
          height: {
            type: 'number',
            description: 'Optional height override in pixels'
          }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createShape',
      description: 'Create a geometric sticky-note shape on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: SHAPE_TYPES,
            description: 'The type of shape to create'
          },
          width: {
            type: 'number',
            description: 'Width in pixels (optional, defaults to 220)'
          },
          height: {
            type: 'number',
            description: 'Height in pixels (optional, defaults to 140)'
          },
          color: {
            type: 'string',
            enum: COLOR_OPTIONS,
            description: 'Fill color of the shape (optional, defaults to blue)'
          },
          text: {
            type: 'string',
            description: 'Optional text label to render inside the shape'
          },
          position: {
            type: 'string',
            enum: POSITION_OPTIONS,
            description: 'Relative position on the board (optional, e.g., "top left", "center", "bottom right")'
          },
          x: {
            type: 'number',
            description: 'X position in pixels (optional, defaults to 200, ignored if position is specified)'
          },
          y: {
            type: 'number',
            description: 'Y position in pixels (optional, defaults to 200, ignored if position is specified)'
          }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createFrame',
      description: 'Create a frame container for grouping objects on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title text for the frame'
          },
          width: {
            type: 'number',
            description: 'Width in pixels (optional, defaults to 480)'
          },
          height: {
            type: 'number',
            description: 'Height in pixels (optional, defaults to 300)'
          },
          position: {
            type: 'string',
            enum: POSITION_OPTIONS,
            description: 'Relative position on the board (optional, e.g., "top left", "center", "bottom right")'
          },
          x: {
            type: 'number',
            description: 'X position in pixels (optional, defaults to 120)'
          },
          y: {
            type: 'number',
            description: 'Y position in pixels (optional, defaults to 120)'
          }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createConnector',
      description: 'Create a connector/arrow line between two objects on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          fromId: {
            type: 'string',
            description: 'ID of the source object to connect from'
          },
          toId: {
            type: 'string',
            description: 'ID of the target object to connect to'
          },
          color: {
            type: 'string',
            enum: COLOR_OPTIONS,
            description: 'Color of the connector line (optional, defaults to blue)'
          },
          style: {
            type: 'string',
            enum: ['arrow', 'line'],
            description: 'Connector style (optional, defaults to arrow)'
          },
          fromAnchor: {
            type: 'string',
            enum: ANCHOR_OPTIONS,
            description: 'Optional source-side anchor (top/right/bottom/left/center)'
          },
          toAnchor: {
            type: 'string',
            enum: ANCHOR_OPTIONS,
            description: 'Optional target-side anchor (top/right/bottom/left/center)'
          }
        },
        required: ['fromId', 'toId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'moveObject',
      description: 'Move an existing object to a new position on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to move'
          },
          x: {
            type: 'number',
            description: 'New X position in pixels'
          },
          y: {
            type: 'number',
            description: 'New Y position in pixels'
          }
        },
        required: ['objectId', 'x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resizeObject',
      description: 'Resize an existing object on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to resize'
          },
          width: {
            type: 'number',
            description: 'Updated width in pixels'
          },
          height: {
            type: 'number',
            description: 'Updated height in pixels'
          }
        },
        required: ['objectId', 'width', 'height']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateText',
      description: 'Update text content of an existing sticky note',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the sticky note to edit'
          },
          newText: {
            type: 'string',
            description: 'Updated text content'
          }
        },
        required: ['objectId', 'newText']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'changeColor',
      description: 'Change the color of an existing object on the whiteboard',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to modify'
          },
          color: {
            type: 'string',
            enum: COLOR_OPTIONS,
            description: 'New color for the object'
          }
        },
        required: ['objectId', 'color']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getBoardState',
      description: 'Fetch the current board object state snapshot',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'organizeBoardByColor',
      description: 'Group and arrange all board objects by their colors into clusters',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'organizeBoardByType',
      description: 'Group and arrange all board objects by their type (frames, shapes, sticky notes)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'arrangeGrid',
      description: 'Arrange all sticky notes in a neat grid layout',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createStickyGridTemplate',
      description: 'Create a sticky-note grid template. Use for requests like "create 2x3 layout".',
      parameters: {
        type: 'object',
        properties: {
          rows: {
            type: 'number',
            description: 'Number of rows (1-6)'
          },
          columns: {
            type: 'number',
            description: 'Number of columns (1-6)'
          },
          labelText: {
            type: 'string',
            description: 'Optional label seed. Comma-separated labels are distributed across cells.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'spaceElementsEvenly',
      description: 'Space movable objects evenly on the horizontal axis.',
      parameters: {
        type: 'object',
        properties: {
          objectIds: {
            type: 'array',
            description: 'Optional subset of object IDs to space. Omit to use all movable objects.',
            items: {
              type: 'string'
            }
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createJourneyMap',
      description: 'Create a user journey map template with staged columns and labels.',
      parameters: {
        type: 'object',
        properties: {
          stages: {
            type: 'number',
            description: 'Number of journey stages (3-10)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createSwotTemplate',
      description: 'Create a SWOT analysis template with 4 quadrants (Strengths, Weaknesses, Opportunities, Threats)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createRetrospectiveTemplate',
      description: 'Create a retrospective template with 3 columns (What went well, What could be improved, Action items)',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rotateObject',
      description: 'Rotate an object to a specific angle in degrees',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to rotate'
          },
          angle: {
            type: 'number',
            description: 'Rotation angle in degrees (0-360, will be normalized)'
          }
        },
        required: ['objectId', 'angle']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteObject',
      description: 'Delete an object from the board',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to delete'
          }
        },
        required: ['objectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'duplicateObject',
      description: 'Create a duplicate of an existing object on the board',
      parameters: {
        type: 'object',
        properties: {
          objectId: {
            type: 'string',
            description: 'ID of the object to duplicate'
          },
          offsetX: {
            type: 'number',
            description: 'X offset in pixels for the duplicate (optional, defaults to 20)'
          },
          offsetY: {
            type: 'number',
            description: 'Y offset in pixels for the duplicate (optional, defaults to 20)'
          }
        },
        required: ['objectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'executeBatch',
      description: 'Execute a batch of board operations in one call. Prefer for multi-object creation or mixed multi-step actions.',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            minItems: 1,
            maxItems: 40,
            description: 'Ordered operations to execute. Each entry should include tool and args.',
            items: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  description: 'Tool name to execute for this operation'
                },
                args: {
                  type: 'object',
                  description: 'Arguments payload for the tool'
                }
              },
              required: ['tool']
            }
          }
        },
        required: ['operations']
      }
    }
  }
]

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const sanitizeSnippet = (value, maxLength = 80) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

const describeBoardObject = (object) => {
  if (!object || typeof object !== 'object') {
    return 'invalid-object'
  }

  const id = sanitizeSnippet(object.id, 48) || 'unknown-id'
  const type = sanitizeSnippet(object.type, 24) || 'unknown-type'
  const color = sanitizeSnippet(object.color, 20) || 'none'
  const text = sanitizeSnippet(object.text || object.title, 64)

  if (type === 'connector') {
    const startX = toFiniteNumber(object.start?.x, 0)
    const startY = toFiniteNumber(object.start?.y, 0)
    const endX = toFiniteNumber(object.end?.x, 0)
    const endY = toFiniteNumber(object.end?.y, 0)
    const fromId = sanitizeSnippet(object.fromObjectId, 32) || 'none'
    const toId = sanitizeSnippet(object.toObjectId, 32) || 'none'
    return `- id=${id} type=${type} color=${color} from=${fromId} to=${toId} start=(${Math.round(startX)},${Math.round(startY)}) end=(${Math.round(endX)},${Math.round(endY)})`
  }

  const x = toFiniteNumber(object.position?.x, 0)
  const y = toFiniteNumber(object.position?.y, 0)
  const width = toFiniteNumber(object.size?.width, 0)
  const height = toFiniteNumber(object.size?.height, 0)

  return `- id=${id} type=${type} color=${color} position=(${Math.round(x)},${Math.round(y)}) size=(${Math.round(width)}x${Math.round(height)})${text ? ` text="${text}"` : ''}`
}

const buildObjectSnapshot = (state, maxItems = 40) => {
  if (!Array.isArray(state) || state.length === 0) {
    return '- (no objects on board)'
  }

  const safeMaxItems = Math.max(1, Math.min(80, maxItems))
  const preview = state.slice(0, safeMaxItems).map((item) => describeBoardObject(item))
  if (state.length > safeMaxItems) {
    preview.push(`- ... ${state.length - safeMaxItems} more objects omitted`)
  }
  return preview.join('\n')
}

const buildPlacementSummary = (boardContext) => {
  const placement = boardContext?.commandPlacement
  if (!placement || typeof placement !== 'object') {
    return '- No placement hint provided by client.'
  }

  const anchor = placement.anchor
  const pointer = placement.pointer
  const viewportCenter = placement.viewportCenter
  const viewport = placement.viewport
  const parts = []

  if (anchor && Number.isFinite(Number(anchor.x)) && Number.isFinite(Number(anchor.y))) {
    parts.push(`- Anchor hint: (${Math.round(Number(anchor.x))}, ${Math.round(Number(anchor.y))})`)
  }
  if (pointer && Number.isFinite(Number(pointer.x)) && Number.isFinite(Number(pointer.y))) {
    parts.push(`- Pointer hint: (${Math.round(Number(pointer.x))}, ${Math.round(Number(pointer.y))})`)
  }
  if (
    viewportCenter &&
    Number.isFinite(Number(viewportCenter.x)) &&
    Number.isFinite(Number(viewportCenter.y))
  ) {
    parts.push(
      `- Viewport center hint: (${Math.round(Number(viewportCenter.x))}, ${Math.round(Number(viewportCenter.y))})`,
    )
  }
  if (
    viewport &&
    Number.isFinite(Number(viewport.x)) &&
    Number.isFinite(Number(viewport.y)) &&
    Number.isFinite(Number(viewport.width)) &&
    Number.isFinite(Number(viewport.height))
  ) {
    parts.push(
      `- Viewport bounds: x=${Math.round(Number(viewport.x))}, y=${Math.round(Number(viewport.y))}, width=${Math.round(Number(viewport.width))}, height=${Math.round(Number(viewport.height))}`,
    )
  }

  return parts.length > 0 ? parts.join('\n') : '- Placement hint payload was present but empty.'
}

// Helper to build system prompt with board context
function buildSystemPrompt(boardContext) {
  const state = boardContext.state || []
  const stickyCount = state.filter(o => o.type === 'stickyNote').length
  const shapeCount = state.filter(o => o.type === 'shape').length
  const frameCount = state.filter(o => o.type === 'frame').length
  const connectorCount = state.filter(o => o.type === 'connector').length
  const objectSnapshot = buildObjectSnapshot(state)
  const placementSummary = buildPlacementSummary(boardContext)

  return `You are CollabBoard's board note creator AI agent.
Your job is to understand user intent for board work and call tools to apply the right board updates.
You decide how many tool calls are needed and in which order.

CURRENT BOARD STATE:
- Total objects: ${state.length}
- Sticky notes: ${stickyCount}
- Shapes: ${shapeCount}
- Frames: ${frameCount}
- Connectors: ${connectorCount}

PLACEMENT HINTS FROM CLIENT:
${placementSummary}

OBJECT SNAPSHOT:
${objectSnapshot}

AVAILABLE COLORS: ${COLOR_OPTIONS.join(', ')}
SHAPE TYPES: ${SHAPE_TYPES.join(', ')}
POSITION OPTIONS: ${POSITION_OPTIONS.join(', ')}

GUIDELINES:
1. Treat the raw user message as authoritative intent and infer board actions from it.
2. For board changes, call tools directly. Prefer executeBatch as a compound tool for multi-object or multi-step requests to reduce round-trips and latency.
3. Convert placement language into tool args: use "position" for named regions and x/y for coordinates like "at 640,360" or "x=640 y=360".
4. Use dedicated layout/template tools when they match intent: arrangeGrid, createStickyGridTemplate (for 2x3-style requests), spaceElementsEvenly, createSwotTemplate, createRetrospectiveTemplate, createJourneyMap.
5. If placement is missing, use client placement hints first, then sensible defaults.
6. Use existing object IDs from board context. Never invent IDs for existing objects.
7. Keep sticky text concise, concrete, and varied. Generate distinct high-quality ideas, reasons, or action items.
8. Requests for board artifacts/frameworks (for example canvas, matrix, map, SWOT, retrospective, journey map) are board-mutation intents: create content on the board with tools, not text-only replies.
9. Only return plain text with no tool calls when the user clearly asks for chat-only output and does not ask for a board artifact.
10. For workflow/flowchart requests, create labeled shapes and connect steps using createConnector arrows.
11. For uncertain intent, make the best reasonable assumption and execute useful board actions.`
}

module.exports = { TOOL_DEFINITIONS, buildSystemPrompt, COLOR_OPTIONS, SHAPE_TYPES, POSITION_OPTIONS }
