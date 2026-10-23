export interface ApplyOptions {
  targetFilePath?: string | null;
  defaultContentPath?: string | null;
  drafts?: Record<string, unknown>;
  apply?: boolean;
}

export interface ApplyResult {
  success: boolean;
  applied: boolean;
  dryRun: boolean;
  alreadyUpToDate: boolean;
  targetFilePath: string;
  backupFilePath: string | null;
  revision: string;
  updatedAt: string;
  pagesToUpdate?: string[];
  updatedPages?: string[];
}

export const EXPECTED_SCHEMA_VERSION: number;
export function validateLegalDocumentStructure(doc: unknown, context: string): void;
export function validateTargetData(data: unknown): void;
export function validateSourceDrafts(sourceDrafts: unknown): void;
export function resolveDefaultContentPath(): string;
export function resolveActiveContentPath(customPath?: string | null): string;
export function createBackup(filePath: string): string | null;
export function rotateBackups(filePath: string, maxKeep?: number): void;
export function atomicWriteJson(filePath: string, data: unknown): void;
export function areDraftsEqual(draftA: unknown, draftB: unknown): boolean;
export function applyLegalDrafts(options?: ApplyOptions): ApplyResult;
