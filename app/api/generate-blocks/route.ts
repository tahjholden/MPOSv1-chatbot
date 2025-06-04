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
const DEFAULT_TEAM_ID = process.env.DEFAULT_TEAM_ID || '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8'; // This is a group_id
const DEFAULT_COACH_ID = process.env.DEFAULT_COACH_ID || 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7';

// ARC System Definitions
const ARC_ADVANCEMENT_LEVELS = [
  { level: 1, name: 'Base & Balance', description: 'Fundamental movement skills, body control, and athletic stance.' },
  { level: 2, name: 'Ball Control', description: 'Basic dribbling, passing, and receiving skills; comfort with the ball.' },
  { level: 3, name: 'Finishing Foundation', description: 'Developing layups (both hands), basic post moves, and close-range shots.' },
  { level: 4, name: 'Reading Advantage', description: 'Recognizing simple advantages (e.g., 2v1, open teammate) and making appropriate decisions.' },
  { level: 5, name: 'Creating Advantage', description: 'Using individual skills (dribble moves, screens) to create scoring opportunities for self or others.' },
  { level: 6, name: 'Maintaining Advantage', description: 'Sustaining offensive flow, making secondary reads, and exploiting continued defensive imbalance.' },
  { level: 7, name: 'Layered Reads', description: 'Processing multiple defensive actions and reactions to make complex decisions.' },
  { level: 8, name: 'Complex Scenarios', description: 'Navigating and executing effectively in late-game situations, special plays, or against sophisticated defenses.' },
  { level: 9, name: 'Endgame Creation', description: 'Consistently making high-level plays under pressure to win games; elite decision-making and execution.' }
];

const ARC_RESPONSIBILITY_LEVELS = [
  { level: 1, name: 'Development Cadre', description: 'Focus on individual skill acquisition and understanding basic team concepts.' },
  { level: 2, name: 'Rotational Contributor', description: 'Can execute specific roles and responsibilities effectively within limited minutes or situations.' },
  { level: 3, name: 'Trusted Role Player', description: 'Reliably performs defined team roles, understands system, and makes consistent positive contributions.' },
  { level: 4, name: 'On-Court Co-Leader', description: 'Demonstrates leadership qualities, communicates effectively, and helps guide teammates within the team system.' },
  { level: 5, name: 'Team Leader', description: 'Primary on-court leader, sets tone, responsible for significant tactical execution and team cohesion.' },
  { level: 6, name: 'Core Anchor', description: 'Franchise-level player, system often revolves around their strengths; embodies team identity and culture.' }
];

const ARC_COLLECTIVE_GROWTH_LEVELS = [
  { level: 1, name: 'Foundation & Familiarity', description: 'Team learning basic structure, roles, and communication protocols; high coach dependency.' },
  { level: 2, name: 'Collective Constraints & Roles', description: 'Team beginning to understand and operate within shared constraints and defined roles; coach scaffolding still significant.' },
  { level: 3, name: 'Shared Decision Rules', description: 'Players start to use shared heuristics and decision rules to solve common game problems; less direct cueing needed.' },
  { level: 4, name: 'Autonomous Execution', description: 'Team can execute tactical plans with minimal coach intervention; players make adjustments based on shared understanding.' },
  { level: 5, name: 'Collective Accountability', description: 'Players hold each other accountable to team standards and tactical execution; peer coaching emerges.' },
  { level: 6, name: 'Self-Regulating Cohesion', description: 'Team operates with high autonomy, adapts fluidly to game situations, and self-manages culture and performance; coach as facilitator.' }
];


// Helper function to get the appropriate Supabase client with fallback
async function getSupabaseClient() {
  if (!usingServiceRole) {
    return supabaseAnon;
  }
  try {
    const { data, error } = await supabaseService.from('person').select('count', {count: 'exact'}).limit(1);
    if (error) {
      if (!serviceKeyWarningLogged) {
        console.warn('⚠️ Service role key failed, falling back to anon key. Error:', error.message);
        console.warn('⚠️ Some admin operations may be limited. Please update your service role key in .env.local');
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e) {
    if (!serviceKeyWarningLogged) {
      console.warn('⚠️ Service role key exception, falling back to anon key. Error:', e);
      console.warn('⚠️ Some admin operations may be limited. Please update your service role key in .env.local');
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface CleanPracticeBlock {
  block_type: 'Warmup' | 'Skill Block' | 'Small Sided Game' | 'Team Concept' | 'Conditioning' | 'Cool Down';
  block_name: string;
  duration: number; 
  description: string;
  skills_targeted: string[]; 
  intensity_level: 1 | 2 | 3 | 4 | 5; 
  format?: string; 
  coaching_cues?: string[];
  notes?: string; 
  block_order?: number; 
  group_id?: string; 
  pod_id?: string | null;
  session_id?: string | null;
  session_date?: string;
  drill_id?: string | null; 
}

interface CleanSessionPlan {
  session_plan: CleanPracticeBlock[];
  session_id?: string | null;
  group_id?: string; 
  pod_id?: string | null;
  session_date?: string;
  created_by?: string | null;
  created_at?: string;
  last_updated?: string;
  overall_theme_tags?: string[]; 
  collective_growth_phase?: number | null; 
  session_notes?: string;
}

interface RequestBody {
  responsibility_level: number;
  collective_growth_level: number;
  duration: number; 
  coach_id: string;
  group_id?: string; 
  pod_id?: string;
  session_date?: string;
  session_id?: string; 
}

// Main API route handler
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    
    if (!body.coach_id || typeof body.responsibility_level !== 'number' || typeof body.collective_growth_level !== 'number' || !body.duration) {
      return NextResponse.json(
        { error: 'coach_id, responsibility_level, collective_growth_level, and duration are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    const sessionId = body.session_id || uuidv4();
    const sessionDate = body.session_date || new Date().toISOString().split('T')[0];
    const groupId = body.group_id || DEFAULT_TEAM_ID; 
    
    await logAgentEvent({
      event_type: 'generate_blocks_request (arc_driven)',
      player_id: null, 
      group_id: groupId, 
      agent_id: 'generate-blocks-api-arc',
      details: { request: { ...body, session_id: sessionId } },
      status: 'started'
    });

    let groupPlayerIds: string[] = [];
    if (groupId) {
        const { data: groupMembers, error: groupError } = await supabase
            .from('person_group') 
            .select('person_id')
            .eq('group_id', groupId)
            .eq('role', 'player');
        if (groupError) {
            console.warn(`Group members lookup warning: ${groupError.message}`);
        } else if (groupMembers && groupMembers.length > 0) {
            groupPlayerIds = groupMembers.map(member => member.person_id);
        }
    }
    if (groupPlayerIds.length === 0) {
        console.warn(`No players found for group_id: ${groupId}. planned_attendance will be empty.`);
    }
    
    // Fetch a generic sample of drills for AI context
    const { data: drillsSample, error: drillsError } = await supabase
        .from('drills')
        .select('drill_name, theme, format, core_idea, description, tags')
        .eq('active', true)
        .limit(10); // Generic sample
    let drillExamplesString = 'a variety of standard basketball drills.';
    if (!drillsError && drillsSample && drillsSample.length > 0) {
        drillExamplesString = `some example drills we have are: ${drillsSample.map(d => `${d.drill_name} (focus: ${d.theme || d.core_idea || (d.tags || []).join(', ') || 'general'}, format: ${d.format || 'N/A'})`).join('; ')}.`;
    }
    
    const responsibilityDef = ARC_RESPONSIBILITY_LEVELS.find(r => r.level === body.responsibility_level) || ARC_RESPONSIBILITY_LEVELS[0];
    const collectiveGrowthDef = ARC_COLLECTIVE_GROWTH_LEVELS.find(c => c.level === body.collective_growth_level) || ARC_COLLECTIVE_GROWTH_LEVELS[0];

    const systemMessage = `You are a world-class basketball practice designer. Your task is to create a modular practice plan based on the team's Development ARC status.
Respond ONLY with a valid JSON object. Do NOT include any conversational text or markdown.
Your entire response must be a single valid JSON object that can be parsed with JSON.parse().`;
    
    const userMessage = `Design a modular basketball practice plan for a ${body.duration}-minute session.

Team's Current Development ARC Status:
- Responsibility (R) Level: ${body.responsibility_level} - ${responsibilityDef.name} (${responsibilityDef.description})
- Collective Growth (C) Level: ${body.collective_growth_level} - ${collectiveGrowthDef.name} (${collectiveGrowthDef.description})

Instructions:
- Based on the team's R and C levels, generate appropriate "overall_theme_tags" (1-3 themes) that reflect the practice focus.
- Create 3-5 practice blocks appropriate for the total duration and the team's ARC status.
- Allocate time for each block, ensuring total duration matches the session duration.
- For each block, specify:
    • block_type: Choose from "Warmup", "Skill Block", "Small Sided Game", "Team Concept", "Conditioning", "Cool Down".
    • block_name: A descriptive name for the block (e.g., "Dynamic Warm-up & Role Clarity", "R${body.responsibility_level}/C${body.collective_growth_level} Focused SSG").
    • duration: Time in minutes for this block.
    • description: A brief summary of the block's purpose and activities, aligned with the R and C levels.
    • skills_targeted: An array of general basketball skills this block focuses on, relevant to the ARC context.
    • intensity_level: A number from 1 (very low) to 5 (very high).
    • format: (Optional) e.g., "Full Team", "Stations", "3v3".
    • coaching_cues: (Optional) Array of 2-3 key verbal cues for coaches, tailored to the R and C levels (e.g., more scaffolding for low C, more player-led for high C).
- The blocks should be generic and reusable. Do NOT include specific player names.
- Consider these example drills if relevant, adapting them to the ARC context: ${drillExamplesString}

IMPORTANT: YOUR ENTIRE RESPONSE MUST BE VALID JSON.
The output MUST follow this exact structure:
{
  "overall_theme_tags": ["Theme Derived from R${body.responsibility_level}", "Theme Derived from C${body.collective_growth_level}"],
  "session_plan": [
    {
      "block_type": "Warmup",
      "block_name": "ARC-Focused Warm-up",
      "duration": 10,
      "description": "Dynamic warm-up incorporating elements relevant to R${body.responsibility_level} and C${body.collective_growth_level}.",
      "skills_targeted": ["Activation", "ARC Focus Prep"],
      "intensity_level": 2,
      "format": "Full Team",
      "coaching_cues": ["Cue for R${body.responsibility_level}", "Cue for C${body.collective_growth_level}"]
    }
    // ... more blocks
  ]
}`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o', 
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.4, 
      response_format: { type: "json_object" }, 
    });

    let parsedPlan: CleanSessionPlan;
    try {
      const aiContent = aiResponse.choices[0].message.content || '';
      parsedPlan = JSON.parse(aiContent);
      if (!parsedPlan || !Array.isArray(parsedPlan.session_plan) || !Array.isArray(parsedPlan.overall_theme_tags)) {
        throw new Error('OpenAI response does not contain a valid session_plan array and overall_theme_tags array.');
      }
      parsedPlan.session_plan.forEach((block, idx) => {
        if (!block.block_type || !block.block_name || typeof block.duration !== 'number' || !block.description || !Array.isArray(block.skills_targeted) || typeof block.intensity_level !== 'number') {
            throw new Error(`Block at index ${idx} has missing or invalid fields.`);
        }
      });
    } catch (error) {
      console.error('OpenAI response parsing error:', error);
      console.error('Raw OpenAI response:', aiResponse.choices[0].message.content);
      throw new Error(`Failed to parse OpenAI output: ${error}`);
    }

    parsedPlan.session_plan = parsedPlan.session_plan.map((block, idx) => ({
      ...block,
      block_order: idx + 1,
      group_id: groupId, 
      pod_id: body.pod_id || null,
      session_id: sessionId,
      session_date: sessionDate,
    }));

    parsedPlan.session_id = sessionId;
    parsedPlan.group_id = groupId; 
    parsedPlan.pod_id = body.pod_id || null;
    parsedPlan.session_date = sessionDate;
    parsedPlan.created_by = body.coach_id;
    parsedPlan.created_at = new Date().toISOString();
    parsedPlan.last_updated = new Date().toISOString();
    parsedPlan.collective_growth_phase = body.collective_growth_level; 
    parsedPlan.session_notes = parsedPlan.session_notes || "";

    let dbOperation;
    const sessionObjective = `R${body.responsibility_level}: ${responsibilityDef.name} & C${body.collective_growth_level}: ${collectiveGrowthDef.name}`;
    const sessionTitle = `Practice ${sessionDate} - ${parsedPlan.overall_theme_tags.join(' & ')} (R${body.responsibility_level}/C${body.collective_growth_level})`;

    if (body.session_id) { 
      const { data, error } = await supabase
        .from('session')
        .update({
          session_plan: parsedPlan, 
          status: 'pending_approval', 
          last_updated: new Date().toISOString(),
          overall_theme_tags: parsedPlan.overall_theme_tags,
          collective_growth_phase: body.collective_growth_level,
          team_layer: body.responsibility_level, // Assuming team_layer maps to R level
          planned_attendance: groupPlayerIds, 
          team_id: groupId, 
          coach_id: body.coach_id,
          duration_minutes: body.duration,
          objective: sessionObjective, 
          title: sessionTitle,
        })
        .eq('id', sessionId)
        .select();
        
      if (error) throw new Error(`Error updating session: ${error.message}`);
      dbOperation = { type: 'update', data };
    } else { 
      const { data, error } = await supabase
        .from('session')
        .insert({
          id: sessionId,
          title: sessionTitle,
          objective: sessionObjective, 
          team_id: groupId, 
          pod_id: body.pod_id || null,
          coach_id: body.coach_id, 
          status: 'pending_approval',
          session_date: sessionDate,
          session_plan: parsedPlan, 
          created_by: body.coach_id,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
          overall_theme_tags: parsedPlan.overall_theme_tags,
          collective_growth_phase: body.collective_growth_level,
          team_layer: body.responsibility_level, // Assuming team_layer maps to R level
          planned_attendance: groupPlayerIds, 
          duration_minutes: body.duration
        })
        .select();
        
      if (error) throw new Error(`Error inserting session: ${error.message}`);
      dbOperation = { type: 'insert', data };
    }

    if (body.session_id) { 
        const { error: deleteError } = await supabase
            .from('mpbc_practice_session_blocks')
            .delete()
            .eq('session_id', sessionId);
        if (deleteError) {
            console.warn(`Error deleting old session blocks for session ${sessionId}: ${deleteError.message}`);
        }
    }

    const sessionBlocksForDb = parsedPlan.session_plan.map((block) => ({
      session_id: sessionId,
      block_id: uuidv4(), 
      block_order: block.block_order,
      duration: block.duration, 
      notes: block.description, 
    }));
      
    if (sessionBlocksForDb.length > 0) {
        const { error: blocksError } = await supabase
            .from('mpbc_practice_session_blocks')
            .insert(sessionBlocksForDb);
        if (blocksError) {
            console.error('Error inserting session blocks into mpbc_practice_session_blocks:', blocksError.message);
        }
    }

    await logAgentEvent({
      event_type: 'generate_blocks_success (arc_driven)',
      player_id: null,
      group_id: groupId, 
      agent_id: 'generate-blocks-api-arc',
      details: {
        session_id: sessionId,
        block_count: parsedPlan.session_plan.length,
        selected_themes: parsedPlan.overall_theme_tags,
        responsibility_level: body.responsibility_level,
        collective_growth_level: body.collective_growth_level,
        operation: dbOperation.type,
        using_service_role: usingServiceRole
      },
      status: 'completed'
    });

    return NextResponse.json({
      success: true,
      message: `ARC-driven practice blocks ${dbOperation.type === 'insert' ? 'created' : 'updated'} successfully.`,
      session_id: sessionId,
      session_plan: parsedPlan, 
      status: 'pending_approval',
      db_operation: dbOperation.type,
      using_service_role: usingServiceRole
    });
    
  } catch (error: any) {
    console.error('Error in generate-blocks API (arc_driven):', error);
    
    await logAgentEvent({
      event_type: 'generate_blocks_error (arc_driven)',
      player_id: null,
      group_id: null, 
      agent_id: 'generate-blocks-api-arc',
      details: { error: error.message, using_service_role: usingServiceRole },
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
  group_id, 
  agent_id,
  details,
  status
}: {
  event_type: string;
  player_id: string | null;
  group_id: string | null; 
  agent_id: string;
  details: any;
  status: 'started' | 'completed' | 'error';
}) {
  try {
    const supabase = await getSupabaseClient();
    
    const { error } = await supabase
      .from('agent_events')
      .insert({
        id: uuidv4(),
        created_at: new Date().toISOString(),
        event_type,
        player_id, 
        team_id: group_id, 
        agent_id,
        details,
        status
      });
      
    if (error) {
      console.error('Error logging agent event:', error);
    }
  } catch (error) {
    console.error('Error in logAgentEvent:', error);
  }
}
