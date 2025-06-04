import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Initialize Supabase clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

let usingServiceRole = true;
let serviceKeyWarningLogged = false;

// Helper function to get the appropriate Supabase client with fallback
async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!usingServiceRole) {
    return supabaseAnon;
  }
  try {
    // Test service role key with a lightweight query
    const { error } = await supabaseService.from('person').select('id', { count: 'exact', head: true }).limit(1);
    if (error) {
      if (!serviceKeyWarningLogged) {
        console.warn(`⚠️ Service role key failed for log-observation-simple: ${error.message}. Falling back to anon key.`);
        console.warn('⚠️ Some operations may be limited. Please update your service role key in .env.local');
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for log-observation-simple: ${e.message}. Falling back to anon key.`);
      console.warn('⚠️ Some operations may be limited. Please update your service role key in .env.local');
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface RequestBody {
  observation: string;
  coach_id: string;
  session_id?: string;
  player_id?: string;
  group_id?: string; // For team/group context if available
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();

    if (!body.observation || !body.coach_id) {
      return NextResponse.json(
        { success: false, error: 'observation and coach_id are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();
    const observationIntakeId = uuidv4();

    await logAgentEvent({
      event_type: 'log_observation_simple_request',
      coach_id: body.coach_id,
      player_id: body.player_id || null,
      session_id: body.session_id || null,
      group_id: body.group_id || null,
      agent_id: 'log-observation-simple-api',
      details: {
        request: body,
        observation_intake_id: observationIntakeId,
      },
      status: 'started',
    });

    const { data, error: dbError } = await supabase
      .from('observation_intake')
      .insert({
        id: observationIntakeId,
        raw_note: body.observation,
        coach_id: body.coach_id,
        processed: false,
        created_at: new Date().toISOString(),
        // session_id and player_id are not part of observation_intake schema based on provided context
        // If they were, they would be added here:
        // session_id: body.session_id,
        // player_id: body.player_id,
      })
      .select('id')
      .single();

    if (dbError) {
      await logAgentEvent({
        event_type: 'log_observation_simple_error',
        coach_id: body.coach_id,
        player_id: body.player_id || null,
        session_id: body.session_id || null,
        group_id: body.group_id || null,
        agent_id: 'log-observation-simple-api',
        details: { error: dbError.message, request: body },
        status: 'error',
      });
      throw new Error(`Error saving observation to intake: ${dbError.message}`);
    }

    await logAgentEvent({
      event_type: 'log_observation_simple_success',
      coach_id: body.coach_id,
      player_id: body.player_id || null,
      session_id: body.session_id || null,
      group_id: body.group_id || null,
      agent_id: 'log-observation-simple-api',
      details: { observation_intake_id: data?.id, request: body },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Observation logged successfully to intake.',
      observation_intake_id: data?.id,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error('Error in log-observation-simple API:', error.message);
    const requestBody = await req.text(); // Get raw body for logging if JSON parsing failed
    
    await logAgentEvent({
        event_type: 'log_observation_simple_error',
        coach_id: 'unknown', // coach_id might not be available if body parsing failed
        player_id: null,
        session_id: null,
        group_id: null,
        agent_id: 'log-observation-simple-api',
        details: { error: error.message, raw_request: requestBody },
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
  player_id: string | null;
  session_id: string | null;
  group_id: string | null;
  agent_id: string;
  details: any;
  status: 'started' | 'completed' | 'error';
}) {
  try {
    // Use the anon client for logging to ensure it always works,
    // especially if the service key has issues or RLS prevents writes.
    // Agent events are typically non-critical for the main flow but important for audit.
    const loggingSupabase = supabaseAnon; // Explicitly use anon for logging reliability
    
    const logDetails = { ...details };
    if (session_id) {
      logDetails.session_id = session_id;
    }

    const { error } = await loggingSupabase
      .from('agent_events')
      .insert({
        id: uuidv4(),
        created_at: new Date().toISOString(),
        event_type,
        player_id, // This is the person_id of the player if relevant
        team_id: group_id, // team_id column in agent_events will store group_id
        agent_id, // Identifier for this API or system component
        details: logDetails,
        status,
        // person_uid in agent_events could store coach_id if schema matches
        // For now, coach_id is part of details if not a direct column
      });

    if (error) {
      console.error(`Error logging agent event (${event_type}):`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}):`, e.message);
  }
}
