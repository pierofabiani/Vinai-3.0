// Installazione dal QR della centralina: si apre sul telefono del tecnico, in vigna.
// Vigneto, posizione GPS, foto e nota. Pulsanti grandi, un passo dopo l'altro.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Camera, CheckCircle2, LocateFixed } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/Brand";
import { Button, ErrorBox, Field, Input, Select, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { ago, num } from "../lib/format";
import { isStaff, useMe } from "../lib/session";

interface InstallInfo {
  station: {
    id: number;
    imei: string;
    label: string | null;
    status: string;
    organizationId: string | null;
    vineyardId: string | null;
    installedAt: string | null;
    lastSeenAt: string | null;
  };
  organizations: { id: string; name: string; vineyards: { id: string; name: string }[] }[];
}

export function Install() {
  const { imei } = useParams({ strict: false }) as { imei: string };
  const me = useMe();
  const staff = isStaff(me.data);
  const info = useQuery({
    queryKey: ["install", imei],
    queryFn: () => api<InstallInfo>(`/install/${imei}`),
    enabled: staff,
    retry: false,
  });
  const [org, setOrg] = useState<string>("");
  const [vineyard, setVineyard] = useState<string>("");
  const [pos, setPos] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  if (me.data && !staff)
    return (
      <Shell>
        <p className="text-ink-2">
          Per installare una centralina serve l'account di un tecnico. Centralina {imei}.
        </p>
      </Shell>
    );

  const st = info.data?.station;
  const orgId = org || st?.organizationId || "";
  const vineyards = info.data?.organizations.find((o) => o.id === orgId)?.vineyards ?? [];
  const vineyardId =
    vineyard || (vineyards.some((v) => v.id === st?.vineyardId) ? (st?.vineyardId ?? "") : "");

  const locate = () => {
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy });
        setLocating(false);
      },
      () => {
        setError(
          new Error("Posizione non disponibile: consenti la posizione al browser e riprova all'aperto"),
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pos) return setError(new Error("Registra la posizione prima di confermare"));
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("vineyardId", vineyardId);
    form.set("lat", String(pos.lat));
    form.set("lon", String(pos.lon));
    form.set("note", note);
    if (photo) form.set("photo", photo);
    try {
      await api(`/install/${imei}`, { method: "POST", form });
      setDone(true);
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  if (done)
    return (
      <Shell>
        <div role="status">
          <CheckCircle2 className="size-10 text-ok" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">Centralina installata</h1>
          <p className="mt-2 text-ink-2">
            Diventa attiva al primo invio, di solito entro un'ora. Puoi controllarla dalla console.
          </p>
          <Link
            to="/console/centraline/$id"
            params={{ id: String(st?.id) }}
            className="mt-6 inline-block text-accent underline"
          >
            Apri la scheda della centralina
          </Link>
        </div>
      </Shell>
    );

  return (
    <Shell>
      {info.isPending ? (
        <Skeleton className="h-64" />
      ) : !st ? (
        <ErrorBox error={info.error ?? new Error("Centralina non trovata")} />
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <div>
            <h1 className="text-xl font-semibold">{st.label ?? "Centralina"}</h1>
            <p className="font-mono text-sm text-ink-3">IMEI {st.imei}</p>
            <p className="mt-1 text-sm text-ink-2">
              {st.installedAt
                ? `Già installata ${ago(st.installedAt)}: confermando la sposti.`
                : "Non ancora installata."}
              {st.lastSeenAt ? ` Ultimo invio ${ago(st.lastSeenAt)}.` : " Non ha ancora inviato dati."}
            </p>
          </div>
          <Field label="Azienda">
            <Select
              required
              value={orgId}
              onChange={(e) => {
                setOrg(e.target.value);
                setVineyard("");
              }}
              className="h-12"
            >
              <option value="" disabled>
                Scegli l'azienda
              </option>
              {info.data?.organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Vigneto"
            hint={
              orgId && vineyards.length === 0
                ? "Questa azienda non ha vigneti: aggiungili dalla console"
                : undefined
            }
          >
            <Select
              required
              value={vineyardId}
              onChange={(e) => setVineyard(e.target.value)}
              disabled={!orgId}
              className="h-12"
            >
              <option value="" disabled>
                Scegli il vigneto
              </option>
              {vineyards.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium text-ink-2">Posizione</span>
            <Button type="button" className="h-12" icon={LocateFixed} busy={locating} onClick={locate}>
              {pos ? "Aggiorna la posizione" : "Usa la posizione del telefono"}
            </Button>
            {pos ? (
              <p className="text-sm text-ink-2 num">
                {pos.lat.toFixed(5)}, {pos.lon.toFixed(5)} · precisione {num(pos.acc, 0, "m")}
                {pos.acc > 30 ? " — avvicinati alla centralina e riprova per più precisione" : ""}
              </p>
            ) : (
              <p className="text-sm text-ink-3">Stai accanto alla centralina, all'aperto.</p>
            )}
          </div>
          <Field label="Foto dell'installazione (facoltativa)">
            <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm text-ink-2 hover:border-ink-3">
              <Camera className="size-4" aria-hidden />
              {photo ? photo.name : "Scatta o scegli una foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </Field>
          <Field label="Nota (facoltativa)">
            <Input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="es. palo a capofila, lato nord"
              className="h-12"
            />
          </Field>
          <ErrorBox error={error} />
          <Button
            type="submit"
            variant="primary"
            className="h-12 text-base"
            busy={busy}
            disabled={!vineyardId}
          >
            Conferma l'installazione
          </Button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 py-6">
      <div className="mb-8">
        <Brand />
      </div>
      {children}
    </main>
  );
}
