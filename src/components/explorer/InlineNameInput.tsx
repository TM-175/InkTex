import { useState } from 'react';
import { FileIcon } from '@/components/ui/FileIcon';
import { cn } from '@/utils/cn';

interface InlineNameInputProps {
  depth: number;
  directory: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The row that appears in the tree while naming a new file or folder.
 *
 * Creating in place — rather than in a modal — keeps the new entry's location
 * visible, which matters when the project has several similarly named folders.
 */
export function InlineNameInput({ depth, directory, onSubmit, onCancel }: InlineNameInputProps) {
  const [name, setName] = useState(directory ? '' : 'untitled.tex');

  return (
    <div className="flex h-6 items-center gap-1.5" style={{ paddingLeft: 8 + depth * 12 }}>
      <span className="size-3.5 shrink-0" />
      <FileIcon kind={directory ? 'directory' : 'tex'} />
      <input
        type="text"
        value={name}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the row exists to be typed into
        autoFocus
        spellCheck={false}
        placeholder={directory ? 'folder name' : 'file name'}
        aria-label={directory ? 'New folder name' : 'New file name'}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed !== '') onSubmit(trimmed);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        onFocus={(event) => {
          // Select just the stem so typing replaces the name but keeps `.tex`.
          const dot = name.lastIndexOf('.');
          event.target.setSelectionRange(0, dot > 0 ? dot : name.length);
        }}
        onBlur={() => {
          const trimmed = name.trim();
          // Committing on blur avoids losing what was typed to a stray click.
          if (trimmed === '') onCancel();
          else onSubmit(trimmed);
        }}
        className={cn(
          'mr-2 h-5 min-w-0 flex-1 rounded border border-accent bg-surface-base px-1',
          'text-[0.8125rem] text-content-primary placeholder:text-content-muted focus:outline-none',
        )}
      />
    </div>
  );
}
