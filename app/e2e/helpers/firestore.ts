import { loadAuthTestConfig } from './auth'

type FirestoreValue = {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  nullValue?: null
  mapValue?: { fields?: Record<string, FirestoreValue> }
  arrayValue?: { values?: FirestoreValue[] }
}

type FirestoreDocument = {
  name: string
  fields?: Record<string, FirestoreValue>
}

export type BoardObject = {
  id: string
  type: string
  text?: string
  title?: string
  color?: string
  style?: string
  shapeType?: string
  start?: { x?: number; y?: number }
  end?: { x?: number; y?: number }
  fromObjectId?: string | null
  toObjectId?: string | null
  fromAnchor?: string | null
  toAnchor?: string | null
  rotation?: number
  fontSize?: number
  frameId?: string | null
  votesByUser?: Record<string, boolean>
  position?: { x?: number; y?: number }
  size?: { width?: number; height?: number }
  createdAt?: number
  updatedAt?: number
  version?: number
  deleted?: boolean
}

export type BoardMeta = {
  id: string
  name?: string
  description?: string
  ownerId?: string
  sharedWith?: string[]
  sharedRoles?: Record<string, 'edit' | 'view'>
  updatedAt?: number
}

const FIRESTORE_FETCH_TIMEOUT_MS = 20_000

const fromFirestoreValue = (value: FirestoreValue | undefined): unknown => {
  if (!value) return undefined
  if (value.stringValue !== undefined) return value.stringValue
  if (value.integerValue !== undefined) return Number(value.integerValue)
  if (value.doubleValue !== undefined) return value.doubleValue
  if (value.booleanValue !== undefined) return value.booleanValue
  if (value.nullValue !== undefined) return null
  if (value.mapValue) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, fromFirestoreValue(nested)]),
    )
  }
  if (value.arrayValue) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item))
  }
  return undefined
}

const toBoardObject = (doc: FirestoreDocument): BoardObject => {
  const fields = doc.fields ?? {}
  const mapped = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  ) as Record<string, unknown>

  return {
    id: String(mapped.id ?? doc.name.split('/').at(-1) ?? ''),
    type: String(mapped.type ?? 'unknown'),
    text: typeof mapped.text === 'string' ? mapped.text : undefined,
    title: typeof mapped.title === 'string' ? mapped.title : undefined,
    color: typeof mapped.color === 'string' ? mapped.color : undefined,
    style: typeof mapped.style === 'string' ? mapped.style : undefined,
    shapeType: typeof mapped.shapeType === 'string' ? mapped.shapeType : undefined,
    start: mapped.start as BoardObject['start'],
    end: mapped.end as BoardObject['end'],
    fromObjectId:
      typeof mapped.fromObjectId === 'string'
        ? mapped.fromObjectId
        : mapped.fromObjectId === null
          ? null
          : undefined,
    toObjectId:
      typeof mapped.toObjectId === 'string'
        ? mapped.toObjectId
        : mapped.toObjectId === null
          ? null
          : undefined,
    fromAnchor:
      typeof mapped.fromAnchor === 'string' ? mapped.fromAnchor : mapped.fromAnchor === null ? null : undefined,
    toAnchor:
      typeof mapped.toAnchor === 'string' ? mapped.toAnchor : mapped.toAnchor === null ? null : undefined,
    rotation: typeof mapped.rotation === 'number' ? mapped.rotation : undefined,
    fontSize: typeof mapped.fontSize === 'number' ? mapped.fontSize : undefined,
    frameId: typeof mapped.frameId === 'string' ? mapped.frameId : mapped.frameId === null ? null : undefined,
    votesByUser:
      mapped.votesByUser && typeof mapped.votesByUser === 'object' && !Array.isArray(mapped.votesByUser)
        ? (mapped.votesByUser as Record<string, boolean>)
        : undefined,
    position: mapped.position as BoardObject['position'],
    size: mapped.size as BoardObject['size'],
    createdAt: typeof mapped.createdAt === 'number' ? mapped.createdAt : undefined,
    updatedAt: typeof mapped.updatedAt === 'number' ? mapped.updatedAt : undefined,
    version: typeof mapped.version === 'number' ? mapped.version : undefined,
    deleted: Boolean(mapped.deleted),
  }
}

const toBoardMeta = (doc: FirestoreDocument): BoardMeta => {
  const fields = doc.fields ?? {}
  const mapped = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  ) as Record<string, unknown>

  return {
    id: String(mapped.id ?? doc.name.split('/').at(-1) ?? ''),
    name: typeof mapped.name === 'string' ? mapped.name : undefined,
    description: typeof mapped.description === 'string' ? mapped.description : undefined,
    ownerId: typeof mapped.ownerId === 'string' ? mapped.ownerId : undefined,
    sharedWith: Array.isArray(mapped.sharedWith)
      ? mapped.sharedWith.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    sharedRoles:
      mapped.sharedRoles && typeof mapped.sharedRoles === 'object' && !Array.isArray(mapped.sharedRoles)
        ? Object.fromEntries(
            Object.entries(mapped.sharedRoles as Record<string, unknown>).map(([userId, role]) => [
              userId,
              role === 'view' ? 'view' : 'edit',
            ]),
          )
        : undefined,
    updatedAt: typeof mapped.updatedAt === 'number' ? mapped.updatedAt : undefined,
  }
}

const fetchFirestoreDocument = async (url: string, idToken: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FIRESTORE_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Firestore request timed out after ${FIRESTORE_FETCH_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchBoardObjects = async (boardId: string, idToken: string): Promise<BoardObject[]> => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const response = await fetchFirestoreDocument(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}/objects`,
    idToken,
  )

  if (!response.ok) {
    throw new Error(`Failed to read board objects (${response.status})`)
  }

  const body = (await response.json()) as { documents?: FirestoreDocument[] }
  return (body.documents ?? []).map(toBoardObject).filter((object) => !object.deleted)
}

export const fetchBoardMeta = async (boardId: string, idToken: string): Promise<BoardMeta | null> => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const response = await fetchFirestoreDocument(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}`,
    idToken,
  )

  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`Failed to read board metadata (${response.status})`)
  }

  const body = (await response.json()) as FirestoreDocument
  return toBoardMeta(body)
}

export const countByType = (objects: BoardObject[], type: string): number =>
  objects.filter((object) => object.type === type).length

export const newestObjectByType = (objects: BoardObject[], type: string): BoardObject | null =>
  objects
    .filter((object) => object.type === type)
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] || null
