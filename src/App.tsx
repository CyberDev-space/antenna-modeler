import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { summarize, type Summary, type SweepPoint } from "./analysis";
import { LoadTable } from "./components/LoadTable";
import { defaultMatchingInputs, MatchingPanel, type MatchingInputs } from "./components/MatchingPanel";
import { OptimizerPanel } from "./components/OptimizerPanel";
import { Card } from "./components/Card";
import { CurrentsPanel } from "./components/CurrentsPanel";
import { ElementTable } from "./components/ElementTable";
import { HelpProvider, HelpSwitch, Hint } from "./components/Help";
import { PrintSheet, type SheetSweep } from "./components/PrintSheet";
import { PatternCards, SummaryTiles } from "./components/Results";
import { Settings } from "./components/Settings";
import { SourceTable } from "./components/SourceTable";
import { SweepPanel } from "./components/SweepPanel";
import { TemplateDialog } from "./components/TemplateDialog";
import { WireTable } from "./components/WireTable";
import type { Output } from "nec2-wasm";
import { currentLines, type CurrentLine } from "./currents";
import { buildDeck, exportDeck, type Deck } from "./deck";
import { solve, stopEngine, Stopped, type Failure } from "./engine";
import { removeWires } from "./elements";
import { placedWires } from "./geometry";
import { download, encodeAnsi, fileName, openModel, readText, restoreModel, saveModel } from "./files";
import { exportMaa } from "./maa";
import { defaultModel, formatPulse, resultKey, sweepKey, type Model } from "./model";
import type { PatternGrid } from "./pattern";
import { joinEnds } from "./segmentation";
import { type Language, N, rememberLanguage, setLanguage, startingLanguage, t } from "./i18n";
import { applyTheme, hostMessage, startingTheme, storedTheme, storeTheme, systemTheme, type PageOptions, type Theme } from "./host";
import { LOGO } from "./logo";
import { LanguageMenu, MaximizeButton, ThemeToggle } from "./components/PageControls";

// The view in space brings a large library: it is loaded after the page.
const View3D = lazy(() => import("./components/View3D").then((module) => ({ default: module.View3D })));

const STORAGE_KEY = "antenna-modeler.model";

function storedModel(): Model {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return restoreModel(JSON.parse(stored)) ?? exampleModel();
  } catch {
    // Storage that is blocked or holds something else: start from the example.
  }
  return exampleModel();
}

/** The site of the author, whose mark the page carries. */
const SITE = "https://cyberdev.space/";

/** The example, named in the language of the page. */
const exampleModel = (): Model => ({ ...defaultModel, name: t(defaultModel.name) });

/** What the page says about the file that was opened or saved last. */
interface FileNote {
  title: string;
  /** What the file could not give or hold. */
  notes: string[];
  failed?: boolean;
}

/** The results of a variant kept for comparison, drawn beside those of the model now. */
interface Pinned {
  name: string;
  summary: Summary;
  /** Its sweep, if it was swept before it was kept. */
  sweep: SweepPoint[] | null;
}

/** The tabs of the workspace. */
const TABS = [
  ["view", N("Вигляд і діаграми"), "tabView"],
  ["currents", N("Струми"), "tabCurrents"],
  ["sweep", N("Розгортка"), "tabSweep"],
  ["matching", N("Узгодження"), "tabMatching"],
  ["optimizer", N("Оптимізація"), "tabOptimizer"],
  ["report", N("Звіт NEC-2"), "tabReport"],
] as const;
type Tab = (typeof TABS)[number][0];

/** How many steps Ctrl+Z can take back. */
const HISTORY = 100;

/** Changes closer together than this, in milliseconds, as the keys of one number, are one step. */
const ONE_STEP = 800;

/** Where an event began: inside a shadow root the target that the window sees is the host of the root. */
const origin = (event: Event): EventTarget | null => event.composedPath()[0] ?? event.target;

/** Whether a key goes into a field that takes back its own typing. */
function typing(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(target.type);
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

interface Solved {
  /** The model that these results belong to, as text, to tell when they are out of date. */
  model: string;
  reference: number;
  /** MHz. */
  frequency: number;
  overGround: boolean;
  lossy: boolean;
  /** The places of the sources, to name them. */
  sources: string[];
  summary: Summary;
  pattern: PatternGrid;
  /** The currents along the elements, at the power that the currents are given for. */
  currents: CurrentLine[];
  warnings: string[];
  report: string;
  milliseconds: number;
}

/**
 * The program. On a page of its own it takes its options from the address;
 * as a component of another site, from `embed.tsx`.
 */
export function App({ options = {} }: { options?: PageOptions }) {
  const embedded = options.embedded ?? false;
  // The root of the program: its theme, the place of its popups, and what its keys belong to.
  const root = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<Language>(() => {
    const start = options.language ?? options.startLanguage ?? (embedded ? "uk" : startingLanguage());
    setLanguage(start);
    return start;
  });
  const changeLanguage = (next: Language, remember: boolean) => {
    setLanguage(next);
    if (remember) rememberLanguage(next);
    setLang(next);
  };
  const [theme, setTheme] = useState<Theme>(() => options.theme ?? options.startTheme ?? (embedded ? "light" : startingTheme()));
  /** Shows the program in a theme. The root gets it before the effects run, so the 3D view redraws in its colours. */
  const changeTheme = (next: Theme, remember: boolean) => {
    if (remember) storeTheme(next);
    setTheme(next);
  };
  // The site around the program changes its language or its theme.
  useEffect(() => {
    if (options.language) changeLanguage(options.language, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.language]);
  useEffect(() => {
    if (options.theme) setTheme(options.theme);
  }, [options.theme]);
  // On a page of its own the whole document follows: the window behind the program, its title and its language.
  useLayoutEffect(() => {
    if (!embedded) applyTheme(theme);
  }, [embedded, theme]);
  useEffect(() => {
    if (embedded) return;
    document.documentElement.lang = lang;
    document.title = `${t("Моделювання антен")} · UR3PKI · cyberdev.space`;
  }, [embedded, lang]);
  useEffect(() => {
    // The theme of the system, while the user has chosen none and no site gives one.
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (!embedded && !options.theme && !storedTheme()) changeTheme(systemTheme(), false);
    };
    scheme.addEventListener("change", follow);
    // The site that holds the page in an iframe changes its theme or its language.
    const listen = (event: MessageEvent) => {
      if (!options.listen || event.source !== window.parent) return;
      const message = hostMessage(event.data);
      if (message && "theme" in message) changeTheme(message.theme, false);
      if (message && "language" in message) changeLanguage(message.language, false);
    };
    window.addEventListener("message", listen);
    return () => {
      scheme.removeEventListener("change", follow);
      window.removeEventListener("message", listen);
    };
    // The handlers only set state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** Whether a key is for the program: on a page of its own every key is; inside another page, those pressed inside it. */
  const mine = (event: Event): boolean => !embedded || (root.current !== null && event.composedPath().includes(root.current));
  const [model, setModel] = useState<Model>(storedModel);
  const [solved, setSolved] = useState<Solved | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [fileNote, setFileNote] = useState<FileNote | null>(null);
  const [tab, setTab] = useState<Tab>("view");
  const [lastSweep, setLastSweep] = useState<(SheetSweep & { key: string }) | null>(null);
  const [matching, setMatching] = useState<MatchingInputs>(defaultMatchingInputs);
  const [editorView, setEditorView] = useState<"wires" | "elements">("wires");
  const [templates, setTemplates] = useState(false);
  const [pinned, setPinned] = useState<Pinned | null>(null);

  // The steps that Ctrl+Z takes back and Ctrl+Shift+Z brings again.
  const past = useRef<Model[]>([]);
  const future = useRef<Model[]>([]);
  const lastEdit = useRef(0);
  const [, redraw] = useState(0);

  /** Changes the model as the user does, as a step that can be taken back; `step` makes it a step of its own. */
  function edit(next: Model, step = false) {
    const now = Date.now();
    if (step || now - lastEdit.current > ONE_STEP) {
      past.current = [...past.current.slice(1 - HISTORY), model];
      future.current = [];
      redraw((count) => count + 1);
    }
    lastEdit.current = step ? 0 : now;
    setModel(next);
  }
  function undo() {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, model];
    lastEdit.current = 0;
    setModel(previous);
    redraw((count) => count + 1);
  }
  function redo() {
    const next = future.current.at(-1);
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, model];
    lastEdit.current = 0;
    setModel(next);
    redraw((count) => count + 1);
  }
  const historyRef = useRef({ undo, redo });
  historyRef.current = { undo, redo };
  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !mine(event) || typing(origin(event))) return;
      // By the place of the key, so that it works with any layout, Ukrainian too.
      if (event.code === "KeyZ" && !event.shiftKey) {
        event.preventDefault();
        historyRef.current.undo();
      } else if ((event.code === "KeyZ" && event.shiftKey) || event.code === "KeyY") {
        event.preventDefault();
        historyRef.current.redo();
      }
    };
    window.addEventListener("keydown", press);
    return () => window.removeEventListener("keydown", press);
  }, []);

  async function open(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // The same file can be chosen again.
    event.target.value = "";
    if (!file) return;
    try {
      const opened = openModel(await readText(file), model);
      edit(opened.model, true);
      setFileNote({ title: t("Відкрито {file}", { file: file.name }), notes: opened.notes });
    } catch (error) {
      setFileNote({ title: `${file.name}: ${error instanceof Error ? error.message : String(error)}`, notes: [], failed: true });
    }
  }

  // The messages of the deck are in the language of the page.
  const deck = useMemo(() => buildDeck(model), [model, lang]);
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
    setFileNote({ title: t("Збережено {file}", { file: name }), notes });
  }

  /** Shows the results of a model: of the button, or of the optimizer. */
  function present(solvedModel: Model, solvedDeck: Deck, output: Output, milliseconds: number) {
    const [job] = output.jobs;
    const solution = job.solutions[0];
    const [pattern] = solution.patterns;
    const overGround = solvedModel.ground.kind !== "free";
    setFailure(null);
    setSolved({
      model: resultKey(solvedModel),
      reference: solvedModel.reference,
      frequency: solvedModel.frequency,
      overGround,
      lossy: solvedModel.wireConductivity > 0 || solvedModel.loads.length > 0,
      sources: solvedModel.sources.map((source) => formatPulse(source.at)),
      summary: summarize(solution, solvedModel.reference, solvedDeck.feeds),
      pattern: { theta: pattern.theta, phi: pattern.phi, gain: pattern.gainTotal },
      currents: currentLines(
        joinEnds(placedWires(solvedModel)),
        solvedDeck.equivalents,
        job.segments,
        solution.currents,
        solution.power?.input ?? 0,
        overGround,
      ),
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
        setFailure({ model: key, lines: [t("Ядро зупинило розрахунок:"), output.error] });
        setSolved(null);
        return;
      }
      present(model, deck, output, performance.now() - started);
    } catch (error) {
      // A stopped computation leaves the results as they were.
      if (error instanceof Stopped) return;
      setFailure({ model: key, lines: [t("Розрахунок не вдався:"), String(error)] });
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
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && canCompute && mine(event)) {
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
    setTimeout(() => {
      const sheet = root.current?.querySelector<HTMLElement>(".print-sheet");
      if (options.print && sheet) options.print(sheet);
      else window.print();
    }, 200);
  }
  // A failure says nothing about a model that was changed since.
  const problems = deck.errors.length > 0 ? deck.errors : failure?.model === key ? failure.lines : null;

  const patternsClass = ["patterns", solved?.overGround && "over-ground", stale && "stale"].filter(Boolean).join(" ");

  return (
    <div ref={root} className="am-root" data-theme={theme}>
    <HelpProvider portal={root}>
    <div className="am-frame">
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <a className="brand-mark" href={SITE} target="_blank" rel="noopener">
            <img src={LOGO} alt="CyberDevSpace" width="30" height="30" />
          </a>
          <div className="brand-text">
            <h1>{t("Моделювання антен")}</h1>
            <a className="brand-owner" href={SITE} target="_blank" rel="noopener">
              UR3PKI · cyberdev.space
            </a>
          </div>
        </div>
        <label className="name-field">
          <span className="sr-only">{t("Назва моделі")}</span>
          <Hint topic="name">
            <input
              type="text"
              className="text"
              placeholder={t("Назва моделі")}
              value={model.name}
              onChange={(event) => edit({ ...model, name: event.target.value })}
            />
          </Hint>
        </label>
        <div className="file-actions">
          <Hint topic="open">
            <label className="button">
              {t("Відкрити")}
              <input type="file" accept=".maa,.json" onChange={open} />
            </label>
          </Hint>
          <Hint topic="save">
            <button type="button" onClick={() => save("json")}>
              {t("Зберегти")}
            </button>
          </Hint>
          <Hint topic="exportMaa">
            <button type="button" aria-label={t("Експорт у файл MMANA")} onClick={() => save("maa")}>
              .maa
            </button>
          </Hint>
          <Hint topic="exportNec">
            <button type="button" aria-label={t("Експорт у картки NEC-2")} onClick={() => save("nec")} disabled={deck.errors.length > 0}>
              .nec
            </button>
          </Hint>
          <Hint topic="templates">
            <button type="button" className="quiet" onClick={() => setTemplates(true)}>
              {t("Шаблони…")}
            </button>
          </Hint>
        </div>
        <div className="history-actions">
          <Hint topic="undo">
            <button
              type="button"
              className="quiet"
              aria-label={t("Скасувати зміну")}
              aria-keyshortcuts="Control+Z"
              onClick={undo}
              disabled={past.current.length === 0}
            >
              ↶
            </button>
          </Hint>
          <Hint topic="redo">
            <button
              type="button"
              className="quiet"
              aria-label={t("Повернути зміну")}
              aria-keyshortcuts="Control+Shift+Z"
              onClick={redo}
              disabled={future.current.length === 0}
            >
              ↷
            </button>
          </Hint>
        </div>
        {/* A site that gives the page its language or its theme has a switch of its own for it, unless the program fills the window over it. */}
        {(!options.language || options.maximized) && (
          <LanguageMenu
            language={lang}
            onChange={(next) => (options.onLanguageChange ? options.onLanguageChange(next) : changeLanguage(next, !embedded))}
          />
        )}
        {(!options.theme || options.maximized) && (
          <ThemeToggle theme={theme} onChange={(next) => (options.onThemeChange ? options.onThemeChange(next) : changeTheme(next, !embedded))} />
        )}
        {options.maximizable && <MaximizeButton maximized={options.maximized ?? false} onChange={(next) => options.onMaximize?.(next)} />}
        <HelpSwitch />
        <Hint topic="pdf">
          <button type="button" onClick={printSheet}>
            PDF
          </button>
        </Hint>
        <Hint topic="compute">
          {running ? (
            <button type="button" className="primary compute" onClick={stopEngine}>
              {t("Зупинити")}
            </button>
          ) : (
            <button type="button" className="primary compute" onClick={compute} disabled={!canCompute} aria-keyshortcuts="Control+Enter">
              {t("Розрахувати")}
            </button>
          )}
        </Hint>
      </header>

      <aside className="editor" aria-label={t("Модель")}>
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
        <div className="section-head">
          <h2>{editorView === "wires" ? t("Дроти") : t("Елементи")}</h2>
          <div className="view-switch">
            <Hint topic="viewWires">
              <button type="button" className={editorView === "wires" ? "quiet on" : "quiet"} aria-pressed={editorView === "wires"} onClick={() => setEditorView("wires")}>
                {t("Дроти")}
              </button>
            </Hint>
            <Hint topic="viewElements">
              <button
                type="button"
                className={editorView === "elements" ? "quiet on" : "quiet"}
                aria-pressed={editorView === "elements"}
                onClick={() => setEditorView("elements")}
              >
                {t("Елементи")}
              </button>
            </Hint>
          </div>
        </div>
        {editorView === "wires" ? (
          <WireTable
            wires={model.wires}
            segments={deck.segments}
            equivalents={deck.equivalents}
            onChange={(wires) => edit({ ...model, wires })}
            onRemove={(index) => edit(removeWires(model, [index]), true)}
          />
        ) : (
          <ElementTable model={model} onChange={edit} />
        )}
        <h2>{t("Джерела")}</h2>
        <SourceTable sources={model.sources} onChange={(sources) => edit({ ...model, sources })} />
        <h2>{t("Навантаження")}</h2>
        <LoadTable loads={model.loads} onChange={(loads) => edit({ ...model, loads })} />
        <h2>{t("Частота, земля, матеріал")}</h2>
        <Settings model={model} onChange={edit} equivalents={deck.equivalents} />
      </aside>

      <main className="workspace">
        <section className={stale ? "results-strip stale" : "results-strip"} aria-label={t("Результати")} aria-live="polite">
          {problems && (
            <ul className="messages errors">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {!solved && !problems && <p className="note">{t("Натисніть «Розрахувати» або Ctrl+Enter.")}</p>}
          {solved && (
            <>
              {stale && <p className="note">{t("Модель змінено: ці результати належать попередній.")}</p>}
              <SummaryTiles summary={solved.summary} sources={solved.sources} reference={solved.reference} lossy={solved.lossy} pinned={pinned?.summary} />
              {solved.warnings.length > 0 && (
                <ul className="messages warnings">
                  {solved.warnings.map((warning) => (
                    <li key={warning}>{t("Ядро: {warning}", { warning })}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {(solved || pinned) && (
            <div className="pin-bar">
              {pinned && <span className="pinned-name">{t("Порівняння: {name}", { name: pinned.name })}</span>}
              {solved && (
                <Hint topic="compare">
                  <button
                    type="button"
                    className="quiet"
                    disabled={stale}
                    onClick={() =>
                      setPinned({
                        name: model.name.trim() || t("модель без назви"),
                        summary: solved.summary,
                        sweep: lastSweep && lastSweep.key === sweepKey(model) ? lastSweep.points : null,
                      })
                    }
                  >
                    {t("Запам'ятати для порівняння")}
                  </button>
                </Hint>
              )}
              {pinned && (
                <button type="button" className="quiet" onClick={() => setPinned(null)}>
                  {t("Прибрати порівняння")}
                </button>
              )}
            </div>
          )}
        </section>

        <nav className="tabs" role="tablist" aria-label={t("Робоча область")}>
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
              <Hint topic={topic}>{t(label)}</Hint>
            </button>
          ))}
        </nav>

        {/* Every panel stays mounted, so that a sweep, the optimizer and the camera keep their state. */}
        <div className="tab-panel view-panel" role="tabpanel" id="panel-view" aria-labelledby="tab-view" hidden={tab !== "view"}>
          <Card title={t("Вигляд")} className="view-card">
            <Suspense fallback={<p className="note">{t("Завантажую…")}</p>}>
              <View3D
                theme={theme}
                model={model}
                marks={deck.marks}
                pattern={solved && !stale ? solved.pattern : null}
                currents={solved && !stale ? solved.currents : null}
              />
            </Suspense>
          </Card>
          {solved ? (
            <div className={patternsClass}>
              <PatternCards summary={solved.summary} overGround={solved.overGround} pinned={pinned?.summary} />
            </div>
          ) : (
            <div className="patterns empty">
              <p className="note">{t("Діаграми спрямованості з'являться після розрахунку.")}</p>
            </div>
          )}
        </div>

        <div className="tab-panel" role="tabpanel" id="panel-currents" aria-labelledby="tab-currents" hidden={tab !== "currents"}>
          {solved ? (
            <CurrentsPanel lines={solved.currents} model={model} stale={stale} />
          ) : (
            <p className="note">{t("Струми з'являться після розрахунку.")}</p>
          )}
        </div>

        <div className="tab-panel" role="tabpanel" id="panel-sweep" aria-labelledby="tab-sweep" hidden={tab !== "sweep"}>
          <SweepPanel model={model} onChange={edit} onResult={setLastSweep} pinned={pinned} />
        </div>

        <div className="tab-panel scroll" role="tabpanel" id="panel-matching" aria-labelledby="tab-matching" hidden={tab !== "matching"}>
          {solved ? (
            <MatchingPanel
              impedance={solved.summary.impedance}
              frequency={solved.frequency}
              reference={solved.reference}
              stale={stale}
              source={solved.sources.length > 1 ? solved.sources[solved.summary.ports.findIndex((port) => port.impedance !== null)] : null}
              inputs={matching}
              onInputs={setMatching}
            />
          ) : (
            <p className="note">{t("Узгодження з'явиться після розрахунку: йому потрібен вхідний опір антени.")}</p>
          )}
        </div>

        <div className="tab-panel scroll optimizer-tab" role="tabpanel" id="panel-optimizer" aria-labelledby="tab-optimizer" hidden={tab !== "optimizer"}>
          <OptimizerPanel
            model={model}
            onBetter={(better, evaluation) => {
              setModel(better);
              present(better, evaluation.deck, evaluation.output, evaluation.milliseconds);
            }}
            onRunStart={() => edit(model, true)}
            onRestore={(start) => edit(start, true)}
          />
          {/* The patterns of the best model so far fill the rest. */}
          {solved && (
            <div className={`${patternsClass} beside`}>
              <PatternCards summary={solved.summary} overGround={solved.overGround} pinned={pinned?.summary} />
            </div>
          )}
        </div>

        <div className="tab-panel report-panel" role="tabpanel" id="panel-report" aria-labelledby="tab-report" hidden={tab !== "report"}>
          {solved ? (
            <>
              <p className="note">{t("Звіт ядра NEC-2 за останнім розрахунком ({ms} мс).", { ms: solved.milliseconds.toFixed(0) })}</p>
              <pre>{solved.report}</pre>
            </>
          ) : (
            <p className="note">{t("Звіт з'явиться після розрахунку.")}</p>
          )}
        </div>
      </main>
    </div>

    {templates && (
      <TemplateDialog
        model={model}
        onClose={() => setTemplates(false)}
        onCreate={(made, inputs) => {
          edit(made, true);
          setFileNote({
            title: t("Створено з шаблону: {name}", { name: made.name }),
            notes: [
              made.ground.kind === "free"
                ? t("Активний елемент підрізано до резонансу у вільному просторі.")
                : t("Активний елемент підрізано до резонансу на висоті {height} м над землею цієї моделі.", { height: inputs.height }),
              t("Натисніть «Розрахувати», щоб побачити опір і діаграми."),
            ],
          });
          setTemplates(false);
        }}
      />
    )}

    {/* Outside the application, which printing hides. */}
    <PrintSheet
      model={model}
      deck={deck}
      results={solved}
      stale={stale}
      sweep={lastSweep && lastSweep.key === sweepKey(model) ? lastSweep : null}
      matching={matching}
    />
    </div>
    </HelpProvider>
    </div>
  );
}
