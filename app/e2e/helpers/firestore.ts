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
  shapeType?: string
  position?: { x?: number; y?: number }
  size?: { width?: number; height?: number }
  createdAt?: number
  updatedAt?: number
  version?: number
  deleted?: boolean
}

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
    shapeType: typeof mapped.shapeType === 'string' ? mapped.shapeType : undefined,
    position: mapped.position as BoardObject['position'],
    size: mapped.size as BoardObject['size'],
    createdAt: typeof mapped.createdAt === 'number' ? mapped.createdAt : undefined,
    updatedAt: typeof mapped.updatedAt === 'number' ? mapped.updatedAt : undefined,
    version: typeof mapped.version === 'number' ? mapped.version : undefined,
    deleted: Boolean(mapped.deleted),
  }
}

export const fetchBoardObjects = async (boardId: string, idToken: string): Promise<BoardObject[]> => {
  const { firebaseProjectId } = loadAuthTestConfig()
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/boards/${boardId}/objects`,
    {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to read board objects (${response.status})`)
  }

  const body = (await response.json()) as { documents?: FirestoreDocument[] }
  return (body.documents ?? []).map(toBoardObject).filter((object) => !object.deleted)
}

export const countByType = (objects: BoardObject[], type: string): number =>
  objects.filter((object) => object.type === type).length

export const newestObjectByType = (objects: BoardObject[], type: string): BoardObject | null =>
  objects
    .filter((object) => object.type === type)
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))[0] || null
