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

interface AttendanceRecordInput {
  person_id: string;
  present: boolean;
  note?: string;
}

interface RequestBody {
  session_id: string;
  coach_id: string; // For logging purposes
  attendance_data: AttendanceRecordInput[];
  group_id?: string; // Optional group context for logging
}

export async function POST(req: NextRequest) {
  const operationId = uuidv4(); // For tracking this specific API call
  let requestBody: RequestBody;

  try {
    requestBody = await req.json();

    if (!requestBody.session_id || !requestBody.coach_id || !requestBody.attendance_data || !Array.isArray(requestBody.attendance_data)) {
      return NextResponse.json(
        { success: false, error: 'session_id, coach_id, and attendance_data (array) are required' },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseClient();

    await logAgentEvent({
      event_type: 'attendance_log_request',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      group_id: requestBody.group_id || null,
      agent_id: 'attendance-log-api',
      details: {
        request_id: operationId,
        request_body_summary: {
          session_id: requestBody.session_id,
          coach_id: requestBody.coach_id,
          num_records: requestBody.attendance_data.length,
        },
      },
      status: 'started',
    });

    // Verify session exists
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('id')
      .eq('id', requestBody.session_id)
      .single();

    if (sessionError || !sessionData) {
      await logAgentEvent({
        event_type: 'attendance_log_error',
        coach_id: requestBody.coach_id,
        session_id: requestBody.session_id,
        group_id: requestBody.group_id || null,
        agent_id: 'attendance-log-api',
        details: { request_id: operationId, error: `Session not found: ${requestBody.session_id}`, request_body: requestBody },
        status: 'error',
      });
      return NextResponse.json(
        { success: false, error: `Session not found: ${requestBody.session_id}` },
        { status: 404 }
      );
    }

    const upsertData = await Promise.all(requestBody.attendance_data.map(async (record) => {
      if (!record.person_id) {
        console.warn('Skipping attendance record due to missing person_id:', record);
        return { ...record, error: 'Missing person_id', db_status: 'skipped' };
      }

      // Verify person_id exists
      const { data: personExists, error: personCheckError } = await supabase
        .from('person')
        .select('id')
        .eq('id', record.person_id)
        .maybeSingle(); // Use maybeSingle to handle null if not found

      if (personCheckError) {
         console.error(`DB error checking person ${record.person_id}: ${personCheckError.message}`);
         return { ...record, error: `DB error checking person: ${personCheckError.message}`, db_status: 'error' };
      }
      if (!personExists) {
        console.warn(`Person with ID ${record.person_id} not found. Skipping attendance record.`);
        return { ...record, error: `Person ID ${record.person_id} not found`, db_status: 'skipped_person_not_found' };
      }
      
      return {
        id: uuidv4(), // Generate new UUID for each record, or let DB handle if it's a default
        session_id: requestBody.session_id,
        person_id: record.person_id,
        present: record.present,
        status: record.present ? 'present' : 'absent',
        note: record.note || null,
        // created_at: new Date().toISOString(), // Supabase can handle this with DEFAULT NOW()
        updated_at: new Date().toISOString(), // Always set updated_at
      };
    }));
    
    const validUpsertData = upsertData.filter(d => !d.error);
    const recordsWithErrors = upsertData.filter(d => d.error);

    let dbUpsertResults = { data: null as any[] | null, error: null as any | null };
    if (validUpsertData.length > 0) {
        dbUpsertResults = await supabase
        .from('attendance')
        .upsert(validUpsertData, {
          onConflict: 'session_id, person_id',
        })
        .select();
    }


    let present_count = 0;
    let absent_count = 0;
    
    if (dbUpsertResults.data) {
        dbUpsertResults.data.forEach(upsertedRecord => {
            if (upsertedRecord.present) {
                present_count++;
            } else {
                absent_count++;
            }
        });
    }
    // Add counts from records that had errors but were valid enough to determine presence
    recordsWithErrors.forEach(errRecord => {
        if (errRecord.present === true) present_count++;
        else if (errRecord.present === false) absent_count++;
    });


    const finalErrors = recordsWithErrors.map(r => ({ person_id: r.person_id, error: r.error }));
    if (dbUpsertResults.error) {
        finalErrors.push({person_id: null, error: `Batch DB Error: ${dbUpsertResults.error.message}`});
    }
    
    const total_processed_count = validUpsertData.length; // Number of records attempted in DB operation
    const successful_upserts = dbUpsertResults.data?.length || 0;


    // Update session table with actual present player IDs
    const presentPlayerIds = validUpsertData
        .filter(record => record.present && dbUpsertResults.data?.some(dbRec => dbRec.person_id === record.person_id && dbRec.session_id === record.session_id))
        .map(record => record.person_id);

    const { error: sessionUpdateError } = await supabase
        .from('session')
        .update({ 
            planned_attendance: presentPlayerIds, // Assuming planned_attendance stores array of present IDs
            last_updated: new Date().toISOString() 
        })
        .eq('id', requestBody.session_id);

    if (sessionUpdateError) {
        console.warn(`Failed to update session ${requestBody.session_id} with present player IDs: ${sessionUpdateError.message}`);
        // Non-critical, so don't fail the whole request
    }


    if (finalErrors.length > 0) {
      await logAgentEvent({
        event_type: 'attendance_log_partial_error',
        coach_id: requestBody.coach_id,
        session_id: requestBody.session_id,
        group_id: requestBody.group_id || null,
        agent_id: 'attendance-log-api',
        details: { request_id: operationId, errors: finalErrors, successful_upserts, total_attempted: requestBody.attendance_data.length },
        status: 'error',
      });
      return NextResponse.json({
        success: successful_upserts > 0, 
        message: `Attendance logged with ${finalErrors.length} errors out of ${requestBody.attendance_data.length} records. Successful upserts: ${successful_upserts}.`,
        session_id: requestBody.session_id,
        present_count,
        absent_count,
        successful_upserts,
        total_attempted: requestBody.attendance_data.length,
        errors: finalErrors,
        using_service_role: usingServiceRole,
      });
    }

    await logAgentEvent({
      event_type: 'attendance_log_success',
      coach_id: requestBody.coach_id,
      session_id: requestBody.session_id,
      group_id: requestBody.group_id || null,
      agent_id: 'attendance-log-api',
      details: { request_id: operationId, present_count, absent_count, successful_upserts },
      status: 'completed',
    });

    return NextResponse.json({
      success: true,
      message: 'Attendance logged successfully.',
      session_id: requestBody.session_id,
      present_count,
      absent_count,
      successful_upserts,
      total_attempted: requestBody.attendance_data.length,
      using_service_role: usingServiceRole,
    });

  } catch (error: any) {
    console.error(`Error in attendance-log API (Operation ID: ${operationId}):`, error.message, error.stack);
    let rawRequestBody = 'Could not retrieve request body';
    try {
        rawRequestBody = await req.text();
    } catch (_) { /* ignore */ }

    await logAgentEvent({
      event_type: 'attendance_log_error',
      coach_id: (requestBody! && requestBody!.coach_id) || 'unknown',
      session_id: (requestBody! && requestBody!.session_id) || null,
      group_id: (requestBody! && requestBody!.group_id) || null,
      agent_id: 'attendance-log-api',
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
    if (group_id) logPayload.team_id = group_id; 

    const { error } = await loggingSupabase.from('agent_events').insert(logPayload);

    if (error) {
      console.error(`Error logging agent event (${event_type}) for attendance-log:`, error.message);
    }
  } catch (e: any) {
    console.error(`Exception in logAgentEvent (${event_type}) for attendance-log:`, e.message);
  }
}
