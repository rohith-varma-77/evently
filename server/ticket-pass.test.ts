import { describe, expect, it } from "vitest";
import { createSecurePassId } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function contextFor(role: User["role"]): TrpcContext {
  const user: User = {
    id: 7,
    openId: "ticket-test-user",
    email: "staff@example.com",
    name: "Test Staff",
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Evently ticket pass security", () => {
  it("creates unique opaque pass IDs without attendee data", () => {
    const first = createSecurePassId();
    const second = createSecurePassId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^EVT_PASS_[A-Za-z0-9_-]+$/);
    expect(first).not.toContain("staff");
    expect(first).not.toContain("example.com");
  });

  it("returns a clear invalid state for an unknown pass", async () => {
    const caller = appRouter.createCaller(contextFor("staff"));
    await expect(caller.ticketPasses.verify({ passId: "EVT_PASS_unknown_123" })).resolves.toEqual({ status: "INVALID", passId: "EVT_PASS_unknown_123" });
  });

  it("rejects user accounts from scanner procedures server-side", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.ticketPasses.verify({ passId: "EVT_PASS_unknown_123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
