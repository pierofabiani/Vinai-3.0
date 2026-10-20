import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef } from "react";
import { Skeleton } from "./components/ui";
import { isStaff, useMe } from "./lib/session";
import { Oggi } from "./pages/cliente/Oggi";
import { Vigneto } from "./pages/cliente/Vigneto";
import { Audit } from "./pages/console/Audit";
import { Fleet } from "./pages/console/Fleet";
import { Lab } from "./pages/console/Lab";
import { Labels } from "./pages/console/Labels";
import { ConsoleLayout } from "./pages/console/Layout";
import { Org } from "./pages/console/Org";
import { Orgs } from "./pages/console/Orgs";
import { Outbox } from "./pages/console/Outbox";
import { Overview } from "./pages/console/Overview";
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
  if (!me.data?.user) return <GoTo to="/accesso" search={{ next: loc.href }} />;
  if (staff && !isStaff(me.data)) {
    const only = me.data.memberships.length === 1 ? me.data.memberships[0] : undefined;
    return <LeaveConsole orgId={only?.organizationId} />;
  }
  return <>{children}</>;
}

/**
 * Redirect fatto in un effetto, una sola volta. Con <Navigate> dentro una rotta protetta, sul server
 * di sviluppo la pagina restava bloccata in un ciclo di disegni (RESULT_CODE_HUNG nel browser).
 */
function GoTo({ to, search }: { to: string; search?: Record<string, string> }) {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void navigate({ to, search, replace: true } as never);
  }, [navigate, to, search]);
  return <Skeleton className="m-6 h-40" />;
}

/**
 * Un cliente che apre la console va alla sua area. Si naviga una volta sola, dentro un effetto:
 * con <Navigate> la rotta della console restava montata e ripeteva la navigazione a ogni disegno,
 * bloccando la pagina.
 */
function LeaveConsole({ orgId }: { orgId: string | undefined }) {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (orgId) void navigate({ to: "/a/$orgId", params: { orgId }, replace: true });
    else void navigate({ to: "/", replace: true });
  }, [navigate, orgId]);
  return <Skeleton className="m-6 h-40" />;
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
const oggi = createRoute({
  getParentRoute: () => root,
  path: "/a/$orgId",
  component: () => (
    <RequireUser>
      <Oggi />
    </RequireUser>
  ),
});
const vigneto = createRoute({
  getParentRoute: () => root,
  path: "/a/$orgId/vigneto/$id",
  component: () => (
    <RequireUser>
      <Vigneto />
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
const overview = createRoute({ getParentRoute: () => consoleRoute, path: "/", component: Overview });
const fleet = createRoute({ getParentRoute: () => consoleRoute, path: "/flotta", component: Fleet });
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
  oggi,
  vigneto,
  consoleRoute.addChildren([overview, fleet, station, lab, labels, orgs, org, users, audit, outbox]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
