"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation'; // Corrected import
import { toast } from 'sonner';
import {
  User,
  Target,
  ListChecks,
  ShieldCheck,
  CalendarDays,
  MessageSquareText,
  TrendingUp,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  BookOpen,
  ClipboardList,
  CheckCircle // Added missing import
} from 'lucide-react';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Default Player ID (replace with actual auth logic later)
const DEFAULT_PLAYER_ID = 'cee3f3e8-3c46-4a3d-a5da-d849d750bfde'; // Updated Player ID

interface PlayerData {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  roles?: string[];
  team?: string; // Group name
  advancement_level?: number;
  responsibility_tier?: number;
}

interface PDPData {
  id: string;
  pdp_text_player?: string;
  primary_focus?: string;
  secondary_focus?: string;
  skill_tags?: string[];
  constraint_tags?: string[];
  created_at: string;
  updated_at?: string;
}

interface SessionData {
  id: string;
  title?: string;
  session_date: string;
  start_time?: string;
  location?: string;
  overall_theme_tags?: string[];
}

interface ObservationData {
  id: string;
  analysis?: string; // Summary of the observation
  created_at: string;
  entry_type?: string;
  payload?: {
    raw_observation?: string;
    matched_players?: { matched_id?: string }[]; // Added structure for matched_players
    // other fields from AI analysis
  };
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; colorClass: string }> = ({ title, value, icon, colorClass }) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
    <div className={`flex items-center gap-2 mb-1 ${colorClass}`}>
      {icon}
      <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
    </div>
    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value || 'N/A'}</p>
  </div>
);

const InfoSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; emptyText?: string }> = ({ title, icon, children, emptyText = "No information available." }) => {
  const hasContent = React.Children.count(children) > 0 && 
                     (React.Children.toArray(children)[0] !== null && React.Children.toArray(children)[0] !== undefined);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow">
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center">
        {icon}
        <span className="ml-2">{title}</span>
      </h2>
      {hasContent ? children : <p className="text-sm text-gray-500 dark:text-gray-400 italic">{emptyText}</p>}
    </div>
  );
};


export default function PlayerDashboard() {
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [pdp, setPdp] = useState<PDPData | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<SessionData[]>([]);
  const [recentObservations, setRecentObservations] = useState<ObservationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter(); // For navigation if needed

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch Player Info
      const { data: playerData, error: playerError } = await supabase
        .from('person')
        .select('id, display_name, first_name, last_name, roles, team, advancement_level, responsibility_tier')
        .eq('id', DEFAULT_PLAYER_ID)
        .maybeSingle(); // Use maybeSingle() to get one or null, no error if no row
      
      if (playerError) throw playerError; // Throw if actual DB error, not for "no rows"
      setPlayer(playerData); // playerData will be null if not found

      if (!playerData) {
        setError(`Player with ID ${DEFAULT_PLAYER_ID} not found.`);
        setIsLoading(false);
        return;
      }

      // Fetch Current PDP
      const { data: pdpData, error: pdpError } = await supabase
        .from('pdp')
        .select('id, pdp_text_player, primary_focus, secondary_focus, skill_tags, constraint_tags, created_at, updated_at')
        .eq('person_id', DEFAULT_PLAYER_ID)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1) // Ensure only one is considered even if multiple marked current (data integrity issue)
        .maybeSingle(); // Use maybeSingle()
        
      if (pdpError) throw pdpError;
      setPdp(pdpData); // pdpData will be null if no current PDP

      // Fetch Upcoming Sessions
      const today = new Date().toISOString().split('T')[0];
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('session')
        .select('id, title, session_date, start_time, location, overall_theme_tags, planned_attendance')
        .gte('session_date', today)
        .order('session_date', { ascending: true })
        .limit(5);
      
      if (sessionsError) throw sessionsError;
      
      const playerSessions = sessionsData?.filter(s => 
        Array.isArray(s.planned_attendance) && s.planned_attendance.includes(DEFAULT_PLAYER_ID)
      ) || [];
      setUpcomingSessions(playerSessions);

      // Fetch Recent Observations about the player
      const { data: obsData, error: obsError } = await supabase
        .from('observation_logs')
        .select('id, analysis, created_at, entry_type, payload')
        .order('created_at', { ascending: false })
        .limit(5); 
      
      if (obsError) throw obsError;
      
      const playerObservations = obsData?.filter(obs => {
        if (obs.payload && Array.isArray(obs.payload.matched_players)) {
          return obs.payload.matched_players.some((p: any) => p.matched_id === DEFAULT_PLAYER_ID);
        }
        return false; 
      }) || [];
      setRecentObservations(playerObservations);

    } catch (err: any) {
      console.error("Error fetching player dashboard data:", err);
      const errorMessage = err.message || "Failed to load dashboard data.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading Player Dashboard...</p>
      </div>
    );
  }

  if (error && !player) { // Show critical error if player data failed to load
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="mt-4 text-lg text-red-600">Error Loading Dashboard</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
        >
          <RefreshCw size={16} /> Try Again
        </button>
      </div>
    );
  }
  
  // If player is null after loading and no critical error, it means player not found.
  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <User className="h-12 w-12 text-gray-400" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Player data not found for ID: {DEFAULT_PLAYER_ID}.</p>
         {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
  
  const getPlayerFirstName = () => player.first_name || player.display_name.split(' ')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-gray-800 dark:via-gray-900 dark:to-black text-gray-800 dark:text-gray-200 pb-20">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {getPlayerFirstName()}'s Dashboard
            </h1>
            {player.team && <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Team: {player.team}</p>}
          </div>
          <button
            onClick={() => {
              toast.info("Refreshing data...");
              fetchData();
            }}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Display non-critical error if player data loaded but other fetches failed */}
        {error && player && (
             <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
                <span className="font-medium">Data loading issue:</span> {error} Some information might be incomplete.
            </div>
        )}

        {/* Quick Stats / Progress Overview */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Advancement Level" value={player.advancement_level || 'N/A'} icon={<TrendingUp size={16} />} colorClass="text-green-500" />
          <StatCard title="Responsibility Tier" value={player.responsibility_tier || 'N/A'} icon={<ShieldCheck size={16} />} colorClass="text-blue-500" />
          <StatCard title="Upcoming Practices" value={upcomingSessions.length} icon={<CalendarDays size={16} />} colorClass="text-purple-500" />
        </section>

        {/* Current Development Focus */}
        {pdp ? (
          <InfoSection title="Current Development Focus" icon={<Target size={20} className="text-indigo-500" />}>
            {pdp.primary_focus && (
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Primary Focus:</h3>
                <p className="text-md font-medium text-indigo-700 dark:text-indigo-300">{pdp.primary_focus}</p>
              </div>
            )}
            {pdp.secondary_focus && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Secondary Focus:</h3>
                <p className="text-md font-medium text-indigo-700 dark:text-indigo-300">{pdp.secondary_focus}</p>
              </div>
            )}
            {pdp.pdp_text_player && (
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Your Plan:</h3>
                    <p className="text-sm whitespace-pre-wrap">{pdp.pdp_text_player}</p>
                </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">PDP Last Updated: {new Date(pdp.updated_at || pdp.created_at).toLocaleDateString()}</p>
          </InfoSection>
        ) : (
          <InfoSection title="Current Development Focus" icon={<Target size={20} className="text-indigo-500" />} emptyText="No active development plan found. Talk to your coach!">
            {null} 
          </InfoSection>
        )}
        
        {/* Skills & Constraints */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoSection title="Skills to Develop" icon={<ListChecks size={20} className="text-green-500" />} emptyText="No specific skills listed in your current plan.">
            {(pdp?.skill_tags && pdp.skill_tags.length > 0) ? (
              <ul className="space-y-1">
                {pdp.skill_tags.map((skill, index) => (
                  <li key={index} className="text-sm flex items-center">
                    <CheckCircle size={14} className="text-green-500 mr-2 flex-shrink-0" />
                    {skill}
                  </li>
                ))}
              </ul>
            ) : null}
          </InfoSection>

          <InfoSection title="Constraints to Address" icon={<ShieldCheck size={20} className="text-red-500" />} emptyText="No specific constraints listed in your current plan.">
            {(pdp?.constraint_tags && pdp.constraint_tags.length > 0) ? (
              <ul className="space-y-1">
                {pdp.constraint_tags.map((constraint, index) => (
                  <li key={index} className="text-sm flex items-center">
                    <AlertTriangle size={14} className="text-red-500 mr-2 flex-shrink-0" />
                    {constraint}
                  </li>
                ))}
              </ul>
            ) : null}
          </InfoSection>
        </div>

        {/* Upcoming Practices */}
        <InfoSection title="Upcoming Practices" icon={<CalendarDays size={20} className="text-purple-500" />} emptyText="No upcoming practices scheduled for you.">
          {upcomingSessions.length > 0 ? (
            <ul className="space-y-3">
              {upcomingSessions.map(session => (
                <li key={session.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{session.title || `Practice Session`}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(session.session_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        {session.start_time && ` at ${session.start_time.substring(0,5)}`}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                  {session.overall_theme_tags && session.overall_theme_tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {session.overall_theme_tags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </InfoSection>

        {/* Recent Feedback/Observations */}
        <InfoSection title="Recent Feedback & Observations" icon={<MessageSquareText size={20} className="text-blue-500" />} emptyText="No recent feedback or observations for you.">
          {recentObservations.length > 0 ? (
            <ul className="space-y-3">
              {recentObservations.map(obs => (
                <li key={obs.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                  <p className="text-sm mb-1">{obs.payload?.raw_observation || obs.analysis || "Observation recorded."}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(obs.created_at).toLocaleDateString()} - {obs.entry_type || "Coach Note"}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </InfoSection>
      </main>
      
      {/* Simple Bottom Nav Placeholder */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 p-3 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">Player Dashboard MVP</p>
      </footer>
    </div>
  );
}
