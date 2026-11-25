import { Prisma, PrismaClient } from "@prisma/client";
import { argon2id, hash, verify } from "argon2";
import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());
const passwordSchema = z.string().min(1).max(1024);

export const userCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  surname: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });

export const userProfileSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  surname: z.string(),
  email: z.email(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
type Database = PrismaClient | Prisma.TransactionClient;

const profileSelect = {
  id: true, firstName: true, surname: true, email: true,
} satisfies Prisma.UserSelect;

export async function createUser(db: Database, input: unknown): Promise<UserProfile> {
  const data = userCreateSchema.parse(input);
  const passwordHash = await hash(data.password, { type: argon2id });
  const user = await db.user.create({
    data: { firstName: data.firstName, surname: data.surname, email: data.email, passwordHash },
    select: profileSelect,
  });
  return userProfileSchema.parse(user);
}

export async function getUserProfile(db: Database, id: number): Promise<UserProfile | null> {
  const user = await db.user.findUnique({ where: { id }, select: profileSelect });
  return user === null ? null : userProfileSchema.parse(user);
}

// Also perform Argon2 verification when no account exists to reduce timing differences.
const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$qVXlLt+a97X42IsdgfBofQ$PvGBK2eIseLPNeL1HFlef8RppwMpTMO79ydEhKVA0Bs";

export async function verifyCredentials(db: Database, input: unknown): Promise<number | null> {
  const data = loginSchema.parse(input);
  const user = await db.user.findUnique({
    where: { email: data.email }, select: { id: true, passwordHash: true },
  });
  const matches = await verify(user?.passwordHash ?? dummyHash, data.password);
  return user !== null && matches ? user.id : null;
}
