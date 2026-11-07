import type { Model, Pulse, Wire } from "./model";

export type Point = [number, number, number];

/** The point of a wire at a fraction of its length from the first end. */
function along(wire: Wire, part: number): Point {
  return [
    wire.x1 + (wire.x2 - wire.x1) * part,
    wire.y1 + (wire.y2 - wire.y1) * part,
    wire.z1 + (wire.z2 - wire.z1) * part,
  ];
}

/** The wires where they stand: over a ground every wire is lifted by the height of the model. */
export function placedWires(model: Model): Wire[] {
  const lift = model.ground.kind === "free" ? 0 : model.height;
  return lift === 0 ? model.wires : model.wires.map((wire) => ({ ...wire, z1: wire.z1 + lift, z2: wire.z2 + lift }));
}

/** The points of a model that the view marks: its sources and its loads. */
export interface Marks {
  sources: Point[];
  loads: Point[];
}

/**
 * Where the sources and the loads of a model roughly are: at the beginning,
 * the centre or the end of their wires. This serves the view while the model
 * cannot be divided into segments; the deck of a sound model has the places
 * themselves. A pulse on a wire that does not exist has no mark.
 */
export function roughMarks(model: Model): Marks {
  const wires = placedWires(model);
  const point = (pulse: Pulse): Point | null => {
    const wire = wires[pulse.wire];
    return wire ? along(wire, pulse.place === "b" ? 0 : pulse.place === "e" ? 1 : 0.5) : null;
  };
  const points = (pulses: Pulse[]): Point[] =>
    pulses.flatMap((pulse) => {
      const at = point(pulse);
      return at ? [at] : [];
    });
  return { sources: points(model.sources.map((source) => source.at)), loads: points(model.loads.map((load) => load.at)) };
}

/** The distance from a point to the wire end that is farthest from it; 0 without wires. */
export function farthest(wires: Wire[], from: Point): number {
  const distance = (end: Point): number => Math.hypot(end[0] - from[0], end[1] - from[1], end[2] - from[2]);
  return Math.max(0, ...wires.flatMap((wire) => [distance(along(wire, 0)), distance(along(wire, 1))]));
}

/** The centre of the wire ends and the radius of the sphere around it that holds them all. */
export function bounds(wires: Wire[]): { centre: Point; radius: number } {
  const ends: Point[] = wires.flatMap((wire) => [along(wire, 0), along(wire, 1)]);
  if (ends.length === 0) return { centre: [0, 0, 0], radius: 1 };
  const centre = [0, 1, 2].map((axis) => {
    const values = ends.map((end) => end[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  }) as Point;
  const radius = Math.max(...ends.map((end) => Math.hypot(end[0] - centre[0], end[1] - centre[1], end[2] - centre[2])));
  return { centre, radius: radius > 0 ? radius : 1 };
}
