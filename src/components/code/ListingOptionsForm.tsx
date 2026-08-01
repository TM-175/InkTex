import type { ListingFontSize, ListingFrame, ListingSpec } from '@/types/listing';
import { languageOptions } from '@/services/listings/languages';
import { themeOptions } from '@/services/listings/themes';
import { countLines } from '@/services/listings/lineRanges';
import { suggestLabel } from '@/services/listings/latexGenerator';
import { Field, NumberInput, Select, SettingsSection, TextInput, Toggle } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

const FONT_SIZES: { value: ListingFontSize; label: string }[] = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'scriptsize', label: 'Script' },
  { value: 'footnotesize', label: 'Footnote' },
  { value: 'small', label: 'Small' },
  { value: 'normalsize', label: 'Normal' },
];

const FRAMES: { value: ListingFrame; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'single', label: 'Box' },
  { value: 'lines', label: 'Top & bottom' },
  { value: 'leftline', label: 'Left rule' },
  { value: 'topline', label: 'Top rule' },
  { value: 'bottomline', label: 'Bottom rule' },
];

interface ListingOptionsFormProps {
  spec: ListingSpec;
  onChange: (patch: Partial<ListingSpec>) => void;
  /** Hide the code-independent sections the inspector shows elsewhere. */
  compact?: boolean;
}

/**
 * Every editable property of a listing.
 *
 * Shared by the insert wizard and the inspector so a listing's properties are
 * defined once and behave identically whether it is being created or edited.
 */
export function ListingOptionsForm({ spec, onChange, compact = false }: ListingOptionsFormProps) {
  const highlightCount = countLines(spec.highlightLines);

  return (
    <div className="divide-y divide-border-subtle">
      <SettingsSection title="Content">
        <Field label="Language" description="Sets the highlighter and the editor's grammar.">
          <Select
            label="Language"
            className="w-44"
            value={spec.language}
            onChange={(language) => onChange({ language })}
            options={languageOptions()}
          />
        </Field>

        <Field
          label="Caption"
          description="Shown beneath the listing and in the List of Listings."
          stacked
        >
          <TextInput
            label="Caption"
            value={spec.caption}
            onChange={(caption) => {
              // Offer a label derived from the caption until the user sets one.
              const patch: Partial<ListingSpec> = { caption };
              if (spec.label === '' || spec.label === suggestLabel(spec.caption)) {
                patch.label = suggestLabel(caption);
              }
              onChange(patch);
            }}
            placeholder="Binary search implementation"
            className="w-full"
          />
        </Field>

        <Field
          label="Label"
          description="Reference it with \ref{…}. The lst: prefix is the usual convention."
          stacked
        >
          <TextInput
            label="Label"
            value={spec.label}
            onChange={(label) => onChange({ label })}
            placeholder="lst:binary-search"
            className="w-full font-mono text-xs"
          />
        </Field>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <Field label="Highlighter" description="minted uses Pygments and needs --shell-escape.">
          <Select
            label="Highlighter"
            className="w-36"
            value={spec.engine}
            onChange={(engine) => onChange({ engine })}
            options={[
              { value: 'minted', label: 'minted' },
              { value: 'listings', label: 'listings' },
            ]}
          />
        </Field>

        <Field label="Theme">
          <Select
            label="Theme"
            className="w-48"
            value={spec.theme}
            onChange={(theme) => onChange({ theme })}
            options={themeOptions()}
          />
        </Field>

        <Field label="Font size">
          <Select
            label="Font size"
            className="w-36"
            value={spec.fontSize}
            onChange={(fontSize) => onChange({ fontSize })}
            options={FONT_SIZES}
          />
        </Field>

        <Field label="Frame">
          <Select
            label="Frame"
            className="w-36"
            value={spec.frame}
            onChange={(frame) => onChange({ frame })}
            options={FRAMES}
          />
        </Field>

        <Field label="Background" description="Fill behind the code using the theme's colour.">
          <Toggle
            label="Background"
            checked={spec.background}
            onChange={(background) => onChange({ background })}
          />
        </Field>

        <Field label="Wrap long lines" description="Break lines that overflow the text width.">
          <Toggle
            label="Wrap long lines"
            checked={spec.breakLines}
            onChange={(breakLines) => onChange({ breakLines })}
          />
        </Field>

        <Field label="Tab width">
          <NumberInput
            label="Tab width"
            value={spec.tabSize}
            onChange={(tabSize) => onChange({ tabSize })}
            min={1}
            max={8}
          />
        </Field>
      </SettingsSection>

      <SettingsSection title="Line numbers">
        <Field label="Show line numbers">
          <Toggle
            label="Show line numbers"
            checked={spec.lineNumbers}
            onChange={(lineNumbers) => onChange({ lineNumbers })}
          />
        </Field>

        {spec.lineNumbers && (
          <Field
            label="Start at"
            description="Match the original file by starting at its line number."
          >
            <NumberInput
              label="First line number"
              value={spec.firstNumber}
              onChange={(firstNumber) => onChange({ firstNumber })}
              min={0}
              max={999_999}
            />
          </Field>
        )}

        <Field
          label="Highlighted lines"
          description="Click line numbers in the editor to toggle them."
          stacked
        >
          <div className="flex items-center gap-2">
            <TextInput
              label="Highlighted lines"
              value={spec.highlightLines}
              onChange={(highlightLines) => onChange({ highlightLines })}
              placeholder="3,7-9"
              className="w-full font-mono text-xs"
            />
            {highlightCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange({ highlightLines: '' })}
                title="Clear highlighting"
              >
                Clear
              </Button>
            )}
          </div>
          {highlightCount > 0 && (
            <p className="mt-1 text-[0.6875rem] text-content-muted">
              {highlightCount} line{highlightCount === 1 ? '' : 's'} highlighted
            </p>
          )}
        </Field>
      </SettingsSection>

      {!compact && (
        <SettingsSection title="Placement">
          <Field
            label="Floating listing"
            description="Let LaTeX position it. Required for a caption and a List of Listings entry."
          >
            <Toggle
              label="Floating listing"
              checked={spec.float}
              onChange={(float) => onChange({ float })}
            />
          </Field>

          {spec.float && (
            <Field
              label="Placement"
              description="h here, t top, b bottom, p own page, ! ignore aesthetics."
            >
              <TextInput
                label="Placement"
                value={spec.placement}
                onChange={(placement) => onChange({ placement })}
                placeholder="htbp"
                className="w-24 font-mono text-xs"
              />
            </Field>
          )}

          <Field
            label="Custom options"
            description="Passed through verbatim, e.g. mathescape, escapeinside=||"
            stacked
          >
            <TextInput
              label="Custom options"
              value={spec.customOptions}
              onChange={(customOptions) => onChange({ customOptions })}
              placeholder="mathescape"
              className="w-full font-mono text-xs"
            />
          </Field>
        </SettingsSection>
      )}
    </div>
  );
}
