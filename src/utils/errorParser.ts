export interface ParsedError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string[];
  raw: string;
}

// ─── Regex Patterns (ordered by specificity) ──────────────────────────────────

const PATTERNS: Array<{
  name: string;
  regex: RegExp;
  extract: (m: RegExpMatchArray) => Omit<ParsedError, 'raw'>;
}> = [
  {
    // TypeScript/JS: "TypeError: X  at file.ts:10:5"
    name: 'ts-error',
    regex: /(?:Error|TypeError|SyntaxError|RangeError)[^:]*:\s*(.+?)\s+at\s+(.+?):(\d+):(\d+)/,
    extract: m => ({ message: m[1], file: m[2], line: +m[3], column: +m[4] }),
  },
  {
    // Rust: "error[E0001]: msg --> file.rs:10:5"
    name: 'rust',
    regex: /error\[.+?\]:\s*(.+?)\s+-->\s*(.+?):(\d+):(\d+)/,
    extract: m => ({ message: m[1], file: m[2], line: +m[3], column: +m[4] }),
  },
  {
    // Python: 'File "path.py", line 10'
    name: 'python',
    regex: /File "(.+?)", line (\d+)/,
    extract: m => ({ message: '', file: m[1], line: +m[2] }),
  },
  {
    // Generic: "file:line:col: message"
    name: 'generic',
    regex: /^(.+?):(\d+):(\d+):\s*(.+)$/m,
    extract: m => ({ message: m[4], file: m[1], line: +m[2], column: +m[3] }),
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Parse a single error string into a structured object. */
export function parseError(output: string): ParsedError {
  for (const { regex, extract } of PATTERNS) {
    const match = output.match(regex);
    if (match) {
      return { ...extract(match), stack: output.split('\n').slice(1).filter(Boolean), raw: output };
    }
  }
  return {
    message: output.split('\n')[0] ?? output,
    stack: output.split('\n').slice(1).filter(Boolean),
    raw: output,
  };
}

/** Scan terminal output and return all detected errors. */
export function extractErrors(terminalOutput: string): ParsedError[] {
  const lines = terminalOutput.split('\n');
  const errors: ParsedError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match lines that look like errors but skip comment lines
    if (/\b(error|Error|ERROR|exception|Exception)\b/.test(line) && !/^\s*\/\//.test(line)) {
      const context = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
      errors.push(parseError(context));
    }
  }

  return errors;
}
