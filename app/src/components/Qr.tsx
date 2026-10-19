import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR in SVG: nitido in stampa a qualsiasi dimensione. */
export function Qr({ value, size = 128, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    void QRCode.toString(value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setSvg);
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: size }}
      className="shrink-0 rounded bg-white p-1 [&_svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export const stationUrl = (imei: string) => `${window.location.origin}/c/${imei}`;
