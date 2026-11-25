// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { isolatedSchema } from "./helpers.js";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
let db: Awaited<ReturnType<typeof isolatedSchema>> | undefined;
afterEach(async () => { if (db) await db.cleanup(); db = undefined; });

integration("database migrations", () => {
  it("creates the schema from scratch and enforces unique emails", async () => {
    db = await isolatedSchema();
    db.run("db:migrate");
    await db.query.query("INSERT INTO users (first_name, surname, email, password_hash) VALUES ('A', 'B', 'a@example.com', 'hash')");
    await expect(db.query.query("INSERT INTO users (first_name, surname, email, password_hash) VALUES ('C', 'D', 'a@example.com', 'hash')")).rejects.toThrow();
  });

  it("baselines an Alembic database without altering its users", async () => {
    db = await isolatedSchema();
    await db.query.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY, first_name VARCHAR(100) NOT NULL, surname VARCHAR(100) NOT NULL,
        email VARCHAR(320) NOT NULL UNIQUE, password_hash VARCHAR(512) NOT NULL,
        payment_method_id VARCHAR(255), card_brand VARCHAR(50), card_last4 VARCHAR(4)
      );
      CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
      INSERT INTO alembic_version VALUES ('0001');
      INSERT INTO users (first_name, surname, email, password_hash, payment_method_id)
      VALUES ('A', 'B', 'a@example.com', 'legacy-hash', 'pm_123');
    `);
    db.run("db:baseline");
    db.run("db:migrate");
    const { rows } = await db.query.query("SELECT email, password_hash, payment_method_id FROM users");
    expect(rows).toEqual([{ email: "a@example.com", password_hash: "legacy-hash", payment_method_id: "pm_123" }]);
    expect((await db.query.query("SELECT version_num FROM alembic_version")).rows[0].version_num).toBe("0001");
  });

  it("refuses to baseline a schema with drift", async () => {
    db = await isolatedSchema();
    await db.query.query("CREATE TABLE users (id integer PRIMARY KEY, unexpected text)");
    expect(() => db!.run("db:baseline")).toThrow();
    expect((await db.query.query("SELECT to_regclass('_prisma_migrations') AS name")).rows[0].name).toBeNull();
  });
});
