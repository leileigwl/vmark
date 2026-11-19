export type ProfileKind = 'desktop-electron' | 'web-service';
export type RiskLevel = 'low' | 'mid' | 'high';
export type TrackType = 'full' | 'fast';
export type PhaseType =
  | 'SPEC'
  | 'PROTOTYPE_APPROVED'
  | 'CONTRACT_FROZEN'
  | 'FRONTEND_TDD'
  | 'BACKEND_TDD'
  | 'SLICE_TDD'
  | 'MERGE_GATE'
  | 'ARCHIVED';

export interface HarnessViolation {
  file: string;
  line: number;
  rule_id: string;
  fix_hint: string;
}

export interface LayerBoundaryRule {
  from: string;
  forbidImportFrom: string[];
}

export interface HarnessProjectConfig {
  projectId: string;
  profile: ProfileKind;
  owner: string;
  githubNotifyUser?: string;
  bootstrapLocked: boolean;
  bootstrapUnlockReason?: string | null;
  bootstrapLockProtectedPaths: string[];
  licenseMode?: string;
  limits: {
    newFileMaxLines: number;
    sliceMaxDiffLines: number;
    agentsMdMaxLines: number;
    handoffMaxLines: number;
    circuitBreakerMaxRetries: number;
  };
  moduleIslands?: {
    rendererRoot?: string;
    mainIpcRoot?: string;
    barrelFile?: string;
    forbidCrossIslandDeepImport?: boolean;
    forbidCycles?: boolean;
  };
  layerBoundaries: LayerBoundaryRule[];
  commands: Record<string, string>;
}

export interface HarnessState {
  changeName: string;
  track: TrackType;
  phase: PhaseType;
  prototypeApproved: boolean;
  contractFrozen: boolean;
  activeFreezeLock: boolean;
  gates: {
    specValidated: boolean;
    frontendTddPassed: boolean;
    ipcContractPassed: boolean;
    backendTddPassed: boolean;
  };
  updatedAt: string;
}

export interface HarnessSlice {
  sliceId: string;
  changeName: string;
  assigneeTier: 'small-model' | 'frontier-model';
  worktreeBranch: string;
  status: 'pending' | 'in_progress' | 'escalated' | 'merged' | 'archived';
  retryCount: number;
  maxRetries: number;
  maxDiffLines: number;
  ownedPaths: string[];
  forbiddenPaths: string[];
  requiredChecks: Array<'L0' | 'L1' | 'L2' | 'L3'>;
  predictedRisk?: RiskLevel;
  riskReasons?: string[];
  lastFailureSummary: string | null;
}

export interface DesignRiskResult {
  level: RiskLevel;
  badge: string;
  reasons: string[];
  requiredChecks: Array<'L0' | 'L1' | 'L2' | 'L3'>;
  recommendedAssigneeTier: 'small-model' | 'frontier-model';
  paths: string[];
}

export interface RatchetConfig {
  defaultNewFileMaxLines: number;
  files: Record<string, { maxLines: number; targetLines: number }>;
}

export interface ParsedDiffFile {
  file: string;
  isNew: boolean;
  isDeleted: boolean;
  addedLines: Array<{ line: number; content: string }>;
  removedLines: Array<{ content: string }>;
  addedCount: number;
  removedCount: number;
}

export interface RiskClassificationResult {
  level: RiskLevel;
  reasons: string[];
  diffLines: number;
  changedFiles: string[];
  skipE2e: boolean;
  runL3: boolean;
  violations: HarnessViolation[];
}
