// Mappa della flotta per i prototipi: punti colorati per stato su uno stile di base scelto dalla direzione.
// MapLibre non legge oklch(): i colori arrivano già in rgb.
import type { FeatureCollection } from "geojson";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";

maplibregl.setWorkerUrl(workerUrl);

export interface MapPoint {
  id: number;
  lat: number;
  lon: number;
  color: string;
  label: string;
}

export function ProtoMap({
  points,
  style,
  ring,
  height = 320,
  onOpen,
}: {
  points: MapPoint[];
  style: string;
  ring: string;
  height?: number;
  onOpen?: (id: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style,
      center: [11.5, 44.3],
      zoom: 6,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // l'attribuzione resta chiusa (la "i"): aperta copre il fondo della mappa
    m.on("load", () =>
      el.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"),
    );
    m.on("style.load", () => {
      for (const layer of m.getStyle().layers ?? []) {
        if (layer.type === "symbol" && m.getLayoutProperty(layer.id, "text-field") !== undefined)
          m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:it"], ["get", "name"]]);
      }
      const data: FeatureCollection = {
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: { id: p.id, color: p.color, label: p.label },
        })),
      };
      m.addSource("pts", { type: "geojson", data });
      m.addLayer({
        id: "pts",
        type: "circle",
        source: "pts",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": ring,
        },
      });
      m.on("click", "pts", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && onOpen) onOpen(Number(id));
      });
      if (points.length) {
        const b = new maplibregl.LngLatBounds();
        for (const p of points) b.extend([p.lon, p.lat]);
        m.fitBounds(b, { padding: 40, maxZoom: 12, duration: 0 });
      }
    });
    return () => m.remove();
  }, [points, style, ring, onOpen]);
  return (
    <div
      ref={el}
      style={{ height }}
      className="protomap"
      role="img"
      aria-label={`Mappa di ${points.length} centraline`}
    />
  );
}

/** oklch e qualsiasi colore CSS → rgb, disegnandolo su un pixel. */
export function toRgb(color: string): string {
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!c) return "#888";
  c.fillStyle = color;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}
