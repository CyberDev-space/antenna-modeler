import { element, type Point } from "./geometry";
import type { Wire } from "./model";

/** A section of a half element: its length along the element and its radius, in metres. */
export interface Section {
  length: number;
  radius: number;
}

/** A straight element made of tubes of several radii, symmetric about its centre, as the elements of a Yagi. */
export interface TaperedElement {
  /** Its wires by index, from one end of the element to the other. */
  wires: number[];
  /** Its two outer ends, in the same order. */
  ends: [Point, Point];
  /** The sections of a half element from the centre outwards; the first is half of the centre tube. */
  half: Section[];
  /** Whether the outer ends are free: no other wire is joined to them. */
  free: boolean;
}

/** Radii closer than this part of the larger one are the same tube. */
const SAME_RADIUS = 0.01;

/** Lengths closer than this part of the element are the same. */
const SAME_LENGTH = 1e-6;

const ends = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const sameRadius = (a: number, b: number): boolean => Math.abs(a - b) <= SAME_RADIUS * Math.max(a, b);

/**
 * The elements of a model that are made of tubes of several radii and are
 * symmetric about their centre: the same tubes, in the same order, on both
 * sides. An element of one radius, or one whose tubes differ from side to
 * side, is not among them.
 */
export function taperedElements(wires: Wire[]): TaperedElement[] {
  const seen = new Set<number>();
  const found: TaperedElement[] = [];
  wires.forEach((_, index) => {
    if (seen.has(index)) return;
    const chain = element(wires, index);
    chain.forEach((link) => seen.add(link.wire));
    if (chain.length < 2) return;

    // The tubes along the element; joined pieces of one radius are one tube.
    const tubes: Section[] = [];
    for (const { wire } of chain) {
      const [a, b] = ends(wires[wire]);
      const piece = { length: distance(a, b), radius: wires[wire].radius };
      const last = tubes.at(-1);
      if (last && sameRadius(last.radius, piece.radius)) last.length += piece.length;
      else tubes.push(piece);
    }
    if (tubes.length < 2) return;
    const total = tubes.reduce((sum, tube) => sum + tube.length, 0);
    const symmetric =
      tubes.length % 2 === 1 &&
      tubes.every((tube, k) => {
        const mirror = tubes[tubes.length - 1 - k];
        return Math.abs(tube.length - mirror.length) <= SAME_LENGTH * total && sameRadius(tube.radius, mirror.radius);
      });
    if (!symmetric) return;

    const middle = (tubes.length - 1) / 2;
    const half = [{ length: tubes[middle].length / 2, radius: tubes[middle].radius }, ...tubes.slice(middle + 1)];
    const [first, last] = [chain[0], chain.at(-1)!];
    const outer: [Point, Point] = [ends(wires[first.wire])[first.reversed ? 1 : 0], ends(wires[last.wire])[last.reversed ? 0 : 1]];
    const members = new Set(chain.map((link) => link.wire));
    const near = SAME_LENGTH * total;
    const free = !wires.some((wire, other) => !members.has(other) && ends(wire).some((end) => outer.some((point) => distance(end, point) <= near)));
    found.push({ wires: chain.map((link) => link.wire), ends: outer, half, free });
  });
  return found;
}
