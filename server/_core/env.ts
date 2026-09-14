export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

export function validateProductionEnv(config = ENV) {
  if (!config.isProduction) return;
  const required: Array<[string, string]> = [
    ["JWT_SECRET", config.cookieSecret],
    ["DATABASE_URL", config.databaseUrl],
    ["VITE_APP_ID", config.appId],
    ["OAUTH_SERVER_URL", config.oAuthServerUrl],
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
  if (config.cookieSecret.length < 32) {
    console.warn("[Config] JWT_SECRET is shorter than the recommended 32 characters; use a stronger secret for self-managed production deployments");
  }
}
