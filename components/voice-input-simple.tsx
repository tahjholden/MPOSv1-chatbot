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
  const [transcript, setTranscript] = useState(''); // For UI display and manual edits
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Tap the mic and speak your command.');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef<string>(''); // Stores the complete final transcript from speech
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null);


  const processVoiceCommand = useCallback(async (commandText: string) => {
    if (!commandText.trim()) {
      toast.info('No command to process.');
      setIsProcessing(false); // Ensure processing is false if no command
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage('Processing your command...');

    const observationIntakeId = await saveToObservationIntake(commandText);
    if (!observationIntakeId) {
        setStatusMessage('Note not saved, but processing command...');
    } else {
        setStatusMessage('Voice note saved. Processing command...');
    }

    const isPracticePlanIntent = PRACTICE_PLAN_PATTERNS.some(pattern => pattern.test(commandText));

    if (isPracticePlanIntent) {
      setStatusMessage('Practice plan request detected. Generating plan...');
      try {
        const requestBody: GenerateBlocksRequest = {
          coach_id: coachId,
          group_id: groupId,
          theme: commandText,
          session_date: new Date().toISOString().split('T')[0],
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
      setStatusMessage('Observation saved. No specific command detected.');
      toast.info('Observation saved.');
       if (onProcessingComplete) {
            onProcessingComplete({ type: 'observation_saved', intake_id: observationIntakeId });
        }
    }

    setIsProcessing(false);
    // setTranscript(''); // Clear transcript only after successful processing or if desired
    // finalTranscriptRef.current = ''; // Clear ref for next recording
  }, [coachId, groupId, onProcessingComplete]);


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
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let currentFinalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentFinalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        // Update UI with interim or final
        setTranscript(prev => finalTranscriptRef.current + (currentFinalTranscript || interimTranscript));
        if (currentFinalTranscript) {
            finalTranscriptRef.current += (finalTranscriptRef.current ? " " : "") + currentFinalTranscript.trim();
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
        toast.error(`Speech error: ${event.error}`);
        setIsRecording(false); // Ensure recording stops on error
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      };

      recognition.onend = () => {
        // This is the crucial part: onend signifies the speech engine has stopped.
        // Now, we can safely process the final transcript.
        setIsRecording(false);
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
        
        const commandToProcess = finalTranscriptRef.current.trim();
        if (commandToProcess && !isProcessing) { // Check !isProcessing to avoid race if manual submit was faster
          processVoiceCommand(commandToProcess);
        }
        // finalTranscriptRef.current = ''; // Clear for the next recognition session *after* processing
      };
    }
    // Cleanup function
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Use abort to immediately stop and discard results
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
      }
    };
  }, [processVoiceCommand, isProcessing]); // processVoiceCommand is memoized

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not initialized.');
      toast.error('Speech recognition not ready.');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop(); // This will trigger 'onend'
      if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
      // onend will handle processing if finalTranscriptRef has content
    } else {
      setTranscript('');
      finalTranscriptRef.current = ''; // Reset for new recording
      setError(null);
      setStatusMessage('Listening...');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        // Auto-stop after 10 seconds of silence or max 30s
        if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = setTimeout(() => {
            if (isRecording && recognitionRef.current) {
                recognitionRef.current.stop(); // Will trigger onend
                toast.info("Recording timed out.");
            }
        }, 15000); // 15 seconds timeout
      } catch (e) {
        console.error("Error starting recognition:", e);
        setError("Could not start voice recognition.");
        toast.error("Could not start voice recognition.");
        setIsRecording(false);
      }
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
          processed: false, 
        })
        .select('id')
        .single();

      if (dbError) {
        throw dbError;
      }
      // toast.success('Voice note saved to intake.'); // Moved to processVoiceCommand for better flow
      return data?.id || null;
    } catch (e: any) {
      console.error('Error saving to observation_intake:', e.message);
      setError(`Failed to save voice note: ${e.message}`);
      toast.error('Failed to save voice note.');
      return null;
    }
  };

  const handleManualSubmit = () => {
    const commandToProcess = transcript.trim(); // Use the (potentially edited) transcript from textarea
    if (commandToProcess) {
        finalTranscriptRef.current = commandToProcess; // Ensure this is set if manual submit bypasses speech 'onend'
        processVoiceCommand(commandToProcess);
    } else {
        toast.info("Please speak or type a command.");
    }
  };

  return (
    <div className={`voice-input-simple bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md ${className}`}>
      <div className=\"flex items-center space-x-3 mb-3\">\n        <button
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
          onChange={(e) => {
            setTranscript(e.target.value);
            // If user types, update finalTranscriptRef too for manual submit consistency
            finalTranscriptRef.current = e.target.value;
          }}
          placeholder={isRecording ? "Listening..." : "Or type your command here..."}
          className=\"flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white\"\n          rows={2}\n          disabled={isProcessing || isRecording}\n        />
        <button
            onClick={handleManualSubmit}
            disabled={isProcessing || isRecording || !transcript.trim()}
            className={`p-3 rounded-full bg-green-500 hover:bg-green-600 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500
                ${(isProcessing || isRecording || !transcript.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label=\"Process command\"
        >
            <Send size={24} />
        </button>
      </div>

      <div className=\"status-feedback text-sm min-h-[40px] p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700/50\">\n        {isProcessing && (\n          <div className=\"flex items-center text-indigo-600 dark:text-indigo-400\">\n            <Loader2 size={18} className=\"animate-spin mr-2\" />\n            <span>{statusMessage}</span>\n          </div>\n        )}\n        {!isProcessing && error && (\n          <div className=\"flex items-center text-red-600 dark:text-red-400\">\n            <AlertTriangle size={18} className=\"mr-2\" />\n            <span>{error}</span>\n          </div>\n        )}\n        {!isProcessing && !error && statusMessage && (\n          <div className={`flex items-center ${statusMessage.includes("Error") ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>\n             {statusMessage.includes("generated") || statusMessage.includes("saved") ? <CheckCircle size={18} className=\"mr-2 text-green-500\" /> : null}\n            <span>{statusMessage}</span>\n          </div>\n        )}\n      </div>
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
