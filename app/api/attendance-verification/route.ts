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
        console.warn(`⚠️ Service role key failed for attendance-verification: ${error.message}. Falling back to anon key.`);
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for attendance-verification: ${e.message}. Falling back to anon key.`);
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface RequestBody {
  reflection_text: string;
  group_id: string; // Team ID
  coach_id: string;
  session_id?: string; // Optional session context
}

interface RosterPlayer {
  id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  aliases?: string[] | null;
}

interface ExtractedPlayerMention {
  name_mentioned: string; // Name as extracted by AI
  confidence?: number;    // AI's confidence in this extraction
}

interface MissingPlayerPrompt {
  player_id: string;
  player_name: string; // display_name of the player
  prompt_type: 'absent_check' | 'add_confirmation';
  suggested_prompt: string;
}

interface VerificationResult {
  all_players_mentioned: boolean;
  missing_players_prompts: MissingPlayerPrompt[];
  mentioned_raw_names: string[]; // Names as extracted by AI
  roster_size: number;
  mentioned_count: number; // Count of distinct roster players identified
}

export async function POST(req: NextRequest) {
  const operationId = uuidv4();
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.reflection_text || !requestBody.group_id || !requestBody.coach_id) {
      return NextResponse.json(
        { success: false, error: 'reflection_text, group_id, and coach_id are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    await logAgentEvent({
      event_type: 'attendance_verification_request',
      coach_id: requestBody.coach_id,
      group_id: requestBody.group_id,
      session_id: requestBody.session_id || null,
      agent_id: 'attendance-verification-api',
      details: { request_id: operationId, text_length: requestBody.reflection_text.length },
      status: 'started',
    });

    // 1. Fetch Team Roster
    const { data: rosterData, error: rosterError } = await supabase
      .from('person_group')
      .select(`
        person (id, display_name, first_name, last_name, aliases)
      `)
      .eq('group_id', requestBody.group_id)
      .eq('role', 'player'); // Assuming 'player' role in person_group

    if (rosterError) {
      throw new Error(`Error fetching team roster: ${rosterError.message}`);
    }
    
    const teamRoster: RosterPlayer[] = rosterData?.map((pg: any) => pg.person).filter(p => p) || [];

    if (teamRoster.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No players found in the specified group/team.', verification_result: { all_players_mentioned: true, missing_players_prompts: [], mentioned_raw_names: [], roster_size: 0, mentioned_count: 0 } },
        { status: 200 }
      );
    }

    // 2. Extract Player Names from Reflection Text using OpenAI
    const rosterNamesForPrompt = teamRoster.map(p => {
        const names = [p.display_name];
        if (p.first_name) names.push(p.first_name);
        if (p.last_name) names.push(p.last_name);
        if (p.aliases) names.push(...p.aliases);
        return Array.from(new Set(names.filter(n => n))).join(', '); // Unique, non-empty names
    }).join('; ');


    const aiPrompt = `Given the following reflection text from a basketball coach, identify all player names mentioned.
The team roster includes: ${rosterNamesForPrompt}.
Reflection text: "${requestBody.reflection_text}"
Respond ONLY with a JSON array of objects, where each object has a "name_mentioned" field containing the player name exactly as it appears in the text, and an optional "confidence" field (0.0-1.0).
Example: [{"name_mentioned": "John Doe", "confidence": 0.95}, {"name_mentioned": "Smith"}]
If no player names are clearly identifiable, return an empty array. Do not add any explanations.`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      messages: [
        { role: 'system', content: "You are an assistant that extracts player names from text and provides JSON output." },
        { role: 'user', content: aiPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }, // Expecting a root JSON object containing the array
    });

    let extractedMentions: ExtractedPlayerMention[] = [];
    try {
      const content = aiResponse.choices[0].message.content || '{}';
      // Assuming OpenAI might wrap the array in a root object, e.g., {"players": [...]} or return array directly
      const parsedJson = JSON.parse(content);
      if (Array.isArray(parsedJson)) {
        extractedMentions = parsedJson;
      } else if (parsedJson.players && Array.isArray(parsedJson.players)) { // Common pattern for AI to wrap in a key
        extractedMentions = parsedJson.players;
      } else {
         console.warn("OpenAI response was not an array or expected object, attempting to find array in values:", parsedJson);
         // Try to find an array if it's nested under some other key
         const arrayValue = Object.values(parsedJson).find(v => Array.isArray(v));
         if (arrayValue) extractedMentions = arrayValue as ExtractedPlayerMention[];
      }
    } catch (parseError: any) {
      console.error('Error parsing OpenAI response for player names:', parseError.message, aiResponse.choices[0].message.content);
      // Continue with empty mentions if parsing fails, or throw error
    }
    
    const mentionedRawNames = extractedMentions.map(m => m.name_mentioned);

    // 3. Compare Mentioned Players with Roster
    const mentionedPlayerIds = new Set<string>();
    const normalizedMentionedNames = mentionedRawNames.map(name => name.toLowerCase().trim());

    teamRoster.forEach(player => {
      const namesToMatch = [
        player.display_name.toLowerCase().trim(),
        player.first_name?.toLowerCase().trim(),
        player.last_name?.toLowerCase().trim(),
        ...(player.aliases?.map(a => a.toLowerCase().trim()) || [])
      ].filter(name => name);

      if (namesToMatch.some(name => normalizedMentionedNames.some(mentionedName => mentionedName.includes(name) || name.includes(mentionedName)))) {
        mentionedPlayerIds.add(player.id);
      }
    });

    // 4. Generate Prompts for Missing Players
    const missingPlayersPrompts: MissingPlayerPrompt[] = [];
    teamRoster.forEach(player => {
      if (!mentionedPlayerIds.has(player.id)) {
        missingPlayersPrompts.push({
          player_id: player.id,
          player_name: player.display_name,
          prompt_type: 'absent_check',
          suggested_prompt: `Was ${player.display_name} absent today?`,
        });
        missingPlayersPrompts.push({
          player_id: player.id,
          player_name: player.display_name,
          prompt_type: 'add_confirmation',
          suggested_prompt: `Did you want to add a note about ${player.display_name}?`,
        });
      }
    });

    const verificationResult: VerificationResult = {
      all_players_mentioned: missingPlayersPrompts.length === 0,
      missing_players_prompts,
      mentioned_raw_names: mentionedRawNames,
      roster_size: teamRoster.length,
      mentioned_count: mentionedPlayerIds.size,
    };

    await logAgentEvent({
      event_type: 'attendance_verification_success',
      coach_id: requestBody.coach_id,
      group_id: requestBody.group_id,
      session_id: requestBody.session_id || null,
      agent_id: 'attendance-verification-api',
      details: { request_id: operationId, result: verificationResult },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: verificationResult.all_players_mentioned ? 'All roster players seem to be mentioned or accounted for.' : 'Some players may be missing from the reflection.',
      verification_result: verificationResult,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in attendance-verification API (Operation ID: ${operationId}):`, error.message, error.stack);
    let rawRequestBody = 'Could not retrieve request body';
    try {
        rawRequestBody = await req.text();
    } catch (_) { /* ignore */ }

    await logAgentEvent({
      event_type: 'attendance_verification_error',
      coach_id: (requestBody! && requestBody!.coach_id) || 'unknown',
      group_id: (requestBody! && requestBody!.group_id) || null,
      session_id: (requestBody! && requestBody!.session_id) || null,
      agent_id: 'attendance-verification-api',
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
    const loggingSupabase = supabaseAnon; // Use anon client for robust logging
    
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
    if (group_id) logPayload.team_id = group_id; // team_id in agent_events stores group_id

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}) for attendance-verification:`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}) for attendance-verification:`, e.message);
  }
}
