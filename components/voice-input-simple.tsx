import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Mic, MicOff, Send, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner'; // Assuming sonner is used for notifications
import { GenerateBlocksRequest, GenerateBlocksResponse } from '@/lib/types/supabase'; // Assuming types exist

// Props for the component
interface VoiceInputSimpleProps {
  coachId: string;
  groupId?: string; // For team context in practice planning
  onProcessingComplete?: (data: any) => void; // Callback when API call finishes
  className?: string;
}

// Initialize Supabase client (ensure these are set in your .env.local)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase URL or Anon Key is not defined. Voice input database logging will be disabled.');
}

// Simplified intent patterns for practice planning
const PRACTICE_PLAN_PATTERNS = [
  /plan\s+(?:a\s+)?practice/i,
  /create\s+(?:a\s+)?practice/i,
  /generate\s+(?:a\s+)?practice/i,
  /new\s+practice/i,
  /session\s+for/i,
  /practice\s+for/i,
];

const VoiceInputSimple: React.FC<VoiceInputSimpleProps> = ({
  coachId,
  groupId,
  onProcessingComplete,
  className = '',
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Tap the mic and speak your command.');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Setup Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setError('Speech recognition is not supported in this browser.');
        toast.error('Speech recognition not supported.');
        return;
      }

      recognitionRef.current = new SpeechRecognitionAPI();
      const recognition = recognitionRef.current;
      recognition.continuous = false; // Capture a single command
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(finalTranscript || interimTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
        toast.error(`Speech error: ${event.error}`);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        // Automatically process if transcript is not empty and not already processing
        if (transcript.trim() && !isProcessing) {
            // Small delay to ensure transcript state is fully updated
            setTimeout(() => processVoiceCommand(transcript.trim()), 100);
        }
      };
    }
  }, [isProcessing, transcript]); // Added transcript and isProcessing to dependencies

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not initialized.');
      toast.error('Speech recognition not ready.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setError(null);
      setStatusMessage('Listening...');
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };
  
  const saveToObservationIntake = async (note: string): Promise<string | null> => {
    if (!supabase) {
      console.warn('Supabase client not initialized. Skipping observation intake.');
      toast.warn('Database not connected. Observation not saved.');
      return null;
    }
    try {
      const { data, error: dbError } = await supabase
        .from('observation_intake')
        .insert({
          coach_id: coachId,
          raw_note: note,
          processed: false, // Mark as unprocessed initially
          // category: 'voice_command' // Example category, if you add this column
        })
        .select('id')
        .single();

      if (dbError) {
        throw dbError;
      }
      toast.success('Voice note saved to intake.');
      return data?.id || null;
    } catch (e: any) {
      console.error('Error saving to observation_intake:', e.message);
      setError(`Failed to save voice note: ${e.message}`);
      toast.error('Failed to save voice note.');
      return null;
    }
  };

  const processVoiceCommand = useCallback(async (currentTranscript: string) => {
    if (!currentTranscript.trim()) {
      toast.info('No command to process.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage('Processing your command...');

    // Step 1: Save all voice notes to observation_intake
    const observationIntakeId = await saveToObservationIntake(currentTranscript);
    if (!observationIntakeId) {
        // If saving failed, we might still try to process the command if it's a critical one
        // or decide to stop. For now, let's proceed but with a warning.
        setStatusMessage('Note not saved, but processing command...');
    } else {
        setStatusMessage('Voice note saved. Processing command...');
    }


    // Step 2: Detect intent (simplified for practice planning)
    const isPracticePlanIntent = PRACTICE_PLAN_PATTERNS.some(pattern => pattern.test(currentTranscript));

    if (isPracticePlanIntent) {
      setStatusMessage('Practice plan request detected. Generating plan...');
      try {
        const requestBody: GenerateBlocksRequest = {
          coach_id: coachId,
          group_id: groupId,
          theme: currentTranscript, // Pass full transcript as theme for backend to parse
          session_date: new Date().toISOString().split('T')[0], // Default to today
          // attendance_data could be added if extracted
        };

        const response = await fetch('/api/generate-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const result: GenerateBlocksResponse = await response.json();

        if (response.ok && result.success) {
          setStatusMessage(`Practice plan generated! Session ID: ${result.session_id}`);
          toast.success('Practice plan generated!');
          if (onProcessingComplete) {
            onProcessingComplete(result);
          }
        } else {
          throw new Error(result.error || `API Error: ${response.status}`);
        }
      } catch (e: any) {
        console.error('Error calling generate-blocks API:', e.message);
        setError(`Failed to generate practice plan: ${e.message}`);
        setStatusMessage(`Error: ${e.message}`);
        toast.error(`Plan generation failed: ${e.message}`);
      }
    } else {
      // If not a practice plan, it's just an observation
      setStatusMessage('Observation saved. No specific command detected.');
      toast.info('Observation saved.');
       if (onProcessingComplete) { // Notify parent that processing is done
            onProcessingComplete({ type: 'observation_saved', intake_id: observationIntakeId });
        }
    }

    setIsProcessing(false);
    // setTranscript(''); // Optionally clear transcript after processing
  }, [coachId, groupId, onProcessingComplete]);


  const handleManualSubmit = () => {
    if (transcript.trim()) {
        processVoiceCommand(transcript.trim());
    } else {
        toast.info("Please speak or type a command.");
    }
  };

  return (
    <div className={`voice-input-simple bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md ${className}`}>
      <div className="flex items-center space-x-3 mb-3">
        <button
          onClick={toggleRecording}
          disabled={isProcessing}
          className={`p-3 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2
            ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse focus:ring-red-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500'}
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <textarea
          ref={textareaRef}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={isRecording ? "Listening..." : "Or type your command here..."}
          className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
          rows={2}
          disabled={isProcessing || isRecording}
        />
        <button
            onClick={handleManualSubmit}
            disabled={isProcessing || isRecording || !transcript.trim()}
            className={`p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
                ${(isProcessing || isRecording || !transcript.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label="Process command"
        >
            <Send size={24} />
        </button>
      </div>

      <div className="status-feedback text-sm min-h-[40px] p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700/50">
        {isProcessing && (
          <div className="flex items-center text-indigo-600 dark:text-indigo-400">
            <Loader2 size={18} className="animate-spin mr-2" />
            <span>{statusMessage}</span>
          </div>
        )}
        {!isProcessing && error && (
          <div className="flex items-center text-red-600 dark:text-red-400">
            <AlertTriangle size={18} className="mr-2" />
            <span>{error}</span>
          </div>
        )}
        {!isProcessing && !error && statusMessage && (
          <div className={`flex items-center ${statusMessage.includes("Error") ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
             {statusMessage.includes("generated") || statusMessage.includes("saved") ? <CheckCircle size={18} className="mr-2 text-green-500" /> : null}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
       <style jsx>{`
        .voice-input-simple button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .animate-pulse {
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Add TypeScript declarations for Web Speech API if not globally available
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export default VoiceInputSimple;
