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


const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const length = (wire: Wire): number => distance(...ends(wire));

/** Wire ends closer than this part of the shorter wire are one point. */
const JOINED = 1e-6;

/** A wire of an element, and whether it runs against the element. */
export interface Link {
  wire: number;
  reversed: boolean;
}

/**
 * The wires that make one straight element with the wire `index`: wires in
 * one line joined end to end, in order from one end of the element to the
 * other. A wire that meets no other in its line is an element of its own.
 */
export function element(wires: Wire[], index: number): Link[] {
  const chain: Link[] = [{ wire: index, reversed: false }];
  const used = new Set([index]);
  const direction = (wire: Wire): Point => {
    const [a, b] = ends(wire);
    const size = distance(a, b);
    return [(b[0] - a[0]) / size, (b[1] - a[1]) / size, (b[2] - a[2]) / size];
  };
  const line = direction(wires[index]);
  /** The next wire in the line at a point, if exactly one goes on from there. */
  const following = (at: Point, from: number): Link | null => {
    const found: Link[] = [];
    wires.forEach((wire, other) => {
      if (used.has(other) || !(length(wire) > 0)) return;
      const [a, b] = ends(wire);
      const near = JOINED * Math.min(length(wire), length(wires[from]));
      const [atStart, atEnd] = [distance(a, at) <= near, distance(b, at) <= near];
      if (!atStart && !atEnd) return;
      const d = direction(wire);
      if (Math.abs(Math.abs(d[0] * line[0] + d[1] * line[1] + d[2] * line[2]) - 1) > 1e-6) return;
      found.push({ wire: other, reversed: atEnd });
    });
    return found.length === 1 ? found[0] : null;
  };
  const far = (link: Link): Point => ends(wires[link.wire])[link.reversed ? 0 : 1];
  const near = (link: Link): Point => ends(wires[link.wire])[link.reversed ? 1 : 0];
  // Onwards from the end of the wire, then backwards from its beginning.
  for (let next = following(far(chain[0]), index); next; next = following(far(chain.at(-1)!), chain.at(-1)!.wire)) {
    chain.push(next);
    used.add(next.wire);
  }
  for (let next = following(near(chain[0]), index); next; next = following(near(chain[0]), chain[0].wire)) {
    // Seen from the front of the chain, the wire is walked the other way.
    chain.unshift({ wire: next.wire, reversed: !next.reversed });
    used.add(next.wire);
  }
  return chain;
}
