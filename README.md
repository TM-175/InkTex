# InkTex

A local-first desktop LaTeX editor. Monaco on the left, live PDF on the right,
your files on your own disk — no account, no sync, no network.

InkTex drives the TeX distribution you already have installed. It does not
bundle one, and it never uploads your documents anywhere.

---

## Features

**Projects**
Open any folder as a project. Create new ones from six templates (article,
report, book, résumé, Beamer, homework). Recent projects are remembered, and the
last one reopens on launch with its tabs restored.

**Editor**
Monaco with a purpose-built LaTeX grammar: syntax highlighting for control
sequences, math mode and environments; bracket matching; folding on
`\begin`/`\end`; multiple cursors; find and replace; VS Code keybindings;
configurable auto-save.

**PDF preview**
PDF.js in a side-by-side split. Continuous scrolling, fit-width and fit-page,
zoom, page navigation, and — on recompile — your scroll position is preserved.

**Compilation**
`latexmk` (driving pdfLaTeX, XeLaTeX or LuaLaTeX), or any of those engines
directly with InkTex scheduling the passes and the BibTeX/Biber run. Compile on
demand or automatically after an idle delay. Cancel a running build; overlapping
builds are refused rather than queued.

**Problems**
Compiler output is parsed into structured errors and warnings. Clicking one
jumps to the exact source line. Terse TeX phrasing is rewritten into something
actionable — a missing `tikz.sty` becomes "Missing package *tikz*. Install it
with `tlmgr install tikz`."

**Quality of life**
Command palette (`⌘⇧P`), fuzzy file open (`⌘P`), snippet picker, keyboard
reference, drag-and-drop to open a project or import an image, auxiliary-file
cleanup, PDF export, reveal in Finder, open a terminal in the project folder,
and a recent-build history.

---

## Requirements

| | |
|---|---|
| **OS** | macOS 10.15+, Windows 10+, or Linux |
| **TeX** | MacTeX, TeX Live, or MiKTeX — with `latexmk` for the default compiler |
| **Node** | 20.19+ (to build from source) |
| **Rust** | 1.77+ stable (to build from source) |

InkTex runs fine without TeX installed — you can read and edit — but compiling
needs a distribution. See [docs/INSTALLATION.md](docs/INSTALLATION.md).

---

## Quick start

```bash
git clone <your-repo> InkTex
cd InkTex
npm install

npm start          # run in development
npm run bundle     # build a distributable app
```

`npm start` opens the app with hot reload for the frontend; edits to Rust
trigger a rebuild and relaunch.

`npm run bundle` produces a native installer under
`src-tauri/target/release/bundle/` — a `.dmg` on macOS, `.msi`/`.exe` on
Windows, `.deb`/`.AppImage` on Linux.

### All scripts

| Script | Does |
|---|---|
| `npm start` | Run the desktop app in development (`tauri dev`) |
| `npm run bundle` | Build and package the app for distribution |
| `npm run dev` | Vite only — the UI in a browser, with no backend |
| `npm run build` | Type-check and build the frontend bundle |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run rust:check` | `cargo check` on the backend |
| `npm run rust:clippy` | Lint the backend, warnings as errors |
| `npm run rust:fmt` | Format the Rust sources |

Backend tests: `cargo test --manifest-path src-tauri/Cargo.toml` — 30 unit
tests plus 4 integration tests that drive the compile engine against a stub
toolchain, so they pass with no TeX installed.

---

## Keyboard shortcuts

`mod` is ⌘ on macOS, Ctrl elsewhere. Press `mod+shift+/` in the app for the
full list.

| | |
|---|---|
| `mod+shift+P` | Command palette |
| `mod+P` | Quick open file |
| `mod+S` | Save |
| `mod+Enter` | Compile |
| `mod+shift+Enter` | Force full recompile |
| `mod+B` | Toggle file explorer |
| `mod+shift+V` | Toggle PDF preview |
| `mod+J` | Toggle bottom panel |
| `mod+shift+I` | Insert snippet |
| `mod+E` | Export PDF |
| `mod+,` | Settings |

Editing shortcuts are Monaco's, so anything you know from VS Code applies —
`Alt+Click` for a second cursor, `Alt+↑/↓` to move a line, `mod+/` to comment.

---

## How compilation works

Set a main document (right-click a `.tex` file → **Set as main document**;
InkTex also guesses, honouring a `% !TeX root =` comment). Then:

- **latexmk** — InkTex runs `latexmk -pdf|-pdfxe|-pdflua -interaction=nonstopmode
  -file-line-error -outdir=… <main>` and lets latexmk decide how many passes the
  document needs and when to run BibTeX or Biber.
- **A direct engine** — InkTex schedules the passes itself: one pass, then a
  bibliography pass if the document cites anything, then reruns until
  cross-references stop changing (up to five passes).

Auxiliary files go to `.inktex-build/` by default, keeping your project folder
clean; turn that off in **Settings → Compilation** if a package needs its output
beside the sources.

Two details worth knowing, both handled for you:

- A GUI app on macOS does not inherit your shell's `PATH`, so `latexmk` would
  normally be invisible to it. InkTex searches `/Library/TeX/texbin`, the
  TeX Live year/arch directories, Homebrew prefixes and the MiKTeX locations in
  addition to `PATH`.
- TeX wraps log lines at 79 columns, which splits error messages mid-word.
  InkTex sets `max_print_line` so the log parser sees whole messages.

---

## Where your data lives

Only three things are stored outside your project folder:

| File | Contents |
|---|---|
| `settings.json` | Your preferences |
| `recent-projects.json` | Recent project list |
| `session.json` | Last project and its open tabs |
| `project-overrides.json` | Per-project main document |

They are plain JSON in the platform config directory —
`~/Library/Application Support/dev.inktex.app/` on macOS,
`~/.config/dev.inktex.app/` on Linux,
`%APPDATA%\dev.inktex.app\` on Windows.

InkTex writes nothing into your project except the build directory.

---

## Documentation

- [Installation guide](docs/INSTALLATION.md) — installing TeX, building from
  source, troubleshooting
- [Architecture](docs/ARCHITECTURE.md) — how the code is organised and why

---

## License

MIT
