// @vitest-environment node
import { verify } from "argon2";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient } from "../../src/database/client.js";
import { createUser, getUserProfile, userCreateSchema, userProfileSchema, verifyCredentials } from "../../src/users/service.js";
import { isolatedSchema } from "../database/helpers.js";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const legacyHash = "$argon2id$v=19$m=65536,t=3,p=4$qVXlLt+a97X42IsdgfBofQ$PvGBK2eIseLPNeL1HFlef8RppwMpTMO79ydEhKVA0Bs";

describe("user validation", () => {
  it("rejects blank fields", () => {
    expect(() => userCreateSchema.parse({ firstName: " ", surname: "B", email: "bad", password: "" })).toThrow();
  });
  it("verifies a Python argon2-cffi hash", async () => {
    expect(await verify(legacyHash, "legacy-password")).toBe(true);
  });
  it("strips unexpected sensitive response properties", () => {
    expect(userProfileSchema.parse({ id: 1, firstName: "A", surname: "B", email: "a@example.com", passwordHash: "secret" }))
      .not.toHaveProperty("passwordHash");
  });
});

integration("user persistence", () => {
  let db: Awaited<ReturnType<typeof isolatedSchema>>;
  let client: ReturnType<typeof createDatabaseClient>;
  beforeAll(async () => {
    db = await isolatedSchema();
    db.run("db:migrate");
    client = createDatabaseClient(db.databaseUrl);
  });
  afterAll(async () => { await client?.$disconnect(); await db?.cleanup(); });

  it("hashes passwords and returns only explicitly selected profile fields", async () => {
    const profile = await createUser(client, {
      firstName: " Ada ", surname: "Lovelace", email: " ADA@Example.com ", password: "secret",
    });
    const stored = await client.user.update({
      where: { id: profile.id },
      data: { paymentMethodId: "pm_sensitive", cardBrand: "visa", cardLast4: "4242" },
    });
    expect(stored.passwordHash).not.toBe("secret");
    expect(await verify(stored.passwordHash, "secret")).toBe(true);
    const spy = vi.spyOn(client.user, "findUnique");
    expect(await getUserProfile(client, profile.id)).toEqual({
      id: profile.id, firstName: "Ada", surname: "Lovelace", email: "ada@example.com",
    });
    expect(spy).toHaveBeenCalledWith({
      where: { id: profile.id }, select: { id: true, firstName: true, surname: true, email: true },
    });
    spy.mockRestore();
    expect(await getUserProfile(client, -1)).toBeNull();
    expect(await verifyCredentials(client, { email: " ADA@EXAMPLE.COM ", password: "secret" })).toBe(profile.id);
    expect(await verifyCredentials(client, { email: "ada@example.com", password: "incorrect" })).toBeNull();
    expect(await verifyCredentials(client, { email: "missing@example.com", password: "incorrect" })).toBeNull();
    await expect(createUser(client, { firstName: "B", surname: "C", email: "ADA@example.com", password: "secret" })).rejects.toThrow();
  });
});
