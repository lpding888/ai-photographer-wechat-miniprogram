import { getConfig as loadConfig } from '@ai-photographer/config'

export const appConfig = loadConfig()

const fallbackServer = appConfig.server ?? { host: '0.0.0.0', port: appConfig.port ?? 4310 }

export const serverConfig = {
  host: fallbackServer.host ?? '0.0.0.0',
  port: fallbackServer.port ?? appConfig.port ?? 4310,
}
