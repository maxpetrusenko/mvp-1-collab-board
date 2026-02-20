/* eslint-disable no-console */
const jwt = require('jsonwebtoken')

const TOKEN_TTL = 180 // 3 minutes
let cachedToken = null

function readEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function getApiKey() {
  const apiKey = readEnv('Z_AI_GLM_API_KEY', 'z_ai_glm_api_key')
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
    api_key: id,
    exp: now + TOKEN_TTL,
    timestamp: now
  }

  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    header: {
      alg: 'HS256',
      sign_type: 'SIGN'
    }
  })
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

function resetTokenCache() {
  cachedToken = null
}

module.exports = { getCachedToken, generateToken, resetTokenCache }
