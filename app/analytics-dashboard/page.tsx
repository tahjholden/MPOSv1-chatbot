"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import {
  Users,
  TrendingUp,
  BarChart2,
  CalendarDays,
  ClipboardList,
  RefreshCw,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle,
  Activity,
  Zap,
  ListChecks,
  Eye,
  PieChart,
  Loader2 // Added missing import
} from 'lucide-react';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Default IDs (replace with actual auth/context later)
const DEFAULT_COACH_ID = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID || 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7';
const DEFAULT_GROUP_ID = process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID || '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8'; // Team/Group ID

interface PlayerAnalytics {
  id: string;
  display_name: string;
  advancement_level: number | null;
  attendance_rate: number;
  skills_in_focus: string[];
  pdp_updated_at: string | null;
}

interface TeamAnalytics {
  total_players: number;
  overall_attendance_rate: number;
  top_skills: { skill: string; count: number }[];
  practice_frequency: number; // Practices per week/month
  active_pdps: number;
}

interface CoachAnalytics {
  sessions_created: number;
  avg_approval_time_hours: number | null; // Hours
  top_themes: { theme: string; count: number }[];
  player_engagement_score: number | null; // Placeholder
}

interface AnalyticsData {
  players: PlayerAnalytics[];
  team: TeamAnalytics;
  coach: CoachAnalytics;
}

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; unit?: string; trend?: 'up' | 'down' | 'neutral' }> = ({ title, value, icon, unit, trend }) => (
  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
    <div className="flex items-center text-gray-500 dark:text-gray-400 mb-1">
      {icon}
      <span className="ml-2 text-sm font-medium">{title}</span>
    </div>
    <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
      {value}{unit && <span className="text-sm font-normal">{unit}</span>}
      {trend === 'up' && <TrendingUp size={16} className="inline ml-1 text-green-500" />}
      {trend === 'down' && <TrendingUp size={16} className="inline ml-1 text-red-500 transform rotate-180" />}
    </p>
  </div>
);

const SimpleBarChart: React.FC<{ data: { label: string; value: number }[]; title: string; barColorClass?: string }> = ({ data, title, barColorClass = "bg-indigo-500" }) => {
  if (!data || data.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">No data for {title}.</p>;
  const maxValue = Math.max(...data.map(d => d.value), 0);

  return (
    <div className="mt-2">
      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">{title}</h4>
      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={index} className="flex items-center">
            <div className="text-xs w-1/3 truncate pr-2">{item.label} ({item.value})</div>
            <div className="w-2/3 bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div
                className={`${barColorClass} h-4 rounded-full text-white text-xs flex items-center justify-end pr-1`}
                style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : '0%' }}
              >
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


export default function AnalyticsDashboardPage() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | 'all'>('all');
  const [allPlayers, setAllPlayers] = useState<{ id: string, display_name: string }[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabaseClient = supabase; // Use the initialized client

      let startDate: string | undefined = undefined;
      if (dateRange !== 'all') {
        const now = new Date();
        const days = parseInt(dateRange.replace('d', ''));
        startDate = new Date(now.setDate(now.getDate() - days)).toISOString();
      }

      // Fetch all players for filter dropdown
      const { data: playersList, error: playersListError } = await supabaseClient
        .from('person')
        .select('id, display_name')
        .contains('roles', ['player']) // Corrected PostgreSQL array query
        .order('display_name');
      if (playersListError) throw playersListError;
      setAllPlayers(playersList || []);

      // Player Analytics
      const playerAnalyticsPromises = (playersList || []).map(async (player) => {
        let attendanceQuery = supabaseClient
          .from('attendance')
          .select('present', { count: 'exact' })
          .eq('person_id', player.id);
        if (startDate) attendanceQuery = attendanceQuery.gte('created_at', startDate);
        const { count: totalAttendance, error: attError } = await attendanceQuery;

        let presentQuery = supabaseClient
          .from('attendance')
          .select('present', { count: 'exact' })
          .eq('person_id', player.id)
          .eq('present', true);
        if (startDate) presentQuery = presentQuery.gte('created_at', startDate);
        const { count: presentCount, error: presentErr } = await presentQuery;

        if (attError || presentErr) console.warn(`Error fetching attendance for ${player.display_name}`);
        
        const attendanceRate = (totalAttendance && totalAttendance > 0) ? Math.round(((presentCount || 0) / totalAttendance) * 100) : 0;

        let pdpQuery = supabaseClient
          .from('pdp')
          .select('skill_tags, updated_at, advancement_level')
          .eq('person_id', player.id)
          .eq('is_current', true)
          .order('updated_at', { ascending: false })
          .limit(1);
        const { data: pdpData, error: pdpError } = await pdpQuery.maybeSingle();
        if (pdpError) console.warn(`Error fetching PDP for ${player.display_name}`);

        return {
          id: player.id,
          display_name: player.display_name,
          advancement_level: pdpData?.advancement_level || null,
          attendance_rate: attendanceRate,
          skills_in_focus: pdpData?.skill_tags || [],
          pdp_updated_at: pdpData?.updated_at || null,
        };
      });
      const playersData = await Promise.all(playerAnalyticsPromises);

      // Team Analytics
      const teamTotalPlayers = playersList?.length || 0;
      const teamOverallAttendanceRate = playersData.length > 0 ? Math.round(playersData.reduce((sum, p) => sum + p.attendance_rate, 0) / playersData.length) : 0;
      
      let sessionsQuery = supabaseClient
        .from('session')
        .select('overall_theme_tags, session_plan', { count: 'exact' });
      if (startDate) sessionsQuery = sessionsQuery.gte('created_at', startDate);
      const { data: sessionsData, count: practiceCount, error: sessionsError } = await sessionsQuery;
      if (sessionsError) throw sessionsError;

      const skillCounts: Record<string, number> = {};
      sessionsData?.forEach(session => {
        (session.session_plan?.session_plan || []).forEach((block: any) => {
          (block.skills || []).forEach((skill: string) => {
            skillCounts[skill] = (skillCounts[skill] || 0) + 1;
          });
        });
      });
      const teamTopSkills = Object.entries(skillCounts).sort(([,a],[,b]) => b-a).slice(0, 5).map(([skill, count]) => ({ skill, count }));
      
      const practiceFrequency = practiceCount || 0; // Total practices in period. Per week/month needs date range duration.

      const { count: activePdpsCount, error: activePdpsError } = await supabaseClient
        .from('pdp')
        .select('*', { count: 'exact', head: true })
        .eq('is_current', true);
      if (activePdpsError) throw activePdpsError;

      // Coach Analytics
      let coachSessionsQuery = supabaseClient
        .from('session')
        .select('overall_theme_tags, created_at, last_updated, status', { count: 'exact' })
        .eq('coach_id', DEFAULT_COACH_ID);
      if (startDate) coachSessionsQuery = coachSessionsQuery.gte('created_at', startDate);
      const { data: coachSessionsData, count: coachSessionsCreated, error: coachSessionsError } = await coachSessionsQuery;
      if (coachSessionsError) throw coachSessionsError;

      const themeCounts: Record<string, number> = {};
      let totalApprovalTime = 0;
      let approvedSessionsCount = 0;
      coachSessionsData?.forEach(session => {
        (session.overall_theme_tags || []).forEach(theme => {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        });
        if (session.status === 'approved' && session.created_at && session.last_updated) {
          const approvalTime = new Date(session.last_updated).getTime() - new Date(session.created_at).getTime();
          totalApprovalTime += approvalTime;
          approvedSessionsCount++;
        }
      });
      const coachTopThemes = Object.entries(themeCounts).sort(([,a],[,b]) => b-a).slice(0, 5).map(([theme, count]) => ({ theme, count }));
      const avgApprovalTimeHours = approvedSessionsCount > 0 ? Math.round((totalApprovalTime / approvedSessionsCount) / (1000 * 60 * 60)) : null;

      setAnalyticsData({
        players: playersData,
        team: {
          total_players: teamTotalPlayers,
          overall_attendance_rate: teamOverallAttendanceRate,
          top_skills: teamTopSkills,
          practice_frequency: practiceFrequency,
          active_pdps: activePdpsCount || 0,
        },
        coach: {
          sessions_created: coachSessionsCreated || 0,
          avg_approval_time_hours: avgApprovalTimeHours,
          top_themes: coachTopThemes,
          player_engagement_score: null, // Placeholder
        },
      });

    } catch (err: any) {
      console.error("Error fetching analytics data:", err);
      setError(err.message || "Failed to load analytics.");
      toast.error("Failed to load analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredPlayers = selectedPlayerId === 'all' 
    ? analyticsData?.players 
    : analyticsData?.players.filter(p => p.id === selectedPlayerId);

  const generateSummaryText = () => {
    if (!analyticsData) return "No data to summarize.";
    let summary = `Analytics Summary (${dateRange === 'all' ? 'All Time' : `Last ${dateRange.replace('d','')} Days`}):\n\n`;
    summary += `Team Performance:\n`;
    summary += `- Total Players: ${analyticsData.team.total_players}\n`;
    summary += `- Overall Attendance: ${analyticsData.team.overall_attendance_rate}%\n`;
    summary += `- Practices Held: ${analyticsData.team.practice_frequency}\n`;
    summary += `- Top Skills Focused: ${analyticsData.team.top_skills.map(s => `${s.skill} (${s.count})`).join(', ')}\n\n`;
    summary += `Coach Activity:\n`;
    summary += `- Sessions Created/Managed: ${analyticsData.coach.sessions_created}\n`;
    summary += `- Top Themes Used: ${analyticsData.coach.top_themes.map(t => `${t.theme} (${t.count})`).join(', ')}\n\n`;
    if (filteredPlayers && filteredPlayers.length > 0) {
      summary += `Player Spotlight (${selectedPlayerId === 'all' ? 'Average/Overall' : filteredPlayers[0].display_name}):\n`;
      if (selectedPlayerId !== 'all' && filteredPlayers[0]) {
        const player = filteredPlayers[0];
        summary += `- Advancement Level: ${player.advancement_level || 'N/A'}\n`;
        summary += `- Attendance Rate: ${player.attendance_rate}%\n`;
        summary += `- Skills in Focus: ${player.skills_in_focus.join(', ') || 'None'}\n`;
      } else {
         summary += `- Avg. Advancement Level: ${Math.round(analyticsData.players.reduce((s,p) => s + (p.advancement_level || 0), 0) / analyticsData.players.length) || 'N/A'}\n`;
      }
    }
    return summary;
  };
  
  const handleExport = () => {
    const summary = generateSummaryText();
    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `analytics_summary_${dateRange}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Summary exported!");
  };


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading Analytics Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="mt-4 text-lg text-red-600">Error Loading Analytics</p>
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

  if (!analyticsData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <BarChart2 className="h-12 w-12 text-gray-400" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">No analytics data available.</p>
      </div>
    );
  }
  
  const playerAdvancementData = analyticsData.players
    .filter(p => p.advancement_level !== null)
    .map(p => ({ label: p.display_name, value: p.advancement_level as number }));

  const playerAttendanceData = analyticsData.players
    .map(p => ({ label: p.display_name, value: p.attendance_rate }));


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 pb-20">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            Analytics Dashboard
          </h1>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500 dark:text-gray-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Players</option>
                {allPlayers.map(player => (
                  <option key={player.id} value={player.id}>{player.display_name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchData}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={handleExport}
              className="p-2 text-sm bg-indigo-500 hover:bg-indigo-600 text-white rounded-md flex items-center gap-1"
              aria-label="Export Summary"
            >
              <Download size={16} /> Export
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Team Performance Overview */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Users size={20} /> Team Performance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Players" value={analyticsData.team.total_players} icon={<Users size={16} />} />
            <StatCard title="Overall Attendance" value={analyticsData.team.overall_attendance_rate} unit="%" icon={<CheckCircle size={16} />} />
            <StatCard title="Practices This Period" value={analyticsData.team.practice_frequency} icon={<CalendarDays size={16} />} />
            <StatCard title="Active PDPs" value={analyticsData.team.active_pdps} icon={<ClipboardList size={16} />} />
          </div>
          <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <SimpleBarChart data={analyticsData.team.top_skills} title="Top Skills Focused in Practices" barColorClass="bg-green-500" />
          </div>
        </section>

        {/* Player Progress Tracking */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><TrendingUp size={20} /> Player Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
              <SimpleBarChart data={playerAdvancementData} title="Player Advancement Levels" barColorClass="bg-blue-500" />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
              <SimpleBarChart data={playerAttendanceData} title="Player Attendance Rates (%)" barColorClass="bg-purple-500" />
            </div>
          </div>
          {selectedPlayerId !== 'all' && filteredPlayers && filteredPlayers[0] && (
            <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
              <h3 className="text-md font-semibold mb-2">Spotlight: {filteredPlayers[0].display_name}</h3>
              <p className="text-sm">Skills in Focus: {filteredPlayers[0].skills_in_focus.join(', ') || 'None'}</p>
              <p className="text-sm">PDP Last Updated: {filteredPlayers[0].pdp_updated_at ? new Date(filteredPlayers[0].pdp_updated_at).toLocaleDateString() : 'N/A'}</p>
            </div>
          )}
        </section>
        
        {/* Coach Insights */}
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Eye size={20} /> Coach Insights</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Sessions Created/Managed" value={analyticsData.coach.sessions_created} icon={<Activity size={16} />} />
            <StatCard title="Avg. Plan Approval Time" value={analyticsData.coach.avg_approval_time_hours !== null ? analyticsData.coach.avg_approval_time_hours : 'N/A'} unit=" hrs" icon={<Zap size={16} />} />
            <StatCard title="Player Engagement (Placeholder)" value={analyticsData.coach.player_engagement_score || 'N/A'} icon={<PieChart size={16} />} />
          </div>
           <div className="mt-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <SimpleBarChart data={analyticsData.coach.top_themes} title="Top Practice Themes Used" barColorClass="bg-teal-500"/>
          </div>
        </section>

      </main>
    </div>
  );
}
