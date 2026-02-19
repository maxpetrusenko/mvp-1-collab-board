#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin')

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const shouldApply = process.argv.includes('--apply')

const normalizeSharedWith = (value) => {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

const normalizeSharedRoles = (value, sharedWith) => {
  const normalized = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([userId, role]) => {
      if (!sharedWith.includes(userId)) {
        return
      }
      normalized[userId] = role === 'view' ? 'view' : 'edit'
    })
  }
  sharedWith.forEach((userId) => {
    if (!normalized[userId]) {
      normalized[userId] = 'edit'
    }
  })
  return normalized
}

const run = async () => {
  const snapshot = await db.collection('boards').get()
  const pendingUpdates = []

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {}
    const createdBy = typeof data.createdBy === 'string' ? data.createdBy.trim() : ''
    const ownerId = typeof data.ownerId === 'string' ? data.ownerId.trim() : ''
    const sharedWith = normalizeSharedWith(data.sharedWith)
    const sharedRoles = normalizeSharedRoles(data.sharedRoles, sharedWith)

    const update = {}
    if (!ownerId && createdBy) {
      update.ownerId = createdBy
    }
    if (!Array.isArray(data.sharedWith)) {
      update.sharedWith = sharedWith
    }
    if (!data.sharedRoles || typeof data.sharedRoles !== 'object' || Array.isArray(data.sharedRoles)) {
      update.sharedRoles = sharedRoles
    }

    if (Object.keys(update).length > 0) {
      pendingUpdates.push({
        id: docSnap.id,
        update,
      })
    }
  })

  if (!shouldApply) {
    console.log(`Dry run: ${pendingUpdates.length} board(s) require ownership backfill.`)
    pendingUpdates.slice(0, 20).forEach(({ id, update }) => {
      console.log(`- ${id}: ${JSON.stringify(update)}`)
    })
    if (pendingUpdates.length > 20) {
      console.log(`...and ${pendingUpdates.length - 20} more`)
    }
    console.log('Re-run with --apply to execute updates.')
    return
  }

  if (pendingUpdates.length === 0) {
    console.log('No board ownership updates required.')
    return
  }

  const batchSize = 400
  for (let start = 0; start < pendingUpdates.length; start += batchSize) {
    const chunk = pendingUpdates.slice(start, start + batchSize)
    const batch = db.batch()
    chunk.forEach(({ id, update }) => {
      batch.set(db.collection('boards').doc(id), update, { merge: true })
    })
    await batch.commit()
  }

  console.log(`Applied ownership backfill to ${pendingUpdates.length} board(s).`)
}

run().catch((error) => {
  console.error('Ownership migration failed:', error)
  process.exitCode = 1
})
