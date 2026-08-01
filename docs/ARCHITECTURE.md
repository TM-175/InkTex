# Architecture

InkTex is a Tauri application: a Rust backend that owns everything touching the
operating system, and a React frontend that owns presentation and editing state.
They meet at one command list and five event channels.

---

## Windows are the unit of state

Every piece of mutable backend state — the open project, the compile slot, the
file watcher — hangs off a `WindowState` keyed by the Tauri window label, not
off the process (`state.rs`). A second window is a fully independent workspace:
opening a project in one cannot change what the other is scoped to, and a build
in one cannot block a build in the other.

Two consequences worth knowing:

- Commands take a `tauri::Window` and resolve their workspace through
  `AppState::for_window(label)`. That lookup is also the security boundary, since
  path scoping resolves against *that window's* project root.
- Events are addressed with `emit_to(label, …)` rather than broadcast, so one
  window's compile output does not appear in another's log panel.

A `Destroyed` window event tears the state down, stopping the watcher and
cancelling any build the window left running.

## The dividing line

The rule the codebase follows is: **the frontend never touches the OS, and the
backend never knows what the UI looks like.**

| Rust owns | React owns |
|---|---|
| Reading and writing files | Editor buffers and undo history |
| Locating and running the TeX toolchain | Which tab is active, what is dirty |
| Parsing compiler logs into diagnostics | How diagnostics are grouped and filtered |
| Watching the filesystem | Pane sizes, dialogs, toasts |
| Persisting preferences to disk | What a preference *means* |

That last row is the one asymmetry, and it is deliberate — see
[Settings are an opaque blob](#settings-are-an-opaque-blob).

---

## Backend (`src-tauri/src/`)

```
main.rs           Thin launcher.
lib.rs            Builder setup; the full command list; event-channel docs.

commands/         The IPC surface. Handlers stay thin: validate, scope,
  fs_ops.rs         delegate. All the real logic lives below.
  project.rs
  compile.rs
  settings.rs
  system.rs

latex/
  detect.rs       Finds the TeX distribution.
  engine.rs       Runs it; streams output; cancels it.
  log_parser.rs   Turns TeX logs into structured diagnostics.

tree.rs           Builds the project tree; guesses the main document.
watcher.rs        Debounced filesystem watching.
store.rs          Preferences, recent projects, session, per-project overrides.
paths.rs          Path normalisation and containment checks.
state.rs          Managed state: open project, compile slot, watcher handle.
models.rs         Every type crossing the IPC boundary.
error.rs          One error type, classified by kind.
```

### Path scoping is the security boundary

Every path argument arrives from the webview and is untrusted. `ProjectState`
holds the open project root, and `paths::resolve_within` resolves a candidate
path against it and proves it does not escape — including via `..` segments or a
symlink pointing outside the tree.

The lexical normaliser is careful about one case that is easy to get wrong: `..`
at a filesystem root refers to the root itself, so `/a/b/../../..` must collapse
to `/`, not `/..`. A unit test pins this.

Two commands are deliberately outside the scope, and say so: `read_pdf_file`
(the build directory may be configured outside the project, so it accepts only
`.pdf` files and validates the magic bytes) and `import_file`'s *source*
argument (it comes from a drag-and-drop elsewhere on disk).

### What gets compiled

The active tab, not a pinned main document — pressing Compile builds what you
are looking at. `resolveCompileTarget` applies two refinements: a `% !TeX root`
comment in the open file wins (a chapter that declares its parent builds the
parent), and a non-`.tex` active tab falls back to the project's main document.

### Compile speed

Three things were making builds slower than the toolchain itself:

1. **Recursive `TEXINPUTS`.** Passing `root//` makes kpathsea walk the whole
   subtree on every unresolved lookup, with no `ls-R` to consult — thousands of
   `stat` calls per pass on a project with a large `figures/` or `.git`. The
   search path is now just the project root; the working directory is already
   the root, so nested `\input` still resolves.
2. **One IPC message per output line.** A latexmk run emits thousands of lines,
   and an event each floods the webview's queue badly enough to stall the UI for
   the length of the build. Output is now batched (120 lines or 80 ms).
3. **Auto-compile firing on non-source edits**, already guarded in
   `useAutoCompile`.

### Compilation

Only one build runs at a time, per window. `CompileState` holds a single slot; a second
request is rejected with `ErrorKind::CompileBusy` rather than queued, because
concurrent `latexmk` runs against one output directory corrupt each other's
auxiliary files. The slot is released in every exit path, including a panic in
the worker — otherwise the app would refuse to compile again for the rest of the
session.

Builds run on the blocking pool, not the IPC thread, so the UI stays responsive.
Output is pumped line-by-line off two threads (stdout and stderr) and emitted as
it arrives, which is what makes the log panel fill in live.

**Cancellation** signals the whole process group, not just the child. `latexmk`
spawns the engine as a subprocess; killing only `latexmk` would leave a
`pdflatex` writing into the build directory after the user pressed Stop. On Unix
the child is spawned with `process_group(0)` and signalled with a negative PID;
on Windows, `taskkill /T`.

**Two engine strategies.** With `latexmk`, InkTex hands over the whole job —
latexmk already knows how many passes a document needs. With a direct engine it
schedules the passes itself: one pass, a bibliography pass if the `.aux` records
citations or a `.bcf` exists, then reruns until cross-references settle.

### Log parsing

TeX logs are unstructured prose. Three things make them tractable:

1. Every engine is invoked with `-file-line-error`, which prefixes most errors
   with `path:line:`.
2. `max_print_line` is set to a large value, so the engine stops hard-wrapping
   messages at 79 columns and splitting them mid-token.
3. Anything still lacking a location falls back to the `(file … )` stack TeX
   prints as it opens and closes inputs.

The parser also rewrites terse phrasing into something actionable, and
classifies over/underfull boxes as `Info` rather than `Warning` so the Problems
panel is not flooded — the UI can filter them back in.

The `.log` file is preferred over stdout for diagnostics, because latexmk
filters some lines out of what it passes through.

### Filesystem watching

One recursive watcher on the project root, debounced at 250 ms. Build artefacts
are filtered out before an event is emitted — otherwise every compile would
churn the file tree. Events carry `affectsSources`, so the frontend knows
whether to bother checking open tabs for external modification.

---

## Frontend (`src/`)

```
tauri/       The only place that calls `invoke`. Typed wrappers, one module
             per backend area, plus typed event subscriptions.

types/       Mirrors of the Rust models, plus frontend-only types.

services/    Business logic, no React. Templates, snippets, the LaTeX Monaco
             grammar, log/diagnostic shaping, settings schema, fuzzy matching.

store/       Zustand stores: settings, project (+ tabs), compile, UI shell.

hooks/       Effects that wire stores to the world: bootstrap, auto-save,
             auto-compile, file watching, keyboard, drag-and-drop, commands.

components/  Presentation, grouped by area (layout, explorer, editor, pdf,
             panels, dialogs, ui).

pages/       WelcomePage and WorkspacePage.

utils/       Pure helpers: paths, formatting, debounce, fuzzy, shell args.
```

Dependencies point one way: `components → hooks → store → services → tauri`.
A component never calls `invoke`; a service never imports React.

### Why four stores

Splitting by lifetime and blast radius, so unrelated updates do not re-render
each other:

- **`settingsStore`** — preferences. Applied to memory immediately, flushed to
  disk on a 400 ms debounce, so dragging a slider is not one write per pixel.
- **`projectStore`** — the project, tree, explorer expansion, tabs and buffers.
  The largest store, because tabs and the tree genuinely change together.
- **`compileStore`** — phase, diagnostics, streamed output, history, PDF version.
- **`uiStore`** — pane sizes, which overlay is open, toasts, confirmations.
  Opening a dialog must not re-render the editor or the preview.

### Editor state

Monaco models are keyed by file path via `@monaco-editor/react`'s `path` prop.
That is what preserves undo history and cursor position across tab switches;
recreating a model on every switch would discard both.

`services/editorBridge.ts` is a module-level handle on the live editor instance.
The snippet picker, the Problems panel and drag-and-drop import all need to act
on the editor from outside the component that owns it, and threading a ref
through the tree would couple unrelated components.

### External edits

When the watcher reports a change to an open file, the store compares content:

- Buffer matches disk → it was our own save; just update the mtime.
- Buffer is clean and differs → adopt the external edit silently.
- Buffer is dirty and differs → mark the tab `conflicted` and let the user
  choose *Keep Mine* or *Discard Mine* in a banner.

### Auto-compile guards

Three, so the CPU is not wasted:

1. Only files that affect the PDF count — editing a `.png` or a stray note does
   not schedule a build.
2. The buffer must have actually changed since the last scheduled build, so
   moving the cursor or switching tabs never triggers one.
3. Nothing is scheduled while a build is running.

### Bundle size

The frontend imports Monaco piece by piece rather than through the
`monaco-editor` root, which would pull in ~80 language definitions and the
TypeScript, JSON, HTML and CSS language services — about 9 MB of workers a LaTeX
editor never loads. `monacoSetup.ts` takes `editor/editor.api` plus
`features/register.all` (every editor contribution: find and replace, folding,
bracket matching, multi-cursor, the suggest widget) and registers only the
language definitions actually used.

Monaco and PDF.js are also `lazy()`-loaded, so the app shell paints before
either is needed.

---

## Design decisions worth explaining

### Settings are an opaque blob

The backend persists preferences as `serde_json::Value` and never interprets
one. The frontend owns the schema, its defaults and its validation
(`services/settingsService.ts`).

The alternative — mirroring twenty-odd fields in a Rust struct — would add a
second definition to keep in sync while adding no type safety at the boundary,
because the backend has no semantic use for any of them: the frontend sends a
fully-specified `CompileRequest` on every build. Per-project overrides and the
recent-projects list *are* typed, because the backend does read those.

Anything loaded from disk goes through `normalizeSettings`, which falls back
field-by-field, so one bad value never costs the user their whole configuration.

### Binary IPC for the PDF

`read_pdf_file` returns `tauri::ipc::Response`, which crosses the boundary as
raw bytes. Serialising a multi-megabyte PDF as a JSON array of numbers is the
difference between a few milliseconds and several seconds per compile.

### PDF pages render lazily

Each page is measured up front (cheap, no rasterisation) so the scrollbar is
correct, then rendered when it approaches the viewport. A 300-page thesis costs
the same to open as a one-page note. The first two pages render eagerly so the
preview is never blank after a compile.

Scroll position is preserved across reloads as a *fraction* of total height
rather than a pixel offset, so a document that gained or lost a page still lands
the reader near where they were.

Every PDF.js document owns a worker, and the teardown lives on the loading task
rather than the document proxy — a viewer that only dropped its reference would
leak a worker per compile.

### Errors are classified, not stringly-typed

`AppError` carries a `kind`, a message and an optional `hint`. The UI branches
on `kind` — a missing TeX installation gets an install call-to-action, a busy
compiler is silently ignored rather than shown as an error — instead of matching
on English prose that changes.

---

## Event channels

| Channel | Payload | Meaning |
|---|---|---|
| `compile://started` | `CompileStartedEvent` | A build began |
| `compile://output` | `CompileOutputEvent` | One line of toolchain output |
| `compile://finished` | `CompileResult` | A build ended |
| `project://fs-changed` | `FsChangeEvent` | Debounced filesystem changes |
| `project://watch-error` | `String` | The watcher could not start |

---

## Testing

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

**30 unit tests** cover the parts where correctness is not obvious by
inspection: path containment and traversal, log parsing across the formats TeX
actually emits, compiler argument assembly, main-document detection, and the
watcher's ignore rules.

**4 integration tests** (`src-tauri/tests/engine.rs`) drive the compile engine
against a stub `latexmk` shell script, so they run on a machine with no TeX
installed. They cover what unit tests cannot reach: spawning a real process,
whether the environment (`max_print_line`, the augmented `PATH`) actually
arrives, streaming and capturing its output, assembling a `CompileResult` from
the `.log` file, the two failure paths (missing main document, missing engine),
and cancellation — that one asserts a build blocked in a 30-second `sleep`
returns in under 10, which is what proves the process *group* was signalled
rather than just the `latexmk` process.

Testing the engine required making `RunContext` generic over `tauri::Runtime`
(defaulting to `Wry`) so tests can substitute the mock runtime.
