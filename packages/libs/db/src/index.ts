import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | undefined

export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient()
  }

  return prisma
}

export type {
  Prisma,
  User,
  Work,
  WorkImage,
  Task,
  CreditRecord,
  Order,
  CallbackEvent
} from '@prisma/client'
