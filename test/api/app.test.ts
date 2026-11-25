// @vitest-environment node
import request from "supertest";
import { verify } from "argon2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/app.js";
import { createDatabaseClient } from "../../src/database/client.js";
import { isolatedSchema } from "../database/helpers.js";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("account API", () => {
  let db: Awaited<ReturnType<typeof isolatedSchema>>;
  let client: ReturnType<typeof createDatabaseClient>;
  let app: ReturnType<typeof createApp>;
  beforeAll(async () => {
    db = await isolatedSchema();
    db.run("db:migrate");
    client = createDatabaseClient(db.databaseUrl);
    app = createApp(client);
  });
  afterAll(async () => { await client?.$disconnect(); await db?.cleanup(); });

  it("creates an account and validates login without exposing user data", async () => {
    const credentials = { email: " ADA@Example.com ", password: "secret" };
    const agent = request.agent(app);
    expect((await agent.get("/api/session")).body).toEqual({ authenticated: false });
    const created = await agent.post("/api/accounts").send({ firstName: "Ada", surname: "Lovelace", ...credentials });
    expect(created.status).toBe(201);
    expect(created.text).toBe("");
    const cookie = String(created.headers["set-cookie"]);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect((await agent.get("/api/session")).body).toEqual({ authenticated: true });
    const session = await client.session.findFirstOrThrow();
    expect(cookie).not.toContain(session.tokenHash);
    const stored = await client.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(stored.passwordHash).not.toBe("secret");
    expect(await verify(stored.passwordHash, "secret")).toBe(true);
    const login = await agent.post("/api/login").send(credentials);
    expect(login.status).toBe(204);
    expect(login.text).toBe("");
    expect(login.headers["set-cookie"]).toBeDefined();
    expect((await agent.get("/api/session")).body).toEqual({ authenticated: true });
    expect(await client.session.count()).toBe(1);
    const wrong = await request(app).post("/api/login").send({ email: credentials.email, password: "wrong" });
    const missing = await request(app).post("/api/login").send({ email: "missing@example.com", password: "wrong" });
    expect(wrong.status).toBe(401);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
    expect((await request(app).post("/api/accounts").send({ firstName: "B", surname: "C", ...credentials })).status).toBe(409);
    expect(await client.user.count()).toBe(1);
    expect((await request(app).post("/api/login").send({ email: "bad", password: "" })).status).toBe(400);
    expect((await request(app).post("/api/accounts").send({ firstName: "", surname: "B", ...credentials })).status).toBe(400);
    expect((await request(app).post("/api/login").send({ email: "a@example.com", password: "x".repeat(9000) })).status).toBe(413);
    await client.session.updateMany({ data: { expiresAt: new Date(0) } });
    expect((await agent.get("/api/session")).body).toEqual({ authenticated: false });
  });

  it("limits repeated attempts", async () => {
    const limitedApp = createApp(client);
    for (let i = 0; i < 20; i++) {
      expect((await request(limitedApp).post("/api/login").send({})).status).toBe(400);
    }
    expect((await request(limitedApp).post("/api/login").send({})).status).toBe(429);
  });

  it("revokes only the current session and refuses cross-origin logout", async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    const credentials = { email: "logout@example.com", password: "secret" };
    const created = await first.post("/api/accounts").send({ firstName: "A", surname: "B", ...credentials });
    const oldCookie = (created.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    await second.post("/api/login").send(credentials);
    expect((await first.post("/api/logout")).status).toBe(403);
    expect((await first.post("/api/logout").set("X-Requested-With", "XMLHttpRequest").set("Sec-Fetch-Site", "cross-site")).status).toBe(403);
    expect((await first.get("/api/session")).body).toEqual({ authenticated: true });
    const logout = await first.post("/api/logout").set("X-Requested-With", "XMLHttpRequest");
    expect(logout.status).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("projlog_session=;");
    expect((await first.get("/api/session")).body).toEqual({ authenticated: false });
    expect((await request(app).get("/api/session").set("Cookie", oldCookie)).body).toEqual({ authenticated: false });
    expect((await second.get("/api/session")).body).toEqual({ authenticated: true });
    expect((await first.post("/api/logout").set("X-Requested-With", "XMLHttpRequest")).status).toBe(204);
  });
});
