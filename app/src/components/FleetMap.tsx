// Mappa della flotta: un punto per centralina installata, colorato per stato.
// Il colore non è l'unica indicazione: la legenda ha icona ed etichetta, il clic apre la scheda,
// e la tabella sotto la mappa riporta gli stessi stati.
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import * as maplibregl from "maplibre-gl";
// MapLibre 6 calcola a runtime l'indirizzo del suo worker, che né Vite in sviluppo né la build
// trovano da soli: lo facciamo impacchettare a Vite e glielo passiamo noi.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import type { FleetRow } from "../lib/types";
import { STATUS } from "./ui";

maplibregl.setWorkerUrl(workerUrl);

const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";

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

export function FleetMap({ rows, onOpen }: { rows: FleetRow[]; onOpen: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const placed = rows.filter((r) => r.location);

  useEffect(() => {
    if (!el.current) return;
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const m = new maplibregl.Map({
      container: el.current,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [12.5, 42.8],
      zoom: 5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // nomi dei luoghi in italiano dove OpenStreetMap li ha
    m.on("style.load", () => {
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:it"], ["get", "name"]]);
      }
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const css = getComputedStyle(document.documentElement);
    const color = (s: FleetRow["status"]) => rgb(css.getPropertyValue(toneVar[STATUS[s].tone]).trim());
    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: placed.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.location?.lon ?? 0, r.location?.lat ?? 0] },
        properties: {
          id: r.id,
          color: color(r.status),
          name: r.label ?? r.imei,
          status: STATUS[r.status].label,
        },
      })),
    };
    const apply = () => {
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
            "circle-stroke-color": rgb(css.getPropertyValue("--panel").trim()),
          },
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
          if (id) onOpen(Number(id));
        });
      }
      if (placed.length) {
        const b = new maplibregl.LngLatBounds();
        for (const r of placed) b.extend([r.location?.lon ?? 0, r.location?.lat ?? 0]);
        m.fitBounds(b, { padding: 48, maxZoom: 13, duration: 0 });
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
  }, [placed, onOpen]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-line-soft">
      <div
        ref={el}
        className="h-[340px] w-full"
        role="img"
        aria-label={`Mappa di ${placed.length} centraline installate`}
      />
      {placed.length === 0 ? (
        <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded bg-panel/90 px-3 py-1.5 text-sm text-ink-2">
          Nessuna centralina ha ancora una posizione: si registra all'installazione, inquadrando il QR.
        </p>
      ) : null}
    </div>
  );
}
