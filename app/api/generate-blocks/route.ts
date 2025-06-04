import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

// Initialize Supabase clients - one with service role key and one with anon key for fallback
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create two clients - service role (admin) and anon (public)
const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

// Track which client is being used
let usingServiceRole = true;
let serviceKeyWarningLogged = false;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Default IDs from environment variables
const DEFAULT_TEAM_ID = process.env.DEFAULT_TEAM_ID || '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8';
const DEFAULT_COACH_ID = process.env.DEFAULT_COACH_ID || 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7';

// Helper function to get the appropriate Supabase client with fallback
async function getSupabaseClient() {
  // If we've already determined the service key doesn't work, use anon immediately
  if (!usingServiceRole) {
    return supabaseAnon;
  }
  
  // Try service role key first
  try {
    const { data, error } = await supabaseService.from('person').select('count').limit(1);
    if (error) {
      // Service key failed, log warning and switch to anon
      if (!serviceKeyWarningLogged) {
        console.warn('⚠️ Service role key failed, falling back to anon key. Error:', error.message);
        console.warn('⚠️ Some admin operations may be limited. Please update your service role key in .env.local');
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    // Service key worked, continue using it
    return supabaseService;
  } catch (e) {
    // Exception with service key, fall back to anon
    if (!serviceKeyWarningLogged) {
      console.warn('⚠️ Service role key exception, falling back to anon key. Error:', e);
      console.warn('⚠️ Some admin operations may be limited. Please update your service role key in .env.local');
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

// TypeScript interfaces based on Supabase schema
interface PDP {
  person_id: string; // Updated from player_id to person_id
  is_current: boolean;
  skill_tags: string[];
  constraint_tags: string[];
  theme_tags: string[];
  advancement_level: number | null;
  responsibility_tier: number | null;
  collective_growth_phase: number | null;
  pdp_text_full: string;
  pdp_text_coach: string;
  pdp_text_player: string;
  source_observation_ids: string[];
  created_at: string | null;
  updated_at: string | null;
  last_updated: string | null;
  pdp_id: string | null;
}

interface Attendance {
  person_id: string;
  present: boolean;
  session_id?: string;
  note?: string;
}

interface PracticeBlock {
  block_name: string;
  format: string;
  skills: string[];
  constraints: string[];
  players: string[];
  collective_growth_phase: number;
  coaching_cues: string[];
  advancement_levels?: number[];
  responsibility_tiers?: number[];
  group_id?: string; // Updated from team_id to group_id
  pod_id?: string | null;
  session_id?: string | null;
  session_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_minutes?: number | null;
  location?: string;
  block_order?: number;
  drill_id?: string | null;
  notes?: string;
  feedback_fields?: {
    coach_reflection: string;
    player_reflection: string;
    observed_transfer_score: number | null;
    attendance: any[];
  };
}

interface SessionPlan {
  session_plan: PracticeBlock[];
  session_id?: string | null;
  group_id?: string; // Updated from team_id to group_id
  pod_id?: string | null;
  session_date?: string;
  created_by?: string | null;
  created_at?: string;
  last_updated?: string;
  overall_theme_tags?: string[];
  collective_growth_phase?: number | null;
  advancement_levels?: number[];
  responsibility_tiers?: number[];
  planned_attendance?: string[];
  session_notes?: string;
  reflection_fields?: {
    coach_post_session: string;
    player_feedback: any[];
    observed_transfer_map: Record<string, any>;
  };
}

interface RequestBody {
  theme?: string;
  duration?: number;
  coach_id: string;
  group_id?: string; // Updated from team_id to group_id
  pod_id?: string;
  session_date?: string;
  attendance_data?: Attendance[];
  session_id?: string;
  collective_growth_phase?: number;
}

// Main API route handler
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body: RequestBody = await req.json();
    
    // Validate required fields
    if (!body.coach_id) {
      return NextResponse.json(
        { error: 'coach_id is required' },
        { status: 400 }
      );
    }

    // Get the appropriate Supabase client (with fallback)
    const supabase = await getSupabaseClient();

    // Generate session ID if not provided
    const sessionId = body.session_id || uuidv4();
    const sessionDate = body.session_date || new Date().toISOString().split('T')[0];
    const groupId = body.group_id || DEFAULT_TEAM_ID; // Updated from team_id to group_id
    
    // Verify coach exists in person table
    const { data: coachData, error: coachError } = await supabase
      .from('person')
      .select('id, display_name')
      .eq('id', body.coach_id)
      .single();
      
    if (coachError) {
      console.warn(`Coach lookup warning: ${coachError.message}`);
      // Continue execution - not a critical error
    }
    
    // Log API call
    await logAgentEvent({
      event_type: 'generate_blocks_request',
      player_id: null,
      group_id: groupId, // Updated from team_id to group_id
      agent_id: 'generate-blocks-api',
      details: {
        request: {
          ...body,
          session_id: sessionId,
        }
      },
      status: 'started'
    });

    // Get attendance data - either from request or fetch from DB
    let attendanceData: string[] = [];
    
    if (body.attendance_data && body.attendance_data.length > 0) {
      // Use provided attendance data
      attendanceData = body.attendance_data
        .filter(a => a.present)
        .map(a => a.person_id);
    } else if (body.session_id) {
      // Fetch attendance for existing session
      const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('person_id, present')
        .eq('session_id', body.session_id)
        .eq('present', true);
        
      if (attendanceError) {
        throw new Error(`Error fetching attendance: ${attendanceError.message}`);
      }
      
      attendanceData = attendanceRecords.map(record => record.person_id);
    }
    
    // If no attendance data, try to get players from the group (team)
    if (attendanceData.length === 0 && groupId) {
      const { data: groupMembers, error: groupError } = await supabase
        .from('person_group') // Join table between person and group
        .select('person_id')
        .eq('group_id', groupId)
        .eq('role', 'player');
        
      if (groupError) {
        console.warn(`Group members lookup warning: ${groupError.message}`);
      } else if (groupMembers && groupMembers.length > 0) {
        attendanceData = groupMembers.map(member => member.person_id);
      }
    }
    
    if (attendanceData.length === 0) {
      return NextResponse.json(
        { error: 'No attendance data available and no players found in the group' },
        { status: 400 }
      );
    }

    // Fetch PDPs for players who are present
    const { data: pdpData, error: pdpError } = await supabase
      .from('pdp')
      .select('*')
      .eq('is_current', true)
      .in('person_id', attendanceData); // Updated from player_id to person_id
      
    if (pdpError) {
      throw new Error(`Error fetching PDPs: ${pdpError.message}`);
    }

    // Filter and deduplicate PDPs (same logic as Code_FilterDeduplicatePDPs in n8n)
    const pdpMap: Record<string, PDP> = {};
    
    pdpData.forEach(pdp => {
      // Only add if not already present for this person_id and is not "blank"
      if (
        !pdpMap[pdp.person_id] && // Updated from player_id to person_id
        pdp.is_current &&
        (
          (pdp.skill_tags && pdp.skill_tags.length) ||
          (pdp.constraint_tags && pdp.constraint_tags.length) ||
          (pdp.pdp_text_full && pdp.pdp_text_full.trim() !== "")
        )
      ) {
        pdpMap[pdp.person_id] = pdp; // Updated from player_id to person_id
      }
    });

    // Get filtered PDPs
    const filteredPdps = Object.values(pdpMap);
    
    // Filter PDPs to only include present players
    const sessionPlanContext = filteredPdps
      .filter(pdp => attendanceData.includes(pdp.person_id)) // Updated from player_id to person_id
      .map(pdp => ({
        person_id: pdp.person_id, // Updated from player_id to person_id
        is_current: pdp.is_current,
        skill_tags: pdp.skill_tags || [],
        constraint_tags: pdp.constraint_tags || [],
        theme_tags: pdp.theme_tags || [],
        advancement_level: pdp.advancement_level || null,
        responsibility_tier: pdp.responsibility_tier || null,
        collective_growth_phase: pdp.collective_growth_phase || null,
        pdp_text_full: pdp.pdp_text_full || '',
        pdp_text_coach: pdp.pdp_text_coach || '',
        pdp_text_player: pdp.pdp_text_player || '',
        source_observation_ids: pdp.source_observation_ids || [],
        created_at: pdp.created_at || null,
        updated_at: pdp.updated_at || null,
        last_updated: pdp.last_updated || null,
        pdp_id: pdp.id || null
      }));

    // If we have no PDPs but have players, create minimal context
    if (sessionPlanContext.length === 0 && attendanceData.length > 0) {
      // Fetch basic player info
      const { data: playerData, error: playerError } = await supabase
        .from('person')
        .select('id, display_name, advancement_level, responsibility_tier, collective_growth_phase')
        .in('id', attendanceData);
        
      if (playerError) {
        console.warn(`Player lookup warning: ${playerError.message}`);
      } else if (playerData && playerData.length > 0) {
        // Create minimal PDP context from player data
        playerData.forEach(player => {
          sessionPlanContext.push({
            person_id: player.id, // Updated from player_id to person_id
            is_current: true,
            skill_tags: [],
            constraint_tags: [],
            theme_tags: [],
            advancement_level: player.advancement_level || 3,
            responsibility_tier: player.responsibility_tier || 2,
            collective_growth_phase: player.collective_growth_phase || 3,
            pdp_text_full: '',
            pdp_text_coach: '',
            pdp_text_player: '',
            source_observation_ids: [],
            created_at: null,
            updated_at: null,
            last_updated: null,
            pdp_id: null
          });
        });
      }
    }

    // Call OpenAI to generate practice plan
    // Using the exact same prompt structure as in the n8n workflow but with stronger JSON directives
    const systemMessage = "You are a world-class basketball practice designer and player development architect. Your job is to design session plans that maximize skill growth, decision-making, and team cohesion, rooted in constraints-led, ARC-driven coaching. YOU MUST RESPOND WITH VALID JSON ONLY. DO NOT include any explanatory text, markdown, or conversation. Your entire response must be a single valid JSON object that can be parsed with JSON.parse().";
    
    const userMessage = `You are provided with the latest Player Development Profiles (PDPs) for today's session roster. Each PDP includes:
- person_id
- skill_tags
- constraint_tags
- theme_tags
- advancement_level (1–10)
- responsibility_tier (1–6)
- collective_growth_phase (1–6)

The current team or pod collective growth phase is: ${body.collective_growth_phase || 3}

Design a session plan for this group that:
- Addresses both individual and shared constraints/skills.
- Recommends 3–5 practice blocks (warm-up, SSGs, team concept, individual work, etc.).
- For each block, specify:
    • Block Name
    • Format (e.g., 1v1, 2v2, 3v3, 5v5, coach-in, pod split, etc.)
    • Targeted skills/constraints (by tag name, not summary)
    • Which players benefit most (by person_id or tag match)
    • Collective Growth phase alignment (C-phase)
    • Key coaching cues (constraint language)

IMPORTANT: YOUR ENTIRE RESPONSE MUST BE VALID JSON. DO NOT INCLUDE ANY EXPLANATORY TEXT BEFORE OR AFTER THE JSON.
DO NOT START WITH "Here's a session plan" or any other text.
DO NOT END WITH "I hope this helps" or any other text.
RESPOND ONLY WITH THE JSON OBJECT.

The output MUST follow this exact structure:
{
  "session_plan": [
    {
      "block_name": "Spacing to Advantage",
      "format": "3v3",
      "skills": ["Spacing", "Early Advantage"],
      "constraints": ["Fight For Your Feet"],
      "players": ["8ce6193d-3041-4f11-8c1d-a63d10d12569"],
      "collective_growth_phase": 2,
      "coaching_cues": ["Land and pause", "Find spacing before action"]
    },
    {
      "block_name": "Second Block Example",
      "format": "2v2",
      "skills": ["Another Skill"],
      "constraints": ["Another Constraint"],
      "players": ["9f5e8d7c-6b3a-4c2d-9e1f-0a8b7c6d5e4f"],
      "collective_growth_phase": 3,
      "coaching_cues": ["Cue one", "Cue two"]
    }
  ]
}

Base your decisions ONLY on the supplied PDPs and team growth phase. Recommend only blocks that align with your ARC philosophy. Do not invent tags. Make sure each constraint or skill targeted comes directly from the PDPs or team phase.

If there are duplicate needs, prioritize blocks that address multiple players' needs at once.

REMEMBER: RESPOND WITH VALID JSON ONLY. NO EXPLANATORY TEXT.`;

    // Call OpenAI with strict JSON response format
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125', // Using a model that supports response_format
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
        { role: 'user', content: `Here are the PDPs for today's session: ${JSON.stringify(sessionPlanContext)}` }
      ],
      temperature: 0.5, // Lower temperature for more predictable outputs
      response_format: { type: "json_object" }, // Force JSON response
    });

    // Parse the response with better error handling
    let parsedPlan: SessionPlan;
    try {
      const aiContent = aiResponse.choices[0].message.content || '';
      
      // Try to parse the JSON directly
      try {
        parsedPlan = JSON.parse(aiContent);
      } catch (parseError) {
        // First fallback: Try to extract JSON if there's text around it
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedPlan = JSON.parse(jsonMatch[0]);
          } catch (extractError) {
            // Second fallback: Try to fix common JSON issues
            const cleanedJson = aiContent
              .replace(/^[^{]*/, '') // Remove any text before the first {
              .replace(/[^}]*$/, '') // Remove any text after the last }
              .replace(/\\'/g, "'") // Fix escaped single quotes
              .replace(/\\"/g, '"') // Fix escaped double quotes
              .replace(/\n/g, ' '); // Remove newlines
              
            try {
              parsedPlan = JSON.parse(cleanedJson);
            } catch (cleanError) {
              // If all parsing attempts fail, throw the original error
              throw parseError;
            }
          }
        } else {
          throw parseError;
        }
      }
      
      // Validate the parsed plan has the expected structure
      if (!parsedPlan || !Array.isArray(parsedPlan.session_plan)) {
        throw new Error('OpenAI response does not contain a valid session_plan array');
      }
    } catch (error) {
      console.error('OpenAI response parsing error:', error);
      console.error('Raw OpenAI response:', aiResponse.choices[0].message.content);
      throw new Error(`Failed to parse OpenAI output: ${error}`);
    }

    // Add optional fields to every block (same logic as Code_ParseSessionPlan in n8n)
    parsedPlan.session_plan = parsedPlan.session_plan.map((block, idx) => ({
      ...block,
      advancement_levels: block.advancement_levels || [],
      responsibility_tiers: block.responsibility_tiers || [],
      group_id: block.group_id || groupId, // Updated from team_id to group_id
      pod_id: block.pod_id || body.pod_id || null,
      session_id: sessionId,
      session_date: block.session_date || sessionDate,
      start_time: block.start_time || null,
      end_time: block.end_time || null,
      duration_minutes: block.duration_minutes || body.duration || null,
      location: block.location || "",
      block_order: idx + 1,
      drill_id: block.drill_id || null,
      notes: block.notes || "",
      feedback_fields: block.feedback_fields || {
        coach_reflection: "",
        player_reflection: "",
        observed_transfer_score: null,
        attendance: []
      }
    }));

    // Add top-level optional fields
    parsedPlan.session_id = sessionId;
    parsedPlan.group_id = groupId; // Updated from team_id to group_id
    parsedPlan.pod_id = body.pod_id || null;
    parsedPlan.session_date = sessionDate;
    parsedPlan.created_by = body.coach_id;
    parsedPlan.created_at = new Date().toISOString();
    parsedPlan.last_updated = new Date().toISOString();
    parsedPlan.overall_theme_tags = parsedPlan.overall_theme_tags || (body.theme ? [body.theme] : []);
    parsedPlan.collective_growth_phase = body.collective_growth_phase || null;
    parsedPlan.advancement_levels = parsedPlan.advancement_levels || [];
    parsedPlan.responsibility_tiers = parsedPlan.responsibility_tiers || [];
    parsedPlan.planned_attendance = attendanceData;
    parsedPlan.session_notes = parsedPlan.session_notes || "";
    parsedPlan.reflection_fields = parsedPlan.reflection_fields || {
      coach_post_session: "",
      player_feedback: [],
      observed_transfer_map: {}
    };

    // Check if we need to update or insert the session
    let dbOperation;
    if (body.session_id) {
      // Update existing session
      const { data, error } = await supabase
        .from('session')
        .update({
          session_plan: parsedPlan,
          status: 'pending_approval',
          last_updated: new Date().toISOString(),
          overall_theme_tags: parsedPlan.overall_theme_tags,
          collective_growth_phase: parsedPlan.collective_growth_phase,
          planned_attendance: parsedPlan.planned_attendance,
          team_id: groupId, // Changed from group_id to team_id for database column name
          coach_id: body.coach_id // Reference to person table
        })
        .eq('id', sessionId)
        .select();
        
      if (error) {
        throw new Error(`Error updating session: ${error.message}`);
      }
      
      dbOperation = { type: 'update', data };
    } else {
      // Insert new session
      const { data, error } = await supabase
        .from('session')
        .insert({
          id: sessionId,
          title: `Practice ${sessionDate}${body.theme ? ` - ${body.theme}` : ''}`,
          objective: body.theme || 'Basketball practice session',
          team_id: groupId, // Changed from group_id to team_id for database column name
          pod_id: body.pod_id || null,
          coach_id: body.coach_id, // Reference to person table
          status: 'pending_approval',
          session_date: sessionDate,
          session_plan: parsedPlan,
          created_by: body.coach_id,
          last_updated: new Date().toISOString(),
          overall_theme_tags: parsedPlan.overall_theme_tags,
          collective_growth_phase: parsedPlan.collective_growth_phase,
          planned_attendance: parsedPlan.planned_attendance,
          duration_minutes: body.duration || null
        })
        .select();
        
      if (error) {
        throw new Error(`Error inserting session: ${error.message}`);
      }
      
      dbOperation = { type: 'insert', data };
    }

    // Insert session blocks into mpbc_practice_session_blocks
    const sessionBlocks = parsedPlan.session_plan.map((block, index) => ({
      session_id: sessionId,
      block_id: uuidv4(),
      block_order: index + 1,
      duration: block.duration_minutes || 15, // Default 15 minutes if not specified
      notes: block.notes || ''
    }));

    // Check if mpbc_practice_session_blocks table exists
    const { data: tableExists, error: tableCheckError } = await supabase
      .from('mpbc_practice_session_blocks')
      .select('id')
      .limit(1);
      
    if (tableCheckError) {
      console.warn('Warning: mpbc_practice_session_blocks table may not exist or is not accessible');
    } else {
      // Insert blocks into mpbc_practice_session_blocks
      const { error: blocksError } = await supabase
        .from('mpbc_practice_session_blocks')
        .insert(sessionBlocks);

      if (blocksError) {
        console.error('Error inserting session blocks:', blocksError);
        // Continue execution - this is not a critical error
      }
    }

    // Log successful API call
    await logAgentEvent({
      event_type: 'generate_blocks_success',
      player_id: null,
      group_id: groupId, // Updated from team_id to group_id
      agent_id: 'generate-blocks-api',
      details: {
        session_id: sessionId,
        block_count: parsedPlan.session_plan.length,
        operation: dbOperation.type,
        using_service_role: usingServiceRole
      },
      status: 'completed'
    });

    // Return the generated practice plan
    return NextResponse.json({
      success: true,
      message: `Practice blocks ${dbOperation.type === 'insert' ? 'created' : 'updated'} successfully`,
      session_id: sessionId,
      session_plan: parsedPlan,
      status: 'pending_approval',
      db_operation: dbOperation.type,
      using_service_role: usingServiceRole
    });
    
  } catch (error: any) {
    console.error('Error in generate-blocks API:', error);
    
    // Log error
    await logAgentEvent({
      event_type: 'generate_blocks_error',
      player_id: null,
      group_id: null,
      agent_id: 'generate-blocks-api',
      details: {
        error: error.message,
        using_service_role: usingServiceRole
      },
      status: 'error'
    });
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'An unknown error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        using_service_role: usingServiceRole
      },
      { status: 500 }
    );
  }
}

// Helper function to log agent events
async function logAgentEvent({
  event_type,
  player_id,
  group_id, // Updated from team_id to group_id
  agent_id,
  details,
  status
}: {
  event_type: string;
  player_id: string | null;
  group_id: string | null; // Updated from team_id to group_id
  agent_id: string;
  details: any;
  status: 'started' | 'completed' | 'error';
}) {
  try {
    // Get the appropriate Supabase client (with fallback)
    const supabase = await getSupabaseClient();
    
    const { error } = await supabase
      .from('agent_events')
      .insert({
        id: uuidv4(),
        created_at: new Date().toISOString(),
        event_type,
        player_id,
        team_id: group_id, // Keep team_id field name for compatibility but use group_id value
        agent_id,
        details,
        status
      });
      
    if (error) {
      console.error('Error logging agent event:', error);
    }
  } catch (error) {
    console.error('Error in logAgentEvent:', error);
    // Don't throw - this is a non-critical operation
  }
}
