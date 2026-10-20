// Applicazione HTTP per la web app e la console. I servizi arrivano da fuori (ApiDeps).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { GlobalRole } from "../auth/auth.js";
import type { ApiDeps, AppEnv } from "./context.js";
import { agroRoutes } from "./routes/agro.js";
import { consoleRoutes } from "./routes/console.js";
import { userRoutes } from "./routes/user.js";

export function createApp(d: ApiDeps) {
  const app = new Hono<AppEnv>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error("[api]", err);
    return c.json({ error: "Errore interno" }, 500);
  });

  app.get("/health", async (c) => {
    try {
      return c.json({ ok: true, db: await d.dbStatus() });
    } catch {
      return c.json({ ok: false, db: null }, 503);
    }
  });

  app.on(["GET", "POST"], "/auth/*", (c) => d.auth.handler(c.req.raw));

  app.use("*", async (c, next) => {
    const session = await d.auth.api.getSession({ headers: c.req.raw.headers });
    const u = session?.user as
      | { id: string; email: string; name: string; role?: string | null; banned?: boolean | null }
      | undefined;
    c.set(
      "user",
      u && !u.banned
        ? { id: u.id, email: u.email, name: u.name, role: (u.role ?? "user") as GlobalRole }
        : null,
    );
    await next();
  });

  app.route("/", userRoutes(d));
  app.route("/", agroRoutes(d));
  app.route("/console", consoleRoutes(d));
  return app;
}

export type AppType = ReturnType<typeof createApp>;
