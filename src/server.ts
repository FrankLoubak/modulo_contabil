/**
 * Entry point HTTP. Sobe o Fastify na porta configurada.
 * Uso em dev: `npm run dev`.
 */
import { buildApp } from './app.js'
import { env } from './env.js'

const app = buildApp()

app.listen({ port: env.PORT, host: env.HOST }).catch((err: unknown) => {
  app.log.error(err)
  process.exit(1)
})
