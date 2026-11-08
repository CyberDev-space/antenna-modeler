import { describe, expect, it } from "vitest";
import { equivalentCylinder, leesonTerms } from "./leeson";
import type { Section } from "./taper";

/** A half element from its centre outwards, as length × diameter pairs. */
const half = (...pairs: [number, number][]): Section[] => pairs.map(([length, diameter]) => ({ length, radius: diameter / 2 }));

/** Equal to seven significant digits, as the vectors are given. */
const close = (actual: number, expected: number, label: string) => {
  expect(Math.abs(actual - expected), `${label}: ${actual} against ${expected}`).toBeLessThanOrEqual(2e-6 * Math.abs(expected) + 1e-12);
};

/** Lengths in metres, diameters in millimetres turned into metres. */
const metric = (...pairs: [number, number][]): Section[] => half(...pairs.map(([length, millimetres]): [number, number] => [length, millimetres / 1000]));

describe("Leeson's equivalent cylinder", () => {
  // The vectors of the specification: half-length and diameter of the cylinder, W and F.
  const vectors: [string, Section[], number, number, number, number][] = [
    ["T2", metric([2, 20], [3, 20]), 5, 20.04706e-3, 708.9306, 1],
    ["T3", metric([0.9, 30], [1.8, 25], [2.485, 20]), 5.088872, 23.40322e-3, 695.549, 1.01889],
    ["T4", metric([0.9, 30], [1.8, 25], [2.705, 20]), 5.306709, 23.21287e-3, 701.2577, 1.018522],
    ["T5", metric([0.9, 30], [1.8, 25], [2.195, 20]), 4.802262, 23.67456e-3, 687.5913, 1.019311],
    ["T6", metric([0.9, 30], [1.8, 25], [2.16, 20]), 4.767718, 23.70892e-3, 686.5949, 1.019356],
    ["T7", metric([0.01, 20], [0.49, 6]), 0.4974036, 5.996886e-3, 574.2076, 1.00522],
    ["T8", metric([1.2, 50], [1.8, 40], [1.8, 30], [1.8, 20], [3.6, 10]), 9.490327, 22.36087e-3, 787.6408, 1.074779],
    ["T9", metric([0.15, 80], [0.35, 50]), 0.4723194, 54.32837e-3, 305.7454, 1.058606],
    ["T10", metric([5, 20], [0, 10]), 5, 20.04706e-3, 708.9306, 1],
    ["T11", half([36, 0.875], [66, 0.75], [30, 0.625]), 130.0857, 0.7626797, 666.7409, 1.014716],
  ];

  it.each(vectors)("reproduces vector %s", (label, sections, halfLength, diameter, W, F) => {
    const cylinder = equivalentCylinder(sections)!;
    close(cylinder.halfLength, halfLength, `${label} half-length`);
    close(2 * cylinder.radius, diameter, `${label} diameter`);
    const terms = leesonTerms(sections);
    close(terms.W, W, `${label} W`);
    close(terms.F, F, `${label} F`);
  });

  it("leaves an element of one section as it is", () => {
    expect(equivalentCylinder(metric([5, 20]))).toEqual({ halfLength: 5, radius: 0.01 });
    // The book's cylinder of a half-length of 250 radii, which the raw formulas would make 0.27 % thicker.
    const sections = half([100, 0.8]);
    expect(equivalentCylinder(sections)).toEqual({ halfLength: 100, radius: 0.4 });
    // The slope of the general expression holds the product b₀a₁ + a₀b₁ itself: for a cylinder it is the
    // column of the consistent constant. Only the step to the diameter uses the constant of the sources.
    const terms = leesonTerms(sections);
    close(terms.W, 625.753, "W");
    close(terms.xi, 43.98163, "ξ");
    close(terms.sigma, 603.7915, "σ");
    close(1 - terms.kappa, 0.04637293, "1 − κ");
    close(2 * terms.rE, 0.802133, "raw diameter");
  });

  it("goes through the intermediate values of the specification", () => {
    // ρ, W, U, V, U′, V′, g, ξ, σ, κ, ξₑ, F, σₑ, Wₑ; ρ in millimetres.
    const steps: [string, Section[], number[]][] = [
      ["T3", metric([0.9, 30], [1.8, 25], [2.485, 20]), [11.59333, 695.549, 19.03425, -1.894796, 20.08069, 15.88398, -23.0248, 24.28903, 658.8164, 0.9765293, 43.83747, 1.01889, 671.2613, 692.1879]],
      ["T7", metric([0.01, 20], [0.49, 6]), [3.073115, 574.2076, 4.535885, -2.746989, 5.773368, 0.1814354, -23.87699, 39.58963, 551.3715, 0.9542894, 44.11059, 1.00522, 554.2497, 576.5347]],
      ["T8", metric([1.2, 50], [1.8, 40], [1.8, 30], [1.8, 20], [3.6, 10]), [10.58689, 787.6408, 80.06396, -0.04866483, 77.20046, 80.21828, -21.17866, -38.5278, 699.9217, 1.035043, 43.68635, 1.074779, 752.2608, 772.4412]],
      ["T9", metric([0.15, 80], [0.35, 50]), [28.78565, 305.7454, 22.81446, -5.295585, 26.86553, 13.68867, -26.42559, 21.43586, 261.2432, 0.9477633, 45.48528, 1.058606, 276.5535, 305.8684]],
    ];
    const names = ["ρ", "W", "U", "V", "U′", "V′", "g", "ξ", "σ", "κ", "ξₑ", "F", "σₑ", "Wₑ"];
    for (const [label, sections, expected] of steps) {
      const t = leesonTerms(sections);
      const actual = [t.rho * 1000, t.W, t.U, t.V, t.dU, t.dV, t.g, t.xi, t.sigma, t.kappa, t.xiE, t.F, t.sigmaE, t.WE];
      actual.forEach((value, i) => close(value, expected[i], `${label} ${names[i]}`));
    }
  });

  it("reproduces the worked examples of the book to seven digits", () => {
    // In inches. B1 to B4 are the examples of chapters 8 to 10, B6 to B10 the driven elements of chapter 11.
    const examples: [string, Section[], number, number][] = [
      ["B1", half([50, 0.8], [50, 0.4]), 95.69919, 0.593528],
      ["B2", half([2.925, 2.14], [41.875, 1.25], [46, 1.125], [50.5, 0.875], [24, 0.625], [53, 0.4375]), 207.2999, 0.8662438],
      ["B3", half([24, 0.875], [23.5, 0.625], [52.5, 0.4375]), 96.41251, 0.561713],
      ["B4", half([1, 0.875], [95, 0.75]), 95.96976, 0.7517883],
      ["B6", half([21.375, 0.875], [23.5, 0.625], [54, 0.4375]), 95.46824, 0.5496308],
      ["B7", half([21.375, 0.875], [23.5, 0.625], [53.65, 0.4375]), 95.12171, 0.5502704],
      ["B8", half([21.375, 0.875], [23.5, 0.625], [55.5, 0.4375]), 96.95398, 0.5469446],
      ["B9", half([60, 1.25], [16, 1.125], [32, 1.0], [34, 0.75], [61.3, 0.5]), 193.678, 0.8888491],
      ["B10", half([31.25, 1.25], [46, 1.125], [50.5, 0.875], [24, 0.625], [54.1, 0.4375]), 195.6817, 0.8350769],
    ];
    for (const [label, sections, halfLength, diameter] of examples) {
      const cylinder = equivalentCylinder(sections)!;
      close(cylinder.halfLength, halfLength, `${label} half-length`);
      close(2 * cylinder.radius, diameter, `${label} diameter`);
    }
    const b2 = leesonTerms(half([2.925, 2.14], [41.875, 1.25], [46, 1.125], [50.5, 0.875], [24, 0.625], [53, 0.4375]));
    close(b2.U, 52.56419, "B2 U");
    close(b2.V, 3.96448, "B2 V");
    close(b2.dU, 45.66347, "B2 U′");
    close(b2.dV, 59.48346, "B2 V′");
    close(b2.xi, -10.25895, "B2 ξ");
    close(b2.sigma, 648.5396, "B2 σ");
  });

  it("agrees with the numbers that the book prints", () => {
    // Half-length and diameter in inches, to the digits printed in the book.
    const printed: [Section[], number, number][] = [
      [half([50, 0.8], [50, 0.4]), 95.7, 0.594],
      [half([2.925, 2.14], [41.875, 1.25], [46, 1.125], [50.5, 0.875], [24, 0.625], [53, 0.4375]), 207.3, 0.866],
      [half([21.375, 0.875], [23.5, 0.625], [54, 0.4375]), 95.47, 0.55],
      [half([21.375, 0.875], [23.5, 0.625], [53.65, 0.4375]), 95.12, 0.55],
      [half([21.375, 0.875], [23.5, 0.625], [55.5, 0.4375]), 96.95, 0.547],
    ];
    for (const [sections, halfLength, diameter] of printed) {
      const cylinder = equivalentCylinder(sections)!;
      expect(cylinder.halfLength).toBeCloseTo(halfLength, 1);
      expect(Math.abs(2 * cylinder.radius - diameter)).toBeLessThanOrEqual(0.0005);
    }
  });

  it("does not depend on the unit of length", () => {
    const inches = equivalentCylinder(half([36, 0.875], [66, 0.75], [30, 0.625]))!;
    const metres = equivalentCylinder(half([36 * 0.0254, 0.875 * 0.0254], [66 * 0.0254, 0.75 * 0.0254], [30 * 0.0254, 0.625 * 0.0254]))!;
    close(metres.halfLength, inches.halfLength * 0.0254, "half-length");
    close(metres.radius, inches.radius * 0.0254, "radius");
  });

  it("refuses an element that has no meaning", () => {
    expect(equivalentCylinder([])).toBeNull();
    expect(equivalentCylinder(metric([1, 20], [-0.5, 10]))).toBeNull();
    expect(equivalentCylinder(metric([1, 20], [1, 0]))).toBeNull();
    expect(equivalentCylinder(metric([0, 20], [0, 10]))).toBeNull();
    // Far fatter than a thin element: no thin cylinder comes out.
    expect(equivalentCylinder(metric([0.05, 400], [0.05, 100]))).toBeNull();
  });
});
