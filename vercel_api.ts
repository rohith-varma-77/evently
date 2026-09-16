import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./server/_core/oauth";
import { registerStorageProxy } from "./server/_core/storageProxy";
import { registerStripeCheckout, registerStripeWebhook } from "./server/stripe";
import { appRouter } from "./server/routers";
import { createContext } from "./server/_core/context";
import { validateProductionEnv } from "./server/_core/env";

validateProductionEnv();
const app = express();

registerStripeWebhook(app);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStripeCheckout(app);
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default app;
