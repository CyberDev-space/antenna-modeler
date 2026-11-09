# antenna-modeler

Working title. A program for modeling wire antennas in the browser: as easy to use as MMANA, with the accuracy of NEC-2 and a real ground.

## Status

The computing engine is ready and tested: it is a separate project, [nec2-rs](https://github.com/CyberDev-space/nec2-rs), and runs in the browser as the WebAssembly package [nec2-wasm](https://www.npmjs.com/package/nec2-wasm).

The program itself is in development. This works now:

- **The model.** A table of wires as in MMANA: ends in metres, radius in millimetres, automatic segmentation. Sources written as `w1c`, each with its phase and voltage, so that a phased array such as HB9CV can be modelled. Loads: a coil, a capacitor, a trap (a coil and a capacitor in parallel) with a quality factor, or a fixed R + jX. The material of the wires: no loss, copper, aluminium or a conductivity of your own. The ground: free space, perfect or real, with the height that MMANA calls "Add height".
- **The results for one frequency.** Input impedance and SWR of every source, with the share of the power that it gives, gain, front-to-back ratio, elevation angle and azimuth of the maximum, efficiency, and two cuts of the pattern.
- **A sweep over frequency.** SWR, R and X against frequency, the frequency of the lowest SWR and the band where the SWR stays below 2. Coils, capacitors and traps follow the frequency.
- **A view of the antenna in space**, over the ground when there is one, with the sources and the loads marked, and the pattern in space coming out of the feed point: its distance from there and its colour show the gain, on the same scale of 40 dB as the polar plots, and its maximum reaches as far as the part of the antenna farthest from the feed point.
- **Currents on the wires.** In the view in space a curve over every wire shows the magnitude of the current along it. A tab of its own charts the magnitude and the phase along any element (a wire, or the wires that go on from it in one line), with the largest current and where it is. The currents are root mean square values for 100 W fed into the antenna, so that they read as an RF ammeter would; at the feed point of a dipole they put exactly 100 W into its input resistance. An element computed as Leeson's cylinder has the current of the cylinder stretched over its tubes.
- **An optimizer**, as in MMANA. It varies the length or the position of an element (a wire with the wires that go on from it in one line, so that the tubes of an element stay together), the values of loads and the phases of sources, each within limits. The goals are gain, front-to-back ratio, SWR, reactance and elevation angle, each with a weight. Every variable in turn takes a step either way, a step that improves the score is kept, and the steps are halved when none does. The ends of other wires joined to an element move with it. The best model and its results are shown while it searches, with its two cuts of the pattern under the settings, and the model can be put back as it was. A 5-element Yagi for 2 m, moved to 145.5 MHz, comes back to SWR 1.0 and 35 dB front-to-back in a few seconds.
- **A workspace that fills the window.** On a wide screen the model is edited on the left, the main numbers stay in view above the workspace, and its tabs hold the view in space with the two cuts of the pattern, the sweep, the optimizer and the report of the engine. Every chart and the view can be spread over the whole workspace to look at them in detail; the charts are drawn at the size they are given, so their text stays legible. On a large screen the text and the labels of the charts grow with it, and lines of text stay short enough to read. On a narrow screen everything is in one column.
- **A sheet for building, as PDF.** One button prints a sheet, or saves it as PDF through the dialog of printing: the frequency, the ground and the material, the results, a drawing of the antenna with the numbers of its elements, their lengths and the spacings along the boom in millimetres, and a scale, the elements with their lengths and tubes in millimetres, where they sit along the boom, every wire, the sources and loads, the two cuts of the pattern and the last sweep. Results that are out of date are computed first.
- **Help over every name.** Resting the pointer on the name of a field, a column, a result or a button pops up what it is, how to set it, what it changes and its default, with tables of typical values where they help. Names with help are underlined with dots. A switch in the top bar turns the help off for those who know the program, and the browser remembers the choice.
- **Files.** Antenna files of MMANA (`.maa`) are opened and written. A model is saved in a JSON format of its own, which holds everything. The cards of NEC-2 are exported for other programs (`.nec`).
- **Segments that suit NEC-2.** Wires get equal segments of about a fortieth of a wavelength. A load gets a short segment of its own, with segments beside it as short that then double, because NEC-2 spreads a load over its segment. A source or a load on the joint of two wires sits on the joint itself, as in MMANA, half in each of the two segments that meet there. With this a trap dipole resonates within a few kilohertz of a model with ten times the segments, where equal segments put it 80 kHz lower.
- **Leeson's correction for tubes of several diameters.** NEC-2 computes the steps between tubes of different diameters poorly, and the elements of a Yagi of telescoping tubes come out electrically long. Every straight element that is symmetric about its centre, fed at its centre or not at all, without loads or other wires on it, and between 0.4 and 0.6 wavelengths long, goes to the engine as the equivalent cylinder of D. B. Leeson ("Physical Design of Yagi Antennas", ARRL 1992), the method behind the stepped-diameter correction of EZNEC: one uniform wire that resonates at the same frequency and whose reactance changes with frequency at the same slope. The model, the drawing and the sheet keep the real tubes, and a warning says why an element was left as it is. The tapered 4-element Yagi for 20 m of the library of MMANA goes from 27.1 + j15.3 to 25.3 + j3.7 ohms with it, and its front-to-back ratio from 16.3 to 19.9 dB. The code reproduces the worked examples of the book; how it was written is told in [PROVENANCE.md](PROVENANCE.md).
- **Checks before the engine runs.** A model that cannot be computed gets a message in plain words: a wire on the ground or under it, a source beyond the end of its wire, two sources in one segment, which NEC-2 would quietly merge. A model that NEC-2 computes with less accuracy gets a warning: segments that are too long, or too short for their radius, a wire that touches a real ground.

Not there yet: a link that holds a model. The interface is in Ukrainian.

### What a file of MMANA loses

MMANA and this program do not model the same things, so a `.maa` file does not carry everything across. When a file is opened, the page lists what it left out:

- a wire of tubes of several diameters (a negative R, which points to the taper wire set) becomes one wire for every tube, and the types with an asterisk, whose meaning the help of MMANA does not give, are read as those without it. NEC-2 is known to be inaccurate where tubes of different diameters meet; the Leeson correction (see above) takes care of the elements that it suits;
- a wire with the radius 0, which MMANA uses as an insulator, is left out;
- a load that is given as a polynomial (the type "S") is left out;
- the automatic segmentation is the one of this program, described above; MMANA tapers its segments towards bends and ends, and its settings for that are not read.

A `.maa` file does not hold the parameters of a real ground or the range of the sweep. Save the model in the format of the program to keep them.

## Checked against MMANA-GAL

`DP20.MAA` is the dipole of the library that comes with MMANA-GAL: 10.34 m of wire for 14.05 MHz. The numbers of MMANA-GAL are those that the [tutorial of NH7O](https://www.tcpsas.com/sezioneIV/MMANA-GAL/docs/quickstart.pdf) prints for it.

| | MMANA-GAL | This program |
|---|---|---|
| Free space, no loss | 71.5 Ω, SWR 1.43, 2.13 dBi | 71.7 − j2.3 Ω, SWR 1.44, 2.14 dBi |
| Copper wire, 20 m over a real ground: the impedance over a perfect ground, which is how MMANA computes it | 78.6 Ω, SWR 1.61 | 78.1 − j9.6 Ω, SWR 1.60 |
| The same over the real ground itself | — | 75.1 − j6.8 Ω, SWR 1.52 |
| Elevation angle of the lobe over the real ground | 14.9° | 14.9° |

The program reads the file of MMANA and gives its numbers where the two programs model the same thing. The third row is what the real ground changes: 3.5 Ω at this height of almost a wavelength, and much more for a low antenna, as the example below shows. The tests of the program hold these numbers.

## Run it

It needs a current Node (22 or newer).

```sh
npm install
npm run dev      # the page at http://localhost:5173
npm test         # the tests, the example through the engine among them
npm run build    # the files of the site in dist/
```

The computation runs in a Web Worker, so the page stays responsive. The model is kept in the storage of the browser between visits; save it to a file to keep it for good.

## Why

- **MMANA-GAL** is the most popular antenna program among Ukrainian radio amateurs. But it runs only on Windows, its source is closed, and it computes the impedance of an antenna over a perfect ground (its engine is MININEC). For low HF antennas the error is noticeable.
- **xnec2c, 4nec2 and EZNEC** use the NEC-2 engine with a real ground. But a model is entered there as NEC cards, which is hard for a beginner. 4nec2 and EZNEC run only on Windows and are no longer developed.

The goal: a table of wires as in MMANA, NEC-2 with a Sommerfeld ground, a program that runs in the browser, an interface in Ukrainian, and import of `.maa` files.

## Example: what a real ground changes

A horizontal dipole for 14.2 MHz (10.1 m long, wire 2 mm in diameter) 3 m above the ground, which is 0.14 wavelengths:

| Ground | Input impedance | Gain towards the zenith |
|---|---|---|
| Perfect | 39 + j12 Ω | 8.6 dBi |
| Average (ε = 13, σ = 0.005 S/m) | 58 − j3 Ω | 5.4 dBi |

A perfect ground is what MMANA uses for the impedance. The difference between the two rows is the error that a real ground removes.

The numbers are computed with nec2-rs. This is the model, to check them (for the perfect ground the ground card is `GN 1`):

```
CM Horizontal dipole for 14 MHz, 3 m above the ground
CE
GW 1 21 0 -5.05 3 0 5.05 3 0.001
GE 0
GN 2 0 0 0 13 0.005
EX 0 1 11 0 1 0
FR 0 1 0 0 14.2 0
RP 0 4 1 1000 0 0 30 0
EN
```

## Stack

| Layer | Choice |
|---|---|
| User interface | TypeScript, React, Vite |
| Engine | our own NEC-2 engine in Rust, [nec2-rs](https://github.com/CyberDev-space/nec2-rs) (MIT license), compiled to WebAssembly and hidden behind an interface of its own |
| Parallelism | a Web Worker runs the engine; a pool of workers for the points of a sweep and the variants of the optimizer is planned |
| 3D | three.js |
| Charts | our own SVG: line charts for sweeps and polar plots for patterns; a Smith chart is planned |
| Format | our own JSON; import and export of `.maa`; export of `.nec`; a link that holds a model is planned |
| Tests | Vitest; reference results from nec2c |
| License | MIT, like the engine |

At first the engine was to be the ready-made package [`@necpp-engine/wasm`](https://www.npmjs.com/package/@necpp-engine/wasm) (NEC2++, GPL). On 2026-11-21 it was decided to write an engine of our own instead: a port of the public-domain nec2c to Rust. The code of NEC2++ and xnec2c is not read for it. The rules are in [PROVENANCE.md](https://github.com/CyberDev-space/nec2-rs/blob/main/PROVENANCE.md) of nec2-rs.

A fork of xnec2c does not fit. Its interface is GTK, and its parallel computation uses `fork()`. Neither works in a browser.

## What must be as easy as in MMANA

1. A table of wires: coordinates, radius, number of segments (−1 means "automatic"), wire ends that snap to other wires, the source written as `w1c`.
2. Automatic segmentation, and warnings when a model goes beyond the limits of NEC-2.
3. One "Compute" button. The result: impedance, SWR, gain, front-to-back ratio, elevation angle of the radiation, patterns.
4. Ground: free space, perfect or real.
5. An optimizer with goals and weights.
6. Import of `.maa` files.
