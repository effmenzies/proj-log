import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";

const cookieName = "projlog_session";
const lifetimeMs = 7 * 24 * 60 * 60 * 1000;
type Database = PrismaClient | Prisma.TransactionClient;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function readToken(req: Request): string | null {
  const match = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  const token = match?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function createSession(db: Database, userId: number, req: Request): Promise<string> {
  const previous = readToken(req);
  if (previous) await db.session.deleteMany({ where: { tokenHash: tokenHash(previous) } });
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + lifetimeMs) },
  });
  return token;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: lifetimeMs,
  });
}

export async function hasSession(db: Database, req: Request): Promise<boolean> {
  const token = readToken(req);
  if (!token) return false;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) }, select: { expiresAt: true },
  });
  return session !== null && session.expiresAt > new Date();
}

export async function revokeSession(db: Database, req: Request, res: Response): Promise<void> {
  const token = readToken(req);
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(cookieName, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/",
  });
}
