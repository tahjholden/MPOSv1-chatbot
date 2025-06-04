"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';
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
  AlertCircle,
  MicOff,
  Loader2,
  Send,
  HelpCircle,
  PlusCircle,
  BarChart2,
  BookOpen, // For ARC definitions
  TrendingUp, // For ARC definitions
  Users2 // For ARC definitions
} from 'lucide-react';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Default coach ID (would normally come from auth)
const DEFAULT_COACH_ID = process.env.NEXT_PUBLIC_DEFAULT_COACH_ID || 'b7db439c-4ad4-40f4-8963-15e7f6d7d6c7';
const DEFAULT_GROUP_ID = process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID || '9ba6bbd3-85f6-4bba-b95d-5b79bd309df8';

// ARC System Definitions (copied from previous context for use in UI)
const ARC_RESPONSIBILITY_LEVELS = [
  { level: 1, name: 'Development Cadre', description: 'Focus on individual skill acquisition and understanding basic team concepts.' },
  { level: 2, name: 'Rotational Contributor', description: 'Can execute specific roles and responsibilities effectively within limited minutes or situations.' },
  { level: 3, name: 'Trusted Role Player', description: 'Reliably performs defined team roles, understands system, and makes consistent positive contributions.' },
  { level: 4, name: 'On-Court Co-Leader', description: 'Demonstrates leadership qualities, communicates effectively, and helps guide teammates within the team system.' },
  { level: 5, name: 'Team Leader', description: 'Primary on-court leader, sets tone, responsible for significant tactical execution and team cohesion.' },
  { level: 6, name: 'Core Anchor', description: 'Franchise-level player, system often revolves around their strengths; embodies team identity and culture.' }
];

const ARC_COLLECTIVE_GROWTH_LEVELS = [
  { level: 1, name: 'Foundation & Familiarity', description: 'Team learning basic structure, roles, and communication protocols; high coach dependency.' },
  { level: 2, name: 'Collective Constraints & Roles', description: 'Team beginning to understand and operate within shared constraints and defined roles; coach scaffolding still significant.' },
  { level: 3, name: 'Shared Decision Rules', description: 'Players start to use shared heuristics and decision rules to solve common game problems; less direct cueing needed.' },
  { level: 4, name: 'Autonomous Execution', description: 'Team can execute tactical plans with minimal coach intervention; players make adjustments based on shared understanding.' },
  { level: 5, name: 'Collective Accountability', description: 'Players hold each other accountable to team standards and tactical execution; peer coaching emerges.' },
  { level: 6, name: 'Self-Regulating Cohesion', description: 'Team operates with high autonomy, adapts fluidly to game situations, and self-manages culture and performance; coach as facilitator.' }
];

// Reflection Keywords/Patterns (for attendance verification)
const REFLECTION_PATTERNS = [
  /today.*?worked\s+on/i, /practice.*?went/i, /session.*?went/i, /reflection:/i,
  /session\s+reflection/i, /team\s+did/i, /players\s+showed/i, /overall\s+practice/i,
  /key\s+takeaways/i, /good\s+session/i, /tough\s+practice/i,
];

// Practice Planning Keywords/Patterns
const PRACTICE_PLANNING_PATTERNS = [
    /plan\s+(?:a\s+)?practice/i, /create\s+(?:a\s+)?practice/i, /generate\s+(?:a\s+)?practice/i,
    /new\s+practice/i, /session\s+for/i, /practice\s+for/i, /design\s+(?:a\s+)?session/i,
    /design\s+(?:a\s+)?practice/i, /schedule\s+(?:a\s+)?practice/i,
];


interface MissingPlayerPrompt {
  player_id: string;
  player_name: string;
  prompt_type: 'absent_check' | 'add_confirmation';
  suggested_prompt: string;
}

// Simplified Voice Input Component (handles voice capture, editing, and passes final transcript up)
interface MinimalVoiceInputProps {
  onTranscriptSubmit: (transcript: string) => void;
  isApiProcessing: boolean; // To disable send button during parent API calls
  statusHint: string; // To display messages from parent
  className?: string;
}

const MinimalVoiceInput: React.FC<MinimalVoiceInputProps> = ({ onTranscriptSubmit, isApiProcessing, statusHint, className }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [internalStatus, setInternalStatus] = useState('Tap mic or type, then Send.');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const accumulatedTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setInternalStatus('Speech recognition not supported.');
        toast.error('Speech recognition not supported.');
        return;
      }

      recognitionRef.current = new SpeechRecognitionAPI();
      const recognition = recognitionRef.current;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscriptPart = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscriptPart += event.results[i][0].transcript.trim() + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscriptPart) {
          accumulatedTranscriptRef.current += finalTranscriptPart;
        }
        setTranscript(accumulatedTranscriptRef.current + interimTranscript);
      };

      recognition.onerror = (event) => {
        setInternalStatus(`Mic Error: ${event.error}`);
        toast.error(`Speech error: ${event.error}`);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setTranscript(accumulatedTranscriptRef.current.trim());
        if (accumulatedTranscriptRef.current.trim()) {
          setInternalStatus('Review/edit, then Send.');
        } else {
          setInternalStatus('No speech detected. Tap mic or type.');
        }
      };
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setInternalStatus('Speech recognition not ready.');
      toast.error('Speech recognition not ready.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      accumulatedTranscriptRef.current = '';
      setTranscript('');
      setInternalStatus('Listening...');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e: any) {
        setInternalStatus(`Start error: ${e.message}`);
        toast.error(`Could not start voice: ${e.message}`);
        setIsRecording(false);
      }
    }
  };

  const handleSend = () => {
    const finalTranscript = transcript.trim();
    if (!finalTranscript) {
      toast.info('Nothing to send.');
      return;
    }
    onTranscriptSubmit(finalTranscript);
    // Parent will clear transcript if needed after successful API call
  };

  return (
    <div className={`p-4 border rounded-lg bg-gray-50 dark:bg-gray-700/50 ${className}`}>
      <div className="flex items-center space-x-3 mb-3">
        <button
          onClick={toggleRecording}
          disabled={isApiProcessing}
          className={`p-3 rounded-full transition-colors ${
            isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          } ${isApiProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <div className="flex-grow text-sm text-gray-700 dark:text-gray-300">
          <p className="font-medium">{isApiProcessing ? statusHint : internalStatus}</p>
        </div>
      </div>
      <textarea
        value={transcript}
        onChange={(e) => {
          setTranscript(e.target.value);
          accumulatedTranscriptRef.current = e.target.value; 
        }}
        placeholder={isRecording ? "Listening..." : "Tap mic, or type/edit here..."}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white mb-3"
        rows={3}
        disabled={isRecording || isApiProcessing}
      />
      <button
        onClick={handleSend}
        disabled={isRecording || isApiProcessing || !transcript.trim()}
        className={`w-full p-3 rounded-md bg-green-500 hover:bg-green-600 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex items-center justify-center gap-2
            ${(isRecording || isApiProcessing || !transcript.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label="Send command"
      >
        {isApiProcessing ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        {isApiProcessing ? 'Processing...' : 'Send'}
      </button>
    </div>
  );
};


export default function CoachDashboard() {
  const [pendingSessions, setPendingSessions] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalPlayers: 0, upcomingSessions: 0, pendingApprovals: 0, attendanceRate: 0 });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false); 
  const [coachInfo, setCoachInfo] = useState<any>(null);
  const [actionablePrompts, setActionablePrompts] = useState<MissingPlayerPrompt[]>([]);
  const [selectedSessionForAttendanceContext, setSelectedSessionForAttendanceContext] = useState<string | null>(null);
  
  // ARC State
  const [selectedRLevel, setSelectedRLevel] = useState<number>(3);
  const [selectedCLevel, setSelectedCLevel] = useState<number>(2);
  const [sessionDuration, setSessionDuration] = useState<number>(75);
  const [voiceInputStatus, setVoiceInputStatus] = useState('Set ARC context & duration, then use voice for focus or log observations.');

  const router = useRouter();

  const fetchCoachInfo = useCallback(async () => { /* ... as before ... */ }, []);
  const fetchStats = useCallback(async () => { /* ... as before ... */ }, []);
  const fetchPendingSessions = useCallback(async () => { /* ... as before ... */ }, []);
  const fetchRecentSessions = useCallback(async () => { /* ... as before ... */ }, []);


  const fetchRecentSessionsForContext = useCallback(async () => {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      const { data, error } = await supabase
        .from('session')
        .select('id, session_date, title, team_layer, collective_growth_phase') // Include ARC levels
        .in('status', ['approved', 'pending_approval'])
        .gte('session_date', yesterday.toISOString().split('T')[0])
        .lte('session_date', today.toISOString().split('T')[0])
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (data && data.length > 0) {
        setSelectedSessionForAttendanceContext(data[0].id);
        // Optionally set R and C levels from the most recent session
        // setSelectedRLevel(data[0].team_layer || 3);
        // setSelectedCLevel(data[0].collective_growth_phase || 2);
        toast.info(`Context set for session: ${data[0].title || data[0].session_date}`);
      } else {
        setSelectedSessionForAttendanceContext(null);
      }
      fetchRecentSessions();
    } catch (error: any) {
      console.error('Error fetching recent sessions for context:', error.message);
    }
  }, []);

  const handleApproveSession = async (sessionId: string) => { /* ... as before ... */ };
  const handleRejectSession = async (sessionId: string) => { /* ... as before ... */ };
  const handleEditSession = (sessionId: string) => { /* ... as before ... */ };
  const toggleSessionExpansion = (sessionId: string) => { /* ... as before ... */ };

  const handleTranscriptSubmit = async (finalTranscript: string) => {
    setIsProcessingVoice(true);
    setVoiceInputStatus('Processing your request...');
    setActionablePrompts([]); 

    const isPracticePlan = PRACTICE_PLANNING_PATTERNS.some(pattern => pattern.test(finalTranscript.toLowerCase()));
    const isReflection = REFLECTION_PATTERNS.some(pattern => pattern.test(finalTranscript.toLowerCase()));

    if (isPracticePlan) {
      toast.info(`Generating ARC-driven practice plan (R${selectedRLevel}/C${selectedCLevel}, ${sessionDuration}min)... Focus: ${finalTranscript}`);
      try {
        const response = await fetch('/api/generate-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coach_id: DEFAULT_COACH_ID,
            group_id: DEFAULT_GROUP_ID,
            responsibility_level: selectedRLevel,
            collective_growth_level: selectedCLevel,
            duration: sessionDuration,
            // Pass transcript as a general theme/focus hint if generate-blocks API supports it
            // For now, generate-blocks uses R and C for primary theme generation
            // We can add a 'focus_text': finalTranscript field to the API if needed
          }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
          toast.success(result.message || 'Practice plan generated!');
          fetchPendingSessions();
          fetchStats();
        } else {
          throw new Error(result.error || `API Error: ${response.status}`);
        }
      } catch (e: any) {
        console.error('Error calling generate-blocks API:', e.message);
        toast.error(`Plan generation failed: ${e.message}`);
      }
    } else if (isReflection) {
      toast.info("Reflection detected. Checking attendance...");
      if (!selectedSessionForAttendanceContext) {
         toast.warn("No recent session context for attendance. Logging reflection directly.");
         await logSimpleObservation(finalTranscript, "Reflection logged (no session context for attendance check).");
         setIsProcessingVoice(false);
         setVoiceInputStatus('Set ARC context & duration, then use voice for focus or log observations.');
         return;
      }
      try {
        const response = await fetch('/api/attendance-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reflection_text: finalTranscript,
            group_id: DEFAULT_GROUP_ID,
            coach_id: DEFAULT_COACH_ID,
            session_id: selectedSessionForAttendanceContext, 
          }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
          if (result.verification_result && result.verification_result.missing_players_prompts.length > 0) {
            setActionablePrompts(result.verification_result.missing_players_prompts);
            toast.info("Review missing players from reflection.");
          } else {
            toast.success("Reflection processed. All players seem accounted for.");
          }
          await logSimpleObservation(finalTranscript, "Reflection logged after attendance check.");
        } else {
          throw new Error(result.error || `API Error: ${response.status}`);
        }
      } catch (e: any) {
        console.error('Error calling attendance-verification API:', e.message);
        toast.error(`Attendance verification failed: ${e.message}. Logging reflection directly.`);
        await logSimpleObservation(finalTranscript, "Reflection logged (attendance check failed).");
      }
    } else {
      await logSimpleObservation(finalTranscript, "Observation logged.");
    }
    setIsProcessingVoice(false);
    setVoiceInputStatus('Set ARC context & duration, then use voice for focus or log observations.');
  };

  const logSimpleObservation = async (text: string, successMessage: string) => { /* ... as before ... */ };
  const handlePromptAction = async (prompt: MissingPlayerPrompt, action: 'mark_absent' | 'add_note' | 'dismiss') => { /* ... as before ... */ };

  useEffect(() => { /* ... Supabase subscriptions as before ... */ }, [fetchRecentSessions, fetchStats, fetchRecentSessionsForContext]);
  useEffect(() => { /* ... Initial data loading as before ... */ }, [fetchCoachInfo, fetchStats, fetchPendingSessions, fetchRecentSessionsForContext]);
  const formatDate = (dateString: string) => { /* ... as before ... */ };
  const getAttendanceCount = (session: any) => { /* ... as before ... */ };
  const getPracticeBlocks = (session: any) => { /* ... as before ... */ };

  return (
    <div className="coach-dashboard bg-gray-50 dark:bg-gray-900 min-h-screen pb-20">
      <header className="bg-indigo-600 text-white p-4 sticky top-0 z-10 shadow-md">
        {/* ... Header content as before ... */}
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {isLoading ? ( /* ... Loading UI ... */ ) : (
          <>
            {/* Quick Stats ... as before ... */}

            {/* ARC Practice Plan Generator Section */}
            <section className="mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4">
                  <h2 className="text-lg font-medium flex items-center gap-2">
                    <TrendingUp size={18} />
                    ARC Practice Plan Generator
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set team's ARC context and duration, then use voice for focus.
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  {/* Responsibility Level Selector */}
                  <div>
                    <label htmlFor="rLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Users2 size={16} className="inline mr-1" /> Responsibility (R) Level:
                    </label>
                    <select
                      id="rLevel"
                      value={selectedRLevel}
                      onChange={(e) => setSelectedRLevel(Number(e.target.value))}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {ARC_RESPONSIBILITY_LEVELS.map(r => (
                        <option key={r.level} value={r.level}>{r.level} - {r.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {ARC_RESPONSIBILITY_LEVELS.find(r => r.level === selectedRLevel)?.description}
                    </p>
                  </div>

                  {/* Collective Growth Level Selector */}
                  <div>
                    <label htmlFor="cLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <BookOpen size={16} className="inline mr-1" /> Collective Growth (C) Level:
                    </label>
                    <select
                      id="cLevel"
                      value={selectedCLevel}
                      onChange={(e) => setSelectedCLevel(Number(e.target.value))}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {ARC_COLLECTIVE_GROWTH_LEVELS.map(c => (
                        <option key={c.level} value={c.level}>{c.level} - {c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {ARC_COLLECTIVE_GROWTH_LEVELS.find(c => c.level === selectedCLevel)?.description}
                    </p>
                  </div>

                  {/* Session Duration Input */}
                  <div>
                    <label htmlFor="duration" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      <Clock size={16} className="inline mr-1" /> Session Duration (minutes):
                    </label>
                    <input
                      type="number"
                      id="duration"
                      value={sessionDuration}
                      onChange={(e) => setSessionDuration(Number(e.target.value))}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
                      min="30"
                      max="180"
                      step="5"
                    />
                  </div>
                  
                  <MinimalVoiceInput 
                    onTranscriptSubmit={handleTranscriptSubmit}
                    isApiProcessing={isProcessingVoice}
                    statusHint={voiceInputStatus}
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <p>Try saying: <em>"Focus on transition offense and defensive rotations"</em> or <em>"Log observation: Cole showed great court vision today."</em></p>
                  </div>
                </div>
              </div>
            </section>
            
            {/* Actionable Attendance Prompts Section ... as before ... */}
            {/* Pending Sessions Section ... as before ... */}
            {/* Recent Sessions Section ... as before ... */}
          </>
        )}
      </main>

      {/* Bottom Navigation ... as before ... */}
      {/* Loading Overlay ... as before ... */}
    </div>
  );
}
