import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes } from "node:crypto";
import { bookings, eventStaff, events, InsertUser, ticketPasses, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export function createSecurePassId() {
  return `EVT_PASS_${randomBytes(24).toString("base64url")}`;
}

export async function issueTicketPasses(input: { bookingId: number; eventId: number; ticketTypeId: number; quantity: number }) {
  const records = Array.from({ length: input.quantity }, () => ({ ...input, passId: createSecurePassId() }));
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; ticket passes were not issued");
  if (records.length > 0) await db.insert(ticketPasses).values(records);
  return records;
}

export async function getTicketPassById(passId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ticketPasses).where(eq(ticketPasses.passId, passId)).limit(1);
  return result[0];
}

export async function getTicketPassesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ pass: ticketPasses, booking: bookings }).from(ticketPasses).innerJoin(bookings, eq(ticketPasses.bookingId, bookings.id)).where(eq(bookings.attendeeId, userId));
}

export async function canAccessEventForCheckIn(eventId: number, userId: number, role: string) {
  if (role === "admin") return true;
  const db = await getDb();
  if (!db) return false;
  if (role === "organizer") {
    const owned = await db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.organizerId, userId))).limit(1);
    return owned.length > 0;
  }
  if (role === "staff") {
    const assigned = await db.select({ id: eventStaff.id }).from(eventStaff).where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.userId, userId))).limit(1);
    return assigned.length > 0;
  }
  return false;
}

export async function markTicketPassCheckedIn(passId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; check-in was not recorded");
  await db.update(ticketPasses).set({ status: "CHECKED_IN", checkedInAt: new Date(), checkedInBy: userId }).where(and(eq(ticketPasses.passId, passId), eq(ticketPasses.status, "ACTIVE")));
  return getTicketPassById(passId);
}
