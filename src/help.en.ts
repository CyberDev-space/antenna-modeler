import type { Topic, TopicKey } from "./help";

/** The help of `help.ts` in English, topic for topic. */
export const TOPICS_EN: Record<TopicKey, Topic> = {
  name: {
    title: "Name of the model",
    what: "The name of the antenna.",
    affects: "The heading of the PDF sheet, the names of saved files and the first line of the NEC deck.",
    defaults: "The name from the opened file; in the example, “Dipole for 20 m”.",
  },
  open: {
    title: "Open a file",
    what: "Opens a model from a file.",
    table: {
      title: "Files",
      rows: [
        ["`.json`", "a file of this program; it holds everything"],
        ["`.maa`", "a file of MMANA or MMANA-GAL"],
      ],
    },
    how: ["After an MMANA file, notes appear above the editor: what could not be carried over and what was taken instead."],
    howTitle: "Good to know",
    affects: "Replaces the current model: save it first if you need it.",
  },
  save: {
    title: "Save",
    what: "Saves the model to a `.json` file of this program.",
    how: [
      "Everything is saved: wires, sources, loads, ground, material, sweep range.",
      "To go on working, open the file with the “Open” button.",
    ],
  },
  exportMaa: {
    title: "Export to MMANA",
    what: "Writes the model as an MMANA antenna file (`.maa`).",
    howTitle: "What the file does not keep",
    how: [
      "The sweep range and the parameters of a real ground.",
      "Own conductivity of the wires: the nearest preset metal is written instead.",
      "A note will appear about the ground and the metal.",
    ],
  },
  exportNec: {
    title: "Export to NEC-2",
    what: "Writes a deck of NEC-2 cards (`.nec`) for other programs: 4nec2, xnec2c and others.",
    how: ["Coils and capacitors are written as such, so the deck is right at other frequencies too."],
    howTitle: "Good to know",
  },
  compare: {
    title: "Comparing variants",
    what: "Keeps the results of this model to compare the next ones with: another size, another height, an optimization or another antenna altogether.",
    how: [
      "Keep the results, change the model and compute again: the numbers of the kept variant stand under the current ones, and its patterns and sweep curves lie dashed on the same charts.",
      "To compare the sweep too, sweep the model before keeping it.",
      "`Δ` next to the gain and the front/back is the difference: the current minus the kept. Under the pointer, the values of the kept variant are in brackets.",
      "Keeping again replaces the kept variant, and “Remove the comparison” removes it.",
    ],
  },
  templates: {
    title: "Antenna templates",
    what: "Ready antennas to start with: a dipole, an inverted V, a vertical with radials, a delta loop, a quad and a Yagi. You give the frequency and the height; the program builds the antenna and cuts it to resonance with the NEC-2 engine.",
    how: [
      "The cut takes the height and the ground into account: the antenna is resonant where it will hang.",
      "The ground, the metal of the wires and the line stay from the current model; the wires, sources and loads are replaced.",
      "The step can be undone: Ctrl+Z.",
    ],
    affects: "The current model is replaced by the new one; save it if you still need it.",
  },
  templateKind: {
    title: "Antenna",
    what: "Which antenna to build. Under the cards, a few words say what the antenna is.",
    table: {
      title: "At 14.15 MHz, 10 m above average ground, wire of 2 mm",
      rows: [
        ["Dipole", "73 Ω; 7.1 dBi at 30°, both ways"],
        ["Inverted V", "63 Ω; 6.4 dBi at 33°"],
        ["Vertical with radials", "48 Ω; 1 dBi at 14°, all round"],
        ["Delta loop", "124 Ω; 5.2 dBi at 47°: for low angles it must hang higher"],
        ["Quad", "one loop 128 Ω, 7.5 dBi; two and three loops 130 and 90 Ω, 11.1 and 11.9 dBi"],
        ["Yagi", "38–58 Ω; from 10.7 dBi with 2 elements to 14.2 dBi with 6"],
      ],
    },
  },
  templateFrequency: {
    title: "Frequency of the template",
    what: "The frequency the antenna is designed for: there its driven element has no reactance.",
    affects: "The dimensions of the antenna, the frequency of the model and the range of the sweep: ±4 % around it.",
    defaults: "The frequency of the current model.",
  },
  templateHeight: {
    title: "Height",
    what: "The height above the ground of the point the antenna hangs from; the name of the field says which point.",
    table: {
      title: "Which point",
      rows: [
        ["Dipole", "the wire itself"],
        ["Inverted V, delta loop", "the apex"],
        ["Vertical", "the base, where the radials start"],
        ["Quad, Yagi", "the boom"],
      ],
    },
    how: [
      "The height becomes the “Add height” of the model: the antenna can then be raised or lowered without touching the wires.",
      "If the lowest point of the antenna would come close to the ground, the template says how high to hang it.",
    ],
    howTitle: "Good to know",
    defaults: "10 m. In free space there is no field: the height changes nothing there.",
  },
  templateDiameter: {
    title: "Wire diameter",
    what: "The diameter of the wire or the tubes of the antenna, in millimetres.",
    how: ["A thicker wire makes a dipole a little shorter and its band wider; the template takes it into account.", "For a Yagi of tubes on HF it is, for example, 20 mm."],
    howTitle: "Good to know",
    defaults: "2 mm.",
  },
  templateElements: {
    title: "Elements",
    what: "How many loops a quad has, or elements a Yagi: the reflector, the driven element and the directors.",
    table: {
      title: "In free space: gain, F/B over ±1.5 %, boom",
      rows: [
        ["Yagi, 2", "6.1 dBi; from 10 dB; 0.17 λ"],
        ["Yagi, 3", "7.5 dBi; from 20 dB; 0.34 λ"],
        ["Yagi, 4", "8.4 dBi; from 20 dB; 0.42 λ"],
        ["Yagi, 5", "10.7 dBi; from 22 dB; 0.8 λ"],
        ["Yagi, 6", "11.4 dBi; from 22 dB; 0.96 λ"],
        ["Quad, 2", "7.2 dBi; from 15 dB; 0.15 λ"],
        ["Quad, 3", "8.4 dBi; from 20 dB; 0.39 λ"],
      ],
    },
    how: [
      "The dimensions were found with this program: a search for the most gain with such an F/B and an SWR up to 1.5 over ±1.5 % around the frequency.",
      "The Yagis are made for a 50-ohm line without matching; a quad of 2 or 3 loops has an impedance of about 100 ohms.",
    ],
    howTitle: "Good to know",
    defaults: "3.",
  },
  pdf: {
    title: "PDF sheet",
    what: "A sheet for building and for a report.",
    table: {
      title: "On the sheet",
      rows: [
        ["Drawing", "with the dimensions of the elements and the spacings between them"],
        ["Tables", "elements and tubes in mm, boom, wires, sources, loads"],
        ["Results", "numbers, patterns and the last sweep"],
      ],
    },
    how: ["In the print dialog, choose “Save as PDF”.", "If the results are out of date, the model is recomputed first."],
  },
  compute: {
    title: "Compute",
    what: "Computes the model with the NEC-2 engine at the model frequency.",
    how: [
      "Ctrl+Enter does the same from anywhere on the page.",
      "While the engine computes, the button turns into “Stop”: the computation can be interrupted, and the previous results stay.",
    ],
    affects: "The numbers at the top, the patterns, the 3D pattern and the NEC-2 report.",
  },
  undo: {
    title: "Undo",
    what: "Takes the model one step back: a change of a wire, a source or the settings, an opened file, a template, or a whole optimizer search.",
    how: [
      "Ctrl+Z when the cursor is not in an input field; in a field, Ctrl+Z undoes the typing in that field itself.",
      "Changes made in a row within a second, such as typing one number, are one step.",
      "Remembers 100 steps until the page is closed.",
    ],
    howTitle: "Good to know",
  },
  redo: {
    title: "Redo",
    what: "Brings back a step that was undone.",
    how: ["Ctrl+Shift+Z or Ctrl+Y.", "A new change after an undo erases the steps that could have been redone."],
    howTitle: "Good to know",
  },
  language: {
    title: "Language",
    what: "The language of the page: its labels, messages, help and PDF sheet.",
    how: [
      "The page starts in Ukrainian for a browser set to Ukrainian and in English for any other.",
      "The program remembers the choice in this browser.",
      "A site that embeds the program gives it its language, and then this switch is not there.",
    ],
    howTitle: "Good to know",
  },
  theme: {
    title: "Theme",
    what: "The light or the dark theme of the page.",
    how: [
      "At first the theme is that of the system and changes with it, until you choose your own.",
      "The program remembers the choice in this browser. The PDF sheet is always light.",
      "A site that embeds the program gives it its theme, and then this switch is not there.",
    ],
    howTitle: "Good to know",
  },
  helpToggle: {
    title: "Hints",
    what: "Turns these pop-up hints on and off.",
    how: ["Names with a hint are underlined with dots.", "The program remembers the choice in this browser."],
    howTitle: "Good to know",
    defaults: "On.",
  },

  wireEnds: {
    title: "Wire ends, m",
    what: "The coordinates of the start (X1, Y1, Z1) and the end (X2, Y2, Z2) of a straight wire. The Z axis points up.",
    how: [
      "Wires are joined when their ends have exactly the same coordinates.",
      "The decimal sign can be a comma or a point.",
      "Over ground, Z is counted from its surface, and “Add height” is added to it.",
    ],
    affects: "The geometry of the antenna and all the results. A wire cannot go under the ground.",
  },
  wireRadius: {
    title: "Wire radius, mm",
    what: "The radius of the conductor: the radius, not the diameter.",
    how: ["For a tube 20 mm in diameter, enter 10.", "A thicker wire lowers the resonant frequency a little and widens the bandwidth."],
    affects: "Impedance, resonance and bandwidth. A segment must be longer than 8 radii, or a warning appears.",
    defaults: "A new wire repeats the last row; in an empty table, 1 mm.",
  },
  wireSegments: {
    title: "Segments",
    what: "How many pieces NEC-2 divides the wire into for the computation.",
    table: {
      title: "Values",
      rows: [
        ["`−1` or `0`", "the program chooses: about 40 per wavelength, shorter near loads"],
        ["a number", "exactly that many equal segments, near loads too"],
      ],
    },
    how: ["The grey number on the right shows how many segments the wire got."],
    affects: "Accuracy and computing time. No more than 3000 segments in all.",
    defaults: "−1. Leave it as it is unless there is a special reason.",
  },

  viewWires: {
    title: "Wires",
    what: "The model as a table of wires: the coordinates of the ends, the radius and the segments of every wire, as in MMANA.",
  },
  viewElements: {
    title: "Elements",
    what: "The model by its elements, like the Yagi editor of MMANA: each element is a wire or several wires in one line, such as tubes.",
    how: [
      "The length changes symmetrically about the centre: only the ends move, the joints of the tubes stay.",
      "The centre moves the whole element, together with the ends of the wires joined to it.",
      "“Copy” puts the same element beyond the last parallel one at the same spacing: a new director.",
    ],
  },
  elementWires: {
    title: "Wires of the element",
    what: "The numbers of the wires in the Wires table that make up the element: a wire, or wires that continue one another in one line.",
  },
  elementCentre: {
    title: "Element centre, m",
    what: "The coordinates of the middle of the element.",
    how: [
      "A change moves the whole element; the ends of other wires joined to it move with it.",
      "The height above ground is not added here, just as in the Wires table.",
    ],
  },
  elementLength: {
    title: "Element length, m",
    what: "From end to end of the element.",
    how: [
      "It changes symmetrically about the centre: the end tubes move, the inner ones stay.",
      "The ends cannot go past the joints of the inner tubes; then the element stays as it was.",
    ],
  },
  elementDiameter: {
    title: "Diameter, mm",
    what: "The diameter of the element's conductor: the diameter, not the radius as in the Wires table.",
    how: [
      "For an element of identical wires, it changes the diameter of them all.",
      "An element of tubes of different diameters shows them from the centre to the end; they are changed in the Wires table.",
    ],
  },
  elementTubes: {
    title: "Tubes of the element",
    what: "The diameters of the tubes from the centre to the end, in millimetres.",
    how: ["They can be changed in the Wires table: there each tube is a wire of its own."],
  },
  elementCopy: {
    title: "Copy of the element",
    what: "Adds the same element beyond the last parallel element, at the same spacing as between the last two: a new director.",
    how: ["A lone element is copied 0.15 wavelength to the side.", "Sources and loads are not copied."],
  },

  pulse: {
    title: "Place on a wire",
    what: "A point on a wire in MMANA notation.",
    table: {
      title: "Notation",
      rows: [
        ["`w1c`", "the centre of wire 1"],
        ["`w1b`", "the start of wire 1"],
        ["`w1e`", "the end of wire 1"],
        ["`w1c2`", "2 segments from the centre towards the end"],
        ["`w1c-2`", "2 segments from the centre towards the start"],
        ["`w1b1`", "1 segment from the start"],
      ],
    },
    how: ["At the joint of two wires (`w1e`, when wire 2 starts there), the source sits exactly on the joint, as in MMANA."],
    howTitle: "Good to know",
  },
  sourcePhase: {
    title: "Source phase, °",
    what: "The phase shift of this source's voltage relative to the others.",
    how: ["Needed for phased antennas: for example, an HB9CV is fed with phases of 0° and 135°.", "For an antenna with one source it changes nothing."],
    affects: "The radiation pattern and the source impedances of a phased antenna.",
    defaults: "0°.",
  },
  sourceVoltage: {
    title: "Source voltage, V",
    what: "The amplitude of the source voltage.",
    how: [
      "With one source it changes only the scale of the currents, not the impedance or the pattern.",
      "With several sources it sets their ratio.",
      "Zero turns the source off: its place becomes an ordinary segment.",
    ],
    defaults: "1 V.",
  },
  loadPulse: {
    title: "Place of the load",
    what: "A point on a wire, as for a source: `w1c`, `w2b`, `w3e1` and so on.",
    how: [
      "At the joint of two wires, the load is split in half between the segments of the joint: this is how a trap between pieces of wire is modelled.",
      "If the program chooses the segments of the wire, the load gets a short segment and becomes lumped rather than spread over a segment.",
    ],
    howTitle: "Good to know",
  },
  loadType: {
    title: "Load type",
    what: "What kind of load it is.",
    table: {
      title: "Types",
      rows: [
        ["LC", "a coil, a capacitor or both in parallel (a trap), with a quality factor"],
        ["R + jX", "an impedance that is the same at all frequencies: for example, the resistor of a rhombic antenna or a T2FD"],
      ],
    },
  },
  loadL: {
    title: "Inductance L, µH",
    what: "The inductance of the coil.",
    how: ["0: no coil."],
    affects: "The impedance of a coil grows with frequency, so in a sweep it is recomputed at every frequency.",
  },
  loadC: {
    title: "Capacitance C, pF",
    what: "The capacitance of the capacitor.",
    how: ["0: no capacitor.", "L and C together make a parallel trap; its resonant frequency shows on the right."],
  },
  loadQ: {
    title: "Quality factor Q",
    what: "The Q of the coil or, without a coil, of the capacitor. The losses are a resistance X/Q in series with it.",
    table: {
      title: "Typical values",
      rows: [
        ["0", "lossless"],
        ["100–300", "ordinary coils"],
        ["200–400", "air-wound trap coils"],
      ],
    },
    affects: "Efficiency and the resistive part of the input impedance.",
    defaults: "0, lossless.",
  },
  loadR: {
    title: "Resistance R, Ω",
    what: "The resistance of the load, the same at all frequencies.",
  },
  loadX: {
    title: "Reactance X, Ω",
    what: "The reactance of the load, the same at all frequencies.",
    how: ["Positive is inductive, negative is capacitive.", "For an impedance that changes with frequency, as a real coil's does, choose the LC type."],
  },

  frequency: {
    title: "Frequency, MHz",
    what: "The frequency of the computation.",
    affects: "All results and the automatic segmentation. The sweep range is set separately.",
    defaults: "14.15 MHz in the example; for an MMANA file, its own frequency.",
  },
  scaleTo: {
    title: "Move to a frequency",
    what: "Scales the whole antenna to another frequency, as MMANA does: every length, the height over the ground too, is multiplied by the old frequency over the new one.",
    how: [
      "So an antenna for 20 m can move to 17 m or to 2 m: it keeps its size in wavelengths.",
      "Coils and capacitors get the values that have the same reactance at the new frequency; the sweep range moves with the frequency.",
      "The step can be undone: Ctrl+Z.",
    ],
    affects: "Every dimension of the model, the frequency, the loads and the sweep.",
  },
  scaleRadii: {
    title: "With the diameters",
    what: "Scale the diameters of the wires too. Only then is the moved antenna the same antenna electrically: the same impedance, gain and pattern.",
    how: ["Clear it if you will build with the same tubes: the resonance then moves a little, and the optimizer can bring it back."],
    defaults: "On.",
  },
  reference: {
    title: "Line, Ω",
    what: "The characteristic impedance of the feed line. The SWR is computed relative to it.",
    table: {
      title: "Typical values",
      rows: [
        ["50", "ordinary coaxial cable"],
        ["75", "TV cable"],
        ["12.5 or 28", "Yagi with a DK7ZB match"],
        ["≈ 300", "folded dipole"],
      ],
    },
    affects: "Only the SWR, here and in the sweep. The impedance of the antenna itself does not change.",
    defaults: "50 Ω.",
  },
  material: {
    title: "Wire material",
    what: "Losses in the metal of the wires due to the skin effect.",
    table: {
      title: "Options",
      rows: [
        ["Lossless", "a perfect conductor"],
        ["Copper", "58 MS/m"],
        ["Aluminium", "35 MS/m"],
        ["Own conductivity", "given as a number"],
      ],
    },
    affects:
      "Efficiency, and the input impedance a little. Noticeable for short antennas, magnetic loops and thin wires; for a full-size copper antenna, fractions of a percent.",
    defaults: "Lossless.",
  },
  taperCorrection: {
    title: "Leeson correction",
    what: "NEC-2 computes the steps between tubes of different diameters inaccurately: the resonance of a Yagi element of telescoping tubes shifts by a few percent. The correction replaces such an element with a uniform cylinder that has the same resonance and whose reactance changes with frequency in the same way.",
    how: [
      "The method of D. Leeson from the book “Physical Design of Yagi Antennas”; EZNEC applies the same correction.",
      "It works on straight elements that are symmetric about the centre and 0.4–0.6 λ long: with a source at the centre or without one, with no loads and no wires joined to them. A warning says why an element was left with its tubes.",
      "The model, the drawing and the PDF keep the real tubes; only what the engine gets is changed. An L in the Wires table marks such tubes.",
    ],
    howTitle: "Good to know",
    affects: "The resonance and input impedance of elements made of tubes, and with them the gain and front/back of a Yagi.",
    defaults: "On.",
  },
  ownConductivity: {
    title: "Metal conductivity, MS/m",
    what: "Your own conductivity for the wire material.",
    table: {
      title: "Typical values",
      rows: [
        ["Copper", "58"],
        ["Aluminium", "35"],
        ["Brass", "≈ 15"],
        ["Stainless steel", "≈ 1.4"],
      ],
    },
  },
  ground: {
    title: "Ground",
    what: "What is under the antenna.",
    table: {
      title: "Options",
      rows: [
        ["Free space", "the antenna is far from everything; the pattern is a full sphere"],
        ["Perfect", "a lossless conducting plane"],
        ["Real", "soil with a permittivity and a conductivity, Sommerfeld method; the most accurate for low antennas"],
      ],
    },
    how: ["MMANA computes the impedance over a perfect ground. Here, over a real ground, it is more accurate, especially below a quarter wavelength."],
    howTitle: "Good to know",
    affects: "Impedance, elevation angle, gain. Over ground the pattern is only the upper hemisphere.",
    defaults: "Real, average (ε = 13, σ = 0.005 S/m).",
  },
  height: {
    title: "Add height, m",
    what: "Added to the height Z of all wires, like “Add height” in MMANA.",
    how: ["This way the whole antenna can be raised or lowered without changing the coordinates.", "A wire that reaches the ground is connected to it."],
    defaults: "0; from an MMANA file, its own value.",
  },
  permittivity: {
    title: "Ground permittivity ε",
    what: "The relative permittivity (dielectric constant) of the soil.",
    table: {
      title: "Typical values",
      rows: [
        ["Dry sandy soil", "4–5"],
        ["Average soil", "13"],
        ["Wet soil", "20–30"],
        ["Fresh water", "80"],
        ["Sea water", "81"],
      ],
    },
    defaults: "13.",
  },
  groundConductivity: {
    title: "Ground conductivity, S/m",
    what: "The conductivity of the soil.",
    table: {
      title: "Typical values",
      rows: [
        ["Poor: city, rocks", "0.001"],
        ["Average soil", "0.005"],
        ["Good: black earth, marsh", "0.01–0.03"],
        ["Sea water", "5"],
      ],
    },
    defaults: "0.005.",
  },

  impedance: {
    title: "Input impedance",
    what: "The impedance of the antenna at the feed point: the resistive part R and the reactive part jX.",
    table: {
      title: "How to read",
      rows: [
        ["X = 0", "resonance"],
        ["X > 0", "the antenna is too long, inductive"],
        ["X < 0", "the antenna is too short, capacitive"],
      ],
    },
    how: ["R is the radiation resistance together with the losses."],
    howTitle: "Good to know",
  },
  swr: {
    title: "SWR",
    what: "The standing wave ratio relative to the characteristic impedance from the “Line, Ω” field.",
    table: {
      title: "How to read",
      rows: [
        ["1", "a perfect match"],
        ["up to 1.5", "good"],
        ["2", "the usual edge of the usable bandwidth"],
        ["over 3", "a matching device is needed"],
      ],
    },
  },
  gain: {
    title: "Gain, dBi",
    what: "The highest gain relative to an isotropic radiator.",
    how: ["Relative to a half-wave dipole: dBd = dBi − 2.15.", "Over a real ground, its reflection and losses are taken into account."],
    howTitle: "Good to know",
  },
  frontToBack: {
    title: "Front/back",
    what: "The difference in gain between the direction of the maximum and exactly the opposite direction, at the same angle above the horizon.",
    how: ["MMANA takes the worst value in the whole rear sector, so its number can be lower."],
    howTitle: "Good to know",
  },
  elevation: {
    title: "Elevation angle",
    what: "The angle of the pattern's maximum above the horizon.",
    how: [
      "It is found between the points of the pattern, so it can be fractional.",
      "For long-distance contacts on HF, 5–20° is preferable; for short-range ones (NVIS), high angles.",
    ],
    howTitle: "Good to know",
  },
  azimuth: {
    title: "Azimuth of maximum",
    what: "The direction of the maximum in the horizontal plane.",
    how: ["Counted from the X axis anticlockwise as seen from above: 90° is the Y axis."],
    howTitle: "How to read",
  },
  efficiency: {
    title: "Efficiency",
    what: "The share of the fed power that is not lost in the wires and loads.",
    how: ["Losses in the ground near the antenna are not included here: they show in the gain."],
    howTitle: "Good to know",
  },
  portPower: {
    title: "Share of power",
    what: "What share of the total power each source gives.",
    how: ["A negative share: the source takes power from the others."],
    howTitle: "How to read",
  },

  patternToggle: {
    title: "3D pattern",
    what: "The radiation pattern in space, coming out of the feed point; for a phased antenna, out of the middle between the sources.",
    how: [
      "The distance from the feed point and the colour show the gain on a 40 dB scale, as on the polar plots.",
      "The highest gain reaches as far as the point of the antenna farthest from the feed point: for a Yagi, a little beyond the last director.",
      "Visible after a computation, until the model is changed.",
    ],
    howTitle: "How to read",
  },
  currentsToggle: {
    title: "Currents in the view",
    what: "A curve over every wire: its height is the magnitude of the current at that place, relative to the largest current in the antenna.",
    how: [
      "At free ends the current falls to zero; it is largest at the antinode: in the middle of a dipole.",
      "Over a horizontal wire the curve stands upwards; over a vertical one, sideways along X.",
      "The numbers and the phase are on the “Currents” tab.",
    ],
    howTitle: "How to read",
  },
  fitView: {
    title: "Show all",
    what: "Brings the camera back so that the whole antenna and the pattern are in view.",
    table: {
      title: "Mouse",
      rows: [
        ["Left button", "rotate"],
        ["Wheel", "zoom"],
        ["Right button", "pan"],
      ],
    },
  },
  patternHorizontal: {
    title: "Horizontal pattern",
    what: "Gain against azimuth, at the angle of the maximum above the horizon.",
    how: [
      "The outer circle is the highest gain, rounded up; the other circles are 3, 10, 20 and 30 dB lower.",
      "Hover over the pattern to read the values.",
    ],
    howTitle: "How to read",
  },
  patternVertical: {
    title: "Vertical pattern",
    what: "Gain in the vertical plane through the maximum.",
    table: {
      title: "Angles",
      rows: [
        ["0°", "the horizon in the direction of the maximum"],
        ["90°", "the zenith"],
        ["180°", "the horizon behind"],
      ],
    },
    how: ["Over ground, only the upper half is visible.", "Hover over the pattern to read the values."],
    howTitle: "How to read",
  },

  currentLine: {
    title: "Element",
    what: "A wire, or several wires that continue one another in one line (such as the tubes of a Yagi element), whose current the charts show.",
    how: ["At first the element with the first source is chosen.", "The length in the list is from end to end of the element."],
  },
  currentMagnitude: {
    title: "Current magnitude, A",
    what: "The RMS current along the element when 100 W is fed into the antenna: what an RF ammeter would show at that place.",
    how: [
      "At free ends the current is zero; at the antinode it is largest.",
      "Losses in the wire and the coils depend on the current: where it is larger, thickness and quality matter more.",
      "Hover over the chart to read the values.",
    ],
    howTitle: "How to read",
  },
  currentPhase: {
    title: "Current phase, °",
    what: "The phase of the current relative to the source voltage, along the element.",
    how: [
      "In a resonant dipole it is almost constant; the phase difference between the elements of a Yagi or a phased antenna is what gives directivity.",
      "A positive current flows from the first end of the element to the second: crossing ±180° means a change of direction.",
    ],
    howTitle: "How to read",
  },

  sweepRange: {
    title: "Sweep range",
    what: "The frequency range of the sweep in megahertz and the number of frequencies in it.",
    how: ["From 2 to 201 points; both ends are among the points.", "Each point is a computation of its own; over a real ground this is slower."],
    affects: "The SWR and impedance charts.",
    defaults: "In the example, 13.6–14.7 MHz, 23 points. An MMANA file moves the range to its own frequency.",
  },
  sweepRun: {
    title: "Sweep",
    what: "Computes the input impedance and SWR at every frequency of the range, without patterns.",
    how: [
      "The segments are those for the model frequency.",
      "Coils and capacitors are recomputed at every frequency.",
      "While it computes, the button turns into “Stop”: over a real ground a long sweep takes seconds.",
    ],
    howTitle: "Good to know",
  },
  sweepGain: {
    title: "Gain in the sweep",
    what: "The gain at every frequency in the direction where it is highest at the model frequency.",
    how: [
      "Shows how the gain of a Yagi falls towards the band edges.",
      "If at some frequency the antenna “flips” and beams backwards, the gain in this direction drops sharply.",
      "At the model frequency it is the same as the gain at the top.",
    ],
    howTitle: "How to read",
  },
  sweepFrontToBack: {
    title: "Front/back in the sweep",
    what: "At every frequency, the difference between the gain in the direction of the maximum at the model frequency and the gain at the opposite azimuth at the same angle.",
    how: [
      "A negative front/back means that the antenna radiates more strongly backwards than forwards.",
      "The best front/back and the highest gain of a Yagi are usually at different frequencies.",
    ],
    howTitle: "How to read",
  },
  sweepSmith: {
    title: "Smith chart",
    what: "The input impedance at every frequency of the sweep on the Smith chart of the line: the centre is a perfect match, and the farther from the centre, the higher the SWR.",
    table: {
      title: "How to read",
      rows: [
        ["Circles", "the same resistance R; labels on the horizontal axis, in ohms"],
        ["Arcs", "the same reactance X: inductive above (`+j`), capacitive below (`−j`)"],
        ["Dashed circles", "SWR 1.5 and 2: inside them the SWR is lower"],
        ["Ring", "the model frequency; the hollow dot is the start of the sweep"],
      ],
    },
    how: [
      "As the frequency rises, the curve usually turns clockwise.",
      "The longer the curve stays near the centre, the wider the band.",
      "Rest the pointer on the curve to see the frequency, the impedance and the SWR there.",
    ],
    howTitle: "Good to know",
  },
  sweepSource: {
    title: "Source on the charts",
    what: "In a model with several sources, chooses whose impedance and SWR to show.",
  },
  sweepBand: {
    title: "SWR bandwidth",
    what: "The lowest SWR of the sweep and the frequency ranges where the SWR does not exceed 2.",
    how: [
      "An antenna for several bands has several ranges.",
      "A range edge at an end of the sweep means that the range goes on further: widen the sweep range.",
    ],
    howTitle: "How to read",
  },

  matchLNetwork: {
    title: "L network",
    what: "A coil and a capacitor that transform the input impedance of the antenna into the characteristic impedance of the line at the model frequency.",
    how: [
      "There are usually two solutions: with the shunt element at the antenna or at the line, with a coil or a capacitor in series. Each gives exactly the line impedance.",
      "The variant with a series coil and a shunt capacitor also suppresses harmonics a little.",
      "The network is narrowband: at other frequencies the values must be computed again.",
    ],
  },
  matchHairpin: {
    title: "Hairpin (beta match)",
    what: "Matching a split driven element of a Yagi whose impedance is lower than that of the line: the element is shortened a little so that it becomes capacitive, and a hairpin, a piece of two-wire line shorted at its end that works as a coil, is put across the feed point.",
    how: [
      "First shorten the driven element to the reactance shown and compute the model again, then make a hairpin of the length shown.",
      "The length is measured from the feed point to the shorting bar; it is handy to make the bar movable for tuning.",
    ],
  },
  hairpinDiameter: {
    title: "Hairpin tube diameter, mm",
    what: "The outer diameter of the two conductors of the hairpin.",
    affects: "The characteristic impedance of the hairpin, and with it its length: thicker tubes, a longer hairpin.",
    defaults: "6 mm.",
  },
  hairpinSpacing: {
    title: "Spacing between axes, mm",
    what: "The distance between the axes of the two conductors of the hairpin.",
    affects: "The characteristic impedance of the hairpin: wider spacing, a shorter hairpin.",
    defaults: "50 mm.",
  },
  matchQuarterWave: {
    title: "Quarter-wave transformer",
    what: "A piece of cable between the antenna and the line, as long as a quarter of the wavelength in the cable. It transforms a resistance R into Z²/R, where Z is its characteristic impedance.",
    how: [
      "The ideal Z = √(R·Z₀); the nearest common cable is marked.",
      "Two identical cables in parallel have half the impedance: 2 × 75 Ω = 37.5 Ω, 2 × 50 Ω = 25 Ω.",
      "It does not remove the reactance of the antenna: it is better to bring that to zero first.",
    ],
  },
  velocityFactor: {
    title: "Velocity factor",
    what: "How much shorter the wave is in the cable than in air. The physical length of the quarter-wave piece is a quarter wavelength multiplied by it.",
    table: {
      title: "Typical values",
      rows: [
        ["Solid polyethylene (RG-58, RG-213)", "0.66"],
        ["Foam polyethylene", "0.78–0.85"],
        ["Air-spaced two-wire line", "0.95–0.98"],
      ],
    },
    defaults: "0.66.",
  },

  optimizerAdd: {
    title: "Add variable",
    what: "Adds a quantity that the optimizer may change.",
    how: [
      "At first it is the length of the element with the first source; the kind and the number can be changed.",
      "Set the limits of the variables and the weights of the goals, then press “Optimize”.",
    ],
  },
  optimizerKind: {
    title: "What to vary",
    what: "Which quantity the optimizer varies.",
    table: {
      title: "Options",
      rows: [
        ["Element length", "changes symmetrically about the centre"],
        ["Position along X, Y, Z", "the whole element moves"],
        ["Load", "its L, C, R or X"],
        ["Source phase", "for phased antennas"],
      ],
    },
    how: [
      "An element is a wire together with the wires that continue it in one line, so the tubes stay together.",
      "The ends of other wires joined to the element move with it.",
    ],
    howTitle: "Good to know",
  },
  optimizerTarget: {
    title: "Number",
    what: "The number of the wire, load or source in its table.",
    how: ["For an element, any of its wires will do."],
  },
  optimizerLimits: {
    title: "Limits of the variable",
    what: "Within which limits the optimizer may change the quantity.",
    table: {
      title: "Default",
      rows: [
        ["Length", "±10% of the current length"],
        ["Position", "±10% of the element length"],
        ["Load", "±50%"],
        ["Phase", "±90°"],
      ],
    },
  },
  optimizerStep: {
    title: "First step",
    what: "The step the search starts with.",
    table: {
      title: "Default",
      rows: [
        ["Length, position", "1% of the element length"],
        ["Load", "5% of the value"],
        ["Phase", "5°"],
      ],
    },
    how: [
      "After a successful step the next one is 1.5 times larger, but not more than 4 times the first.",
      "When no step helps, the steps are halved.",
      "The search ends when the steps become 32 times smaller than the first ones.",
    ],
    howTitle: "How the search goes",
  },
  goals: {
    title: "Goal weights",
    what: "How important each goal is. The optimizer looks for the model with the highest score: the sum of the goal scores multiplied by their weights.",
    how: ["A weight of 0 turns the goal off.", "Only the ratio matters: SWR 10 and gain 5 means that matching is twice as important."],
    defaults: "Gain 5, front/back 3, SWR 5, the rest 0.",
  },
  goalGain: {
    title: "Gain weight",
    what: "Every decibel of the highest gain gives a point.",
    how: ["Without other goals, the optimizer will sacrifice SWR and front/back for gain."],
    defaults: "5.",
  },
  goalFrontToBack: {
    title: "Front/back weight",
    what: "Every 3 dB of front/back gives a point.",
    how: ["Anything over 30 dB does not count: such a deep null is narrow, and a real antenna will not hold it."],
    defaults: "3.",
  },
  goalSwr: {
    title: "SWR weight",
    what: "SWR takes points away: the higher it is, the more it takes.",
    table: {
      title: "How much it takes",
      rows: [
        ["SWR 1.4", "2 points"],
        ["SWR 2", "4 points"],
        ["SWR 4", "8 points"],
      ],
    },
    how: ["SWR is computed relative to the “Line, Ω” field, for the first source with a voltage."],
    defaults: "5.",
  },
  goalReactance: {
    title: "Reactance weight",
    what: "Every 20 Ω by which the input reactance differs from the target X takes a point away. With a target X = 0, it pulls the antenna to resonance at the model frequency.",
    how: [
      "Useful when a matching device transforms the resistance by itself and only X has to be removed.",
      "For a hairpin, set the target X that the “Matching” tab gives, and make the length of the driven element the variable.",
    ],
    defaults: "0, off.",
  },
  goalReactanceTarget: {
    title: "Target X, Ω",
    what: "The input reactance that the optimizer pulls the antenna towards.",
    how: [
      "0: resonance.",
      "Negative: the driven element is a little too short, capacitive; a hairpin (beta match) needs this.",
      "The field appears when the reactance weight is above zero.",
    ],
    defaults: "0 Ω.",
  },
  goalElevation: {
    title: "Elevation angle weight",
    what: "Every 3° between the angle of the maximum and the target angle takes a point away.",
    how: ["Makes sense over ground, when the height or the position along Z changes."],
    defaults: "0, off.",
  },
  goalTarget: {
    title: "Target angle, °",
    what: "The angle above the horizon that the optimizer pulls the maximum of the pattern towards.",
    how: ["The field appears when the angle weight is above zero."],
    defaults: "15°.",
  },
  optimizerRun: {
    title: "Optimize",
    what: "Starts the search.",
    how: [
      "Each variable in turn takes a step both ways; a step that improves the score is kept.",
      "The best model shows at once; the search can be stopped at any time.",
      "“Restore the start” brings back the model that the search started from.",
    ],
  },

  tabView: {
    title: "View and patterns",
    what: "The antenna in space and two radiation patterns.",
    how: ["The ↗ button spreads a card over the whole workspace; Esc puts it back."],
  },
  tabCurrents: {
    title: "Currents",
    what: "The magnitude and phase of the current along every element of the antenna, from the last computation.",
    how: ["The currents are RMS values at 100 W of fed power, so they can be compared between antennas."],
  },
  tabSweep: {
    title: "Sweep",
    what: "SWR and input impedance at many frequencies: resonance and the usable bandwidth.",
  },
  tabMatching: {
    title: "Matching",
    what: "How to match the antenna to the line at the model frequency: an L network, a hairpin for a Yagi and a quarter-wave transformer, with the dimensions and values of the parts.",
    how: ["Takes the input impedance from the last computation."],
  },
  tabOptimizer: {
    title: "Optimizer",
    what: "Automatic selection of dimensions, loads and phases for the chosen goals.",
  },
  tabReport: {
    title: "NEC-2 report",
    what: "The full text report of the NEC-2 engine from the last computation: structure, currents, input parameters, pattern.",
    how: ["Useful for checking and for comparing with other programs."],
    howTitle: "Good to know",
  },
};
