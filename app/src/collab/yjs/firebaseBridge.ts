import type { BoardObject } from '../../types/board'

import { applyBoardDocUpdate, createYjsBoardDoc, encodeBoardDocState, readBoardObjectsFromDoc, replaceBoardObjectsInDoc } from './boardDoc'

export type BoardObjectDiff = {
  upserts: BoardObject[]
  deletes: string[]
}

export const diffBoardObjects = (previous: BoardObject[], next: BoardObject[]): BoardObjectDiff => {
  const previousById = new Map(previous.map((object) => [object.id, object]))
  const nextById = new Map(next.map((object) => [object.id, object]))

  const upserts: BoardObject[] = []
  const deletes: string[] = []

  next.forEach((object) => {
    const before = previousById.get(object.id)
    if (!before || JSON.stringify(before) !== JSON.stringify(object)) {
      upserts.push(object)
    }
  })

  previous.forEach((object) => {
    if (!nextById.has(object.id)) {
      deletes.push(object.id)
    }
  })

  return {
    upserts,
    deletes,
  }
}

export const encodeBoardObjectsToYjsUpdate = (objects: BoardObject[]): Uint8Array => {
  const doc = createYjsBoardDoc(objects)
  return encodeBoardDocState(doc)
}

export const decodeBoardObjectsFromYjsUpdate = (update: Uint8Array): BoardObject[] => {
  const doc = createYjsBoardDoc()
  applyBoardDocUpdate(doc, update)
  return readBoardObjectsFromDoc(doc)
}

export const mirrorFirestoreSnapshotIntoYjs = (existingUpdate: Uint8Array | null, objects: BoardObject[]) => {
  const doc = createYjsBoardDoc()
  if (existingUpdate && existingUpdate.byteLength > 0) {
    applyBoardDocUpdate(doc, existingUpdate)
  }
  replaceBoardObjectsInDoc(doc, objects)
  return encodeBoardDocState(doc)
}
