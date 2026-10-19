import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Skeleton } from "./components/ui";
import { isStaff, useMe } from "./lib/session";
import { Audit } from "./pages/console/Audit";
import { Fleet } from "./pages/console/Fleet";
import { Lab } from "./pages/console/Lab";
import { Labels } from "./pages/console/Labels";
import { ConsoleLayout } from "./pages/console/Layout";
import { Org } from "./pages/console/Org";
import { Orgs } from "./pages/console/Orgs";
import { Outbox } from "./pages/console/Outbox";
import { Station } from "./pages/console/Station";
import { Users } from "./pages/console/Users";
import { Home } from "./pages/Home";
import { Install } from "./pages/Install";
import { Invite } from "./pages/Invite";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";

/** Pagine riservate: senza sessione si va all'accesso e poi si torna qui. */
function RequireUser({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <Skeleton className="m-6 h-40" />;
  if (!me.data?.user) return <Navigate to="/accesso" search={{ next: loc.href }} />;
  if (staff && !isStaff(me.data)) return <Navigate to="/" />;
  return <>{children}</>;
}

const root = createRootRoute({ component: () => <Outlet /> });

const login = createRoute({
  getParentRoute: () => root,
  path: "/accesso",
  component: Login,
  validateSearch: (s: Record<string, unknown>) => ({ next: typeof s.next === "string" ? s.next : undefined }),
});
const invite = createRoute({ getParentRoute: () => root, path: "/invito/$token", component: Invite });
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => (
    <RequireUser>
      <Home />
    </RequireUser>
  ),
});
const profile = createRoute({
  getParentRoute: () => root,
  path: "/profilo",
  component: () => (
    <RequireUser>
      <Profile />
    </RequireUser>
  ),
});
const install = createRoute({
  getParentRoute: () => root,
  path: "/c/$imei",
  component: () => (
    <RequireUser>
      <Install />
    </RequireUser>
  ),
});

const consoleRoute = createRoute({
  getParentRoute: () => root,
  path: "/console",
  component: () => (
    <RequireUser staff>
      <ConsoleLayout />
    </RequireUser>
  ),
});
const fleet = createRoute({ getParentRoute: () => consoleRoute, path: "/", component: Fleet });
const station = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/centraline/$id",
  component: Station,
});
const lab = createRoute({ getParentRoute: () => consoleRoute, path: "/laboratorio", component: Lab });
const labels = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/etichette",
  component: Labels,
  validateSearch: (s: Record<string, unknown>) => ({ ids: typeof s.ids === "string" ? s.ids : "" }),
});
const orgs = createRoute({ getParentRoute: () => consoleRoute, path: "/aziende", component: Orgs });
const org = createRoute({ getParentRoute: () => consoleRoute, path: "/aziende/$id", component: Org });
const users = createRoute({ getParentRoute: () => consoleRoute, path: "/utenti", component: Users });
const audit = createRoute({ getParentRoute: () => consoleRoute, path: "/registro", component: Audit });
const outbox = createRoute({ getParentRoute: () => consoleRoute, path: "/posta", component: Outbox });

// Prototipi di design P3 (pubblici: solo dati d'esempio), caricati a parte
const proto = (name: "ProtoIndex" | "OggiA" | "VignetoA" | "FlottaA" | "OggiB" | "VignetoB" | "FlottaB") =>
  lazyRouteComponent(() => import("./proto"), name);
const protoSearch = (s: Record<string, unknown>) => ({
  n: typeof s.n === "string" || typeof s.n === "number" ? String(s.n) : undefined,
});
const protoIndex = createRoute({
  getParentRoute: () => root,
  path: "/prototipi",
  component: proto("ProtoIndex"),
});
const protoA = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/a/oggi",
  component: proto("OggiA"),
  validateSearch: protoSearch,
});
const protoAV = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/a/vigneto/$id",
  component: proto("VignetoA"),
  validateSearch: protoSearch,
});
const protoAF = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/a/flotta",
  component: proto("FlottaA"),
});
const protoB = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/b/oggi",
  component: proto("OggiB"),
  validateSearch: protoSearch,
});
const protoBV = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/b/vigneto/$id",
  component: proto("VignetoB"),
  validateSearch: protoSearch,
});
const protoBF = createRoute({
  getParentRoute: () => root,
  path: "/prototipi/b/flotta",
  component: proto("FlottaB"),
});

const routeTree = root.addChildren([
  protoIndex,
  protoA,
  protoAV,
  protoAF,
  protoB,
  protoBV,
  protoBF,
  login,
  invite,
  home,
  profile,
  install,
  consoleRoute.addChildren([fleet, station, lab, labels, orgs, org, users, audit, outbox]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
