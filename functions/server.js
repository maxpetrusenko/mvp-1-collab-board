const express = require('express')

const { apiHandler } = require('./index')

const app = express()
const port = Number(process.env.PORT || 8080)

app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true })
})

app.all('/api/ai/command', apiHandler)
app.all('/api/boards/share', apiHandler)
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`collabboard-functions listening on ${port}`)
})
