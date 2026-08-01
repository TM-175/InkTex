/**
 * LaTeX snippets.
 *
 * Bodies use Monaco's snippet syntax: `${1:placeholder}` are tab stops, `$0` is
 * the final cursor position. They are surfaced two ways — through the snippet
 * picker (⌘⇧I) and as completion items in the LaTeX language provider.
 */

import type { Snippet } from '@/types/editor';

export const SNIPPETS: Snippet[] = [
  // --- Mathematics ---------------------------------------------------------
  {
    id: 'equation',
    label: 'equation',
    description: 'Numbered display equation with a label',
    category: 'math',
    body: [
      '\\begin{equation}',
      '\t\\label{eq:${1:name}}',
      '\t${2:a^2 + b^2 = c^2}',
      '\\end{equation}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'align',
    label: 'align',
    description: 'Multi-line aligned equations',
    category: 'math',
    body: [
      '\\begin{align}',
      '\t\\label{eq:${1:name}}',
      '\t${2:x} &= ${3:y} \\\\',
      '\t  &= ${4:z}',
      '\\end{align}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'matrix',
    label: 'matrix',
    description: 'Bracketed matrix inside a display equation',
    category: 'math',
    body: [
      '\\begin{equation}',
      '\t\\begin{${1|bmatrix,pmatrix,vmatrix,matrix|}}',
      '\t\t${2:a} & ${3:b} \\\\',
      '\t\t${4:c} & ${5:d}',
      '\t\\end{${1}}',
      '\\end{equation}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'theorem',
    label: 'theorem',
    description: 'Theorem environment with an optional name',
    category: 'math',
    body: [
      '\\begin{theorem}[${1:Name}]',
      '\t\\label{thm:${2:key}}',
      '\t${3:Statement of the theorem.}',
      '\\end{theorem}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'proof',
    label: 'proof',
    description: 'Proof environment',
    category: 'math',
    body: ['\\begin{proof}', '\t${1:The argument.}', '\\end{proof}', '$0'].join('\n'),
  },
  {
    id: 'cases',
    label: 'cases',
    description: 'Piecewise definition',
    category: 'math',
    body: [
      '\\begin{equation}',
      '\t${1:f(x)} =',
      '\t\\begin{cases}',
      '\t\t${2:0} & \\text{if } ${3:x < 0} \\\\',
      '\t\t${4:1} & \\text{otherwise}',
      '\t\\end{cases}',
      '\\end{equation}',
      '$0',
    ].join('\n'),
  },

  // --- Structure -----------------------------------------------------------
  {
    id: 'section',
    label: 'section',
    description: 'Section with a label',
    category: 'structure',
    body: '\\section{${1:Title}}\n\\label{sec:${2:key}}\n\n$0',
  },
  {
    id: 'subsection',
    label: 'subsection',
    description: 'Subsection with a label',
    category: 'structure',
    body: '\\subsection{${1:Title}}\n\\label{subsec:${2:key}}\n\n$0',
  },
  {
    id: 'environment',
    label: 'environment',
    description: 'Generic environment',
    category: 'structure',
    body: '\\begin{${1:name}}\n\t$0\n\\end{${1:name}}',
  },
  {
    id: 'tikzpicture',
    label: 'tikzpicture',
    description: 'TikZ picture inside a centred figure',
    category: 'structure',
    body: [
      '\\begin{figure}[htbp]',
      '\t\\centering',
      '\t\\begin{tikzpicture}[${1:scale=1}]',
      '\t\t\\draw[->] (0,0) -- (${2:3},0) node[right] {$x$};',
      '\t\t\\draw[->] (0,0) -- (0,${3:3}) node[above] {$y$};',
      '\t\t$0',
      '\t\\end{tikzpicture}',
      '\t\\caption{${4:Caption}}',
      '\t\\label{fig:${5:key}}',
      '\\end{figure}',
    ].join('\n'),
  },

  // --- Floats --------------------------------------------------------------
  {
    id: 'figure',
    label: 'figure',
    description: 'Figure with an included graphic and caption',
    category: 'floats',
    body: [
      '\\begin{figure}[htbp]',
      '\t\\centering',
      '\t\\includegraphics[width=${1:0.8}\\textwidth]{${2:image}}',
      '\t\\caption{${3:Caption}}',
      '\t\\label{fig:${4:key}}',
      '\\end{figure}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'table',
    label: 'table',
    description: 'Table using booktabs rules',
    category: 'floats',
    body: [
      '\\begin{table}[htbp]',
      '\t\\centering',
      '\t\\begin{tabular}{${1:lrr}}',
      '\t\t\\toprule',
      '\t\t${2:Column} & ${3:Column} & ${4:Column} \\\\',
      '\t\t\\midrule',
      '\t\t${5:a} & ${6:b} & ${7:c} \\\\',
      '\t\t\\bottomrule',
      '\t\\end{tabular}',
      '\t\\caption{${8:Caption}}',
      '\t\\label{tab:${9:key}}',
      '\\end{table}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'subfigure',
    label: 'subfigure',
    description: 'Two side-by-side subfigures (requires the subcaption package)',
    category: 'floats',
    body: [
      '\\begin{figure}[htbp]',
      '\t\\centering',
      '\t\\begin{subfigure}[b]{0.48\\textwidth}',
      '\t\t\\centering',
      '\t\t\\includegraphics[width=\\textwidth]{${1:left}}',
      '\t\t\\caption{${2:Left}}',
      '\t\\end{subfigure}',
      '\t\\hfill',
      '\t\\begin{subfigure}[b]{0.48\\textwidth}',
      '\t\t\\centering',
      '\t\t\\includegraphics[width=\\textwidth]{${3:right}}',
      '\t\t\\caption{${4:Right}}',
      '\t\\end{subfigure}',
      '\t\\caption{${5:Overall caption}}',
      '\t\\label{fig:${6:key}}',
      '\\end{figure}',
      '$0',
    ].join('\n'),
  },

  // --- Lists ---------------------------------------------------------------
  {
    id: 'itemize',
    label: 'itemize',
    description: 'Bulleted list',
    category: 'lists',
    body: [
      '\\begin{itemize}',
      '\t\\item ${1:First}',
      '\t\\item ${2:Second}',
      '\\end{itemize}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'enumerate',
    label: 'enumerate',
    description: 'Numbered list',
    category: 'lists',
    body: [
      '\\begin{enumerate}',
      '\t\\item ${1:First}',
      '\t\\item ${2:Second}',
      '\\end{enumerate}',
      '$0',
    ].join('\n'),
  },
  {
    id: 'description',
    label: 'description',
    description: 'Description list with bold terms',
    category: 'lists',
    body: [
      '\\begin{description}',
      '\t\\item[${1:Term}] ${2:Definition}',
      '\t\\item[${3:Term}] ${4:Definition}',
      '\\end{description}',
      '$0',
    ].join('\n'),
  },

  // --- Bibliography --------------------------------------------------------
  {
    id: 'bibliography',
    label: 'bibliography',
    description: 'BibTeX bibliography block',
    category: 'bibliography',
    body: '\\bibliographystyle{${1|plain,plainnat,abbrv,alpha,unsrt,ieeetr|}}\n\\bibliography{${2:refs}}\n$0',
  },
  {
    id: 'cite',
    label: 'cite',
    description: 'Citation',
    category: 'bibliography',
    body: '\\cite{${1:key}}$0',
  },
  {
    id: 'bibentry',
    label: 'bibentry',
    description: 'BibTeX article entry (for .bib files)',
    category: 'bibliography',
    body: [
      '@article{${1:key},',
      '\tauthor  = {${2:Author}},',
      '\ttitle   = {${3:Title}},',
      '\tjournal = {${4:Journal}},',
      '\tyear    = {${5:2024}}',
      '}',
      '$0',
    ].join('\n'),
  },
];

export const SNIPPET_CATEGORIES: { id: Snippet['category']; label: string }[] = [
  { id: 'math', label: 'Mathematics' },
  { id: 'structure', label: 'Structure' },
  { id: 'floats', label: 'Figures & Tables' },
  { id: 'lists', label: 'Lists' },
  { id: 'bibliography', label: 'Bibliography' },
];

export function snippetsFor(category: Snippet['category']): Snippet[] {
  return SNIPPETS.filter((snippet) => snippet.category === category);
}
