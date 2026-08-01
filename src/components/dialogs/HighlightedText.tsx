import { Fragment } from 'react';

interface HighlightedTextProps {
  text: string;
  /** Character indices that matched the query. */
  indices: number[];
}

/**
 * Renders `text` with the fuzzy-matched characters emphasised, so the user can
 * see *why* a result matched.
 */
export function HighlightedText({ text, indices }: HighlightedTextProps) {
  if (indices.length === 0) return <>{text}</>;

  const matched = new Set(indices);
  const segments: { text: string; highlighted: boolean }[] = [];

  // Coalesce runs of matched/unmatched characters into as few spans as possible.
  for (let index = 0; index < text.length; index += 1) {
    const highlighted = matched.has(index);
    const previous = segments[segments.length - 1];

    if (previous !== undefined && previous.highlighted === highlighted) {
      previous.text += text[index];
    } else {
      segments.push({ text: text[index] ?? '', highlighted });
    }
  }

  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.highlighted ? (
            <span className="font-semibold text-accent">{segment.text}</span>
          ) : (
            segment.text
          )}
        </Fragment>
      ))}
    </>
  );
}
