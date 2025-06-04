import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { CleanPracticeBlock, Session, PDP as FetchedPDP } from '@/lib/types/supabase'; // Assuming these types exist

// Initialize Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

let usingServiceRole = true;
let serviceKeyWarningLogged = false;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Helper function to get the appropriate Supabase client with fallback
async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!usingServiceRole) {
    return supabaseAnon;
  }
  try {
    const { error } = await supabaseService.from('person').select('id', { count: 'exact', head: true }).limit(1);
    if (error) {
      if (!serviceKeyWarningLogged) {
        console.warn(`⚠️ Service role key failed for overlay-constraints: ${error.message}. Falling back to anon key.`);
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for overlay-constraints: ${e.message}. Falling back to anon key.`);
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

// Enhanced PlayerConstraint Interface
interface PlayerConstraint {
  player_id: string;
  player_name: string;
  focus_areas: string[];
  coaching_cues: string[];
  intensity_modification?: 'increase' | 'decrease' | 'maintain';
  notes?: string;
  challenge_point?: number; // Scale 1-10
  challenge_type?: 'constraint_pressure' | 'decision_complexity' | 'technical_precision' | 'time_pressure' | 'competitive_intensity' | 'skill_acquisition' | 'strategic_understanding';
  success_metrics?: string[]; // e.g., ["Complete 7/10 passes under pressure", "Make 3 correct reads in a row"]
}

// Output Structure Types
interface ConstraintOverlay {
  session_id: string;
  block_overlays: BlockOverlay[];
}

interface BlockOverlay {
  block_order: number;
  block_name: string;
  player_constraints: PlayerConstraint[];
}

// Request body type
interface RequestBody {
  session_id: string;
  coach_id: string; // For logging purposes
}

// Type for AI response for a single player-block constraint
interface AIPlayerBlockConstraint {
  is_relevant: boolean;
  focus_areas?: string[];
  coaching_cues?: string[];
  intensity_modification?: 'increase' | 'decrease' | 'maintain';
  notes?: string;
  challenge_point?: number;
  challenge_type?: 'constraint_pressure' | 'decision_complexity' | 'technical_precision' | 'time_pressure' | 'competitive_intensity' | 'skill_acquisition' | 'strategic_understanding';
  success_metrics?: string[];
}

// Extended FetchedPDP to include advancement_level
interface EnrichedFetchedPDP extends FetchedPDP {
    advancement_level?: number | null; // Player's A-level
}


export async function POST(req: NextRequest) {
  const operationId = uuidv4();
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.session_id || !requestBody.coach_id) {
      return NextResponse.json(
        { success: false, error: 'session_id and coach_id are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    await logAgentEvent({
      event_type: 'overlay_constraints_request',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      agent_id: 'overlay-constraints-api',
      details: { request_id: operationId, session_id: requestBody.session_id },
      status: 'started',
    });

    // 1. Fetch Session, its Clean Blocks, and ARC context (R and C levels)
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('id, session_plan, team_id, planned_attendance, responsibility_tiers, collective_growth_phase') // Use responsibility_tiers
      .eq('id', requestBody.session_id)
      .single();

    if (sessionError || !sessionData) {
      throw new Error(`Session with ID ${requestBody.session_id} not found or error fetching: ${sessionError?.message}`);
    }
    if (!sessionData.session_plan || !Array.isArray(sessionData.session_plan.session_plan) || sessionData.session_plan.session_plan.length === 0) {
      throw new Error(`Session ${requestBody.session_id} has no practice blocks.`);
    }
    const cleanBlocks: CleanPracticeBlock[] = sessionData.session_plan.session_plan;
    
    let teamRLevel: number | null | undefined = 3; // Default R level to 3
    if (sessionData.responsibility_tiers) {
        if (typeof sessionData.responsibility_tiers === 'number') {
            teamRLevel = sessionData.responsibility_tiers;
        } else if (Array.isArray(sessionData.responsibility_tiers) && sessionData.responsibility_tiers.length > 0 && typeof sessionData.responsibility_tiers[0] === 'number') {
            teamRLevel = sessionData.responsibility_tiers[0]; // Take the first if it's an array of numbers
        } else if (typeof sessionData.responsibility_tiers === 'object' && sessionData.responsibility_tiers !== null) {
            // Attempt to parse if it's an object like {"level": 3} or {"current_R_level": 3}
            const tiersObject = sessionData.responsibility_tiers as any;
            if (typeof tiersObject.level === 'number') {
                teamRLevel = tiersObject.level;
            } else if (typeof tiersObject.current_R_level === 'number') {
                teamRLevel = tiersObject.current_R_level;
            }
            // Add more complex parsing if needed for other JSONB structures of responsibility_tiers
        }
    }
    
    const teamCLevel = sessionData.collective_growth_phase ?? 3; // Default C level to 3 if null

    // 2. Fetch Player PDPs (including Advancement level) for players in the session's group or planned_attendance
    let playerIdsToFetch: string[] = [];
    if (sessionData.planned_attendance && sessionData.planned_attendance.length > 0) {
        playerIdsToFetch = sessionData.planned_attendance;
    } else if (sessionData.team_id) { 
        const { data: groupMembers, error: groupMembersError } = await supabase
            .from('person_group')
            .select('person_id')
            .eq('group_id', sessionData.team_id) 
            .eq('role', 'player');
        if (groupMembersError) throw new Error(`Error fetching group members for team ${sessionData.team_id}: ${groupMembersError.message}`);
        playerIdsToFetch = groupMembers.map(gm => gm.person_id);
    }

    if (playerIdsToFetch.length === 0) {
        return NextResponse.json({
            success: true,
            message: "No players found for this session to overlay constraints.",
            constraint_overlay: { session_id: requestBody.session_id, block_overlays: [] },
        });
    }
    
    const { data: pdpData, error: pdpError } = await supabase
      .from('pdp')
      .select('person_id, person_name, primary_focus, secondary_focus, skill_tags, constraint_tags, pdp_text_player, advancement_level') // Added advancement_level
      .in('person_id', playerIdsToFetch)
      .eq('is_current', true);

    if (pdpError) throw new Error(`Error fetching PDPs: ${pdpError.message}`);
    const playerPDPs: EnrichedFetchedPDP[] = pdpData || [];


    // 3. Generate Overlays
    const blockOverlays: BlockOverlay[] = [];

    for (const block of cleanBlocks) {
      const playerConstraintsForBlock: PlayerConstraint[] = [];

      for (const pdp of playerPDPs) {
        if (!pdp.person_id || !pdp.person_name) continue; 

        const playerALevel = pdp.advancement_level; // Player's Advancement level

        const aiConstraintData = await generatePlayerConstraintForBlockWithOpenAI(block, pdp, playerALevel, teamRLevel, teamCLevel);

        if (aiConstraintData && aiConstraintData.is_relevant) {
          playerConstraintsForBlock.push({
            player_id: pdp.person_id,
            player_name: pdp.person_name,
            focus_areas: aiConstraintData.focus_areas || [],
            coaching_cues: aiConstraintData.coaching_cues || [],
            intensity_modification: aiConstraintData.intensity_modification,
            notes: aiConstraintData.notes,
            challenge_point: aiConstraintData.challenge_point,
            challenge_type: aiConstraintData.challenge_type,
            success_metrics: aiConstraintData.success_metrics || [],
          });
        }
      }

      blockOverlays.push({
        block_order: block.block_order || 0, 
        block_name: block.block_name,
        player_constraints: playerConstraintsForBlock, 
      });
    }

    const constraintOverlay: ConstraintOverlay = {
      session_id: requestBody.session_id,
      block_overlays: blockOverlays,
    };

    await logAgentEvent({
      event_type: 'overlay_constraints_success',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      agent_id: 'overlay-constraints-api',
      details: { request_id: operationId, overlay_blocks_count: blockOverlays.length },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Constraint overlays with challenge points generated successfully.',
      constraint_overlay: constraintOverlay,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in overlay-constraints API (Operation ID: ${operationId}):`, error.message, error.stack);
    let rawRequestBody = 'Could not retrieve request body';
    try { rawRequestBody = await req.text(); } catch (_) { /* ignore */ }

    await logAgentEvent({
      event_type: 'overlay_constraints_error',
      coach_id: (requestBody! && requestBody!.coach_id) || 'unknown',
      session_id: (requestBody! && requestBody!.session_id) || null,
      agent_id: 'overlay-constraints-api',
      details: { request_id: operationId, error: error.message, raw_request: rawRequestBody },
      status: 'error',
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'An unknown error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        using_service_role: usingServiceRole,
      },
      { status: 500 }
    );
  }
}

async function generatePlayerConstraintForBlockWithOpenAI(
  block: CleanPracticeBlock,
  playerPdp: EnrichedFetchedPDP,
  playerALevel?: number | null, // Player's Advancement Level
  teamRLevel?: number | null,   // Team's Responsibility Level
  teamCLevel?: number | null    // Team's Collective Growth Level
): Promise<AIPlayerBlockConstraint | null> {
  const systemMessage = `You are an expert basketball coaching assistant specializing in motor learning and the Challenge Point Framework (Guadagnoli & Lee, 2004).
Your task is to determine if a specific practice block is relevant to a player's development plan (PDP) and, if so, suggest individualized focus areas, coaching cues, intensity modifications, and an optimal Challenge Point.
The Challenge Point (1-10 scale) should maximize learning by matching task difficulty to the player's current skill (Advancement Level), team role (Responsibility Level), and team maturity (Collective Growth Level).
Respond ONLY with a valid JSON object. Do NOT include any conversational text or markdown. Your ENTIRE response must be a single JSON object.

JSON Structure:
{
  "is_relevant": true | false,
  "focus_areas": ["Specific focus 1 for this player in this block", "Specific focus 2"],
  "coaching_cues": ["Cue 1 for coach to use with this player", "Cue 2"],
  "intensity_modification": "increase" | "decrease" | "maintain" | null,
  "challenge_point": 7, // Optimal challenge point (1-10)
  "challenge_type": "constraint_pressure" | "decision_complexity" | "technical_precision" | "time_pressure" | "competitive_intensity" | "skill_acquisition" | "strategic_understanding", // Type of challenge
  "success_metrics": ["Metric 1 (e.g., 7/10 shots made)", "Metric 2 (e.g., <2 turnovers)"], // How to measure success at this challenge point
  "notes": "Brief notes or rationale for the suggestions, if any."
}

If the block is NOT relevant, set "is_relevant" to false and other fields can be empty or null.
Focus areas should be derived from the player's PDP and tailored to the block's activities.
Challenge Point: Base on Player A-Level. Adjust for Team R-Level (higher R might mean more complex tactical challenges) and Team C-Level (lower C might need simpler challenges or more scaffolding).
Challenge Type: Select the primary way this block challenges the player.
Success Metrics: Define 1-2 measurable outcomes for the player at this challenge point.`;

  const userMessage = `Practice Block Details:
- Name: ${block.block_name}
- Type: ${block.block_type}
- Description: ${block.description}
- Skills Targeted (General): ${(block.skills_targeted || []).join(', ')}
- Intensity (General): ${block.intensity_level}/5
- Format: ${block.format || 'Not specified'}

Player's Context - ${playerPdp.person_name || 'Unknown Player'}:
- Player Advancement (A) Level: ${playerALevel || 'Not specified'} (Scale 1-9)
- Player PDP Primary Focus: ${playerPdp.primary_focus || 'Not specified'}
- Player PDP Secondary Focus: ${playerPdp.secondary_focus || 'Not specified'}
- Player PDP Skill Tags: ${(playerPdp.skill_tags || []).join(', ')}
- Player PDP Constraint Tags: ${(playerPdp.constraint_tags || []).join(', ')}
- Player PDP Summary: ${playerPdp.pdp_text_player || 'Not specified'}

Team's Context:
- Team Responsibility (R) Level: ${teamRLevel || 'Not specified'} (Scale 1-6)
- Team Collective Growth (C) Level: ${teamCLevel || 'Not specified'} (Scale 1-6)

Based on this block, the player's PDP, and the team's ARC context:
1. Is this block relevant for this player's development?
2. If yes:
   a. What specific focus areas (1-2) should this player concentrate on?
   b. What coaching cues (1-2) can a coach use?
   c. Should the intensity be modified (increase, decrease, maintain)?
   d. What is the optimal Challenge Point (1-10) for this player in this block?
   e. What is the primary Challenge Type for this player in this block?
   f. What are 1-2 measurable Success Metrics for this player at this challenge point?
   g. Any brief notes?

Provide your response in the specified JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', 
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const aiData = JSON.parse(content) as AIPlayerBlockConstraint;
    
    if (typeof aiData.is_relevant !== 'boolean') {
        console.warn("AI response for player constraint overlay missing 'is_relevant' boolean.", content);
        return { is_relevant: false }; // Default to not relevant if structure is wrong
    }
    // Ensure optional arrays are initialized if not provided by AI
    aiData.focus_areas = aiData.focus_areas || [];
    aiData.coaching_cues = aiData.coaching_cues || [];
    aiData.success_metrics = aiData.success_metrics || [];


    return aiData;

  } catch (error: any) {
    console.error(`Error generating player constraint overlay with OpenAI for player ${playerPdp.person_name} and block ${block.block_name}:`, error.message);
    console.error('Raw AI request prompt (user part for brevity):', userMessage.substring(0, 500) + "...");
    return null; 
  }
}

// Helper function to log agent events
async function logAgentEvent({
  event_type,
  coach_id,
  player_id,
  session_id,
  group_id, // This will be used as team_id in agent_events
  agent_id,
  details,
  status,
}: {
  event_type: string;
  coach_id: string;
  player_id?: string | null;
  session_id: string | null;
  group_id?: string | null;
  agent_id: string;
  details: any;
  status: 'started' | 'completed' | 'error';
}) {
  try {
    const loggingSupabase = supabaseAnon;
    
    const logPayload: any = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      event_type,
      agent_id,
      details: { ...details, coach_id_logged: coach_id },
      status,
    };

    if (player_id) logPayload.player_id = player_id;
    if (session_id) logPayload.details.session_id = session_id;
    if (group_id) logPayload.team_id = group_id; // Map group_id to team_id column

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}) for overlay-constraints:`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}) for overlay-constraints:`, e.message);
  }
}
