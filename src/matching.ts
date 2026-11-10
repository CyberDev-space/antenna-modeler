/**
 * Matching an antenna to its feed line at one frequency: an L network of a
 * coil and a capacitor, a hairpin across a split driven element, and a
 * quarter-wave transformer. Impedances are complex numbers [R, X] in ohms.
 */

export type Impedance = [number, number];

/** The velocity of light in metres per microsecond: wavelengths in metres from megahertz. */
const LIGHT = 299.792458;

/** A reactance smaller than this part of the line's impedance is no element at all. */
const NOTHING = 1e-9;

/** A coil or a capacitor with its reactance in ohms and its value in henries or farads. */
export interface Part {
  kind: "coil" | "capacitor";
  reactance: number;
  value: number;
}

/** An L network: a series element and a shunt element, the shunt across the antenna or across the line. */
export interface LNetwork {
  shuntAt: "antenna" | "line";
  /** `null` where the network needs no such element. */
  series: Part | null;
  shunt: Part | null;
}

const omega = (megahertz: number): number => 2 * Math.PI * megahertz * 1e6;

/** A series element of a reactance. */
function seriesPart(reactance: number, megahertz: number, z0: number): Part | null {
  if (Math.abs(reactance) < NOTHING * z0) return null;
  const w = omega(megahertz);
  return reactance > 0 ? { kind: "coil", reactance, value: reactance / w } : { kind: "capacitor", reactance, value: -1 / (w * reactance) };
}

/** A shunt element of a susceptance in siemens; its reactance is minus the inverse. */
function shuntPart(susceptance: number, megahertz: number, z0: number): Part | null {
  if (Math.abs(susceptance) * z0 < NOTHING) return null;
  const w = omega(megahertz);
  const reactance = -1 / susceptance;
  return susceptance > 0 ? { kind: "capacitor", reactance, value: susceptance / w } : { kind: "coil", reactance, value: -1 / (w * susceptance) };
}

const divide = ([a, b]: Impedance, [c, d]: Impedance): Impedance => {
  const size = c * c + d * d;
  return [(a * c + b * d) / size, (b * c - a * d) / size];
};
const inverse = (value: Impedance): Impedance => divide([1, 0], value);

/**
 * Every L network that matches an antenna of impedance `load` to a line of
 * impedance `z0` at a frequency in MHz: up to two with the shunt element
 * across the antenna, where the conductance of the antenna is at most that
 * of the line, and up to two with it across the line, where the resistance
 * of the antenna is at most that of the line.
 */
export function lNetworks(load: Impedance, z0: number, megahertz: number): LNetwork[] {
  const found: LNetwork[] = [];
  const [r, x] = load;
  if (!(r > 0) || !(z0 > 0) || !(megahertz > 0)) return found;
  const roots = (square: number): number[] => (square < 0 ? [] : square === 0 ? [0] : [Math.sqrt(square), -Math.sqrt(square)]);

  // The shunt across the antenna turns its conductance into the line's, then a series element cancels what is left.
  const [g, b] = inverse(load);
  for (const root of roots(g / z0 - g * g)) {
    const shunt = -b + root;
    const [, rest] = inverse([g, b + shunt]);
    found.push({ shuntAt: "antenna", series: seriesPart(-rest, megahertz, z0), shunt: shuntPart(shunt, megahertz, z0) });
  }
  // The series element brings the resistance of the antenna onto the circle where a shunt across the line matches it.
  for (const root of roots(r * z0 - r * r)) {
    found.push({ shuntAt: "line", series: seriesPart(root - x, megahertz, z0), shunt: shuntPart(root / (r * z0), megahertz, z0) });
  }
  // A network that is the same as another, as when the antenna needs one element only, counts once.
  const same = (p: Part | null, q: Part | null): boolean =>
    p === null || q === null ? p === q : Math.abs(p.reactance - q.reactance) <= 1e-9 * Math.max(z0, Math.abs(p.reactance));
  return found.filter(
    (one, k) =>
      !found
        .slice(0, k)
        .some((other) => same(other.series, one.series) && same(other.shunt, one.shunt) && (one.shunt === null || other.shuntAt === one.shuntAt)),
  );
}

/** The impedance that the line sees through an L network. */
export function throughNetwork(load: Impedance, network: LNetwork): Impedance {
  const series = (z: Impedance): Impedance => [z[0], z[1] + (network.series?.reactance ?? 0)];
  const shunt = (z: Impedance): Impedance => {
    if (!network.shunt) return z;
    const [g, b] = inverse(z);
    return inverse([g, b - 1 / network.shunt.reactance]);
  };
  return network.shuntAt === "antenna" ? series(shunt(load)) : shunt(series(load));
}

/** What a hairpin match asks of the antenna and of the hairpin. */
export interface Hairpin {
  /** The reactance that the driven element must have, in ohms: it is made a little short for it. */
  antennaReactance: number;
  /** The reactance of the hairpin, in ohms, and its inductance in henries. */
  reactance: number;
  inductance: number;
  /** The impedance of the hairpin as a line of two conductors, in ohms, and its length in metres to the short. */
  lineImpedance: number;
  length: number;
}

/**
 * The hairpin, or beta, match of a split driven element whose resistance is
 * below the line's: a shunt coil across the feed point, made of two parallel
 * conductors shorted at their end, and an element short enough to be
 * capacitive. `diameter` and `spacing` are those of the conductors of the
 * hairpin, centre to centre, in metres. `null` when the resistance is not
 * below the line's.
 */
export function hairpin(resistance: number, z0: number, megahertz: number, diameter: number, spacing: number): Hairpin | null {
  if (!(resistance > 0) || !(resistance < z0) || !(megahertz > 0) || !(diameter > 0) || !(spacing > diameter)) return null;
  const antennaReactance = -Math.sqrt(resistance * (z0 - resistance));
  const reactance = z0 * Math.sqrt(resistance / (z0 - resistance));
  const lineImpedance = 120 * Math.acosh(spacing / diameter);
  const wavelength = LIGHT / megahertz;
  return {
    antennaReactance,
    reactance,
    inductance: reactance / omega(megahertz),
    lineImpedance,
    length: (Math.atan(reactance / lineImpedance) * wavelength) / (2 * Math.PI),
  };
}

/** The impedance that the line sees through a lossless quarter-wave line of impedance `line`. */
export function throughQuarterWave(load: Impedance, line: number): Impedance {
  return divide([line * line, 0], load);
}

/** The length of a quarter wave in a line with a velocity factor, in metres. */
export const quarterWave = (megahertz: number, velocityFactor: number): number => (LIGHT / megahertz / 4) * velocityFactor;
