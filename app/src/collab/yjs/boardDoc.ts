import * as Y from 'yjs'

import type { BoardObject } from '../../types/board'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

type YLeaf = JsonPrimitive | Uint8Array
type YValue = YLeaf | Y.Map<YValue> | Y.Array<YValue>

const OBJECTS_MAP_KEY = 'objects'

const isJsonPrimitive = (value: unknown): value is JsonPrimitive =>
  value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const sanitizeForJson = (value: unknown): JsonValue | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (isJsonPrimitive(value)) {
    return value
  }

  if (Array.isArray(value)) {
    const next = value
      .map((entry) => sanitizeForJson(entry))
      .filter((entry): entry is JsonValue => entry !== undefined)
    return next
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, sanitizeForJson(entry)] as const)
      .filter(([, entry]) => entry !== undefined)

    return Object.fromEntries(entries) as { [key: string]: JsonValue }
  }

  return undefined
}

const toYValue = (value: JsonValue): YValue => {
  if (Array.isArray(value)) {
    const yArray = new Y.Array<YValue>()
    yArray.insert(0, value.map((entry) => toYValue(entry)))
    return yArray
  }

  if (value !== null && typeof value === 'object') {
    const yMap = new Y.Map<YValue>()
    Object.entries(value).forEach(([key, entry]) => {
      yMap.set(key, toYValue(entry))
    })
    return yMap
  }

  return value
}

const fromYValue = (value: YValue): JsonValue => {
  if (value instanceof Y.Map) {
    const next: Record<string, JsonValue> = {}
    value.forEach((entryValue, key) => {
      next[key] = fromYValue(entryValue as YValue)
    })
    return next
  }

  if (value instanceof Y.Array) {
    return value.toArray().map((entry) => fromYValue(entry as YValue))
  }

  return value as JsonPrimitive
}

const toYMapFromObject = (object: BoardObject): Y.Map<YValue> => {
  const yMap = new Y.Map<YValue>()
  const sanitized = sanitizeForJson(object)
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return yMap
  }

  Object.entries(sanitized).forEach(([key, value]) => {
    yMap.set(key, toYValue(value))
  })

  return yMap
}

const fromYMapToBoardObject = (yMap: Y.Map<YValue>): BoardObject | null => {
  const json = fromYValue(yMap)
  if (!json || Array.isArray(json) || typeof json !== 'object') {
    return null
  }

  const candidate = json as Partial<BoardObject>
  if (!candidate.id || !candidate.type || !candidate.position || !candidate.size) {
    return null
  }

  return candidate as BoardObject
}

const getObjectsMap = (doc: Y.Doc) => doc.getMap<Y.Map<YValue>>(OBJECTS_MAP_KEY)

export const createYjsBoardDoc = (initialObjects: BoardObject[] = []) => {
  const doc = new Y.Doc()
  replaceBoardObjectsInDoc(doc, initialObjects)
  return doc
}

export const replaceBoardObjectsInDoc = (doc: Y.Doc, objects: BoardObject[]) => {
  const objectsMap = getObjectsMap(doc)

  doc.transact(() => {
    Array.from(objectsMap.keys()).forEach((id) => {
      objectsMap.delete(id)
    })

    objects.forEach((object) => {
      objectsMap.set(object.id, toYMapFromObject(object))
    })
  }, 'replace-board-objects')
}

export const upsertBoardObjectInDoc = (doc: Y.Doc, object: BoardObject) => {
  const objectsMap = getObjectsMap(doc)
  doc.transact(() => {
    objectsMap.set(object.id, toYMapFromObject(object))
  }, 'upsert-board-object')
}

export const deleteBoardObjectFromDoc = (doc: Y.Doc, objectId: string) => {
  const objectsMap = getObjectsMap(doc)
  doc.transact(() => {
    objectsMap.delete(objectId)
  }, 'delete-board-object')
}

export const readBoardObjectsFromDoc = (doc: Y.Doc): BoardObject[] => {
  const objectsMap = getObjectsMap(doc)
  const objects: BoardObject[] = []

  objectsMap.forEach((entry) => {
    const object = fromYMapToBoardObject(entry)
    if (!object || object.deleted) {
      return
    }
    objects.push(object)
  })

  return objects.sort((left, right) => (left.zIndex || 0) - (right.zIndex || 0))
}

export const encodeBoardDocState = (doc: Y.Doc) => Y.encodeStateAsUpdate(doc)

export const applyBoardDocUpdate = (doc: Y.Doc, update: Uint8Array) => {
  Y.applyUpdate(doc, update)
}
