import { describe, expect, it } from "vitest";
import { buildDeck } from "./deck";
import { exportMaa, importMaa } from "./maa";
import { ALUMINIUM, COPPER, defaultModel, type Model } from "./model";

// Files in the layout that MMANA writes: fields separated by a comma and a tab.
const yagi = [
  "Three elements for 2 m",
  "*",
  "145.0",
  "***Wires***",
  "3",
  "-0.41,\t-0.52,\t0.0,\t-0.41,\t0.52,\t0.0,\t0.003,\t-1",
  "0.0,\t-0.49,\t0.0,\t0.0,\t0.49,\t0.0,\t0.003,\t-1",
  "0.31,\t-0.457,\t0.0,\t0.31,\t0.457,\t0.0,\t0.003,\t21",
  "***Source***",
  "1,\t0",
  "w2c,\t0.0,\t1.0",
  "***Load***",
  "0,\t1",
  "***Segmentation***",
  "800,\t80,\t2.0,\t2",
  "***G/H/M/R/AzEl/X***",
  "0,\t5.0,\t1,\t50.0,\t120,\t60,\t0.0",
  "",
].join("\r\n");

const mixed = [
  "Low dipole with extras",
  "*",
  "7.05",
  "***Wires***",
  "4",
  "0.0,\t-10.0,\t0.0,\t0.0,\t10.0,\t0.0,\t8.0e-04,\t-1",
  "0.0,\t-10.0,\t0.0,\t0.0,\t-12.0,\t-1.0,\t0.0,\t-1",
  "0.0,\t10.0,\t0.0,\t0.0,\t12.0,\t-1.0,\t-1.0,\t0",
  "0.0,\t0.0,\t0.0,\t0.0,\t0.0,\t-3.0,\t8.0e-04,\t-2",
  "***Source***",
  "2,\t1",
  "w4b2,\t0.0,\t1.0",
  "w1c,\t90.0,\t1.0",
  "***Load***",
  "1,\t1",
  "w1c,\t0,\t0.03,\t0.0,\t0.0",
  "***Segmentation***",
  "400,\t40,\t2.0,\t1",
  "***G/H/M/R/AzEl/X***",
  "2,\t12.0,\t1,\t75.0,\t120,\t60,\t0.0",
  "### Comment ###",
  "anything",
].join("\n");

describe("an antenna file of MMANA", () => {
  it("says when its antenna is far too small for the frequency in it, and which frequency it fits", () => {
    // As a colleague sent it: a Yagi for 2 m that MMANA saved with the frequency of a new model.
    const saved = yagi.replace("Three elements for 2 m", "").replace("145.0", "14.15");
    const { model, notes } = importMaa(saved, defaultModel);
    expect(model.frequency).toBe(14.15);
    expect(notes.at(-1)).toMatch(/^Частота у файлі — 14,15 МГц, але розміри антени — для близько 14\d МГц: найдовший елемент, 1,04 м,/);
    // At its own frequency, and with a coil that makes it small on purpose, it gets no such note.
    expect(importMaa(yagi, defaultModel).notes.some((note) => note.startsWith("Частота у файлі"))).toBe(false);
    const loaded = saved.replace("0,\t1\r\n***Segmentation***", "1,\t1\r\nw1c,\t0,\t0.5,\t0.0,\t0.0\r\n***Segmentation***");
    expect(importMaa(loaded, defaultModel).notes.some((note) => note.startsWith("Частота у файлі"))).toBe(false);
  });

  it("gives the wires, the source, the frequency and the line", () => {
    const { model, notes } = importMaa(yagi, defaultModel);
    expect(model.name).toBe("Three elements for 2 m");
    expect(notes).toEqual(["Матеріал дротів у файлі має код 1: узято мідь."]);
    expect(model.wireConductivity).toBe(COPPER);
    expect(model.loads).toEqual([]);
    expect(model.frequency).toBe(145);
    expect(model.reference).toBe(50);
    expect(model.sources).toEqual([{ at: { wire: 1, place: "c" }, phase: 0, voltage: 1 }]);
    // Free space: the height of the file does not apply yet, and the ground of the page is kept for later.
    expect(model.ground).toEqual({ ...defaultModel.ground, kind: "free" });
    expect(model.height).toBe(5);
    expect(model.wires).toHaveLength(3);
    expect(model.wires[0]).toEqual({ x1: -0.41, y1: -0.52, z1: 0, x2: -0.41, y2: 0.52, z2: 0, radius: 0.003, segments: -1 });
    expect(model.wires[2].segments).toBe(21);
    // The sweep follows the frequency.
    expect(model.sweep).toEqual({ from: 139.4, to: 150.6, points: 23 });
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("keeps the height over a ground and says what it leaves out", () => {
    const { model, notes } = importMaa(mixed, defaultModel);
    expect(model.ground).toEqual({ kind: "real", permittivity: 13, conductivity: 0.005 });
    expect(model.reference).toBe(75);
    // The wire without a radius is an insulator and is left out; the others stand 12 m higher.
    expect(model.wires).toHaveLength(3);
    expect(model.wires.map((wire) => [wire.z1, wire.z2])).toEqual([[0, 0], [0, -1], [0, -3]]);
    expect(model.height).toBe(12);
    expect(buildDeck(model).text).toContain("GW 3 3 0 0 12 0 0 9 0.0008");
    expect(model.wires[1].radius).toBe(0.001);
    expect(model.wires.map((wire) => wire.segments)).toEqual([-1, -1, -1]);
    // The first source was on wire 4 of the file, which is now wire 3; the second has its phase.
    expect(model.sources).toEqual([
      { at: { wire: 2, place: "b", offset: 2 }, phase: 0, voltage: 1 },
      { at: { wire: 0, place: "c" }, phase: 90, voltage: 1 },
    ]);
    // The coil of the file sits at the centre of wire 1.
    expect(model.loads).toEqual([{ kind: "lc", at: { wire: 0, place: "c" }, inductance: 0.03, capacitance: 0, q: 0 }]);
    expect(notes).toHaveLength(4);
    expect(notes.join(" ")).toMatch(/Дріт 2 має радіус 0.*Дріт 3 має від'ємний радіус, але рядка для нього в таблиці труб немає.*середню землю.*код 1: узято мідь/);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("gives the loads of every kind that the program has", () => {
    const loaded = yagi
      .replace("0,\t1\r\n***Segmentation***", [
        "4,\t0",
        "w1c,\t0,\t3.3,\t0.0,\t250.0",
        "w2c-2,\t0,\t10.0,\t50.0,\t100.0",
        "w3e1,\t1,\t50.0,\t-12.5",
        "w3b,\t2,\t1.0,\t0.0,\t2.0e-11,\t0.0",
        "***Segmentation***",
      ].join("\r\n"))
      .replace("0,\t5.0,\t1,\t50.0", "1,\t5.0,\t4,\t50.0");
    const { model, notes } = importMaa(loaded, defaultModel);
    expect(model.loads).toEqual([
      { kind: "lc", at: { wire: 0, place: "c" }, inductance: 3.3, capacitance: 0, q: 250 },
      { kind: "lc", at: { wire: 1, place: "c", offset: -2 }, inductance: 10, capacitance: 50, q: 100 },
      { kind: "rx", at: { wire: 2, place: "e", offset: 1 }, resistance: 50, reactance: -12.5 },
    ]);
    expect(model.wireConductivity).toBe(ALUMINIUM);
    expect(model.ground.kind).toBe("perfect");
    expect(notes).toEqual([
      "Навантаження 4 (w3b) задане многочленом: такі ще не підтримуються, його пропущено.",
      "У файлі навантаження позначені вимкненими. Тут вони працюють: вилучіть зайві.",
      "Матеріал дротів у файлі має код 4: узято алюміній.",
    ]);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("tells the materials that it does not know or cannot model in full", () => {
    const material = (code: number) => importMaa(yagi.replace("0,\t5.0,\t1,\t50.0", `0,\t5.0,\t${code},\t50.0`), defaultModel);
    expect(material(0)).toMatchObject({ model: { wireConductivity: 0 }, notes: [] });
    expect(material(5).model.wireConductivity).toBe(1e7);
    expect(material(5).notes.join(" ")).toMatch(/залізо.*без магнітних властивостей/);
    expect(material(9)).toMatchObject({ model: { wireConductivity: 0 }, notes: ["Невідомий матеріал дротів у файлі (код 9): узято дроти без втрат."] });
  });

  it("is refused with a reason when it is something else or damaged", () => {
    expect(() => importMaa("CM a deck of NEC cards\nCE\nEN\n", defaultModel)).toThrow(/Це не файл антени MMANA/);
    expect(() => importMaa("Name\n*\nnot a frequency\n***Wires***\n", defaultModel)).toThrow(/частоту: «not a frequency»/);
    expect(() => importMaa("Name\n*\n14.1\n1\n0, 0, 0, 0, 0, 1, 0.001, -1\n", defaultModel)).toThrow(/Це не файл антени MMANA/);
    expect(() => importMaa(yagi.replace("145.0", "abc"), defaultModel)).toThrow(/частоту/);
    expect(() => importMaa(yagi.replace("0.003,\t21", "0.003"), defaultModel)).toThrow(/дріт 3/);
    expect(() => importMaa(yagi.replace("w2c", "w7c"), defaultModel)).toThrow(/джерело: «w7c»/);
    expect(() => importMaa(yagi.replace("0,\t5.0,\t1,\t50.0", "9,\t5.0,\t1,\t50.0"), defaultModel)).toThrow(/тип землі/);
    expect(() => importMaa(mixed.replace("w1c,\t0,\t0.03", "w9c,\t0,\t0.03"), defaultModel)).toThrow(/навантаження 1: «w9c/);
    expect(() => importMaa(mixed.replace("0.03,\t0.0,\t0.0", "0.03,\t,\t0.0"), defaultModel)).toThrow(/навантаження 1/);
  });
});

describe("a model written as a file of MMANA", () => {
  const model: Model = {
    ...defaultModel,
    name: "Трап-диполь  40/20",
    wires: [
      { x1: 0, y1: -10.2, z1: 0, x2: 0, y2: 10.2, z2: 0, radius: 0.0008, segments: -1 },
      { x1: 0, y1: 10.2, z1: 0, x2: 0, y2: 10.2, z2: -1.5, radius: 0.0008, segments: 7 },
    ],
    sources: [{ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }],
    loads: [
      { kind: "lc", at: { wire: 0, place: "c", offset: 6 }, inductance: 10, capacitance: 50, q: 150 },
      { kind: "rx", at: { wire: 1, place: "e" }, resistance: 470, reactance: -3.5 },
    ],
    frequency: 7.05,
    height: 12,
    wireConductivity: COPPER,
    reference: 75,
    sweep: { from: 6.9, to: 7.2, points: 31 },
  };

  it("has the lines of such a file", () => {
    const { text, notes } = exportMaa(model);
    expect(notes).toEqual(["Параметри реальної землі у файлі MMANA не зберігаються."]);
    expect(text.split("\r\n")).toEqual([
      "Трап-диполь 40/20",
      "*",
      "7.05",
      "***Wires***",
      "2",
      "0.0,\t-10.2,\t0.0,\t0.0,\t10.2,\t0.0,\t0.0008,\t-1",
      "0.0,\t10.2,\t0.0,\t0.0,\t10.2,\t-1.5,\t0.0008,\t7",
      "*** Source ***",
      "1,\t1",
      "w1c,\t0.0,\t1.0",
      "*** Load ***",
      "2,\t1",
      "w1c6,\t0,\t10.0,\t50.0,\t150.0",
      "w2e,\t1,\t470.0,\t-3.5",
      "*** Segmentation ***",
      "400,\t40,\t2.0,\t1",
      "*** G/H/M/R/AzEl/X ***",
      "2,\t12.0,\t1,\t75.0,\t120,\t60,\t0.0",
      "",
    ]);
  });

  it("comes back the same when it is read", () => {
    const back = importMaa(exportMaa(model).text, model).model;
    expect(back).toEqual({ ...model, name: "Трап-диполь 40/20" });
    const free: Model = { ...model, ground: { ...model.ground, kind: "free" }, wireConductivity: 0, loads: [] };
    expect(exportMaa(free).notes).toEqual([]);
    expect(importMaa(exportMaa(free).text, free)).toEqual({ model: { ...free, name: "Трап-диполь 40/20" }, notes: [] });
  });

  it("names the nearest material for a conductivity of the user", () => {
    const { text, notes } = exportMaa({ ...model, wireConductivity: 3.0e7, ground: { ...model.ground, kind: "perfect" } });
    expect(text).toContain("1,\t12.0,\t3,\t75.0");
    expect(notes).toEqual(["Файл MMANA знає лише готові матеріали: замість вашої провідності записано найближчий, алюміній."]);
    expect(exportMaa({ ...model, wireConductivity: 1.4e6 }).text).toContain("2,\t12.0,\t5,\t75.0");
  });
});

// Files as the library of MMANA-GAL has them. Their headings differ: MMANA
// writes them in the language of its interface, and some were edited by hand.
describe("the files of the library of MMANA", () => {
  const dipole = [
    "Dipole 20 m",
    "*",
    "14.05",
    "* Провода *",
    "1",
    "0.0,\t-5.17,\t0.0,\t0.0,\t5.17,\t0.0,\t0.001,\t-1",
    "*** Источ. ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "*** Нагрузка ***",
    "0,\t1",
    "*** Автосегм ***",
    "400,\t40,\t2.0,\t1",
    "*G/H/M/R/AzEl/X*",
    "0,\t20.0,\t0,\t50.0,\t120,\t60,\t0",
    "",
  ].join("\r\n");

  const vertical = [
    "Simple vertical",
    "*",
    "14.05",
    "***Wires***",
    "1",
    "0.0,\t0.0,\t0.0,\t0.0,\t0.0,\t5.19,\t0.001,\t-1",
    "*** Source ***",
    "1,\t1",
    "w1b,\t0.0,\t1.0",
    "*** Load ***",
    "0,\t1",
    "*** Segmentation ***",
    "400,\t40,\t2.0,\t1",
    "*** G/H/M/R/AzEl/X ***",
    "2,\t0.0,\t1,\t50.0,\t120,\t60,\t0.0",
  ].join("\r\n");

  const trapDipole = [
    "W3DZZm",
    "*",
    "7.04",
    "* \u00cf\u00f0\u00ee\u00e2\u00ee\u00e4\u00e0 *",
    "3",
    "-1.893e-15,\t-10.3,\t0.0,\t6.310e-16,\t10.3,\t0.0,\t0.0015,\t-1",
    "6.310e-16,\t10.3,\t0.0,\t1.075e-15,\t17.55,\t0.0,\t0.0015,\t-1",
    "-1.893e-15,\t-10.3,\t0.0,\t-3.225e-15,\t-17.55,\t0.0,\t0.0015,\t-1",
    "***   Source   ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "***   Load   ***",
    "2,\t1",
    "w2b,\t0,\t9.26615,\t55.0,\t300.0",
    "w3b,\t0,\t9.26615,\t55.0,\t300.0",
    "**Segmentation**",
    "400,\t40,\t2.0,\t1",
    "*GH/??/R/AzEl/X*",
    "2,\t10.0,\t3,\t50.0,\t120,\t60,\t0",
    "### Comment ###",
    "* a line of the comment that looks like a heading *",
  ].join("\n");

  const taperedBeam = [
    "4ele 20m (30mm/25mm/20mm Pipe)",
    "*",
    "14.05",
    "***Wires***",
    "2",
    "0.0,\t-5.185,\t0.0,\t0.0,\t5.185,\t0.0,\t-0.001,\t-1",
    "-2.95,\t-5.405,\t0.0,\t-2.95,\t5.405,\t0.0,\t-0.001,\t-1",
    "*** Source ***",
    "1,\t1",
    "w1c,\t0.0,\t1.0",
    "*** Load ***",
    "0,\t1",
    "*** Segmentation ***",
    "400,\t50,\t2.0,\t1",
    "*** G/H/M/R/AzEl/X ***",
    "2,\t11.5,\t3,\t50.0,\t120,\t60,\t0.0",
    "$$$ Taper wire set $$$",
    "1",
    "-0.001,\t0,\t1.8,\t0.015,\t1.8,\t0.0125,\t99999.9,\t0.01",
  ].join("\r\n");

  it("are read whatever the language of their headings", () => {
    const { model, notes } = importMaa(dipole, defaultModel);
    expect(notes).toEqual([]);
    expect(model).toMatchObject({
      name: "Dipole 20 m",
      frequency: 14.05,
      sources: [{ at: { wire: 0, place: "c" }, phase: 0, voltage: 1 }],
      loads: [],
      height: 20,
      wireConductivity: 0,
      reference: 50,
    });
    expect(model.ground.kind).toBe("free");
    expect(model.wires).toEqual([{ x1: 0, y1: -5.17, z1: 0, x2: 0, y2: 5.17, z2: 0, radius: 0.001, segments: -1 }]);
  });

  it("are read with spaces in their headings", () => {
    const { model, notes } = importMaa(vertical, defaultModel);
    expect(model.sources).toEqual([{ at: { wire: 0, place: "b" }, phase: 0, voltage: 1 }]);
    expect(model.ground.kind).toBe("real");
    expect(model.wireConductivity).toBe(COPPER);
    expect(model.wires[0].z2).toBe(5.19);
    expect(notes).toHaveLength(2);
    // The wire stands on the real ground.
    expect(buildDeck(model).warnings).toEqual(["Дріт 1 торкається реальної землі: таке заземлення NEC-2 рахує неточно."]);
  });

  it("are read with headings that were spoiled or edited, and with a comment after them", () => {
    const { model } = importMaa(trapDipole, defaultModel);
    expect(model.wires).toHaveLength(3);
    // The noise of the arithmetic of MMANA becomes the zero that it stands for.
    expect(model.wires.map((wire) => [wire.x1, wire.x2])).toEqual([[0, 0], [0, 0], [0, 0]]);
    expect(Object.is(model.wires[0].x1, -0)).toBe(false);
    expect(model.loads).toEqual([
      { kind: "lc", at: { wire: 1, place: "b" }, inductance: 9.26615, capacitance: 55, q: 300 },
      { kind: "lc", at: { wire: 2, place: "b" }, inductance: 9.26615, capacitance: 55, q: 300 },
    ]);
    expect(model.height).toBe(10);
    expect(model.ground.kind).toBe("real");
    expect(model.wireConductivity).toBe(ALUMINIUM);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("turn the tubes of an element into wires of their radii, with the source on the centre tube", () => {
    const { model, notes } = importMaa(taperedBeam, defaultModel);
    // Each element: 1.8 m of the thickest tube at the centre, 1.8 m of the next on each side, the thinnest to the tips.
    expect(model.wires).toHaveLength(10);
    expect(model.wires.slice(0, 5).map((wire) => wire.radius)).toEqual([0.01, 0.0125, 0.015, 0.0125, 0.01]);
    expect(model.wires.slice(0, 5).map((wire) => [wire.y1, wire.y2])).toEqual([
      [-5.185, -2.7],
      [-2.7, -0.9],
      [-0.9, 0.9],
      [0.9, 2.7],
      [2.7, 5.185],
    ]);
    expect(model.wires[5].y1).toBe(-5.405);
    expect(model.sources[0].at).toEqual({ wire: 2, place: "c" });
    expect(notes.filter((note) => /складено з труб різного радіуса: тут це дроти (1–5|6–10)/.test(note))).toHaveLength(2);
    expect(model.height).toBe(11.5);
    expect(buildDeck(model).errors).toEqual([]);
  });
});

describe("the sources of a file of MMANA", () => {
  const hb9cv = [
    "HB9CV 20m",
    "*",
    "14.05",
    "* Провода *",
    "2",
    "0.0,\t-4.945,\t0.0,\t0.0,\t4.945,\t0.0,\t0.01,\t-1",
    "-2.65,\t-5.31,\t0.0,\t-2.65,\t5.31,\t0.0,\t0.01,\t-1",
    "*** Источ. ***",
    "2,\t1",
    "w1c,\t0.0,\t0.5",
    "w2c,\t135.0,\t0.5",
    "*** Нагрузка ***",
    "0,\t1",
    "*** Автосегм ***",
    "400,\t40,\t2.0,\t1",
    "*G/H/M/R/AzEl/X*",
    "0,\t20.0,\t0,\t50.0,\t120,\t60,\t0",
  ].join("\r\n");

  it("are all read, with their phases and voltages", () => {
    const { model, notes } = importMaa(hb9cv, defaultModel);
    expect(notes).toEqual([]);
    expect(model.sources).toEqual([
      { at: { wire: 0, place: "c" }, phase: 0, voltage: 0.5 },
      { at: { wire: 1, place: "c" }, phase: 135, voltage: 0.5 },
    ]);
    expect(buildDeck(model).errors).toEqual([]);
  });

  it("are all written, and come back the same", () => {
    const { model } = importMaa(hb9cv, defaultModel);
    const { text } = exportMaa(model);
    expect(text.split("\r\n").slice(7, 11)).toEqual(["*** Source ***", "2,\t1", "w1c,\t0.0,\t0.5", "w2c,\t135.0,\t0.5"]);
    expect(importMaa(text, model).model).toEqual(model);
  });

  it("are refused with a reason when a line is damaged", () => {
    expect(() => importMaa(hb9cv.replace("w2c,\t135.0,\t0.5", "w2c,\t135.0"), defaultModel)).toThrow(/джерело 2: «w2c,\t135.0»/);
  });
});

describe("the taper wire set of MMANA", () => {
  // A vertical from the ground up, with its tubes from the beginning of the wire, and a dipole beside it.
  const file = (rows: string[], place = "w1b") =>
    [
      "Tubes",
      "*",
      "7.1",
      "***Wires***",
      "2",
      "0.0,\t0.0,\t0.0,\t0.0,\t0.0,\t10.0,\t-0.001,\t-1",
      "5.0,\t-5.0,\t3.0,\t5.0,\t5.0,\t3.0,\t-0.002,\t-1",
      "*** Source ***",
      "1,\t1",
      `${place},\t0.0,\t1.0`,
      "*** Load ***",
      "0,\t1",
      "*** Segmentation ***",
      "400,\t40,\t2.0,\t1",
      "*** G/H/M/R/AzEl/X ***",
      "1,\t0.0,\t0,\t50.0,\t120,\t60,\t0.0",
      "$$$ Taper wire set $$$",
      String(rows.length),
      ...rows,
    ].join("\r\n");
  const radii = (text: string, from: number, to: number) => importMaa(text, defaultModel).model.wires.slice(from, to).map((wire) => [wire.z1, wire.z2, wire.radius]);

  it("starts the tubes of the type -> at the beginning of the wire", () => {
    const text = file(["-0.001,\t1,\t3.0,\t0.02,\t2.5,\t0.015,\t99999.9,\t0.01", "-0.002,\t0,\t2.0,\t0.005,\t99999.9,\t0.003"]);
    expect(radii(text, 0, 3)).toEqual([
      [0, 3, 0.02],
      [3, 5.5, 0.015],
      [5.5, 10, 0.01],
    ]);
    const { model, notes } = importMaa(text, defaultModel);
    expect(model.wires.slice(3).map((wire) => [wire.y1, wire.y2, wire.radius])).toEqual([
      [-5, -1, 0.003],
      [-1, 1, 0.005],
      [1, 5, 0.003],
    ]);
    expect(model.sources[0].at).toEqual({ wire: 0, place: "b" });
    expect(notes).toEqual([
      "Дріт 1 складено з труб різного радіуса: тут це дроти 1–3, кожна труба окремо.",
      "Дріт 2 складено з труб різного радіуса: тут це дроти 4–6, кожна труба окремо.",
    ]);
  });

  it("reads a length of zero as the end of the tubes, and takes the first of two rows with one pointer", () => {
    const text = file(["-0.001,\t1,\t3.0,\t0.02,\t4.0,\t0.015,\t0.0,\t0.01", "-0.001,\t1,\t1.0,\t0.05,\t99999.9,\t0.04", "-0.002,\t0,\t20.0,\t0.005,\t99999.9,\t0.003"]);
    expect(radii(text, 0, 2)).toEqual([
      [0, 3, 0.02],
      [3, 10, 0.015],
    ]);
    // A centre tube longer than the wire leaves one wire.
    expect(importMaa(text, defaultModel).model.wires).toHaveLength(3);
  });

  it("puts a pulse at the centre of tubes that start at the beginning on a joint at the middle", () => {
    const { model, notes } = importMaa(file(["-0.001,\t1,\t3.0,\t0.02,\t99999.9,\t0.01", "-0.002,\t0,\t2.0,\t0.005,\t99999.9,\t0.003"], "w1c"), defaultModel);
    expect(radii(file(["-0.001,\t1,\t3.0,\t0.02,\t99999.9,\t0.01", "-0.002,\t0,\t2.0,\t0.005,\t99999.9,\t0.003"], "w1c"), 0, 3)).toEqual([
      [0, 3, 0.02],
      [3, 5, 0.01],
      [5, 10, 0.01],
    ]);
    expect(model.sources[0].at).toEqual({ wire: 1, place: "e" });
    expect(notes).toHaveLength(2);
    const offset = importMaa(file(["-0.001,\t1,\t3.0,\t0.02,\t99999.9,\t0.01", "-0.002,\t0,\t2.0,\t0.005,\t99999.9,\t0.003"], "w1c2"), defaultModel);
    expect(offset.model.sources[0].at).toEqual({ wire: 1, place: "e" });
    expect(offset.notes.join(" ")).toMatch(/Зсув у w1c2 від центру дроту з труб не перенесено/);
  });

  it("says that it reads the types with an asterisk as those without", () => {
    const { notes } = importMaa(file(["-0.001,\t3,\t3.0,\t0.02,\t99999.9,\t0.01", "-0.002,\t2,\t2.0,\t0.005,\t99999.9,\t0.003"]), defaultModel);
    expect(notes.at(-1)).toMatch(/зі зірочкою.*прочитано так само, як без неї/);
  });

  it("is refused with a reason when a row is damaged", () => {
    expect(() => importMaa(file(["-0.001,\t5,\t3.0,\t0.02,\t99999.9,\t0.01"]), defaultModel)).toThrow(/Невідомий тип труб у файлі: 5/);
    expect(() => importMaa(file(["-0.001,\t1,\t3.0"]), defaultModel)).toThrow(/рядок 1 таблиці труб/);
    expect(() => importMaa(file(["-0.001,\t1,\t3.0,\t0.0,\t99999.9,\t0.01"]), defaultModel)).toThrow(/Радіуси труб у рядку 1/);
  });
});
