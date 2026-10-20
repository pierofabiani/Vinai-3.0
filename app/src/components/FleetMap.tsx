// Mappa della flotta: un punto per centralina installata, colorato per stato. Il colore non è l'unica
// indicazione: il passaggio mostra nome e stato, il clic apre la scheda, la tabella accanto riporta
// gli stessi stati. Base scura in modalità sera, chiara in modalità campo.
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import * as maplibregl from "maplibre-gl";
// MapLibre 6 calcola a runtime l'indirizzo del suo worker, che né Vite in sviluppo né la build
// trovano da soli: lo facciamo impacchettare a Vite e glielo passiamo noi.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useMemo, useRef } from "react";
import type { FleetRow } from "../lib/types";
import { STATUS } from "./ui";

maplibregl.setWorkerUrl(workerUrl);

const STYLE_SERA = "https://tiles.openfreemap.org/styles/dark";
const STYLE_CAMPO = "https://tiles.openfreemap.org/styles/positron";
const isCampo = () => document.documentElement.dataset.campo === "true";

/** MapLibre non capisce oklch(): si converte il token in rgb disegnandolo su un pixel. */
function rgb(color: string): string {
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!c) return "#888888";
  c.fillStyle = color;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

const toneVar = { ok: "--ok", warn: "--warn", bad: "--bad", neutral: "--neutral" } as const;

function features(rows: FleetRow[]): FeatureCollection {
  const css = getComputedStyle(document.documentElement);
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.location?.lon ?? 0, r.location?.lat ?? 0] },
      properties: {
        id: r.id,
        color: rgb(css.getPropertyValue(toneVar[STATUS[r.status].tone]).trim()),
        name: r.label ?? r.imei,
        status: STATUS[r.status].label,
      },
    })),
  };
}

export function FleetMap({ rows, onOpen }: { rows: FleetRow[]; onOpen: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const placed = useMemo(() => rows.filter((r) => r.location), [rows]);
  const current = useRef(placed);
  current.current = placed;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  // disegna (o ridisegna dopo un cambio di stile) i punti delle centraline
  const draw = (m: maplibregl.Map, fit: boolean) => {
    const data = features(current.current);
    const src = m.getSource("stations") as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      m.addSource("stations", { type: "geojson", data });
      m.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": rgb(
            getComputedStyle(document.documentElement).getPropertyValue("--panel").trim(),
          ),
        },
      });
    }
    if (fit && current.current.length) {
      const b = new maplibregl.LngLatBounds();
      for (const r of current.current) b.extend([r.location?.lon ?? 0, r.location?.lat ?? 0]);
      m.fitBounds(b, { padding: 48, maxZoom: 13, duration: 0 });
    }
  };

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: isCampo() ? STYLE_CAMPO : STYLE_SERA,
      center: [12.5, 42.8],
      zoom: 5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // l'attribuzione resta chiusa (la "i"): aperta copre il fondo della mappa
    m.on("load", () =>
      el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"),
    );
    let first = true;
    m.on("style.load", () => {
      // nomi dei luoghi in italiano dove OpenStreetMap li ha
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:it"], ["get", "name"]]);
      }
      draw(m, first);
      first = false;
    });
    const popup = new maplibregl.Popup({ closeButton: false, offset: 10 });
    m.on("mouseenter", "stations", (e: MapLayerMouseEvent) => {
      m.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (f?.geometry.type === "Point" && f.properties)
        popup
          .setLngLat(f.geometry.coordinates as [number, number])
          .setText(`${f.properties.name} · ${f.properties.status}`)
          .addTo(m);
    });
    m.on("mouseleave", "stations", () => {
      m.getCanvas().style.cursor = "";
      popup.remove();
    });
    m.on("click", "stations", (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) openRef.current(Number(id));
    });
    // modalità campo: cambia la base della mappa
    const obs = new MutationObserver(() => m.setStyle(isCampo() ? STYLE_CAMPO : STYLE_SERA));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-campo"] });
    map.current = m;
    return () => {
      obs.disconnect();
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m?.isStyleLoaded()) draw(m, true);
  }, [placed]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        ref={el}
        className="h-[460px] w-full"
        role="img"
        aria-label={`Mappa di ${placed.length} centraline installate`}
      />
      {placed.length === 0 ? (
        <p className="absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-lg bg-panel/95 px-3 py-1.5 text-sm text-ink-2">
          Nessuna centralina ha ancora una posizione: si registra all'installazione, inquadrando il QR.
        </p>
      ) : null}
    </div>
  );
}
