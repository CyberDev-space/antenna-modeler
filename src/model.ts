/** A straight wire. Coordinates and radius are in metres. */
export interface Wire {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  radius: number;
  /** Number of segments; -1 lets the program choose, as in MMANA. */
  segments: number;
}

export type GroundKind = "free" | "perfect" | "real";

export interface Ground {
  kind: GroundKind;
  /** Relative dielectric constant and conductivity in S/m of a real ground. */
  permittivity: number;
  conductivity: number;
}

/** A place on a wire: its beginning, its centre or its end. */
export type WirePlace = "b" | "c" | "e";

/**
 * A point of a wire for a source or a load, in the notation of MMANA, which
 * calls it a pulse: `w1c` is the centre of wire 1.
 */
export interface Pulse {
  /** Index of the wire, from 0. */
  wire: number;
  place: WirePlace;
  /**
   * Segments away from that place, as in MMANA: from the centre towards the
   * end of the wire (negative: towards its beginning), from the beginning or
   * from the end into the wire.
   */
  offset?: number;
}

/** A source of voltage, as in MMANA: its place, its phase in degrees and its voltage in volts. */
export interface Source {
  at: Pulse;
  phase: number;
  voltage: number;
}

/**
 * A coil, a capacitor, or both in parallel, which is a trap. The quality
 * factor is that of the coil, or of the capacitor when there is no coil.
 */
export interface LcLoad {
  kind: "lc";
  at: Pulse;
  /** Microhenries; 0 for no coil. */
  inductance: number;
  /** Picofarads; 0 for no capacitor. */
  capacitance: number;
  /** 0 for no loss. */
  q: number;
}

/** A resistance and a reactance in ohms that are the same at every frequency. */
export interface RxLoad {
  kind: "rx";
  at: Pulse;
  resistance: number;
  reactance: number;
}

export type Load = LcLoad | RxLoad;

/** A range of frequencies in MHz, both ends among the points. */
export interface Sweep {
  from: number;
  to: number;
  points: number;
}

export interface Model {
  /** The name of the antenna: the first line of a file of MMANA. */
  name: string;
  wires: Wire[];
  /** At least one. Several make a phased array, as HB9CV. */
  sources: Source[];
  loads: Load[];
  /** MHz. */
  frequency: number;
  ground: Ground;
  /** Metres added to the height of every wire over a ground, as "Add height" in MMANA. */
  height: number;
  /** Conductivity of the wires in S/m; 0 stands for wires without loss. */
  wireConductivity: number;
  /** Impedance of the feed line in ohms, for the SWR. */
  reference: number;
  sweep: Sweep;
}

/** Conductivities in S/m of the metals that the page offers by name. */
export const COPPER = 5.8e7;
export const ALUMINIUM = 3.5e7;

/** A dipole for the 20 m band, 10 m above average ground, cut to resonance. */
export const defaultModel: Model = {
  name: "Диполь на 20 м",
  wires: [{ x1: 0, y1: -5.18, z1: 10, x2: 0, y2: 5.18, z2: 10, radius: 0.001, segments: -1 }],
  sources: [{ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }],
  loads: [],
  frequency: 14.15,
  ground: { kind: "real", permittivity: 13, conductivity: 0.005 },
  height: 0,
  wireConductivity: 0,
  reference: 50,
  sweep: { from: 13.6, to: 14.7, points: 23 },
};

/** What the results at the frequency of the model depend on, as text: everything but the name and the sweep. */
export function resultKey(model: Model): string {
  const { name, sweep, ...rest } = model;
  void name;
  void sweep;
  return JSON.stringify(rest);
}

/** What a sweep depends on, as text: everything but the name. The segments follow the frequency of the model. */
export function sweepKey(model: Model): string {
  const { name, ...rest } = model;
  void name;
  return JSON.stringify(rest);
}

/** A pulse in the notation of MMANA: `w1c` is the centre of wire 1, `w3c1` one segment further on wire 3. */
export function formatPulse(pulse: Pulse): string {
  return `w${pulse.wire + 1}${pulse.place}${pulse.offset || ""}`;
}

/** Reads `w1c`, `w2b`, `w3e`, `w3c1`, `w2c-2`, `w5e3`. Returns `null` for anything else. */
export function parsePulse(text: string): Pulse | null {
  const match = /^w(\d+)([bce])(-?\d+)?$/i.exec(text.trim());
  if (!match) return null;
  const wire = Number(match[1]) - 1;
  if (wire < 0) return null;
  const place = match[2].toLowerCase() as WirePlace;
  const offset = Number(match[3] ?? 0);
  // Only the centre has a wire on both sides.
  if (offset < 0 && place !== "c") return null;
  return offset === 0 ? { wire, place } : { wire, place, offset };
}

/**
 * The segment, counted from 1, that a pulse falls in on a wire of `count`
 * segments. The number can lie beyond the wire when the offset is too large.
 */
export function pulseSegment(pulse: Pulse, count: number): number {
  const offset = pulse.offset ?? 0;
  if (pulse.place === "b") return 1 + offset;
  if (pulse.place === "e") return count - offset;
  return Math.floor(count / 2) + 1 + offset;
}
