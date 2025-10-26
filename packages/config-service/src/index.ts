import { buildConfigService } from './app.js'
import { configService } from './env.js'

const bootstrap = async () => {
  const app = buildConfigService()

  try {
    await app.listen({ port: configService.port, host: configService.host })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void bootstrap()
