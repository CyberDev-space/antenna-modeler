import { describe, expect, it } from "vitest";
import type { Wire } from "./model";
import { fill, joinEnds, layout, type Placed } from "./segmentation";

const wire = (ends: number[], segments = -1, radius = 0.001): Wire => {
  const [x1, y1, z1, x2, y2, z2] = ends;
  return { x1, y1, z1, x2, y2, z2, radius, segments };
};
const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
const near = (values: number[], expected: number[]) => {
  expect(values).toHaveLength(expected.length);
  values.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 10));
};
const noGround = () => false;

describe("filling a stretch of a wire", () => {
  it("cuts equal segments when nothing short is beside it", () => {
    near(fill(2.5, null, null, 1), [2.5 / 3, 2.5 / 3, 2.5 / 3]);
    near(fill(0.4, null, 1, 1), [0.4]);
    expect(fill(0, 0.1, null, 1)).toEqual([]);
  });

  it("starts beside a short segment with its length and doubles", () => {
    near(fill(2, 0.1, null, 1), [0.1, 0.2, 0.4, 0.8, 0.5]);
    near(fill(2, null, 0.1, 1), [0.5, 0.8, 0.4, 0.2, 0.1]);
    // Between two short segments the doubling meets in the middle.
    near(fill(1, 0.1, 0.1, 1), [0.1, 0.2, 0.4, 0.2, 0.1]);
  });

  it("gives what is too little for a segment to the segments that grew", () => {
    // The segment beside the given one keeps its length; the next one takes the rest.
    near(fill(0.32, 0.1, null, 1), [0.1, 0.22]);
  });

  it("always fills the stretch, and neighbours differ at most about twice", () => {
    for (const gap of [0.05, 0.3, 0.77, 1.5, 3.3, 10.01]) {
      for (const [left, right] of [[null, null], [0.1, null], [null, 0.05], [0.1, 0.05], [0.3, 0.3], [1, 0.1]] as const) {
        const pieces = fill(gap, left, right, 1);
        expect(sum(pieces)).toBeCloseTo(gap, 10);
        // A stretch shorter than the segments beside it cannot be graded.
        if (gap < Math.max(left ?? 0, right ?? 0)) continue;
        const row = [left ?? 1, ...pieces, right ?? 1];
        for (let i = 1; i < row.length; i++) {
          if (row[i - 1] === 1 || row[i] === 1) continue;
          expect(Math.max(row[i - 1], row[i]) / Math.min(row[i - 1], row[i])).toBeLessThan(2.6);
        }
      }
    }
  });
});

describe("the segments of the wires and the seats of the pulses", () => {
  // A wavelength of 40 m: a short segment is 0.1 m, a regular one of a 10 m wire in five is 2 m.
  const lambda = 40;
  const straight = wire([0, 0, 0, 10, 0, 0]);
  const at = (place: "b" | "c" | "e", short: boolean, wireIndex = 0, offset?: number): Placed => ({
    at: offset ? { wire: wireIndex, place, offset } : { wire: wireIndex, place },
    short,
  });

  it("gives a load a short segment with equal neighbours that double up to the regular length", () => {
    const { pieces, seats } = layout([straight], [5], [at("c", true)], lambda, noGround);
    const [ofWire] = pieces;
    expect(sum(ofWire)).toBeCloseTo(10, 10);
    expect(seats).toEqual([[{ wire: 0, segment: 7, sign: 1 }]]);
    near(ofWire.slice(4, 10), [0.2, 0.1, 0.1, 0.1, 0.2, 0.4]);
    // The same on both sides, so that the load stays at the centre.
    near(ofWire, [...ofWire].reverse());
  });

  it("keeps the regular segment for a source, and equal segments on a wire with a number of its own", () => {
    expect(layout([straight], [5], [at("c", false)], lambda, noGround)).toEqual({
      pieces: [[2, 2, 2, 2, 2]],
      seats: [[{ wire: 0, segment: 3, sign: 1 }]],
    });
    const own = layout([wire([0, 0, 0, 10, 0, 0], 5)], [5], [at("c", true)], lambda, noGround);
    expect(own.pieces).toEqual([[2, 2, 2, 2, 2]]);
  });

  it("puts a pulse that is offset from its place in the middle of its regular segment", () => {
    const { pieces, seats } = layout([straight], [5], [at("c", true, 0, 1)], lambda, noGround);
    const before = sum(pieces[0].slice(0, seats[0][0].segment - 1));
    expect(before + pieces[0][seats[0][0].segment - 1] / 2).toBeCloseTo(7, 10);
  });

  it("seats a pulse on the joint of two wires in the two segments that meet there", () => {
    const wires = [wire([0, 0, 0, 10, 0, 0]), wire([10, 0, 0, 10, 10, 0])];
    // A load: half a short segment on each side.
    const load = layout(wires, [5, 5], [at("e", true)], lambda, noGround);
    expect(load.seats).toEqual([[{ wire: 0, segment: load.pieces[0].length, sign: 1 }, { wire: 1, segment: 1, sign: 1 }]]);
    near([load.pieces[0].at(-1)!, load.pieces[1][0]], [0.05, 0.05]);
    // A source: half a regular segment on each side, so that the two make one.
    const source = layout(wires, [5, 5], [at("e", false)], lambda, noGround);
    near([source.pieces[0].at(-1)!, source.pieces[1][0]], [1, 1]);
    near(source.pieces[0], [2, 2, 2, 2, 1, 1]);
  });

  it("turns the half on a wire that points the other way", () => {
    const wires = [wire([0, 0, 0, 10, 0, 0]), wire([10, 10, 0, 10, 0, 0])];
    const { seats, pieces } = layout(wires, [5, 5], [at("e", false)], lambda, noGround);
    expect(seats).toEqual([[{ wire: 0, segment: 6, sign: 1 }, { wire: 1, segment: pieces[1].length, sign: -1 }]]);
  });

  it("keeps one regular segment where more wires meet, at a free end and on a real ground", () => {
    const radials = [wire([0, 0, 0, 0, 0, 10]), wire([0, 0, 0, 10, 0, 0]), wire([0, 0, 0, -10, 0, 0])];
    const star = layout(radials, [5, 5, 5], [at("b", true)], lambda, noGround);
    expect(star.seats).toEqual([[{ wire: 0, segment: 1, sign: 1 }]]);
    expect(star.pieces[0]).toEqual([2, 2, 2, 2, 2]);
    const free = layout([straight], [5], [at("b", true)], lambda, noGround);
    expect(free.pieces).toEqual([[2, 2, 2, 2, 2]]);
    const vertical = wire([0, 0, 0, 0, 0, 10]);
    expect(layout([vertical], [5], [at("b", true)], lambda, noGround).pieces).toEqual([[2, 2, 2, 2, 2]]);
  });

  it("gives a load on a perfect ground half a short segment, which the image makes whole", () => {
    const vertical = wire([0, 0, 0, 0, 0, 10]);
    const { pieces, seats } = layout([vertical], [5], [at("b", true)], lambda, (z) => z === 0);
    expect(seats).toEqual([[{ wire: 0, segment: 1, sign: 1 }]]);
    near(pieces[0].slice(0, 3), [0.05, 0.05, 0.1]);
    expect(sum(pieces[0])).toBeCloseTo(10, 10);
  });

  it("seats two pulses that ask for one regular segment in different ways in that whole segment", () => {
    const { pieces, seats } = layout([straight], [5], [at("c", false), at("c", true)], lambda, noGround);
    expect(pieces).toEqual([[2, 2, 2, 2, 2]]);
    expect(seats).toEqual([[{ wire: 0, segment: 3, sign: 1 }], [{ wire: 0, segment: 3, sign: 1 }]]);
  });

  it("makes no short segment shorter than eight radii", () => {
    const thick = wire([0, 0, 0, 10, 0, 0], -1, 0.025);
    const { pieces, seats } = layout([thick], [5], [at("c", true)], lambda, noGround);
    expect(pieces[0][seats[0][0].segment - 1]).toBeCloseTo(0.2, 10);
  });
});

describe("wire ends that are one point", () => {
  it("are made exactly one point, and other ends stay where they are", () => {
    const [first, second, third] = joinEnds([
      wire([0, 0, 0, 10, 0, 0]),
      wire([10 + 3e-9, 1e-9, 0, 10, 10, 0]),
      wire([10.5, 0, 0, 12, 0, 0]),
    ]);
    expect([second.x1, second.y1, second.z1]).toEqual([first.x2, first.y2, first.z2]);
    expect(third.x1).toBe(10.5);
  });
});
