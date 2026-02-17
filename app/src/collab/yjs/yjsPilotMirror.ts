import type { BoardObject } from '../../types/board'

import {
  applyBoardDocUpdate,
  createYjsBoardDoc,
  deleteBoardObjectFromDoc,
  encodeBoardDocState,
  readBoardObjectsFromDoc,
  replaceBoardObjectsInDoc,
  upsertBoardObjectInDoc,
} from './boardDoc'

export class YjsPilotMirror {
  private readonly doc = createYjsBoardDoc()

  replaceSnapshot(objects: BoardObject[]) {
    replaceBoardObjectsInDoc(this.doc, objects)
  }

  upsertObject(object: BoardObject) {
    upsertBoardObjectInDoc(this.doc, object)
  }

  removeObject(objectId: string) {
    deleteBoardObjectFromDoc(this.doc, objectId)
  }

  readSnapshot(): BoardObject[] {
    return readBoardObjectsFromDoc(this.doc)
  }

  encodeSnapshot(): Uint8Array {
    return encodeBoardDocState(this.doc)
  }

  applyUpdate(update: Uint8Array) {
    applyBoardDocUpdate(this.doc, update)
  }

  getEncodedByteLength(): number {
    return this.encodeSnapshot().byteLength
  }
}
