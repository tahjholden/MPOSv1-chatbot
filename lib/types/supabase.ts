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
  UPDATED_WITH_NOTES = 'updated_with_notes', // Added for session notes
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
 * Observation types (can be used for general observations, dev notes)
 */
export enum ObservationType {
  DEV_NOTE = 'DevNote',
  COACH_OBSERVATION = 'CoachObservation', // General observation by coach
  PLAYER_OBSERVATION = 'PlayerObservation', // General observation by player
  SESSION_SUMMARY = 'SessionSummary',
  ATTENDANCE_NOTE = 'AttendanceNote',
}

/**
 * Reflection types (specific types of reflections)
 */
export enum ReflectionType {
  POST_SESSION = 'post_session',
  MID_PRACTICE = 'mid_practice',
  PLANNING_NOTES = 'planning_notes',
  GENERAL_COACH_REFLECTION = 'general_coach_reflection',
  PLAYER_SELF_REFLECTION = 'player_self_reflection',
}

/**
 * Session Note types
 */
export enum NoteType {
  PRE_SESSION_PLAN = 'pre_session_plan',
  DURING_SESSION_OBSERVATION = 'during_session_observation',
  POST_SESSION_SUMMARY = 'post_session_summary',
  GENERAL_SESSION_NOTE = 'general_session_note',
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
  LOG_OBSERVATION_REQUEST = 'log_observation_request',
  LOG_OBSERVATION_SUCCESS = 'log_observation_success',
  LOG_OBSERVATION_ERROR = 'log_observation_error',
  LOG_OBSERVATION_SIMPLE_REQUEST = 'log_observation_simple_request',
  LOG_OBSERVATION_SIMPLE_SUCCESS = 'log_observation_simple_success',
  LOG_OBSERVATION_SIMPLE_ERROR = 'log_observation_simple_error',
  SESSION_NOTE_REQUEST = 'session_note_request',
  SESSION_NOTE_SUCCESS = 'session_note_success',
  SESSION_NOTE_ERROR = 'session_note_error',
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
  status?: string; // Consider using Status enum if applicable
  attendance_pct?: number;
  mental_health_flag?: boolean;
  mental_health_note?: string;
  aliases?: string[];
  handedness?: string;
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
  team?: string; // This might be group_id if 'group' table is the source of truth for teams
  pod?: string;  // This might be group_id if 'group' table is the source of truth for pods
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
  team_id?: UUID; // Corresponds to group_id if 'group' table is used for teams
  pod_id?: UUID;  // Corresponds to group_id if 'group' table is used for pods
  coach_id?: UUID;
  status?: Status;
  planned_player_count?: number;
  session_notes?: string; // Main text notes for the session
  created_at: Timestamp;
  advancement_levels?: AdvancementLevels;
  responsibility_tiers?: ResponsibilityTiers;
  collective_growth_phase?: number;
  created_by?: string; // User ID or name
  last_updated?: Timestamp;
  session_plan?: SessionPlan;
  session_id?: string; // Legacy or alternative ID? 'id' is UUID primary key.
  session_date?: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  end_time?: string;   // HH:MM
  duration_minutes?: number;
  location?: string;
  overall_theme_tags?: string[];
  planned_attendance?: string[]; // Array of person_ids
  reflection_fields?: SessionReflectionFields; // Updated for structured reflection logs
  person_id?: UUID; // Unclear usage, coach_id is already present
}

/**
 * PDP (Player Development Plan) entity
 */
export interface PDP {
  id: UUID; // Primary key
  pdp_id?: string; // Text version of id, or alternative identifier
  person_id: UUID; // Player's ID
  person_name?: string; // Denormalized player name
  is_current: boolean;
  status?: Status; // e.g., 'pending_approval', 'active', 'archived'
  skill_tags?: string[]; // Array of tag names or IDs
  constraint_tags?: string[]; // Array of tag names or IDs
  theme_tags?: string[]; // Array of tag names or IDs
  pdp_text_coach?: string; // Detailed plan for coach
  pdp_text_player?: string; // Simplified plan for player
  pdp_full_text?: string; // Combined or more detailed text
  primary_focus?: string;
  secondary_focus?: string;
  skills_summary?: string; // Text summary
  constraints_summary?: string; // Text summary
  source_observation_id?: string[]; // Array of observation_log IDs or intake IDs
  previous_version_id?: UUID; // Link to previous PDP version
  created_at: Timestamp;
  updated_at?: Timestamp;
  last_updated?: Timestamp;
  archived_at?: Timestamp;
  advancement_level?: number; // Player's current or target level
  responsibility_tier?: number; // Player's current or target tier
  collective_growth_phase?: number; // Contextual team/group phase
  team?: string; // Optional: denormalized team/group name or ID
  pod?: string;  // Optional: denormalized pod/group name or ID
  target_challenge_point?: string;
  current_challenge_point?: string;
  skill_id?: UUID; // Unclear usage, PDPs are broader than one skill
  // Actionable goals might be part of pdp_text_coach or a separate JSONB/table
}

/**
 * Attendance entity (for 'attendance' table)
 */
export interface Attendance {
  id: UUID;
  session_id: UUID;
  person_id: UUID;
  present: boolean;
  status?: string; // e.g., 'present', 'absent', 'excused'
  note?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Observation Intake entity (for 'observation_intake' table)
 */
export interface ObservationIntake {
  id: UUID;
  raw_note: string;
  coach_id: UUID;
  processed: boolean;
  created_at: Timestamp;
  processed_at?: Timestamp;
  // session_id?: UUID; // If schema supports linking raw intake to session
  // category?: string; // If a category column is added
}

/**
 * Observation Logs entity (for 'observation_logs' table)
 */
export interface ObservationLog {
  id: UUID;
  observation_id?: UUID | null; // Link to session, pdp, or other main entity
  entry_type: string; // e.g., 'coach_reflection:post_session', 'session_note:general', 'pdp_review_note'
  payload: any; // Flexible JSONB for various observation structures
  created_at: Timestamp;
  person_id?: UUID; // Person who created the log (e.g., coach_id)
  analysis?: string; // AI-generated summary or analysis
  recommendation?: string; // AI-generated recommendation
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
}

/**
 * Tag entity (for 'tag' table)
 */
export interface Tag {
  id: UUID;
  name: string; // Canonical name of the tag
  category: string; // e.g., 'Basketball Skills', 'Tactical Concepts', 'Mental Attributes'
  description?: string;
  active: boolean;
  created_at: Timestamp;
  tag_type: TagType; // 'skill', 'constraint', 'theme', 'cue'
  synonyms?: string[]; // Array of alternative names
  pdp_group?: string; // For grouping tags in PDP display
  tag_name?: string; // Alternative name field, often same as 'name'
  tag_parent_id?: string; // For hierarchical tags
  use_case?: string; // e.g., 'Player Development', 'Practice Planning'
  verified?: boolean;
  source_uid?: string;
  suggested_by?: string;
  updated_at?: Timestamp;
  subcategory?: string;
  combo_code?: number;
}

/**
 * Session Drill entity (for 'session_drill' table)
 */
export interface SessionDrill {
  id: UUID;
  session_id: UUID;
  drill_id: UUID; // Links to a 'drills' table
  targeted_player_id?: string[]; // Array of person_ids
  pdp_tags?: string[]; // Tags relevant to this drill instance
  intent?: string;
  verbal_cues?: string[];
  adaptation_notes?: string;
  time_constraint_description?: string;
  created_at: Timestamp;
}

// ======================================================================
// MPBC Specific Table Types (Assuming these are current and relevant)
// ======================================================================
// ... (MPBC types from previous version can remain here if still used) ...
// For brevity, I'm omitting the full MPBC types if they are unchanged.
// Ensure they are present if your APIs interact with them.

// ======================================================================
// Complex JSON Field Types (for JSONB columns)
// ======================================================================

/**
 * Session Plan type for session.session_plan JSONB field
 */
export interface SessionPlan {
  session_plan: PracticeBlock[]; // Array of practice blocks
  session_id?: string | null;
  team_id?: string; // Corresponds to group_id
  pod_id?: string | null;
  session_date?: string;
  created_by?: string | null; // User ID or name
  created_at?: string;
  last_updated?: string;
  overall_theme_tags?: string[];
  collective_growth_phase?: number | null;
  advancement_levels?: number[]; // Or AdvancementLevels object
  responsibility_tiers?: number[]; // Or ResponsibilityTiers object
  planned_attendance?: string[]; // Array of person_ids
  session_notes?: string;
  reflection_fields?: SessionReflectionFields; // Updated structure
}

/**
 * Practice Block type for session_plan.session_plan array
 */
export interface PracticeBlock {
  block_name: string;
  format: string;
  skills: string[]; // Tag names or IDs
  constraints: string[]; // Tag names or IDs
  players: string[]; // person_ids relevant to this block
  collective_growth_phase: number;
  coaching_cues: string[];
  advancement_levels?: number[];
  responsibility_tiers?: number[];
  team_id?: string; // Corresponds to group_id
  pod_id?: string | null;
  session_id?: string | null;
  session_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  location?: string;
  block_order?: number;
  drill_id?: string | null; // Link to a 'drills' table
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
  attendance: any[]; // Could be more specific, e.g., array of { person_id: string, status: string }
}

/**
 * Session Reflection Fields type for session.reflection_fields (updated)
 */
export interface SessionReflectionFields {
  coach_post_session?: string; // Main post-session reflection text
  player_feedback?: any[]; // Array of player feedback objects
  observed_transfer_map?: Record<string, any>; // Map of skills/concepts to transfer scores
  coach_session_notes_log?: CoachSessionNoteEntry[]; // Log of notes added during/after session
}

/**
 * Entry for coach_session_notes_log array
 */
export interface CoachSessionNoteEntry {
  timestamp: Timestamp;
  coach_id: UUID;
  note_type: NoteType;
  text: string;
  summary?: string;
  key_points?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}


/**
 * Skills Summary type for pdp.skills_summary (if JSONB)
 */
export interface SkillsSummary {
  [key: string]: {
    count: number;
    relevance: number;
    description?: string;
  };
}

/**
 * Constraints Summary type for pdp.constraints_summary (if JSONB)
 */
export interface ConstraintsSummary {
  [key: string]: {
    count: number;
    relevance: number;
    description?: string;
  };
}

/**
 * Advancement Levels type for session.advancement_levels (if JSONB)
 */
export interface AdvancementLevels {
  [level: number]: number; // level -> count of players
}

/**
 * Responsibility Tiers type for session.responsibility_tiers (if JSONB)
 */
export interface ResponsibilityTiers {
  [tier: number]: number; // tier -> count of players
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
  group_id?: string; // Used as team_id in the API logic
  pod_id?: string;
  session_date?: string;
  attendance_data?: { // This is consistent with AttendanceRecord
    person_id: string;
    present: boolean;
    session_id?: string; // Optional if creating new session
    note?: string;
  }[];
  session_id?: string; // If updating an existing session
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
  status: Status; // e.g., 'pending_approval'
  db_operation: 'insert' | 'update';
  using_service_role?: boolean;
  error?: string;
  stack?: string;
}

/**
 * Attendance Record for logging
 */
export interface AttendanceRecord {
  person_id: string;
  present: boolean;
  note?: string;
}

/**
 * Attendance Log API Request
 */
export interface AttendanceLogRequest {
  session_id: string;
  coach_id: string; // For logging/audit
  attendance_data: AttendanceRecord[];
}

/**
 * Attendance Log API Response
 */
export interface AttendanceLogResponse {
  success: boolean;
  message: string;
  session_id: string;
  present_count: number;
  absent_count: number;
  total_logged_count: number;
  errors?: { person_id: string | null; error: string }[];
  using_service_role?: boolean;
  error?: string;
  stack?: string;
}

/**
 * Extracted Entity Info (from AI analysis)
 */
export interface ExtractedEntityInfo {
  name: string;
  type: 'player' | 'skill' | 'constraint' | 'theme'; // Type of entity
  confidence: number; // AI's confidence in extraction
  matched_id?: string; // ID from Supabase if matched
}

/**
 * Reflection Analysis (output from AI)
 */
export interface ReflectionAnalysis {
  summary: string;
  key_themes: string[];
  mentioned_players: ExtractedEntityInfo[];
  mentioned_skills: ExtractedEntityInfo[];
  mentioned_constraints: ExtractedEntityInfo[];
  sentiment: 'positive' | 'negative' | 'neutral';
  actionable_insights?: string[];
  overall_mood?: string;
}

/**
 * Log Reflection API Request
 */
export interface LogReflectionRequest {
  reflection_text: string;
  coach_id: string;
  session_id?: string;
  player_id?: string; // If reflection is about a specific player
  reflection_type?: ReflectionType;
  group_id?: string; // For team/group context
}

/**
 * Log Reflection API Response
 */
export interface LogReflectionResponse {
  success: boolean;
  message: string;
  observation_log_id: string; // ID of the entry in observation_logs
  intake_id: string; // ID of the entry in observation_intake
  analysis: ReflectionAnalysis;
  using_service_role?: boolean;
  error?: string;
  stack?: string;
}

/**
 * Player Context for PDP Generation
 */
export interface PlayerContext {
  person_id: string;
  display_name: string;
  current_primary_focus?: string | null;
  current_secondary_focus?: string | null;
  advancement_level?: number | null;
  responsibility_tier?: number | null;
  collective_growth_phase?: number | null;
  recent_observations: { id?: string; text: string; created_at: string }[];
  existing_pdp_summary?: string | null;
}

/**
 * PDP Elements (output from AI for PDP generation)
 */
export interface PDPElements {
  pdp_text_coach: string;
  pdp_text_player: string;
  primary_focus: string;
  secondary_focus?: string;
  skill_tags: string[]; // Names of skills
  constraint_tags: string[]; // Names of constraints
  theme_tags?: string[]; // Names of themes
  actionable_goals: string[];
  coaching_recommendations: string[];
  skills_summary?: string;
  constraints_summary?: string;
  pdp_full_text?: string;
  target_advancement_level?: number;
  target_responsibility_tier?: number;
}

/**
 * Generate PDP API Request
 */
export interface GeneratePDPRequest {
  person_id: string; // Player's ID
  coach_id: string;
  focus_text?: string; // Optional coach input on focus
  include_observations_days?: number; // e.g., 30
  group_id?: string; // For team/group context
}

/**
 * Generate PDP API Response
 */
export interface GeneratePDPResponse {
  success: boolean;
  message: string;
  pdp: PDP; // The newly created or updated PDP object
  using_service_role?: boolean;
  error?: string;
  stack?: string;
}

/**
 * Session Note Analysis (output from AI)
 */
export interface SessionNoteAnalysis {
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  energy_level_assessment?: 'high' | 'medium' | 'low' | 'mixed' | 'not_specified';
  player_engagement_assessment?: 'high' | 'medium' | 'low' | 'mixed' | 'not_specified';
  actionable_items?: string[];
}

/**
 * Session Notes API Request
 */
export interface SessionNotesRequest {
  session_id: string;
  coach_id: string;
  note_text: string;
  note_type?: NoteType;
  group_id?: string; // For team/group context
}

/**
 * Session Notes API Response
 */
export interface SessionNotesResponse {
  success: boolean;
  message: string;
  observation_log_id: string; // ID of the entry in observation_logs
  session_id: string;
  analysis: SessionNoteAnalysis;
  using_service_role?: boolean;
  error?: string;
  stack?: string;
}


/**
 * Upload API Request (Placeholder - details depend on implementation)
 */
export interface UploadRequest {
  file: File; // Assuming browser File object
  person_id?: string;
  session_id?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Upload API Response (Placeholder)
 */
export interface UploadResponse {
  success: boolean;
  message: string;
  file_id: string; // ID of the stored file
  file_path: string; // Path to the stored file
  status: Status;
  error?: string;
  stack?: string;
}

/**
 * Voice Input API Request (If a dedicated API endpoint is made for voice processing)
 */
export interface VoiceInputRequest {
  audio_data?: Blob; // Raw audio data
  text_data?: string; // Transcribed text if already processed client-side
  coach_id: string;
  intent?: string; // Optional pre-determined intent
}

/**
 * Voice Input API Response (If a dedicated API endpoint)
 */
export interface VoiceInputResponse {
  success: boolean;
  message: string;
  intent: string; // Detected intent
  processed_text: string; // Text used for processing
  action_taken?: string; // e.g., 'practice_plan_generated', 'observation_logged'
  action_id?: string; // ID of the created entity (session_id, observation_id, etc.)
  status: Status;
  error?: string;
  stack?: string;
}

// ======================================================================
// Helper Types for API Responses (General Purpose)
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
 * Agent Event for logging API calls and system actions
 */
export interface AgentEvent {
  id: UUID;
  created_at: Timestamp;
  event_type: EventType; // Using the EventType enum
  player_id?: string | null; // person_id of player if relevant
  team_id?: string | null; // group_id if relevant (stored in team_id column)
  agent_id: string; // Identifier of the system component (e.g., 'generate-blocks-api')
  details: any; // JSONB for request/response summaries, errors, etc.
  status: Status; // 'started', 'completed', 'error'
  // person_uid in agent_events could store coach_id if schema matches
  // For now, coach_id is part of details if not a direct column
}

/**
 * Dashboard Summary type (Example for a coach dashboard)
 */
export interface DashboardSummary {
  pending_approvals: {
    session_plans: number;
    pdps: number;
    reflections: number; // Or processed observations
  };
  recent_sessions: Session[]; // Array of simplified Session objects
  upcoming_sessions: Session[]; // Array of simplified Session objects
  player_stats: {
    total: number;
    active: number;
    with_pdp: number;
    attendance_rate: number; // Overall or average
  };
  team_stats: {
    total: number;
    active: number;
  };
}
