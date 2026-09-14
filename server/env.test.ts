import { describe, expect, it } from "vitest";
import { validateProductionEnv } from "./_core/env";

describe("production environment validation", () => {
  const valid = {
    isProduction: true,
    cookieSecret: "x".repeat(64),
    databaseUrl: "mysql://example",
    appId: "evently-app",
    oAuthServerUrl: "https://auth.example.com",
    ownerOpenId: "owner",
    forgeApiUrl: "https://forge.example.com",
    forgeApiKey: "forge-key",
  };

  it("accepts complete production configuration", () => {
    expect(() => validateProductionEnv(valid)).not.toThrow();
  });

  it("rejects missing required variables", () => {
    expect(() => validateProductionEnv({ ...valid, databaseUrl: "" })).toThrow(
      "DATABASE_URL",
    );
  });

  it("allows a platform-provided shorter secret with a warning", () => {
    expect(() => validateProductionEnv({ ...valid, cookieSecret: "too-short" })).not.toThrow();
  });
});
