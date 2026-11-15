import { useEffect, useRef, useState } from "react";
import { solve, Stopped } from "../engine";
import type { Model } from "../model";
import { impedanceBy, KINDS, kindOf, makeTemplate, templateProblems, type TemplateInputs, type TemplateKind } from "../templates";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";
import { t } from "../i18n";

interface Props {
  /** The model now: its ground, metal and feed line stay, and the form starts at its frequency. */
  model: Model;
  onCreate: (model: Model, inputs: TemplateInputs) => void;
  onClose: () => void;
}

/** A small drawing of a kind of antenna: the front of it, or the top of a Yagi. */
function Sketch({ kind }: { kind: TemplateKind }) {
  const shapes: Record<TemplateKind, string[]> = {
    dipole: ["M6 18 H29", "M35 18 H58"],
    invertedV: ["M6 32 L29 14", "M35 14 L58 32"],
    vertical: ["M32 4 V24", "M32 27 L10 36", "M32 27 L54 36", "M32 27 L24 38", "M32 27 L40 38"],
    delta: ["M35 36 H54 L32 4 L10 36 H29"],
    quad: ["M24 6 H50 V30 H24 Z", "M24 36 H14 V12 H40 V36 H30"],
    yagi: ["M6 20 H58", "M10 4 V36", "M24 6 V34", "M38 8 V32", "M52 9 V31"],
  };
  return (
    <svg viewBox="0 0 64 40" aria-hidden="true" className="sketch">
      {shapes[kind].map((path) => (
        <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

/** The choices of the window as the user left them, for the next time it opens while the page is open. */
let last: TemplateInputs = { kind: "dipole", frequency: 14.15, height: 10, diameter: 2, elements: 3 };

/** The window of templates: an antenna made from a few numbers and cut to resonance by the engine. */
export function TemplateDialog({ model, onCreate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [inputs, setInputs] = useState<TemplateInputs>(() => ({ ...last, frequency: model.frequency }));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const kind = kindOf(inputs.kind);
  const overGround = model.ground.kind !== "free";
  const problems = templateProblems(inputs, overGround);
  const change = (next: Partial<TemplateInputs>) => {
    setFailure(null);
    setInputs((current) => (last = { ...current, ...next }));
  };
  const choose = (next: TemplateKind) => {
    const [least, most] = kindOf(next).elements;
    change({ kind: next, elements: Math.min(most, Math.max(least, inputs.elements)) });
  };

  async function create() {
    setBusy(true);
    setFailure(null);
    try {
      onCreate(await makeTemplate(inputs, model, impedanceBy(solve)), inputs);
    } catch (error) {
      if (!(error instanceof Stopped)) setFailure(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  const [least, most] = kind.elements;
  return (
    <dialog
      ref={dialog}
      className="templates"
      aria-labelledby="templates-title"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 id="templates-title">{t("Шаблони антен")}</h2>
      <fieldset className="template-kinds">
        <legend>
          <Hint topic="templateKind">{t("Антена")}</Hint>
        </legend>
        {KINDS.map((one) => (
          <label key={one.kind} className={one.kind === inputs.kind ? "template-kind on" : "template-kind"}>
            <input type="radio" name="template-kind" checked={one.kind === inputs.kind} onChange={() => choose(one.kind)} />
            <Sketch kind={one.kind} />
            <span>{t(one.name)}</span>
          </label>
        ))}
      </fieldset>
      <p className="template-description">{t(kind.description)}</p>
      <div className="template-fields">
        <NumberField label={t("Частота, МГц")} help="templateFrequency" value={inputs.frequency} onChange={(frequency) => change({ frequency })} />
        {overGround && <NumberField label={t(kind.heightLabel)} help="templateHeight" value={inputs.height} onChange={(height) => change({ height })} />}
        <NumberField label={t("Діаметр дроту, мм")} help="templateDiameter" value={inputs.diameter} onChange={(diameter) => change({ diameter })} />
        {most > least && (
          <label className="field">
            <span>
              <Hint topic="templateElements">{t("Елементів")}</Hint>
            </span>
            <select value={inputs.elements} onChange={(event) => change({ elements: Number(event.target.value) })}>
              {Array.from({ length: most - least + 1 }, (_, index) => least + index).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {(problems.length > 0 || failure) && (
        <ul className="messages errors">
          {(failure ? [failure] : problems).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="template-actions">
        <button type="button" className="quiet" onClick={() => dialog.current?.close()} disabled={busy}>
          {t("Скасувати")}
        </button>
        <button type="button" className="primary" onClick={create} disabled={busy || problems.length > 0}>
          {busy ? t("Підбираю розміри…") : t("Створити")}
        </button>
      </div>
    </dialog>
  );
}
