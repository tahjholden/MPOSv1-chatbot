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
        console.warn(`⚠️ Service role key failed for session-notes: ${error.message}. Falling back to anon key.`);
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for session-notes: ${e.message}. Falling back to anon key.`);
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

type NoteType = 'pre_session_plan' | 'during_session_observation' | 'post_session_summary' | 'general_session_note';

interface RequestBody {
  session_id: string;
  coach_id: string;
  note_text: string;
  note_type?: NoteType; // e.g., 'pre_session', 'mid_session', 'post_session'
  group_id?: string; // Optional: for team/group context
}

interface SessionNoteAnalysis {
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  energy_level_assessment?: 'high' | 'medium' | 'low' | 'mixed';
  player_engagement_assessment?: 'high' | 'medium' | 'low' | 'mixed';
  actionable_items?: string[]; // e.g., "Follow up with Player X", "Adjust drill Y for next session"
}

export async function POST(req: NextRequest) {
  const operationId = uuidv4();
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.session_id || !requestBody.coach_id || !requestBody.note_text) {
      return NextResponse.json(
        { success: false, error: 'session_id, coach_id, and note_text are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();
    const noteType = requestBody.note_type || 'general_session_note';

    await logAgentEvent({
      event_type: 'session_note_request',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      group_id: requestBody.group_id || null,
      agent_id: 'session-notes-api',
      details: { request_id: operationId, note_type: noteType, text_length: requestBody.note_text.length },
      status: 'started',
    });

    // 1. Verify Session exists
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('id, title, session_date, reflection_fields, session_notes, overall_theme_tags')
      .eq('id', requestBody.session_id)
      .single();

    if (sessionError || !sessionData) {
      throw new Error(`Session with ID ${requestBody.session_id} not found.`);
    }

    // 2. Analyze Note Text with OpenAI
    const analysisResult = await analyzeSessionNote(requestBody.note_text, sessionData, supabase);

    // 3. Update Session Table
    // Append to reflection_fields or update session_notes
    const existingReflectionFields = (sessionData.reflection_fields || {}) as Record<string, any>;
    let updatedSessionNotesText = sessionData.session_notes || '';

    // Create a log entry for the note
    const noteEntry = {
      timestamp: new Date().toISOString(),
      coach_id: requestBody.coach_id,
      note_type: noteType,
      text: requestBody.note_text,
      summary: analysisResult.summary,
      key_points: analysisResult.key_points,
      sentiment: analysisResult.sentiment,
    };

    // Initialize coach_session_notes_log if it doesn't exist
    if (!Array.isArray(existingReflectionFields.coach_session_notes_log)) {
      existingReflectionFields.coach_session_notes_log = [];
    }
    existingReflectionFields.coach_session_notes_log.push(noteEntry);

    // If it's a post-session summary, also update the main coach_post_session field
    if (noteType === 'post_session_summary') {
      existingReflectionFields.coach_post_session = requestBody.note_text; // Overwrite or append as needed
      // Optionally update the main session_notes field with the summary
      updatedSessionNotesText = `${updatedSessionNotesText}\n\nPost-Session Summary (${noteEntry.timestamp}):\n${analysisResult.summary}`.trim();
    } else {
        // For other note types, append to the main session_notes if it's a significant update
        if (analysisResult.summary) {
             updatedSessionNotesText = `${updatedSessionNotesText}\n\nNote (${noteType} - ${noteEntry.timestamp}):\n${analysisResult.summary}`.trim();
        }
    }
    
    // Update overall_theme_tags with new themes from analysis if any
    const currentThemes = new Set(sessionData.overall_theme_tags || []);
    (analysisResult.key_points || []).forEach(theme => currentThemes.add(theme));


    const { error: updateSessionError } = await supabase
      .from('session')
      .update({
        reflection_fields: existingReflectionFields,
        session_notes: updatedSessionNotesText, // Update the main notes field
        overall_theme_tags: Array.from(currentThemes),
        last_updated: new Date().toISOString(),
        status: 'updated_with_notes', // Example new status
      })
      .eq('id', requestBody.session_id);

    if (updateSessionError) {
      throw new Error(`Error updating session table: ${updateSessionError.message}`);
    }

    // 4. Create Observation Log Entry
    const observationLogId = uuidv4();
    const { error: logError } = await supabase
      .from('observation_logs')
      .insert({
        id: observationLogId,
        observation_id: requestBody.session_id, // Link to the session
        entry_type: `session_note:${noteType}`, // More specific entry type
        payload: {
          raw_text: requestBody.note_text,
          analysis: analysisResult,
          coach_id: requestBody.coach_id,
          // Link to the specific note entry within session.reflection_fields if needed
        },
        person_id: requestBody.coach_id, // Coach who made the note
        analysis: analysisResult.summary, // Main summary from analysis
        recommendation: analysisResult.actionable_items ? analysisResult.actionable_items.join('; ') : null,
        created_at: new Date().toISOString(),
      });

    if (logError) {
      throw new Error(`Error creating observation_logs entry: ${logError.message}`);
    }

    await logAgentEvent({
      event_type: 'session_note_success',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      group_id: requestBody.group_id || null,
      agent_id: 'session-notes-api',
      details: { request_id: operationId, observation_log_id: observationLogId, analysis_summary: analysisResult.summary },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Session note logged and analyzed successfully.',
      observation_log_id: observationLogId,
      session_id: requestBody.session_id,
      analysis: analysisResult,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in session-notes API (Operation ID: ${operationId}):`, error.message);
    let rawRequestBody = 'Could not retrieve request body';
    try {
        rawRequestBody = await req.text();
    } catch (_) { /* ignore */ }

    await logAgentEvent({
      event_type: 'session_note_error',
      coach_id: (requestBody! && requestBody!.coach_id) || 'unknown',
      session_id: (requestBody! && requestBody!.session_id) || null,
      group_id: (requestBody! && requestBody!.group_id) || null,
      agent_id: 'session-notes-api',
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

async function analyzeSessionNote(
  noteText: string,
  sessionContextData: any, // Pass session data for context
  supabase: SupabaseClient // Pass Supabase client if needed for more context fetching
): Promise<SessionNoteAnalysis> {
  const sessionContext = `
Session Context:
- Title: ${sessionContextData.title || 'N/A'}
- Date: ${sessionContextData.session_date || 'N/A'}
- Current Themes: ${(sessionContextData.overall_theme_tags || []).join(', ') || 'N/A'}
- Existing Notes Summary: ${sessionContextData.session_notes ? (sessionContextData.session_notes.substring(0,150) + '...') : 'N/A'}
`;

  const systemMessage = `You are an expert basketball coaching assistant. Analyze the provided coach's session note.
Extract key information and respond ONLY with a valid JSON object. Do NOT include any conversational text or markdown.
Your ENTIRE response must be a single JSON object.

JSON Structure:
{
  "summary": "A concise summary of the note (1-2 sentences).",
  "key_points": ["Key Point 1", "Key Point 2", ...],
  "sentiment": "positive | negative | neutral (overall sentiment of the note)",
  "energy_level_assessment": "high | medium | low | mixed | not_specified (based on note content)",
  "player_engagement_assessment": "high | medium | low | mixed | not_specified (based on note content)",
  "actionable_items": ["Action Item 1", "Action Item 2", ...]
}

Guidelines:
- Key points should capture the main topics or observations in the note.
- Assess energy and engagement if mentioned or strongly implied.
- Actionable items are specific tasks or follow-ups suggested by the note.
- If information is not present, use an empty array [] or "not_specified".
`;

  const userMessage = `Coach's Session Note:
"${noteText}"

${sessionContext}

Please provide your analysis in the specified JSON format.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const analysis = JSON.parse(content) as SessionNoteAnalysis;

    // Ensure all arrays are initialized
    analysis.key_points = analysis.key_points || [];
    analysis.actionable_items = analysis.actionable_items || [];
    analysis.sentiment = analysis.sentiment || 'neutral';
    analysis.energy_level_assessment = analysis.energy_level_assessment || 'not_specified';
    analysis.player_engagement_assessment = analysis.player_engagement_assessment || 'not_specified';
    analysis.summary = analysis.summary || "Summary not generated.";
    
    return analysis;
  } catch (error: any) {
    console.error('Error analyzing session note with OpenAI:', error.message);
    return {
      summary: 'Failed to analyze session note.',
      key_points: [],
      sentiment: 'neutral',
      energy_level_assessment: 'not_specified',
      player_engagement_assessment: 'not_specified',
      actionable_items: [],
    };
  }
}

// Helper function to log agent events
async function logAgentEvent({
  event_type,
  coach_id,
  player_id, // This can be null if event is not player-specific
  session_id,
  group_id,  // This can be null if event is not group-specific
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
    const loggingSupabase = supabaseAnon; // Use anon client for robust logging
    
    const logPayload: any = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      event_type,
      agent_id,
      details: { ...details, coach_id_logged: coach_id }, // Ensure coach_id is in details
      status,
    };

    if (player_id) logPayload.player_id = player_id;
    // Ensure session_id is part of details if not a direct column in agent_events
    // For this example, we'll add it to details.
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
