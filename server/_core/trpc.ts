import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

const roleProcedure = (...roles: Array<"user" | "organizer" | "staff" | "admin">) => protectedProcedure.use(
  t.middleware(async opts => {
    if (!opts.ctx.user || !roles.includes(opts.ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to access this resource." });
    }
    return opts.next({ ctx: opts.ctx });
  }),
);

export const organizerProcedure = roleProcedure("organizer", "admin");
export const staffProcedure = roleProcedure("staff", "organizer", "admin");
