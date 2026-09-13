import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, organizerProcedure, protectedProcedure, publicProcedure, router, staffProcedure } from "./_core/trpc";
import { canAccessEventForCheckIn, getTicketPassById, getTicketPassesForUser, issueTicketPasses, markTicketPassCheckedIn, getDb } from "./db";
import { eventStaff, users } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  ticketPasses: router({
    mine: protectedProcedure.query(({ ctx }) => getTicketPassesForUser(ctx.user!.id)),
    issue: organizerProcedure.input(z.object({ bookingId: z.number().int().positive(), eventId: z.number().int().positive(), ticketTypeId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).mutation(async ({ ctx, input }) => {
      if (!(await canAccessEventForCheckIn(input.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot issue passes for this event." });
      }
      return issueTicketPasses(input);
    }),
    verify: staffProcedure.input(z.object({ passId: z.string().min(12).max(100) })).query(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID" as const, passId: input.passId };
      if (!(await canAccessEventForCheckIn(pass.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      return { status: pass.status === "CHECKED_IN" ? "ALREADY_USED" as const : pass.status === "CANCELLED" ? "INVALID" as const : "VALID" as const, passId: pass.passId, eventId: pass.eventId, bookingId: pass.bookingId, ticketTypeId: pass.ticketTypeId, checkedInAt: pass.checkedInAt };
    }),
    checkIn: staffProcedure.input(z.object({ passId: z.string().min(12).max(100) })).mutation(async ({ ctx, input }) => {
      const pass = await getTicketPassById(input.passId);
      if (!pass) return { status: "INVALID" as const, passId: input.passId };
      if (!(await canAccessEventForCheckIn(pass.eventId, ctx.user!.id, ctx.user!.role))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this event." });
      }
      if (pass.status === "CHECKED_IN") return { status: "ALREADY_USED" as const, passId: pass.passId, checkedInAt: pass.checkedInAt };
      if (pass.status === "CANCELLED") return { status: "INVALID" as const, passId: pass.passId };
      const updated = await markTicketPassCheckedIn(pass.passId, ctx.user!.id);
      return updated?.status === "CHECKED_IN" ? { status: "CHECKED_IN" as const, passId: updated.passId, checkedInAt: updated.checkedInAt } : { status: "INVALID" as const, passId: pass.passId };
    }),
  }),
  admin: router({
    setRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "organizer", "staff", "admin"]) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true } as const;
    }),
    assignStaff: adminProcedure.input(z.object({ eventId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const existing = await db.select({ id: eventStaff.id }).from(eventStaff).where(and(eq(eventStaff.eventId, input.eventId), eq(eventStaff.userId, input.userId))).limit(1);
      if (!existing.length) await db.insert(eventStaff).values({ eventId: input.eventId, userId: input.userId, assignedBy: ctx.user!.id });
      return { success: true } as const;
    }),
    removeStaff: adminProcedure.input(z.object({ eventId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      await db.delete(eventStaff).where(and(eq(eventStaff.eventId, input.eventId), eq(eventStaff.userId, input.userId)));
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
