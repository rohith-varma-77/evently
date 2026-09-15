import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "organizer", "staff", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  organizerId: int("organizerId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
  category: varchar("category", { length: 64 }).notNull(),
  description: text("description").notNull(),
  imageUrl: text("imageUrl"),
  venue: varchar("venue", { length: 180 }).notNull(),
  location: varchar("location", { length: 180 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  paymentUpi: varchar("paymentUpi", { length: 180 }),
  paymentWhatsapp: varchar("paymentWhatsapp", { length: 32 }),
  ticketTheme: varchar("ticketTheme", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ticketTypes = mysqlTable("ticketTypes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  priceMinor: int("priceMinor").notNull().default(0),
  quantity: int("quantity").notNull(),
  available: int("available").notNull(),
  stripePriceId: varchar("stripePriceId", { length: 120 }),
});

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  bookingCode: varchar("bookingCode", { length: 32 }).notNull().unique(),
  eventId: int("eventId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  attendeeId: int("attendeeId"),
  attendeeName: varchar("attendeeName", { length: 160 }).notNull(),
  attendeeEmail: varchar("attendeeEmail", { length: 320 }).notNull(),
  quantity: int("quantity").notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "cancelled"]).default("pending").notNull(),
  paymentReference: varchar("paymentReference", { length: 160 }),
  idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull().unique(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const eventStaff = mysqlTable("eventStaff", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  userId: int("userId").notNull(),
  assignedBy: int("assignedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ticketPasses = mysqlTable("ticketPasses", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("bookingId").notNull(),
  eventId: int("eventId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  passId: varchar("passId", { length: 80 }).notNull().unique(),
  status: mysqlEnum("status", ["ACTIVE", "CHECKED_IN", "CANCELLED"]).default("ACTIVE").notNull(),
  checkedInAt: timestamp("checkedInAt"),
  checkedInBy: int("checkedInBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
export type TicketType = typeof ticketTypes.$inferSelect;
export type InsertTicketType = typeof ticketTypes.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type EventStaff = typeof eventStaff.$inferSelect;
export type InsertEventStaff = typeof eventStaff.$inferInsert;
export type TicketPass = typeof ticketPasses.$inferSelect;
export type InsertTicketPass = typeof ticketPasses.$inferInsert;
