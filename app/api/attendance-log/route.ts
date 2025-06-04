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
        console.warn(`⚠️ Service role key failed for attendance-log: ${error.message}. Falling back to anon key.`);
        console.warn('⚠️ Some operations may be limited. Please update your service role key in .env.local');
        serviceKeyWarningLogged = true;
      }
      usingServiceRole = false;
      return supabaseAnon;
    }
    return supabaseService;
  } catch (e: any) {
    if (!serviceKeyWarningLogged) {
      console.warn(`⚠️ Service role key exception for attendance-log: ${e.message}. Falling back to anon key.`);
      console.warn('⚠️ Some operations may be limited. Please update your service role key in .env.local');
      serviceKeyWarningLogged = true;
    }
    usingServiceRole = false;
    return supabaseAnon;
  }
}

interface AttendanceRecord {
  person_id: string;
  present: boolean;
  note?: string;
}

interface RequestBody {
  session_id: string;
  coach_id: string; // For logging purposes
  attendance_data: AttendanceRecord[];
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();

    if (!body.session_id || !body.coach_id || !body.attendance_data || !Array.isArray(body.attendance_data)) {
      return NextResponse.json(
        { success: false, error: 'session_id, coach_id, and attendance_data (array) are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();
    const operationId = uuidv4(); // For tracking this specific API call

    await logAgentEvent({
      event_type: 'attendance_log_request',
      coach_id: body.coach_id,
      session_id: body.session_id,
      agent_id: 'attendance-log-api',
      details: {
        request_id: operationId,
        request_body_summary: {
          session_id: body.session_id,
          coach_id: body.coach_id,
          num_records: body.attendance_data.length,
        },
      },
      status: 'started',
    });

    // Verify session exists
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('id')
      .eq('id', body.session_id)
      .single();

    if (sessionError || !sessionData) {
      await logAgentEvent({
        event_type: 'attendance_log_error',
        coach_id: body.coach_id,
        session_id: body.session_id,
        agent_id: 'attendance-log-api',
        details: { request_id: operationId, error: `Session not found: ${body.session_id}`, request_body: body },
        status: 'error',
      });
      return NextResponse.json(
        { success: false, error: `Session not found: ${body.session_id}` },
        { status: 404 }
      );
    }

    const upsertPromises = body.attendance_data.map(async (record) => {
      if (!record.person_id) {
        console.warn('Skipping attendance record due to missing person_id:', record);
        return { person_id: null, status: 'skipped', error: 'Missing person_id' };
      }

      // Optional: Verify person_id exists
      const { data: personExists, error: personCheckError } = await supabase
        .from('person')
        .select('id')
        .eq('id', record.person_id)
        .single();

      if (personCheckError || !personExists) {
        console.warn(`Person with ID ${record.person_id} not found. Skipping attendance record.`);
        return { person_id: record.person_id, status: 'skipped', error: `Person ID ${record.person_id} not found` };
      }
      
      const attendanceRecordId = uuidv4();
      return supabase
        .from('attendance')
        .upsert(
          {
            id: attendanceRecordId, // Provide an ID for new records
            session_id: body.session_id,
            person_id: record.person_id,
            present: record.present,
            note: record.note || null,
            status: record.present ? 'present' : 'absent', // Example status
            created_at: new Date().toISOString(), // Set on insert
            updated_at: new Date().toISOString(), // Set on insert/update
          },
          {
            onConflict: 'session_id, person_id', // Specify conflict target for upsert
            // ignoreDuplicates: false, // Default is false, ensures update occurs
          }
        )
        .select(); // Select the upserted record
    });

    const results = await Promise.allSettled(upsertPromises);

    let present_count = 0;
    let absent_count = 0;
    const errors: { person_id: string | null; error: string }[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        // @ts-ignore
        if (result.value.status === 'skipped') {
            // @ts-ignore
            errors.push({ person_id: result.value.person_id, error: result.value.error });
        // @ts-ignore
        } else if (result.value.error) {
            // @ts-ignore
            errors.push({ person_id: body.attendance_data[index].person_id, error: result.value.error.message });
        } else {
          if (body.attendance_data[index].present) {
            present_count++;
          } else {
            absent_count++;
          }
        }
      } else {
        errors.push({ person_id: body.attendance_data[index].person_id, error: result.reason.message });
      }
    });
    
    const total_logged_count = present_count + absent_count;

    // Optionally, update session table with actual attendance count or list of present players
    // For example, update `planned_attendance` JSONB with actual present player IDs
    const presentPlayerIds = body.attendance_data
        .filter(record => record.present && results.find(r => r.status === 'fulfilled' && (r.value as any)?.data?.find((d: any) => d.person_id === record.person_id)))
        .map(record => record.person_id);

    const { error: sessionUpdateError } = await supabase
        .from('session')
        .update({ 
            // Example: Storing actual present player IDs in planned_attendance.
            // Adjust if you have a dedicated field like `actual_attendance_count` or `actual_player_ids`.
            planned_attendance: presentPlayerIds, 
            last_updated: new Date().toISOString() 
        })
        .eq('id', body.session_id);

    if (sessionUpdateError) {
        console.warn(`Failed to update session ${body.session_id} with attendance details: ${sessionUpdateError.message}`);
        // Non-critical, so don't fail the whole request
    }


    if (errors.length > 0) {
      await logAgentEvent({
        event_type: 'attendance_log_partial_error',
        coach_id: body.coach_id,
        session_id: body.session_id,
        agent_id: 'attendance-log-api',
        details: { request_id: operationId, errors, present_count, absent_count, total_logged_count },
        status: 'error',
      });
      // Return a success response but include errors for partial failures
      return NextResponse.json({
        success: true, // Or false if any error is critical
        message: `Attendance logged with ${errors.length} errors.`,
        session_id: body.session_id,
        present_count,
        absent_count,
        total_logged_count,
        errors,
        using_service_role: usingServiceRole,
      });
    }

    await logAgentEvent({
      event_type: 'attendance_log_success',
      coach_id: body.coach_id,
      session_id: body.session_id,
      agent_id: 'attendance-log-api',
      details: { request_id: operationId, present_count, absent_count, total_logged_count },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance logged successfully.',
      session_id: body.session_id,
      present_count,
      absent_count,
      total_logged_count,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error('Error in attendance-log API:', error.message);
    const requestBodyText = await req.text(); // Log raw body on error

    await logAgentEvent({
      event_type: 'attendance_log_error',
      coach_id: 'unknown', // coach_id might not be available if body parsing failed
      session_id: 'unknown',
      agent_id: 'attendance-log-api',
      details: { error: error.message, raw_request: requestBodyText },
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
      details: { ...details, coach_id }, // Ensure coach_id is in details if not a direct column
      status,
    };

    if (player_id) logPayload.player_id = player_id;
    if (session_id) logPayload.details.session_id = session_id; // Add session_id to details
    if (group_id) logPayload.team_id = group_id; // team_id in agent_events stores group_id

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}):`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}):`, e.message);
  }
}
