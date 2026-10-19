// Modalità campo: tema chiaro ad alto contrasto per l'uso al sole. È una comodità del singolo
// dispositivo: si ricorda nel browser, e se la memoria non è disponibile resta la modalità sera.
import { useState } from "react";

const KEY = "vinai-campo";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function applyCampo(on: boolean) {
  document.documentElement.dataset.campo = on ? "true" : "false";
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // memoria del browser non disponibile: vale solo per questa visita
  }
}

/** Da chiamare prima del primo disegno, per non mostrare un lampo del tema sbagliato. */
export function initCampo() {
  document.documentElement.dataset.campo = read() ? "true" : "false";
}

export function useCampo() {
  const [on, setOn] = useState(read);
  return {
    on,
    toggle: () => {
      applyCampo(!on);
      setOn(!on);
    },
  };
}
