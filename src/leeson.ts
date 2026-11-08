import type { Section } from "./taper";

/*
 * Leeson's equivalent cylinder of a step-tapered element.
 *
 * A Yagi element of telescoping tubes is replaced by one cylinder of a single
 * diameter that resonates at the same frequency and whose reactance at the
 * centre changes with frequency at the same slope (D. B. Leeson, "Physical
 * Design of Yagi Antennas", ARRL 1992, chapter 8). NEC-2 computes such a
 * cylinder well, where it computes the steps of radius between the tubes
 * poorly.
 *
 * Written from a clean-room specification of the method; see PROVENANCE.md.
 * The constants are those of the uniform cylinder at a quarter wave, rounded
 * as in the sources, in ohms, ohms per radian and their powers.
 */

/** The reactive terminal function less the cosine-weighted one, 30 Si(2π). */
const A0 = 42.545;
/** Minus the sine-weighted function, 60 (2 − Cin π). */
const B0 = 21.13;
/** Minus the slope of A0's function, 60 (2 + ln 4 − Cin 2π). */
const A1 = 56.93;
/** The slope of the sine-weighted function, 240/π. */
const B1 = 76.39;
/** a₁ − 2b₀. */
const C0 = 14.67;
/**
 * The value of the sources, Leeson's book and the routine of the ARRL. The
 * product that defines it, b₀a₁ + a₀b₁, gives 4452.94: the difference makes
 * the diameter about 1.67/W larger, which moves a resonance by next to
 * nothing, and the published examples were computed with 4253.
 */
const C1 = 4253;
/** a₀b₀b₁. */
const C2 = 68673;

/** Every quantity of the method for a half element, for checking it step by step. */
export interface Terms {
  /** The half-length. */
  h: number;
  /** The logarithmic mean radius. */
  rho: number;
  /** The average characteristic impedance, in ohms. */
  W: number;
  /** The four taper sums, in ohms. */
  U: number;
  V: number;
  dU: number;
  dV: number;
  /** The sine-weighted function at a quarter wave. */
  g: number;
  /** The reactance at the quarter-wave frequency, in ohms, and its slope, in ohms per radian. */
  xi: number;
  sigma: number;
  /** The resonant frequency over the quarter-wave frequency. */
  kappa: number;
  /** The same quantities of the equivalent cylinder. */
  xiE: number;
  F: number;
  sigmaE: number;
  WE: number;
  /** The half-length and the radius of the equivalent cylinder. */
  hE: number;
  rE: number;
}

/**
 * The quantities of the method for a half element given from its centre
 * outwards, in one unit of length; the results are in the same unit. No
 * input is checked here.
 */
export function leesonTerms(half: Section[]): Terms {
  const h = half.reduce((sum, section) => sum + section.length, 0);
  const lnRho = half.reduce((sum, section) => sum + section.length * Math.log(section.radius), 0) / h;
  const W = 120 * (Math.log(2 * h) - lnRho - 1);

  let [U, V, dU, dV] = [0, 0, 0, 0];
  let s0 = 0;
  for (const { length, radius } of half) {
    const s1 = s0 + length;
    const epsilon = Math.log(radius) - lnRho;
    const [phi0, phi1] = [(Math.PI * s0) / h, (Math.PI * s1) / h];
    U += epsilon * (Math.sin(phi1) - Math.sin(phi0));
    V -= epsilon * (Math.cos(phi1) - Math.cos(phi0));
    dU += epsilon * (s1 * Math.cos(phi1) - s0 * Math.cos(phi0));
    dV += epsilon * (s1 * Math.sin(phi1) - s0 * Math.sin(phi0));
    s0 = s1;
  }
  [U, V, dU, dV] = [60 * U, 60 * V, (120 / h) * dU, (120 / h) * dV];

  const g = -B0 + V;
  const xi = (A0 - U) * (1 - g / W);
  const sigma = W - 2 * g - (1 - g / W) * (A1 + dU) - (xi / W) * (B1 + dV);
  const kappa = 1 - (2 * xi) / (Math.PI * sigma);

  // The cylinder's own impedance is taken as that of the element in the corrections, as in the book.
  const xiE = A0 * (1 + B0 / W);
  const F = 1 - (2 * (xi - xiE)) / (Math.PI * sigma);
  const sigmaE = F * sigma;
  const hE = h / F;
  const WE = sigmaE + C0 + C1 / W + C2 / (W * W);
  const rE = 2 * hE * Math.exp(-WE / 120 - 1);
  return { h, rho: Math.exp(lnRho), W, U, V, dU, dV, g, xi, sigma, kappa, xiE, F, sigmaE, WE, hE, rE };
}

/** The half-length and the radius of a cylinder. */
export interface Cylinder {
  halfLength: number;
  radius: number;
}

/**
 * The cylinder that is equivalent near resonance to a symmetric element of
 * round tubes, given as its half from the centre outwards. An element of one
 * section is its own cylinder. Returns `null` for input that has no meaning
 * (no length, a length below zero, a radius of zero or below) and when the
 * method gives no thin cylinder: such an element is far outside what it is
 * made for.
 */
export function equivalentCylinder(half: Section[]): Cylinder | null {
  if (half.length === 0) return null;
  if (!half.every(({ length, radius }) => Number.isFinite(length) && length >= 0 && Number.isFinite(radius) && radius > 0)) return null;
  const h = half.reduce((sum, section) => sum + section.length, 0);
  if (!(h > 0)) return null;
  if (half.length === 1) return { halfLength: half[0].length, radius: half[0].radius };
  const { F, WE, hE, rE } = leesonTerms(half);
  if (!(F > 0) || !(WE > 0) || !(rE > 0) || 10 * rE > hE) return null;
  return { halfLength: hE, radius: rE };
}
