import { describe, expect, it } from "vitest";
import { fleetStatus } from "./fleet.js";

const now = new Date("2027-04-10T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const config = { interval_min: 10, send_every: 6, low_batt_mv: 3300 };
const base = { status: "attiva", lastSeenAt: ago(20), battMv: 4200, lastFlags: 0, config };

describe("stato della centralina nella flotta", () => {
  it("attiva se ha inviato nei tempi e sta bene", () => {
    expect(fleetStatus(base, now)).toEqual({ status: "attiva", issues: [] });
  });
  it("mai collegata, dismessa", () => {
    expect(fleetStatus({ ...base, lastSeenAt: null }, now).status).toBe("mai_collegata");
    expect(fleetStatus({ ...base, status: "dismessa", lastSeenAt: null }, now).status).toBe("dismessa");
  });
  it("in ritardo oltre due invii mancati, muta dopo 3 ore", () => {
    expect(fleetStatus({ ...base, lastSeenAt: ago(125) }, now).status).toBe("attiva");
    expect(fleetStatus({ ...base, lastSeenAt: ago(135) }, now).status).toBe("in_ritardo");
    expect(fleetStatus({ ...base, lastSeenAt: ago(181) }, now).status).toBe("muta");
  });
  it("batteria bassa e sensore guasto, anche insieme", () => {
    expect(fleetStatus({ ...base, battMv: 3200 }, now).status).toBe("batteria_bassa");
    expect(fleetStatus({ ...base, lastFlags: 0x02 }, now).status).toBe("sensore_guasto");
    expect(fleetStatus({ ...base, lastSeenAt: ago(200), battMv: 3000, lastFlags: 0x01 }, now)).toEqual({
      status: "muta",
      issues: ["muta", "batteria_bassa", "sensore_guasto"],
    });
  });
  it("l'orologio non sincronizzato non è un guasto di sensore", () => {
    expect(fleetStatus({ ...base, lastFlags: 0x10 }, now).status).toBe("attiva");
  });
});
