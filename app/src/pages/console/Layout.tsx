// Console nel mondo Verderame: testata verderame con schede, interruttore campo e profilo.
import { Link, Outlet } from "@tanstack/react-router";
import { User } from "lucide-react";
import { CampoToggle } from "../../components/CampoToggle";
import { isAdmin, useMe } from "../../lib/session";

const NAV: { to: string; label: string; admin?: boolean }[] = [
  { to: "/console", label: "Panoramica" },
  { to: "/console/flotta", label: "Flotta" },
  { to: "/console/laboratorio", label: "Laboratorio" },
  { to: "/console/aziende", label: "Aziende" },
  { to: "/console/utenti", label: "Utenti", admin: true },
  { to: "/console/registro", label: "Registro", admin: true },
  { to: "/console/posta", label: "Posta di prova", admin: true },
];

export function ConsoleLayout() {
  const me = useMe();
  const admin = isAdmin(me.data);
  return (
    <div className="min-h-dvh">
      <header className="no-print bg-shell text-shell-ink">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
          <span className="text-[17px] font-bold tracking-tight">Vinai</span>
          <nav
            aria-label="Console"
            className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,#000_85%,transparent)] md:order-none md:w-auto md:pr-0 md:[mask-image:none]"
          >
            {NAV.filter((n) => !n.admin || admin).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/console" }}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-[15px] opacity-85 transition-colors duration-150 hover:bg-shell-ink/10 hover:opacity-100 data-[status=active]:bg-shell-ink/15 data-[status=active]:font-semibold data-[status=active]:opacity-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <CampoToggle />
            <Link
              to="/profilo"
              className="inline-flex items-center gap-1.5 text-sm opacity-90 hover:opacity-100"
            >
              <User className="size-4" aria-hidden />
              <span className="hidden max-w-[16ch] truncate sm:inline">{me.data?.user?.name}</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-7 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
