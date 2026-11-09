import type { Pattern, Solution } from "nec2-wasm";
import { describe, expect, it } from "vitest";
import { band, bands, ports, summarize, swr, sweepPoints, type SweepPoint } from "./analysis";

/** A pattern on a grid of 30 degrees with a gain that the test chooses. */
function pattern(gain: (theta: number, phi: number) => number, thetaMax: number): Pattern {
  const columns: Pattern = {
    theta: [],
    phi: [],
    gainTotal: [],
    gainVertical: [],
    gainHorizontal: [],
    gainMajor: [],
    gainMinor: [],
    axialRatio: [],
    tilt: [],
    sense: [],
    eThetaMagnitude: [],
    eThetaPhase: [],
    ePhiMagnitude: [],
    ePhiPhase: [],
    averageGain: null,
  };
  for (let phi = 0; phi < 360; phi += 30) {
    for (let theta = 0; theta <= thetaMax; theta += 30) {
      columns.theta.push(theta);
      columns.phi.push(phi);
      columns.gainTotal.push(gain(theta, phi));
    }
  }
  return columns;
}

function solution(patternOfTest: Pattern, impedance: [number, number]): Solution {
  const port = { tag: 1, segment: 1, voltage: [1, 0], current: [0, 0], impedance, admittance: [0, 0], power: 0 };
  return {
    frequency: 14,
    incidentWave: null,
    sources: [port as Solution["sources"][number]],
    networkPorts: [],
    currents: [],
    power: { input: 2, radiated: 1.5, structureLoss: 0.5, networkLoss: 0 },
    patterns: [patternOfTest],
  };
}

describe("the standing-wave ratio", () => {
  it("is one on a matched line and grows with the mismatch", () => {
    expect(swr([50, 0], 50)).toBe(1);
    expect(swr([100, 0], 50)).toBeCloseTo(2, 12);
    expect(swr([25, 0], 50)).toBeCloseTo(2, 12);
    expect(swr([50, 50], 50)).toBeCloseTo(2.618, 3);
    expect(swr([0, 30], 50)).toBe(Infinity);
  });
});

describe("a sweep", () => {
  const point = (frequency: number, r: number): SweepPoint => ({ frequency, impedance: [r, 0], swr: swr([r, 0], 50), gain: null, frontToBack: null });
  // The SWR is 3, 2.5, 1.5, 1, 1.5, 2.5 at 14.0 to 14.5 MHz.
  const points = [150, 125, 75, 50, 75, 125].map((r, i) => point(14 + i / 10, r));

  it("has a point for every solution", () => {
    const solutions = [40, 50].map((r) => ({ ...solution(pattern(() => 0, 90), [r, 10]), frequency: r / 10 }));
    // A whole pattern gives no gain of a directed sweep.
    expect(sweepPoints(solutions, 50)).toEqual([
      { frequency: 4, impedance: [40, 10], swr: swr([40, 10], 50), gain: null, frontToBack: null },
      { frequency: 5, impedance: [50, 10], swr: swr([50, 10], 50), gain: null, frontToBack: null },
    ]);
  });

  it("reads the gain ahead and the front-to-back ratio of a directed sweep", () => {
    const directed = (gains: number[]) => {
      const field = pattern(() => 0, 0);
      return { ...solution({ ...field, theta: gains.map(() => 90), phi: gains.map((_, k) => 180 * k), gainTotal: gains }, [50, 0]), frequency: 14 };
    };
    expect(sweepPoints([directed([9.5, -12.5])], 50)[0]).toMatchObject({ gain: 9.5, frontToBack: 22 });
    // Straight up there is one direction only, and no front and back.
    expect(sweepPoints([directed([7])], 50)[0]).toMatchObject({ gain: 7, frontToBack: null });
  });

  it("finds the best point and the band around it", () => {
    const found = band(points, 2);
    expect([found.best, found.swr]).toEqual([14.3, 1]);
    // Halfway between the points with SWR 2.5 and 1.5 on either side.
    expect(found.edges![0]).toBeCloseTo(14.15, 10);
    expect(found.edges![1]).toBeCloseTo(14.45, 10);
    expect(found.open).toEqual([false, false]);
  });

  it("finds every band, as an antenna for several bands has", () => {
    // SWR 3, 1.5, 3, 3, 1.5, 1 at 14.0 to 14.5 MHz.
    const two = [150, 75, 150, 150, 75, 50].map((r, i) => point(14 + i / 10, r));
    const found = bands(two, 2);
    expect(found).toHaveLength(2);
    expect(found[0].edges[0]).toBeCloseTo(14.0 + 0.1 * (1 / 1.5), 10);
    expect(found[0].edges[1]).toBeCloseTo(14.1 + 0.1 * (0.5 / 1.5), 10);
    expect(found[0].open).toEqual([false, false]);
    expect(found[1].edges[1]).toBe(14.5);
    expect(found[1].open).toEqual([false, true]);
    expect(bands(two.slice(0, 1), 2)).toEqual([]);
    expect(bands(points.slice(2, 5), 2)).toEqual([{ edges: [14.2, 14.4], open: [true, true] }]);
  });

  it("says when the band reaches the end of the sweep or does not exist", () => {
    const wide = band(points.slice(2, 5), 2);
    expect(wide.edges).toEqual([14.2, 14.4]);
    expect(wide.open).toEqual([true, true]);
    expect(band(points.slice(0, 2), 2)).toEqual({ best: 14.1, swr: 2.5, edges: null, open: [false, false] });
  });
});

describe("the summary of a solution", () => {
  // A beam towards phi = 60 at 30 degrees of elevation, 12 dB weaker behind.
  const beam = (theta: number, phi: number): number => {
    if (theta === 0) return -3;
    if (theta === 90) return -999.99;
    return theta === 60 && phi === 60 ? 10 : phi === 240 ? -2 : 0;
  };
  const summary = summarize(solution(pattern(beam, 90), [40, -30]), 50);

  it("finds the maximum, its direction and the front-to-back ratio", () => {
    expect(summary.gain).toBe(10);
    expect([summary.azimuth, summary.elevation]).toEqual([60, 30]);
    expect(summary.frontToBack).toBe(12);
    expect(summary.impedance).toEqual([40, -30]);
    expect(summary.swr).toBeCloseTo(2, 10);
    expect(summary.efficiency).toBe(0.75);
  });

  it("cuts the pattern through the maximum", () => {
    expect(summary.azimuthCut.angle).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
    expect(summary.azimuthCut.gain[2]).toBe(10);
    expect(summary.azimuthCut.gain[8]).toBe(-2);
    // From the horizon in front over the zenith to the horizon behind.
    expect(summary.elevationCut.angle).toEqual([0, 30, 60, 90, 120, 150, 180]);
    expect(summary.elevationCut.gain).toEqual([-900, 10, 0, -3, -2, -2, -900]);
  });

  it("finds the top of a lobe between the points of the pattern", () => {
    // A lobe with its top of 10 dBi at 70 degrees from the zenith, on a grid of 30 degrees.
    const lobe = (theta: number, phi: number): number => (phi === 0 ? 10 - 9 * ((theta - 70) / 30) ** 2 : -20);
    const found = summarize(solution(pattern(lobe, 180), [50, 0]), 50);
    expect(found.gain).toBeCloseTo(10, 10);
    expect(found.elevation).toBeCloseTo(20, 10);
    // The cut against azimuth is made of the points of the grid.
    expect(found.cutElevation).toBe(30);
    expect(found.azimuthCut.gain[0]).toBe(9);
  });

  it("goes around the whole circle in free space and has no front straight up", () => {
    const up = summarize(solution(pattern((theta) => (theta === 0 ? 5 : 0), 180), [50, 0]), 50);
    expect([up.gain, up.elevation, up.frontToBack]).toEqual([5, 90, null]);
    expect(up.elevationCut.angle).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  });
});

describe("the sources of a solution", () => {
  const record = (segment: number, impedance: [number, number], power: number): Solution["sources"][number] =>
    ({ tag: 1, segment, voltage: [0.5, 0], current: [0, 0], impedance, admittance: [0, 0], power }) as Solution["sources"][number];
  // A source on a joint (segments 5 and 6), a source in segment 12, and a source without voltage in segment 20.
  const solved: Solution = {
    ...solution(pattern(() => 0, 90), [0, 0]),
    sources: [record(12, [30, -10], 0.004), record(5, [20, 5], 0.002), record(6, [22, 4], 0.0021)],
  };
  const feeds = [[5, 6], [12], [20]];

  it("are grouped as the model has them", () => {
    const found = ports(solved, 50, feeds);
    expect(found[0].impedance).toEqual([42, 9]);
    expect(found[0].power).toBeCloseTo(0.0041, 12);
    expect(found[0].swr).toBeCloseTo(swr([42, 9], 50), 12);
    expect(found[1]).toEqual({ impedance: [30, -10], swr: swr([30, -10], 50), power: 0.004 });
    expect(found[2]).toEqual({ impedance: null, swr: null, power: 0 });
  });

  it("give the screen the first source with a voltage, and the sweep the one that is asked for", () => {
    const summary = summarize(solved, 50, [[20], [12], [5, 6]]);
    expect(summary.ports).toHaveLength(3);
    expect(summary.impedance).toEqual([30, -10]);
    const sweep = [{ ...solved, frequency: 14 }];
    expect(sweepPoints(sweep, 50, feeds)[0].impedance).toEqual([42, 9]);
    expect(sweepPoints(sweep, 50, feeds, 1)[0].impedance).toEqual([30, -10]);
    expect(() => sweepPoints(sweep, 50, feeds, 2)).toThrow(/no voltage/);
  });
});
