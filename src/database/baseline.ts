import { execFileSync } from "node:child_process";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL before baselining");
const schema = new URL(databaseUrl).searchParams.get("schema") ?? "public";
const client = new pg.Client({ connectionString: databaseUrl });

const expected = [
  ["id", "integer", null, "NO"],
  ["first_name", "character varying", 100, "NO"],
  ["surname", "character varying", 100, "NO"],
  ["email", "character varying", 320, "NO"],
  ["password_hash", "character varying", 512, "NO"],
  ["payment_method_id", "character varying", 255, "YES"],
  ["card_brand", "character varying", 50, "YES"],
  ["card_last4", "character varying", 4, "YES"],
];

try {
  await client.connect();
  const columns = await client.query(
    `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'users'
       ORDER BY ordinal_position`, [schema],
  );
  const actual = columns.rows.map((row) => [
    row.column_name, row.data_type, row.character_maximum_length, row.is_nullable,
  ]);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("users columns do not match the legacy baseline");
  if (!columns.rows[0].column_default?.startsWith("nextval(") ||
      columns.rows.slice(1).some((row) => row.column_default !== null)) {
    throw new Error("users column defaults do not match the legacy baseline");
  }
  const constraints = await client.query(
    `SELECT c.contype, array_agg(a.attname::text ORDER BY keys.ordinality) AS columns
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY keys(attnum, ordinality) ON true
       LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum
      WHERE n.nspname = $1 AND t.relname = 'users'
      GROUP BY c.oid`, [schema],
  );
  const keys = constraints.rows.map((r) => `${r.contype}:${r.columns.join(",")}`).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["p:id", "u:email"])) {
    throw new Error("users constraints do not match the legacy baseline");
  }
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_name IN ('alembic_version', '_prisma_migrations')`, [schema],
  );
  if (!tables.rows.some((row) => row.table_name === "alembic_version") ||
      tables.rows.some((row) => row.table_name === "_prisma_migrations")) {
    throw new Error("Expected Alembic history and no Prisma migration history");
  }
  await client.query("SELECT set_config('search_path', $1, false)", [schema]);
  const versions = await client.query("SELECT version_num FROM alembic_version");
  if (versions.rows.length !== 1 || versions.rows[0].version_num !== "0001") {
    throw new Error("Expected Alembic revision 0001");
  }
  console.log("Legacy schema verified; marking Prisma baseline as applied.");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", "0001_baseline"], {
    stdio: "inherit",
    env: process.env,
  });
} finally {
  await client.end();
}
