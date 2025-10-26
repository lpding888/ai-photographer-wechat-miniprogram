import { serverConfig } from './config.js'
import { buildApp } from './utils/app.js'

const bootstrap = async () => {
  const app = buildApp()

  try {
    await app.listen({ port: serverConfig.port, host: serverConfig.host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void bootstrap()
