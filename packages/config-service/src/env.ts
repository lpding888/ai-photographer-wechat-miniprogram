import { getConfig as loadConfig } from '@ai-photographer/config'

export const env = loadConfig()

export const configService = {
  host: env.services.config.host,
  port: env.services.config.port,
  databaseUrl: env.services.config.databaseUrl,
}
