/* eslint-disable no-console */
const jwt = require('jsonwebtoken')
const functions = require('firebase-functions')

const TOKEN_TTL = 180 // 3 minutes
let cachedToken = null

function getApiKey() {
  // Firebase config takes precedence, fallback to env var for local testing
  const apiKey = functions.config()?.z_ai?.glm_api_key || process.env.Z_AI_GLM_API_KEY
  if (!apiKey) {
    throw new Error('Z_AI_GLM_API_KEY not configured')
  }
  return apiKey
}

function generateToken() {
  const apiKey = getApiKey()

  // Parse API key format: id.secret
  const parts = apiKey.split('.')
  if (parts.length !== 2) {
    throw new Error('Invalid Z_AI_GLM_API_KEY format. Expected: id.secret')
  }

  const [id, secret] = parts
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    api_key: apiKey,
    exp: now + TOKEN_TTL,
    timestamp: now
  }

  return jwt.sign(payload, secret, { algorithm: 'HS256' })
}

function getCachedToken() {
  const now = Math.floor(Date.now() / 1000)

  // Refresh if expired or will expire in 30 seconds
  if (!cachedToken || cachedToken.expiresAt - now < 30) {
    const token = generateToken()
    cachedToken = {
      token,
      expiresAt: now + TOKEN_TTL
    }
    console.log('Generated new GLM API token, expires at:', cachedToken.expiresAt)
  }

  return cachedToken.token
}

module.exports = { getCachedToken, generateToken }
