import { readFile } from "node:fs/promises";
import init, { run } from "nec2-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { band, summarize, sweepPoints } from "./analysis";
import { buildDeck, buildSweepDeck, exportDeck } from "./deck";
import { importMaa } from "./maa";
import { COPPER, defaultModel, type Load, type Model } from "./model";

// The page runs the engine in a worker; here it runs in the test itself.
beforeAll(async () => {
  const wasm = await readFile(new URL(import.meta.resolve("nec2-wasm/nec2_bg.wasm")));
  await init({ module_or_path: wasm });
});

function solveModel(model: Model) {
  const deck = buildDeck(model);
  expect(deck.errors).toEqual([]);
  const output = run(deck.text);
  expect(output.error).toBeNull();
  return summarize(output.jobs[0].solutions[0], model.reference);
}

describe("the example through the engine", () => {
  it("is a dipole near resonance that radiates upwards at an angle", () => {
    const summary = solveModel(defaultModel);
    const [r, x] = summary.impedance;
    expect(r).toBeGreaterThan(60);
    expect(r).toBeLessThan(90);
    expect(Math.abs(x)).toBeLessThan(5);
    expect(summary.swr).toBeLessThan(1.6);
    // Half a wavelength above the ground: the lobe is at about 30 degrees, across the wire.
    expect(summary.gain).toBeGreaterThan(6);
    expect(summary.gain).toBeLessThan(9);
    expect(summary.elevation).toBeGreaterThanOrEqual(26);
    expect(summary.elevation).toBeLessThanOrEqual(34);
    expect([0, 180]).toContain(summary.azimuth);
    expect(Math.abs(summary.frontToBack!)).toBeLessThan(0.01);
    expect(summary.azimuthCut.angle).toHaveLength(72);
    expect(summary.elevationCut.angle).toHaveLength(91);
  });

  it("is swept through its resonance", () => {
    const deck = buildSweepDeck(defaultModel);
    const output = run(deck.text);
    expect(output.error).toBeNull();
    const points = sweepPoints(output.jobs[0].solutions, defaultModel.reference);
    expect(points).toHaveLength(23);
    expect(points[0].frequency).toBeCloseTo(13.6, 9);
    expect(points[22].frequency).toBeCloseTo(14.7, 9);
    // Capacitive below the resonance, inductive above it.
    expect(points[0].impedance[1]).toBeLessThan(-20);
    expect(points[22].impedance[1]).toBeGreaterThan(20);
    const found = band(points, 2);
    expect(Math.abs(found.best - defaultModel.frequency)).toBeLessThan(0.051);
    expect(found.swr).toBeLessThan(1.5);
    // The band where the SWR is below 2 lies inside the sweep.
    expect(found.open).toEqual([false, false]);
    expect(found.edges![1] - found.edges![0]).toBeGreaterThan(0.5);
  });

  it("in free space is the dipole of the textbook", () => {
    const summary = solveModel({ ...defaultModel, ground: { ...defaultModel.ground, kind: "free" } });
    expect(summary.gain).toBeGreaterThan(2.0);
    expect(summary.gain).toBeLessThan(2.3);
    expect(summary.elevation).toBe(0);
    expect(summary.elevationCut.angle).toHaveLength(72);
  });
});

describe("loads and loss through the engine", () => {
  // In free space, with segments of its own: the same structure at every frequency.
  const dipole: Model = {
    ...defaultModel,
    wires: [{ ...defaultModel.wires[0], segments: 21 }],
    ground: { ...defaultModel.ground, kind: "free" },
  };
  const impedance = (text: string): [number, number][] => {
    const output = run(text);
    expect(output.error).toBeNull();
    return output.jobs[0].solutions.map((solution) => solution.sources[0].impedance);
  };
  const expectSame = (one: [number, number], other: [number, number]) => {
    const size = Math.hypot(...other);
    expect(Math.abs(one[0] - other[0])).toBeLessThan(1e-6 * size);
    expect(Math.abs(one[1] - other[1])).toBeLessThan(1e-6 * size);
  };
  const loads: Load[] = [
    { kind: "lc", at: { wire: 0, place: "c", offset: 5 }, inductance: 4, capacitance: 0, q: 150 },
    { kind: "lc", at: { wire: 0, place: "c", offset: -5 }, inductance: 0, capacitance: 120, q: 800 },
    { kind: "lc", at: { wire: 0, place: "e", offset: 2 }, inductance: 8, capacitance: 30, q: 90 },
    { kind: "lc", at: { wire: 0, place: "b", offset: 2 }, inductance: 2, capacitance: 47, q: 0 },
  ];

  it("add an impedance in the segment of the source to the input impedance", () => {
    const [bare] = impedance(buildDeck(dipole).text);
    const load: Load = { kind: "rx", at: dipole.source, resistance: 10, reactance: 25 };
    const [loaded] = impedance(buildDeck({ ...dipole, loads: [load] }).text);
    expectSame(loaded, [bare[0] + 10, bare[1] + 25]);
  });

  it("give the same whether a coil is written as an impedance or as a coil", () => {
    const model = { ...dipole, loads };
    const [own] = impedance(buildDeck(model).text);
    const [portable] = impedance(exportDeck(model).text);
    expectSame(own, portable);
    // The loads do change the antenna.
    const [bare] = impedance(buildDeck(dipole).text);
    expect(Math.hypot(own[0] - bare[0], own[1] - bare[1])).toBeGreaterThan(20);
  });

  it("follow the frequency in a sweep", () => {
    const model: Model = { ...dipole, loads, sweep: { from: 13.9, to: 14.4, points: 6 } };
    const deck = buildSweepDeck(model);
    expect(deck.errors).toEqual([]);
    const swept = impedance(deck.text);
    expect(swept).toHaveLength(6);
    swept.forEach((point, index) => {
      const [alone] = impedance(buildDeck({ ...model, frequency: 13.9 + index * 0.1 }).text);
      expectSame(point, alone);
    });
  });

  it("take power away: in copper a little, in a poor coil much", () => {
    expect(solveModel(dipole).efficiency).toBe(1);
    const copper = solveModel({ ...dipole, wireConductivity: COPPER }).efficiency!;
    expect(copper).toBeGreaterThan(0.97);
    expect(copper).toBeLessThan(0.999);
    // A short dipole brought to resonance by a coil of low quality at its centre.
    const short: Model = { ...dipole, wires: [{ ...dipole.wires[0], y1: -2.5, y2: 2.5 }] };
    const [, reactance] = solveModel(short).impedance;
    expect(reactance).toBeLessThan(-300);
    const coil: Load = { kind: "lc", at: short.source, inductance: -reactance / (2 * Math.PI * short.frequency), capacitance: 0, q: 50 };
    const tuned = solveModel({ ...short, loads: [coil] });
    expect(Math.abs(tuned.impedance[1])).toBeLessThan(1e-6 * -reactance);
    expect(tuned.efficiency!).toBeGreaterThan(0.3);
    expect(tuned.efficiency!).toBeLessThan(0.8);
  });
});

// DP20.MAA, the dipole of the library of MMANA-GAL. The tutorial of NH7O
// prints what MMANA-GAL computes for it. In free space, without loss:
// 71.5 ohms, SWR 1.43, 2.13 dBi. Of copper wire, 20 m over a real ground:
// 78.6 ohms, SWR 1.61, 7.13 dBi at 14.9 degrees. MMANA computes the
// impedance over a perfect ground, whatever the ground of the pattern.
describe("the dipole of the library of MMANA through the engine", () => {
  const file = [
    "Dipole 20 m",
    "*",
    "14.05",
    "* Провода *",
    "1",
    "0.0,\t-5.17,\t0.0,\t0.0,\t5.17,\t0.0,\t0.001,\t-1",
    "*** Источ. ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "*** Нагрузка ***",
    "0,\t1",
    "*** Автосегм ***",
    "400,\t40,\t2.0,\t1",
    "*G/H/M/R/AzEl/X*",
    "0,\t20.0,\t0,\t50.0,\t120,\t60,\t0",
    "",
  ].join("\r\n");
  const { model } = importMaa(file, defaultModel);
  const raised = (kind: "perfect" | "real"): Model => ({ ...model, ground: { kind, permittivity: 13, conductivity: 0.005 }, wireConductivity: COPPER });

  it("gives in free space what MMANA gives", () => {
    const summary = solveModel(model);
    expect(Math.abs(summary.impedance[0] - 71.5)).toBeLessThan(0.5);
    expect(Math.abs(summary.swr - 1.43)).toBeLessThan(0.02);
    expect(Math.abs(summary.gain - 2.13)).toBeLessThan(0.03);
  });

  it("gives over a perfect ground the impedance of MMANA", () => {
    const summary = solveModel(raised("perfect"));
    expect(Math.abs(summary.impedance[0] - 78.6)).toBeLessThan(1);
    expect(Math.abs(summary.swr - 1.61)).toBeLessThan(0.02);
  });

  it("gives over a real ground the angle of MMANA, and an impedance that the ground has changed", () => {
    const summary = solveModel(raised("real"));
    expect(Math.abs(summary.elevation - 14.9)).toBeLessThan(0.2);
    expect(summary.impedance[0]).toBeGreaterThan(74);
    expect(summary.impedance[0]).toBeLessThan(76.5);
    // A little more than the 7.13 dBi of MMANA, which divides by the power that its perfect ground takes.
    expect(Math.abs(summary.gain - 7.37)).toBeLessThan(0.1);
  });
});
