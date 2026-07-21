/**
 * Minimal ambient declaration for `papaparse`.
 * The `@types/papaparse` package is declared in package.json but is not
 * available in this offline environment, so we ship a focused declaration
 * covering the subset of the API the app actually uses (`Papa.parse`).
 */
declare module "papaparse" {
  export interface ParseError {
    type?: string;
    code?: string;
    message: string;
    row?: number;
  }

  export interface ParseMeta {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
    fields?: string[];
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: ParseMeta;
  }

  export interface ParseConfig<T = unknown> {
    delimiter?: string;
    newline?: string;
    quoteChar?: string;
    escapeChar?: string;
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    dynamicTyping?: boolean;
    preview?: number;
    encoding?: string;
    worker?: boolean;
    comments?: boolean | string;
    delimitersToGuess?: string[];
    step?: (results: ParseResult<T>, parser: unknown) => void;
    complete?: (results: ParseResult<T>) => void;
    error?: (error: ParseError) => void;
    transform?: (value: string, field: string | number) => unknown;
    transformHeader?: (header: string, index: number) => string;
  }

  export function parse<T = unknown>(
    input: string,
    config?: ParseConfig<T>,
  ): ParseResult<T>;

  export function unparse(
    data: unknown,
    config?: Record<string, unknown>,
  ): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
  };

  export default Papa;
}
