import { describe, expect, it } from "vitest";
import { getViteServerOptions } from "./_core/vite";

describe("managed Vite HMR configuration", () => {
  it("pins the HMR client to the public application port", () => {
    const server = {} as Parameters<typeof getViteServerOptions>[0];
    const options = getViteServerOptions(server, 3000);
    expect(options.hmr.clientPort).toBe(3000);
    expect(options.hmr.server).toBe(server);
    expect(options.middlewareMode).toBe(true);
  });
});
