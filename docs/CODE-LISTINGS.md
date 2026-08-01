# Code Listings

InkTex treats source code as a document element rather than text you happen to
have typed inside a `minted` environment. You should almost never write one of
those environments by hand again.

The guarantee that makes this safe: **everything is ordinary LaTeX.** There is
no InkTex document format, no sidecar database, and no lock-in. Every visual
action writes markup you could have typed yourself, and a document with all
InkTex metadata stripped compiles identically.

---

## The workflow

1. Open a LaTeX project with source files next to it.
2. Switch the sidebar to **Code Assets** (the `</>` icon).
3. Click a file to preview it and see its named regions.
4. **Insert into Document…**, then choose the whole file, a line range, or a
   region.
5. Configure the listing in the wizard — language, caption, theme, highlighted
   lines.
6. **Insert Listing**. InkTex adds any missing packages to your preamble.
7. Keep writing. Put the cursor back inside the listing to change anything.

Or skip the file entirely: **⌘⇧C** opens the wizard with an empty editor, and
pasting code into it detects the language automatically.

---

## What gets written to your document

A listing imported from a region of `src/parser.rs`:

```latex
% inktex-listing: source=src/parser.rs mode=region region=tokenize dedent=1 hash=3f9a1c02
\begin{listing}[htbp]
\begin{minted}[
  style=monokai,
  fontsize=\footnotesize,
  frame=single,
  linenos,
  firstnumber=42,
  highlightlines={3,7-9},
  breaklines,
]{rust}
fn tokenize(input: &str) -> Vec<Token> {
    …
}
\end{minted}
\caption{The tokenizer}
\label{lst:tokenize}
\end{listing}
```

The only non-standard line is the comment, and it is a comment: LaTeX ignores
it, a human can read it, and deleting it costs you nothing but the source link.

Option lists break onto separate lines once there are more than a couple,
because you are going to read this.

### The preamble

Inserting a listing adds what the document is missing, into one delimited block
placed just before `\begin{document}`:

```latex
% >>> InkTex code listings — generated, safe to edit or move
\usepackage{minted}
\usepackage{xcolor}
\definecolor{inktexmonokaiBackground}{HTML}{272822}
…
% <<< InkTex code listings
```

It is idempotent — inserting a second listing extends the block rather than
duplicating it — and it looks past the file you are editing to find the one
with `\documentclass`, so inserting into `chapters/intro.tex` still amends
`main.tex`.

> **minted needs `--shell-escape`.** It shells out to Pygments. Add
> `-shell-escape` under **Settings → Compilation → Extra arguments**, or choose
> the `listings` engine, which is pure LaTeX.

---

## Both engines are first class

`listings` ships with far fewer languages than Pygments — it has no Rust, Go,
TypeScript, JavaScript, Kotlin, Swift, JSON, YAML, CSS or Scala. Choosing it is
still never a dead end: InkTex generates a `\lstdefinelanguage` block for those,
and a `\lstdefinestyle` implementing the theme, since `listings` has no themes
at all.

`listings` also has no `highlightlines`. InkTex generates the equivalent
conditional, collapsing runs so a long selection stays readable:

```latex
linebackgroundcolor={%
  \ifnum\value{lstnumber}=3\color{inktexHighlight}\fi%
  \ifnum\value{lstnumber}>6\ifnum\value{lstnumber}<10\color{inktexHighlight}\fi\fi%
},
```

| | minted | listings |
|---|---|---|
| Languages | every Pygments lexer | built-ins, plus generated definitions |
| Themes | Pygments style names | generated from InkTex's palettes |
| Highlighted lines | native | generated conditional |
| `--shell-escape` | required | not needed |
| Theme preview accuracy | indicative | exact |

---

## Line highlighting

Click a line number in the wizard's editor to toggle it. Ranges collapse
automatically, so clicking lines 7, 8 and 9 produces `7-9`, not `7,8,9`. The
text field stays editable if you would rather type.

When a listing is imported from a range or region, the gutter is numbered from
the original file's line numbers, so what you click matches what the reader
sees — and matches the real file.

---

## Linked source files

An imported listing remembers where it came from. InkTex re-reads the source
and compares a fingerprint, showing one of:

| Status | Meaning |
|---|---|
| ✓ Up to date | The source still matches the listing |
| ⚠ Source file changed | The file was edited since import |
| ⚠ Region no longer exists | The `// region` markers were removed or renamed |
| ⚠ Source file missing | The file was moved or deleted |

The inspector offers **Refresh** (re-import the code, keeping every option you
chose) and **Break link** (keep the code, drop the tracking). The status bar
shows a count when anything has drifted.

**InkTex never writes to your source files.** Refreshing reads; it does not
push edits back.

---

## Named regions

Region markers are recognised in the forms these languages actually use:

```
// region NAME        … // endregion        C, C++, Java, Rust, Go, JS, TS, Kotlin, Swift
//#region NAME        … //#endregion        Visual Studio / VS Code
#pragma region NAME   … #pragma endregion   C, C++
# region NAME         … # endregion         Python, Bash, YAML, Ruby
-- region NAME        … -- endregion        SQL, Lua, Haskell
<!-- #region NAME --> … <!-- #endregion --> HTML, Markdown, XML
```

Nesting works. Marker lines are excluded from the import, and shared
indentation is removed by default so a region nested two levels deep still
starts flush left.

---

## The inspector

Put the cursor inside any listing — including one you wrote by hand, or a
collaborator wrote in a different editor — and **⌥⌘I** opens a panel exposing
every property: caption, label, language, theme, line numbers, highlighted
lines, frame, background, font size, source path and link status.

Applying a change regenerates that listing in place as a single undoable edit.
Options InkTex does not recognise are preserved rather than dropped, so adding
`escapeinside=||` by hand survives editing the caption in the inspector.

---

## Reference

### Shortcuts

| | |
|---|---|
| `⌘⇧C` | Insert code block |
| `⌥⌘C` | Insert code from file |
| `⌥⌘I` | Toggle listing inspector |

Also in the command palette under **Code**, including *Search Code Listings*
(matches captions, labels, languages and source paths) and *Re-index Source
Files*.

### Drag and drop

Drag a file from either sidebar onto the editor to open the import dialog.

### List of listings

Add `\listoflistings` (minted) or `\lstlistoflistings` (listings) wherever you
want the index. Captioned floating listings appear there automatically.

### Supported languages

C, C++, C#, Java, Python, Rust, Go, JavaScript, TypeScript, Kotlin, Swift,
Scala, Ruby, PHP, Perl, R, MATLAB, Lua, Haskell, Fortran, Verilog, VHDL,
Assembly, Bash, SQL, HTML, CSS, XML, JSON, YAML, TOML, Markdown, Makefile,
Dockerfile — plus anything else the engine supports, via the language field.

---

## Performance

The asset index is built once per project by the Rust backend, and only for
files whose extension could become a listing. Dependency and build directories
(`node_modules`, `target`, `.venv`, `dist`, …) are skipped, files over 4 MB are
listed without a line count, and binaries carrying a source extension are
excluded.

When a file changes, only that file is re-read — the project is never re-walked.
Listing parsing is debounced and runs on the document text already in memory;
only the link check touches the disk.
