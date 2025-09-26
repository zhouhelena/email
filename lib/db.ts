import { PrismaClient } from '@prisma/client';
import { encryptString, isEncryptedString } from './crypto';

const prismaSingleton = () => {
  const client = new PrismaClient();

  client.$use(async (params, next) => {
    if (params.model === 'Account') {
      if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
        const data = (params.args?.data ?? {}) as any;
        if (typeof data.refresh_token === 'string' && data.refresh_token && !isEncryptedString(data.refresh_token)) {
          data.refresh_token = encryptString(data.refresh_token);
        }
        if (typeof data.access_token === 'string' && data.access_token && !isEncryptedString(data.access_token)) {
          data.access_token = encryptString(data.access_token);
        }
        params.args.data = data;
      }
    }
    return next(params);
  });

  return client;
};

declare const globalThis: {
  prismaGlobal?: PrismaClient;
} & typeof global;

export const prisma: PrismaClient = globalThis.prismaGlobal ?? prismaSingleton();

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
