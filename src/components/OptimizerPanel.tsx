import type { Output } from "nec2-wasm";
import { useRef, useState } from "react";
import { summarize, type Summary } from "../analysis";
import { buildDeck, type Deck } from "../deck";
import { solve, stopEngine, Stopped } from "../engine";
import { element } from "../geometry";
import type { Model } from "../model";
import {
  check,
  defaultGoals,
  describe,
  optimize,
  read,
  score,
  type Goals,
  type Outcome,
  type Setting,
  type Variable,
} from "../optimizer";
import type { TopicKey } from "../help";
import { Hint } from "./Help";
import { NumberField } from "./NumberField";

/** A computed model: its result, and what the panel of results shows of it. */
export interface Evaluation {
  summary: Summary;
  deck: Deck;
  output: Output;
  milliseconds: number;
}

interface Props {
  model: Model;
  /** A better model, with its results to show. */
  onBetter: (model: Model, evaluation: Evaluation) => void;
  /** The model as it was before the search, to go back to. */
  onRestore: (model: Model) => void;
}

/** The search gives up after this many computations. */
const LIMIT = 400;

/** The kinds of variables, as the list offers them. */
const KINDS: { key: string; label: string; make: (target: number) => Variable }[] = [
  { key: "length", label: "Довжина елемента", make: (wire) => ({ kind: "length", wire }) },
  { key: "x", label: "Положення елемента по X", make: (wire) => ({ kind: "position", wire, axis: "x" }) },
  { key: "y", label: "Положення елемента по Y", make: (wire) => ({ kind: "position", wire, axis: "y" }) },
  { key: "z", label: "Положення елемента по Z", make: (wire) => ({ kind: "position", wire, axis: "z" }) },
  { key: "inductance", label: "Навантаження: L", make: (load) => ({ kind: "load", load, part: "inductance" }) },
  { key: "capacitance", label: "Навантаження: C", make: (load) => ({ kind: "load", load, part: "capacitance" }) },
  { key: "resistance", label: "Навантаження: R", make: (load) => ({ kind: "load", load, part: "resistance" }) },
  { key: "reactance", label: "Навантаження: X", make: (load) => ({ kind: "load", load, part: "reactance" }) },
  { key: "phase", label: "Фаза джерела", make: (source) => ({ kind: "phase", source }) },
];

const kindOf = (variable: Variable): string =>
  variable.kind === "length" ? "length" : variable.kind === "position" ? variable.axis : variable.kind === "load" ? variable.part : "phase";
const targetOf = (variable: Variable): number =>
  variable.kind === "load" ? variable.load : variable.kind === "phase" ? variable.source : variable.wire;

/** Whether what a variable names is in the model: its wire, its load or its source. */
const exists = (model: Model, variable: Variable): boolean =>
  variable.kind === "load" ? Boolean(model.loads[variable.load]) : variable.kind === "phase" ? Boolean(model.sources[variable.source]) : Boolean(model.wires[variable.wire]);

/** Four significant digits, without the noise of binary fractions. */
const round = (value: number): number => Number(value.toPrecision(4));

/** Limits and a first step around the present value of a variable. */
function around(model: Model, variable: Variable): Setting {
  const value = read(model, variable);
  const now = Number.isFinite(value) ? value : 0;
  switch (variable.kind) {
    case "length":
      return { ...variable, min: round(now * 0.9), max: round(now * 1.1), step: round(now * 0.01) };
    case "position": {
      // A tenth of the element either way, in steps of a hundredth of it.
      const [first] = element(model.wires, variable.wire);
      const size = read(model, { kind: "length", wire: first.wire });
      return { ...variable, min: round(now - size * 0.1), max: round(now + size * 0.1), step: round(size * 0.01) };
    }
    case "load": {
      const span = Math.abs(now) * 0.5 || 1;
      return { ...variable, min: round(now - span), max: round(now + span), step: round(span / 10) };
    }
    case "phase":
      return { ...variable, min: round(now - 90), max: round(now + 90), step: 5 };
  }
}

const GOALS: [key: keyof Goals, label: string, help: TopicKey][] = [
  ["gain", "Підсилення", "goalGain"],
  ["frontToBack", "Фронт/тил", "goalFrontToBack"],
  ["swr", "КСХ", "goalSwr"],
  ["reactance", "Реактивність", "goalReactance"],
  ["elevation", "Кут випромінювання", "goalElevation"],
];

const REASONS: Record<Outcome<unknown>["reason"], string> = {
  converged: "Кращого кроку немає: пошук завершено.",
  limit: `Пошук зупинено після ${LIMIT} розрахунків: можна продовжити ще раз.`,
  stopped: "Пошук зупинено.",
};

interface Status {
  evaluations: number;
  first: number | null;
  best: number | null;
  summary: Summary | null;
  reason: string | null;
}

const fixed = (value: number, digits: number): string => value.toFixed(digits).replace("-", "−");

/** The optimizer: what may vary within which limits, what to aim at, and the search itself. */
export function OptimizerPanel({ model, onBetter, onRestore }: Props) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [goals, setGoals] = useState<Goals>(defaultGoals);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [start, setStart] = useState<Model | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const stop = useRef(false);

  const replace = (index: number, setting: Setting) => setSettings(settings.map((one, i) => (i === index ? setting : one)));
  const add = () => {
    const wire = model.sources[0]?.at.wire ?? 0;
    setSettings([...settings, around(model, { kind: "length", wire: Math.min(wire, model.wires.length - 1) })]);
  };
  const weighted = GOALS.some(([key]) => goals[key] > 0);

  async function run() {
    const found = check(model, settings);
    if (!weighted) found.push("Дайте вагу хоча б одній цілі.");
    const deck = buildDeck(model);
    if (deck.errors.length > 0) found.push(...deck.errors.map((error) => `Модель не рахується: ${error}`));
    setProblems(found);
    if (found.length > 0 || settings.length === 0) return;

    stop.current = false;
    setRunning(true);
    setStart(model);
    let evaluations = 0;
    let first: number | null = null;
    setStatus({ evaluations, first, best: null, summary: null, reason: null });
    const evaluate = async (candidate: Model): Promise<Evaluation | null> => {
      evaluations++;
      setStatus((now) => now && { ...now, evaluations });
      const candidateDeck = buildDeck(candidate);
      if (candidateDeck.errors.length > 0) return null;
      const began = performance.now();
      const output = await solve(candidateDeck.text);
      if (output.error) return null;
      try {
        const summary = summarize(output.jobs[0].solutions[0], candidate.reference, candidateDeck.feeds);
        first ??= score(summary, goals);
        if (evaluations === 1) setStatus((now) => now && { ...now, first, best: first, summary });
        return { summary, deck: candidateDeck, output, milliseconds: performance.now() - began };
      } catch {
        return null;
      }
    };
    try {
      const outcome = await optimize(
        model,
        settings,
        goals,
        evaluate,
        (better, evaluation, best) => {
          onBetter(better, evaluation);
          setStatus((now) => now && { ...now, best, summary: evaluation.summary });
        },
        () => stop.current,
        LIMIT,
      );
      setStatus((now) => now && { ...now, reason: REASONS[outcome.reason] });
    } catch (error) {
      // Stopped in the middle of a computation: the best model so far is already shown.
      if (error instanceof Stopped) setStatus((now) => now && { ...now, reason: REASONS.stopped });
      else setProblems([`Пошук не вдався: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="optimizer" aria-label="Оптимізація">
      <p className="note">
        Оптимізатор по черзі змінює кожну величину на крок в обидва боки й лишає те, що покращує бал; коли не допомагає жоден крок, кроки
        зменшуються вдвічі. Елемент — це дріт разом із дротами, що продовжують його в одну лінію; кінці інших дротів, приєднані до нього,
        рухаються з ним.
      </p>
      <div className="loads">
        {settings.map((setting, index) => {
          const value = exists(model, setting) ? read(model, setting) : NaN;
          return (
            <div className="load" key={index}>
              <span className="index">{index + 1}</span>
              <label className="field">
                <span>
                  <Hint topic="optimizerKind">Що змінювати</Hint>
                </span>
                <select
                  value={kindOf(setting)}
                  onChange={(event) => {
                    const kind = KINDS.find((one) => one.key === event.target.value)!;
                    // The same number where it fits the new kind, else the first.
                    const kept = kind.make(targetOf(setting));
                    replace(index, around(model, exists(model, kept) ? kept : kind.make(0)));
                  }}
                >
                  {KINDS.map((kind) => (
                    <option key={kind.key} value={kind.key}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label={setting.kind === "load" ? "Навантаження №" : setting.kind === "phase" ? "Джерело №" : "Дріт №"}
                help="optimizerTarget"
                value={targetOf(setting) + 1}
                onChange={(number) => {
                  const kind = KINDS.find((one) => one.key === kindOf(setting))!;
                  const made = kind.make(Math.max(0, Math.round(number) - 1));
                  // Limits around the value of the new wire, load or source; one that is not there keeps the old ones until it is.
                  replace(index, exists(model, made) ? around(model, made) : { ...setting, ...made });
                }}
              />
              <NumberField label="Від" help="optimizerLimits" value={setting.min} onChange={(min) => replace(index, { ...setting, min })} />
              <NumberField label="До" help="optimizerLimits" value={setting.max} onChange={(max) => replace(index, { ...setting, max })} />
              <NumberField label="Крок" help="optimizerStep" value={setting.step} onChange={(step) => replace(index, { ...setting, step })} />
              <span className="resonance" aria-label={describe(setting)}>
                зараз {Number.isFinite(value) ? round(value) : "—"}
              </span>
              <button
                type="button"
                className="quiet remove"
                aria-label={`Вилучити змінну ${index + 1}`}
                disabled={running}
                onClick={() => setSettings(settings.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          );
        })}
        <Hint topic="optimizerAdd">
          <button type="button" onClick={add} disabled={running || model.wires.length === 0}>
            Додати змінну
          </button>
        </Hint>
      </div>

      <fieldset className="goals">
        <legend>
          <Hint topic="goals">Цілі та їхні ваги</Hint>
        </legend>
        <div className="choices">
          {GOALS.map(([key, label, help]) => (
            <NumberField key={key} label={label} help={help} value={goals[key]} onChange={(weight) => setGoals({ ...goals, [key]: Math.max(0, weight) })} />
          ))}
          {goals.elevation > 0 && (
            <NumberField label="Цільовий кут, °" help="goalTarget" value={goals.target} onChange={(target) => setGoals({ ...goals, target })} />
          )}
        </div>
      </fieldset>

      <div className="actions">
        {running ? (
          <button
            type="button"
            className="primary"
            onClick={() => {
              stop.current = true;
              stopEngine();
            }}
          >
            Зупинити
          </button>
        ) : (
          <Hint topic="optimizerRun">
            <button type="button" className="primary" onClick={run} disabled={settings.length === 0}>
              Оптимізувати
            </button>
          </Hint>
        )}
        {!running && start && (
          <button type="button" onClick={() => onRestore(start)}>
            Повернути, як було
          </button>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="messages errors">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {status && (
        <p className="note" aria-live="polite">
          Розрахунків: {status.evaluations}.
          {status.best !== null && status.first !== null && ` Бал: ${fixed(status.best, 2)} (на початку ${fixed(status.first, 2)}).`}
          {status.summary &&
            ` Найкраще: ${fixed(status.summary.gain, 2)} дБі, Ф/Т ${status.summary.frontToBack === null ? "—" : `${fixed(status.summary.frontToBack, 1)} дБ`}, КСХ ${
              Number.isFinite(status.summary.swr) ? fixed(status.summary.swr, 2) : "∞"
            }, ${fixed(status.summary.impedance[0], 1)} ${status.summary.impedance[1] < 0 ? "−" : "+"} j${Math.abs(status.summary.impedance[1]).toFixed(1)} Ом.`}
          {status.reason && ` ${status.reason}`}
        </p>
      )}
    </section>
  );
}
