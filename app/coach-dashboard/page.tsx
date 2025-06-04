"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import VoiceInputSimple from '@/components/voice-input-simple'; // Changed import
import {
  Calendar,
  CheckCircle,
  XCircle,
  Edit2,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  Calendar as CalendarIcon,
  RefreshCw,
  Layers,
  Mic,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Default coach ID (would normally come from auth)
const DEFAULT_COACH_ID = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID || 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7';
const DEFAULT_TEAM_ID = process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID || '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8';

export default function CoachDashboard() {
  // State for sessions and stats
  const [pendingSessions, setPendingSessions] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalPlayers: 0,
    upcomingSessions: 0,
    pendingApprovals: 0,
    attendanceRate: 0
  });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false); // Kept for overlay, though VoiceInputSimple handles internal state
  const [coachInfo, setCoachInfo] = useState<any>(null);
  const router = useRouter();

  // Fetch coach information
  const fetchCoachInfo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('person')
        .select('*')
        .eq('id', DEFAULT_COACH_ID)
        .single();

      if (error) throw error;
      setCoachInfo(data);
    } catch (error: any) {
      console.error('Error fetching coach info:', error.message);
    }
  }, []);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      // Get player count
      const { count: playerCount, error: playerError } = await supabase
        .from('person')
        .select('*', { count: 'exact', head: true })
        .eq('roles', '["player"]');

      // Get upcoming sessions count
      const { count: upcomingCount, error: upcomingError } = await supabase
        .from('session')
        .select('*', { count: 'exact', head: true })
        .gte('session_date', new Date().toISOString().split('T')[0])
        .eq('status', 'approved');

      // Get pending approvals count
      const { count: pendingCount, error: pendingError } = await supabase
        .from('session')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval');

      // Get attendance rate
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('person')
        .select('attendance_pct')
        .eq('roles', '["player"]');

      let attendanceRate = 0;
      if (attendanceData && attendanceData.length > 0) {
        const total = attendanceData.reduce((sum, player) => 
          sum + (player.attendance_pct || 0), 0);
        attendanceRate = Math.round(total / attendanceData.length);
      }

      setStats({
        totalPlayers: playerCount || 0,
        upcomingSessions: upcomingCount || 0,
        pendingApprovals: pendingCount || 0,
        attendanceRate
      });
    } catch (error: any) {
      console.error('Error fetching stats:', error.message);
    }
  }, []);

  // Fetch pending sessions
  const fetchPendingSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('session')
        .select(`
          *,
          coach:coach_id(display_name)
        `)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingSessions(data || []);
    } catch (error: any) {
      console.error('Error fetching pending sessions:', error.message);
      toast.error('Failed to load pending sessions');
    }
  }, []);

  // Fetch recent sessions
  const fetchRecentSessions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('session')
        .select(`
          *,
          coach:coach_id(display_name)
        `)
        .eq('status', 'approved')
        .order('session_date', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentSessions(data || []);
    } catch (error: any) {
      console.error('Error fetching recent sessions:', error.message);
    }
  }, []);

  // Handle session approval
  const handleApproveSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('session')
        .update({ status: 'approved', last_updated: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
      toast.success('Practice plan approved!');
      
      // Update local state
      setPendingSessions(prev => prev.filter(session => session.id !== sessionId));
      fetchRecentSessions();
      fetchStats();
    } catch (error: any) {
      console.error('Error approving session:', error.message);
      toast.error('Failed to approve session');
    }
  };

  // Handle session rejection
  const handleRejectSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('session')
        .update({ status: 'rejected', last_updated: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
      toast.info('Practice plan rejected');
      
      // Update local state
      setPendingSessions(prev => prev.filter(session => session.id !== sessionId));
      fetchStats();
    } catch (error: any) {
      console.error('Error rejecting session:', error.message);
      toast.error('Failed to reject session');
    }
  };

  // Handle session edit
  const handleEditSession = (sessionId: string) => {
    router.push(`/coach-dashboard/edit-session/${sessionId}`);
  };

  // Toggle session expansion
  const toggleSessionExpansion = (sessionId: string) => {
    setExpandedSession(prev => prev === sessionId ? null : sessionId);
  };

  // Handle voice processing completion
  const handleVoiceProcessingComplete = (data: any) => {
    setIsProcessingVoice(false); // Hide overlay
    fetchPendingSessions();
    fetchStats();
    if (data && data.success) {
        toast.success(data.message || 'Voice command processed!');
    } else if (data && data.error) {
        toast.error(data.error || 'Failed to process voice command.');
    }
    // If data.type is 'observation_saved', it means no plan was generated, just an observation.
    // We might want different feedback for that.
  };

  // Set up Supabase real-time subscriptions
  useEffect(() => {
    const sessionSubscription = supabase
      .channel('session_changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session',
        filter: `status=eq.pending_approval`
      }, payload => {
        // Add new session to pending sessions
        setPendingSessions(prev => [payload.new, ...prev]);
        fetchStats();
        toast.info('New practice plan ready for review!');
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'session'
      }, payload => {
        // Handle status changes
        if (payload.new.status === 'approved') {
          setPendingSessions(prev => prev.filter(session => session.id !== payload.new.id));
          fetchRecentSessions();
          fetchStats();
        } else if (payload.new.status === 'rejected') {
          setPendingSessions(prev => prev.filter(session => session.id !== payload.new.id));
          fetchStats();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSubscription);
    };
  }, [fetchRecentSessions, fetchStats]);

  // Initial data loading
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchCoachInfo(),
        fetchStats(),
        fetchPendingSessions(),
        fetchRecentSessions()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [fetchCoachInfo, fetchStats, fetchPendingSessions, fetchRecentSessions]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Get attendance count from session
  const getAttendanceCount = (session: any) => {
    if (session.planned_attendance && Array.isArray(session.planned_attendance)) {
      return session.planned_attendance.length;
    }
    return 0;
  };

  // Get practice blocks from session
  const getPracticeBlocks = (session: any) => {
    if (session.session_plan && 
        session.session_plan.session_plan && 
        Array.isArray(session.session_plan.session_plan)) {
      return session.session_plan.session_plan;
    }
    return [];
  };

  return (
    <div className="coach-dashboard bg-gray-50 dark:bg-gray-900 min-h-screen pb-20">
      {/* Header */}
      <header className="bg-indigo-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">Coach Dashboard</h1>
              {coachInfo && (
                <p className="text-sm opacity-90">{coachInfo.display_name}</p>
              )}
            </div>
            <button 
              onClick={() => {
                fetchPendingSessions();
                fetchRecentSessions();
                fetchStats();
                toast.info('Dashboard refreshed');
              }}
              className="p-2 rounded-full hover:bg-indigo-700 transition-colors"
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <>
            {/* Quick Stats */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
                  <Users size={16} />
                  <span className="text-xs font-medium">Players</span>
                </div>
                <p className="text-2xl font-bold">{stats.totalPlayers}</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                  <CalendarIcon size={16} />
                  <span className="text-xs font-medium">Upcoming</span>
                </div>
                <p className="text-2xl font-bold">{stats.upcomingSessions}</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                  <Clock size={16} />
                  <span className="text-xs font-medium">Pending</span>
                </div>
                <p className="text-2xl font-bold">{stats.pendingApprovals}</p>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                  <Users size={16} />
                  <span className="text-xs font-medium">Attendance</span>
                </div>
                <p className="text-2xl font-bold">{stats.attendanceRate}%</p>
              </div>
            </section>

            {/* Voice Input Section */}
            <section className="mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4">
                  <h2 className="text-lg font-medium flex items-center gap-2">
                    <Mic size={18} />
                    Voice Assistant
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Create a new practice plan or log observations with your voice
                  </p>
                </div>
                
                <div className="p-4">
                  <VoiceInputSimple 
                    coachId={DEFAULT_COACH_ID}
                    groupId={DEFAULT_TEAM_ID}
                    onProcessingComplete={handleVoiceProcessingComplete}
                  />
                  
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <p>Try saying: <em>"Plan practice for tomorrow focusing on shooting and spacing"</em> or <em>"Log observation: John showed great hustle today."</em></p>
                  </div>
                </div>
              </div>
            </section>

            {/* Pending Sessions Section */}
            <section className="mb-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <AlertCircle size={20} className="text-amber-500" />
                Pending Approval
              </h2>
              
              {pendingSessions.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
                  <p>No practice plans waiting for approval</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence>
                    {pendingSessions.map(session => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
                      >
                        {/* Session Header */}
                        <div 
                          className="p-4 cursor-pointer"
                          onClick={() => toggleSessionExpansion(session.id)}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="font-medium">
                                {session.title || `Practice ${formatDate(session.session_date)}`}
                              </h3>
                              <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar size={14} />
                                  {formatDate(session.session_date)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users size={14} />
                                  {getAttendanceCount(session)} players
                                </span>
                                <span className="flex items-center gap-1">
                                  <Layers size={14} />
                                  {getPracticeBlocks(session).length} blocks
                                </span>
                              </div>
                            </div>
                            
                            <div className="text-gray-400">
                              {expandedSession === session.id ? (
                                <ChevronUp size={20} />
                              ) : (
                                <ChevronDown size={20} />
                              )}
                            </div>
                          </div>
                          
                          {/* Theme Tags */}
                          {session.overall_theme_tags && session.overall_theme_tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {session.overall_theme_tags.map((tag: string, i: number) => (
                                <span 
                                  key={i} 
                                  className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Expanded Content */}
                        {expandedSession === session.id && (
                          <div className="border-t border-gray-100 dark:border-gray-700">
                            {/* Practice Blocks */}
                            <div className="p-4">
                              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                                Practice Blocks
                              </h4>
                              
                              {getPracticeBlocks(session).length === 0 ? (
                                <p className="text-sm text-gray-500 italic">No practice blocks defined</p>
                              ) : (
                                <div className="space-y-3">
                                  {getPracticeBlocks(session).map((block: any, index: number) => (
                                    <div 
                                      key={index}
                                      className="border border-gray-200 dark:border-gray-700 rounded-md p-3"
                                    >
                                      <div className="flex justify-between">
                                        <h5 className="font-medium">{block.block_name}</h5>
                                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                          {block.format}
                                        </span>
                                      </div>
                                      
                                      {/* Skills & Constraints */}
                                      <div className="mt-2 space-y-1">
                                        {block.skills && block.skills.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {block.skills.map((skill: string, i: number) => (
                                              <span 
                                                key={i}
                                                className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs"
                                              >
                                                {skill}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        
                                        {block.constraints && block.constraints.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {block.constraints.map((constraint: string, i: number) => (
                                              <span 
                                                key={i}
                                                className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs"
                                              >
                                                {constraint}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Coaching Cues */}
                                      {block.coaching_cues && block.coaching_cues.length > 0 && (
                                        <div className="mt-2">
                                          <h6 className="text-xs text-gray-500 dark:text-gray-400">Coaching Cues:</h6>
                                          <ul className="list-disc list-inside text-sm pl-1">
                                            {block.coaching_cues.map((cue: string, i: number) => (
                                              <li key={i}>{cue}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 flex gap-2 justify-end">
                              <button
                                onClick={() => handleRejectSession(session.id)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                              >
                                <XCircle size={16} />
                                Reject
                              </button>
                              
                              <button
                                onClick={() => handleEditSession(session.id)}
                                className="px-4 py-2 border border-blue-300 dark:border-blue-600 rounded-md text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-1"
                              >
                                <Edit2 size={16} />
                                Edit
                              </button>
                              
                              <button
                                onClick={() => handleApproveSession(session.id)}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                              >
                                <CheckCircle size={16} />
                                Approve
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* Recent Sessions Section */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 size={20} className="text-green-500" />
                Recent Sessions
              </h2>
              
              {recentSessions.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center text-gray-500 dark:text-gray-400">
                  <p>No recent practice sessions</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentSessions.map(session => (
                    <div 
                      key={session.id}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-medium">
                            {session.title || `Practice ${formatDate(session.session_date)}`}
                          </h3>
                          <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {formatDate(session.session_date)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users size={14} />
                              {getAttendanceCount(session)} players
                            </span>
                            <span className="flex items-center gap-1">
                              <Layers size={14} />
                              {getPracticeBlocks(session).length} blocks
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => router.push(`/coach-dashboard/session/${session.id}`)}
                          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          View
                        </button>
                      </div>
                      
                      {/* Theme Tags */}
                      {session.overall_theme_tags && session.overall_theme_tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {session.overall_theme_tags.map((tag: string, i: number) => (
                            <span 
                              key={i} 
                              className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-3 px-6 flex justify-around shadow-lg">
        <button 
          className="flex flex-col items-center text-indigo-600 dark:text-indigo-400"
          onClick={() => {}}
        >
          <Calendar size={20} />
          <span className="text-xs mt-1">Schedule</span>
        </button>
        
        <button 
          className="flex flex-col items-center text-gray-500 dark:text-gray-400"
          onClick={() => {}}
        >
          <Users size={20} />
          <span className="text-xs mt-1">Players</span>
        </button>
        
        <button 
          className="flex flex-col items-center text-gray-500 dark:text-gray-400"
          onClick={() => {}}
        >
          <Layers size={20} />
          <span className="text-xs mt-1">Drills</span>
        </button>
        
        <button 
          className="flex flex-col items-center text-gray-500 dark:text-gray-400"
          onClick={() => {}}
        >
          <Mic size={20} />
          <span className="text-xs mt-1">Voice</span>
        </button>
      </nav>

      {/* Loading Overlay */}
      {isProcessingVoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <div className="flex justify-center mb-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
            <h3 className="text-lg font-medium text-center">Processing Voice Command</h3>
            <p className="text-gray-500 dark:text-gray-400 text-center mt-2">
              Please wait while we process your command...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
