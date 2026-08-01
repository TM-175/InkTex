import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileImage,
  FileText,
  FileType2,
  Files,
  Folder,
  FolderOpen,
} from 'lucide-react';
import type { FileKind } from '@/types/project';
import { cn } from '@/utils/cn';

/**
 * Icon and colour for a file kind.
 *
 * Colour carries meaning here — `.tex` sources are the accent hue, assets are
 * neutral — so a large tree can be scanned without reading every name.
 */
export function FileIcon({
  kind,
  expanded = false,
  className,
}: {
  kind: FileKind;
  expanded?: boolean;
  className?: string;
}) {
  const base = cn('size-4 shrink-0', className);

  switch (kind) {
    case 'directory':
      return expanded ? (
        <FolderOpen className={cn(base, 'text-accent')} />
      ) : (
        <Folder className={cn(base, 'text-accent')} />
      );
    case 'tex':
      return <FileCode2 className={cn(base, 'text-indigo-400')} />;
    case 'bib':
      return <Files className={cn(base, 'text-emerald-400')} />;
    case 'style':
      return <FileType2 className={cn(base, 'text-purple-400')} />;
    case 'image':
      return <FileImage className={cn(base, 'text-amber-400')} />;
    case 'pdf':
      return <FileText className={cn(base, 'text-rose-400')} />;
    default:
      return <FileText className={cn(base, 'text-content-muted')} />;
  }
}

/** Disclosure triangle for directory rows. */
export function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown className="size-3.5 shrink-0 text-content-muted" />
  ) : (
    <ChevronRight className="size-3.5 shrink-0 text-content-muted" />
  );
}
