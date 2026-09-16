import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Evently server-backed workflow boundaries", () => {
  it("public event discovery returns a typed collection from the database", async () => {
    const result = await appRouter.createCaller(context()).events.list();
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("slug");
      expect(Array.isArray(result[0]?.tickets)).toBe(true);
    }
  });

  it("unauthenticated booking creation is rejected before any write is attempted", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.bookings.create({
      eventId: 1,
      ticketTypeId: 1,
      attendeeName: "Test attendee",
      attendeeEmail: "test@example.com",
      quantity: 1,
      paymentReference: null,
      idempotencyKey: "test-idempotency-key-1234",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
