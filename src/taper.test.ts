import { describe, expect, it } from "vitest";
import type { Wire } from "./model";
import { taperedElements } from "./taper";

const wire = (y1: number, y2: number, radius: number, x = 0, z = 0): Wire => ({ x1: x, y1, z1: z, x2: x, y2, z2: z, radius, segments: -1 });
const near = (values: number[], expected: number[]) => values.forEach((value, k) => expect(value).toBeCloseTo(expected[k], 9));

describe("the elements made of tubes", () => {
  // An element of the 4-element Yagi of the library of MMANA: 1.8 m of 30 mm at the centre, 1.8 m of 25 mm on each side, 20 mm to the tips.
  const element = [wire(-5.185, -2.7, 0.01), wire(-2.7, -0.9, 0.0125), wire(-0.9, 0.9, 0.015), wire(0.9, 2.7, 0.0125), wire(2.7, 5.185, 0.01)];

  it("are found with the tubes of a half element from the centre outwards", () => {
    const [found] = taperedElements(element);
    expect(found.wires).toEqual([0, 1, 2, 3, 4]);
    near(found.half.map((section) => section.length), [0.9, 1.8, 2.485]);
    expect(found.half.map((section) => section.radius)).toEqual([0.015, 0.0125, 0.01]);
    expect(found.free).toBe(true);
    expect(found.ends).toEqual([
      [0, -5.185, 0],
      [0, 5.185, 0],
    ]);
  });

  it("count joined pieces of one radius as one tube, whatever way the pieces point", () => {
    // The centre tube cut in two at the feed point, the second half pointing back.
    const cut = [element[0], element[1], wire(-0.9, 0, 0.015), wire(0.9, 0, 0.015), element[3], element[4]];
    const [found] = taperedElements(cut);
    near(found.half.map((section) => section.length), [0.9, 1.8, 2.485]);
    expect(found.wires).toHaveLength(6);
  });

  it("leave out elements of one radius, elements that differ from side to side, and every other element in turn", () => {
    expect(taperedElements([wire(-5, 0, 0.001), wire(0, 5, 0.001)])).toEqual([]);
    expect(taperedElements([wire(-5, -1, 0.01), wire(-1, 1, 0.015), wire(1, 4, 0.01)])).toEqual([]);
    expect(taperedElements([wire(-5, -1, 0.01), wire(-1, 1, 0.015), wire(1, 5, 0.012)])).toEqual([]);
    // Two elements side by side, one of them tapered.
    const beam = [...element, wire(-5, 5, 0.01, 2)];
    expect(taperedElements(beam).map((found) => found.wires)).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("say when another wire is joined to an outer end", () => {
    const hung = [...element, { x1: 0, y1: 5.185, z1: 0, x2: 0, y2: 5.185, z2: -2, radius: 0.001, segments: -1 }];
    expect(taperedElements(hung)[0].free).toBe(false);
  });
});
