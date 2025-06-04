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
        console.warn(`⚠️ Service role key failed for log-reflection: ${error.message}. Falling back to anon key.`);
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for log-reflection: ${e.message}. Falling back to anon key.`);
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface RequestBody {
  reflection_text: string;
  coach_id: string;
  session_id?: string; // Optional: if reflection is tied to a specific session
  player_id?: string;  // Optional: if reflection is about a specific player
  reflection_type?: 'post_session' | 'mid_practice' | 'planning_notes' | 'general_coach_reflection' | 'session_note';
  group_id?: string; // Optional: for team/group context
}

interface ExtractedEntityInfo {
  name: string;
  type: 'player' | 'skill' | 'constraint' | 'theme';
  confidence: number;
  matched_id?: string; // ID from Supabase 'person' or 'tag' table
}

interface ReflectionAnalysis {
  summary: string;
  key_themes: string[];
  mentioned_players: ExtractedEntityInfo[];
  mentioned_skills: ExtractedEntityInfo[];
  mentioned_constraints: ExtractedEntityInfo[];
  sentiment: 'positive' | 'negative' | 'neutral';
  actionable_insights?: string[];
  overall_mood?: string; // e.g., "focused", "frustrated", "optimistic"
}

export async function POST(req: NextRequest) {
  const operationId = uuidv4();
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.reflection_text || !requestBody.coach_id) {
      return NextResponse.json(
        { success: false, error: 'reflection_text and coach_id are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    await logAgentEvent({
      event_type: 'log_reflection_request',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id || null,
      group_id: requestBody.group_id || null,
      agent_id: 'log-reflection-api',
      details: { request_id: operationId, reflection_type: requestBody.reflection_type, text_length: requestBody.reflection_text.length },
      status: 'started',
    });

    // 1. Save raw reflection to observation_intake
    const intakeId = uuidv4();
    const { error: intakeError } = await supabase
      .from('observation_intake')
      .insert({
        id: intakeId,
        raw_note: requestBody.reflection_text,
        coach_id: requestBody.coach_id,
        processed: false, // Mark as unprocessed initially
        created_at: new Date().toISOString(),
        // session_id: requestBody.session_id, // If schema supports
      });

    if (intakeError) {
      throw new Error(`Error saving to observation_intake: ${intakeError.message}`);
    }

    // 2. Process reflection with OpenAI
    const analysisResult = await analyzeReflectionText(requestBody.reflection_text, requestBody.session_id, supabase);

    // 3. Store processed reflection in observation_logs
    const observationLogId = uuidv4();
    const entryType = requestBody.reflection_type || 'general_coach_reflection';

    const { error: logError } = await supabase
      .from('observation_logs')
      .insert({
        id: observationLogId,
        observation_id: requestBody.session_id || null, // Link to session if provided
        entry_type: entryType,
        payload: {
          raw_text: requestBody.reflection_text,
          intake_id: intakeId, // Link to the raw intake record
          extracted_players: analysisResult.mentioned_players,
          extracted_skills: analysisResult.mentioned_skills,
          extracted_constraints: analysisResult.mentioned_constraints,
          key_themes: analysisResult.key_themes,
          sentiment: analysisResult.sentiment,
          overall_mood: analysisResult.overall_mood,
          player_context_id: requestBody.player_id, // If reflection is about a specific player
        },
        person_id: requestBody.coach_id, // Coach who made the reflection
        analysis: analysisResult.summary,
        recommendation: analysisResult.actionable_insights ? analysisResult.actionable_insights.join('; ') : null,
        created_at: new Date().toISOString(),
      });

    if (logError) {
      throw new Error(`Error saving to observation_logs: ${logError.message}`);
    }

    // 4. Update observation_intake to processed = true
    const { error: updateIntakeError } = await supabase
      .from('observation_intake')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', intakeId);

    if (updateIntakeError) {
      console.warn(`Failed to mark observation_intake ${intakeId} as processed: ${updateIntakeError.message}`);
      // Non-critical, continue
    }
    
    // 5. Optionally, create tags in observation_tags
    const allEntities: ExtractedEntityInfo[] = [
        ...analysisResult.mentioned_players,
        ...analysisResult.mentioned_skills,
        ...analysisResult.mentioned_constraints,
    ];

    for (const entity of allEntities) {
        if (entity.matched_id) {
            try {
                await supabase.from('observation_tags').insert({
                    id: uuidv4(),
                    observation_id: observationLogId, // Link to the observation_logs entry
                    tag_id: entity.matched_id,
                    tag_name: entity.name,
                    relevance_score: Math.round(entity.confidence * 100),
                    reason: `Mentioned in ${entryType}: ${entity.type}`,
                    created_at: new Date().toISOString(),
                });
            } catch (tagError: any) {
                console.warn(`Failed to link ${entity.type} tag "${entity.name}": ${tagError.message}`);
            }
        }
    }


    await logAgentEvent({
      event_type: 'log_reflection_success',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id || null,
      group_id: requestBody.group_id || null,
      agent_id: 'log-reflection-api',
      details: { request_id: operationId, observation_log_id: observationLogId, intake_id: intakeId, analysis_summary: analysisResult.summary },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Reflection logged and analyzed successfully.',
      observation_log_id: observationLogId,
      intake_id: intakeId,
      analysis: analysisResult,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in log-reflection API (Operation ID: ${operationId}):`, error.message);
    // Attempt to get request body for logging, even if JSON parsing failed earlier
    let rawRequestBody = 'Could not retrieve request body';
    try {
        rawRequestBody = await req.text();
    } catch (_) { /* ignore */ }

    await logAgentEvent({
      event_type: 'log_reflection_error',
      coach_id: 'unknown', // requestBody might be undefined here
      session_id: null,
      group_id: null,
      agent_id: 'log-reflection-api',
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

async function analyzeReflectionText(
  reflectionText: string,
  sessionId: string | undefined,
  supabase: SupabaseClient
): Promise<ReflectionAnalysis> {
  let sessionContext = '';
  if (sessionId) {
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('title, session_date, overall_theme_tags, planned_attendance')
      .eq('id', sessionId)
      .single();
    if (!sessionError && sessionData) {
      const attendanceCount = Array.isArray(sessionData.planned_attendance) ? sessionData.planned_attendance.length : 'N/A';
      sessionContext = `
Context for this reflection (Session ID: ${sessionId}):
- Session Title/Date: ${sessionData.title || 'Practice'} on ${sessionData.session_date}
- Key Themes: ${sessionData.overall_theme_tags ? sessionData.overall_theme_tags.join(', ') : 'None'}
- Players Present: ${attendanceCount}
`;
    }
  }

  const systemMessage = `You are an expert basketball coaching analyst. Analyze the provided coach's reflection or session notes.
Extract the following information and respond ONLY with a valid JSON object. Do NOT include any conversational text or markdown.
Your entire response must be a single JSON object.

JSON Structure:
{
  "summary": "A concise summary of the reflection (2-3 sentences).",
  "key_themes": ["Theme 1", "Theme 2", ...],
  "mentioned_players": [{"name": "Player Name", "type": "player", "confidence": 0.95}, ...],
  "mentioned_skills": [{"name": "Skill Name", "type": "skill", "confidence": 0.9}, ...],
  "mentioned_constraints": [{"name": "Constraint Name", "type": "constraint", "confidence": 0.85}, ...],
  "sentiment": "positive | negative | neutral (overall sentiment of the reflection)",
  "actionable_insights": ["Insight 1", "Insight 2", ... (any actionable takeaways or next steps implied)],
  "overall_mood": "e.g., focused, frustrated, optimistic, reflective (coach's perceived mood)"
}

Guidelines:
- If players are mentioned, list their names. If multiple players, list all.
- If specific basketball skills (e.g., "shooting form", "pick and roll defense", "spacing") are discussed, list them.
- If constraints (e.g., "limited space", "time pressure", "defensive pressure") are mentioned, list them.
- Confidence score should be between 0.0 and 1.0.
- If a piece of information is not present, use an empty array [] or null where appropriate.
- The summary should capture the essence of the reflection.
- Actionable insights should be specific and forward-looking if possible.
- Be objective in your analysis.
`;

  const userMessage = `Coach's Reflection/Session Note:
"${reflectionText}"
${sessionContext}
Please provide your analysis in the specified JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125', // Or a more advanced model if available
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const analysis = JSON.parse(content) as ReflectionAnalysis;

    // Ensure all arrays are initialized if missing from OpenAI response
    analysis.key_themes = analysis.key_themes || [];
    analysis.mentioned_players = analysis.mentioned_players || [];
    analysis.mentioned_skills = analysis.mentioned_skills || [];
    analysis.mentioned_constraints = analysis.mentioned_constraints || [];
    analysis.actionable_insights = analysis.actionable_insights || [];
    analysis.sentiment = analysis.sentiment || 'neutral';
    analysis.summary = analysis.summary || "Summary not generated.";

    // Attempt to match extracted entities to existing DB records
    analysis.mentioned_players = await matchEntities(analysis.mentioned_players, 'person', ['display_name', 'first_name', 'last_name', 'aliases'], supabase);
    analysis.mentioned_skills = await matchEntities(analysis.mentioned_skills, 'tag', ['name', 'tag_name', 'synonyms'], supabase, "tag_type = 'skill'");
    analysis.mentioned_constraints = await matchEntities(analysis.mentioned_constraints, 'tag', ['name', 'tag_name', 'synonyms'], supabase, "tag_type = 'constraint'");


    return analysis;
  } catch (error: any) {
    console.error('Error analyzing reflection with OpenAI:', error.message);
    // Return a default/error structure if OpenAI fails
    return {
      summary: 'Failed to analyze reflection text.',
      key_themes: [],
      mentioned_players: [],
      mentioned_skills: [],
      mentioned_constraints: [],
      sentiment: 'neutral',
      actionable_insights: [],
      overall_mood: 'unknown',
    };
  }
}

async function matchEntities(
  entities: ExtractedEntityInfo[],
  tableName: 'person' | 'tag',
  searchColumns: string[],
  supabase: SupabaseClient,
  additionalFilter?: string
): Promise<ExtractedEntityInfo[]> {
  if (!entities || entities.length === 0) return [];

  const matchedEntities = [...entities];

  for (let i = 0; i < matchedEntities.length; i++) {
    const entity = matchedEntities[i];
    if (!entity.name || typeof entity.name !== 'string' || entity.name.trim() === '') {
        console.warn('Skipping entity with invalid name:', entity);
        continue;
    }
    
    const orQuery = searchColumns.map(col => `${col}.ilike.%${entity.name.trim()}%`).join(',');
    let query = supabase.from(tableName).select('id, name, tag_name, display_name, synonyms').or(orQuery);
    if (additionalFilter) {
        query = query.filter(additionalFilter.split('=')[0].trim(), 'eq', additionalFilter.split('=')[1].trim().replace(/'/g, ''));
    }
    query = query.limit(1); // Get the best match

    const { data, error } = await query;

    if (error) {
      console.warn(`Error matching entity "${entity.name}" in table "${tableName}": ${error.message}`);
    } else if (data && data.length > 0) {
      matchedEntities[i].matched_id = data[0].id;
      // Potentially adjust confidence based on match quality, but for now, keep OpenAI's confidence.
    } else {
      // If not found, and it's a tag, suggest it
      if (tableName === 'tag' && (entity.type === 'skill' || entity.type === 'constraint')) {
        try {
          await supabase.from('tag_suggestions').insert({
            suggested_tag: entity.name.trim(),
            proposed_type: entity.type, // 'skill' or 'constraint'
            source_table: 'observation_logs', // Or 'reflection_analysis'
            reviewed: false,
            created_at: new Date().toISOString(),
          });
        } catch (suggestionError: any) {
          console.warn(`Failed to log tag suggestion for "${entity.name}": ${suggestionError.message}`);
        }
      } else if (tableName === 'person' && entity.type === 'player') {
         try {
          await supabase.from('flagged_names').insert({
            flagged_name: entity.name.trim(),
            observation_text: 'From reflection analysis', // Context
            flagged_at: new Date().toISOString(),
            resolution_status: 'unmatched',
          });
         } catch (flaggedNameError: any) {
            console.warn(`Failed to log flagged name for "${entity.name}": ${flaggedNameError.message}`);
         }
      }
    }
  }
  return matchedEntities;
}


// Helper function to log agent events
async function logAgentEvent({
  event_type,
  coach_id,
  player_id,
  session_id,
  group_id,
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
      details: { ...details, coach_id_logged: coach_id }, // Ensure coach_id is in details
      status,
    };

    if (player_id) logPayload.player_id = player_id;
    if (session_id) logPayload.details.session_id = session_id;
    if (group_id) logPayload.team_id = group_id; // team_id in agent_events stores group_id

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}):`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}):`, e.message);
  }
}
