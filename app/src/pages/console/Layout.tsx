import { Link, Outlet } from "@tanstack/react-router";
import {
  Building2,
  FlaskConical,
  Inbox,
  type LucideIcon,
  Map as MapIcon,
  ScrollText,
  User,
  Users,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { isAdmin, useMe } from "../../lib/session";

const NAV: { to: string; label: string; icon: LucideIcon; admin?: boolean }[] = [
  { to: "/console", label: "Flotta", icon: MapIcon },
  { to: "/console/laboratorio", label: "Laboratorio", icon: FlaskConical },
  { to: "/console/aziende", label: "Aziende", icon: Building2 },
  { to: "/console/utenti", label: "Utenti", icon: Users, admin: true },
  { to: "/console/registro", label: "Registro", icon: ScrollText, admin: true },
  { to: "/console/posta", label: "Posta di prova", icon: Inbox, admin: true },
];

export function ConsoleLayout() {
  const me = useMe();
  const admin = isAdmin(me.data);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="no-print border-b border-line-soft bg-sidebar lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 lg:block">
          <Brand />
          <Link
            to="/profilo"
            className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink lg:hidden"
          >
            <User className="size-4" aria-hidden /> Profilo
          </Link>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-2 lg:mt-4 lg:flex-col lg:overflow-visible"
          aria-label="Console"
        >
          {NAV.filter((n) => !n.admin || admin).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/console" }}
              className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-2 transition-colors duration-150 hover:bg-panel-2 hover:text-ink data-[status=active]:bg-panel-2 data-[status=active]:font-medium data-[status=active]:text-ink"
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 hidden w-[220px] border-t border-line-soft px-4 py-3 lg:block">
          <Link to="/profilo" className="block text-sm text-ink-2 hover:text-ink">
            <span className="block truncate font-medium text-ink">{me.data?.user?.name}</span>
            <span className="block truncate text-xs">
              {me.data?.user?.role === "admin" ? "Amministratore" : "Tecnico"}
            </span>
          </Link>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
