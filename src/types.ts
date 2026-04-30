/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PatientStatus = 'Not started' | 'Annotating' | 'Completed' | 'Missing Video' | 'Needs Review';
export type IssueType = 'retrieval' | 'logic' | 'distractor' | 'mapping' | 'missing video' | 'none';

export interface ValidationScores {
  questionQuality: number;
  answerGrounding: number;
  distractorQuality: number;
  reliability: number;
  consistencyFlags: string[];
}

export interface LogicPoint {
  evidence: {
    emr: boolean;
    video: boolean;
    knowledge: boolean;
  };
  answerOrigin: string;
  choiceRule: string;
  doctorConstraints?: string;
  distractorLogic?: string;
}

export interface Benchmark {
  id?: string;
  patientId: string;
  question: string;
  answer: string;
  choices: string[];
  options?: string[]; // For ingestion flex
  logic: LogicPoint;
  status: 'draft' | 'approved' | 'flagged';
  category?: string;
  phaseId?: string;
  stepId?: string;
  videoCaption?: string;
  validation?: ValidationScores;
  feedback?: string;
  issueType?: IssueType;
  authorId?: string;
  createdAt?: any;
}

export interface ScoringBlock {
  consensus: {
    questionConstruction: { finalScore5: number };
    answerValidity: { finalScore5: number };
    distractorQuality: { finalScore5: number };
    unifiedReliabilityScore100: number;
  };
  escalationPolicy: {
    sendToHumanReview: boolean;
  };
  confidence: {
    overall: number;
    reasoning?: string;
  };
}

export interface Revision {
  timestamp: any;
  authorId: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  reviewDecision: 'approve' | 'revise' | 'flag';
  feedback: string;
}

export interface HierarchicalQuestion {
  id: string;
  question: string;
  answer: string;
  choices: string[];
  options?: string[]; // Fallback
  videoCaption?: string;
  video_caption?: string; 
  sourcePath?: string;
  source_path?: string;
  videoUrl?: string; // Phase/Step specific video
  logic?: LogicPoint; // Extended logic block
  scoring: ScoringBlock;
  clipInfo?: any;
  clip_info?: any;
  
  // Doctor Review persistence
  reviewStatus?: 'pending' | 'reviewed' | 'revised' | 'flagged' | 'published';
  issueType?: IssueType;
  doctorFeedback?: string;
  doctorConfidence?: number;
  lastEditedBy?: string;
  lastEditedTime?: any;
  originalData?: Partial<HierarchicalQuestion>; // Store original for change tracking
  revisions?: Revision[];
}

export interface CategoryNode {
  id: string;
  name: string;
  videoUrl?: string; // Phase level video
  questions: HierarchicalQuestion[];
}

export interface VideoNode {
  id: string;
  title: string;
  videoUrl?: string;
  videoFolderUrl?: string;
  files?: Array<{ fileName: string; localRelativePath: string }>;
  categories: CategoryNode[];
}

export interface Patient {
  id: string;
  name: string;
  status: PatientStatus;
  operativeEMR: string;
  emrSummary?: string;
  differences: {
    anatomy?: string[];
    abnormalFindings?: string[];
    instrumentUsage?: string[];
  };
  videoFolderUrl?: string;
  videoUrl?: string; // Patient-level direct playback override
  videos: VideoNode[];
  benchmarkCount: number;
}

export interface IngestionDiagnostic {
  totalPatients: number;
  totalVideos: number;
  missingVideos: string[];
  orphanedVideos: string[];
  malformedRecords: number;
  status: 'idle' | 'processing' | 'ready';
}
