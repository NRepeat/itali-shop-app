// db_clients.ts (or db_clients.js)

import { PrismaClient   } from "prisma/generated/app_client/client";
import { PrismaClient as ExternalPrismaClient } from "prisma/generated/external_client/client";



// 2. Declare the types for your two global instances
declare global {
  // eslint-disable-next-line no-var
  var appPrismaGlobal: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var externalPrismaGlobal: ExternalPrismaClient | undefined;
}

// Instantiate the App Client (Primary DB)
if (process.env.NODE_ENV !== "production") {
  if (!global.appPrismaGlobal) {
    global.appPrismaGlobal = new PrismaClient();
  }
}

const prisma = global.appPrismaGlobal ?? new PrismaClient();


// Instantiate the External Client (Secondary DB)
if (process.env.NODE_ENV !== "production") {
  if (!global.externalPrismaGlobal) {
    global.externalPrismaGlobal = new ExternalPrismaClient();
  }
}

const externalDB = global.externalPrismaGlobal ?? new ExternalPrismaClient();
export { prisma, externalDB }
