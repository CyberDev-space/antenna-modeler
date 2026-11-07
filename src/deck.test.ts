import { describe, expect, it } from "vitest";
import { buildDeck, buildSweepDeck, exportDeck, segmentCount, wavelength } from "./deck";
import { defaultModel, formatPulse, parsePulse, type Load, type Model, type Wire } from "./model";

const wire = (change: Partial<Wire> = {}): Wire => ({ ...defaultModel.wires[0], ...change });

describe("the source in the notation of MMANA", () => {
  it("is read and written", () => {
    expect(parsePulse("w1c")).toEqual({ wire: 0, place: "c" });
    expect(parsePulse(" W12e ")).toEqual({ wire: 11, place: "e" });
    expect(formatPulse({ wire: 2, place: "b" })).toBe("w3b");
  });

  it("can be some segments away from its place", () => {
    expect(parsePulse("w3c1")).toEqual({ wire: 2, place: "c", offset: 1 });
    expect(parsePulse("w2c-2")).toEqual({ wire: 1, place: "c", offset: -2 });
    expect(parsePulse("w5e3")).toEqual({ wire: 4, place: "e", offset: 3 });
    expect(formatPulse({ wire: 1, place: "c", offset: -2 })).toBe("w2c-2");
    expect(formatPulse({ wire: 0, place: "b", offset: 0 })).toBe("w1b");
  });

  it("is refused when it is something else", () => {
    for (const text of ["", "w0c", "w1", "1c", "w1x", "w1cc", "w1b-1", "w1c1.5"]) expect(parsePulse(text)).toBeNull();
  });
});

describe("automatic segmentation", () => {
  it("aims at forty segments for a wavelength", () => {
    const lambda = wavelength(14.15);
    expect(segmentCount(wire({ y1: 0, y2: lambda }), 14.15, false)).toBe(40);
    expect(segmentCount(wire({ y1: 0, y2: lambda / 1000 }), 14.15, false)).toBe(1);
  });

  it("gives a wire that is fed at its centre an odd number", () => {
    expect(segmentCount(wire(), 14.15, false)).toBe(20);
    expect(segmentCount(wire(), 14.15, true)).toBe(21);
  });

  it("keeps the number that the user gave", () => {
    expect(segmentCount(wire({ segments: 8 }), 14.15, true)).toBe(8);
  });
});

describe("the deck of a model", () => {
  it("has the cards of the example", () => {
    const deck = buildDeck(defaultModel);
    expect(deck.errors).toEqual([]);
    expect(deck.warnings).toEqual([]);
    expect(deck.segments).toEqual([21]);
    expect(deck.text.split("\n")).toEqual([
      "CM Диполь на 20 м",
      "CE",
      "GW 1 21 0 -5.18 10 0 5.18 10 0.001",
      "GE 0",
      "GN 2 0 0 0 13 0.005",
      "EX 0 1 11 0 1 0",
      "FR 0 1 0 0 14.15 0",
      "RP 0 46 72 1000 0 0 2 5",
      "EN",
      "",
    ]);
  });

  it("follows the ground and the place of the source", () => {
    const monopole: Model = {
      ...defaultModel,
      wires: [wire({ y1: 0, z1: 0, y2: 0, z2: 5 }), wire({ segments: 10 })],
      source: { wire: 0, place: "b" },
      ground: { ...defaultModel.ground, kind: "perfect" },
    };
    const cards = buildDeck(monopole).text.split("\n");
    expect(cards).toContain("GE 1");
    expect(cards).toContain("GN 1");
    expect(cards).toContain("EX 0 1 1 0 1 0");

    const free = buildDeck({ ...defaultModel, ground: { ...defaultModel.ground, kind: "free" }, source: { wire: 0, place: "e" } });
    expect(free.text).not.toContain("GN");
    expect(free.text).toContain("EX 0 1 20 0 1 0");
    expect(free.text).toContain("RP 0 37 72 1000 0 0 5 5");
  });

  it("moves the source by segments and refuses a move off the wire", () => {
    const at = (place: "b" | "c" | "e", offset: number) =>
      buildDeck({ ...defaultModel, source: { wire: 0, place, offset } });
    expect(at("c", 2).text).toContain("EX 0 1 13 0 1 0");
    expect(at("c", -3).text).toContain("EX 0 1 8 0 1 0");
    expect(at("b", 1).text).toContain("EX 0 1 2 0 1 0");
    // A wire that is not fed at its centre has twenty segments here.
    expect(at("e", 1).text).toContain("EX 0 1 19 0 1 0");
    expect(at("c", 11).errors.join(" ")).toMatch(/за межі дроту 1: він має 21 сегм/);
    expect(at("e", 21).text).toBe("");
  });

  it("names what is wrong with a model", () => {
    const broken: Model = {
      ...defaultModel,
      wires: [wire({ y1: 1, y2: 1, radius: 0 }), wire({ z1: -1 })],
      source: { wire: 2, place: "c" },
      frequency: 0,
    };
    const { errors, text } = buildDeck(broken);
    expect(text).toBe("");
    expect(errors).toHaveLength(5);
    expect(errors.join(" ")).toMatch(/Частота.*дроті 3.*Дріт 1 не має довжини.*Радіус дроту 1.*Дріт 2 заходить під землю/);
  });

  it("adds the height of the model to every wire over a ground", () => {
    const lifted = buildDeck({ ...defaultModel, wires: [wire({ z1: 0, z2: 0 })], height: 7.5 });
    expect(lifted.errors).toEqual([]);
    expect(lifted.text).toContain("GW 1 21 0 -5.18 7.5 0 5.18 7.5 0.001");
    const free = buildDeck({ ...defaultModel, height: 7.5, ground: { ...defaultModel.ground, kind: "free" } });
    expect(free.text).toContain("GW 1 21 0 -5.18 10 0 5.18 10 0.001");
    // A height that brings a wire end down to the ground joins it to the ground.
    const sloper = buildDeck({ ...defaultModel, wires: [wire({ z1: 0.3, z2: 5 })], height: -0.1 - 0.2 });
    expect(sloper.errors).toEqual([]);
    expect(sloper.text).toContain("GW 1 23 0 -5.18 0 0 5.18 4.7 0.001\nGE 1");
  });

  it("refuses wires that lie on the ground and warns about a wire that touches a real one", () => {
    const flat = (count: number) =>
      buildDeck({ ...defaultModel, wires: Array.from({ length: count }, () => wire({ z1: 0, z2: 0 })) });
    expect(flat(1).errors).toEqual(["Дріт 1 лежить на землі. Підніміть антену: поле «Додати висоту»."]);
    expect(flat(3).errors).toEqual(["Дроти 1, 2, 3 лежать на землі. Підніміть антену: поле «Додати висоту»."]);
    const free = buildDeck({ ...defaultModel, wires: [wire({ z1: 0, z2: 0 })], ground: { ...defaultModel.ground, kind: "free" } });
    expect(free.errors).toEqual([]);

    const vertical: Model = { ...defaultModel, wires: [wire({ y1: 0, z1: 0, y2: 0, z2: 5 })], source: { wire: 0, place: "b" } };
    expect(buildDeck(vertical).warnings).toEqual(["Дріт 1 торкається реальної землі: таке заземлення NEC-2 рахує неточно."]);
    expect(buildDeck({ ...vertical, ground: { ...vertical.ground, kind: "perfect" } }).warnings).toEqual([]);
  });

  it("refuses a model with more segments than the engine of the page solves", () => {
    const large = buildDeck({ ...defaultModel, wires: [wire({ segments: 2999 }), wire({ x1: 1, x2: 1, segments: 2 })] });
    expect(large.errors).toEqual(["Модель має 3001 сегм., а програма рахує щонайбільше 3000."]);
    expect(large.text).toBe("");
    expect(large.segments).toEqual([2999, 2]);
  });

  it("for a sweep keeps the structure and asks for the frequencies without patterns", () => {
    const sweep = buildSweepDeck(defaultModel);
    expect(sweep.errors).toEqual([]);
    const cards = sweep.text.split("\n");
    expect(cards.slice(0, 6)).toEqual(buildDeck(defaultModel).text.split("\n").slice(0, 6));
    expect(cards.slice(6)).toEqual(["PT -1", "FR 0 23 0 0 13.6 0.05", "XQ 0", "EN", ""]);
  });

  it("refuses a sweep without a range", () => {
    const sweep = (change: Partial<Model["sweep"]>) =>
      buildSweepDeck({ ...defaultModel, sweep: { ...defaultModel.sweep, ...change } });
    expect(sweep({ to: 13.6 }).errors.join(" ")).toMatch(/Кінець розгортки/);
    expect(sweep({ from: 0 }).errors.join(" ")).toMatch(/Початок розгортки/);
    for (const points of [1, 202, 2.5]) expect(sweep({ points }).errors.join(" ")).toMatch(/від 2 до 201 точок/);
    expect(sweep({ points: 1 }).text).toBe("");
  });

  it("warns about segments that are too long, too short or leave the source off centre", () => {
    const coarse = buildDeck({ ...defaultModel, wires: [wire({ segments: 2 })] });
    expect(coarse.warnings).toHaveLength(2);
    expect(coarse.warnings[0]).toMatch(/довші за десяту частину хвилі/);
    expect(coarse.warnings[1]).toMatch(/парну кількість сегментів/);
    const thick = buildDeck({ ...defaultModel, wires: [wire({ radius: 0.1 })] });
    expect(thick.warnings.join(" ")).toMatch(/коротші за вісім радіусів/);
  });
});

describe("the loads of a model", () => {
  // The reactance in ohms of a coil in microhenries at a frequency in MHz, as a card holds it.
  const coilOhms = (frequency: number, microhenries: number): number =>
    Number((2 * Math.PI * frequency * microhenries).toPrecision(10));
  const coil: Load = { kind: "lc", at: { wire: 0, place: "c", offset: 3 }, inductance: 10, capacitance: 0, q: 0 };
  const resistor: Load = { kind: "rx", at: { wire: 0, place: "b" }, resistance: 50, reactance: -20 };
  const cards = (deck: { text: string }): string[] => deck.text.split("\n");

  it("become impedances at the frequency of the model, after the loss of the wires", () => {
    const deck = buildDeck({ ...defaultModel, wireConductivity: 5.8e7, loads: [coil, resistor] });
    expect(deck.errors).toEqual([]);
    expect(cards(deck).slice(5, 10)).toEqual([
      "EX 0 1 11 0 1 0",
      "LD 5 0 0 0 58000000",
      `LD 4 1 14 14 0 ${coilOhms(14.15, 10)}`,
      "LD 4 1 1 1 50 -20",
      "FR 0 1 0 0 14.15 0",
    ]);
  });

  it("give a wire that is loaded at its centre an odd number of segments", () => {
    const model: Model = {
      ...defaultModel,
      wires: [wire({ y1: 0, z1: 0.5, y2: 0, z2: 5 }), wire()],
      source: { wire: 0, place: "b" },
      loads: [{ ...coil, at: { wire: 1, place: "c" } }],
    };
    expect(buildDeck(model).segments).toEqual([9, 21]);
    expect(buildDeck({ ...model, loads: [] }).segments).toEqual([9, 20]);
  });

  it("are written again for every frequency of a sweep when they depend on it", () => {
    const sweep = { from: 14, to: 14.2, points: 3 };
    const stepped = buildSweepDeck({ ...defaultModel, sweep, loads: [coil] });
    expect(cards(stepped).slice(6)).toEqual([
      "PT -1",
      `LD 4 1 14 14 0 ${coilOhms(14, 10)}`,
      "FR 0 1 0 0 14 0",
      "XQ 0",
      `LD 4 1 14 14 0 ${coilOhms(14.1, 10)}`,
      "FR 0 1 0 0 14.1 0",
      "XQ 0",
      `LD 4 1 14 14 0 ${coilOhms(14.2, 10)}`,
      "FR 0 1 0 0 14.2 0",
      "XQ 0",
      "EN",
      "",
    ]);
    // A fixed impedance and the loss of the wires are the same cards at every frequency.
    const fixed = buildSweepDeck({ ...defaultModel, sweep, wireConductivity: 3.5e7, loads: [resistor] });
    expect(cards(fixed).slice(6)).toEqual(["PT -1", "LD 5 0 0 0 35000000", "LD 4 1 1 1 50 -20", "FR 0 3 0 0 14 0.1", "XQ 0", "EN", ""]);
  });

  it("are coils and capacitors in the deck for other programs", () => {
    const loads: Load[] = [
      { ...coil, q: 200 },
      { kind: "lc", at: { wire: 0, place: "e", offset: 1 }, inductance: 0, capacitance: 50, q: 0 },
      { kind: "lc", at: { wire: 0, place: "c", offset: -3 }, inductance: 10, capacitance: 50, q: 0 },
      resistor,
    ];
    const deck = exportDeck({ ...defaultModel, loads });
    expect(deck.errors).toEqual([]);
    expect(cards(deck).slice(6, 10)).toEqual([
      `LD 0 1 14 14 ${Number((coilOhms(14.15, 10) / 200).toPrecision(10))} 0.00001 0`,
      "LD 0 1 20 20 0 0 5e-11",
      "LD 1 1 8 8 0 0.00001 5e-11",
      "LD 4 1 1 1 50 -20",
    ]);
    expect(cards(deck).slice(10)).toEqual(cards(buildDeck(defaultModel)).slice(6));
  });

  it("are refused or warned about when they make no sense", () => {
    const at = (load: Load) => buildDeck({ ...defaultModel, loads: [load] });
    expect(at({ ...coil, at: { wire: 3, place: "c" } }).errors).toEqual(["Навантаження 1 стоїть на дроті 4, якого немає."]);
    expect(at({ ...coil, inductance: -1 }).errors).toEqual(["Навантаження 1: L, C і Q не можуть бути від'ємними."]);
    expect(at({ ...coil, at: { wire: 0, place: "e", offset: 30 } }).errors).toEqual([
      "Навантаження 1 зсунуте за межі дроту 1: він має 21 сегм.",
    ]);
    const empty = at({ ...coil, inductance: 0 });
    expect(empty.warnings).toEqual(["Навантаження 1 не має ні котушки, ні конденсатора: воно нічого не змінює."]);
    expect(empty.text).not.toContain("LD");
    const even = buildDeck({ ...defaultModel, wires: [wire({ segments: 20 })], source: { wire: 0, place: "b" }, loads: [{ ...coil, at: { wire: 0, place: "c" } }] });
    expect(even.warnings).toEqual(["Дріт 1 має парну кількість сегментів: навантаження 1 стоїть не точно в центрі."]);
    expect(buildDeck({ ...defaultModel, wireConductivity: -1 }).errors).toEqual(["Провідність дротів не може бути від'ємною."]);
  });
});
