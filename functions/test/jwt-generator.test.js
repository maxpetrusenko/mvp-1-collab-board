const assert = require('node:assert/strict')
const test = require('node:test')
const jwt = require('jsonwebtoken')

const previousApiKey = process.env.Z_AI_GLM_API_KEY

test.after(() => {
  if (typeof previousApiKey === 'string') {
    process.env.Z_AI_GLM_API_KEY = previousApiKey
  } else {
    delete process.env.Z_AI_GLM_API_KEY
  }
})

test('generateToken throws when Z_AI_GLM_API_KEY is missing', () => {
  delete process.env.Z_AI_GLM_API_KEY
  const { generateToken } = require('../src/jwt-generator')
  assert.throws(() => generateToken(), /Z_AI_GLM_API_KEY not configured/)
})

test('generateToken throws when Z_AI_GLM_API_KEY format is invalid', () => {
  process.env.Z_AI_GLM_API_KEY = 'invalid-format'
  const { generateToken } = require('../src/jwt-generator')
  assert.throws(() => generateToken(), /Invalid Z_AI_GLM_API_KEY format/)
})

test('generateToken returns a signed JWT when API key format is valid', () => {
  process.env.Z_AI_GLM_API_KEY = 'keyId.secretValue'
  const { generateToken } = require('../src/jwt-generator')
  const token = generateToken()
  assert.equal(typeof token, 'string')
  assert.equal(token.split('.').length, 3)

  const decoded = jwt.decode(token, { complete: true })
  assert.equal(decoded?.payload?.api_key, 'keyId')
  assert.equal(decoded?.header?.sign_type, 'SIGN')
})
