/**
 * Project templates.
 *
 * Each template is a complete, compilable document. They deliberately stick to
 * packages that ship with every mainstream distribution (no biblatex, no
 * titlesec) so a brand-new project builds on a minimal TeX install rather than
 * failing with "file not found" on first compile.
 */

import type { Template } from '@/types/editor';

const SHARED_BIB = `@book{knuth1984texbook,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984},
  address   = {Reading, Massachusetts}
}

@article{lamport1994latex,
  author  = {Leslie Lamport},
  title   = {{\\LaTeX}: A Document Preparation System},
  journal = {Addison-Wesley},
  year    = {1994},
  volume  = {2}
}

@misc{example2024,
  author       = {Ada Lovelace},
  title        = {Notes on the Analytical Engine},
  year         = {2024},
  howpublished = {\\url{https://example.org/notes}}
}
`;

const ARTICLE_MAIN = String.raw`% !TeX root = main.tex
\documentclass[11pt,a4paper]{article}

% --- Layout -----------------------------------------------------------------
\usepackage[margin=1in]{geometry}
\usepackage{parskip}

% --- Encoding and fonts -----------------------------------------------------
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}

% --- Mathematics ------------------------------------------------------------
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{amsthm}

% --- Figures and tables -----------------------------------------------------
\usepackage{graphicx}
\usepackage{booktabs}
\graphicspath{{figures/}}

% --- Cross-references (load hyperref last) ----------------------------------
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue]{hyperref}

\theoremstyle{plain}
\newtheorem{theorem}{Theorem}[section]

\title{An Article Written in InkTex}
\author{Your Name\\\texttt{you@example.com}}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
  Replace this abstract with a short summary of the work. It should state the
  problem, the approach, and the main result in a few sentences.
\end{abstract}

\input{sections/introduction}

\section{Method}
\label{sec:method}

Inline mathematics is written like $e^{i\pi} + 1 = 0$, while displayed
equations get their own line and an optional label:

\begin{equation}
  \label{eq:gaussian}
  \int_{-\infty}^{\infty} e^{-x^{2}} \, \mathrm{d}x = \sqrt{\pi}.
\end{equation}

Equation~\eqref{eq:gaussian} can be referenced anywhere in the document.

\begin{theorem}[Pythagoras]
  \label{thm:pythagoras}
  For a right triangle with legs $a$ and $b$ and hypotenuse $c$,
  $a^{2} + b^{2} = c^{2}$.
\end{theorem}

\begin{proof}
  Omitted; see \cite{knuth1984texbook} for a typographic treatment.
\end{proof}

\section{Results}
\label{sec:results}

Table~\ref{tab:results} summarises the measurements.

\begin{table}[htbp]
  \centering
  \begin{tabular}{lrr}
    \toprule
    Configuration & Time (ms) & Error \\
    \midrule
    Baseline  & 128 & 0.043 \\
    Optimised &  76 & 0.041 \\
    Combined  &  61 & 0.038 \\
    \bottomrule
  \end{tabular}
  \caption{Comparison of the three configurations.}
  \label{tab:results}
\end{table}

To include an image, drop a file into the \texttt{figures/} folder and
reference it:

% \begin{figure}[htbp]
%   \centering
%   \includegraphics[width=0.7\textwidth]{plot.png}
%   \caption{A caption describing the figure.}
%   \label{fig:plot}
% \end{figure}

\section{Conclusion}

Summarise the contribution here. Earlier work is cited with
\verb|\cite|, as in \cite{lamport1994latex} and \cite{example2024}.

\bibliographystyle{plain}
\bibliography{refs}

\end{document}
`;

const ARTICLE_INTRO = String.raw`\section{Introduction}
\label{sec:introduction}

This section lives in \texttt{sections/introduction.tex} and is pulled into the
document with \verb|\input{sections/introduction}|. Splitting a document across
files keeps each one small and makes it easier to find your place.

Cross-references work across files: Section~\ref{sec:method} describes the
method, and Theorem~\ref{thm:pythagoras} is stated there.
`;

const REPORT_MAIN = String.raw`% !TeX root = main.tex
\documentclass[11pt,a4paper]{report}

\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{fancyhdr}
\graphicspath{{figures/}}
\usepackage[colorlinks=true,linkcolor=black,citecolor=blue,urlcolor=blue]{hyperref}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\leftmark}
\fancyhead[R]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}

\title{\Huge A Technical Report\\[0.5em]\large Subtitle Goes Here}
\author{Your Name\\Department\\Institution}
\date{\today}

\begin{document}

\maketitle
\tableofcontents
\listoffigures
\listoftables

\chapter{Introduction}
\label{ch:introduction}
\input{chapters/introduction}

\chapter{Background}
\label{ch:background}
\input{chapters/background}

\chapter{Conclusion}
\label{ch:conclusion}

Restate the findings and outline what comes next.

\appendix

\chapter{Supplementary Material}

Additional derivations and data belong here.

\bibliographystyle{plain}
\bibliography{refs}

\end{document}
`;

const REPORT_INTRO = String.raw`This chapter motivates the work.

\section{Problem Statement}

Describe the problem precisely. A good problem statement names the inputs, the
outputs, and the constraint that makes the task non-trivial.

\section{Contributions}

\begin{itemize}
  \item The first contribution of this report.
  \item The second contribution.
  \item The third contribution.
\end{itemize}
`;

const REPORT_BACKGROUND = String.raw`This chapter reviews the material the rest of the report relies on.

\section{Prior Work}

Summarise the relevant literature, citing as you go \cite{knuth1984texbook}.

\section{Notation}

Let $X$ denote the input space and $Y$ the output space. A model is a function
$f : X \to Y$ drawn from a hypothesis class $\mathcal{H}$.
`;

const BOOK_MAIN = String.raw`% !TeX root = main.tex
\documentclass[11pt,a4paper,openany]{book}

\usepackage[margin=1.1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{amsthm}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{makeidx}
\graphicspath{{figures/}}
\usepackage[colorlinks=true,linkcolor=black,citecolor=blue,urlcolor=blue]{hyperref}

\makeindex

\theoremstyle{definition}
\newtheorem{definition}{Definition}[chapter]
\theoremstyle{plain}
\newtheorem{theorem}{Theorem}[chapter]

\title{\Huge The Title of the Book\\[0.6em]\large A Descriptive Subtitle}
\author{Your Name}
\date{\today}

\begin{document}

\frontmatter
\maketitle

\chapter*{Preface}
\addcontentsline{toc}{chapter}{Preface}

Explain who the book is for and how it is organised.

\tableofcontents

\mainmatter

\chapter{Beginnings}
\label{ch:beginnings}
\input{chapters/chapter1}

\chapter{Developments}
\label{ch:developments}
\input{chapters/chapter2}

\backmatter

\bibliographystyle{plain}
\bibliography{refs}
\addcontentsline{toc}{chapter}{Bibliography}

\printindex

\end{document}
`;

const BOOK_CHAPTER_ONE = String.raw`Open the chapter with a paragraph that sets up what follows.

\section{First Section}

\begin{definition}[Metric Space]
  \label{def:metric}
  A metric space is a pair $(X, d)$ where $d : X \times X \to \mathbb{R}_{\geq 0}$
  satisfies identity, symmetry, and the triangle inequality.
\end{definition}

Terms can be added to the index like this\index{metric space}.

\section{Second Section}

Continue the development here.
`;

const BOOK_CHAPTER_TWO = String.raw`This chapter builds on Definition~\ref{def:metric}.

\section{A Theorem}

\begin{theorem}
  \label{thm:completeness}
  Every Cauchy sequence in a complete metric space converges.
\end{theorem}

\begin{proof}
  Sketch the argument, or cite a reference \cite{knuth1984texbook}.
\end{proof}
`;

const RESUME_MAIN = String.raw`% !TeX root = resume.tex
%
% A single-file resume. It deliberately avoids resume-specific packages so it
% compiles anywhere; the section styling below is defined in this preamble.
%
\documentclass[11pt,a4paper]{article}

\usepackage[margin=0.75in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}

\pagestyle{empty}
\setlength{\parindent}{0pt}

% --- Section heading: bold small-caps above a full-width rule ----------------
\newcommand{\resumeSection}[1]{%
  \vspace{0.9em}%
  {\large\bfseries\scshape #1}\par
  \vspace{-0.55em}%
  \rule{\linewidth}{0.8pt}\par
  \vspace{0.35em}%
}

% --- One entry: title on the left, dates right; then role and location -------
\newcommand{\resumeEntry}[4]{%
  \textbf{#1}\hfill{\small #2}\par
  \textit{\small #3}\hfill{\small\itshape #4}\par
  \vspace{0.2em}%
}

% --- Tight bullet list used inside entries -----------------------------------
\newenvironment{resumeBullets}
  {\begin{itemize}[leftmargin=1.4em,topsep=2pt,itemsep=1pt,parsep=0pt]}
  {\end{itemize}\vspace{0.35em}}

\begin{document}

% --- Header ------------------------------------------------------------------
\begin{center}
  {\Huge\bfseries Your Name}\\[0.45em]
  {\small
    City, Country \textbullet{}
    \href{mailto:you@example.com}{you@example.com} \textbullet{}
    +1 555 0100 \textbullet{}
    \href{https://example.com}{example.com}
  }
\end{center}

\resumeSection{Education}

\resumeEntry
  {University Name}{2021 -- 2025}
  {B.S. in Computer Science, GPA 3.9/4.0}{City, Country}
\begin{resumeBullets}
  \item Relevant coursework: Algorithms, Distributed Systems, Compilers.
  \item Teaching assistant for the introductory systems course.
\end{resumeBullets}

\resumeSection{Experience}

\resumeEntry
  {Company Name}{Jun 2024 -- Aug 2024}
  {Software Engineering Intern}{City, Country}
\begin{resumeBullets}
  \item Built a service that reduced median request latency by 38\%.
  \item Migrated the deployment pipeline, cutting release time from hours to minutes.
  \item Wrote the integration test suite now gating every merge.
\end{resumeBullets}

\resumeEntry
  {Research Lab}{Jan 2024 -- May 2024}
  {Undergraduate Researcher}{City, Country}
\begin{resumeBullets}
  \item Implemented and evaluated three approaches against a published baseline.
  \item Co-authored a workshop paper on the results.
\end{resumeBullets}

\resumeSection{Projects}

\resumeEntry
  {Project Name}{2024}
  {TypeScript, Rust, PostgreSQL}{}
\begin{resumeBullets}
  \item One-sentence description of what it does and why it is interesting.
  \item A measurable outcome: users, throughput, or accuracy.
\end{resumeBullets}

\resumeSection{Skills}

\textbf{Languages:} Rust, TypeScript, Python, C, SQL \\
\textbf{Tools:} Git, Docker, Linux, \LaTeX{} \\
\textbf{Interests:} Compilers, developer tooling, typography

\end{document}
`;

const BEAMER_MAIN = String.raw`% !TeX root = main.tex
\documentclass[aspectratio=169]{beamer}

\usetheme{Madrid}
\usecolortheme{seahorse}
\setbeamertemplate{navigation symbols}{}
\setbeamertemplate{caption}[numbered]

\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\graphicspath{{figures/}}

\title[Short Title]{The Full Title of Your Talk}
\subtitle{A Short Subtitle}
\author[Your Name]{Your Name}
\institute[Institution]{Department \\ Institution}
\date{\today}

\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\begin{frame}{Outline}
  \tableofcontents
\end{frame}

\section{Motivation}

\begin{frame}{Why This Matters}
  \begin{itemize}
    \item<1-> The first point appears immediately.
    \item<2-> The second appears on the next click.
    \item<3-> Overlay specifications control the pacing.
  \end{itemize}

  \vspace{1em}
  \onslide<3->{
    \begin{block}{Key idea}
      State the central insight in one sentence.
    \end{block}
  }
\end{frame}

\section{Approach}

\begin{frame}{Two Columns}
  \begin{columns}[T]
    \begin{column}{0.5\textwidth}
      \textbf{Before}
      \begin{itemize}
        \item Manual process
        \item Slow feedback
      \end{itemize}
    \end{column}
    \begin{column}{0.5\textwidth}
      \textbf{After}
      \begin{itemize}
        \item Automated
        \item Immediate feedback
      \end{itemize}
    \end{column}
  \end{columns}
\end{frame}

\begin{frame}{A Result}
  \begin{equation*}
    \mathcal{L}(\theta) = \frac{1}{n}\sum_{i=1}^{n} \ell\bigl(f_\theta(x_i), y_i\bigr)
  \end{equation*}

  \begin{table}
    \centering
    \begin{tabular}{lrr}
      \toprule
      Method & Accuracy & Time \\
      \midrule
      Baseline & 91.2\% & 4.1s \\
      Ours     & 95.8\% & 1.7s \\
      \bottomrule
    \end{tabular}
    \caption{Comparison against the baseline.}
  \end{table}
\end{frame}

\section{Conclusion}

\begin{frame}{Takeaways}
  \begin{enumerate}
    \item The first thing the audience should remember.
    \item The second thing.
    \item Where to find the code or paper.
  \end{enumerate}
\end{frame}

\begin{frame}[plain]
  \begin{center}
    {\Huge Thank you}\\[1em]
    {\large Questions?}
  \end{center}
\end{frame}

\end{document}
`;

const HOMEWORK_MAIN = String.raw`% !TeX root = main.tex
\documentclass[11pt,a4paper]{article}

\usepackage[margin=1in]{geometry}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{amsthm}
\usepackage{enumitem}
\usepackage{graphicx}
\usepackage{fancyhdr}
\usepackage[colorlinks=true,linkcolor=blue,urlcolor=blue]{hyperref}

% --- Assignment metadata: edit these three lines ----------------------------
\newcommand{\hwCourse}{COURSE 101: Course Title}
\newcommand{\hwTitle}{Homework 1}
\newcommand{\hwAuthor}{Your Name}

\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\hwAuthor}
\fancyhead[C]{\hwTitle}
\fancyhead[R]{\hwCourse}
\fancyfoot[C]{\thepage}
\renewcommand{\headrulewidth}{0.4pt}

% --- Problem environment -----------------------------------------------------
\newcounter{problem}
\newenvironment{problem}[1][]{%
  \refstepcounter{problem}%
  \vspace{0.8em}%
  \noindent\textbf{\large Problem \theproblem}%
  \if\relax\detokenize{#1}\relax\else{ \normalsize(#1)}\fi%
  \par\vspace{0.3em}%
}{\par\vspace{0.6em}}

% Solutions are set off by a rule so they are easy to scan.
\newenvironment{solution}{%
  \par\noindent\textit{Solution.}\;%
}{\hfill$\blacksquare$\par\vspace{0.4em}}

\theoremstyle{plain}
\newtheorem{lemma}{Lemma}

\begin{document}

\begin{center}
  {\Large\bfseries \hwTitle}\\[0.3em]
  {\large \hwCourse}\\[0.3em]
  \hwAuthor \quad\textbullet\quad \today
\end{center}

\vspace{0.5em}
\hrule
\vspace{0.5em}

\begin{problem}[10 points]
  Prove that $\sqrt{2}$ is irrational.
\end{problem}

\begin{solution}
  Suppose for contradiction that $\sqrt{2} = p/q$ in lowest terms with
  $q \neq 0$. Then $p^{2} = 2q^{2}$, so $p$ is even; write $p = 2k$. Then
  $4k^{2} = 2q^{2}$, so $q^{2} = 2k^{2}$ and $q$ is even as well. This
  contradicts $p/q$ being in lowest terms.
\end{solution}

\begin{problem}[15 points]
  Evaluate the following integral.
  \begin{equation*}
    \int_{0}^{\pi} \sin^{2}(x)\,\mathrm{d}x
  \end{equation*}
\end{problem}

\begin{solution}
  Using $\sin^{2}(x) = \tfrac{1}{2}\bigl(1 - \cos(2x)\bigr)$,
  \begin{align}
    \int_{0}^{\pi} \sin^{2}(x)\,\mathrm{d}x
      &= \frac{1}{2}\int_{0}^{\pi} 1 \,\mathrm{d}x
       - \frac{1}{2}\int_{0}^{\pi} \cos(2x)\,\mathrm{d}x \\
      &= \frac{\pi}{2} - \frac{1}{4}\Bigl[\sin(2x)\Bigr]_{0}^{\pi}
       = \frac{\pi}{2}.
  \end{align}
\end{solution}

\begin{problem}[5 points each]
  Answer the following.
  \begin{enumerate}[label=(\alph*)]
    \item State the definition of a continuous function.
    \item Give an example of a function continuous at exactly one point.
  \end{enumerate}
\end{problem}

\begin{solution}
  \begin{enumerate}[label=(\alph*)]
    \item $f$ is continuous at $a$ if for every $\varepsilon > 0$ there is a
      $\delta > 0$ such that $|x - a| < \delta$ implies
      $|f(x) - f(a)| < \varepsilon$.
    \item $f(x) = x$ for rational $x$ and $f(x) = 0$ otherwise is continuous
      only at $x = 0$.
  \end{enumerate}
\end{solution}

\end{document}
`;

export const TEMPLATES: Template[] = [
  {
    id: 'article',
    name: 'Article',
    description: 'A paper with sections, theorems, a table and a BibTeX bibliography.',
    mainDocument: 'main.tex',
    files: [
      { path: 'main.tex', content: ARTICLE_MAIN },
      { path: 'sections/introduction.tex', content: ARTICLE_INTRO },
      { path: 'refs.bib', content: SHARED_BIB },
      { path: 'figures/.gitkeep', content: '' },
    ],
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Multi-chapter technical report with a table of contents and appendix.',
    mainDocument: 'main.tex',
    files: [
      { path: 'main.tex', content: REPORT_MAIN },
      { path: 'chapters/introduction.tex', content: REPORT_INTRO },
      { path: 'chapters/background.tex', content: REPORT_BACKGROUND },
      { path: 'refs.bib', content: SHARED_BIB },
      { path: 'figures/.gitkeep', content: '' },
    ],
  },
  {
    id: 'book',
    name: 'Book',
    description: 'Front/main/back matter, chapters, theorem environments and an index.',
    mainDocument: 'main.tex',
    files: [
      { path: 'main.tex', content: BOOK_MAIN },
      { path: 'chapters/chapter1.tex', content: BOOK_CHAPTER_ONE },
      { path: 'chapters/chapter2.tex', content: BOOK_CHAPTER_TWO },
      { path: 'refs.bib', content: SHARED_BIB },
      { path: 'figures/.gitkeep', content: '' },
    ],
  },
  {
    id: 'resume',
    name: 'Resume',
    description: 'Single-page resume with custom section styling and no exotic packages.',
    mainDocument: 'resume.tex',
    files: [{ path: 'resume.tex', content: RESUME_MAIN }],
  },
  {
    id: 'beamer',
    name: 'Beamer Presentation',
    description: 'Widescreen slides with overlays, columns, blocks and a title page.',
    mainDocument: 'main.tex',
    files: [
      { path: 'main.tex', content: BEAMER_MAIN },
      { path: 'figures/.gitkeep', content: '' },
    ],
  },
  {
    id: 'homework',
    name: 'Homework Assignment',
    description: 'Problem and solution environments with a course header.',
    mainDocument: 'main.tex',
    files: [{ path: 'main.tex', content: HOMEWORK_MAIN }],
  },
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
