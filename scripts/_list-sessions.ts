import { PrismaClient } from "prisma/generated/app_client/client";
const p = new PrismaClient();
p.session.findMany({ select: { shop: true, id: true } })
  .then((s) => { console.log(JSON.stringify(s, null, 2)); return p.$disconnect(); });
