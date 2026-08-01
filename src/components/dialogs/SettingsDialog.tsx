import { useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCompileStore } from '@/store/compileStore';
import { SETTING_LIMITS } from '@/services/settingsService';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  Field,
  NumberInput,
  Select,
  SettingsSection,
  TextInput,
  Toggle,
} from '@/components/ui/Field';
import { cn } from '@/utils/cn';

type SettingsTab = 'editor' | 'compilation' | 'preview' | 'general';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'compilation', label: 'Compilation' },
  { id: 'preview', label: 'PDF Preview' },
  { id: 'general', label: 'General' },
];

export function SettingsDialog() {
  const open = useUiStore((state) => state.overlay === 'settings');
  const close = useUiStore((state) => state.closeOverlay);

  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const reset = useSettingsStore((state) => state.reset);

  const environment = useCompileStore((state) => state.environment);
  const probeEnvironment = useCompileStore((state) => state.probeEnvironment);

  const [tab, setTab] = useState<SettingsTab>('editor');

  return (
    <Modal
      open={open}
      onClose={close}
      title="Settings"
      description="Changes apply immediately and are saved automatically."
      className="max-w-3xl"
    >
      <div className="grid min-h-0 grid-cols-[10rem_1fr] overflow-hidden">
        {/* Tabs */}
        <nav className="border-r border-border-subtle p-2">
          {TABS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setTab(candidate.id)}
              className={cn(
                'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                tab === candidate.id
                  ? 'bg-accent-soft font-medium text-content-primary'
                  : 'text-content-secondary hover:bg-surface-hover',
              )}
            >
              {candidate.label}
            </button>
          ))}
        </nav>

        {/* Panels */}
        <div className="max-h-[30rem] overflow-auto px-5 py-2">
          {tab === 'editor' && (
            <>
              <SettingsSection title="Appearance">
                <Field label="Theme" description="Dark, light, or follow the operating system.">
                  <Select
                    label="Theme"
                    className="w-36"
                    value={settings.theme}
                    onChange={(theme) => update({ theme })}
                    options={[
                      { value: 'dark', label: 'Dark' },
                      { value: 'light', label: 'Light' },
                      { value: 'system', label: 'System' },
                    ]}
                  />
                </Field>
                <Field label="Font size">
                  <NumberInput
                    label="Font size"
                    value={settings.fontSize}
                    onChange={(fontSize) => update({ fontSize })}
                    min={SETTING_LIMITS.fontSize.min}
                    max={SETTING_LIMITS.fontSize.max}
                    suffix="px"
                  />
                </Field>
                <Field
                  label="Font family"
                  description="A CSS font stack. The first available family is used."
                  stacked
                >
                  <TextInput
                    label="Font family"
                    value={settings.fontFamily}
                    onChange={(fontFamily) => update({ fontFamily })}
                    className="w-full font-mono text-xs"
                  />
                </Field>
              </SettingsSection>

              <SettingsSection title="Text">
                <Field label="Tab width" description="Columns a tab represents.">
                  <NumberInput
                    label="Tab width"
                    value={settings.tabWidth}
                    onChange={(tabWidth) => update({ tabWidth })}
                    min={SETTING_LIMITS.tabWidth.min}
                    max={SETTING_LIMITS.tabWidth.max}
                  />
                </Field>
                <Field label="Insert spaces" description="Use spaces instead of tab characters.">
                  <Toggle
                    label="Insert spaces"
                    checked={settings.insertSpaces}
                    onChange={(insertSpaces) => update({ insertSpaces })}
                  />
                </Field>
                <Field label="Word wrap" description="Wrap long lines at the viewport edge.">
                  <Toggle
                    label="Word wrap"
                    checked={settings.wordWrap}
                    onChange={(wordWrap) => update({ wordWrap })}
                  />
                </Field>
                <Field label="Minimap" description="Show the document overview on the right.">
                  <Toggle
                    label="Minimap"
                    checked={settings.minimap}
                    onChange={(minimap) => update({ minimap })}
                  />
                </Field>
                <Field label="Line numbers">
                  <Select
                    label="Line numbers"
                    className="w-36"
                    value={settings.lineNumbers}
                    onChange={(lineNumbers) => update({ lineNumbers })}
                    options={[
                      { value: 'on', label: 'On' },
                      { value: 'relative', label: 'Relative' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                </Field>
                <Field label="Render whitespace">
                  <Select
                    label="Render whitespace"
                    className="w-36"
                    value={settings.renderWhitespace}
                    onChange={(renderWhitespace) => update({ renderWhitespace })}
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'boundary', label: 'Boundary' },
                      { value: 'all', label: 'All' },
                    ]}
                  />
                </Field>
                <Field
                  label="Bracket pair colours"
                  description="Colour matching braces by nesting depth."
                >
                  <Toggle
                    label="Bracket pair colours"
                    checked={settings.bracketPairColorization}
                    onChange={(bracketPairColorization) => update({ bracketPairColorization })}
                  />
                </Field>
                <Field
                  label="Auto-close brackets"
                  description="Insert the closing brace or dollar sign automatically."
                >
                  <Toggle
                    label="Auto-close brackets"
                    checked={settings.autoClosingBrackets}
                    onChange={(autoClosingBrackets) => update({ autoClosingBrackets })}
                  />
                </Field>
              </SettingsSection>

              <SettingsSection title="Saving">
                <Field label="Auto save">
                  <Select
                    label="Auto save"
                    className="w-40"
                    value={settings.autoSave}
                    onChange={(autoSave) => update({ autoSave })}
                    options={[
                      { value: 'afterDelay', label: 'After delay' },
                      { value: 'onFocusChange', label: 'On focus change' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                </Field>
                {settings.autoSave === 'afterDelay' && (
                  <Field label="Auto save delay" description="Idle time before a save fires.">
                    <NumberInput
                      label="Auto save delay"
                      value={settings.autoSaveDelay}
                      onChange={(autoSaveDelay) => update({ autoSaveDelay })}
                      min={SETTING_LIMITS.autoSaveDelay.min}
                      max={SETTING_LIMITS.autoSaveDelay.max}
                      step={100}
                      suffix="ms"
                    />
                  </Field>
                )}
              </SettingsSection>
            </>
          )}

          {tab === 'compilation' && (
            <>
              <SettingsSection title="Toolchain">
                <Field
                  label="Default compiler"
                  description="latexmk schedules the passes for you; the engines run directly."
                >
                  <Select
                    label="Default compiler"
                    className="w-40"
                    value={settings.defaultCompiler}
                    onChange={(defaultCompiler) => update({ defaultCompiler })}
                    options={[
                      { value: 'latexmk', label: 'latexmk' },
                      { value: 'pdflatex', label: 'pdfLaTeX' },
                      { value: 'xelatex', label: 'XeLaTeX' },
                      { value: 'lualatex', label: 'LuaLaTeX' },
                    ]}
                  />
                </Field>

                {settings.defaultCompiler === 'latexmk' && (
                  <Field label="Engine" description="Which engine latexmk should drive.">
                    <Select
                      label="Engine"
                      className="w-40"
                      value={settings.latexmkEngine}
                      onChange={(latexmkEngine) => update({ latexmkEngine })}
                      options={[
                        { value: 'pdflatex', label: 'pdfLaTeX' },
                        { value: 'xelatex', label: 'XeLaTeX' },
                        { value: 'lualatex', label: 'LuaLaTeX' },
                      ]}
                    />
                  </Field>
                )}

                <Field
                  label="Bibliography"
                  description="Auto picks Biber when a .bcf file is present, else BibTeX."
                >
                  <Select
                    label="Bibliography engine"
                    className="w-40"
                    value={settings.bibEngine}
                    onChange={(bibEngine) => update({ bibEngine })}
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'bibtex', label: 'BibTeX' },
                      { value: 'biber', label: 'Biber' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                </Field>
              </SettingsSection>

              <SettingsSection title="Behaviour">
                <Field
                  label="Auto compile"
                  description="Rebuild automatically after you stop typing."
                >
                  <Toggle
                    label="Auto compile"
                    checked={settings.autoCompile}
                    onChange={(autoCompile) => update({ autoCompile })}
                  />
                </Field>
                {settings.autoCompile && (
                  <Field label="Auto compile delay" description="Idle time before a rebuild.">
                    <NumberInput
                      label="Auto compile delay"
                      value={settings.autoCompileDelay}
                      onChange={(autoCompileDelay) => update({ autoCompileDelay })}
                      min={SETTING_LIMITS.autoCompileDelay.min}
                      max={SETTING_LIMITS.autoCompileDelay.max}
                      step={100}
                      suffix="ms"
                    />
                  </Field>
                )}
                <Field
                  label="Separate build folder"
                  description="Keep .aux and .log in .inktex-build instead of beside your sources."
                >
                  <Toggle
                    label="Separate build folder"
                    checked={settings.useOutputDirectory}
                    onChange={(useOutputDirectory) => update({ useOutputDirectory })}
                  />
                </Field>
                <Field label="SyncTeX" description="Emit synctex data during compilation.">
                  <Toggle
                    label="SyncTeX"
                    checked={settings.synctex}
                    onChange={(synctex) => update({ synctex })}
                  />
                </Field>
                <Field
                  label="Clean on close"
                  description="Remove auxiliary files when a project is closed."
                >
                  <Toggle
                    label="Clean on close"
                    checked={settings.cleanAuxOnClose}
                    onChange={(cleanAuxOnClose) => update({ cleanAuxOnClose })}
                  />
                </Field>
                <Field
                  label="Extra arguments"
                  description="Passed verbatim to the compiler, e.g. -shell-escape"
                  stacked
                >
                  <TextInput
                    label="Extra arguments"
                    value={settings.extraCompilerArgs}
                    onChange={(extraCompilerArgs) => update({ extraCompilerArgs })}
                    placeholder="-shell-escape"
                    className="w-full font-mono text-xs"
                  />
                </Field>
              </SettingsSection>

              <SettingsSection title="Detected toolchain">
                <div className="py-3">
                  {environment === null ? (
                    <p className="text-xs text-content-muted">Checking…</p>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center gap-2">
                        {environment.installed ? (
                          <CheckCircle2 className="size-4 text-emerald-400" />
                        ) : (
                          <XCircle className="size-4 text-rose-400" />
                        )}
                        <span className="text-sm text-content-primary">
                          {environment.installed
                            ? (environment.distribution ?? 'TeX installation found')
                            : 'No TeX installation found'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => void probeEnvironment()}
                        >
                          Re-check
                        </Button>
                      </div>

                      {environment.binaries.length > 0 ? (
                        <ul className="space-y-1 rounded-md bg-surface-sunken p-2.5">
                          {environment.binaries.map((binary) => (
                            <li key={binary.name} className="flex items-baseline gap-2 text-xs">
                              <span className="w-20 shrink-0 font-medium text-content-primary">
                                {binary.name}
                              </span>
                              <span
                                className="selectable min-w-0 truncate font-mono text-[0.6875rem] text-content-muted"
                                title={binary.path}
                              >
                                {binary.path}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs leading-relaxed text-content-muted">
                          InkTex searched your PATH plus the standard TeX Live, MacTeX and MiKTeX
                          install locations. Install a distribution and click Re-check.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </SettingsSection>
            </>
          )}

          {tab === 'preview' && (
            <SettingsSection title="PDF preview">
              <Field
                label="On refresh"
                description="What the preview does when a new PDF arrives."
              >
                <Select
                  label="Refresh behaviour"
                  className="w-44"
                  value={settings.pdfRefreshBehavior}
                  onChange={(pdfRefreshBehavior) => update({ pdfRefreshBehavior })}
                  options={[
                    { value: 'preserveScroll', label: 'Keep position' },
                    { value: 'jumpToTop', label: 'Jump to top' },
                    { value: 'manual', label: 'Leave as-is' },
                  ]}
                />
              </Field>
              <Field label="Default zoom">
                <Select
                  label="Default zoom"
                  className="w-36"
                  value={settings.pdfZoomMode}
                  onChange={(pdfZoomMode) => update({ pdfZoomMode })}
                  options={[
                    { value: 'fitWidth', label: 'Fit width' },
                    { value: 'fitPage', label: 'Fit page' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                />
              </Field>
              {settings.pdfZoomMode === 'custom' && (
                <Field label="Zoom level">
                  <NumberInput
                    label="Zoom level"
                    value={Math.round(settings.pdfZoom * 100)}
                    onChange={(percent) => update({ pdfZoom: percent / 100 })}
                    min={10}
                    max={800}
                    step={10}
                    suffix="%"
                  />
                </Field>
              )}
            </SettingsSection>
          )}

          {tab === 'general' && (
            <>
              <SettingsSection title="Projects">
                <Field
                  label="Reopen last project"
                  description="Restore the project and its tabs on launch."
                >
                  <Toggle
                    label="Reopen last project"
                    checked={settings.restoreLastProject}
                    onChange={(restoreLastProject) => update({ restoreLastProject })}
                  />
                </Field>
                <Field label="Recent projects" description="How many to remember.">
                  <NumberInput
                    label="Recent projects limit"
                    value={settings.recentProjectsLimit}
                    onChange={(recentProjectsLimit) => update({ recentProjectsLimit })}
                    min={SETTING_LIMITS.recentProjectsLimit.min}
                    max={SETTING_LIMITS.recentProjectsLimit.max}
                  />
                </Field>
              </SettingsSection>

              <SettingsSection title="Reset">
                <Field
                  label="Restore defaults"
                  description="Return every setting on every tab to its original value."
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw className="size-3.5" />}
                    onClick={reset}
                  >
                    Reset
                  </Button>
                </Field>
              </SettingsSection>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
