# Installation

Two parts: a TeX distribution (which InkTex drives but does not bundle), and
InkTex itself.

---

## 1. Install a TeX distribution

InkTex needs `latexmk` plus at least one engine (`pdflatex`, `xelatex` or
`lualatex`). It will start and let you edit without one, but the Compile button
stays disabled with an explanation.

### macOS

**Full install (recommended, ~5 GB)** — everything you will ever need:

```bash
brew install --cask mactex-no-gui
```

Or download the installer from <https://tug.org/mactex/>. The `-no-gui` cask
skips the GUI applications (TeXShop, BibDesk) that InkTex replaces.

**Minimal install (~500 MB)** — smaller, but you will install packages as you
hit them:

```bash
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install latexmk
```

Both put binaries in `/Library/TeX/texbin`, which InkTex searches directly. You
may need a new terminal session (or a logout) before `latexmk` is on your shell
`PATH` — InkTex does not depend on that.

### Windows

Install **MiKTeX** from <https://miktex.org/download> — it installs missing
packages on demand, which pairs well with InkTex's error messages.

```powershell
winget install MiKTeX.MiKTeX
```

Then add latexmk (MiKTeX Console → Packages → search `latexmk` → install), and
install Perl (<https://strawberryperl.com/>), which latexmk is written in.

Alternatively install **TeX Live** from <https://tug.org/texlive/windows.html>,
which includes latexmk and Perl already.

### Linux

```bash
# Debian / Ubuntu — full
sudo apt install texlive-full latexmk

# Debian / Ubuntu — smaller
sudo apt install texlive-latex-recommended texlive-latex-extra \
                 texlive-fonts-recommended latexmk biber

# Fedora
sudo dnf install texlive-scheme-full latexmk

# Arch
sudo pacman -S texlive-most texlive-bin biber
```

### Verify

```bash
latexmk --version
pdflatex --version
```

In InkTex, **Settings → Compilation → Detected toolchain** lists every binary it
found and where. If you install TeX while InkTex is running, click **Re-check**.

---

## 2. Install InkTex

### Build from source

Requires **Node 20.19+** and **Rust 1.77+ stable**.

```bash
# Rust, if you do not have it
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

git clone <your-repo> InkTex
cd InkTex
npm install
npm run bundle
```

The installer lands in `src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| macOS | `dmg/InkTex_1.0.0_aarch64.dmg` and `macos/InkTex.app` |
| Windows | `msi/InkTex_1.0.0_x64_en-US.msi`, `nsis/InkTex_1.0.0_x64-setup.exe` |
| Linux | `deb/inktex_1.0.0_amd64.deb`, `appimage/inktex_1.0.0_amd64.AppImage` |

The first build compiles the full Rust dependency tree and takes several
minutes; later builds are incremental and take seconds.

> **macOS: DMG packaging needs a desktop session.** Tauri's `bundle_dmg.sh`
> drives Finder over AppleScript to lay out the disk-image window. Over SSH, in
> CI, or from a process without Finder automation rights it fails with
> `Finder got an error: AppleEvent timed out (-1712)` *after* `InkTex.app` has
> already been built successfully. The `.app` in
> `src-tauri/target/release/bundle/macos/` is complete and runnable; only the
> `.dmg` wrapper is missing. Either run the build from a normal desktop session,
> or skip the DMG entirely:
>
> ```bash
> npm run tauri build -- --bundles app
> ```

### Platform build prerequisites

**macOS** — Xcode Command Line Tools:

```bash
xcode-select --install
```

**Windows** — Microsoft C++ Build Tools with the "Desktop development with C++"
workload, and the WebView2 runtime (already present on Windows 11).

**Linux** — WebKitGTK and friends:

```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
                 libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
                 libappindicator-gtk3-devel librsvg2-devel

# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
               libappindicator-gtk3 librsvg
```

### Run in development

```bash
npm start
```

Frontend edits hot-reload; Rust edits trigger a rebuild and relaunch.

---

## Troubleshooting

### "No TeX installation was found"

InkTex searches your `PATH` plus the standard install prefixes. Open
**Settings → Compilation → Detected toolchain** to see exactly what it found.

- **macOS** — confirm `/Library/TeX/texbin` exists. If it does not, MacTeX did
  not install correctly; reinstall it. A GUI app does not inherit your shell
  `PATH`, so a TeX installed only into `~/.zshrc` will not be visible — InkTex
  handles the standard locations, not custom ones.
- **Windows** — reopen InkTex after installing MiKTeX so the updated system
  `PATH` is picked up.
- **Linux** — check `which pdflatex`. Some minimal `texlive-base` packages
  exclude the engines.

Click **Re-check** after installing.

### "latexmk was not found"

You have an engine but not the driver. Install it (`tlmgr install latexmk`, or
via MiKTeX Console), or switch **Settings → Compilation → Default compiler** to
pdfLaTeX, XeLaTeX or LuaLaTeX — InkTex then schedules the passes itself,
including the BibTeX/Biber run.

On Windows, latexmk also needs Perl.

### "Missing package …"

Your document uses a package the distribution does not have.

```bash
tlmgr install <package>          # TeX Live / MacTeX
mpm --install=<package>          # MiKTeX
```

On macOS with MacTeX, prefix with `sudo`. MiKTeX can install on the fly if you
enabled that during setup.

### Compilation succeeds but the preview is empty

Check the **Compiler Output** panel. If the log ends without `Output written
on …`, the engine failed before writing a PDF; the first error in **Problems**
is the one to fix.

If the PDF exists but will not display, it may have been written while the
preview was reading it — compile again.

### A package writes files next to the sources and cannot find them

Turn off **Settings → Compilation → Separate build folder**. Auxiliary files
then land beside your `.tex` files, matching a plain command-line build.

### Changes on disk are not picked up

The status bar warns if the file watcher could not start. This usually means the
project is on a network share or a filesystem without change notifications.
Use the refresh button in the explorer header, or reopen the project.

### Permission errors

macOS may need InkTex granted access to the folder in **System Settings →
Privacy & Security → Files and Folders**. Projects in Documents, Desktop or
Downloads trigger this most often.

---

## Uninstalling

Delete the application, then remove its preferences:

```bash
# macOS
rm -rf ~/Library/Application\ Support/dev.inktex.app

# Linux
rm -rf ~/.config/dev.inktex.app

# Windows (PowerShell)
Remove-Item -Recurse "$env:APPDATA\dev.inktex.app"
```

InkTex writes nothing else outside your project folders. Inside a project, the
only thing it creates is `.inktex-build/`, which is safe to delete.

To remove the Rust toolchain if you installed it only to build InkTex:
`rustup self uninstall`.
