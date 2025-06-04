/**
 * TypeScript types for MP Basketball Supabase schema
 * This file contains types for all tables and API interactions
 */

// ======================================================================
// Utility Types
// ======================================================================

/**
 * Generic type for Supabase responses
 */
export type SupabaseResponse<T> = {
  data: T | null;
  error: Error | null;
};

/**
 * UUID type alias
 */
export type UUID = string;

/**
 * Timestamp type alias
 */
export type Timestamp = string;

// ======================================================================
// Enum Types
// ======================================================================

/**
 * Status values for various entities
 */
export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  ERROR = 'error',
  STARTED = 'started',
}

/**
 * Role types for persons
 */
export enum Role {
  COACH = 'coach',
  PLAYER = 'player',
  ADMIN = 'admin',
  PARENT = 'parent',
  FOUNDER = 'founder',
}

/**
 * Observation types
 */
export enum ObservationType {
  DEV_NOTE = 'DevNote',
  COACH_REFLECTION = 'CoachReflection',
  PLAYER_REFLECTION = 'PlayerReflection',
  SESSION_SUMMARY = 'SessionSummary',
  ATTENDANCE_NOTE = 'AttendanceNote',
}

/**
 * Tag types
 */
export enum TagType {
  SKILL = 'skill',
  CONSTRAINT = 'constraint',
  THEME = 'theme',
  CUE = 'cue',
}

/**
 * Event types for agent events
 */
export enum EventType {
  GENERATE_BLOCKS_REQUEST = 'generate_blocks_request',
  GENERATE_BLOCKS_SUCCESS = 'generate_blocks_success',
  GENERATE_BLOCKS_ERROR = 'generate_blocks_error',
  GENERATE_PDP_REQUEST = 'generate_pdp_request',
  GENERATE_PDP_SUCCESS = 'generate_pdp_success',
  GENERATE_PDP_ERROR = 'generate_pdp_error',
  LOG_REFLECTION_REQUEST = 'log_reflection_request',
  LOG_REFLECTION_SUCCESS = 'log_reflection_success',
  LOG_REFLECTION_ERROR = 'log_reflection_error',
  ATTENDANCE_LOG_REQUEST = 'attendance_log_request',
  ATTENDANCE_LOG_SUCCESS = 'attendance_log_success',
  ATTENDANCE_LOG_ERROR = 'attendance_log_error',
  UPLOAD_REQUEST = 'upload_request',
  UPLOAD_SUCCESS = 'upload_success',
  UPLOAD_ERROR = 'upload_error',
}

// ======================================================================
// Core Entity Types
// ======================================================================

/**
 * Person entity
 */
export interface Person {
  id: UUID;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  roles: Role[];
  birthdate?: string;
  graduation_year?: number;
  jersey_number?: number;
  height_cm?: number;
  weight_kg?: number;
  certifications?: string;
  bio?: string;
  coaching_level?: string;
  org_uid?: UUID;
  notes?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  current_level?: number;
  team_layer?: number;
  status?: string;
  attendance_pct?: number;
  mental_health_flag?: boolean;
  mental_health_note?: string;
  aliases?: string[];
  handedness?: string;
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
  team?: string;
  pod?: string;
  primary_focus?: string;
  secondary_focus?: string;
  overall_challenge_point?: string;
}

/**
 * Session entity
 */
export interface Session {
  id: UUID;
  title?: string;
  objective?: string;
  team_id?: UUID;
  pod_id?: UUID;
  coach_id?: UUID;
  status?: Status;
  planned_player_count?: number;
  session_notes?: string;
  created_at: Timestamp;
  advancement_levels?: AdvancementLevels;
  responsibility_tiers?: ResponsibilityTiers;
  collective_growth_phase?: number;
  created_by?: string;
  last_updated?: Timestamp;
  session_plan?: SessionPlan;
  session_id?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
  overall_theme_tags?: string[];
  planned_attendance?: string[];
  reflection_fields?: ReflectionFields;
  person_id?: UUID;
}

/**
 * PDP (Player Development Plan) entity
 */
export interface PDP {
  id: UUID;
  person_id: UUID;
  is_current: boolean;
  skill_tags?: string[];
  constraint_tags?: string[];
  theme_tags?: string[];
  pdp_text_coach?: string;
  pdp_text_player?: string;
  source_observation_id?: string[];
  previous_version_id?: UUID;
  created_at: Timestamp;
  skills_summary?: SkillsSummary;
  constraints_summary?: ConstraintsSummary;
  last_updated?: Timestamp;
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
  pdp_id?: string;
  updated_at?: Timestamp;
  archived_at?: Timestamp;
  person_name?: string;
  primary_focus?: string;
  secondary_focus?: string;
  pdp_full_text?: string;
  observation_pdp_alignment_comment?: string;
  target_challenge_point?: string;
  current_challenge_point?: string;
  skill_id?: UUID;
  team?: string;
  pod?: string;
}

/**
 * Attendance entity
 */
export interface Attendance {
  id: UUID;
  session_id: UUID;
  person_id: UUID;
  present: boolean;
  status?: string;
  note?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Observation Logs entity
 */
export interface ObservationLog {
  id: UUID;
  observation_id: UUID;
  entry_type: string;
  payload: any;
  created_at: Timestamp;
  person_id?: UUID;
  analysis?: string;
  recommendation?: string;
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
}

/**
 * Observation entity
 */
export interface Observation {
  id: UUID;
  perso_id: UUID;
  session_uid?: UUID;
  raw_note: string;
  tagged_skills?: string[];
  tagged_constraints?: string[];
  reflection_quality_score?: number;
  created_at: Timestamp;
  observation_type?: ObservationType;
  player_names?: string[];
  attendance_flags?: string[];
  session_notes?: string;
  observation_summary?: string;
  tagged?: boolean;
  source_id?: string;
  status?: Status;
  unmatched_names?: string;
}

/**
 * Tag entity
 */
export interface Tag {
  id: UUID;
  name: string;
  category: string;
  description?: string;
  active: boolean;
  created_at: Timestamp;
  tag_type: TagType;
  synonyms?: string[];
  pdp_group?: string;
  tag_name?: string;
  tag_parent_id?: string;
  use_case?: string;
  verified?: boolean;
  source_uid?: string;
  suggested_by?: string;
  updated_at?: Timestamp;
  subcategory?: string;
  combo_code?: number;
}

/**
 * Session Drill entity
 */
export interface SessionDrill {
  id: UUID;
  session_id: UUID;
  drill_id: UUID;
  targeted_player_id?: string[];
  pdp_tags?: string[];
  intent?: string;
  verbal_cues?: string[];
  adaptation_notes?: string;
  time_constraint_description?: string;
  created_at: Timestamp;
}

// ======================================================================
// MPBC Specific Table Types
// ======================================================================

/**
 * MPBC Practice Session entity
 */
export interface MPBCPracticeSession {
  id: UUID;
  session_date: string;
  notes?: string;
}

/**
 * MPBC Practice Block entity
 */
export interface MPBCPracticeBlock {
  id: UUID;
  session_id: UUID;
  pillar_id: UUID;
  phase_id: UUID;
  outcome_id: UUID;
  skill_id: UUID;
  description?: string;
  start_time?: string;
  end_time?: string;
}

/**
 * MPBC Practice Session Blocks entity
 */
export interface MPBCPracticeSessionBlocks {
  id: number;
  session_id: UUID;
  block_id: UUID;
  block_order: number;
  duration: number;
  notes?: string;
}

/**
 * MPBC Skill Tag entity
 */
export interface MPBCSkillTag {
  id: UUID;
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  parent_skill_name?: string;
  synonyms?: string[];
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * MPBC Player Skill Challenge entity
 */
export interface MPBCPlayerSkillChallenge {
  id: UUID;
  person_id: UUID;
  skill_id: UUID;
  challenge_point?: string;
  last_updated: Timestamp;
}

/**
 * MPBC Pillar entity
 */
export interface MPBCPillar {
  id: UUID;
  name: string;
  description?: string;
}

/**
 * MPBC Phase entity
 */
export interface MPBCPhase {
  id: UUID;
  name: string;
  intent?: string;
  kpi?: string;
  description?: string;
  pillar_id?: string;
}

/**
 * MPBC Outcome entity
 */
export interface MPBCOutcome {
  id: UUID;
  description?: string;
  phase_id?: string;
}

/**
 * MPBC Block Player Challenge entity
 */
export interface MPBCBlockPlayerChallenge {
  id: UUID;
  block_id: UUID;
  player_id: UUID;
  skill_id: UUID;
  challenge_point?: string;
  actual_response?: string;
  feedback?: string;
  last_updated: Timestamp;
}

/**
 * MPBC Practice Themes entity
 */
export interface MPBCPracticeThemes {
  theme_id: number;
  theme_name: string;
  theme_slug: string;
  theme_category?: string;
  description?: string;
  color_hex?: string;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ======================================================================
// Complex JSON Field Types
// ======================================================================

/**
 * Session Plan type for session.session_plan JSONB field
 */
export interface SessionPlan {
  session_plan: PracticeBlock[];
  session_id?: string;
  team_id?: string;
  pod_id?: string;
  session_date?: string;
  created_by?: string;
  created_at?: string;
  last_updated?: string;
  overall_theme_tags?: string[];
  collective_growth_phase?: number;
  advancement_levels?: number[];
  responsibility_tiers?: number[];
  planned_attendance?: string[];
  session_notes?: string;
  reflection_fields?: ReflectionFields;
}

/**
 * Practice Block type for session_plan.session_plan array
 */
export interface PracticeBlock {
  block_name: string;
  format: string;
  skills: string[];
  constraints: string[];
  players: string[];
  collective_growth_phase: number;
  coaching_cues: string[];
  advancement_levels?: number[];
  responsibility_tiers?: number[];
  team_id?: string;
  pod_id?: string;
  session_id?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  location?: string;
  block_order?: number;
  drill_id?: string;
  notes?: string;
  feedback_fields?: FeedbackFields;
}

/**
 * Feedback Fields type for practice_block.feedback_fields
 */
export interface FeedbackFields {
  coach_reflection: string;
  player_reflection: string;
  observed_transfer_score: number | null;
  attendance: any[];
}

/**
 * Reflection Fields type for session.reflection_fields
 */
export interface ReflectionFields {
  coach_post_session: string;
  player_feedback: any[];
  observed_transfer_map: Record<string, any>;
}

/**
 * Skills Summary type for pdp.skills_summary
 */
export interface SkillsSummary {
  [key: string]: {
    count: number;
    relevance: number;
    description?: string;
  };
}

/**
 * Constraints Summary type for pdp.constraints_summary
 */
export interface ConstraintsSummary {
  [key: string]: {
    count: number;
    relevance: number;
    description?: string;
  };
}

/**
 * Advancement Levels type for session.advancement_levels
 */
export interface AdvancementLevels {
  [level: number]: number; // level -> count
}

/**
 * Responsibility Tiers type for session.responsibility_tiers
 */
export interface ResponsibilityTiers {
  [tier: number]: number; // tier -> count
}

// ======================================================================
// API Request/Response Types
// ======================================================================

/**
 * Generate Blocks API Request
 */
export interface GenerateBlocksRequest {
  theme?: string;
  duration?: number;
  coach_id: string;
  team_id?: string;
  pod_id?: string;
  session_date?: string;
  attendance_data?: {
    person_id: string;
    present: boolean;
    session_id?: string;
    note?: string;
  }[];
  session_id?: string;
  collective_growth_phase?: number;
}

/**
 * Generate Blocks API Response
 */
export interface GenerateBlocksResponse {
  success: boolean;
  message: string;
  session_id: string;
  session_plan: SessionPlan;
  status: Status;
  db_operation: 'insert' | 'update';
  error?: string;
  stack?: string;
}

/**
 * Generate PDP API Request
 */
export interface GeneratePDPRequest {
  person_id: string;
  coach_id: string;
  include_observations?: boolean;
  observation_window_days?: number;
  previous_pdp_id?: string;
}

/**
 * Generate PDP API Response
 */
export interface GeneratePDPResponse {
  success: boolean;
  message: string;
  pdp_id: string;
  pdp: PDP;
  status: Status;
  db_operation: 'insert' | 'update';
  error?: string;
  stack?: string;
}

/**
 * Log Reflection API Request
 */
export interface LogReflectionRequest {
  person_id: string;
  session_id?: string;
  raw_note: string;
  observation_type: ObservationType;
  coach_id?: string;
}

/**
 * Log Reflection API Response
 */
export interface LogReflectionResponse {
  success: boolean;
  message: string;
  observation_id: string;
  tagged_skills?: string[];
  tagged_constraints?: string[];
  status: Status;
  error?: string;
  stack?: string;
}

/**
 * Attendance Log API Request
 */
export interface AttendanceLogRequest {
  session_id: string;
  attendance_data: {
    person_id: string;
    present: boolean;
    note?: string;
  }[];
  coach_id: string;
}

/**
 * Attendance Log API Response
 */
export interface AttendanceLogResponse {
  success: boolean;
  message: string;
  session_id: string;
  attendance_count: number;
  present_count: number;
  absent_count: number;
  status: Status;
  error?: string;
  stack?: string;
}

/**
 * Upload API Request
 */
export interface UploadRequest {
  file: File;
  person_id?: string;
  session_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Upload API Response
 */
export interface UploadResponse {
  success: boolean;
  message: string;
  file_id: string;
  file_path: string;
  status: Status;
  error?: string;
  stack?: string;
}

/**
 * Voice Input API Request
 */
export interface VoiceInputRequest {
  audio_data?: Blob;
  text_data?: string;
  coach_id: string;
  intent?: string;
}

/**
 * Voice Input API Response
 */
export interface VoiceInputResponse {
  success: boolean;
  message: string;
  intent: string;
  processed_text: string;
  action_taken?: string;
  action_id?: string;
  status: Status;
  error?: string;
  stack?: string;
}

// ======================================================================
// Helper Types for API Responses
// ======================================================================

/**
 * API Response base type
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  stack?: string;
}

/**
 * Paginated response type
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

/**
 * Agent Event for logging API calls
 */
export interface AgentEvent {
  id: UUID;
  created_at: Timestamp;
  event_type: EventType;
  player_id?: string;
  team_id?: string;
  agent_id: string;
  details: any;
  status: Status;
}

/**
 * Dashboard Summary type
 */
export interface DashboardSummary {
  pending_approvals: {
    session_plans: number;
    pdps: number;
    reflections: number;
  };
  recent_sessions: Session[];
  upcoming_sessions: Session[];
  player_stats: {
    total: number;
    active: number;
    with_pdp: number;
    attendance_rate: number;
  };
  team_stats: {
    total: number;
    active: number;
  };
}
