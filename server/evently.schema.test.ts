import { describe, expect, it } from "vitest";
import { bookings, events, ticketTypes } from "../drizzle/schema";

describe("Evently database schema", () => {
  it("exposes the core event, ticket, and booking entities", () => {
    expect(events).toBeDefined();
    expect(events.slug).toBeDefined();
    expect(events.startsAt).toBeDefined();
    expect(ticketTypes).toBeDefined();
    expect(ticketTypes.available).toBeDefined();
    expect(bookings).toBeDefined();
    expect(bookings.bookingCode).toBeDefined();
    expect(bookings.stripePaymentIntentId).toBeDefined();
  });
});
