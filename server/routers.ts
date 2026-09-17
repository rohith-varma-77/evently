import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, organizerProcedure, protectedProcedure, publicProcedure, router, staffProcedure } from "./_core/trpc";
import {
  approveBooking,
  canAccessEventForCheckIn,
  cancelBooking,
  createBooking,
  createEvent,
  getBookingForUser,
  getBookingsForUser,
  getDb,
  getOrganizerEvents,
  getPendingBookingsForOrganizer,
  getPublishedEventBySlug,
  getPublishedEvents,
  getTicketPassById,
  getTicketPassesForUser,
  issueTicketPasses,
  markTicketPassCheckedIn,
  setEventStatus,
  updateEvent,
} from "./db";
import { eventStaff, users } from "../drizzle/schema";

const eventInput = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(220),
  category: z.string().trim().min(2).max(64),
  description: z.string().trim().min(20),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  venue: z.string().trim().min(2).max(180),
  location: z.string().trim().min(2).max(180),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  paymentUpi: z.string().trim().max(180).nullable().optional(),
  paymentWhatsapp: z.string().trim().max(32).nullable().optional(),
  ticketTheme: z.string().trim().max(32).nullable().optional(),
  tickets: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    priceMinor: z.number().int().min(0).max(100000000),
    quantity: z.number().int().min(1).max(1000000),
  })).min(1).max(20),
}).superRefine((value, ctx) => {
  if (value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time" });
});

function dbError(error: unknown): never {
  const message = error instanceof Error ? error.message : "Database operation failed";
  if (/not enough tickets|unavailable|did not return/i.test(message)) {
    throw new TRPCError({ code: message.includes("unavailable") ? "INTERNAL_SERVER_ERROR" : "CONFLICT", message });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The requested operation could not be completed" });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  events: router({
    list: publicProcedure.query(() => getPublishedEvents()),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(220) })).query(async ({ input }) => {
      const event = await getPublishedEventBySlug(input.slug);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      return event;
    }),
    mine: organizerProcedure.query(({ ctx }) => getOrganizerEvents(ctx.user!.id)),
    create: organizerProcedure.input(eventInput).mutation(async ({ ctx, input }) => {
      try {
        return await createEvent({ ...input, organizerId: ctx.user!.id });
      } catch (error) {
        dbError(error);
      }
    }),
    update: organizerProcedure.input(z.object({ eventId: z.number().int().positive(), data: eventInput })).mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateEvent(input.eventId, ctx.user!.id, input.data);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found or not owned by this organizer" });
        return updated;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        dbError(error);
      }
    }),
    setStatus: organizerProcedure.input(z.object({ eventId: z.number().int().positive(), status: z.enum(["draft", "published", "archived"]) })).mutation(async ({ ctx, input }) => {
      try {
        const changed = await setEventStatus(input.eventId, ctx.user!.id, input.status);
        if (!changed) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found or not owned by this organizer" });
        return { success: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        dbError(error);
      }
    }),
  }),
  bookings: router({
    create: protectedProcedure.input(z.object({
      eventId: z.number().int().positive(),
      ticketTypeId: z.number().int().positive(),
      attendeeName: z.string().trim().min(2).max(160),
      attendeeEmail: z.string().email().max(320),
      quantity: z.number().int().min(1).max(20),
      paymentReference: z.string().trim().max(160).nullable().optional(),
      idempotencyKey: z.string().trim().min(16).max(96),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await createBooking({ ...input, attendeeId: ctx.user!.id });
      } catch (error) {
        dbError(error);
      }
    }),
    mine: protectedProcedure.query(({ ctx }) => getBookingsForUser(ctx.user!.id)),
    get: protectedProcedure.input(z.object({ bookingCode: z.string().min(8).max(32) })).query(async ({ ctx, input }) => {
      const result = await getBookingForUser(input.bookingCode, ctx.user!.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      return result;
    }),
    cancel: protectedProcedure.input(z.object({ bookingCode: z.string().min(8).max(32) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await cancelBooking(input.bookingCode, ctx.user!.id);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        dbError(error);
      }
    }),
  }),
  organizer: router({
    pendingBookings: organizerProcedure.query(({ ctx }) => getPendingBookingsForOrganizer(ctx.user!.id)),
    approveBooking: organizerProcedure.input(z.object({ bookingCode: z.string().min(8).max(32) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await approveBooking(input.bookingCode, ctx.user!.id);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found or not owned by this organizer" });
        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        dbError(error);
      }
    }),
  }),
  ticketPasses: router({
    mine: protectedProcedure.query(({ ctx }) => getTicketPassesForUser(ctx.user!.id)),
    issue: organizerProcedure.input(z.object({ bookingId: z.number().int().positive(), eventId: z.number().int().positive(), ticketTypeId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).mutation(async ({ ctx, input }) => {
      if (!(await canAccessEventForCheckIn(input.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot issue passes for this event." });
      }
      try {
        return await issueTicketPasses(input);
      } catch (error) {
        dbError(error);
      }
    }),
    verify: staffProcedure.input(z.object({ passId: z.string().min(12).max(100) })).query(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID" as const, passId: input.passId };
      if (!(await canAccessEventForCheckIn(pass.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      return {
        status: pass.status === "CHECKED_IN" ? "ALREADY_USED" as const : pass.status === "CANCELLED" ? "INVALID" as const : "VALID" as const,
        passId: pass.passId,
        eventId: pass.eventId,
        bookingId: pass.bookingId,
        ticketTypeId: pass.ticketTypeId,
        checkedInAt: pass.checkedInAt,
      };
    }),
    checkIn: staffProcedure.input(z.object({ passId: z.string().min(12).max(100) })).mutation(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID" as const, passId: input.passId };
      if (!(await canAccessEventForCheckIn(pass.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      if (pass.status === "CHECKED_IN") return { status: "ALREADY_USED" as const, passId: pass.passId, checkedInAt: pass.checkedInAt };
      if (pass.status === "CANCELLED") return { status: "INVALID" as const, passId: pass.passId };
      try {
        const updated = await markTicketPassCheckedIn(pass.passId, ctx.user!.id);
        return updated.changed && updated.pass?.status === "CHECKED_IN"
          ? { status: "CHECKED_IN" as const, passId: updated.pass.passId, checkedInAt: updated.pass.checkedInAt }
          : { status: "ALREADY_USED" as const, passId: pass.passId, checkedInAt: updated.pass?.checkedInAt };
      } catch (error) {
        dbError(error);
      }
    }),
  }),
  admin: router({
    setRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "organizer", "staff", "admin"]) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true } as const;
    }),
    assignStaff: adminProcedure.input(z.object({ eventId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const existing = await db.select({ id: eventStaff.id }).from(eventStaff).where(and(eq(eventStaff.eventId, input.eventId), eq(eventStaff.userId, input.userId))).limit(1);
      if (!existing.length) await db.insert(eventStaff).values({ eventId: input.eventId, userId: input.userId, assignedBy: ctx.user!.id });
      return { success: true } as const;
    }),
    removeStaff: adminProcedure.input(z.object({ eventId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(eventStaff).where(and(eq(eventStaff.eventId, input.eventId), eq(eventStaff.userId, input.userId)));
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
