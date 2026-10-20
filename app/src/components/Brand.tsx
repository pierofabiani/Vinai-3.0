import { Sprout } from "lucide-react";

/** Segnaposto del marchio: il nome "Vinai" è provvisorio (PRODUCT.md). */
export function Brand() {
  return (
    <div className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
      <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink">
        <Sprout className="size-4" aria-hidden />
      </span>
      Vinai
    </div>
  );
}
