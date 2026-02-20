/* eslint-disable no-console */
// Tool definitions for GLM-5 function calling
// Maps LLM tools to existing handler functions in index.js

const COLOR_OPTIONS = ['yellow', 'blue', 'green', 'pink', 'red', 'orange', 'purple', 'gray']
const SHAPE_TYPES = ['rectangle', 'circle', 'diamond', 'triangle']
const POSITION_OPTIONS = ['top left', 'top right', 'bottom left', 'bottom right', 'center', 'top', 'bottom', 'left', 'right']

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
            description: 'Color of the connector line (optional, defaults to dark)'
          },
          style: {
            type: 'string',
            enum: ['arrow', 'line'],
            description: 'Connector style (optional, defaults to arrow)'
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
            description: 'X offset in pixels for the duplicate (optional, defaults to 30)'
          },
          offsetY: {
            type: 'number',
            description: 'Y offset in pixels for the duplicate (optional, defaults to 30)'
          }
        },
        required: ['objectId']
      }
    }
  }
]

// Helper to build system prompt with board context
function buildSystemPrompt(boardContext) {
  const state = boardContext.state || []
  const stickyCount = state.filter(o => o.type === 'stickyNote').length
  const shapeCount = state.filter(o => o.type === 'shape').length
  const frameCount = state.filter(o => o.type === 'frame').length
  const connectorCount = state.filter(o => o.type === 'connector').length

  return `You are an AI assistant for a collaborative whiteboard application called CollabBoard.
Your job is to interpret user commands and call the appropriate tools to manipulate the board.

CURRENT BOARD STATE:
- Total objects: ${state.length}
- Sticky notes: ${stickyCount}
- Shapes: ${shapeCount}
- Frames: ${frameCount}
- Connectors: ${connectorCount}

AVAILABLE COLORS: ${COLOR_OPTIONS.join(', ')}
SHAPE TYPES: ${SHAPE_TYPES.join(', ')}

GUIDELINES:
1. Call only ONE tool per request unless the user explicitly asks for multiple actions
2. Use sensible defaults for optional parameters (x=120, y=120 for new objects)
3. Don't invent object IDs - use existing ones from the board context when referencing objects
4. If the command is ambiguous, make a reasonable assumption based on context
5. Position new objects at (120, 120) if the user doesn't specify a location
6. For "arrange" commands without specifics, prefer arrangeGrid for stickies
7. Color names should be lowercase and match the available options exactly
8. When user says "sticker" or "sticky note", use createStickyNote
9. If the request is conversational (for example math, explanation, or general chat) and does not need board changes, reply with plain text and do not call tools.`
}

module.exports = { TOOL_DEFINITIONS, buildSystemPrompt, COLOR_OPTIONS, SHAPE_TYPES, POSITION_OPTIONS }
