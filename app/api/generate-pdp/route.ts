import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

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
        console.warn(`⚠️ Service role key failed for generate-pdp: ${error.message}. Falling back to anon key.`);
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for generate-pdp: ${e.message}. Falling back to anon key.`);
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface RequestBody {
  person_id: string; // Player's ID
  coach_id: string;
  focus_text?: string; // Optional text from coach like "focusing on defense and rebounding"
  include_observations_days?: number; // How many days of observations to include, e.g., 30
  group_id?: string; // Optional, for context
}

interface PlayerContext {
  person_id: string;
  display_name: string;
  current_primary_focus?: string | null;
  current_secondary_focus?: string | null;
  advancement_level?: number | null;
  responsibility_tier?: number | null;
  collective_growth_phase?: number | null;
  recent_observations: { text: string; created_at: string }[];
  existing_pdp_summary?: string | null;
}

interface PDPElements {
  pdp_text_coach: string;
  pdp_text_player: string;
  primary_focus: string;
  secondary_focus?: string;
  skill_tags: string[]; // Names of skills
  constraint_tags: string[]; // Names of constraints
  theme_tags?: string[]; // Names of themes
  actionable_goals: string[]; // Specific goals
  coaching_recommendations: string[];
  skills_summary?: string;
  constraints_summary?: string;
  pdp_full_text?: string; // Optional more detailed text
  target_advancement_level?: number;
  target_responsibility_tier?: number;
}


export async function POST(req: NextRequest) {
  const operationId = uuidv4();
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.person_id || !requestBody.coach_id) {
      return NextResponse.json(
        { success: false, error: 'person_id (player) and coach_id are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    await logAgentEvent({
      event_type: 'generate_pdp_request',
      coach_id: requestBody.coach_id,
      player_id: requestBody.person_id,
      group_id: requestBody.group_id || null,
      agent_id: 'generate-pdp-api',
      details: { request_id: operationId, focus_text: requestBody.focus_text },
      status: 'started',
    });

    // 1. Fetch Player Data and Context
    const playerContext = await fetchPlayerContext(requestBody.person_id, requestBody.include_observations_days || 30, supabase);

    if (!playerContext) {
      throw new Error(`Player with ID ${requestBody.person_id} not found.`);
    }

    // 2. Call OpenAI to generate PDP elements
    const pdpElements = await generatePDPWithOpenAI(playerContext, requestBody.focus_text);

    // 3. Match tags to existing DB tags or prepare for suggestion
    const resolvedSkillTags = await resolveTags(pdpElements.skill_tags, 'skill', supabase);
    const resolvedConstraintTags = await resolveTags(pdpElements.constraint_tags, 'constraint', supabase);
    const resolvedThemeTags = pdpElements.theme_tags ? await resolveTags(pdpElements.theme_tags, 'theme', supabase) : [];

    // 4. Handle PDP Versioning and Save to DB
    const newPdpId = uuidv4();
    let previousVersionId: string | null = null;

    // Find current active PDP for this player, if any
    const { data: currentPdp, error: currentPdpError } = await supabase
      .from('pdp')
      .select('id')
      .eq('person_id', requestBody.person_id)
      .eq('is_current', true)
      .single();

    if (currentPdpError && currentPdpError.code !== 'PGRST116') { // PGRST116: 0 rows
      throw new Error(`Error fetching current PDP: ${currentPdpError.message}`);
    }

    if (currentPdp) {
      previousVersionId = currentPdp.id;
      // Set old PDP to not current
      const { error: updateOldPdpError } = await supabase
        .from('pdp')
        .update({ is_current: false, archived_at: new Date().toISOString() })
        .eq('id', currentPdp.id);
      if (updateOldPdpError) {
        throw new Error(`Error archiving old PDP: ${updateOldPdpError.message}`);
      }
    }
    
    const sourceObservationIds = playerContext.recent_observations.map((obs: any) => obs.id).filter(id => id);


    // Insert new PDP
    const { data: newPdpData, error: newPdpError } = await supabase
      .from('pdp')
      .insert({
        id: newPdpId,
        pdp_id: newPdpId, // If pdp_id is a text version of id
        person_id: requestBody.person_id,
        person_name: playerContext.display_name, // Denormalized for easier display
        is_current: true,
        status: 'pending_approval', // New PDPs need review
        pdp_text_coach: pdpElements.pdp_text_coach,
        pdp_text_player: pdpElements.pdp_text_player,
        pdp_full_text: pdpElements.pdp_full_text || `${pdpElements.pdp_text_coach}\n\n${pdpElements.pdp_text_player}`,
        primary_focus: pdpElements.primary_focus,
        secondary_focus: pdpElements.secondary_focus || null,
        skill_tags: resolvedSkillTags.map(tag => tag.id || tag.name), // Store IDs if matched, else names
        constraint_tags: resolvedConstraintTags.map(tag => tag.id || tag.name),
        theme_tags: resolvedThemeTags.map(tag => tag.id || tag.name),
        skills_summary: pdpElements.skills_summary || pdpElements.skill_tags.join(', '),
        constraints_summary: pdpElements.constraints_summary || pdpElements.constraint_tags.join(', '),
        previous_version_id: previousVersionId,
        source_observation_id: sourceObservationIds, 
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        // These might be set by coach during review or derived from OpenAI
        advancement_level: pdpElements.target_advancement_level || playerContext.advancement_level,
        responsibility_tier: pdpElements.target_responsibility_tier || playerContext.responsibility_tier,
        // collective_growth_phase might come from team/group context or player's current state
        collective_growth_phase: playerContext.collective_growth_phase, 
        // actionable_goals could be stored in a separate table or as JSONB if complex
        // For simplicity, let's assume they are part of pdp_text_coach for now.
      })
      .select()
      .single();

    if (newPdpError) {
      throw new Error(`Error inserting new PDP: ${newPdpError.message}`);
    }

    await logAgentEvent({
      event_type: 'generate_pdp_success',
      coach_id: requestBody.coach_id,
      player_id: requestBody.person_id,
      group_id: requestBody.group_id || null,
      agent_id: 'generate-pdp-api',
      details: { request_id: operationId, pdp_id: newPdpId, player_name: playerContext.display_name },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'PDP generated successfully and is pending approval.',
      pdp: newPdpData,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in generate-pdp API (Operation ID: ${operationId}):`, error.message);
    let rawRequestBody = 'Could not retrieve request body';
    try {
        rawRequestBody = await req.text();
    } catch (_) { /* ignore */ }


    await logAgentEvent({
      event_type: 'generate_pdp_error',
      coach_id: (requestBody! && requestBody!.coach_id) || 'unknown',
      player_id: (requestBody! && requestBody!.person_id) || null,
      group_id: (requestBody! && requestBody!.group_id) || null,
      agent_id: 'generate-pdp-api',
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

async function fetchPlayerContext(personId: string, observationDays: number, supabase: SupabaseClient): Promise<PlayerContext | null> {
  // Fetch player basic info
  const { data: personData, error: personError } = await supabase
    .from('person')
    .select('id, display_name, primary_focus, secondary_focus, advancement_level, responsibility_tier, collective_growth_phase')
    .eq('id', personId)
    .single();

  if (personError || !personData) {
    console.error(`Error fetching person ${personId}:`, personError?.message);
    return null;
  }

  // Fetch current PDP summary (if exists)
  const { data: currentPdpData, error: currentPdpError } = await supabase
    .from('pdp')
    .select('primary_focus, secondary_focus, skills_summary, constraints_summary')
    .eq('person_id', personId)
    .eq('is_current', true)
    .single();
  
  let existingPdpSummary = null;
  if (!currentPdpError && currentPdpData) {
    existingPdpSummary = `Current focus: ${currentPdpData.primary_focus || 'N/A'}. Skills: ${currentPdpData.skills_summary || 'N/A'}. Constraints: ${currentPdpData.constraints_summary || 'N/A'}.`;
  }

  // Fetch recent observations from observation_logs (processed)
  const observationCutoffDate = new Date();
  observationCutoffDate.setDate(observationCutoffDate.getDate() - observationDays);

  const { data: observationsData, error: observationsError } = await supabase
    .from('observation_logs')
    .select('id, analysis, recommendation, created_at, payload->>raw_text AS raw_text') // Assuming raw_text is stored in payload
    .eq('person_id', personId) // Assuming observations are linked to player via person_id
    .gte('created_at', observationCutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(10); // Limit number of observations for context

  if (observationsError) {
    console.warn(`Error fetching observations for player ${personId}: ${observationsError.message}`);
  }
  
  const recentObservations = observationsData?.map(obs => ({
      id: obs.id, // Include observation ID to link in pdp.source_observation_id
      text: obs.raw_text || obs.analysis || obs.recommendation || "Observation recorded.", // Prefer raw_text if available
      created_at: obs.created_at
  })) || [];


  return {
    person_id: personData.id,
    display_name: personData.display_name,
    current_primary_focus: personData.primary_focus,
    current_secondary_focus: personData.secondary_focus,
    advancement_level: personData.advancement_level,
    responsibility_tier: personData.responsibility_tier,
    collective_growth_phase: personData.collective_growth_phase,
    recent_observations: recentObservations,
    existing_pdp_summary: existingPdpSummary,
  };
}

async function generatePDPWithOpenAI(playerContext: PlayerContext, coachFocusText?: string): Promise<PDPElements> {
  const observationSummary = playerContext.recent_observations.length > 0
    ? playerContext.recent_observations.map(obs => `- (${obs.created_at.substring(0,10)}): ${obs.text}`).join('\n')
    : 'No recent observations available.';

  const systemMessage = `You are an expert basketball Player Development Plan (PDP) architect.
Your goal is to create a comprehensive, actionable, and personalized PDP for a player.
Respond ONLY with a valid JSON object. Do NOT include any conversational text or markdown.
Your ENTIRE response must be a single JSON object.

JSON Structure:
{
  "pdp_text_coach": "Detailed plan for the coach, including specific drills, coaching cues, and progress tracking metrics.",
  "pdp_text_player": "Simplified, motivating plan for the player, focusing on 2-3 key actions and mindsets.",
  "primary_focus": "The single most important development area for this period (e.g., 'On-ball defense').",
  "secondary_focus": "A secondary, complementary development area (e.g., 'Weak-hand dribbling').",
  "skill_tags": ["Skill Name 1", "Skill Name 2"],
  "constraint_tags": ["Constraint Name 1", "Constraint Name 2"],
  "theme_tags": ["Theme Name 1", "Theme Name 2"],
  "actionable_goals": ["Specific Goal 1 (e.g., 'Improve free throw percentage to 75% in 4 weeks')", "Specific Goal 2"],
  "coaching_recommendations": ["Recommendation 1 for coach", "Recommendation 2"],
  "skills_summary": "Brief summary of key skills to develop.",
  "constraints_summary": "Brief summary of key constraints to address or leverage.",
  "pdp_full_text": "A comprehensive text combining coach and player information, suitable for a detailed report.",
  "target_advancement_level": 7, // Suggested target level (1-10)
  "target_responsibility_tier": 4 // Suggested target tier (1-6)
}

Guidelines:
- Base the PDP on the player's context: current focus, observations, and coach's input.
- Ensure goals are SMART (Specific, Measurable, Achievable, Relevant, Time-bound) if possible.
- Skill/Constraint/Theme tags should be concise and standardized (e.g., "Catch and Shoot", "Decision Making Under Pressure").
- Differentiate clearly between coach-facing details and player-facing motivation.
- If coach provides a specific focus, prioritize that in the PDP.
`;

  const userMessage = `Generate a PDP for player: ${playerContext.display_name} (ID: ${playerContext.person_id}).

Player's Current Context:
- Current Primary Focus: ${playerContext.current_primary_focus || 'Not specified'}
- Current Secondary Focus: ${playerContext.current_secondary_focus || 'Not specified'}
- Advancement Level: ${playerContext.advancement_level || 'N/A'}
- Responsibility Tier: ${playerContext.responsibility_tier || 'N/A'}
- Collective Growth Phase: ${playerContext.collective_growth_phase || 'N/A'}
- Existing PDP Summary: ${playerContext.existing_pdp_summary || 'No existing PDP or summary available.'}

Recent Observations (last ${playerContext.recent_observations.length > 0 ? 'few entries' : '0 entries'}):
${observationSummary}

Coach's Specific Focus for this PDP: ${coachFocusText || 'Holistic development based on available data.'}

Please generate the PDP elements in the specified JSON format.
Ensure skill_tags and constraint_tags are specific and actionable.
The pdp_text_coach should be detailed for coaching purposes.
The pdp_text_player should be concise and motivational for the player.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Using a more capable model for complex generation
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.5, // Balanced creativity and determinism
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsedElements = JSON.parse(content) as PDPElements;

    // Validate and ensure all required fields are present
    if (!parsedElements.pdp_text_coach || !parsedElements.pdp_text_player || !parsedElements.primary_focus) {
        throw new Error('OpenAI response missing critical PDP elements.');
    }
    parsedElements.skill_tags = parsedElements.skill_tags || [];
    parsedElements.constraint_tags = parsedElements.constraint_tags || [];
    parsedElements.theme_tags = parsedElements.theme_tags || [];
    parsedElements.actionable_goals = parsedElements.actionable_goals || [];
    parsedElements.coaching_recommendations = parsedElements.coaching_recommendations || [];
    
    return parsedElements;

  } catch (error: any) {
    console.error('Error generating PDP with OpenAI:', error.message);
    throw new Error(`OpenAI PDP generation failed: ${error.message}`);
  }
}

async function resolveTags(tagNames: string[], tagType: 'skill' | 'constraint' | 'theme', supabase: SupabaseClient): Promise<{ id: string | null, name: string }[]> {
  if (!tagNames || tagNames.length === 0) return [];

  const resolvedTags = await Promise.all(
    tagNames.map(async (name) => {
      const trimmedName = name.trim();
      if (!trimmedName) return { id: null, name: '' };

      const { data, error } = await supabase
        .from('tag')
        .select('id, name')
        .eq('tag_type', tagType)
        .or(`name.ilike.${trimmedName},tag_name.ilike.${trimmedName},synonyms.cs.["${trimmedName}"]`) // Check name, tag_name, and synonyms array
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116: 0 rows
        console.warn(`Error resolving tag "${trimmedName}" (${tagType}): ${error.message}`);
      }
      
      if (data) {
        return { id: data.id, name: data.name }; // Return matched tag ID and canonical name
      } else {
        // Tag not found, suggest it
        try {
          await supabase.from('tag_suggestions').insert({
            suggested_tag: trimmedName,
            proposed_type: tagType,
            source_table: 'pdp_generation',
            reviewed: false,
          });
        } catch (suggestionError: any) {
          console.warn(`Failed to log tag suggestion for "${trimmedName}": ${suggestionError.message}`);
        }
        return { id: null, name: trimmedName }; // Return original name if not found
      }
    })
  );
  return resolvedTags.filter(tag => tag.name); // Filter out any empty names
}


// Helper function to log agent events
async function logAgentEvent({
  event_type,
  coach_id,
  player_id,
  group_id,
  agent_id,
  details,
  status,
}: {
  event_type: string;
  coach_id: string;
  player_id: string | null;
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
    if (group_id) logPayload.team_id = group_id; // team_id in agent_events stores group_id

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}):`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}):`, e.message);
  }
}
