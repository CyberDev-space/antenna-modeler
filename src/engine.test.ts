import { readFile } from "node:fs/promises";
import init, { run } from "nec2-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import { band, summarize, sweepPoints } from "./analysis";
import { buildDeck, buildSweepDeck, exportDeck } from "./deck";
import { importMaa } from "./maa";
import { optimize, read } from "./optimizer";
import { leesonTerms } from "./leeson";
import { ALUMINIUM, COPPER, defaultModel, type Load, type Model, type Wire } from "./model";

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
    const load: Load = { kind: "rx", at: dipole.sources[0].at, resistance: 10, reactance: 25 };
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
    const coil: Load = { kind: "lc", at: short.sources[0].at, inductance: -reactance / (2 * Math.PI * short.frequency), capacitance: 0, q: 50 };
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

// The references come from the same models with very many equal segments:
// the trap dipole with 641/225/225 segments resonates at 7.055 and 3.585 MHz,
// and its resonance still moves by a few kilohertz with more; the loaded
// vertical with 1281 segments has 21.32 - j3.25 ohms. Before loads had short
// segments, the automatic segmentation gave 6.970 and 3.635 MHz, and
// 19.50 - j50.22 ohms.
describe("short segments around loads and pulses on joints through the engine", () => {
  const resonances = (model: Model, from: number, to: number): number[] => {
    const deck = buildSweepDeck({ ...model, sweep: { from, to, points: 51 } });
    expect(deck.errors).toEqual([]);
    const output = run(deck.text);
    expect(output.error).toBeNull();
    const points = sweepPoints(output.jobs[0].solutions, 50);
    const found: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (a.impedance[1] < 0 && b.impedance[1] >= 0) {
        found.push(a.frequency + ((0 - a.impedance[1]) / (b.impedance[1] - a.impedance[1])) * (b.frequency - a.frequency));
      }
    }
    return found;
  };
  const straight = (y1: number, y2: number, radius: number): Model["wires"][number] => ({ x1: 0, y1, z1: 0, x2: 0, y2, z2: 0, radius, segments: -1 });

  it("bring a trap dipole to the resonances of a fine model", () => {
    // W3DZZ for 80 and 40 m, as the library of MMANA has it: traps of 9.27 uH and 55 pF on the joints.
    const trap = (wire: number): Load => ({ kind: "lc", at: { wire, place: "b" }, inductance: 9.26615, capacitance: 55, q: 300 });
    const model: Model = {
      ...defaultModel,
      wires: [straight(-10.3, 10.3, 0.0015), straight(10.3, 17.55, 0.0015), straight(-10.3, -17.55, 0.0015)],
      loads: [trap(1), trap(2)],
      frequency: 7.04,
      ground: { ...defaultModel.ground, kind: "free" },
    };
    const [forty] = resonances(model, 6.9, 7.2);
    expect(Math.abs(forty - 7.05)).toBeLessThan(0.015);
    const [eighty] = resonances(model, 3.5, 3.7);
    expect(Math.abs(eighty - 3.585)).toBeLessThan(0.01);
  });

  it("make the loaded vertical of the tutorial almost resonant, as MMANA does", () => {
    const loaded: Model = {
      ...defaultModel,
      wires: [{ x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 5.19, radius: 0.001, segments: -1 }],
      sources: [{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }],
      loads: [{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 20, capacitance: 0, q: 100 }],
      frequency: 7.05,
      ground: { ...defaultModel.ground, kind: "perfect" },
      wireConductivity: COPPER,
    };
    const [r, x] = solveModel(loaded).impedance;
    expect(Math.abs(r - 21.32)).toBeLessThan(0.5);
    expect(Math.abs(x - -3.25)).toBeLessThan(1.5);
  });

  it("feed a dipole of two wires on their joint as a dipole of one wire", () => {
    const one: Model = { ...defaultModel, wires: [straight(-5.17, 5.17, 0.001)], frequency: 14.05, ground: { ...defaultModel.ground, kind: "free" } };
    const two: Model = { ...one, wires: [straight(-5.17, 0, 0.001), straight(0, 5.17, 0.001)], sources: [{ at: { wire: 0, place: "e" }, phase: 0, voltage: 1 }] };
    const [single, joined] = [solveModel(one).impedance, solveModel(two).impedance];
    expect(Math.abs(single[0] - joined[0])).toBeLessThan(0.5);
    expect(Math.abs(single[1] - joined[1])).toBeLessThan(0.5);
  });
});

// HB9CV of the library of MMANA: two elements fed 135 degrees apart. Its
// phasing gives a deep null behind, which the longer rear element alone,
// a reflector, does not; the other sign of the phase loses it.
describe("a phased array through the engine", () => {
  const element = (x: number, half: number): Model["wires"][number] => ({ x1: x, y1: -half, z1: 0, x2: x, y2: half, z2: 0, radius: 0.01, segments: -1 });
  const hb9cv = (phase: number): Model => ({
    ...defaultModel,
    wires: [element(0, 4.945), element(-2.65, 5.31)],
    sources: [
      { at: { wire: 0, place: "c" }, phase: 0, voltage: 0.5 },
      { at: { wire: 1, place: "c" }, phase, voltage: 0.5 },
    ],
    frequency: 14.05,
    ground: { ...defaultModel.ground, kind: "free" },
  });
  const solveArray = (model: Model) => {
    const deck = buildDeck(model);
    expect(deck.errors).toEqual([]);
    const output = run(deck.text);
    expect(output.error).toBeNull();
    const solution = output.jobs[0].solutions[0];
    return { summary: summarize(solution, model.reference, deck.feeds), input: solution.power!.input };
  };

  it("beams forward with the deep null behind that its phasing gives", () => {
    const { summary, input } = solveArray(hb9cv(135));
    expect(summary.azimuth).toBe(0);
    expect(summary.frontToBack!).toBeGreaterThan(18);
    expect(summary.gain).toBeGreaterThan(6.2);
    expect(summary.gain).toBeLessThan(7.2);
    // Both sources give power, and together all of it.
    expect(summary.ports).toHaveLength(2);
    expect(summary.ports.every((port) => port.power > 0)).toBe(true);
    expect(summary.ports[0].power + summary.ports[1].power).toBeCloseTo(input, 12);
    const reversed = solveArray(hb9cv(-135)).summary;
    expect(summary.frontToBack! - reversed.frontToBack!).toBeGreaterThan(5);
  });
});

describe("the optimizer through the engine", () => {
  it("brings a dipole to resonance", async () => {
    const dipole: Model = { ...defaultModel, ground: { ...defaultModel.ground, kind: "free" } };
    const evaluate = async (model: Model) => {
      const deck = buildDeck(model);
      if (deck.errors.length > 0) return null;
      const output = run(deck.text);
      return output.error ? null : { summary: summarize(output.jobs[0].solutions[0], model.reference, deck.feeds) };
    };
    const length = { kind: "length", wire: 0, min: 9, max: 11.5, step: 0.1 } as const;
    const goals = { gain: 0, frontToBack: 0, swr: 0, reactance: 1, elevation: 0, target: 0 };
    const outcome = await optimize(dipole, [length], goals, evaluate, () => {}, () => false);
    expect(outcome.reason).toBe("converged");
    expect(Math.abs(outcome.evaluation.summary.impedance[1])).toBeLessThan(1);
    // A half-wave dipole of thin wire resonates a few percent short of half a wavelength.
    expect(read(outcome.model, length)).toBeGreaterThan(9.9);
    expect(read(outcome.model, length)).toBeLessThan(10.5);
  });
});

describe("Leeson's correction through the engine", () => {
  // The elements of the tapered 4-element Yagi for 20 m of the library of MMANA:
  // a centre tube of 1.8 m and 30 mm, a tube of 1.8 m and 25 mm on each side, then 20 mm.
  const element = (x: number, half: number): Wire[] => {
    const cuts = [-half, -2.7, -0.9, 0.9, 2.7, half];
    const radii = [0.01, 0.0125, 0.015, 0.0125, 0.01];
    return radii.map((radius, k) => ({ x1: x, y1: cuts[k], z1: 0, x2: x, y2: cuts[k + 1], z2: 0, radius, segments: -1 }));
  };
  const free = { ...defaultModel.ground, kind: "free" as const };
  const fed = [{ at: { wire: 2, place: "c" as const }, phase: 0, voltage: 1 }];

  it("gives the driven element the reactance that the method expects of it", () => {
    const driven: Model = { ...defaultModel, wires: element(0, 5.185), sources: fed, frequency: 14.05, ground: free };
    const reactance = (model: Model) => solveModel(model).impedance[1];
    const [corrected, stepped] = [reactance(driven), reactance({ ...driven, taperCorrection: false })];
    // The straight line of the method near resonance, with the velocity of light in vacuum, as NEC-2 has it.
    const terms = leesonTerms([{ length: 0.9, radius: 0.015 }, { length: 1.8, radius: 0.0125 }, { length: 2.485, radius: 0.01 }]);
    const quarterWave = 299.792458 / (4 * terms.h);
    const expected = (((Math.PI * terms.sigma) / 2) * (14.05 - terms.kappa * quarterWave)) / quarterWave;
    expect(Math.abs(corrected - expected)).toBeLessThan(Math.abs(stepped - expected) / 3);
  });

  it("brings the tapered Yagi of MMANA to resonance, where the steps make its driven element long in NEC-2", () => {
    const wires = [...element(0, 5.185), ...element(-2.95, 5.405), ...element(1.87, 4.895), ...element(4.94, 4.86)];
    const beam: Model = { ...defaultModel, wires, sources: fed, frequency: 14.05, ground: free, wireConductivity: ALUMINIUM };
    const corrected = solveModel(beam);
    const stepped = solveModel({ ...beam, taperCorrection: false });
    expect(stepped.impedance[1]).toBeGreaterThan(12);
    expect(Math.abs(corrected.impedance[1])).toBeLessThan(5);
    expect(corrected.frontToBack!).toBeGreaterThan(stepped.frontToBack! + 2);
  });
});
