import { Moon, Sun } from "lucide-react";
import { useCampo } from "../lib/campo";

/** Interruttore sera/campo, nella testata. */
export function CampoToggle() {
  const { on, toggle } = useCampo();
  const Icon = on ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-shell-ink/30 px-3 text-sm text-shell-ink transition-colors duration-150 hover:bg-shell-ink/10"
    >
      <Icon className="size-4" aria-hidden />
      <span className="hidden sm:inline">{on ? "Modalità sera" : "Modalità campo"}</span>
      <span className="sm:hidden">{on ? "Sera" : "Campo"}</span>
    </button>
  );
}
