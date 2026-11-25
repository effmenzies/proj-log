import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { createUser, verifyCredentials } from "../users/service.js";
import { createSession, hasSession, revokeSession, setSessionCookie } from "./sessions.js";

export function createApp(db: PrismaClient) {
  const app = express();
  app.disable("x-powered-by");
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again later." },
  });
  app.use(express.json({ limit: "8kb" }));

  app.post("/api/accounts", authLimit, async (req, res) => {
    const token = await db.$transaction(async (tx) => {
      const user = await createUser(tx, req.body);
      return createSession(tx, user.id, req);
    });
    setSessionCookie(res, token);
    res.status(201).end();
  });

  app.post("/api/login", authLimit, async (req, res) => {
    const userId = await verifyCredentials(db, req.body);
    if (userId === null) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const token = await db.$transaction((tx) => createSession(tx, userId, req));
    setSessionCookie(res, token);
    res.status(204).end();
  });

  app.get("/api/session", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ authenticated: await hasSession(db, req) });
  });

  app.post("/api/logout", async (req, res) => {
    // Browsers cannot send this non-simple header cross-origin without CORS approval.
    if (req.get("X-Requested-With") !== "XMLHttpRequest" ||
        req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Request not allowed." });
      return;
    }
    await revokeSession(db, req, res);
    res.status(204).end();
  });

  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError ||
        (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed")) {
      res.status(400).json({ error: "Please check the information provided." });
    } else if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
      res.status(413).json({ error: "Request is too large." });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "An account with that email already exists." });
    } else {
      res.status(500).json({ error: "Something went wrong. Please try again later." });
    }
  };
  app.use(errors);
  return app;
}
