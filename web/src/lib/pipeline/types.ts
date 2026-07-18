export interface PipelineRunRow {
  id: string;
  story_id: string | null;
  status: string | null;
  current_stage: string | null;
  total_cost_usd: number | null;
  budget_usd: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface PipelineStageOutput {
  stage?: string;
  title?: string;
  paid?: boolean;
  summary?: string;
  sections?: { label: string; value: string }[];
  editedManually?: boolean;
  generatedAt?: string;
}

export interface PipelineStageRow {
  id: string;
  run_id: string;
  stage: string;
  seq: number;
  status: string;
  auto_approve: boolean | null;
  output: PipelineStageOutput | null;
  model: string | null;
  tokens_used: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  attempts: number;
  last_error: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageVersionRow {
  id: string;
  stage_id: string;
  version: number;
  output: PipelineStageOutput | null;
  cost_usd: number | null;
  model: string | null;
  created_at: string;
}
