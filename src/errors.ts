export type ErrorCode =
  | "INVALID_GRAPH"
  | "INVALID_OPTIONS"
  | "NOTHING_TO_RENDER"
  | "UNKNOWN_VIEW"
  | "UNKNOWN_ICON"
  | "INVALID_ICON"
  | "OUTPUT_EXISTS"
  | "STALE_OUTPUT"
  | "IO_ERROR"
  | "USAGE";

export type ValidationIssue = { path: string; message: string };

export class ArchloomError extends Error {
  readonly code: ErrorCode;
  readonly issues: readonly ValidationIssue[];

  constructor(code: ErrorCode, message: string, issues: readonly ValidationIssue[] = []) {
    super(message);
    this.name = "ArchloomError";
    this.code = code;
    this.issues = issues;
  }
}
