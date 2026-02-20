/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

import { missingFirebaseEnvKeys } from '../config/env'
import { auth, db, googleProvider } from '../firebase/client'

type AuthContextValue = {
  user: User | null
  loading: boolean
  configured: boolean
  configError: string | null
  signInWithGoogle: () => Promise<void>
  signInWithEmailPassword: (email: string, password: string) => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const DEV_BYPASS_EMAIL_STORAGE_KEY = 'collabboard.devBypassEmail'
const DEV_BYPASS_USERNAME = 'admin'
const DEV_BYPASS_PASSWORD = 'admin'
const DEV_BYPASS_ACCOUNT_PASSWORD = 'AdminBypass!2026'

const firebaseConfigError =
  missingFirebaseEnvKeys.length > 0
    ? `Missing Firebase env keys: ${missingFirebaseEnvKeys.join(', ')}`
    : null

const getDevBypassEmail = () => {
  const existing = window.localStorage.getItem(DEV_BYPASS_EMAIL_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const generated = `dev-bypass-${crypto.randomUUID().slice(0, 10)}@local.dev`
  window.localStorage.setItem(DEV_BYPASS_EMAIL_STORAGE_KEY, generated)
  return generated
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(auth))

  useEffect(() => {
    if (!auth) {
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!db || !user) {
      return
    }

    void setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        email: user.email || '',
        emailLower: (user.email || '').toLowerCase(),
        displayName: user.displayName || '',
        displayNameLower: (user.displayName || '').trim().toLowerCase(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }, [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured: Boolean(auth),
      configError: firebaseConfigError,
      signInWithGoogle: async () => {
        if (!auth) {
          throw new Error(firebaseConfigError || 'Firebase auth is not configured')
        }
        await signInWithPopup(auth, googleProvider)
      },
      signInWithEmailPassword: async (email: string, password: string) => {
        if (
          import.meta.env.DEV &&
          email.trim().toLowerCase() === DEV_BYPASS_USERNAME &&
          password === DEV_BYPASS_PASSWORD
        ) {
          if (!auth) {
            throw new Error(firebaseConfigError || 'Firebase auth is not configured')
          }

          const bypassEmail = getDevBypassEmail()
          try {
            await signInWithEmailAndPassword(auth, bypassEmail, DEV_BYPASS_ACCOUNT_PASSWORD)
          } catch (error) {
            const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
            if (!code.includes('auth/user-not-found') && !code.includes('auth/invalid-credential')) {
              throw error
            }

            try {
              await createUserWithEmailAndPassword(auth, bypassEmail, DEV_BYPASS_ACCOUNT_PASSWORD)
            } catch (createError) {
              const createCode =
                typeof createError === 'object' && createError && 'code' in createError
                  ? String(createError.code)
                  : ''
              if (!createCode.includes('auth/email-already-in-use')) {
                throw createError
              }

              await signInWithEmailAndPassword(auth, bypassEmail, DEV_BYPASS_ACCOUNT_PASSWORD)
            }
          }
          return
        }

        if (!auth) {
          throw new Error(firebaseConfigError || 'Firebase auth is not configured')
        }
        if (!email.trim() || !password) {
          throw new Error('Email and password are required')
        }
        await signInWithEmailAndPassword(auth, email.trim(), password)
      },
      signOutUser: async () => {
        if (!auth) {
          return
        }
        await signOut(auth)
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return ctx
}
