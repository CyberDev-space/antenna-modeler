import { describe, expect, it } from "vitest";
import { hairpin, lNetworks, quarterWave, throughNetwork, throughQuarterWave, type Impedance } from "./matching";
import { swr } from "./analysis";

describe("an L network", () => {
  const loads: Impedance[] = [
    [25.3, 3.7], // the 4-element Yagi for 20 m
    [150, -40],
    [10, 80],
    [300, 0], // a folded dipole
    [12.5, -20],
  ];

  it.each(loads)("matches %d %+d ohms to 50 ohms in every solution it gives", (r, x) => {
    const networks = lNetworks([r, x], 50, 14.05);
    expect(networks.length).toBeGreaterThan(0);
    for (const network of networks) {
      const [rin, xin] = throughNetwork([r, x], network);
      expect(rin).toBeCloseTo(50, 9);
      expect(xin).toBeCloseTo(0, 9);
    }
  });

  it("gives two solutions with the shunt across the line for a resistance below the line's", () => {
    const networks = lNetworks([25, 0], 50, 14);
    const acrossLine = networks.filter((one) => one.shuntAt === "line");
    expect(acrossLine).toHaveLength(2);
    // A coil in series with a capacitor across, or a capacitor in series with a coil across: 25 ohms each way.
    expect(acrossLine.map((one) => [one.series!.kind, one.shunt!.kind]).sort()).toEqual([
      ["capacitor", "coil"],
      ["coil", "capacitor"],
    ]);
    for (const one of acrossLine) expect(Math.abs(one.series!.reactance)).toBeCloseTo(25, 9);
    for (const one of acrossLine) expect(Math.abs(one.shunt!.reactance)).toBeCloseTo(50, 9);
    // The values at 14 MHz: 25 ohms is 0.284 µH or 455 pF.
    const coil = acrossLine.find((one) => one.series!.kind === "coil")!.series!;
    expect(coil.value * 1e6).toBeCloseTo(25 / (2 * Math.PI * 14), 9);
  });

  it("needs only a series element when the resistance is already the line's", () => {
    const networks = lNetworks([50, 30], 50, 14);
    const lone = networks.filter((one) => one.shunt === null);
    expect(lone).toHaveLength(1);
    expect(lone[0].series!.kind).toBe("capacitor");
    expect(lone[0].series!.reactance).toBeCloseTo(-30, 9);
  });
});

describe("a hairpin match", () => {
  it("asks a capacitive element and a coil across it that bring 25 ohms to 50", () => {
    // 6 mm rods 50 mm apart on 20 m.
    const found = hairpin(25, 50, 14.05, 0.006, 0.05)!;
    expect(found.antennaReactance).toBeCloseTo(-25, 9);
    expect(found.reactance).toBeCloseTo(50, 9);
    expect(found.inductance * 1e6).toBeCloseTo(50 / (2 * Math.PI * 14.05), 9);
    expect(found.lineImpedance).toBeCloseTo(120 * Math.acosh(50 / 6), 9);
    // A shorted line of that impedance has the reactance of the coil at its length.
    const wavelength = 299.792458 / 14.05;
    expect(found.lineImpedance * Math.tan((2 * Math.PI * found.length) / wavelength)).toBeCloseTo(50, 9);
    expect(found.length).toBeGreaterThan(0.4);
    expect(found.length).toBeLessThan(0.6);
    // The element with that reactance and the hairpin across it make 50 ohms.
    const [g, b] = [25 / (25 * 25 + 25 * 25), 25 / (25 * 25 + 25 * 25)];
    const total: [number, number] = [g, b - 1 / found.reactance];
    expect(total[0] / (total[0] ** 2 + total[1] ** 2)).toBeCloseTo(50, 9);
    expect(total[1]).toBeCloseTo(0, 12);
  });

  it("does not match a resistance at or above the line's", () => {
    expect(hairpin(50, 50, 14, 0.006, 0.05)).toBeNull();
    expect(hairpin(70, 50, 14, 0.006, 0.05)).toBeNull();
  });
});

describe("a quarter-wave transformer", () => {
  it("of two 75-ohm cables in parallel brings the 20 m Yagi near 50 ohms", () => {
    const seen = throughQuarterWave([25.3, 3.7], 37.5);
    // 37.5² / (25.3 + j3.7)
    const size = 25.3 ** 2 + 3.7 ** 2;
    expect(seen[0]).toBeCloseTo((37.5 ** 2 * 25.3) / size, 12);
    expect(seen[1]).toBeCloseTo((-(37.5 ** 2) * 3.7) / size, 12);
    expect(swr(seen, 50)).toBeLessThan(1.2);
    // Of the ideal impedance it matches a resistance exactly.
    const ideal = Math.sqrt(25 * 50);
    expect(swr(throughQuarterWave([25, 0], ideal), 50)).toBeCloseTo(1, 12);
  });

  it("is a quarter of the wavelength in the cable long", () => {
    expect(quarterWave(14.05, 0.66)).toBeCloseTo((299.792458 / 14.05 / 4) * 0.66, 12);
  });
});
