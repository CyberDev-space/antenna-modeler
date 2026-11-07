import type { Load } from "./model";

/** The resistance in ohms that stands for a trap without loss at its resonance: no current passes. */
const OPEN = 1e9;

/**
 * The impedance of a load at a frequency in MHz, as resistance and reactance
 * in ohms, or `null` for a load with neither a coil nor a capacitor.
 */
export function loadImpedance(load: Load, frequency: number): [number, number] | null {
  if (load.kind === "rx") return [load.resistance, load.reactance];
  const omega = 2 * Math.PI * frequency * 1e6;
  const coil = omega * load.inductance * 1e-6;
  const capacitor = load.capacitance > 0 ? -1 / (omega * load.capacitance * 1e-12) : 0;
  // The loss is a resistance in series with the part that the quality factor belongs to.
  const loss = (reactance: number): number => (load.q > 0 ? Math.abs(reactance) / load.q : 0);

  if (load.inductance > 0 && load.capacitance > 0) {
    // In parallel: (r + j coil) (j capacitor) / (r + j (coil + capacitor)).
    const r = loss(coil);
    const sum = coil + capacitor;
    const size = r * r + sum * sum;
    if (size === 0) return [OPEN, 0];
    const [re, im] = [-coil * capacitor, r * capacitor];
    return [(re * r + im * sum) / size, (im * r - re * sum) / size];
  }
  if (load.inductance > 0) return [loss(coil), coil];
  if (load.capacitance > 0) return [loss(capacitor), capacitor];
  return null;
}

/** The frequency in MHz at which the coil and the capacitor of a trap resonate, or `null` for any other load. */
export function resonance(load: Load): number | null {
  if (load.kind !== "lc" || !(load.inductance > 0 && load.capacitance > 0)) return null;
  // Microhenries by picofarads: the root is in units of a nanosecond.
  return 1e3 / (2 * Math.PI * Math.sqrt(load.inductance * load.capacitance));
}
