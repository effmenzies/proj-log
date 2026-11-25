import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) throw new Error("Set DATABASE_URL to a PostgreSQL connection URL");
  const schema = new URL(databaseUrl).searchParams.get("schema") ?? undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
}
