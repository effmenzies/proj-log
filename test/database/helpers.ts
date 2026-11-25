import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";

export async function isolatedSchema() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to run database tests");
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const scoped = new URL(url);
  scoped.searchParams.set("schema", schema);
  const databaseUrl = scoped.toString();
  const query = new pg.Client({ connectionString: url });
  await query.connect();
  await query.query(`SET search_path TO "${schema}"`);
  return {
    databaseUrl, query,
    run(script: string) {
      execFileSync("npm", ["run", script], {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: "pipe",
      });
    },
    async cleanup() {
      await query.end();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    },
  };
}
