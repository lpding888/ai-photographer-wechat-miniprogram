import { PrismaClient } from '@prisma/client'

import { configService } from './env.js'

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: configService.databaseUrl,
    },
  },
})
