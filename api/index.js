// vercel_api.ts
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { randomBytes } from "node:crypto";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var events = mysqlTable("events", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var ticketTypes = mysqlTable("ticketTypes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  priceMinor: int("priceMinor").notNull().default(0),
  quantity: int("quantity").notNull(),
  available: int("available").notNull(),
  stripePriceId: varchar("stripePriceId", { length: 120 })
});
var bookings = mysqlTable("bookings", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var eventStaff = mysqlTable("eventStaff", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  userId: int("userId").notNull(),
  assignedBy: int("assignedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var ticketPasses = mysqlTable("ticketPasses", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("bookingId").notNull(),
  eventId: int("eventId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  passId: varchar("passId", { length: 80 }).notNull().unique(),
  status: mysqlEnum("status", ["ACTIVE", "CHECKED_IN", "CANCELLED"]).default("ACTIVE").notNull(),
  checkedInAt: timestamp("checkedInAt"),
  checkedInBy: int("checkedInBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};
function validateProductionEnv(config = ENV) {
  if (!config.isProduction) return;
  const required = [
    ["JWT_SECRET", config.cookieSecret],
    ["DATABASE_URL", config.databaseUrl],
    ["VITE_APP_ID", config.appId],
    ["OAUTH_SERVER_URL", config.oAuthServerUrl]
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
  if (config.cookieSecret.length < 32) {
    console.warn("[Config] JWT_SECRET is shorter than the recommended 32 characters; use a stronger secret for self-managed production deployments");
  }
}

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; user was not persisted");
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
function createSecurePassId() {
  return `EVT_PASS_${randomBytes(24).toString("base64url")}`;
}
function createBookingCode() {
  return `EVT-${randomBytes(6).toString("hex").toUpperCase()}`;
}
async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  const eventRows = await db.select().from(events).where(eq(events.status, "published")).orderBy(asc(events.startsAt));
  if (!eventRows.length) return [];
  const ticketRows = await db.select().from(ticketTypes).where(inArray(ticketTypes.eventId, eventRows.map((event) => event.id)));
  return eventRows.map((event) => ({
    ...event,
    tickets: ticketRows.filter((ticket) => ticket.eventId === event.id)
  }));
}
async function getPublishedEventBySlug(slug) {
  const db = await getDb();
  if (!db) return void 0;
  const event = (await db.select().from(events).where(and(eq(events.slug, slug), eq(events.status, "published"))).limit(1))[0];
  if (!event) return void 0;
  const tickets = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  return { ...event, tickets };
}
async function getOrganizerEvents(organizerId) {
  const db = await getDb();
  if (!db) return [];
  const eventRows = await db.select().from(events).where(eq(events.organizerId, organizerId)).orderBy(asc(events.startsAt));
  if (!eventRows.length) return [];
  const ticketRows = await db.select().from(ticketTypes).where(inArray(ticketTypes.eventId, eventRows.map((event) => event.id)));
  return eventRows.map((event) => ({ ...event, tickets: ticketRows.filter((ticket) => ticket.eventId === event.id) }));
}
async function createEvent(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event was not created");
  return db.transaction(async (tx) => {
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
      status: "draft"
    });
    const eventId = Number(result[0]?.insertId);
    if (!eventId) throw new Error("Event insert did not return an identifier");
    await tx.insert(ticketTypes).values(input.tickets.map((ticket) => ({
      eventId,
      name: ticket.name,
      description: ticket.description ?? null,
      priceMinor: ticket.priceMinor,
      quantity: ticket.quantity,
      available: ticket.quantity
    })));
    const created = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    const createdTickets = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    return { ...created, tickets: createdTickets };
  });
}
async function updateEvent(eventId, organizerId, input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event was not updated");
  return db.transaction(async (tx) => {
    const current = (await tx.select().from(events).where(and(eq(events.id, eventId), eq(events.organizerId, organizerId))).limit(1))[0];
    if (!current) return void 0;
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
      ticketTheme: input.ticketTheme ?? null
    }).where(eq(events.id, eventId));
    await tx.delete(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    await tx.insert(ticketTypes).values(input.tickets.map((ticket) => ({
      eventId,
      name: ticket.name,
      description: ticket.description ?? null,
      priceMinor: ticket.priceMinor,
      quantity: ticket.quantity,
      available: ticket.quantity
    })));
    const updated = (await tx.select().from(events).where(eq(events.id, eventId)).limit(1))[0];
    const updatedTickets = await tx.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
    return { ...updated, tickets: updatedTickets };
  });
}
async function setEventStatus(eventId, organizerId, status) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; event status was not updated");
  const result = await db.update(events).set({ status }).where(and(eq(events.id, eventId), eq(events.organizerId, organizerId)));
  return Number(result.affectedRows ?? 0) > 0;
}
async function createBooking(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not created");
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(bookings).where(eq(bookings.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    if (existing) return existing;
    const event = (await tx.select().from(events).where(and(eq(events.id, input.eventId), eq(events.status, "published"))).limit(1))[0];
    const ticket = (await tx.select().from(ticketTypes).where(and(eq(ticketTypes.id, input.ticketTypeId), eq(ticketTypes.eventId, input.eventId))).limit(1))[0];
    if (!event || !ticket) throw new Error("Event or ticket type is unavailable");
    const inventoryUpdate = await tx.update(ticketTypes).set({ available: sql`${ticketTypes.available} - ${input.quantity}` }).where(and(eq(ticketTypes.id, input.ticketTypeId), gte(ticketTypes.available, input.quantity)));
    const affectedRows = Number(inventoryUpdate.affectedRows ?? 0);
    if (affectedRows !== 1) throw new Error("Not enough tickets available");
    const result = await tx.insert(bookings).values({
      bookingCode: createBookingCode(),
      eventId: input.eventId,
      ticketTypeId: input.ticketTypeId,
      attendeeId: input.attendeeId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      quantity: input.quantity,
      status: "pending",
      paymentReference: input.paymentReference ?? null,
      idempotencyKey: input.idempotencyKey
    });
    const bookingId = Number(result[0]?.insertId);
    const booking = (await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
    if (!booking) throw new Error("Booking insert did not return an identifier");
    return booking;
  });
}
async function getBookingsForUser(attendeeId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ booking: bookings, event: events, ticket: ticketTypes }).from(bookings).innerJoin(events, eq(bookings.eventId, events.id)).innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id)).where(eq(bookings.attendeeId, attendeeId)).orderBy(asc(bookings.createdAt));
}
async function getBookingForUser(bookingCode, attendeeId) {
  const db = await getDb();
  if (!db) return void 0;
  return (await db.select({ booking: bookings, event: events, ticket: ticketTypes }).from(bookings).innerJoin(events, eq(bookings.eventId, events.id)).innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id)).where(and(eq(bookings.bookingCode, bookingCode), eq(bookings.attendeeId, attendeeId))).limit(1))[0];
}
async function getPendingBookingsForOrganizer(organizerId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ booking: bookings, event: events, ticket: ticketTypes }).from(bookings).innerJoin(events, eq(bookings.eventId, events.id)).innerJoin(ticketTypes, eq(bookings.ticketTypeId, ticketTypes.id)).where(and(eq(events.organizerId, organizerId), eq(bookings.status, "pending"))).orderBy(asc(bookings.createdAt));
}
async function issueTicketPassesInTransaction(tx, input) {
  const existing = await tx.select().from(ticketPasses).where(eq(ticketPasses.bookingId, input.bookingId));
  if (existing.length) return existing;
  const records = Array.from({ length: input.quantity }, () => ({ ...input, passId: createSecurePassId() }));
  await tx.insert(ticketPasses).values(records);
  return records;
}
async function approveBooking(bookingCode, organizerId) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not approved");
  return db.transaction(async (tx) => {
    const row = (await tx.select({ booking: bookings, event: events }).from(bookings).innerJoin(events, eq(bookings.eventId, events.id)).where(and(eq(bookings.bookingCode, bookingCode), eq(events.organizerId, organizerId))).limit(1))[0];
    if (!row) return void 0;
    if (row.booking.status === "cancelled") throw new Error("Cancelled bookings cannot be approved");
    if (row.booking.status === "confirmed") {
      return { booking: row.booking, passes: await tx.select().from(ticketPasses).where(eq(ticketPasses.bookingId, row.booking.id)) };
    }
    await tx.update(bookings).set({ status: "confirmed" }).where(and(eq(bookings.id, row.booking.id), eq(bookings.status, "pending")));
    const passes = await issueTicketPassesInTransaction(tx, {
      bookingId: row.booking.id,
      eventId: row.booking.eventId,
      ticketTypeId: row.booking.ticketTypeId,
      quantity: row.booking.quantity
    });
    const booking = (await tx.select().from(bookings).where(eq(bookings.id, row.booking.id)).limit(1))[0];
    return { booking, passes };
  });
}
async function cancelBooking(bookingCode, attendeeId) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; booking was not cancelled");
  return db.transaction(async (tx) => {
    const booking = (await tx.select().from(bookings).where(and(eq(bookings.bookingCode, bookingCode), eq(bookings.attendeeId, attendeeId))).limit(1))[0];
    if (!booking) return void 0;
    if (booking.status === "cancelled") return booking;
    await tx.update(bookings).set({ status: "cancelled" }).where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)));
    await tx.update(ticketTypes).set({ available: sql`${ticketTypes.available} + ${booking.quantity}` }).where(eq(ticketTypes.id, booking.ticketTypeId));
    await tx.update(ticketPasses).set({ status: "CANCELLED" }).where(eq(ticketPasses.bookingId, booking.id));
    return (await tx.select().from(bookings).where(eq(bookings.id, booking.id)).limit(1))[0];
  });
}
async function issueTicketPasses(input) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; ticket passes were not issued");
  return db.transaction((tx) => issueTicketPassesInTransaction(tx, input));
}
async function getTicketPassById(passId) {
  const db = await getDb();
  if (!db) return void 0;
  return (await db.select().from(ticketPasses).where(eq(ticketPasses.passId, passId)).limit(1))[0];
}
async function getTicketPassesForUser(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ pass: ticketPasses, booking: bookings, event: events, ticket: ticketTypes }).from(ticketPasses).innerJoin(bookings, eq(ticketPasses.bookingId, bookings.id)).innerJoin(events, eq(ticketPasses.eventId, events.id)).innerJoin(ticketTypes, eq(ticketPasses.ticketTypeId, ticketTypes.id)).where(eq(bookings.attendeeId, userId));
}
async function canAccessEventForCheckIn(eventId, userId, role) {
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
async function markTicketPassCheckedIn(passId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable; check-in was not recorded");
  await db.update(ticketPasses).set({ status: "CHECKED_IN", checkedInAt: /* @__PURE__ */ new Date(), checkedInBy: userId }).where(and(eq(ticketPasses.passId, passId), eq(ticketPasses.status, "ACTIVE")));
  return getTicketPassById(passId);
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name) || appId !== ENV.appId) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/stripe.ts
import Stripe from "stripe";
import express from "express";
var stripeSecretKey = process.env.STRIPE_SECRET_KEY;
var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
function getStripe() {
  return stripeSecretKey ? new Stripe(stripeSecretKey) : null;
}
function registerStripeWebhook(app2) {
  app2.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
    const stripe = getStripe();
    if (!stripe || !webhookSecret) {
      console.error("[Stripe webhook] Stripe secrets are not configured");
      return res.status(503).json({ error: "Stripe webhook is not configured" });
    }
    try {
      const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], webhookSecret);
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe webhook] Test event verified", event.id);
        return res.json({ verified: true });
      }
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        console.log("[Stripe webhook] Checkout completed", session.id, session.client_reference_id);
      }
      return res.json({ received: true });
    } catch (error) {
      console.error("[Stripe webhook] Signature verification failed", error);
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  });
}
function registerStripeCheckout(app2) {
  app2.post("/api/stripe/create-checkout-session", async (req, res) => {
    console.warn("[Stripe checkout] Disabled: Evently currently uses organizer-managed manual payments");
    return res.status(410).json({ error: "Stripe checkout is disabled; use the event organizer's UPI and WhatsApp instructions" });
  });
}

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";
import { and as and2, eq as eq2 } from "drizzle-orm";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);
var roleProcedure = (...roles) => protectedProcedure.use(
  t.middleware(async (opts) => {
    if (!opts.ctx.user || !roles.includes(opts.ctx.user.role)) {
      throw new TRPCError2({ code: "FORBIDDEN", message: "You do not have permission to access this resource." });
    }
    return opts.next({ ctx: opts.ctx });
  })
);
var organizerProcedure = roleProcedure("organizer", "admin");
var staffProcedure = roleProcedure("staff", "organizer", "admin");

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var eventInput = z2.object({
  title: z2.string().trim().min(3).max(180),
  slug: z2.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(220),
  category: z2.string().trim().min(2).max(64),
  description: z2.string().trim().min(20),
  imageUrl: z2.string().url().max(2e3).nullable().optional(),
  venue: z2.string().trim().min(2).max(180),
  location: z2.string().trim().min(2).max(180),
  startsAt: z2.coerce.date(),
  endsAt: z2.coerce.date(),
  paymentUpi: z2.string().trim().max(180).nullable().optional(),
  paymentWhatsapp: z2.string().trim().max(32).nullable().optional(),
  ticketTheme: z2.string().trim().max(32).nullable().optional(),
  tickets: z2.array(z2.object({
    name: z2.string().trim().min(2).max(120),
    description: z2.string().trim().max(500).nullable().optional(),
    priceMinor: z2.number().int().min(0).max(1e8),
    quantity: z2.number().int().min(1).max(1e6)
  })).min(1).max(20)
}).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time" });
});
function dbError(error) {
  const message = error instanceof Error ? error.message : "Database operation failed";
  if (/not enough tickets|unavailable|did not return/i.test(message)) {
    throw new TRPCError3({ code: message.includes("unavailable") ? "INTERNAL_SERVER_ERROR" : "CONFLICT", message });
  }
  throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "The requested operation could not be completed" });
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  events: router({
    list: publicProcedure.query(() => getPublishedEvents()),
    bySlug: publicProcedure.input(z2.object({ slug: z2.string().min(1).max(220) })).query(async ({ input }) => {
      const event = await getPublishedEventBySlug(input.slug);
      if (!event) throw new TRPCError3({ code: "NOT_FOUND", message: "Event not found" });
      return event;
    }),
    mine: organizerProcedure.query(({ ctx }) => getOrganizerEvents(ctx.user.id)),
    create: organizerProcedure.input(eventInput).mutation(async ({ ctx, input }) => {
      try {
        return await createEvent({ ...input, organizerId: ctx.user.id });
      } catch (error) {
        dbError(error);
      }
    }),
    update: organizerProcedure.input(z2.object({ eventId: z2.number().int().positive(), data: eventInput })).mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateEvent(input.eventId, ctx.user.id, input.data);
        if (!updated) throw new TRPCError3({ code: "NOT_FOUND", message: "Event not found or not owned by this organizer" });
        return updated;
      } catch (error) {
        if (error instanceof TRPCError3) throw error;
        dbError(error);
      }
    }),
    setStatus: organizerProcedure.input(z2.object({ eventId: z2.number().int().positive(), status: z2.enum(["draft", "published", "archived"]) })).mutation(async ({ ctx, input }) => {
      try {
        const changed = await setEventStatus(input.eventId, ctx.user.id, input.status);
        if (!changed) throw new TRPCError3({ code: "NOT_FOUND", message: "Event not found or not owned by this organizer" });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError3) throw error;
        dbError(error);
      }
    })
  }),
  bookings: router({
    create: protectedProcedure.input(z2.object({
      eventId: z2.number().int().positive(),
      ticketTypeId: z2.number().int().positive(),
      attendeeName: z2.string().trim().min(2).max(160),
      attendeeEmail: z2.string().email().max(320),
      quantity: z2.number().int().min(1).max(20),
      paymentReference: z2.string().trim().max(160).nullable().optional(),
      idempotencyKey: z2.string().trim().min(16).max(96)
    })).mutation(async ({ ctx, input }) => {
      try {
        return await createBooking({ ...input, attendeeId: ctx.user.id });
      } catch (error) {
        dbError(error);
      }
    }),
    mine: protectedProcedure.query(({ ctx }) => getBookingsForUser(ctx.user.id)),
    get: protectedProcedure.input(z2.object({ bookingCode: z2.string().min(8).max(32) })).query(async ({ ctx, input }) => {
      const result = await getBookingForUser(input.bookingCode, ctx.user.id);
      if (!result) throw new TRPCError3({ code: "NOT_FOUND", message: "Booking not found" });
      return result;
    }),
    cancel: protectedProcedure.input(z2.object({ bookingCode: z2.string().min(8).max(32) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await cancelBooking(input.bookingCode, ctx.user.id);
        if (!result) throw new TRPCError3({ code: "NOT_FOUND", message: "Booking not found" });
        return result;
      } catch (error) {
        if (error instanceof TRPCError3) throw error;
        dbError(error);
      }
    })
  }),
  organizer: router({
    pendingBookings: organizerProcedure.query(({ ctx }) => getPendingBookingsForOrganizer(ctx.user.id)),
    approveBooking: organizerProcedure.input(z2.object({ bookingCode: z2.string().min(8).max(32) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await approveBooking(input.bookingCode, ctx.user.id);
        if (!result) throw new TRPCError3({ code: "NOT_FOUND", message: "Booking not found or not owned by this organizer" });
        return result;
      } catch (error) {
        if (error instanceof TRPCError3) throw error;
        dbError(error);
      }
    })
  }),
  ticketPasses: router({
    mine: protectedProcedure.query(({ ctx }) => getTicketPassesForUser(ctx.user.id)),
    issue: organizerProcedure.input(z2.object({ bookingId: z2.number().int().positive(), eventId: z2.number().int().positive(), ticketTypeId: z2.number().int().positive(), quantity: z2.number().int().min(1).max(20) })).mutation(async ({ ctx, input }) => {
      if (!await canAccessEventForCheckIn(input.eventId, ctx.user.id, ctx.user.role)) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "You cannot issue passes for this event." });
      }
      try {
        return await issueTicketPasses(input);
      } catch (error) {
        dbError(error);
      }
    }),
    verify: staffProcedure.input(z2.object({ passId: z2.string().min(12).max(100) })).query(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID", passId: input.passId };
      if (!await canAccessEventForCheckIn(pass.eventId, ctx.user.id, ctx.user.role)) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      return {
        status: pass.status === "CHECKED_IN" ? "ALREADY_USED" : pass.status === "CANCELLED" ? "INVALID" : "VALID",
        passId: pass.passId,
        eventId: pass.eventId,
        bookingId: pass.bookingId,
        ticketTypeId: pass.ticketTypeId,
        checkedInAt: pass.checkedInAt
      };
    }),
    checkIn: staffProcedure.input(z2.object({ passId: z2.string().min(12).max(100) })).mutation(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID", passId: input.passId };
      if (!await canAccessEventForCheckIn(pass.eventId, ctx.user.id, ctx.user.role)) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      if (pass.status === "CHECKED_IN") return { status: "ALREADY_USED", passId: pass.passId, checkedInAt: pass.checkedInAt };
      if (pass.status === "CANCELLED") return { status: "INVALID", passId: pass.passId };
      try {
        const updated = await markTicketPassCheckedIn(pass.passId, ctx.user.id);
        return updated?.status === "CHECKED_IN" ? { status: "CHECKED_IN", passId: updated.passId, checkedInAt: updated.checkedInAt } : { status: "ALREADY_USED", passId: pass.passId, checkedInAt: updated?.checkedInAt };
      } catch (error) {
        dbError(error);
      }
    })
  }),
  admin: router({
    setRole: adminProcedure.input(z2.object({ userId: z2.number().int().positive(), role: z2.enum(["user", "organizer", "staff", "admin"]) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(users).set({ role: input.role }).where(eq2(users.id, input.userId));
      return { success: true };
    }),
    assignStaff: adminProcedure.input(z2.object({ eventId: z2.number().int().positive(), userId: z2.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db.select({ id: eventStaff.id }).from(eventStaff).where(and2(eq2(eventStaff.eventId, input.eventId), eq2(eventStaff.userId, input.userId))).limit(1);
      if (!existing.length) await db.insert(eventStaff).values({ eventId: input.eventId, userId: input.userId, assignedBy: ctx.user.id });
      return { success: true };
    }),
    removeStaff: adminProcedure.input(z2.object({ eventId: z2.number().int().positive(), userId: z2.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(eventStaff).where(and2(eq2(eventStaff.eventId, input.eventId), eq2(eventStaff.userId, input.userId)));
      return { success: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// vercel_api.ts
validateProductionEnv();
var app = express2();
registerStripeWebhook(app);
app.use(express2.json({ limit: "50mb" }));
app.use(express2.urlencoded({ limit: "50mb", extended: true }));
registerStripeCheckout(app);
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var vercel_api_default = app;
export {
  vercel_api_default as default
};
