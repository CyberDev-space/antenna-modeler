import { lazy, Suspense, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { summarize, type Summary } from "./analysis";
import { LoadTable } from "./components/LoadTable";
import { OptimizerPanel } from "./components/OptimizerPanel";
import { Results } from "./components/Results";
import { Settings } from "./components/Settings";
import { SourceTable } from "./components/SourceTable";
import { SweepPanel } from "./components/SweepPanel";
import { WireTable } from "./components/WireTable";
import type { Output } from "nec2-wasm";
import { buildDeck, exportDeck, type Deck } from "./deck";
import { solve, type Failure } from "./engine";
import { download, encodeAnsi, fileName, openModel, readText, restoreModel, saveModel } from "./files";
import { exportMaa } from "./maa";
import { defaultModel, formatPulse, resultKey, type Model } from "./model";
import type { PatternGrid } from "./pattern";

// The view in space brings a large library: it is loaded after the page.
const View3D = lazy(() => import("./components/View3D").then((module) => ({ default: module.View3D })));

const STORAGE_KEY = "antenna-modeler.model";

function storedModel(): Model {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return restoreModel(JSON.parse(stored)) ?? defaultModel;
  } catch {
    // Storage that is blocked or holds something else: start from the example.
  }
  return defaultModel;
}

/** What the page says about the file that was opened or saved last. */
interface FileNote {
  title: string;
  /** What the file could not give or hold. */
  notes: string[];
  failed?: boolean;
}

interface Solved {
  /** The model that these results belong to, as text, to tell when they are out of date. */
  model: string;
  reference: number;
  overGround: boolean;
  lossy: boolean;
  /** The places of the sources, to name them. */
  sources: string[];
  summary: Summary;
  pattern: PatternGrid;
  warnings: string[];
  report: string;
  milliseconds: number;
}

export function App() {
  const [model, setModel] = useState<Model>(storedModel);
  const [solved, setSolved] = useState<Solved | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [fileNote, setFileNote] = useState<FileNote | null>(null);

  async function open(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be chosen again.
    event.target.value = "";
    if (!file) return;
    try {
      const opened = openModel(await readText(file), model);
      setModel(opened.model);
      setFileNote({ title: `Відкрито ${file.name}`, notes: opened.notes });
    } catch (error) {
      setFileNote({ title: `${file.name}: ${error instanceof Error ? error.message : String(error)}`, notes: [], failed: true });
    }
  }

  const deck = useMemo(() => buildDeck(model), [model]);
  const modelText = JSON.stringify(model);
  const key = resultKey(model);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, modelText);
    } catch {
      // Without storage the model lives until the page is closed.
    }
  }, [modelText]);

  function save(kind: "json" | "maa" | "nec") {
    const name = fileName(model, kind);
    let notes: string[] = [];
    if (kind === "json") {
      download(name, saveModel(model), "application/json");
    } else if (kind === "maa") {
      const exported = exportMaa(model);
      notes = exported.notes;
      // MMANA is a program for Windows: it reads Cyrillic names in the code page of Windows.
      download(name, encodeAnsi(exported.text), "application/octet-stream");
    } else {
      download(name, exportDeck(model).text, "text/plain");
    }
    setFileNote({ title: `Збережено ${name}`, notes });
  }

  /** Shows the results of a model: of the button, or of the optimizer. */
  function present(solvedModel: Model, solvedDeck: Deck, output: Output, milliseconds: number) {
    const solution = output.jobs[0].solutions[0];
    const [pattern] = solution.patterns;
    setFailure(null);
    setSolved({
      model: resultKey(solvedModel),
      reference: solvedModel.reference,
      overGround: solvedModel.ground.kind !== "free",
      lossy: solvedModel.wireConductivity > 0 || solvedModel.loads.length > 0,
      sources: solvedModel.sources.map((source) => formatPulse(source.at)),
      summary: summarize(solution, solvedModel.reference, solvedDeck.feeds),
      pattern: { theta: pattern.theta, phi: pattern.phi, gain: pattern.gainTotal },
      warnings: output.warnings,
      report: output.report,
      milliseconds,
    });
  }

  async function compute() {
    setRunning(true);
    setFailure(null);
    const started = performance.now();
    try {
      const output = await solve(deck.text);
      if (output.error) {
        setFailure({ model: key, lines: ["Ядро зупинило розрахунок:", output.error] });
        setSolved(null);
        return;
      }
      present(model, deck, output, performance.now() - started);
    } catch (error) {
      setFailure({ model: key, lines: ["Розрахунок не вдався:", String(error)] });
      setSolved(null);
    } finally {
      setRunning(false);
    }
  }

  const stale = solved !== null && solved.model !== key;
  // A failure says nothing about a model that was changed since.
  const problems = deck.errors.length > 0 ? deck.errors : failure?.model === key ? failure.lines : null;

  return (
    <main>
      <header>
        <h1>Моделювання антен</h1>
        <p>Дротяні антени на ядрі NEC-2 з реальною землею.</p>
      </header>

      <div className="column">
      <section className="model" aria-label="Модель">
        <div className="file-bar">
          <label className="field name">
            <span>Назва</span>
            <input type="text" className="text" value={model.name} onChange={(event) => setModel({ ...model, name: event.target.value })} />
          </label>
          <label className="button">
            Відкрити
            <input type="file" accept=".maa,.json" onChange={open} />
          </label>
          <button type="button" onClick={() => save("json")}>
            Зберегти
          </button>
          <button type="button" title="Файл антени для MMANA" onClick={() => save("maa")}>
            Експорт .maa
          </button>
          <button type="button" title="Картки NEC-2 для інших програм" onClick={() => save("nec")} disabled={deck.errors.length > 0}>
            Експорт .nec
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setModel(defaultModel);
              setFileNote(null);
            }}
          >
            Приклад
          </button>
        </div>
        {fileNote && (
          <ul className={fileNote.failed ? "messages errors" : "messages opened"}>
            <li>{fileNote.title}</li>
            {fileNote.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        <h2>Дроти</h2>
        <WireTable wires={model.wires} segments={deck.segments} onChange={(wires) => setModel({ ...model, wires })} />
        <h2>Джерела</h2>
        <SourceTable sources={model.sources} onChange={(sources) => setModel({ ...model, sources })} />
        <h2>Навантаження</h2>
        <LoadTable loads={model.loads} onChange={(loads) => setModel({ ...model, loads })} />
        <Settings model={model} onChange={setModel} />
        <div className="actions">
          <button type="button" className="primary" onClick={compute} disabled={running || deck.errors.length > 0}>
            {running ? "Рахую…" : "Розрахувати"}
          </button>
        </div>
        {deck.warnings.length > 0 && (
          <ul className="messages warnings">
            {deck.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="view" aria-label="Вигляд">
        <h2>Вигляд</h2>
        <Suspense fallback={<p className="note">Завантажую…</p>}>
          <View3D model={model} marks={deck.marks} pattern={solved && !stale ? solved.pattern : null} />
        </Suspense>
      </section>
      </div>

      <section className="results" aria-label="Результати" aria-live="polite">
        <h2>Результати</h2>
        {problems && (
          <ul className="messages errors">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {!solved && !problems && <p className="note">Натисніть «Розрахувати».</p>}
        {solved && (
          <div className={stale ? "stale" : undefined}>
            {stale && <p className="note">Модель змінено: ці результати належать попередній.</p>}
            <Results
              summary={solved.summary}
              sources={solved.sources}
              reference={solved.reference}
              overGround={solved.overGround}
              lossy={solved.lossy}
            />
            {solved.warnings.length > 0 && (
              <ul className="messages warnings">
                {solved.warnings.map((warning) => (
                  <li key={warning}>Ядро: {warning}</li>
                ))}
              </ul>
            )}
            <details>
              <summary>Звіт NEC-2 ({solved.milliseconds.toFixed(0)} мс)</summary>
              <pre>{solved.report}</pre>
            </details>
          </div>
        )}
      </section>

      <SweepPanel model={model} onChange={setModel} />

      <OptimizerPanel
        model={model}
        onBetter={(better, evaluation) => {
          setModel(better);
          present(better, evaluation.deck, evaluation.output, evaluation.milliseconds);
        }}
        onRestore={setModel}
      />
    </main>
  );
}
