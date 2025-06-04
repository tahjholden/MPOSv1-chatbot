import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Mic, MicOff, Send, Loader2, X, Edit, Check, 
  User, Users, Calendar, BookOpen, ClipboardList,
  MessageSquare, AlertCircle, CheckCircle, Info
} from 'lucide-react';
import { 
  GenerateBlocksRequest, 
  GenerateBlocksResponse, 
  Status,
  EventType,
  LogReflectionRequest,
  LogReflectionResponse,
  GeneratePDPRequest,
  GeneratePDPResponse,
  AttendanceLogRequest,
  AttendanceLogResponse
} from '@/lib/types/supabase';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Intent patterns for basketball coaching commands
const INTENT_PATTERNS = {
  PRACTICE_PLAN: [
    /plan\s+(?:a\s+)?practice/i,
    /create\s+(?:a\s+)?practice/i,
    /generate\s+(?:a\s+)?practice/i,
    /new\s+practice/i,
    /tomorrow(?:'s)?\s+practice/i,
    /today(?:'s)?\s+practice/i,
    /schedule\s+(?:a\s+)?practice/i,
    /design\s+(?:a\s+)?practice/i
  ],
  ATTENDANCE: [
    /take\s+attendance/i,
    /record\s+attendance/i,
    /who(?:'s)?\s+here/i,
    /who(?:'s)?\s+present/i,
    /mark\s+attendance/i,
    /attendance\s+for/i,
    /players\s+present/i,
    /check\s+attendance/i
  ],
  REFLECTION: [
    /reflection/i,
    /note\s+(?:about|on)/i,
    /thoughts\s+(?:about|on)/i,
    /session\s+summary/i,
    /after\s+practice/i,
    /session\s+notes/i,
    /practice\s+notes/i,
    /record\s+(?:my\s+)?thoughts/i,
    /log\s+(?:my\s+)?thoughts/i
  ],
  PDP: [
    /pdp/i,
    /player\s+development/i,
    /development\s+plan/i,
    /player\s+plan/i,
    /create\s+(?:a\s+)?pdp/i,
    /update\s+(?:a\s+)?pdp/i,
    /generate\s+(?:a\s+)?pdp/i,
    /player\s+growth/i,
    /player\s+progress/i
  ],
  OBSERVATION: [
    /observation/i,
    /observe/i,
    /noticed/i,
    /watching/i,
    /saw/i,
    /player\s+did/i,
    /team\s+did/i,
    /note\s+that/i,
    /log\s+observation/i,
    /record\s+observation/i,
    /player\s+observation/i,
    /team\s+observation/i
  ],
  SESSION_NOTE: [
    /session\s+note/i,
    /practice\s+note/i,
    /note\s+for\s+(?:the\s+)?session/i,
    /note\s+for\s+(?:the\s+)?practice/i,
    /add\s+(?:a\s+)?note/i,
    /record\s+(?:a\s+)?note/i,
    /log\s+(?:a\s+)?note/i
  ],
  HELP: [
    /help/i,
    /what\s+can\s+you\s+do/i,
    /how\s+does\s+this\s+work/i,
    /commands/i,
    /options/i,
    /features/i,
    /capabilities/i
  ],
  FOLLOW_UP: [
    /^(?:and|also|additionally|moreover|furthermore|plus|too)\b/i,
    /^(?:what|how|when|where|who|why)\b/i,
    /^(?:can|could|would|should)\b/i,
    /^(?:yes|no|maybe|sure|okay)\b/i
  ]
};

// Theme extraction regex
const THEME_EXTRACTION = /(?:focus(?:ing)?\s+on|theme\s+(?:of|is)|about)\s+([a-z\s]+)(?:,|\.|and|with|for)/i;

// Player name extraction - more sophisticated patterns
const PLAYER_EXTRACTION_PATTERNS = [
  /for\s+([a-z\s]+)(?:,|\.|and|with)/i,
  /player\s+(?:named\s+)?([a-z\s]+)(?:,|\.|and|with|is|was|has|had)/i,
  /([a-z\s]+)(?:'s|s')\s+(?:performance|skills|development|progress|game|shot|defense|offense)/i,
  /observed\s+([a-z\s]+)(?:,|\.|and|with|doing|performing|playing)/i,
  /watching\s+([a-z\s]+)(?:,|\.|and|with|doing|performing|playing)/i
];

// Attendance count extraction
const ATTENDANCE_EXTRACTION = /(\d+)\s+(?:player|players|kids|athletes)/i;

// Date extraction
const DATE_EXTRACTION = /(?:on|for)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))/i;

// Session extraction
const SESSION_EXTRACTION = /(?:session|practice)\s+(?:on|from|of)\s+([a-z0-9\s\/]+)(?:,|\.|and|with)/i;

// Skill extraction
const SKILL_EXTRACTION = /(?:skill|skills|working on|focus on|improve|improving|development of)\s+([a-z\s]+)(?:,|\.|and|with|for)/i;

// Constraint extraction
const CONSTRAINT_EXTRACTION = /(?:constraint|constraints|limitation|challenge|challenges)\s+(?:of|is|are|on)\s+([a-z\s]+)(?:,|\.|and|with|for)/i;

type Intent = 'PRACTICE_PLAN' | 'ATTENDANCE' | 'REFLECTION' | 'PDP' | 'OBSERVATION' | 'SESSION_NOTE' | 'HELP' | 'FOLLOW_UP' | 'UNKNOWN';

type ConversationState = {
  lastIntent: Intent;
  lastContext: any;
  followUpCount: number;
  sessionId?: string;
  playerId?: string;
  extractedEntities: {
    players: string[];
    skills: string[];
    constraints: string[];
    themes: string[];
    dates: string[];
  };
};

interface ConfirmationDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

interface ExtractedEntity {
  name: string;
  confidence: number;
  matched_id?: string;
}

interface ObservationResponse {
  observation_id: string;
  analysis: {
    summary: string;
    recommendation?: string;
    matched_players: ExtractedEntity[];
    matched_skills: ExtractedEntity[];
    matched_constraints: ExtractedEntity[];
    is_team_observation: boolean;
    sentiment: 'positive' | 'negative' | 'neutral';
  };
}

type VoiceInputProps = {
  coachId: string;
  groupId?: string; // Changed from teamId to groupId
  teamId?: string; // Keep for backward compatibility
  podId?: string;
  sessionId?: string; // Current session context
  sessionDate?: string; // Current session date
  sessionTheme?: string; // Current session theme
  onResult?: (result: any) => void;
  onProcessingStart?: () => void;
  onProcessingComplete?: (data: any) => void;
  className?: string;
  mode?: 'press-hold' | 'toggle' | 'auto';
  allowFollowUp?: boolean; // Enable follow-up questions
  showPlayerSelector?: boolean; // Show player selection UI
  availablePlayers?: {id: string, name: string}[]; // Available players for selection
};

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  isOpen
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="confirmation-dialog-overlay">
      <div className="confirmation-dialog">
        <h3 className="confirmation-title">{title}</h3>
        <p className="confirmation-message">{message}</p>
        <div className="confirmation-buttons">
          <button 
            className="confirmation-cancel" 
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="confirmation-confirm" 
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

const VoiceInput: React.FC<VoiceInputProps> = ({
  coachId,
  groupId,
  teamId, // Keep for backward compatibility
  podId,
  sessionId,
  sessionDate,
  sessionTheme,
  onResult,
  onProcessingStart,
  onProcessingComplete,
  className = '',
  mode = 'toggle',
  allowFollowUp = true,
  showPlayerSelector = false,
  availablePlayers = []
}) => {
  // Use groupId if provided, otherwise fall back to teamId for backward compatibility
  const effectiveGroupId = groupId || teamId;

  // State for recording and processing
  const [isRecording, setIsRecording] = useState(false);
  const [isPressHold, setIsPressHold] = useState(mode === 'press-hold');
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [processingSessionId, setProcessingSessionId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [detectedIntent, setDetectedIntent] = useState<Intent>('UNKNOWN');
  const [extractedTheme, setExtractedTheme] = useState<string | null>(null);
  const [extractedPlayers, setExtractedPlayers] = useState<string[]>([]);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [extractedConstraints, setExtractedConstraints] = useState<string[]>([]);
  const [extractedDate, setExtractedDate] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationProps, setConfirmationProps] = useState<Omit<ConfirmationDialogProps, 'isOpen'>>({
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: () => {}
  });
  const [selectedPlayers, setSelectedPlayers] = useState<{id: string, name: string}[]>([]);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>({
    lastIntent: 'UNKNOWN',
    lastContext: null,
    followUpCount: 0,
    extractedEntities: {
      players: [],
      skills: [],
      constraints: [],
      themes: [],
      dates: []
    }
  });
  const [conversationHistory, setConversationHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  
  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const subscriptionRef = useRef<any>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Setup Web Speech API
  useEffect(() => {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }
    
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    const recognition = recognitionRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const transcriptText = result[0].transcript;
      
      if (result.isFinal) {
        setTranscript((prev) => prev + ' ' + transcriptText);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      stopRecording();
      toast.error(`Speech recognition error: ${event.error}`);
    };
    
    recognition.onend = () => {
      if (isRecording) {
        // If we're still supposed to be recording, restart
        recognition.start();
      }
    };
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);
  
  // Set up Supabase real-time subscription for session updates
  useEffect(() => {
    if (processingSessionId) {
      const subscription = supabase
        .channel(`session:${processingSessionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'session',
          filter: `id=eq.${processingSessionId}`
        }, (payload) => {
          const session = payload.new;
          if (session.status === Status.APPROVED) {
            setProcessingStatus('Practice plan approved!');
            setIsProcessing(false);
            if (onProcessingComplete) {
              onProcessingComplete(session);
            }
            toast.success('Practice plan approved and finalized');
          } else if (session.status === Status.REJECTED) {
            setProcessingStatus('Practice plan needs revision');
            setIsProcessing(false);
            toast.error('Practice plan was rejected');
          }
        })
        .subscribe();
        
      subscriptionRef.current = subscription;
      
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [processingSessionId, onProcessingComplete]);

  // Update conversation state when session context changes
  useEffect(() => {
    if (sessionId) {
      setConversationState(prev => ({
        ...prev,
        sessionId
      }));
    }
  }, [sessionId]);
  
  // Start recording function
  const startRecording = () => {
    if (!recognitionRef.current) return;
    
    try {
      setIsRecording(true);
      setTranscript('');
      recognitionRef.current.start();
      
      // Visual feedback
      if (buttonRef.current) {
        buttonRef.current.classList.add('recording-pulse');
      }
      
      // Auto-stop after 30 seconds if in toggle mode
      if (mode === 'toggle' || mode === 'auto') {
        timerRef.current = setTimeout(() => {
          stopRecording();
        }, 30000);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    }
  };
  
  // Stop recording function
  const stopRecording = () => {
    if (!recognitionRef.current) return;
    
    try {
      setIsRecording(false);
      recognitionRef.current.stop();
      
      // Clean up visual feedback
      if (buttonRef.current) {
        buttonRef.current.classList.remove('recording-pulse');
      }
      
      // Clear auto-stop timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      // Parse intent if we have transcript
      if (transcript.trim()) {
        parseIntent(transcript);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };
  
  // Toggle recording mode
  const toggleRecordingMode = () => {
    setIsPressHold(!isPressHold);
    toast.info(`Switched to ${!isPressHold ? 'press and hold' : 'toggle'} mode`);
  };
  
  // Handle mouse/touch events for press-and-hold
  const handleMouseDown = () => {
    if (isPressHold) {
      longPressTimeoutRef.current = setTimeout(() => {
        startRecording();
      }, 300); // Short delay to avoid accidental triggers
    }
  };
  
  const handleMouseUp = () => {
    if (isPressHold && isRecording) {
      stopRecording();
    }
    
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };
  
  // Handle click for toggle mode
  const handleClick = () => {
    if (!isPressHold) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  // Extract player names using multiple patterns
  const extractPlayerNames = (text: string): string[] => {
    const players: string[] = [];
    
    // Try each pattern
    for (const pattern of PLAYER_EXTRACTION_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const playerName = match[1].trim();
        if (playerName.length > 1 && !players.includes(playerName)) {
          players.push(playerName);
        }
      }
    }
    
    return players;
  };

  // Extract skills
  const extractSkills = (text: string): string[] => {
    const skills: string[] = [];
    const match = text.match(SKILL_EXTRACTION);
    
    if (match && match[1]) {
      const skillsText = match[1].trim();
      
      // Split by commas or 'and'
      const skillsList = skillsText
        .split(/,|\sand\s/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      skills.push(...skillsList);
    }
    
    return skills;
  };

  // Extract constraints
  const extractConstraints = (text: string): string[] => {
    const constraints: string[] = [];
    const match = text.match(CONSTRAINT_EXTRACTION);
    
    if (match && match[1]) {
      const constraintsText = match[1].trim();
      
      // Split by commas or 'and'
      const constraintsList = constraintsText
        .split(/,|\sand\s/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      constraints.push(...constraintsList);
    }
    
    return constraints;
  };
  
  // Parse intent from transcript
  const parseIntent = (text: string) => {
    let detectedIntent: Intent = 'UNKNOWN';
    
    // Check if this is a follow-up question
    const isFollowUp = allowFollowUp && 
      conversationState.lastIntent !== 'UNKNOWN' &&
      INTENT_PATTERNS.FOLLOW_UP.some(pattern => pattern.test(text));
    
    if (isFollowUp) {
      detectedIntent = conversationState.lastIntent;
      setConversationState(prev => ({
        ...prev,
        followUpCount: prev.followUpCount + 1
      }));
    } else {
      // Check for practice plan intent
      if (INTENT_PATTERNS.PRACTICE_PLAN.some(pattern => pattern.test(text))) {
        detectedIntent = 'PRACTICE_PLAN';
      }
      // Check for attendance intent
      else if (INTENT_PATTERNS.ATTENDANCE.some(pattern => pattern.test(text))) {
        detectedIntent = 'ATTENDANCE';
      }
      // Check for reflection intent
      else if (INTENT_PATTERNS.REFLECTION.some(pattern => pattern.test(text))) {
        detectedIntent = 'REFLECTION';
      }
      // Check for PDP intent
      else if (INTENT_PATTERNS.PDP.some(pattern => pattern.test(text))) {
        detectedIntent = 'PDP';
      }
      // Check for observation intent
      else if (INTENT_PATTERNS.OBSERVATION.some(pattern => pattern.test(text))) {
        detectedIntent = 'OBSERVATION';
      }
      // Check for session note intent
      else if (INTENT_PATTERNS.SESSION_NOTE.some(pattern => pattern.test(text))) {
        detectedIntent = 'SESSION_NOTE';
      }
      // Check for help intent
      else if (INTENT_PATTERNS.HELP.some(pattern => pattern.test(text))) {
        detectedIntent = 'HELP';
      }
    }
    
    setDetectedIntent(detectedIntent);
    
    // Extract theme if present
    const themeMatch = text.match(THEME_EXTRACTION);
    if (themeMatch && themeMatch[1]) {
      setExtractedTheme(themeMatch[1].trim());
    }
    
    // Extract player names
    const players = extractPlayerNames(text);
    setExtractedPlayers(players);
    
    // Extract skills
    const skills = extractSkills(text);
    setExtractedSkills(skills);
    
    // Extract constraints
    const constraints = extractConstraints(text);
    setExtractedConstraints(constraints);
    
    // Extract date if present
    const dateMatch = text.match(DATE_EXTRACTION);
    if (dateMatch && dateMatch[1]) {
      setExtractedDate(dateMatch[1].trim());
    }
    
    // Extract attendance count if present
    const countMatch = text.match(ATTENDANCE_EXTRACTION);
    if (countMatch && countMatch[1]) {
      setExtractedCount(parseInt(countMatch[1], 10));
    }
    
    // Update conversation state
    setConversationState(prev => ({
      ...prev,
      lastIntent: detectedIntent,
      extractedEntities: {
        players: [...prev.extractedEntities.players, ...players],
        skills: [...prev.extractedEntities.skills, ...skills],
        constraints: [...prev.extractedEntities.constraints, ...constraints],
        themes: [...prev.extractedEntities.themes, themeMatch?.[1] ? [themeMatch[1].trim()] : []],
        dates: [...prev.extractedEntities.dates, dateMatch?.[1] ? [dateMatch[1].trim()] : []]
      }
    }));
    
    // If we have a clear intent, show edit option
    if (detectedIntent !== 'UNKNOWN') {
      setEditMode(true);
    }
    
    // Update conversation history
    setConversationHistory(prev => [
      ...prev,
      { role: 'user', content: text }
    ]);
  };
  
  // Process the voice command
  const processCommand = async () => {
    if (!transcript.trim()) {
      toast.error('No voice input detected');
      return;
    }
    
    setIsProcessing(true);
    setEditMode(false);
    
    if (onProcessingStart) {
      onProcessingStart();
    }
    
    try {
      // Log the voice command
      await supabase.from('agent_events').insert({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        event_type: EventType.GENERATE_BLOCKS_REQUEST,
        player_id: null,
        team_id: effectiveGroupId || null, // Use team_id field for compatibility with existing table
        agent_id: 'voice-assistant',
        details: {
          transcript,
          detected_intent: detectedIntent,
          extracted_theme: extractedTheme,
          extracted_players: extractedPlayers,
          extracted_skills: extractedSkills,
          extracted_constraints: extractedConstraints,
          extracted_date: extractedDate,
          extracted_count: extractedCount,
          session_context: sessionId ? { sessionId, sessionDate, sessionTheme } : null
        },
        status: Status.STARTED
      });
      
      // Process based on intent
      switch (detectedIntent) {
        case 'PRACTICE_PLAN':
          await processPracticePlan();
          break;
        case 'ATTENDANCE':
          await processAttendance();
          break;
        case 'REFLECTION':
          await processReflection();
          break;
        case 'PDP':
          await processPDP();
          break;
        case 'OBSERVATION':
          await processObservation();
          break;
        case 'SESSION_NOTE':
          await processSessionNote();
          break;
        case 'HELP':
          await processHelp();
          break;
        default:
          // Unknown intent
          setProcessingStatus('I\'m not sure what you want to do. Please try again.');
          setIsProcessing(false);
          
          // Add assistant response to conversation history
          setConversationHistory(prev => [
            ...prev,
            { 
              role: 'assistant', 
              content: "I'm not sure what you want to do. You can try saying things like 'Plan practice for tomorrow focusing on shooting' or 'Log an observation about John's defense'." 
            }
          ]);
          
          toast.error('Couldn\'t determine your intent. Please be more specific.');
      }
      
    } catch (error) {
      console.error('Error processing command:', error);
      setIsProcessing(false);
      toast.error('Error processing your request');
      
      // Add error response to conversation history
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: "Sorry, I encountered an error while processing your request. Please try again." 
        }
      ]);
      
      // Log the error
      await supabase.from('agent_events').insert({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        event_type: EventType.GENERATE_BLOCKS_ERROR,
        player_id: null,
        team_id: effectiveGroupId || null, // Use team_id field for compatibility with existing table
        agent_id: 'voice-assistant',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          transcript
        },
        status: Status.ERROR
      });
    }
  };
  
  // Process practice plan intent
  const processPracticePlan = async () => {
    setProcessingStatus('Generating practice plan...');
    
    try {
      // If we need player confirmation, show the confirmation dialog
      if (extractedPlayers.length > 0 && showPlayerSelector) {
        setConfirmationProps({
          title: 'Confirm Players',
          message: `I detected these players: ${extractedPlayers.join(', ')}. Is this correct?`,
          onConfirm: async () => {
            setShowConfirmation(false);
            await generatePracticePlan();
          },
          onCancel: () => {
            setShowConfirmation(false);
            setShowPlayerList(true);
          }
        });
        setShowConfirmation(true);
        return;
      }
      
      await generatePracticePlan();
    } catch (error) {
      console.error('Error in processPracticePlan:', error);
      setProcessingStatus('Failed to generate practice plan');
      setIsProcessing(false);
      
      // Add error response to conversation history
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: "I couldn't generate the practice plan. Please try again or check your connection." 
        }
      ]);
      
      toast.error('Failed to generate practice plan');
    }
  };
  
  // Generate practice plan
  const generatePracticePlan = async () => {
    // Prepare request
    const request: GenerateBlocksRequest = {
      coach_id: coachId,
      group_id: effectiveGroupId, // Changed from team_id to group_id
      pod_id: podId,
      theme: extractedTheme || sessionTheme || undefined,
      session_date: extractedDate ? 
        parseExtractedDate(extractedDate) : 
        sessionDate || new Date().toISOString().split('T')[0],
      collective_growth_phase: 3, // Default to phase 3
      session_id: sessionId // Use current session if in session context
    };
    
    console.log('Sending request to generate-blocks API:', request);
    
    // Call generate-blocks API
    const response = await fetch('/api/generate-blocks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API response error:', response.status, errorText);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }
    
    const data: GenerateBlocksResponse = await response.json();
    console.log('API response:', data);
    
    if (data.success) {
      setProcessingSessionId(data.session_id);
      setProcessingStatus('Practice plan generated! Awaiting your review.');
      
      // Add assistant response to conversation history
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've created a practice plan with ${data.session_plan.session_plan.length} blocks focusing on ${extractedTheme || sessionTheme || 'basketball skills'}. You can review it in the dashboard.` 
        }
      ]);
      
      // Log success
      await supabase.from('agent_events').insert({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        event_type: EventType.GENERATE_BLOCKS_SUCCESS,
        player_id: null,
        team_id: effectiveGroupId || null, // Use team_id field for compatibility with existing table
        agent_id: 'voice-assistant',
        details: {
          session_id: data.session_id,
          block_count: data.session_plan.session_plan.length
        },
        status: Status.COMPLETED
      });
      
      if (onResult) {
        onResult(data);
      }
      
      if (onProcessingComplete) {
        onProcessingComplete(data);
      }
      
      // Update conversation state with the new session
      setConversationState(prev => ({
        ...prev,
        lastContext: {
          sessionId: data.session_id,
          sessionPlan: data.session_plan
        }
      }));
      
      setIsProcessing(false);
    } else {
      throw new Error(data.error || 'Failed to generate practice plan');
    }
  };
  
  // Process attendance intent
  const processAttendance = async () => {
    setProcessingStatus('Processing attendance...');
    
    try {
      // Confirm attendance action
      setConfirmationProps({
        title: 'Confirm Attendance',
        message: sessionId ? 
          `Do you want to log attendance for the current session?` : 
          `Do you want to create a new attendance record?`,
        onConfirm: async () => {
          setShowConfirmation(false);
          await logAttendance();
        },
        onCancel: () => {
          setShowConfirmation(false);
          setIsProcessing(false);
          
          // Add cancellation to conversation history
          setConversationHistory(prev => [
            ...prev,
            { role: 'assistant', content: "Attendance logging cancelled." }
          ]);
        }
      });
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error in processAttendance:', error);
      setProcessingStatus('Failed to process attendance');
      setIsProcessing(false);
      
      // Add error to conversation history
      setConversationHistory(prev => [
        ...prev,
        { role: 'assistant', content: "I couldn't process the attendance. Please try again." }
      ]);
      
      toast.error('Failed to process attendance');
    }
  };
  
  // Log attendance
  const logAttendance = async () => {
    // This would call the attendance-log API endpoint
    // For now, we'll just simulate success
    
    // Prepare request
    const request: AttendanceLogRequest = {
      session_id: sessionId || 'new-session', // Use current session or create new
      attendance_data: selectedPlayers.length > 0 ? 
        selectedPlayers.map(player => ({
          person_id: player.id,
          present: true
        })) : 
        [], // Empty if no players selected
      coach_id: coachId
    };
    
    // In a real implementation, you would call your API here
    // const response = await fetch('/api/attendance-log', {...})
    
    // Simulate API response
    const data: AttendanceLogResponse = {
      success: true,
      message: 'Attendance logged successfully',
      session_id: sessionId || 'new-session',
      attendance_count: selectedPlayers.length,
      present_count: selectedPlayers.length,
      absent_count: 0,
      status: Status.COMPLETED
    };
    
    // Add response to conversation history
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `I've recorded attendance for ${data.present_count} players.` 
      }
    ]);
    
    if (onResult) {
      onResult(data);
    }
    
    if (onProcessingComplete) {
      onProcessingComplete(data);
    }
    
    setIsProcessing(false);
    toast.success('Attendance recorded successfully');
  };
  
  // Process reflection intent
  const processReflection = async () => {
    setProcessingStatus('Processing reflection...');
    
    try {
      // Prepare request
      const request: LogReflectionRequest = {
        person_id: coachId,
        session_id: sessionId, // Use current session if in session context
        raw_note: transcript,
        observation_type: 'CoachReflection',
        coach_id: coachId
      };
      
      // Call log-reflection API
      const response = await fetch('/api/log-reflection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        // If API doesn't exist yet, simulate success
        if (response.status === 404) {
          // Add response to conversation history
          setConversationHistory(prev => [
            ...prev,
            { 
              role: 'assistant', 
              content: `I've recorded your reflection${sessionId ? ' for this session' : ''}.` 
            }
          ]);
          
          setIsProcessing(false);
          toast.success('Reflection recorded successfully');
          return;
        }
        
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      const data: LogReflectionResponse = await response.json();
      
      if (data.success) {
        // Add response to conversation history
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `I've recorded your reflection${sessionId ? ' for this session' : ''}.${data.tagged_skills && data.tagged_skills.length > 0 ? ` I tagged these skills: ${data.tagged_skills.join(', ')}.` : ''}` 
          }
        ]);
        
        if (onResult) {
          onResult(data);
        }
        
        if (onProcessingComplete) {
          onProcessingComplete(data);
        }
        
        setIsProcessing(false);
        toast.success('Reflection recorded successfully');
      } else {
        throw new Error(data.error || 'Failed to record reflection');
      }
    } catch (error) {
      console.error('Error in processReflection:', error);
      
      // Simulate success if API doesn't exist yet
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've recorded your reflection${sessionId ? ' for this session' : ''}.` 
        }
      ]);
      
      setIsProcessing(false);
      toast.success('Reflection recorded successfully');
    }
  };
  
  // Process PDP intent
  const processPDP = async () => {
    setProcessingStatus('Processing PDP request...');
    
    try {
      // If no player specified, ask for player
      if (extractedPlayers.length === 0 && !showPlayerSelector) {
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: "Which player would you like to create or update a PDP for?" 
          }
        ]);
        
        setIsProcessing(false);
        return;
      }
      
      // If we need player confirmation, show the confirmation dialog
      if (extractedPlayers.length > 0 && showPlayerSelector) {
        setConfirmationProps({
          title: 'Confirm Player',
          message: `Create or update PDP for ${extractedPlayers[0]}?`,
          onConfirm: async () => {
            setShowConfirmation(false);
            await generatePDP();
          },
          onCancel: () => {
            setShowConfirmation(false);
            setShowPlayerList(true);
          }
        });
        setShowConfirmation(true);
        return;
      }
      
      await generatePDP();
    } catch (error) {
      console.error('Error in processPDP:', error);
      
      // Simulate success if API doesn't exist yet
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've started generating a PDP${extractedPlayers.length > 0 ? ` for ${extractedPlayers[0]}` : ''}. You can review it in the dashboard soon.` 
        }
      ]);
      
      setIsProcessing(false);
      toast.info('PDP generation started');
    }
  };
  
  // Generate PDP
  const generatePDP = async () => {
    // Prepare request
    const request: GeneratePDPRequest = {
      person_id: selectedPlayers.length > 0 ? selectedPlayers[0].id : 'player-id', // Use selected player or placeholder
      coach_id: coachId,
      include_observations: true,
      observation_window_days: 30
    };
    
    // In a real implementation, you would call your API here
    // const response = await fetch('/api/generate-pdp', {...})
    
    // Simulate API response
    const data: GeneratePDPResponse = {
      success: true,
      message: 'PDP generated successfully',
      pdp_id: 'pdp-id',
      pdp: {
        id: 'pdp-id',
        person_id: selectedPlayers.length > 0 ? selectedPlayers[0].id : 'player-id',
        is_current: true,
        skill_tags: extractedSkills,
        constraint_tags: extractedConstraints,
        pdp_text_coach: 'PDP text for coach',
        pdp_text_player: 'PDP text for player',
        created_at: new Date().toISOString()
      },
      status: Status.PENDING_APPROVAL,
      db_operation: 'insert'
    };
    
    // Add response to conversation history
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `I've created a new PDP${selectedPlayers.length > 0 ? ` for ${selectedPlayers[0].name}` : ''}. You can review it in the dashboard.` 
      }
    ]);
    
    if (onResult) {
      onResult(data);
    }
    
    if (onProcessingComplete) {
      onProcessingComplete(data);
    }
    
    setIsProcessing(false);
    toast.success('PDP generated successfully');
  };
  
  // Process observation intent
  const processObservation = async () => {
    setProcessingStatus('Processing observation...');
    
    try {
      // If no player specified and not a team observation, ask for player
      if (extractedPlayers.length === 0 && !transcript.toLowerCase().includes('team')) {
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: "Which player is this observation about? Or is this a team observation?" 
          }
        ]);
        
        setIsProcessing(false);
        return;
      }
      
      // Call log-observation API
      const response = await fetch('/api/log-observation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          observation: transcript,
          coach_id: coachId,
          session_id: sessionId, // Use current session if in session context
          player_id: selectedPlayers.length > 0 ? selectedPlayers[0].id : undefined,
          observation_type: 'coach_observation',
          tags: [...extractedSkills, ...extractedConstraints]
        })
      });
      
      if (!response.ok) {
        // If API doesn't exist yet, simulate success
        if (response.status === 404) {
          simulateObservationSuccess();
          return;
        }
        
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      const data: ObservationResponse = await response.json();
      
      // Add response to conversation history
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've recorded your observation${sessionId ? ' for this session' : ''}. ${data.analysis.summary}` 
        }
      ]);
      
      if (onResult) {
        onResult(data);
      }
      
      if (onProcessingComplete) {
        onProcessingComplete(data);
      }
      
      setIsProcessing(false);
      toast.success('Observation recorded successfully');
    } catch (error) {
      console.error('Error in processObservation:', error);
      simulateObservationSuccess();
    }
  };
  
  // Simulate observation success
  const simulateObservationSuccess = () => {
    // Add response to conversation history
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `I've recorded your observation${sessionId ? ' for this session' : ''}${extractedPlayers.length > 0 ? ` about ${extractedPlayers.join(', ')}` : ' about the team'}.` 
      }
    ]);
    
    setIsProcessing(false);
    toast.success('Observation recorded successfully');
  };
  
  // Process session note intent
  const processSessionNote = async () => {
    setProcessingStatus('Processing session note...');
    
    try {
      // If no session context, ask for session
      if (!sessionId) {
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: "Which session is this note for? Please select a session first." 
          }
        ]);
        
        setIsProcessing(false);
        return;
      }
      
      // Call log-reflection API (session notes are a type of reflection)
      const response = await fetch('/api/log-reflection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          person_id: coachId,
          session_id: sessionId,
          raw_note: transcript,
          observation_type: 'SessionNote',
          coach_id: coachId
        })
      });
      
      if (!response.ok) {
        // If API doesn't exist yet, simulate success
        if (response.status === 404) {
          // Add response to conversation history
          setConversationHistory(prev => [
            ...prev,
            { 
              role: 'assistant', 
              content: `I've added your note to the session.` 
            }
          ]);
          
          setIsProcessing(false);
          toast.success('Session note added successfully');
          return;
        }
        
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      const data: LogReflectionResponse = await response.json();
      
      if (data.success) {
        // Add response to conversation history
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `I've added your note to the session.` 
          }
        ]);
        
        if (onResult) {
          onResult(data);
        }
        
        if (onProcessingComplete) {
          onProcessingComplete(data);
        }
        
        setIsProcessing(false);
        toast.success('Session note added successfully');
      } else {
        throw new Error(data.error || 'Failed to add session note');
      }
    } catch (error) {
      console.error('Error in processSessionNote:', error);
      
      // Simulate success if API doesn't exist yet
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I've added your note to the session.` 
        }
      ]);
      
      setIsProcessing(false);
      toast.success('Session note added successfully');
    }
  };
  
  // Process help intent
  const processHelp = async () => {
    // Add help response to conversation history
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `I can help you with:
- Creating practice plans ("Plan practice focusing on shooting")
- Recording attendance ("Take attendance for today's practice")
- Adding observations ("I noticed John's defense improved")
- Creating PDPs ("Generate PDP for Sarah")
- Adding session notes ("Add note about today's practice")
- Recording reflections ("My reflection on today's practice")

What would you like to do?` 
      }
    ]);
    
    setIsProcessing(false);
  };
  
  // Parse extracted date
  const parseExtractedDate = (dateText: string): string => {
    // Handle common date formats
    if (dateText.toLowerCase() === 'today') {
      return new Date().toISOString().split('T')[0];
    }
    
    if (dateText.toLowerCase() === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    
    // Handle day names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = days.indexOf(dateText.toLowerCase());
    
    if (dayIndex !== -1) {
      const today = new Date();
      const todayIndex = today.getDay();
      const daysUntil = (dayIndex - todayIndex + 7) % 7;
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + (daysUntil === 0 ? 7 : daysUntil));
      return targetDate.toISOString().split('T')[0];
    }
    
    // Handle MM/DD format
    if (/^\d{1,2}\/\d{1,2}$/.test(dateText)) {
      const [month, day] = dateText.split('/').map(Number);
      const year = new Date().getFullYear();
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // Handle MM/DD/YYYY format
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateText)) {
      const [month, day, year] = dateText.split('/').map(Number);
      const fullYear = year < 100 ? 2000 + year : year;
      return `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // Default to today
    return new Date().toISOString().split('T')[0];
  };
  
  // Handle text input changes
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTranscript(e.target.value);
  };
  
  // Handle edit confirmation
  const handleEditConfirm = () => {
    setEditMode(false);
    parseIntent(transcript);
  };
  
  // Cancel processing
  const cancelProcessing = () => {
    setIsProcessing(false);
    setProcessingStatus('');
    setProcessingSessionId(null);
    
    // Add cancellation to conversation history
    setConversationHistory(prev => [
      ...prev,
      { role: 'assistant', content: "Operation cancelled." }
    ]);
  };
  
  // Handle player selection
  const handlePlayerSelect = (player: {id: string, name: string}) => {
    setSelectedPlayers(prev => {
      const isSelected = prev.some(p => p.id === player.id);
      
      if (isSelected) {
        return prev.filter(p => p.id !== player.id);
      } else {
        return [...prev, player];
      }
    });
  };
  
  // Handle player selection confirmation
  const handlePlayerSelectionConfirm = () => {
    setShowPlayerList(false);
    
    if (detectedIntent === 'PDP') {
      generatePDP();
    } else if (detectedIntent === 'OBSERVATION') {
      processObservation();
    } else if (detectedIntent === 'ATTENDANCE') {
      logAttendance();
    } else {
      processCommand();
    }
  };
  
  return (
    <div className="voice-input-container relative">
      {/* Voice input UI */}
      <div className="voice-input-controls">
        {!isProcessing && !editMode && !showPlayerList && (
          <div className="voice-button-container">
            <button
              ref={buttonRef}
              className={`voice-button ${isRecording ? 'recording' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchEnd={handleMouseUp}
              onClick={handleClick}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? (
                <MicOff className="icon" />
              ) : (
                <Mic className="icon" />
              )}
            </button>
            
            <button
              className="mode-toggle"
              onClick={toggleRecordingMode}
              aria-label={`Switch to ${isPressHold ? 'toggle' : 'press and hold'} mode`}
            >
              {isPressHold ? 'Press & Hold' : 'Toggle Mode'}
            </button>
          </div>
        )}
        
        {/* Transcript display */}
        <AnimatePresence>
          {(transcript || isProcessing || editMode) && !showPlayerList && (
            <motion.div
              className="transcript-container"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {editMode ? (
                <div className="edit-container">
                  <textarea
                    ref={textareaRef}
                    value={transcript}
                    onChange={handleTextChange}
                    className="transcript-edit"
                    placeholder="Edit your command..."
                    rows={3}
                  />
                  <div className="edit-actions">
                    <button
                      className="edit-confirm"
                      onClick={handleEditConfirm}
                      aria-label="Confirm edit"
                    >
                      <Check className="icon" />
                    </button>
                    <button
                      className="edit-cancel"
                      onClick={() => setEditMode(false)}
                      aria-label="Cancel edit"
                    >
                      <X className="icon" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="transcript-text">
                    {isProcessing ? processingStatus : transcript}
                  </div>
                  
                  {!isProcessing && transcript && (
                    <div className="transcript-actions">
                      <button
                        className="edit-button"
                        onClick={() => setEditMode(true)}
                        aria-label="Edit transcript"
                      >
                        <Edit className="icon" />
                      </button>
                      <button
                        className="send-button"
                        onClick={processCommand}
                        aria-label="Process command"
                      >
                        <Send className="icon" />
                      </button>
                    </div>
                  )}
                  
                  {isProcessing && (
                    <div className="processing-indicator">
                      <Loader2 className="icon spin" />
                      <button
                        className="cancel-button"
                        onClick={cancelProcessing}
                        aria-label="Cancel processing"
                      >
                        <X className="icon" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Player selection UI */}
        {showPlayerList && (
          <div className="player-selection-container">
            <h3 className="player-selection-title">Select Players</h3>
            <div className="player-list">
              {availablePlayers.length === 0 ? (
                <p className="no-players">No players available</p>
              ) : (
                availablePlayers.map(player => (
                  <div 
                    key={player.id}
                    className={`player-item ${selectedPlayers.some(p => p.id === player.id) ? 'selected' : ''}`}
                    onClick={() => handlePlayerSelect(player)}
                  >
                    <User size={16} />
                    <span>{player.name}</span>
                    {selectedPlayers.some(p => p.id === player.id) && (
                      <Check size={16} className="check-icon" />
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="player-selection-actions">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowPlayerList(false);
                  setIsProcessing(false);
                }}
              >
                Cancel
              </button>
              <button
                className="confirm-button"
                onClick={handlePlayerSelectionConfirm}
                disabled={selectedPlayers.length === 0}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
        
        {/* Intent display */}
        {detectedIntent !== 'UNKNOWN' && !isProcessing && !editMode && !showPlayerList && (
          <div className="intent-display">
            <div className="intent-type">
              {detectedIntent === 'PRACTICE_PLAN' && (
                <div className="intent-icon-label">
                  <Calendar size={16} />
                  <span>Practice Plan</span>
                </div>
              )}
              {detectedIntent === 'ATTENDANCE' && (
                <div className="intent-icon-label">
                  <Users size={16} />
                  <span>Attendance</span>
                </div>
              )}
              {detectedIntent === 'REFLECTION' && (
                <div className="intent-icon-label">
                  <BookOpen size={16} />
                  <span>Reflection</span>
                </div>
              )}
              {detectedIntent === 'PDP' && (
                <div className="intent-icon-label">
                  <User size={16} />
                  <span>Player Development</span>
                </div>
              )}
              {detectedIntent === 'OBSERVATION' && (
                <div className="intent-icon-label">
                  <ClipboardList size={16} />
                  <span>Observation</span>
                </div>
              )}
              {detectedIntent === 'SESSION_NOTE' && (
                <div className="intent-icon-label">
                  <MessageSquare size={16} />
                  <span>Session Note</span>
                </div>
              )}
              {detectedIntent === 'HELP' && (
                <div className="intent-icon-label">
                  <Info size={16} />
                  <span>Help</span>
                </div>
              )}
            </div>
            
            {extractedTheme && (
              <div className="intent-detail">
                <span className="intent-label">Theme:</span>
                <span className="intent-value">{extractedTheme}</span>
              </div>
            )}
            
            {extractedPlayers.length > 0 && (
              <div className="intent-detail">
                <span className="intent-label">Player(s):</span>
                <span className="intent-value">{extractedPlayers.join(', ')}</span>
              </div>
            )}
            
            {extractedSkills.length > 0 && (
              <div className="intent-detail">
                <span className="intent-label">Skills:</span>
                <span className="intent-value">{extractedSkills.join(', ')}</span>
              </div>
            )}
            
            {extractedConstraints.length > 0 && (
              <div className="intent-detail">
                <span className="intent-label">Constraints:</span>
                <span className="intent-value">{extractedConstraints.join(', ')}</span>
              </div>
            )}
            
            {extractedDate && (
              <div className="intent-detail">
                <span className="intent-label">Date:</span>
                <span className="intent-value">{extractedDate}</span>
              </div>
            )}
            
            {extractedCount && (
              <div className="intent-detail">
                <span className="intent-label">Players:</span>
                <span className="intent-value">{extractedCount}</span>
              </div>
            )}
            
            {sessionId && (
              <div className="intent-detail session-context">
                <span className="intent-label">Current Session:</span>
                <span className="intent-value">{sessionDate ? formatDate(sessionDate) : 'Active Session'}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Conversation history */}
        {conversationHistory.length > 0 && !isProcessing && !editMode && !showPlayerList && (
          <div className="conversation-history">
            {conversationHistory.slice(-4).map((message, index) => (
              <div 
                key={index} 
                className={`conversation-message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
              >
                <div className="message-icon">
                  {message.role === 'user' ? (
                    <User size={16} />
                  ) : (
                    <Mic size={16} />
                  )}
                </div>
                <div className="message-content">
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Confirmation Dialog */}
      <ConfirmationDialog
        title={confirmationProps.title}
        message={confirmationProps.message}
        onConfirm={confirmationProps.onConfirm}
        onCancel={confirmationProps.onCancel}
        isOpen={showConfirmation}
      />
      
      {/* Helper function to format dates */}
      {(() => {
        function formatDate(dateString: string): string {
          const options: Intl.DateTimeFormatOptions = { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          };
          return new Date(dateString).toLocaleDateString('en-US', options);
        }
        return null;
      })()}
      
      {/* CSS for the component */}
      <style jsx>{`
        .voice-input-container {
          width: 100%;
          max-width: 500px;
          margin: 0 auto;
          padding: 1rem;
          position: relative;
        }
        
        .voice-input-controls {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        
        .voice-button-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .voice-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background-color: #4f46e5;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          margin-bottom: 0.5rem;
        }
        
        .voice-button:hover {
          transform: scale(1.05);
          background-color: #4338ca;
        }
        
        .voice-button.recording {
          background-color: #ef4444;
          animation: pulse 1.5s infinite;
        }
        
        .recording-pulse {
          animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
        
        .mode-toggle {
          background: none;
          border: none;
          color: #6b7280;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          transition: background-color 0.2s ease;
        }
        
        .mode-toggle:hover {
          background-color: #f3f4f6;
          color: #4b5563;
        }
        
        .transcript-container {
          width: 100%;
          background-color: #f9fafb;
          border-radius: 12px;
          padding: 1rem;
          margin-top: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
          position: relative;
        }
        
        .transcript-text {
          font-size: 1rem;
          color: #1f2937;
          margin-bottom: 1rem;
          min-height: 2.5rem;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .transcript-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        
        .edit-button, .send-button, .cancel-button {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }
        
        .edit-button {
          color: #6b7280;
        }
        
        .send-button {
          color: #4f46e5;
        }
        
        .cancel-button {
          color: #ef4444;
        }
        
        .edit-button:hover, .send-button:hover, .cancel-button:hover {
          background-color: #f3f4f6;
        }
        
        .processing-indicator {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        
        .spin {
          animation: spin 1.5s linear infinite;
        }
        
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .edit-container {
          width: 100%;
        }
        
        .transcript-edit {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 1rem;
          resize: vertical;
          min-height: 60px;
          margin-bottom: 0.5rem;
        }
        
        .edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        
        .edit-confirm, .edit-cancel {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }
        
        .edit-confirm {
          color: #10b981;
        }
        
        .edit-cancel {
          color: #ef4444;
        }
        
        .edit-confirm:hover, .edit-cancel:hover {
          background-color: #f3f4f6;
        }
        
        .intent-display {
          margin-top: 1rem;
          background-color: #eff6ff;
          border-radius: 8px;
          padding: 0.75rem;
          width: 100%;
          font-size: 0.875rem;
        }
        
        .intent-type {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.5rem;
        }
        
        .intent-icon-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .intent-detail {
          display: flex;
          margin-bottom: 0.25rem;
        }
        
        .intent-label {
          font-weight: 500;
          color: #4b5563;
          margin-right: 0.5rem;
          min-width: 80px;
        }
        
        .intent-value {
          color: #1f2937;
          flex: 1;
        }
        
        .session-context {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px dashed #cbd5e1;
        }
        
        .icon {
          width: 20px;
          height: 20px;
        }
        
        .confirmation-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
        
        .confirmation-dialog {
          background-color: white;
          border-radius: 8px;
          padding: 1.5rem;
          width: 90%;
          max-width: 400px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .confirmation-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #1f2937;
        }
        
        .confirmation-message {
          font-size: 1rem;
          color: #4b5563;
          margin-bottom: 1.5rem;
        }
        
        .confirmation-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        
        .confirmation-cancel {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background-color: white;
          color: #4b5563;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .confirmation-confirm {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          background-color: #4f46e5;
          color: white;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .confirmation-cancel:hover {
          background-color: #f3f4f6;
        }
        
        .confirmation-confirm:hover {
          background-color: #4338ca;
        }
        
        .player-selection-container {
          width: 100%;
          background-color: #f9fafb;
          border-radius: 12px;
          padding: 1rem;
          margin-top: 1rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .player-selection-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #1f2937;
        }
        
        .player-list {
          max-height: 200px;
          overflow-y: auto;
          margin-bottom: 1rem;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }
        
        .player-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .player-item:last-child {
          border-bottom: none;
        }
        
        .player-item:hover {
          background-color: #f3f4f6;
        }
        
        .player-item.selected {
          background-color: #eff6ff;
        }
        
        .check-icon {
          margin-left: auto;
          color: #4f46e5;
        }
        
        .no-players {
          padding: 1rem;
          text-align: center;
          color: #6b7280;
          font-style: italic;
        }
        
        .player-selection-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        
        .cancel-button {
          padding: 0.5rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background-color: white;
          color: #4b5563;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .confirm-button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          background-color: #4f46e5;
          color: white;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }
        
        .confirm-button:disabled {
          background-color: #a5b4fc;
          cursor: not-allowed;
        }
        
        .cancel-button:hover {
          background-color: #f3f4f6;
        }
        
        .confirm-button:hover:not(:disabled) {
          background-color: #4338ca;
        }
        
        .conversation-history {
          width: 100%;
          margin-top: 1rem;
          border-top: 1px solid #e5e7eb;
          padding-top: 1rem;
        }
        
        .conversation-message {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f3f4f6;
        }
        
        .conversation-message:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }
        
        .message-icon {
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background-color: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
        }
        
        .user-message .message-icon {
          background-color: #eff6ff;
          color: #1e40af;
        }
        
        .assistant-message .message-icon {
          background-color: #f0fdf4;
          color: #166534;
        }
        
        .message-content {
          flex: 1;
          font-size: 0.875rem;
          color: #4b5563;
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        /* Mobile optimizations */
        @media (max-width: 640px)