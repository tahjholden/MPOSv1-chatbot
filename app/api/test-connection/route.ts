import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase clients with both keys
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create two clients to test both keys
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      supabase_url: supabaseUrl,
      anon_key: {
        key_provided: !!supabaseAnonKey,
        key_length: supabaseAnonKey?.length || 0,
        connection_test: null as any,
        table_counts: {} as Record<string, number | null>,
        errors: [] as string[]
      },
      service_key: {
        key_provided: !!supabaseServiceKey,
        key_length: supabaseServiceKey?.length || 0,
        connection_test: null as any,
        table_counts: {} as Record<string, number | null>,
        errors: [] as string[]
      },
      overall_status: 'pending',
      tables_to_check: ['person', 'group', 'session', 'pdp', 'agent_events', 'observation_logs']
    };

    // Test anon key connection
    try {
      const { data: anonTest, error: anonError } = await supabaseAnon.from('person').select('count').limit(1);
      
      if (anonError) {
        results.anon_key.connection_test = false;
        results.anon_key.errors.push(`Anon key connection error: ${anonError.message}`);
      } else {
        results.anon_key.connection_test = true;
        
        // Try to count records in each table with anon key
        for (const table of results.tables_to_check) {
          try {
            const { count, error } = await supabaseAnon
              .from(table)
              .select('*', { count: 'exact', head: true });
              
            if (error) {
              results.anon_key.table_counts[table] = null;
              results.anon_key.errors.push(`Anon key - ${table} count error: ${error.message}`);
            } else {
              results.anon_key.table_counts[table] = count;
            }
          } catch (e: any) {
            results.anon_key.table_counts[table] = null;
            results.anon_key.errors.push(`Anon key - ${table} exception: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      results.anon_key.connection_test = false;
      results.anon_key.errors.push(`Anon key exception: ${e.message}`);
    }

    // Test service key connection
    try {
      const { data: serviceTest, error: serviceError } = await supabaseService.from('person').select('count').limit(1);
      
      if (serviceError) {
        results.service_key.connection_test = false;
        results.service_key.errors.push(`Service key connection error: ${serviceError.message}`);
      } else {
        results.service_key.connection_test = true;
        
        // Try to count records in each table with service key
        for (const table of results.tables_to_check) {
          try {
            const { count, error } = await supabaseService
              .from(table)
              .select('*', { count: 'exact', head: true });
              
            if (error) {
              results.service_key.table_counts[table] = null;
              results.service_key.errors.push(`Service key - ${table} count error: ${error.message}`);
            } else {
              results.service_key.table_counts[table] = count;
            }
          } catch (e: any) {
            results.service_key.table_counts[table] = null;
            results.service_key.errors.push(`Service key - ${table} exception: ${e.message}`);
          }
        }
      }
    } catch (e: any) {
      results.service_key.connection_test = false;
      results.service_key.errors.push(`Service key exception: ${e.message}`);
    }

    // Determine overall status
    if (results.anon_key.connection_test === true && results.service_key.connection_test === true) {
      results.overall_status = 'healthy';
    } else if (results.anon_key.connection_test === true) {
      results.overall_status = 'anon_only';
    } else if (results.service_key.connection_test === true) {
      results.overall_status = 'service_only';
    } else {
      results.overall_status = 'connection_failed';
    }

    // Add diagnostic information
    const diagnostics = {
      jwt_analysis: {
        anon_key: analyzeJWT(supabaseAnonKey),
        service_key: analyzeJWT(supabaseServiceKey)
      },
      recommendations: [] as string[]
    };

    // Add recommendations based on test results
    if (results.overall_status === 'connection_failed') {
      diagnostics.recommendations.push('Check that your Supabase URL is correct');
      diagnostics.recommendations.push('Verify both API keys in your Supabase dashboard');
      diagnostics.recommendations.push('Ensure your IP is not blocked by Supabase');
    } else if (results.overall_status === 'anon_only') {
      diagnostics.recommendations.push('Your service role key appears to be invalid - check the format in Supabase dashboard');
      diagnostics.recommendations.push('The service role key should be a single JWT token');
    } else if (results.overall_status === 'service_only') {
      diagnostics.recommendations.push('Your anon key appears to be invalid - check the format in Supabase dashboard');
    }

    // Check for malformed JWT tokens
    if (diagnostics.jwt_analysis.anon_key.parts !== 3) {
      diagnostics.recommendations.push('Your anon key does not appear to be a valid JWT (should have 3 parts separated by periods)');
    }
    if (diagnostics.jwt_analysis.service_key.parts !== 3) {
      diagnostics.recommendations.push('Your service key does not appear to be a valid JWT (should have 3 parts separated by periods)');
    }

    // Return the test results
    return NextResponse.json({
      success: results.overall_status !== 'connection_failed',
      message: `Supabase connection test: ${results.overall_status}`,
      results,
      diagnostics
    });
    
  } catch (error: any) {
    console.error('Error in test-connection API:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'An unknown error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Helper function to analyze JWT structure
function analyzeJWT(token: string) {
  if (!token) {
    return { valid: false, parts: 0, header: null, payload: null };
  }
  
  const parts = token.split('.');
  
  try {
    const header = parts[0] ? JSON.parse(atob(parts[0])) : null;
    const payload = parts[1] ? JSON.parse(atob(parts[1])) : null;
    
    return {
      valid: parts.length === 3,
      parts: parts.length,
      header,
      payload
    };
  } catch (e) {
    return {
      valid: false,
      parts: parts.length,
      header: null,
      payload: null,
      error: 'Failed to parse JWT'
    };
  }
}
