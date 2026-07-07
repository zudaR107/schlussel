import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { initKeys, getJwks } from './utils/keys.js'
import { corsMiddleware } from './middleware/cors.js'
import { authRouter } from './routes/auth.js'
import { db } from './db/index.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

await initKeys()
migrate(db, { migrationsFolder: './src/db/migrations' })

const app = new Hono()

app.use('*', logger())
app.use('*', corsMiddleware)

app.get('/.well-known/jwks.json', (c) => c.json(getJwks()))
app.get('/health', (c) => c.json({ status: 'ok', service: 'Schlüssel' }))

app.route('/auth', authRouter)

const PORT = Number(process.env['PORT'] ?? 4000)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[Schlüssel] Running on http://localhost:${PORT}`)
})
