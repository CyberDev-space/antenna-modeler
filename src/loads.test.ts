import { describe, expect, it } from "vitest";
import { loadImpedance, resonance } from "./loads";
import type { Load } from "./model";

const lc = (inductance: number, capacitance: number, q = 0): Load => ({
  kind: "lc",
  at: { wire: 0, place: "c" },
  inductance,
  capacitance,
  q,
});

describe("the impedance of a load", () => {
  it("of a coil grows with the frequency, of a capacitor falls", () => {
    // 2π · 10 MHz · 10 µH = 628.3 Ω; a capacitor of 50 pF has 318.3 Ω there.
    const [r, x] = loadImpedance(lc(10, 0), 10)!;
    expect(r).toBe(0);
    expect(x).toBeCloseTo(628.3185, 3);
    expect(loadImpedance(lc(10, 0), 20)![1]).toBeCloseTo(1256.637, 3);
    expect(loadImpedance(lc(0, 50), 10)).toEqual([0, expect.closeTo(-318.3099, 3)]);
    expect(loadImpedance(lc(0, 50), 20)![1]).toBeCloseTo(-159.1549, 3);
  });

  it("has the loss that the quality factor gives, in series", () => {
    expect(loadImpedance(lc(10, 0, 200), 10)![0]).toBeCloseTo(3.141593, 5);
    expect(loadImpedance(lc(0, 50, 1000), 10)![0]).toBeCloseTo(0.3183099, 6);
  });

  it("of a trap is large at its resonance: a coil below it, a capacitor above", () => {
    const trap = lc(10, 50, 100);
    const at = resonance(trap)!;
    expect(at).toBeCloseTo(7.117625, 5);
    const [r, x] = loadImpedance(trap, at)!;
    // At the resonance the trap is a resistor of about Q times the reactance of its coil.
    expect(r).toBeCloseTo(100 * 2 * Math.PI * at * 10, -2);
    expect(Math.abs(x)).toBeLessThan(r / 50);
    expect(loadImpedance(trap, at / 2)![1]).toBeGreaterThan(0);
    expect(loadImpedance(trap, at * 2)![1]).toBeLessThan(0);
    // Without loss nothing passes at the resonance itself.
    const ideal = lc(10, 2533.029591058444);
    expect(resonance(ideal)).toBeCloseTo(1, 12);
    expect(loadImpedance(ideal, 0.5)![0]).toBe(0);
  });

  it("is the same at every frequency for a fixed one, and nothing for an empty one", () => {
    const fixed: Load = { kind: "rx", at: { wire: 0, place: "c" }, resistance: 50, reactance: -20 };
    expect(loadImpedance(fixed, 1)).toEqual([50, -20]);
    expect(loadImpedance(fixed, 30)).toEqual([50, -20]);
    expect(loadImpedance(lc(0, 0, 100), 10)).toBeNull();
    expect(resonance(fixed)).toBeNull();
    expect(resonance(lc(10, 0))).toBeNull();
  });
});
