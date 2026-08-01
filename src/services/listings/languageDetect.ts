/**
 * Heuristic language detection for pasted code.
 *
 * Deliberately a scored rule set rather than a statistical model: it has to run
 * offline and instantly on every paste, and being *approximately* right with an
 * obvious override beats being occasionally right after a delay.
 *
 * Each rule contributes to one language's score; the highest score wins,
 * provided it clears a confidence floor. Below that the caller keeps whatever
 * language was already selected.
 */

import { languageForFile } from './languages';

interface Rule {
  language: string;
  pattern: RegExp;
  /** How strongly this rule implies the language. */
  weight: number;
}

/**
 * Rules are ordered by how *exclusive* the evidence is: a shebang or a
 * language-unique keyword scores far higher than a brace or a semicolon.
 */
const RULES: Rule[] = [
  // Shebangs are conclusive.
  { language: 'bash', pattern: /^#!.*\b(bash|sh|zsh)\b/m, weight: 12 },
  { language: 'python', pattern: /^#!.*\bpython/m, weight: 12 },

  // Rust
  { language: 'rust', pattern: /\bfn\s+\w+\s*(<[^>]*>)?\s*\(/, weight: 6 },
  { language: 'rust', pattern: /\blet\s+mut\b/, weight: 8 },
  { language: 'rust', pattern: /\b(impl|trait|enum)\s+\w+/, weight: 4 },
  { language: 'rust', pattern: /->\s*(Result|Option|Vec|String|&str|[iu](8|16|32|64|size))\b/, weight: 6 },
  { language: 'rust', pattern: /\b(println!|vec!|format!|panic!)/, weight: 9 },
  { language: 'rust', pattern: /\buse\s+(std|crate|super)::/, weight: 8 },

  // Go
  { language: 'go', pattern: /^package\s+\w+\s*$/m, weight: 9 },
  { language: 'go', pattern: /\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/, weight: 7 },
  { language: 'go', pattern: /:=/, weight: 5 },
  { language: 'go', pattern: /\bfmt\.(Print|Sprint)/, weight: 8 },
  { language: 'go', pattern: /\bif\s+err\s*!=\s*nil\b/, weight: 10 },

  // Python
  { language: 'python', pattern: /^\s*def\s+\w+\s*\(.*\)\s*(->.*)?:\s*$/m, weight: 9 },
  { language: 'python', pattern: /^\s*(from\s+[\w.]+\s+)?import\s+[\w.,\s*]+$/m, weight: 6 },
  { language: 'python', pattern: /^\s*class\s+\w+(\(.*\))?\s*:\s*$/m, weight: 7 },
  { language: 'python', pattern: /\bprint\s*\(/, weight: 3 },
  { language: 'python', pattern: /\b(self|None|True|False|elif)\b/, weight: 5 },
  { language: 'python', pattern: /^\s*(if|for|while|with|try)\b.*:\s*$/m, weight: 3 },

  // Java
  { language: 'java', pattern: /\b(public|private|protected)\s+(static\s+)?(final\s+)?[\w<>[\]]+\s+\w+\s*\(/, weight: 7 },
  { language: 'java', pattern: /\bSystem\.out\.print/, weight: 10 },
  { language: 'java', pattern: /\bpublic\s+class\s+\w+/, weight: 7 },
  { language: 'java', pattern: /^\s*import\s+(java|javax)\./m, weight: 10 },
  { language: 'java', pattern: /\bnew\s+\w+\s*\(/, weight: 2 },

  // C / C++
  { language: 'c', pattern: /^\s*#include\s*<\w+\.h>/m, weight: 8 },
  { language: 'c', pattern: /\bprintf\s*\(/, weight: 5 },
  { language: 'c', pattern: /\bint\s+main\s*\(\s*(void|int\s+argc)?/, weight: 6 },
  { language: 'c', pattern: /\b(malloc|free|sizeof)\s*\(/, weight: 4 },
  { language: 'cpp', pattern: /^\s*#include\s*<(iostream|vector|string|map|algorithm)>/m, weight: 10 },
  { language: 'cpp', pattern: /\bstd::/, weight: 9 },
  { language: 'cpp', pattern: /\b(cout|cin|endl)\b/, weight: 8 },
  { language: 'cpp', pattern: /\btemplate\s*</, weight: 7 },

  // JavaScript / TypeScript
  { language: 'javascript', pattern: /\b(const|let)\s+\w+\s*=/, weight: 4 },
  { language: 'javascript', pattern: /\bfunction\s+\w*\s*\(/, weight: 4 },
  { language: 'javascript', pattern: /=>\s*\{/, weight: 4 },
  { language: 'javascript', pattern: /\bconsole\.(log|error|warn)\s*\(/, weight: 8 },
  { language: 'javascript', pattern: /\b(require|module\.exports)\b/, weight: 6 },
  { language: 'typescript', pattern: /\binterface\s+\w+\s*\{/, weight: 9 },
  { language: 'typescript', pattern: /:\s*(string|number|boolean|void|unknown|never)\b/, weight: 8 },
  { language: 'typescript', pattern: /\btype\s+\w+\s*=/, weight: 7 },
  { language: 'typescript', pattern: /\b(public|private|readonly)\s+\w+\s*:/, weight: 6 },

  // Others
  { language: 'kotlin', pattern: /\bfun\s+\w+\s*\(.*\)\s*(:\s*\w+)?\s*\{/, weight: 7 },
  { language: 'kotlin', pattern: /\b(val|var)\s+\w+\s*:\s*\w+/, weight: 6 },
  { language: 'kotlin', pattern: /\bprintln\s*\(/, weight: 4 },
  { language: 'swift', pattern: /\bfunc\s+\w+\s*\(.*\)\s*(->\s*\w+)?\s*\{/, weight: 6 },
  { language: 'swift', pattern: /\b(guard|@objc|@IBOutlet)\b/, weight: 9 },
  { language: 'swift', pattern: /\blet\s+\w+\s*:\s*\w+\s*=/, weight: 5 },
  { language: 'sql', pattern: /\bSELECT\b[\s\S]*\bFROM\b/i, weight: 11 },
  { language: 'sql', pattern: /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE)\b/i, weight: 11 },
  { language: 'bash', pattern: /^\s*(echo|cd|export|sudo|grep|awk|sed)\s/m, weight: 5 },
  { language: 'bash', pattern: /\$\{?\w+\}?/, weight: 2 },
  { language: 'html', pattern: /<\/?(html|div|span|body|head|p|a|script)\b/i, weight: 9 },
  { language: 'css', pattern: /[.#]?[\w-]+\s*\{[^}]*:\s*[^;]+;/, weight: 6 },
  { language: 'yaml', pattern: /^\s*-?\s*[\w-]+:\s*(\S.*)?$/m, weight: 2 },
  { language: 'yaml', pattern: /^---\s*$/m, weight: 6 },
  { language: 'markdown', pattern: /^#{1,6}\s+\S/m, weight: 5 },
  { language: 'markdown', pattern: /^\s*[-*]\s+\S/m, weight: 2 },
];

/** Below this score the evidence is too thin to override the user's choice. */
const CONFIDENCE_FLOOR = 8;

export interface DetectionResult {
  language: string;
  score: number;
  /** True when the score cleared the confidence floor. */
  confident: boolean;
}

/**
 * Guess the language of a snippet.
 *
 * `fileName`, when known, is treated as strong evidence — an extension is a
 * far better signal than any amount of pattern matching.
 */
export function detectLanguage(code: string, fileName?: string): DetectionResult {
  if (fileName !== undefined) {
    const byExtension = languageForFile(fileName);
    if (byExtension !== undefined) {
      return { language: byExtension.id, score: 100, confident: true };
    }
  }

  const trimmed = code.trim();
  if (trimmed === '') return { language: 'text', score: 0, confident: false };

  // Only the head is scanned: a rule that has not fired in 200 lines will not
  // fire in 20,000, and this runs on every paste.
  const sample = trimmed.split('\n').slice(0, 200).join('\n');

  const scores = new Map<string, number>();
  for (const rule of RULES) {
    if (!rule.pattern.test(sample)) continue;
    scores.set(rule.language, (scores.get(rule.language) ?? 0) + rule.weight);
  }

  // JavaScript rules also match TypeScript, so TS keeps its own evidence and
  // additionally inherits JS's — otherwise plain JS would usually outscore it.
  const javascript = scores.get('javascript') ?? 0;
  if (scores.has('typescript') && javascript > 0) {
    scores.set('typescript', scores.get('typescript')! + javascript);
  }
  // The same holds for C++ over C.
  const c = scores.get('c') ?? 0;
  if (scores.has('cpp') && c > 0) {
    scores.set('cpp', scores.get('cpp')! + c);
  }

  let best = { language: 'text', score: 0 };
  for (const [language, score] of scores) {
    if (score > best.score) best = { language, score };
  }

  return {
    language: best.score > 0 ? best.language : 'text',
    score: best.score,
    confident: best.score >= CONFIDENCE_FLOOR,
  };
}
