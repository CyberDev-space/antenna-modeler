import type { Point } from "./geometry";
import { pulseSegment, type Pulse, type Wire } from "./model";

/** Segments per wavelength that the automatic segmentation aims at. */
const SEGMENTS_PER_WAVELENGTH = 40;

/**
 * The segment of a load is this part of a wavelength long, like the shortest
 * segments of MMANA. A load takes the length of its segment: in a long one a
 * coil is a long coil, and the result moves away from that of a lumped one.
 */
const LOAD_SEGMENTS_PER_WAVELENGTH = 400;

/** No short segment is shorter than this many radii of its wire: the thin-wire model of NEC-2 asks for it. */
const RADII_PER_SEGMENT = 8;

/** Wire ends closer than this part of the shorter wire are one point. */
const JOINED = 1e-6;

/** Wire ends closer than this part of a segment are joined by the engine, even when they are not one point. */
const NEARLY_JOINED = 1e-3;

/** Wavelength in metres at a frequency in MHz. */
export function wavelength(frequency: number): number {
  return 299.792458 / frequency;
}

export function wireLength(wire: Wire): number {
  return Math.hypot(wire.x2 - wire.x1, wire.y2 - wire.y1, wire.z2 - wire.z1);
}

/**
 * The number of regular segments of a wire: its own, or about forty for a
 * wavelength. A wire with the source or a load at its centre gets an odd
 * number, so that the centre is the middle of a segment.
 */
export function segmentCount(wire: Wire, frequency: number, centred: boolean): number {
  if (wire.segments > 0) return Math.round(wire.segments);
  let count = Math.max(1, Math.ceil((wireLength(wire) * SEGMENTS_PER_WAVELENGTH) / wavelength(frequency)));
  if (centred && count % 2 === 0) count += 1;
  return count;
}

/**
 * Fills a stretch of a wire with segments. `left` and `right` are the lengths
 * of the segments that the stretch lies between, or `null` at an end of the
 * wire. Beside a segment that is shorter than the regular ones the first
 * segment has its length and the next ones double, as MMANA tapers them: the
 * engine is accurate only when the neighbours of a loaded segment are as
 * long as it is, and when the lengths change slowly.
 */
export function fill(gap: number, left: number | null, right: number | null, regular: number): number[] {
  const small = 1e-9 * regular;
  if (gap <= small) return [];
  const head: number[] = [];
  const tail: number[] = [];
  // The next length from either side; a side without a short segment gives none.
  let fromLeft = left !== null && left < regular - small ? left : Infinity;
  let fromRight = right !== null && right < regular - small ? right : Infinity;
  let rest = gap;
  for (;;) {
    const next = Math.min(fromLeft, fromRight);
    if (!(next < regular - small) || next > rest + small) break;
    if (fromLeft <= fromRight) {
      head.push(next);
      fromLeft *= 2;
    } else {
      tail.unshift(next);
      fromRight *= 2;
    }
    rest -= next;
  }
  if (rest <= small) return [...head, ...tail];

  const count = Math.max(1, Math.ceil(rest / regular - 1e-9));
  const split = [...head, ...Array<number>(count).fill(rest / count), ...tail];
  const grown = [...head, ...tail];
  if (grown.length === 0 || count > 1) return split;
  // What is left can be too little for a segment of its own: then the
  // segments that grew take it. Those beside the given segments keep their
  // length where others can stretch. Of the two ways, the one whose
  // neighbouring segments differ least is taken.
  const fixed = new Set([head.length > 0 ? 0 : -1, tail.length > 0 ? grown.length - 1 : -1]);
  const stretch = grown.some((_, index) => !fixed.has(index)) ? (index: number) => !fixed.has(index) : () => true;
  const stretched = grown.reduce((total, length, index) => total + (stretch(index) ? length : 0), 0);
  const absorbed = grown.map((length, index) => (stretch(index) ? length * (1 + rest / stretched) : length));
  const worst = (pieces: number[]): number => {
    const row = [...(left === null ? [] : [left]), ...pieces, ...(right === null ? [] : [right])];
    let ratio = 1;
    for (let i = 1; i < row.length; i++) ratio = Math.max(ratio, row[i] / row[i - 1], row[i - 1] / row[i]);
    return ratio;
  };
  return worst(absorbed) < worst(split) ? absorbed : split;
}

/**
 * The wires with the ends that are one point made exactly one point. The
 * engine joins two wire ends when they are close in proportion to the
 * segments there; the short segments around a load would make that
 * closeness too small for ends that differ in the last digits.
 */
export function joinEnds(wires: Wire[]): Wire[] {
  const lengths = wires.map(wireLength);
  const placed: { point: Point; wire: number }[] = [];
  return wires.map((wire, index) => {
    const snap = (point: Point): Point => {
      const found = placed.find(
        (end) =>
          Math.hypot(point[0] - end.point[0], point[1] - end.point[1], point[2] - end.point[2]) <=
          JOINED * Math.min(lengths[index], lengths[end.wire]),
      );
      const result = found ? found.point : point;
      placed.push({ point: result, wire: index });
      return result;
    };
    const [x1, y1, z1] = snap([wire.x1, wire.y1, wire.z1]);
    const [x2, y2, z2] = snap([wire.x2, wire.y2, wire.z2]);
    return { ...wire, x1, y1, z1, x2, y2, z2 };
  });
}

/** A stretch of a wire, in metres from its beginning, that must be one segment. */
interface Spot {
  /** The regular segment, from 1, that the stretch lies in. */
  cell: number;
  from: number;
  to: number;
}

/** A segment that the source or a load sits in. */
export interface Seat {
  /** Index of the wire, from 0, and the segment on it, from 1. */
  wire: number;
  segment: number;
  /** -1 when the segment points against the wire of the pulse where two wires meet. */
  sign: 1 | -1;
}

export interface Layout {
  /** For every wire the lengths of its segments in metres, from its beginning. */
  pieces: number[][];
  /** For every pulse the segments that it sits in: one, or two where two wires meet. */
  seats: Seat[][];
}

/** A pulse and whether it wants a short segment, as a load does. */
export interface Placed {
  at: Pulse;
  short: boolean;
}

type End = "b" | "e";

/**
 * Divides the wires into segments and seats the pulses.
 *
 * `counts` holds the number of regular segments of every wire, and every
 * pulse must fall on its wire. `imaged` tells whether a height is on a
 * perfect ground, whose image makes a segment there twice as long.
 *
 * A pulse sits in the regular segment that its place names. Three things differ:
 *
 * - At the end of a wire that meets exactly one other wire end, the pulse is
 *   on the joint itself, as in MMANA: it sits in the two segments that meet
 *   there, half in each. Each of the two is half as long as the segment of
 *   the pulse elsewhere, so that together they make one such segment across
 *   the joint.
 * - A load gets a short segment, with segments beside it that are as long
 *   and then double. A wire with a number of segments of its own keeps equal
 *   segments, and so does a joint of more than two wires, where the
 *   neighbours cannot be made equal.
 * - A load at the end of a wire on a perfect ground gets half a short
 *   segment, which its image makes whole. On a real ground it keeps the
 *   regular end segment: short segments at a real ground make the results of
 *   NEC-2 meaningless. At a free end the current is almost nothing; a load
 *   there keeps the regular end segment too, as MMANA puts no pulse there.
 */
export function layout(wires: Wire[], counts: number[], pulses: Placed[], lambda: number, imaged: (z: number) => boolean): Layout {
  const lengths = wires.map(wireLength);
  const regular = lengths.map((length, index) => length / counts[index]);
  const automatic = wires.map((wire) => wire.segments <= 0);
  const point = (wire: number, end: End): [number, number, number] =>
    end === "b" ? [wires[wire].x1, wires[wire].y1, wires[wire].z1] : [wires[wire].x2, wires[wire].y2, wires[wire].z2];
  /** The other wire ends at an end of a wire: those that are the same point, and whether more are nearly so. */
  const meeting = (wire: number, end: End): { joined: { wire: number; end: End }[]; loose: boolean } => {
    const here = point(wire, end);
    const joined: { wire: number; end: End }[] = [];
    let loose = false;
    wires.forEach((_, other) => {
      for (const otherEnd of ["b", "e"] as const) {
        if (other === wire && otherEnd === end) continue;
        const there = point(other, otherEnd);
        const distance = Math.hypot(here[0] - there[0], here[1] - there[1], here[2] - there[2]);
        if (distance <= JOINED * Math.min(lengths[wire], lengths[other])) joined.push({ wire: other, end: otherEnd });
        else if (distance <= NEARLY_JOINED * Math.min(regular[wire], regular[other])) loose = true;
      }
    });
    return { joined, loose };
  };
  /** The shortest segment that the thin-wire model allows on these wires. */
  const thinnest = (...ofWires: number[]): number => RADII_PER_SEGMENT * Math.max(...ofWires.map((wire) => wires[wire].radius));
  /** The short segment of a load, or a part of it, on these wires; never longer than their regular segments. */
  const shortLength = (part: number, ...ofWires: number[]): number =>
    Math.min(...ofWires.map((wire) => regular[wire]), Math.max((part * lambda) / LOAD_SEGMENTS_PER_WAVELENGTH, thinnest(...ofWires)));

  // The stretches that the pulses ask for, by wire and regular segment.
  const spots = wires.map(() => new Map<number, Spot>());
  const ask = (wire: number, cell: number, from: number, to: number): void => {
    const whole: Spot = { cell, from: (cell - 1) * regular[wire], to: cell * regular[wire] };
    const known = spots[wire].get(cell);
    const same = known && Math.abs(known.from - from) < 1e-9 * regular[wire] && Math.abs(known.to - to) < 1e-9 * regular[wire];
    // A wire with segments of its own keeps them; two pulses that disagree share the whole regular segment.
    spots[wire].set(cell, !automatic[wire] || (known && !same) ? whole : { cell, from, to });
  };
  const atEnd = (wire: number, end: End, length: number): [number, number, number] =>
    end === "b" ? [1, 0, length] : [counts[wire], lengths[wire] - length, lengths[wire]];

  const cells = pulses.map(({ at, short }): { wire: number; cell: number; sign: 1 | -1 }[] => {
    const wire = at.wire;
    const end = !at.offset && at.place !== "c" ? at.place : null;
    if (end === null) {
      const cell = pulseSegment(at, counts[wire]);
      const length = short && automatic[wire] ? shortLength(1, wire) : regular[wire];
      const centre = (cell - 0.5) * regular[wire];
      ask(wire, cell, centre - length / 2, centre + length / 2);
      return [{ wire, cell, sign: 1 }];
    }
    const { joined, loose } = meeting(wire, end);
    if (joined.length === 1 && !loose) {
      // On the joint of two wires: a half in the end segment of each, and both as long.
      const other = joined[0];
      const shortest = Math.min(regular[wire], regular[other.wire]);
      const length = !(automatic[wire] && automatic[other.wire])
        ? shortest
        : short
          ? shortLength(0.5, wire, other.wire)
          : Math.min(shortest, Math.max(shortest / 2, thinnest(wire, other.wire)));
      ask(wire, ...atEnd(wire, end, length));
      ask(other.wire, ...atEnd(other.wire, other.end, length));
      return [
        { wire, cell: atEnd(wire, end, length)[0], sign: 1 },
        // The current goes on in its direction when one wire ends where the other begins.
        { wire: other.wire, cell: atEnd(other.wire, other.end, length)[0], sign: end !== other.end ? 1 : -1 },
      ];
    }
    // On a perfect ground the image is the neighbour. Where more wires meet, the neighbours cannot all be as short.
    const grounded = joined.length === 0 && !loose && imaged(point(wire, end)[2]);
    const length = short && automatic[wire] && grounded ? shortLength(0.5, wire) : regular[wire];
    ask(wire, ...atEnd(wire, end, length));
    return [{ wire, cell: atEnd(wire, end, length)[0], sign: 1 }];
  });

  // The segments of every wire, and for every regular segment with a spot the segment that it became.
  const became = wires.map(() => new Map<number, number>());
  const pieces = wires.map((_, wire): number[] => {
    const asked = [...spots[wire].values()].sort((a, b) => a.from - b.from);
    const whole = asked.every((spot) => Math.abs(spot.to - spot.from - regular[wire]) < 1e-9 * regular[wire]);
    if (whole) {
      for (const spot of asked) became[wire].set(spot.cell, spot.cell);
      return Array<number>(counts[wire]).fill(regular[wire]);
    }
    const lengthsOfSegments: number[] = [];
    let at = 0;
    let previous: number | null = null;
    for (const spot of asked) {
      const length = spot.to - spot.from;
      lengthsOfSegments.push(...fill(spot.from - at, previous, length, regular[wire]), length);
      became[wire].set(spot.cell, lengthsOfSegments.length);
      at = spot.to;
      previous = length;
    }
    lengthsOfSegments.push(...fill(lengths[wire] - at, previous, null, regular[wire]));
    return lengthsOfSegments;
  });

  return {
    pieces,
    seats: cells.map((ofPulse) => ofPulse.map(({ wire, cell, sign }) => ({ wire, segment: became[wire].get(cell)!, sign }))),
  };
}
