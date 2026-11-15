import { describe, expect, it } from "vitest";
import { copyElement, copyShift, elementRows, removeWires, setCentre, setLength, setRadius, shortestLength } from "./elements";
import { defaultModel, type Model, type Wire } from "./model";
import { wavelength } from "./segmentation";

const tube = (x: number, y1: number, y2: number, radius = 0.01): Wire => ({ x1: x, y1, z1: 0, x2: x, y2, z2: 0, radius, segments: -1 });

describe("editing by elements", () => {
  const beam: Model = {
    ...defaultModel,
    // A tapered element at x = 0 and a plain one at x = 2.
    wires: [tube(0, -5, -1), tube(0, -1, 1, 0.015), tube(0, 1, 5), tube(2, -4.5, 4.5)],
    sources: [{ at: { wire: 1, place: "c" }, phase: 0, voltage: 1 }],
    loads: [{ kind: "rx", at: { wire: 3, place: "c" }, resistance: 10, reactance: 0 }],
  };

  it("finds the elements in the coordinates of the table of wires", () => {
    const rows = elementRows({ ...beam, height: 10 });
    expect(rows.map((row) => row.wires)).toEqual([[0, 1, 2], [3]]);
    expect(rows[0].centre).toEqual([0, 0, 0]);
    expect(rows[1].length).toBe(9);
  });

  it("removes wires with what stands on them, and keeps the rest on their wires", () => {
    const without = removeWires(beam, [0]);
    expect(without.wires).toHaveLength(3);
    expect(without.sources[0].at.wire).toBe(0);
    expect(without.loads[0].at.wire).toBe(2);
    const noLoad = removeWires(beam, [3]);
    expect(noLoad.loads).toEqual([]);
    expect(noLoad.sources).toEqual(beam.sources);
  });

  it("changes the length of an element about its centre, but not past the joints of its tubes", () => {
    expect(shortestLength(beam, 0)).toBe(2);
    expect(setLength(beam, 0, 1.5)).toBeNull();
    expect(setLength(beam, 0, 2)).toBeNull();
    const longer = setLength(beam, 1, 12)!;
    expect([longer.wires[0].y1, longer.wires[2].y2]).toEqual([-6, 6]);
    // The joints inside stay.
    expect(longer.wires[1]).toEqual(beam.wires[1]);
    // A wire alone may take any length.
    expect(shortestLength(beam, 3)).toBe(0);
    expect(setLength(beam, 3, 0.5)!.wires[3].y2).toBe(0.25);
  });

  it("moves an element by its centre, and sets the radius of all its wires", () => {
    const moved = setCentre(beam, 3, "x", 2.5);
    expect([moved.wires[3].x1, moved.wires[3].x2]).toEqual([2.5, 2.5]);
    expect(setRadius(beam, [3], 0.002).wires.map((wire) => wire.radius)).toEqual([0.01, 0.015, 0.01, 0.002]);
  });

  it("puts a copy one spacing beyond the last parallel element, as a new director", () => {
    const rows = elementRows(beam);
    const shift = copyShift(beam, rows, rows[0]);
    expect(shift).toEqual([4, 0, 0]);
    const grown = copyElement(beam, rows[0].wires, shift);
    expect(grown.wires).toHaveLength(7);
    expect(grown.wires.slice(4).map((wire) => [wire.x1, wire.y1, wire.y2])).toEqual([
      [4, -5, -1],
      [4, -1, 1],
      [4, 1, 5],
    ]);
    expect(grown.sources).toEqual(beam.sources);
  });

  it("puts the copy of a lone element aside, level and across it", () => {
    const lone = { ...defaultModel };
    const rows = elementRows(lone);
    const shift = copyShift(lone, rows, rows[0]);
    expect(shift[0]).toBeCloseTo(0.15 * wavelength(lone.frequency), 12);
    expect(shift[1]).toBeCloseTo(0, 12);
    expect(shift[2]).toBe(0);
  });
});
