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

// TypeScript interfaces
interface RequestBody {
  observation: string;
  coach_id: string;
  session_id?: string;
  player_id?: string;
  observation_type?: string;
  tags?: string[];
}

interface ExtractedPlayerInfo {
  name: string;
  matched_id?: string;
  confidence: number;
}

interface ExtractedSkillInfo {
  name: string;
  matched_id?: string;
  confidence: number;
}

interface ExtractedConstraintInfo {
  name: string;
  matched_id?: string;
  confidence: number;
}

interface ObservationAnalysis {
  players: ExtractedPlayerInfo[];
  skills: ExtractedSkillInfo[];
  constraints: ExtractedConstraintInfo[];
  summary: string;
  recommendation?: string;
  advancement_level?: number;
  responsibility_tier?: number;
  collective_growth_phase?: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  is_team_observation: boolean;
}

// Main API route handler
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body: RequestBody = await req.json();
    
    // Validate required fields
    if (!body.observation || !body.coach_id) {
      return NextResponse.json(
        { error: 'observation and coach_id are required' },
        { status: 400 }
      );
    }

    // Get the appropriate Supabase client (with fallback)
    const supabase = await getSupabaseClient();

    // Generate observation ID
    const observationId = uuidv4();
    
    // Log API call
    await logAgentEvent({
      event_type: 'log_observation_request',
      player_id: body.player_id || null,
      session_id: body.session_id || null,
      agent_id: 'observation-api',
      details: {
        request: {
          ...body,
          observation_id: observationId,
        }
      },
      status: 'started'
    });

    // Verify coach exists
    const { data: coachData, error: coachError } = await supabase
      .from('person')
      .select('id, display_name')
      .eq('id', body.coach_id)
      .single();
      
    if (coachError) {
      console.warn(`Coach lookup warning: ${coachError.message}`);
      // Continue execution - not a critical error
    }
    
    // If session_id is provided, verify it exists
    if (body.session_id) {
      const { data: sessionData, error: sessionError } = await supabase
        .from('session')
        .select('id, title, session_date')
        .eq('id', body.session_id)
        .single();
        
      if (sessionError) {
        console.warn(`Session lookup warning: ${sessionError.message}`);
        // Continue execution - not a critical error
      }
    }
    
    // If player_id is provided, verify it exists
    if (body.player_id) {
      const { data: playerData, error: playerError } = await supabase
        .from('person')
        .select('id, display_name')
        .eq('id', body.player_id)
        .single();
        
      if (playerError) {
        console.warn(`Player lookup warning: ${playerError.message}`);
        // Continue execution - not a critical error
      }
    }

    // Process the observation with OpenAI
    const analysis = await analyzeObservation(body.observation, body.session_id);
    
    // Match player names to person records
    const matchedPlayers = await matchPlayerNames(analysis.players);
    
    // Match skills to skill tags
    const matchedSkills = await matchSkillTags(analysis.skills);
    
    // Match constraints to constraint tags
    const matchedConstraints = await matchConstraintTags(analysis.constraints);
    
    // Create observation record
    const { data: observationData, error: observationError } = await supabase
      .from('observation_logs')
      .insert({
        id: observationId,
        observation_id: body.player_id ? body.player_id : null,
        entry_type: body.observation_type || 'coach_observation',
        payload: {
          raw_observation: body.observation,
          matched_players: matchedPlayers,
          matched_skills: matchedSkills,
          matched_constraints: matchedConstraints,
          tags: body.tags || [],
          is_team_observation: analysis.is_team_observation
        },
        created_at: new Date().toISOString(),
        person_id: body.coach_id,
        analysis: analysis.summary,
        recommendation: analysis.recommendation || null,
        advancement_level: analysis.advancement_level || null,
        responsibility_tier: analysis.responsibility_tier || null,
        collective_growth_phase: analysis.collective_growth_phase || null
      })
      .select();
      
    if (observationError) {
      throw new Error(`Error creating observation: ${observationError.message}`);
    }
    
    // Create player-observation links for each matched player
    for (const player of matchedPlayers) {
      if (player.matched_id) {
        try {
          await supabase
            .from('observation_tags')
            .insert({
              id: uuidv4(),
              observation_id: observationId,
              tag_id: player.matched_id,
              tag_name: player.name,
              relevance_score: Math.round(player.confidence * 100),
              reason: 'Player mentioned in observation',
              created_at: new Date().toISOString()
            });
        } catch (error) {
          console.warn(`Error linking player ${player.name}: ${error}`);
          // Continue execution - not a critical error
        }
      }
    }
    
    // Create skill-observation links for each matched skill
    for (const skill of matchedSkills) {
      if (skill.matched_id) {
        try {
          await supabase
            .from('observation_tags')
            .insert({
              id: uuidv4(),
              observation_id: observationId,
              tag_id: skill.matched_id,
              tag_name: skill.name,
              relevance_score: Math.round(skill.confidence * 100),
              reason: 'Skill mentioned in observation',
              created_at: new Date().toISOString()
            });
        } catch (error) {
          console.warn(`Error linking skill ${skill.name}: ${error}`);
          // Continue execution - not a critical error
        }
      }
    }
    
    // Create constraint-observation links for each matched constraint
    for (const constraint of matchedConstraints) {
      if (constraint.matched_id) {
        try {
          await supabase
            .from('observation_tags')
            .insert({
              id: uuidv4(),
              observation_id: observationId,
              tag_id: constraint.matched_id,
              tag_name: constraint.name,
              relevance_score: Math.round(constraint.confidence * 100),
              reason: 'Constraint mentioned in observation',
              created_at: new Date().toISOString()
            });
        } catch (error) {
          console.warn(`Error linking constraint ${constraint.name}: ${error}`);
          // Continue execution - not a critical error
        }
      }
    }
    
    // Log success
    await logAgentEvent({
      event_type: 'log_observation_success',
      player_id: body.player_id || null,
      session_id: body.session_id || null,
      agent_id: 'observation-api',
      details: {
        observation_id: observationId,
        matched_players: matchedPlayers.length,
        matched_skills: matchedSkills.length,
        matched_constraints: matchedConstraints.length
      },
      status: 'completed'
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Observation logged successfully',
      observation_id: observationId,
      analysis: {
        summary: analysis.summary,
        recommendation: analysis.recommendation,
        matched_players: matchedPlayers,
        matched_skills: matchedSkills,
        matched_constraints: matchedConstraints,
        is_team_observation: analysis.is_team_observation,
        sentiment: analysis.sentiment
      }
    });
    
  } catch (error: any) {
    console.error('Error in log-observation API:', error);
    
    // Log error
    await logAgentEvent({
      event_type: 'log_observation_error',
      player_id: null,
      session_id: null,
      agent_id: 'observation-api',
      details: {
        error: error.message
      },
      status: 'error'
    });
    
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

// Helper function to analyze observation with OpenAI
async function analyzeObservation(observation: string, sessionId?: string): Promise<ObservationAnalysis> {
  // Get session context if available
  let sessionContext = '';
  if (sessionId) {
    const supabase = await getSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase
      .from('session')
      .select('title, session_date, overall_theme_tags')
      .eq('id', sessionId)
      .single();
      
    if (!sessionError && sessionData) {
      sessionContext = `
Session: ${sessionData.title || `Practice on ${sessionData.session_date}`}
Date: ${sessionData.session_date}
Themes: ${sessionData.overall_theme_tags ? sessionData.overall_theme_tags.join(', ') : 'None specified'}
`;
    }
  }
  
  // Prepare system message
  const systemMessage = `You are a basketball coaching assistant that analyzes observations from coaches. 
Your task is to extract key information from the coach's observation, including:
1. Player names mentioned
2. Basketball skills mentioned
3. Basketball constraints or limitations mentioned
4. A brief summary of the observation
5. A recommendation for improvement if applicable
6. Assessment of advancement level (1-10), responsibility tier (1-6), and collective growth phase (1-6) if enough information is provided
7. Sentiment analysis (positive, negative, or neutral)
8. Whether this is a team observation or individual player observation

Respond ONLY with a valid JSON object with the following structure:
{
  "players": [
    {"name": "player name", "confidence": 0.95}
  ],
  "skills": [
    {"name": "skill name", "confidence": 0.9}
  ],
  "constraints": [
    {"name": "constraint name", "confidence": 0.85}
  ],
  "summary": "Brief summary of the observation",
  "recommendation": "Recommendation for improvement if applicable",
  "advancement_level": 5,
  "responsibility_tier": 3,
  "collective_growth_phase": 4,
  "sentiment": "positive",
  "is_team_observation": false
}

Do not include any explanatory text, just the JSON object.`;

  // Prepare user message
  const userMessage = `Please analyze the following coach observation:

${observation}

${sessionContext ? `\nContext about the session:\n${sessionContext}` : ''}`;

  // Call OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo-0125',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  });
  
  // Parse response
  try {
    const content = response.choices[0].message.content || '{}';
    const analysis = JSON.parse(content) as ObservationAnalysis;
    
    // Ensure all required fields exist
    analysis.players = analysis.players || [];
    analysis.skills = analysis.skills || [];
    analysis.constraints = analysis.constraints || [];
    analysis.summary = analysis.summary || 'No summary provided';
    analysis.sentiment = analysis.sentiment || 'neutral';
    analysis.is_team_observation = analysis.is_team_observation ?? false;
    
    return analysis;
  } catch (error) {
    console.error('Error parsing OpenAI response:', error);
    throw new Error('Failed to analyze observation');
  }
}

// Helper function to match player names to person records
async function matchPlayerNames(players: ExtractedPlayerInfo[]): Promise<ExtractedPlayerInfo[]> {
  if (players.length === 0) return [];
  
  const supabase = await getSupabaseClient();
  const matchedPlayers = [...players];
  
  for (let i = 0; i < matchedPlayers.length; i++) {
    const player = matchedPlayers[i];
    
    // Try exact match first
    const { data: exactMatches, error: exactError } = await supabase
      .from('person')
      .select('id, display_name, first_name, last_name, aliases')
      .or(`display_name.ilike.${player.name},first_name.ilike.${player.name},last_name.ilike.${player.name}`)
      .limit(5);
      
    if (!exactError && exactMatches && exactMatches.length > 0) {
      // Find best match
      const bestMatch = exactMatches.reduce((best, current) => {
        // Check for exact display_name match
        if (current.display_name.toLowerCase() === player.name.toLowerCase()) {
          return current;
        }
        // Check for exact first_name match
        if (current.first_name && current.first_name.toLowerCase() === player.name.toLowerCase()) {
          return current;
        }
        // Check for exact last_name match
        if (current.last_name && current.last_name.toLowerCase() === player.name.toLowerCase()) {
          return current;
        }
        // Check aliases if present
        if (current.aliases && Array.isArray(current.aliases)) {
          const aliasMatch = current.aliases.some(alias => 
            alias.toLowerCase() === player.name.toLowerCase()
          );
          if (aliasMatch) return current;
        }
        return best;
      }, exactMatches[0]);
      
      matchedPlayers[i].matched_id = bestMatch.id;
    } else {
      // Try fuzzy match if exact match fails
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .from('person')
        .select('id, display_name, first_name, last_name, aliases')
        .or(`display_name.ilike.%${player.name}%,first_name.ilike.%${player.name}%,last_name.ilike.%${player.name}%`)
        .limit(3);
        
      if (!fuzzyError && fuzzyMatches && fuzzyMatches.length > 0) {
        matchedPlayers[i].matched_id = fuzzyMatches[0].id;
        // Lower confidence for fuzzy match
        matchedPlayers[i].confidence = Math.min(matchedPlayers[i].confidence, 0.7);
      } else {
        // Log unmatched player for later resolution
        try {
          await supabase
            .from('flagged_names')
            .insert({
              id: uuidv4(),
              flagged_name: player.name,
              observation_text: 'From observation API',
              flagged_at: new Date().toISOString(),
              attempted_match: true,
              attempted_match_at: new Date().toISOString(),
              resolution_status: 'unmatched'
            });
        } catch (error) {
          console.warn(`Error logging unmatched player ${player.name}:`, error);
        }
      }
    }
  }
  
  return matchedPlayers;
}

// Helper function to match skill names to skill tags
async function matchSkillTags(skills: ExtractedSkillInfo[]): Promise<ExtractedSkillInfo[]> {
  if (skills.length === 0) return [];
  
  const supabase = await getSupabaseClient();
  const matchedSkills = [...skills];
  
  for (let i = 0; i < matchedSkills.length; i++) {
    const skill = matchedSkills[i];
    
    // Try exact match first
    const { data: exactMatches, error: exactError } = await supabase
      .from('tag')
      .select('id, name, tag_name')
      .eq('tag_type', 'skill')
      .or(`name.ilike.${skill.name},tag_name.ilike.${skill.name}`)
      .limit(3);
      
    if (!exactError && exactMatches && exactMatches.length > 0) {
      matchedSkills[i].matched_id = exactMatches[0].id;
    } else {
      // Try fuzzy match if exact match fails
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .from('tag')
        .select('id, name, tag_name')
        .eq('tag_type', 'skill')
        .or(`name.ilike.%${skill.name}%,tag_name.ilike.%${skill.name}%`)
        .limit(3);
        
      if (!fuzzyError && fuzzyMatches && fuzzyMatches.length > 0) {
        matchedSkills[i].matched_id = fuzzyMatches[0].id;
        // Lower confidence for fuzzy match
        matchedSkills[i].confidence = Math.min(matchedSkills[i].confidence, 0.7);
      } else {
        // Log unmatched skill for later addition to tag database
        try {
          await supabase
            .from('tag_suggestions')
            .insert({
              id: uuidv4(),
              suggested_tag: skill.name,
              source_table: 'observation_logs',
              reviewed: false,
              proposed_type: 'skill',
              created_at: new Date().toISOString()
            });
        } catch (error) {
          console.warn(`Error logging unmatched skill ${skill.name}:`, error);
        }
      }
    }
  }
  
  return matchedSkills;
}

// Helper function to match constraint names to constraint tags
async function matchConstraintTags(constraints: ExtractedConstraintInfo[]): Promise<ExtractedConstraintInfo[]> {
  if (constraints.length === 0) return [];
  
  const supabase = await getSupabaseClient();
  const matchedConstraints = [...constraints];
  
  for (let i = 0; i < matchedConstraints.length; i++) {
    const constraint = matchedConstraints[i];
    
    // Try exact match first
    const { data: exactMatches, error: exactError } = await supabase
      .from('tag')
      .select('id, name, tag_name')
      .eq('tag_type', 'constraint')
      .or(`name.ilike.${constraint.name},tag_name.ilike.${constraint.name}`)
      .limit(3);
      
    if (!exactError && exactMatches && exactMatches.length > 0) {
      matchedConstraints[i].matched_id = exactMatches[0].id;
    } else {
      // Try fuzzy match if exact match fails
      const { data: fuzzyMatches, error: fuzzyError } = await supabase
        .from('tag')
        .select('id, name, tag_name')
        .eq('tag_type', 'constraint')
        .or(`name.ilike.%${constraint.name}%,tag_name.ilike.%${constraint.name}%`)
        .limit(3);
        
      if (!fuzzyError && fuzzyMatches && fuzzyMatches.length > 0) {
        matchedConstraints[i].matched_id = fuzzyMatches[0].id;
        // Lower confidence for fuzzy match
        matchedConstraints[i].confidence = Math.min(matchedConstraints[i].confidence, 0.7);
      } else {
        // Log unmatched constraint for later addition to tag database
        try {
          await supabase
            .from('tag_suggestions')
            .insert({
              id: uuidv4(),
              suggested_tag: constraint.name,
              source_table: 'observation_logs',
              reviewed: false,
              proposed_type: 'constraint',
              created_at: new Date().toISOString()
            });
        } catch (error) {
          console.warn(`Error logging unmatched constraint ${constraint.name}:`, error);
        }
      }
    }
  }
  
  return matchedConstraints;
}

// Helper function to log agent events
async function logAgentEvent({
  event_type,
  player_id,
  session_id,
  agent_id,
  details,
  status
}: {
  event_type: string;
  player_id: string | null;
  session_id: string | null;
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
        team_id: null,
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
