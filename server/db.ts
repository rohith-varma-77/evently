import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes } from "node:crypto";
import {
  bookings,
  eventStaff,
  events,
  InsertUser,
  ticketPasses,
  ticketTypes,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

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
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; user was not persisted");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function createSecurePassId() {
  return `EVT_PASS_${randomBytes(24).toString("base64url")}`;
}

function createBookingCode() {
  return `EVT-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export type CreateEventInput = {
  organizerId: number;
  title: string;
  slug: string;
  category: string;
  description: string;
  imageUrl?: string | null;
  venue: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  paymentUpi?: string | null;
  paymentWhatsapp?: string | null;
  ticketTheme?: string | null;
  tickets: Array<{ name: string; description?: string | null; priceMinor: number; quantity: number }>;
};

export async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  const eventRows = await db.select().from(events).where(eq(events.status, "published")).orderBy(asc(events.startsAt));
  if (!eventRows.length) return [];
  const ticketRows = await db.select().from(ticketTypes).where(inArray(ticketTypes.eventId, eventRows.map(event => event.id)));
  return eventRows.map(event => ({
    ...event,
    tickets: ticketRows.filter(ticket => ticket.eventId === event.id),
  }));
}

export async function getPublishedEventBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const event = (await db.select().from(events).where(and(eq(events.slug, slug), eq(events.status, "published"))).limit(1))[0];
  if (!event) return undefined;
  const tickets = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  return { ...event, tickets };
}

export async function getOrganizerEvents(organizerId: number) {
  const db = await getDb();
  if (!db) return [];
  const eventRows = await db.select().from(events).where(eq(events.organizerId, organizerId)).orderBy(asc(events.startsAt));
  if (!eventRows.length) return [];
  const ticketRows = await db.select().from(ticketTypes).where(inArray(ticketTypes.eventId, eventRows.map(event => event.id)));
  return eventRows.map(event => ({ ...event, tickets: ticketRows.filter(ticket => ticket.eventId === event.id) }));
}

export async function createEvent(input: CreateEventInput) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event was not created");
  return db.transaction(async tx => {
    const result = await tx.insert(events).values({
      organizerId: input.organizerId,
      title: input.title,
      slug: input.slug,
      category: input.category,
      description: input.description,
      imageUrl: input.imageUrl ?? null,
      venue: input.venue,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      paymentUpi: input.paymentUpi ?? null,
      paymentWhatsapp: input.paymentWhatsapp ?? null,
      ticketTheme: input.ticketTheme ?? null,
      status: "draft",
    });
    const eventId = Number((result as unknown as Array<{ insertId: number }>)[0]?.insertId);
    if (!eventId) throw new Error("Event insert did not return an identifier");
    await tx.insert(ticketTypes).values(input.tickets.map(ticket => ({
      eventId,
      name: ticket.name,
      description: ticket.description ?? null,
      priceMinor: ticket.priceMinor,
      quantity: ticket.quantity,
      available: ticket.quantity,
    })));
    const created = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    const createdTickets = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    return { ...created, tickets: createdTickets };
  });
}

export async function updateEvent(eventId: number, organizerId: number, input: Omit<CreateEventInput, "organizerId">) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event was not updated");
  return db.transaction(async tx => {
    const current = (await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.organizerId, organizerId))).limit(1))[0];
    if (!current) return undefined;
    await tx.update(events).set({
      title: input.title,
      slug: input.slug,
      category: input.category,
      description: input.description,
      imageUrl: input.imageUrl ?? null,
      venue: input.venue,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      paymentUpi: input.paymentUpi ?? null,
      paymentWhatsapp: input.paymentWhatsapp ?? null,
      ticketTheme: input.ticketTheme ?? null,
    }).where(eq(events.id, eventId));
    const existingTickets = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    const existingBookings = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.eventId, eventId)).limit(1);
    if (existingBookings.length) {
      if (existingTickets.length !== input.tickets.length) {
        throw new Error("Ticket types cannot be added or removed after registrations exist");
      }
      for (let index = 0; index < input.tickets.length; index += 1) {
        const ticket = input.tickets[index];
        const currentTicket = existingTickets[index];
        const sold = Number(currentTicket.quantity) - Number(currentTicket.available);
        if (ticket.quantity < sold) {
          throw new Error(`Ticket quantity cannot be lower than tickets already reserved (${sold})`);
        }
        await tx.update(ticketTypes).set({
          name: ticket.name,
          description: ticket.description ?? null,
          priceMinor: ticket.priceMinor,
          quantity: ticket.quantity,
          available: ticket.quantity - sold,
        }).where(eq(ticketTypes.id, currentTicket.id));
      }
    } else {
      await tx.delete(ticketTypes).where(eq(ticketTypes.eventId, eventId));
      await tx.insert(ticketTypes).values(input.tickets.map(ticket => ({
        eventId,
        name: ticket.name,
        description: ticket.description ?? null,
        priceMinor: ticket.priceMinor,
        quantity: ticket.quantity,
        available: ticket.quantity,
      })));
    }
    const updated = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    const updatedTickets = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    return { ...updated, tickets: updatedTickets };
  });
}

export async function setEventStatus(eventId: number, organizerId: number, status: "draft" | "published" | "archived") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event status was not updated");
  const result = await db.update(events).set({ status }).where(and(eq(events.id, eventId), eq(events.organizerId, organizerId)));
  return Number((result as unknown as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function createBooking(input: {
  attendeeId: number;
  eventId: number;
  ticketTypeId: number;
  attendeeName: string;
  attendeeEmail: string;
  quantity: number;
  paymentReference?: string | null;
  idempotencyKey: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not created");
  return db.transaction(async tx => {
    const existing = (await tx.select().from(bookings).where(eq(bookings.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    if (existing) return existing;
    const event = (await tx.select().from(events).where(and(eq(events.id, input.eventId), eq(events.status, "published"))).limit(1))[0];
    const ticket = (await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, input.ticketTypeId), eq(ticketTypes.eventId, input.eventId))).limit(1))[0];
    if (!event || !ticket) throw new Error("Event or ticket type is unavailable");
    const requestedQuantity = Number(input.quantity);
    const currentAvailable = Number(ticket.available);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      throw new Error("Ticket quantity must be at least 1");
    }
    if (!Number.isInteger(currentAvailable) || currentAvailable < requestedQuantity) {
      throw new Error("Not enough tickets available");
    }
    const inventoryUpdate = await tx.update(ticketTypes)
      .set({ available: sql`${ticketTypes.available} - ${requestedQuantity}` })
      .where(and(eq(ticketTypes.id, input.ticketTypeId), gte(ticketTypes.available, requestedQuantity)));
    const updateMeta = inventoryUpdate as unknown as { affectedRows?: number | string; rowsAffected?: number | string };
    const affectedRows = Number(updateMeta.affectedRows ?? updateMeta.rowsAffected ?? 1);
    const updatedTicket = (await tx.select({ available: ticketTypes.available })
      .from(ticketTypes)
      .where(eq(ticketTypes.id, input.ticketTypeId))
      .limit(1))[0];
    const nextAvailable = Number(updatedTicket?.available);
    if (affectedRows < 1 || nextAvailable !== currentAvailable - requestedQuantity) {
      throw new Error("Not enough tickets available");
    }
    const result = await tx.insert(bookings).values({
      bookingCode: createBookingCode(),
      eventId: input.eventId,
      ticketTypeId: input.ticketTypeId,
      attendeeId: input.attendeeId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      quantity: requestedQuantity,
      status: "pending",
      paymentReference: input.paymentReference ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    const bookingId = Number((result as unknown as Array<{ insertId: number }>)[0]?.insertId);
    const booking = (await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
    if (!booking) throw new Error("Booking insert did not return an identifier");
    return booking;
  });
}

export async function getBookingsForUser(attendeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ booking: bookings, event: events, ticket: ticketTypes })
    .from(bookings)
    .innerJoin(events, eq(bookings.eventId, events.id))
    .innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id))
    .where(eq(bookings.attendeeId, attendeeId))
    .orderBy(asc(bookings.createdAt));
}

export async function getBookingForUser(bookingCode: string, attendeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ booking: bookings, event: events, ticket: ticketTypes })
    .from(bookings)
    .innerJoin(events, eq(bookings.eventId, events.id))
    .innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id))
    .where(and(eq(bookings.bookingCode, bookingCode), eq(bookings.attendeeId, attendeeId)))
    .limit(1))[0];
}

export async function getPendingBookingsForOrganizer(organizerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ booking: bookings, event: events, ticket: ticketTypes })
    .from(bookings)
    .innerJoin(events, eq(bookings.eventId, events.id))
    .innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id))
    .where(and(eq(events.organizerId, organizerId), eq(bookings.status, "pending")))
    .orderBy(asc(bookings.createdAt));
}

async function issueTicketPassesInTransaction(tx: Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0] extends never ? never : any, input: { bookingId: number; eventId: number; ticketTypeId: number; quantity: number }) {
  const existing = await tx.select().from(ticketPasses).where(eq(ticketPasses.bookingId, input.bookingId));
  if (existing.length) return existing;
  const records = Array.from({ length: input.quantity }, () => ({ ...input, passId: createSecurePassId() }));
  await tx.insert(ticketPasses).values(records);
  return records;
}

export async function approveBooking(bookingCode: string, organizerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not approved");
  return db.transaction(async tx => {
    const row = (await tx.select({ booking: bookings, event: events }).from(bookings).innerJoin(events, eq(bookings.eventId, events.id)).where(and(eq(bookings.bookingCode, bookingCode), eq(events.organizerId, organizerId))).limit(1))[0];
    if (!row) return undefined;
    if (row.booking.status === "cancelled") throw new Error("Cancelled bookings cannot be approved");
    if (row.booking.status === "confirmed") {
      return { booking: row.booking, passes: await tx.select().from(ticketPasses).where(eq(ticketPasses.bookingId, row.booking.id)) };
    }
    await tx.update(bookings).set({ status: "confirmed" }).where(and(eq(bookings.id, row.booking.id), eq(bookings.status, "pending")));
    const passes = await issueTicketPassesInTransaction(tx, {
      bookingId: row.booking.id,
      eventId: row.booking.eventId,
      ticketTypeId: row.booking.ticketTypeId,
      quantity: row.booking.quantity,
    });
    const booking = (await tx.select().from(bookings).where(eq(bookings.id, row.booking.id)).limit(1))[0];
    return { booking, passes };
  });
}

export async function cancelBooking(bookingCode: string, attendeeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not cancelled");
  return db.transaction(async tx => {
    const booking = (await tx.select().from(bookings).where(and(eq(bookings.bookingCode, bookingCode), eq(bookings.attendeeId, attendeeId))).limit(1))[0];
    if (!booking) return undefined;
    if (booking.status === "cancelled") return booking;
    const cancellation = await tx.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)));
    const cancellationMeta = cancellation as unknown as { affectedRows?: number | string; rowsAffected?: number | string };
    const cancellationRows = Number(cancellationMeta.affectedRows ?? cancellationMeta.rowsAffected ?? 1);
    if (cancellationRows < 1) {
      return (await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1))[0];
    }
    await tx.update(ticketTypes).set({ available: sql`${ticketTypes.available} + ${booking.quantity}` }).where(eq(ticketTypes.id, booking.ticketTypeId));
    await tx.update(ticketPasses).set({ status: "CANCELLED" }).where(eq(ticketPasses.bookingId, booking.id));
    return (await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1))[0];
  });
}

export async function issueTicketPasses(input: { bookingId: number; eventId: number; ticketTypeId: number; quantity: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; ticket passes were not issued");
  return db.transaction(tx => issueTicketPassesInTransaction(tx, input));
}

export async function getTicketPassById(passId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(ticketPasses).where(eq(ticketPasses.passId, passId)).limit(1))[0];
}

export async function getTicketPassesForOrganizer(organizerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ pass: ticketPasses, booking: bookings, event: events, ticket: ticketTypes })
    .from(ticketPasses)
    .innerJoin(bookings, eq(ticketPasses.bookingId, bookings.id))
    .innerJoin(events, eq(ticketPasses.eventId, events.id))
    .innerJoin(ticketTypes, eq(ticketPasses.ticketTypeId, ticketTypes.id))
    .where(eq(events.organizerId, organizerId))
    .orderBy(asc(events.startsAt), asc(ticketPasses.createdAt));
}

export async function getTicketPassesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ pass: ticketPasses, booking: bookings, event: events, ticket: ticketTypes })
    .from(ticketPasses)
    .innerJoin(bookings, eq(ticketPasses.bookingId, bookings.id))
    .innerJoin(events, eq(ticketPasses.eventId, events.id))
    .innerJoin(ticketTypes, eq(ticketPasses.ticketTypeId, ticketTypes.id))
    .where(eq(bookings.attendeeId, userId));
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
  const update = await db.update(ticketPasses).set({ status: "CHECKED_IN", checkedInAt: new Date(), checkedInBy: userId }).where(and(eq(ticketPasses.passId, passId), eq(ticketPasses.status, "ACTIVE")));
  const updateMeta = update as unknown as { affectedRows?: number | string; rowsAffected?: number | string };
  const changed = Number(updateMeta.affectedRows ?? updateMeta.rowsAffected ?? 1) === 1;
  return { pass: await getTicketPassById(passId), changed };
}
