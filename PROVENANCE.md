# Provenance

Where the code of this repository comes from, when that is not plain from the code itself. The NEC-2 engine has its own account in its repository, [nec2-rs](https://github.com/CyberDev-space/nec2-rs).

## Leeson's equivalent cylinder (`src/leeson.ts`)

The correction for elements of tubes of several diameters was written in a clean room, as the engine was.

- The method is described in D. B. Leeson, "Physical Design of Yagi Antennas" (ARRL, 1992), chapters 8 to 11, and implemented in a FORTRAN routine that the ARRL distributes with the 23rd edition of its Antenna Book. Both are under the copyright of the ARRL. Neither of them, and nothing taken from them, is in this repository.
- A separate reader, the dirty side, read the routine, the documentation of the scaling utility of the ARRL and the book, and wrote a specification of the mathematics: the formulas, the constants, the conditions and the edge cases, and test vectors, among them the worked examples printed in the book. It holds no code, no names from the routine and nothing of its organisation, and it was checked for word sequences shared with the sources.
- The owner of the project reviewed the specification on 2026-11-22 before the clean side read it.
- The clean side, which has read neither the routine nor the book, wrote `src/leeson.ts` from the specification alone. `src/leeson.test.ts` checks it against the vectors of the specification to seven significant digits.
- Where the specification left the choice open, the code follows the sources: the rounded constants, the constant c₁ = 4253 (the product that defines it gives 4452.94, which makes the equivalent diameter 0.2 to 0.3 percent smaller), no iteration, and an element of one section is its own cylinder.
- How a modelling program uses the cylinders, and which elements it gives them to, is the design of this project (`substitute` in `src/deck.ts`): straight elements symmetric about their centre, fed at the centre or not at all, without loads or other wires on them, and between 0.4 and 0.6 wavelengths long.
- The specification and the notes of the dirty side are kept outside this repository.

## The dimensions of the templates (`src/templates.ts`)

The tables of the Yagis and the quads of several elements were found with this program and its engine, not taken from a published design. A search of Nelder and Mead from several starts varied the sizes of the parasitic elements and the spacings, cut the driven element to resonance at every step, and made the least gain over ±1.5 % of the frequency as large as it could while the least front-to-back ratio there stayed at its target and the SWR within 1.5. The search ran in free space, for elements a thousandth of a wavelength thick. The single-element antennas are plain geometry, cut to resonance by the engine when they are made.
