"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Save,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  PlusCircle,
  Trash2,
  Layers,
  ClipboardEdit,
  Sparkles,
  BookText,
  Goal,
  Users
} from 'lucide-react';
import { Session, PracticeBlock, SessionPlan } from '@/lib/types/supabase'; // Assuming types are defined here

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function EditSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [editableSessionPlan, setEditableSessionPlan] = useState<SessionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessionData = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('session')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (dbError) throw dbError;
      if (!data) throw new Error('Session not found.');
      
      setSessionData(data as Session);
      // Deep copy session_plan for editing to avoid modifying original state directly
      setEditableSessionPlan(JSON.parse(JSON.stringify(data.session_plan || { session_plan: [] })));

    } catch (err: any) {
      console.error("Error fetching session data:", err);
      setError(err.message || "Failed to load session data.");
      toast.error(err.message || "Failed to load session data.");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSessionData();
  }, [fetchSessionData]);

  const handleBlockChange = (blockIndex: number, field: keyof PracticeBlock, value: any) => {
    if (!editableSessionPlan) return;

    const updatedBlocks = [...editableSessionPlan.session_plan];
    // @ts-ignore
    updatedBlocks[blockIndex][field] = value;
    setEditableSessionPlan({ ...editableSessionPlan, session_plan: updatedBlocks });
  };
  
  const handleArrayFieldChange = (blockIndex: number, field: 'skills' | 'constraints' | 'coaching_cues' | 'players', value: string) => {
    if (!editableSessionPlan) return;
    const updatedBlocks = [...editableSessionPlan.session_plan];
    // @ts-ignore
    updatedBlocks[blockIndex][field] = value.split('\n').map(s => s.trim()).filter(s => s);
    setEditableSessionPlan({ ...editableSessionPlan, session_plan: updatedBlocks });
  };

  const addBlock = () => {
    if (!editableSessionPlan) return;
    const newBlock: PracticeBlock = {
      block_name: 'New Block',
      format: 'Full Team',
      skills: [],
      constraints: [],
      players: ['All Present Players'],
      collective_growth_phase: sessionData?.collective_growth_phase || 3,
      coaching_cues: [],
      duration_minutes: 15,
      block_order: editableSessionPlan.session_plan.length + 1,
    };
    setEditableSessionPlan({
      ...editableSessionPlan,
      session_plan: [...editableSessionPlan.session_plan, newBlock],
    });
  };

  const removeBlock = (blockIndex: number) => {
    if (!editableSessionPlan) return;
    const updatedBlocks = editableSessionPlan.session_plan.filter((_, index) => index !== blockIndex);
    // Re-order blocks
    updatedBlocks.forEach((block, index) => block.block_order = index + 1);
    setEditableSessionPlan({ ...editableSessionPlan, session_plan: updatedBlocks });
  };
  
  const handleSessionFieldChange = (field: keyof SessionPlan, value: any) => {
    if (!editableSessionPlan) return;
    setEditableSessionPlan(prev => prev ? { ...prev, [field]: value } : null);
  };


  const handleSave = async () => {
    if (!sessionId || !editableSessionPlan) return;
    setIsSaving(true);
    setError(null);
    try {
      // Construct the updated session object
      const updatedSessionPayload = {
        ...sessionData, // Keep other session fields
        session_plan: editableSessionPlan, // The edited session plan
        overall_theme_tags: editableSessionPlan.overall_theme_tags || sessionData?.overall_theme_tags || [],
        session_notes: editableSessionPlan.session_notes || sessionData?.session_notes || "",
        last_updated: new Date().toISOString(),
      };
      // Remove fields that shouldn't be directly updated or are handled by DB
      // @ts-ignore
      delete updatedSessionPayload.coach; 


      const { error: updateError } = await supabase
        .from('session')
        .update(updatedSessionPayload)
        .eq('id', sessionId);

      if (updateError) throw updateError;

      toast.success('Session updated successfully!');
      // Optionally, refresh data or navigate
      fetchSessionData(); // Refresh to show saved data
      // router.push('/coach-dashboard'); // Or navigate back
    } catch (err: any) {
      console.error("Error updating session:", err);
      setError(err.message || "Failed to update session.");
      toast.error(err.message || "Failed to update session.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset editable state to original fetched data
    if (sessionData) {
      setEditableSessionPlan(JSON.parse(JSON.stringify(sessionData.session_plan || { session_plan: [] })));
      toast.info('Changes discarded.');
    }
    // Or navigate back:
    // router.push('/coach-dashboard');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Loading Session Editor...</p>
      </div>
    );
  }

  if (error && !sessionData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="mt-4 text-lg text-red-600">Error Loading Session</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{error}</p>
        <button
          onClick={() => router.push('/coach-dashboard')}
          className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    );
  }

  if (!sessionData || !editableSessionPlan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <Layers className="h-12 w-12 text-gray-400" />
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">Session data not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 pb-20">
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <button
            onClick={() => router.push('/coach-dashboard')}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            Edit Practice Plan
          </h1>
          <div className="w-16"> {/* Spacer */} </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        {error && (
             <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
                <span className="font-medium">Error:</span> {error}
            </div>
        )}

        {/* Session Level Edits */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <ClipboardEdit size={20} /> Session Details
            </h2>
            <div className="space-y-4">
                <div>
                    <label htmlFor="sessionTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Session Title</label>
                    <input 
                        type="text" 
                        id="sessionTitle"
                        value={sessionData.title || ''}
                        onChange={(e) => setSessionData(prev => prev ? {...prev, title: e.target.value} : null)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                    />
                </div>
                 <div>
                    <label htmlFor="sessionThemes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Overall Themes (comma-separated)</label>
                    <input 
                        type="text" 
                        id="sessionThemes"
                        value={(editableSessionPlan.overall_theme_tags || []).join(', ')}
                        onChange={(e) => handleSessionFieldChange('overall_theme_tags', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                    />
                </div>
                <div>
                    <label htmlFor="sessionNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Session Notes</label>
                    <textarea 
                        id="sessionNotes"
                        value={editableSessionPlan.session_notes || ''}
                        onChange={(e) => handleSessionFieldChange('session_notes', e.target.value)}
                        rows={3}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
                    />
                </div>
            </div>
        </div>


        {/* Practice Blocks */}
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
            <Layers size={20} /> Practice Blocks
        </h2>
        {editableSessionPlan.session_plan.map((block, blockIndex) => (
          <div key={blockIndex} className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-md font-semibold text-indigo-600 dark:text-indigo-400">
                    Block #{block.block_order || blockIndex + 1}
                </h3>
                <button
                    onClick={() => removeBlock(blockIndex)}
                    className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full"
                    aria-label="Remove block"
                >
                    <Trash2 size={16} />
                </button>
            </div>
            
            <div>
              <label htmlFor={`blockName-${blockIndex}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">Block Name</label>
              <input
                type="text"
                id={`blockName-${blockIndex}`}
                value={block.block_name}
                onChange={(e) => handleBlockChange(blockIndex, 'block_name', e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor={`format-${blockIndex}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">Format (e.g., 3v3, Full Court)</label>
              <input
                type="text"
                id={`format-${blockIndex}`}
                value={block.format}
                onChange={(e) => handleBlockChange(blockIndex, 'format', e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            
            <div>
              <label htmlFor={`duration-${blockIndex}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">Duration (minutes)</label>
              <input
                type="number"
                id={`duration-${blockIndex}`}
                value={block.duration_minutes || ''}
                onChange={(e) => handleBlockChange(blockIndex, 'duration_minutes', parseInt(e.target.value) || null)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor={`skills-${blockIndex}`} className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300"><Sparkles size={14} className="text-green-500"/>Skills (one per line)</label>
              <textarea
                id={`skills-${blockIndex}`}
                value={(block.skills || []).join('\n')}
                onChange={(e) => handleArrayFieldChange(blockIndex, 'skills', e.target.value)}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor={`constraints-${blockIndex}`} className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300"><Goal size={14} className="text-red-500"/>Constraints (one per line)</label>
              <textarea
                id={`constraints-${blockIndex}`}
                value={(block.constraints || []).join('\n')}
                onChange={(e) => handleArrayFieldChange(blockIndex, 'constraints', e.target.value)}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            
            <div>
              <label htmlFor={`players-${blockIndex}`} className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300"><Users size={14} className="text-blue-500"/>Players Involved (one per line, or 'All Present Players')</label>
              <textarea
                id={`players-${blockIndex}`}
                value={(block.players || []).join('\n')}
                onChange={(e) => handleArrayFieldChange(blockIndex, 'players', e.target.value)}
                rows={2}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor={`cues-${blockIndex}`} className="flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300"><BookText size={14} className="text-purple-500"/>Coaching Cues (one per line)</label>
              <textarea
                id={`cues-${blockIndex}`}
                value={(block.coaching_cues || []).join('\n')}
                onChange={(e) => handleArrayFieldChange(blockIndex, 'coaching_cues', e.target.value)}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor={`notes-${blockIndex}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">Block Notes</label>
              <textarea
                id={`notes-${blockIndex}`}
                value={block.notes || ''}
                onChange={(e) => handleBlockChange(blockIndex, 'notes', e.target.value)}
                rows={2}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        ))}

        <button
          onClick={addBlock}
          className="w-full mt-4 px-4 py-2 border border-dashed border-indigo-400 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors flex items-center justify-center gap-2"
        >
          <PlusCircle size={18} /> Add Practice Block
        </button>

        {/* Action Buttons */}
        <div className="mt-8 flex justify-end gap-3 sticky bottom-4 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm py-3 px-2 rounded-lg shadow-inner">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <XCircle size={16} /> Cancel Changes
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </main>
    </div>
  );
}
