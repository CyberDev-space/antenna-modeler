import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { summarize, type Summary } from "./analysis";
import { LoadTable } from "./components/LoadTable";
import { OptimizerPanel } from "./components/OptimizerPanel";
import { Card } from "./components/Card";
import { HelpProvider, HelpSwitch, Hint } from "./components/Help";
import { PrintSheet, type SheetSweep } from "./components/PrintSheet";
import { PatternCards, SummaryTiles } from "./components/Results";
import { Settings } from "./components/Settings";
import { SourceTable } from "./components/SourceTable";
import { SweepPanel } from "./components/SweepPanel";
import { WireTable } from "./components/WireTable";
import type { Output } from "nec2-wasm";
import { buildDeck, exportDeck, type Deck } from "./deck";
import { solve, type Failure } from "./engine";
import { download, encodeAnsi, fileName, openModel, readText, restoreModel, saveModel } from "./files";
import { exportMaa } from "./maa";
import { defaultModel, formatPulse, resultKey, sweepKey, type Model } from "./model";
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

/** The tabs of the workspace. */
const TABS = [
  ["view", "Вигляд і діаграми", "tabView"],
  ["sweep", "Розгортка", "tabSweep"],
  ["optimizer", "Оптимізація", "tabOptimizer"],
  ["report", "Звіт NEC-2", "tabReport"],
] as const;
type Tab = (typeof TABS)[number][0];

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
  const [tab, setTab] = useState<Tab>("view");
  const [lastSweep, setLastSweep] = useState<(SheetSweep & { key: string }) | null>(null);

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

  // Ctrl+Enter computes from anywhere on the page.
  const computeRef = useRef(compute);
  computeRef.current = compute;
  const canCompute = !running && deck.errors.length === 0;
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canCompute) {
        event.preventDefault();
        void computeRef.current();
      }
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, [canCompute]);

  const stale = solved !== null && solved.model !== key;

  /** The sheet for building, as PDF through the dialog of printing; results that are out of date are computed first. */
  async function printSheet() {
    if ((!solved || stale) && canCompute) await compute();
    // The sheet shows the new results once the page has drawn them.
    setTimeout(() => window.print(), 200);
  }
  // A failure says nothing about a model that was changed since.
  const problems = deck.errors.length > 0 ? deck.errors : failure?.model === key ? failure.lines : null;

  const patternsClass = ["patterns", solved?.overGround && "over-ground", stale && "stale"].filter(Boolean).join(" ");

  return (
    <HelpProvider>
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Моделювання антен</h1>
          <span>NEC-2 з реальною землею</span>
        </div>
        <label className="name-field">
          <span className="sr-only">Назва моделі</span>
          <Hint topic="name">
            <input
              type="text"
              className="text"
              placeholder="Назва моделі"
              value={model.name}
              onChange={(event) => setModel({ ...model, name: event.target.value })}
            />
          </Hint>
        </label>
        <div className="file-actions">
          <Hint topic="open">
            <label className="button">
              Відкрити
              <input type="file" accept=".maa,.json" onChange={open} />
            </label>
          </Hint>
          <Hint topic="save">
            <button type="button" onClick={() => save("json")}>
              Зберегти
            </button>
          </Hint>
          <Hint topic="exportMaa">
            <button type="button" aria-label="Експорт у файл MMANA" onClick={() => save("maa")}>
              .maa
            </button>
          </Hint>
          <Hint topic="exportNec">
            <button type="button" aria-label="Експорт у картки NEC-2" onClick={() => save("nec")} disabled={deck.errors.length > 0}>
              .nec
            </button>
          </Hint>
          <Hint topic="example">
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
          </Hint>
        </div>
        <HelpSwitch />
        <Hint topic="pdf">
          <button type="button" onClick={printSheet}>
            PDF
          </button>
        </Hint>
        <Hint topic="compute">
          <button type="button" className="primary compute" onClick={compute} disabled={!canCompute} aria-keyshortcuts="Control+Enter">
            {running ? "Рахую…" : "Розрахувати"}
          </button>
        </Hint>
      </header>

      <aside className="editor" aria-label="Модель">
        {fileNote && (
          <ul className={fileNote.failed ? "messages errors" : "messages opened"}>
            <li>{fileNote.title}</li>
            {fileNote.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {deck.warnings.length > 0 && (
          <ul className="messages warnings">
            {deck.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        <h2>Дроти</h2>
        <WireTable wires={model.wires} segments={deck.segments} equivalents={deck.equivalents} onChange={(wires) => setModel({ ...model, wires })} />
        <h2>Джерела</h2>
        <SourceTable sources={model.sources} onChange={(sources) => setModel({ ...model, sources })} />
        <h2>Навантаження</h2>
        <LoadTable loads={model.loads} onChange={(loads) => setModel({ ...model, loads })} />
        <h2>Частота, земля, матеріал</h2>
        <Settings model={model} onChange={setModel} equivalents={deck.equivalents} />
      </aside>

      <main className="workspace">
        <section className={stale ? "results-strip stale" : "results-strip"} aria-label="Результати" aria-live="polite">
          {problems && (
            <ul className="messages errors">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {!solved && !problems && <p className="note">Натисніть «Розрахувати» або Ctrl+Enter.</p>}
          {solved && (
            <>
              {stale && <p className="note">Модель змінено: ці результати належать попередній.</p>}
              <SummaryTiles summary={solved.summary} sources={solved.sources} reference={solved.reference} lossy={solved.lossy} />
              {solved.warnings.length > 0 && (
                <ul className="messages warnings">
                  {solved.warnings.map((warning) => (
                    <li key={warning}>Ядро: {warning}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <nav className="tabs" role="tablist" aria-label="Робоча область">
          {TABS.map(([id, label, topic]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              className={tab === id ? "tab active" : "tab"}
              onClick={() => setTab(id)}
            >
              <Hint topic={topic}>{label}</Hint>
            </button>
          ))}
        </nav>

        {/* Every panel stays mounted, so that a sweep, the optimizer and the camera keep their state. */}
        <div className="tab-panel view-panel" role="tabpanel" id="panel-view" aria-labelledby="tab-view" hidden={tab !== "view"}>
          <Card title="Вигляд" className="view-card">
            <Suspense fallback={<p className="note">Завантажую…</p>}>
              <View3D model={model} marks={deck.marks} pattern={solved && !stale ? solved.pattern : null} />
            </Suspense>
          </Card>
          {solved ? (
            <div className={patternsClass}>
              <PatternCards summary={solved.summary} overGround={solved.overGround} />
            </div>
          ) : (
            <div className="patterns empty">
              <p className="note">Діаграми спрямованості з'являться після розрахунку.</p>
            </div>
          )}
        </div>

        <div className="tab-panel" role="tabpanel" id="panel-sweep" aria-labelledby="tab-sweep" hidden={tab !== "sweep"}>
          <SweepPanel model={model} onChange={setModel} onResult={setLastSweep} />
        </div>

        <div className="tab-panel scroll optimizer-tab" role="tabpanel" id="panel-optimizer" aria-labelledby="tab-optimizer" hidden={tab !== "optimizer"}>
          <OptimizerPanel
            model={model}
            onBetter={(better, evaluation) => {
              setModel(better);
              present(better, evaluation.deck, evaluation.output, evaluation.milliseconds);
            }}
            onRestore={setModel}
          />
          {/* The patterns of the best model so far fill the rest. */}
          {solved && (
            <div className={`${patternsClass} beside`}>
              <PatternCards summary={solved.summary} overGround={solved.overGround} />
            </div>
          )}
        </div>

        <div className="tab-panel report-panel" role="tabpanel" id="panel-report" aria-labelledby="tab-report" hidden={tab !== "report"}>
          {solved ? (
            <>
              <p className="note">Звіт ядра NEC-2 за останнім розрахунком ({solved.milliseconds.toFixed(0)} мс).</p>
              <pre>{solved.report}</pre>
            </>
          ) : (
            <p className="note">Звіт з'явиться після розрахунку.</p>
          )}
        </div>
      </main>
    </div>

    {/* Outside the application, which printing hides. */}
    <PrintSheet
      model={model}
      deck={deck}
      results={solved}
      stale={stale}
      sweep={lastSweep && lastSweep.key === sweepKey(model) ? lastSweep : null}
    />
    </HelpProvider>
  );
}
