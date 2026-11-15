import { placedWires, type Marks, type Point } from "./geometry";
import { equivalentCylinder } from "./leeson";
import { loadImpedance } from "./loads";
import { pulseSegment, type Load, type Model, type Pulse, type Wire } from "./model";
import { joinEnds, layout, segmentCount, wavelength, wireLength } from "./segmentation";
import { taperedElements, type TaperedElement } from "./taper";
import { decimal, t } from "./i18n";

/** Steps of the pattern in degrees. Over a ground only the upper half is computed, on a finer grid. */
export const PHI_STEP = 5;
export const THETA_STEP_FREE = 5;
export const THETA_STEP_GROUND = 2;

export interface Deck {
  /** The cards for the engine. */
  text: string;
  /** The number of segments of every wire. */
  segments: number[];
  /** Where the sources and the loads sit; `null` when the model cannot be divided into segments. */
  marks: Marks | null;
  /**
   * For every source the segments that it sits in, numbered over the whole
   * structure as the engine reports its sources; empty when the model cannot
   * be computed. A source on the joint of two wires sits in two.
   */
  feeds: number[][];
  /** Why the model cannot be computed, in the language of the user; empty if it can. */
  errors: string[];
  /** What the user should know about the model. */
  warnings: string[];
  /** The elements of tubes that the engine gets as Leeson's equivalent cylinders. */
  equivalents: Equivalent[];
}

/** An element of tubes of several diameters that the engine gets as one uniform wire, Leeson's equivalent cylinder. */
export interface Equivalent {
  /** Its wires in the model, by index from 0. */
  wires: number[];
  /** The tag of the wire that replaces them in the cards. */
  tag: number;
  /** The outer ends of the element in the model; the wire that replaces it points from the first to the second. */
  ends: [Point, Point];
  /** The length and the radius of the wire that replaces them, in metres. */
  length: number;
  radius: number;
  /** The segments of that wire. */
  segments: number;
}

const number = (value: number): string => String(Number(value.toPrecision(10)));

/** A height in metres within this of zero is the ground itself: the noise of a sum of two numbers. */
const ON_GROUND = 1e-9;

/** The most segments of a model: the engine of the page solves no more equations. */
export const MAX_SEGMENTS = 3000;

/** The most points that a sweep may have. */
export const MAX_SWEEP_POINTS = 201;

/**
 * The joints where two wires of different radii go on in one line, as the
 * tubes of a tapered Yagi element, by the numbers of the wires from 1. NEC-2
 * is known to be inaccurate at such steps. The ends of joined wires must be
 * exactly one point, as `joinEnds` makes them.
 */
function radiusSteps(wires: Model["wires"]): [number, number][] {
  const ends = (wire: Model["wires"][number]): Point[] => [
    [wire.x1, wire.y1, wire.z1],
    [wire.x2, wire.y2, wire.z2],
  ];
  const direction = (wire: Model["wires"][number]): Point => {
    const length = wireLength(wire);
    return [(wire.x2 - wire.x1) / length, (wire.y2 - wire.y1) / length, (wire.z2 - wire.z1) / length];
  };
  const steps: [number, number][] = [];
  wires.forEach((a, i) => {
    wires.forEach((b, j) => {
      if (j <= i || Math.abs(a.radius - b.radius) <= 0.01 * Math.max(a.radius, b.radius)) return;
      const joined = ends(a).some((p) => ends(b).some((q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2]));
      if (!joined) return;
      const [u, v] = [direction(a), direction(b)];
      if (Math.abs(Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) - 1) < 1e-6) steps.push([i + 1, j + 1]);
    });
  });
  return steps;
}

/** Leeson's method is made for elements near resonance: between these lengths in wavelengths. */
const LEESON_RANGE: [number, number] = [0.4, 0.6];

const shapesOnly = (): string => t("Поправка Лісона діє лише на прямі елементи, симетричні щодо центру.");

const endsOf = (wire: Wire): [Point, Point] => [
  [wire.x1, wire.y1, wire.z1],
  [wire.x2, wire.y2, wire.z2],
];
const distance = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const middle = (p: Point, q: Point): Point => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];

/** Whether a point lies on the straight piece between two points, within a distance. */
function onPiece(point: Point, a: Point, b: Point, within: number): boolean {
  const axis: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const square = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  const t = Math.min(1, Math.max(0, ((point[0] - a[0]) * axis[0] + (point[1] - a[1]) * axis[1] + (point[2] - a[2]) * axis[2]) / square));
  return distance(point, [a[0] + t * axis[0], a[1] + t * axis[1], a[2] + t * axis[2]]) <= within;
}

/** Wire numbers from indices: "1–5" for a run, "1, 2, 7" otherwise. */
export function span(indices: number[], dash = "–"): string {
  const numbers = [...indices].sort((a, b) => a - b).map((index) => index + 1);
  const run = numbers.length > 2 && numbers.every((value, k) => k === 0 || value === numbers[k - 1] + 1);
  return run ? `${numbers[0]}${dash}${numbers.at(-1)}` : numbers.join(", ");
}

/** The point of a wire that a pulse names, if it names one without an offset. */
function pulsePoint(wires: Wire[], at: Pulse): Point | null {
  if ((at.offset ?? 0) !== 0) return null;
  const [start, end] = endsOf(wires[at.wire]);
  return at.place === "b" ? start : at.place === "e" ? end : middle(start, end);
}

/**
 * Why Leeson's method does not suit a tapered element, in words that follow
 * "because"; `null` when it suits. The method knows an unloaded straight
 * element near its resonance, fed at its centre or not at all.
 */
function obstacle({ sources, loads }: Model, wires: Wire[], element: TaperedElement, lambda: number): string | null {
  const members = new Set(element.wires);
  if (loads.some((load) => members.has(load.at.wire))) return t("на ньому стоїть навантаження");
  const [a, b] = element.ends;
  const length = distance(a, b);
  const fed = sources.filter((source) => members.has(source.at.wire));
  if (fed.length > 1) return t("на ньому кілька джерел");
  if (fed.length === 1) {
    const point = pulsePoint(wires, fed[0].at);
    if (!point || distance(point, middle(a, b)) > 1e-6 * length) return t("джерело стоїть не в центрі елемента");
  }
  if (wires.some((wire, index) => !members.has(index) && endsOf(wire).some((end) => onPiece(end, a, b, 1e-6 * length)))) {
    return t("до нього приєднано інші дроти");
  }
  const electrical = length / lambda;
  if (electrical < LEESON_RANGE[0] || electrical > LEESON_RANGE[1]) {
    return t("його довжина {length} λ: поправка розрахована на елементи довжиною 0,4–0,6 λ", { length: decimal(electrical.toFixed(2)) });
  }
  return null;
}

/** The wires that the engine gets, and how they stand for the wires of the model. */
interface Substitution {
  /** The wires of the model, with every corrected element replaced by one wire where its first wire was. */
  wires: Wire[];
  /** The number of the wire of the model that names each of them, from 1: its tag in the cards. */
  tags: number[];
  /** For every wire of the model, the wire of the engine that holds it. */
  holder: number[];
  /** Which wires of the model belong to a corrected element. */
  replaced: boolean[];
  /** The corrected elements: their wires and outer ends in the model, and the wire of the engine that replaces them. */
  chosen: { wires: number[]; ends: [Point, Point]; index: number }[];
  /** A place on the wires of the model as a place on the wires of the engine. */
  remap: (at: Pulse) => Pulse;
  /** What the user should know about the steps of radius that stay. */
  warnings: string[];
}

/**
 * Replaces every tapered element that Leeson's method suits by its
 * equivalent cylinder: one uniform wire with the same centre and axis. A
 * source of such an element is at its centre, and stays there.
 */
function substitute(model: Model, wires: Wire[], lambda: number): Substitution {
  const warnings: string[] = [];
  const steps = radiusSteps(wires);
  const candidates = taperedElements(wires);
  const words = (list: [number, number][]): string => {
    const more = list.length > 1 ? t(" і ще {count}", { count: list.length - 1 }) : "";
    return t("Труби різного діаметра стикуються на одній осі (дроти {a} і {b}{more}). NEC-2 на таких стиках неточний: резонанс елемента може зсунутися на відсотки.", {
      a: list[0][0],
      b: list[0][1],
      more,
    });
  };
  const chosen: { element: TaperedElement; wire: Wire }[] = [];
  if (!model.taperCorrection) {
    if (steps.length > 0) warnings.push(`${words(steps)} ${candidates.length > 0 ? t("Поправку Лісона, яка це виправляє, вимкнено.") : shapesOnly()}`);
  } else {
    const inside = new Set(candidates.flatMap((element) => element.wires));
    const outside = steps.filter(([a, b]) => !(inside.has(a - 1) && inside.has(b - 1)));
    if (outside.length > 0) warnings.push(`${words(outside)} ${shapesOnly()}`);
    for (const element of candidates) {
      const reason = obstacle(model, wires, element, lambda);
      const cylinder = reason ? null : equivalentCylinder(element.half);
      if (!cylinder) {
        warnings.push(
          t("Елемент з дротів {wires}: поправку Лісона не застосовано, бо {reason}. NEC-2 на стиках труб неточний: резонанс елемента може зсунутися на відсотки.", {
            wires: span(element.wires, "–"),
            reason: reason ?? t("метод не дає для нього тонкого циліндра"),
          }),
        );
        continue;
      }
      const [a, b] = element.ends;
      const length = distance(a, b);
      const centre = middle(a, b);
      const along = cylinder.halfLength / length;
      const offset: Point = [(b[0] - a[0]) * along, (b[1] - a[1]) * along, (b[2] - a[2]) * along];
      chosen.push({
        element,
        wire: {
          x1: centre[0] - offset[0],
          y1: centre[1] - offset[1],
          z1: centre[2] - offset[2],
          x2: centre[0] + offset[0],
          y2: centre[1] + offset[1],
          z2: centre[2] + offset[2],
          radius: cylinder.radius,
          segments: -1,
        },
      });
    }
  }

  const owner = new Map<number, number>();
  chosen.forEach(({ element }, k) => element.wires.forEach((wire) => owner.set(wire, k)));
  const work: Wire[] = [];
  const tags: number[] = [];
  const holder: number[] = [];
  const at: number[] = [];
  wires.forEach((wire, index) => {
    const k = owner.get(index);
    if (k === undefined) {
      holder[index] = work.length;
      work.push(wire);
      tags.push(index + 1);
      return;
    }
    if (at[k] === undefined) {
      // The wire of an element is named after its middle wire, the centre tube.
      const members = chosen[k].element.wires;
      at[k] = work.length;
      work.push(chosen[k].wire);
      tags.push(members[Math.floor(members.length / 2)] + 1);
    }
    holder[index] = at[k];
  });
  return {
    wires: work,
    tags,
    holder,
    replaced: wires.map((_, index) => owner.has(index)),
    chosen: chosen.map(({ element }, k) => ({ wires: element.wires, ends: element.ends, index: at[k] })),
    remap: (place) => (owner.has(place.wire) ? { wire: holder[place.wire], place: "c" } : { ...place, wire: holder[place.wire] }),
    warnings,
  };
}

/** What the cards of the structure are made of. */
interface Structure {
  /** The cards of the wires, the ground and the source. */
  cards: string[];
  segments: number[];
  /**
   * The loads that hold something, each with the tag and the segment that it
   * sits in and the part of it that sits there: a load on the joint of two
   * wires has a half in each.
   */
  loads: { load: Load; tag: number; segment: number; share: number }[];
  marks: Marks | null;
  feeds: number[][];
  errors: string[];
  warnings: string[];
  equivalents: Equivalent[];
}

/**
 * The cards of the structure, the ground and the source. The segments are
 * chosen for the frequency of the model, also when a sweep follows.
 */
function structure(model: Model): Structure {
  const { sources, loads, frequency, ground } = model;
  const placed = placedWires(model);
  const overGround = ground.kind !== "free";
  const touches = (z: number): boolean => overGround && Math.abs(z) < ON_GROUND;
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = (
    segments: number[] = [],
    cards: string[] = [],
    held: Structure["loads"] = [],
    marks: Marks | null = null,
    feeds: number[][] = [],
    equivalents: Equivalent[] = [],
  ): Structure => ({ cards, segments, loads: held, marks, feeds, errors, warnings, equivalents });
  // With one source the messages do not number it.
  const several = sources.length > 1;
  const sourceName = (index: number): string => (several ? t("джерело {n}", { n: index + 1 }) : t("джерело"));
  const sourceTitle = (index: number): string => (several ? t("Джерело {n}", { n: index + 1 }) : t("Джерело"));

  if (!(frequency > 0)) errors.push(t("Частота має бути більшою за нуль."));
  if (placed.length === 0) errors.push(t("У моделі немає жодного дроту."));
  if (sources.length === 0) errors.push(t("У моделі немає джерела."));
  sources.forEach(({ at }, index) => {
    if (at.wire >= placed.length) errors.push(t("{source} стоїть на дроті {wire}, якого немає.", { source: sourceTitle(index), wire: at.wire + 1 }));
  });
  if (sources.length > 0 && sources.every((source) => source.voltage === 0)) {
    errors.push(several ? t("Напруга всіх джерел дорівнює нулю: антену нічим не збуджено.") : t("Напруга джерела дорівнює нулю: антену нічим не збуджено."));
  }
  placed.forEach((wire, index) => {
    if (!(wireLength(wire) > 0)) errors.push(t("Дріт {wire} не має довжини.", { wire: index + 1 }));
    if (!(wire.radius > 0)) errors.push(t("Радіус дроту {wire} має бути більшим за нуль.", { wire: index + 1 }));
    if (overGround && (wire.z1 < -ON_GROUND || wire.z2 < -ON_GROUND)) errors.push(t("Дріт {wire} заходить під землю.", { wire: index + 1 }));
  });
  const lying = placed.flatMap((wire, index) => (touches(wire.z1) && touches(wire.z2) ? [index + 1] : []));
  if (lying.length > 0) {
    errors.push(
      lying.length === 1
        ? t("Дріт {wires} лежить на землі. Підніміть антену: поле «Додати висоту».", { wires: lying[0] })
        : t("Дроти {wires} лежать на землі. Підніміть антену: поле «Додати висоту».", { wires: lying.join(", ") }),
    );
  }
  if (ground.kind === "real" && !(ground.permittivity > 0 || ground.conductivity > 0)) {
    errors.push(t("Реальній землі потрібна діелектрична проникність або провідність."));
  }
  loads.forEach((load, index) => {
    if (load.at.wire >= placed.length) errors.push(t("Навантаження {load} стоїть на дроті {wire}, якого немає.", { load: index + 1, wire: load.at.wire + 1 }));
    if (load.kind === "lc" && (load.inductance < 0 || load.capacitance < 0 || load.q < 0)) {
      errors.push(t("Навантаження {load}: L, C і Q не можуть бути від'ємними.", { load: index + 1 }));
    }
  });
  if (model.wireConductivity < 0) errors.push(t("Провідність дротів не може бути від'ємною."));
  if (errors.length > 0) return result();
  const lambda = wavelength(frequency);
  const joined = joinEnds(placed);
  // Every tapered element that Leeson's method suits becomes one wire; the tags keep the numbers of the model.
  const { wires, tags, holder, replaced, chosen, remap, warnings: stepWarnings } = substitute(model, joined, lambda);
  warnings.push(...stepWarnings);
  /** Counts of the wires of the engine as counts of the wires of the model: a corrected element has none of its own. */
  const ofModel = (counts: number[]): number[] => joined.map((_, index) => (replaced[index] ? 0 : counts[holder[index]]));
  const equivalents = (counts: number[]): Equivalent[] =>
    chosen.map(({ wires: members, ends, index }) => ({
      wires: members,
      tag: tags[index],
      ends,
      length: wireLength(wires[index]),
      radius: wires[index].radius,
      segments: counts[index],
    }));

  // The sources and the loads, with the words that the messages use for them.
  const pulses = [
    ...sources.map(({ at }, index) => ({ at: remap(at), name: sourceName(index), title: sourceTitle(index) })),
    ...loads.map((load, index) => ({ at: remap(load.at), name: t("навантаження {n}", { n: index + 1 }), title: t("Навантаження {n}", { n: index + 1 }) })),
  ];
  // The regular segments of every wire. The segments that the engine gets can be more: a load has short ones around it.
  const counts = wires.map((wire, index) =>
    segmentCount(wire, frequency, pulses.some(({ at }) => at.wire === index && at.place === "c")),
  );
  if (counts.reduce((sum, count) => sum + count, 0) > MAX_SEGMENTS) {
    errors.push(t("Модель має {count} сегм., а програма рахує щонайбільше {most}.", { count: counts.reduce((sum, count) => sum + count, 0), most: MAX_SEGMENTS }));
    return result(ofModel(counts), [], [], null, [], equivalents(counts));
  }
  wires.forEach((wire, index) => {
    const length = wireLength(wire) / counts[index];
    if (length > lambda / 10) {
      warnings.push(t("Сегменти дроту {wire} довші за десяту частину хвилі: результат буде неточним.", { wire: tags[index] }));
    }
    if (length < 8 * wire.radius) {
      warnings.push(t("Сегменти дроту {wire} коротші за вісім радіусів: модель тонкого дроту тут неточна.", { wire: tags[index] }));
    }
  });
  if (ground.kind === "real") {
    wires.forEach((wire, index) => {
      if (touches(wire.z1) || touches(wire.z2)) {
        warnings.push(t("Дріт {wire} торкається реальної землі: таке заземлення NEC-2 рахує неточно.", { wire: tags[index] }));
      }
    });
  }
  for (const { at, name, title } of pulses) {
    const count = counts[at.wire];
    const segment = pulseSegment(at, count);
    if (segment < 1 || segment > count) {
      errors.push(t("{pulse} зсунуте за межі дроту {wire}: він має {count} сегм.", { pulse: title, wire: tags[at.wire], count }));
    } else if (at.place === "c" && count % 2 === 0) {
      warnings.push(t("Дріт {wire} має парну кількість сегментів: {pulse} стоїть не точно в центрі.", { wire: tags[at.wire], pulse: name }));
    }
  }
  if (errors.length > 0) return result(ofModel(counts), [], [], null, [], equivalents(counts));

  // The segments of the wires, and those that the sources and the loads sit in. Only a load asks for a short one.
  const { pieces, seats } = layout(
    wires,
    counts,
    pulses.map(({ at }, index) => ({ at, short: index >= sources.length })),
    lambda,
    (z) => ground.kind === "perfect" && touches(z),
  );
  const segments = pieces.map((ofWire) => ofWire.length);
  const total = segments.reduce((sum, count) => sum + count, 0);
  if (total > MAX_SEGMENTS) {
    errors.push(t("Модель має {count} сегм., а програма рахує щонайбільше {most}.", { count: total, most: MAX_SEGMENTS }));
    return result(ofModel(segments), [], [], null, [], equivalents(segments));
  }
  // The engine keeps one source in a segment: a second one there would replace the first without a word.
  const taken = new Map<string, number>();
  const clashes = new Set<string>();
  seats.slice(0, sources.length).forEach((ofSource, index) => {
    for (const seat of ofSource) {
      const key = `${seat.wire} ${seat.segment}`;
      const other = taken.get(key);
      if (other !== undefined && other !== index) clashes.add(t("Джерела {a} і {b} стоять в одному сегменті дроту {wire}.", { a: other + 1, b: index + 1, wire: tags[seat.wire] }));
      taken.set(key, index);
    }
  });
  if (clashes.size > 0) {
    errors.push(...clashes);
    return result(ofModel(segments), [], [], null, [], equivalents(segments));
  }
  const seated = loads.flatMap((load, index) => {
    if (load.kind === "lc" && load.inductance === 0 && load.capacitance === 0) {
      warnings.push(t("Навантаження {load} не має ні котушки, ні конденсатора: воно нічого не змінює.", { load: index + 1 }));
      return [];
    }
    const ofLoad = seats[sources.length + index];
    return ofLoad.map((seat) => ({ load, tag: tags[seat.wire], segment: seat.segment, share: 1 / ofLoad.length }));
  });

  // A point of a wire at a distance from its beginning. A wire end on the ground is joined to its image.
  const along = (index: number, distance: number): Point => {
    const wire = wires[index];
    const part = distance / wireLength(wire);
    const z = wire.z1 + (wire.z2 - wire.z1) * part;
    return [wire.x1 + (wire.x2 - wire.x1) * part, wire.y1 + (wire.y2 - wire.y1) * part, touches(z) ? 0 : z];
  };
  const onGround = wires.some((wire) => touches(wire.z1) || touches(wire.z2));
  const cards = [
    `CM ${model.name.replace(/\s+/g, " ").trim() || "antenna-modeler"}`,
    ...chosen.map(
      ({ wires: members, index }) =>
        `CM Leeson equivalent of wires ${span(members, "-")}: length ${number(wireLength(wires[index]))} m, radius ${number(wires[index].radius)} m`,
    ),
    "CE",
  ];
  wires.forEach((wire, index) => {
    // Segments of one length in a row make one card; the cards of a wire share its tag.
    const lengths = pieces[index];
    let [first, from] = [0, 0];
    while (first < lengths.length) {
      let last = first;
      while (last + 1 < lengths.length && Math.abs(lengths[last + 1] - lengths[first]) < 1e-9 * lengths[first]) last++;
      const run = lengths.slice(first, last + 1).reduce((sum, length) => sum + length, 0);
      const to = last + 1 === lengths.length ? wireLength(wire) : from + run;
      const ends = [...along(index, from), ...along(index, to)].map(number).join(" ");
      cards.push(`GW ${tags[index]} ${last - first + 1} ${ends} ${number(wire.radius)}`);
      [first, from] = [last + 1, to];
    }
  });
  cards.push(`GE ${onGround ? 1 : 0}`);
  if (ground.kind === "perfect") cards.push("GN 1");
  if (ground.kind === "real") cards.push(`GN 2 0 0 0 ${number(ground.permittivity)} ${number(ground.conductivity)}`);
  // A source on the joint of two wires is two sources in series, half the voltage each.
  // A source without voltage is a plain segment, and the engine gets no card for it.
  sources.forEach((source, index) => {
    if (source.voltage === 0) return;
    const radians = (source.phase * Math.PI) / 180;
    const tidy = (value: number): number => (Math.abs(value) < 1e-12 * Math.abs(source.voltage) ? 0 : value);
    const [re, im] = [tidy(source.voltage * Math.cos(radians)), tidy(source.voltage * Math.sin(radians))];
    for (const seat of seats[index]) {
      const part = seat.sign / seats[index].length;
      cards.push(`EX 0 ${tags[seat.wire]} ${seat.segment} 0 ${number(re * part)} ${number(im * part)}`);
    }
  });
  // The engine numbers its sources over the whole structure.
  const before = segments.map((_, index) => segments.slice(0, index).reduce((sum, count) => sum + count, 0));
  const feeds = seats.slice(0, sources.length).map((ofSource) => ofSource.map((seat) => before[seat.wire] + seat.segment));

  // Where the pulses are: in the middle of the segment, or on the joint.
  const places = pulses.map(({ at }, index): Point => {
    const ofPulse = seats[index];
    if (ofPulse.length > 1) return along(at.wire, at.place === "b" ? 0 : wireLength(wires[at.wire]));
    const { wire, segment } = ofPulse[0];
    const before = pieces[wire].slice(0, segment - 1).reduce((sum, length) => sum + length, 0);
    return along(wire, before + pieces[wire][segment - 1] / 2);
  });
  return result(
    ofModel(segments),
    cards,
    seated,
    { sources: places.slice(0, sources.length), loads: places.slice(sources.length) },
    feeds,
    equivalents(segments),
  );
}

/**
 * The cards of the loss in the wires and of the loads at a frequency in MHz.
 * A group of these cards replaces the group before it.
 */
function loading(model: Model, { loads }: Structure, frequency: number): string[] {
  const cards: string[] = [];
  if (model.wireConductivity > 0) cards.push(`LD 5 0 0 0 ${number(model.wireConductivity)}`);
  for (const { load, tag, segment, share } of loads) {
    const impedance = loadImpedance(load, frequency);
    if (impedance) cards.push(`LD 4 ${tag} ${segment} ${segment} ${number(impedance[0] * share)} ${number(impedance[1] * share)}`);
  }
  return cards;
}

/**
 * The same loads for a deck that other programs will read: a coil or a
 * capacitor is written as such, so that the deck holds at other frequencies
 * too. The loss, which has no card of its own, is the resistance that the
 * quality factor gives at the frequency of the model.
 */
function lumped(model: Model, { loads }: Structure): string[] {
  const omega = 2 * Math.PI * model.frequency * 1e6;
  const cards: string[] = [];
  if (model.wireConductivity > 0) cards.push(`LD 5 0 0 0 ${number(model.wireConductivity)}`);
  for (const { load, tag, segment, share } of loads) {
    const at = `${tag} ${segment} ${segment}`;
    if (load.kind === "rx") {
      cards.push(`LD 4 ${at} ${number(load.resistance * share)} ${number(load.reactance * share)}`);
      continue;
    }
    // A part of a load has that part of its coil and of its resistance, and a capacitor that much larger.
    const [henries, farads, q] = [load.inductance * 1e-6 * share, (load.capacitance * 1e-12) / share, load.q];
    if (henries > 0 && farads > 0) {
      // In parallel: the coil with its loss in series becomes the coil and the resistor that stand side by side.
      const resistance = q > 0 ? ((omega * henries) / q) * (1 + q * q) : 0;
      const inductance = q > 0 ? henries * (1 + 1 / (q * q)) : henries;
      cards.push(`LD 1 ${at} ${number(resistance)} ${number(inductance)} ${number(farads)}`);
    } else if (henries > 0) {
      cards.push(`LD 0 ${at} ${number(q > 0 ? (omega * henries) / q : 0)} ${number(henries)} 0`);
    } else {
      cards.push(`LD 0 ${at} ${number(q > 0 ? 1 / (omega * farads * q) : 0)} 0 ${number(farads)}`);
    }
  }
  return cards;
}

const finish = ({ cards, segments, marks, feeds, errors, warnings, equivalents }: Structure, request: string[]): Deck => ({
  text: errors.length > 0 ? "" : [...cards, ...request, "EN"].join("\n") + "\n",
  segments,
  marks,
  feeds: errors.length > 0 ? [] : feeds,
  errors,
  warnings,
  equivalents,
});

/** The cards of the frequency of the model and of the pattern: the whole sphere, or its upper half over a ground. */
function request(model: Model): string[] {
  const free = model.ground.kind === "free";
  const thetaStep = free ? THETA_STEP_FREE : THETA_STEP_GROUND;
  const thetaCount = (free ? 180 : 90) / thetaStep + 1;
  return [`FR 0 1 0 0 ${number(model.frequency)} 0`, `RP 0 ${thetaCount} ${360 / PHI_STEP} 1000 0 0 ${thetaStep} ${PHI_STEP}`];
}

/** The deck for the frequency of the model, with its pattern. */
export function buildDeck(model: Model): Deck {
  const base = structure(model);
  return finish(base, [...loading(model, base, model.frequency), ...request(model)]);
}

/** The deck of `buildDeck` for other programs that read NEC cards. */
export function exportDeck(model: Model): Deck {
  const base = structure(model);
  return finish(base, [...lumped(model, base), ...request(model)]);
}

/** The deck for the input impedance at the frequency of the model alone: no pattern, no currents printed. */
export function buildImpedanceDeck(model: Model): Deck {
  const base = structure(model);
  return finish(base, ["PT -1", ...loading(model, base, model.frequency), `FR 0 1 0 0 ${number(model.frequency)} 0`, "XQ 0"]);
}

/** A direction of the far field: theta from the zenith and phi from the X axis, in degrees. */
export interface Direction {
  theta: number;
  phi: number;
}

/**
 * The deck for the sweep of the model: the impedance at every frequency.
 * Given a direction, the field at every frequency there and in the opposite
 * azimuth too, for the gain and the front-to-back ratio; no whole patterns,
 * which would make the sweep many times slower.
 */
export function buildSweepDeck(model: Model, toward?: Direction): Deck {
  const { from, to, points } = model.sweep;
  const base = structure(model);
  if (!(from > 0)) base.errors.push(t("Початок розгортки має бути більшим за нуль."));
  if (!(to > from)) base.errors.push(t("Кінець розгортки має бути більшим за початок."));
  if (!Number.isInteger(points) || points < 2 || points > MAX_SWEEP_POINTS) {
    base.errors.push(t("Розгортка має мати від 2 до {most} точок.", { most: MAX_SWEEP_POINTS }));
  }
  if (base.errors.length > 0) return finish(base, []);
  const step = (to - from) / (points - 1);
  const field = !toward
    ? "XQ 0"
    : toward.theta <= 0 || toward.theta >= 180
      ? `RP 0 1 1 1000 ${number(toward.theta)} ${number(toward.phi)} 0 0`
      : `RP 0 1 2 1000 ${number(toward.theta)} ${number(toward.phi)} 0 180`;
  // A coil or a capacitor has another impedance at every frequency: its
  // cards are written again for each one. Otherwise the engine steps itself.
  const steps = base.loads.some(({ load }) => load.kind === "lc")
    ? Array.from({ length: points }, (_, index) => from + index * step).flatMap((frequency) => [
        ...loading(model, base, frequency),
        `FR 0 1 0 0 ${number(frequency)} 0`,
        field,
      ])
    : [...loading(model, base, model.frequency), `FR 0 ${points} 0 0 ${number(from)} ${number(step)}`, field];
  // The currents are not printed: the report of a sweep would be long for nothing.
  return finish(base, ["PT -1", ...steps]);
}
