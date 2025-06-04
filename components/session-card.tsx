import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Users, 
  Layers, 
  Clock,
  CheckCircle,
  XCircle,
  Edit2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

// TypeScript interfaces
interface PracticeBlock {
  block_name: string;
  format: string;
  skills: string[];
  constraints: string[];
  players: string[];
  collective_growth_phase: number;
  coaching_cues: string[];
  duration_minutes?: number | null;
  notes?: string;
  block_order?: number;
}

interface SessionPlan {
  session_plan: PracticeBlock[];
  overall_theme_tags?: string[];
  planned_attendance?: string[];
}

interface SessionCardProps {
  session: {
    id: string;
    title?: string;
    session_date: string;
    status: 'pending_approval' | 'approved' | 'rejected';
    session_plan?: SessionPlan;
    coach?: { display_name: string } | null;
    overall_theme_tags?: string[];
    created_at: string;
    last_updated?: string;
  };
  isExpanded?: boolean;
  onToggleExpand?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (id: string) => void;
  showActions?: boolean;
  className?: string;
}

const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isExpanded = false,
  onToggleExpand,
  onApprove,
  onReject,
  onEdit,
  showActions = true,
  className = ''
}) => {
  // Local expanded state if not controlled externally
  const [localExpanded, setLocalExpanded] = useState(false);
  
  // Use either controlled or uncontrolled expanded state
  const expanded = onToggleExpand ? isExpanded : localExpanded;
  
  // Handle toggle expansion
  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand(session.id);
    } else {
      setLocalExpanded(!localExpanded);
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };
  
  // Get attendance count
  const getAttendanceCount = () => {
    if (session.session_plan?.planned_attendance && 
        Array.isArray(session.session_plan.planned_attendance)) {
      return session.session_plan.planned_attendance.length;
    }
    return 0;
  };
  
  // Get practice blocks
  const getPracticeBlocks = () => {
    if (session.session_plan?.session_plan && 
        Array.isArray(session.session_plan.session_plan)) {
      return session.session_plan.session_plan;
    }
    return [];
  };
  
  // Get status color and icon
  const getStatusInfo = () => {
    switch (session.status) {
      case 'approved':
        return {
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/30',
          icon: <CheckCircle2 size={16} />,
          label: 'Approved'
        };
      case 'rejected':
        return {
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/30',
          icon: <XCircle size={16} />,
          label: 'Rejected'
        };
      case 'pending_approval':
      default:
        return {
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-50 dark:bg-amber-900/30',
          icon: <AlertCircle size={16} />,
          label: 'Pending Approval'
        };
    }
  };
  
  const statusInfo = getStatusInfo();
  const blocks = getPracticeBlocks();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2 }}
      className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden ${className}`}
    >
      {/* Session Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={handleToggleExpand}
        role="button"
        aria-expanded={expanded}
        aria-controls={`session-content-${session.id}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
      >
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {session.title || `Practice ${formatDate(session.session_date)}`}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${statusInfo.bgColor} ${statusInfo.color}`}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </div>
            
            <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span className="flex items-center gap-1" title="Session date">
                <Calendar size={14} />
                {formatDate(session.session_date)}
              </span>
              <span className="flex items-center gap-1" title="Player count">
                <Users size={14} />
                {getAttendanceCount()} players
              </span>
              <span className="flex items-center gap-1" title="Practice blocks">
                <Layers size={14} />
                {blocks.length} blocks
              </span>
              {session.coach && (
                <span className="flex items-center gap-1" title="Coach">
                  <Users size={14} />
                  {session.coach.display_name}
                </span>
              )}
            </div>
          </div>
          
          <div className="text-gray-400">
            {expanded ? (
              <ChevronUp size={20} aria-hidden="true" />
            ) : (
              <ChevronDown size={20} aria-hidden="true" />
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
      <AnimatePresence>
        {expanded && (
          <motion.div
            id={`session-content-${session.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-100 dark:border-gray-700 overflow-hidden"
          >
            {/* Practice Blocks */}
            <div className="p-4">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1">
                <Layers size={16} />
                Practice Blocks
              </h4>
              
              {blocks.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No practice blocks defined</p>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, index) => (
                    <div 
                      key={index}
                      className="border border-gray-200 dark:border-gray-700 rounded-md p-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium flex items-center gap-2">
                            {block.block_name}
                            {block.block_order && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">
                                #{block.block_order}
                              </span>
                            )}
                          </h5>
                          {block.duration_minutes && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                              <Clock size={12} />
                              {block.duration_minutes} minutes
                            </p>
                          )}
                        </div>
                        <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {block.format}
                        </span>
                      </div>
                      
                      {/* Skills & Constraints */}
                      <div className="mt-2 space-y-1.5">
                        {block.skills && block.skills.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Skills:</p>
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
                          </div>
                        )}
                        
                        {block.constraints && block.constraints.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Constraints:</p>
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
                          </div>
                        )}
                      </div>
                      
                      {/* Coaching Cues */}
                      {block.coaching_cues && block.coaching_cues.length > 0 && (
                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-2">
                          <h6 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coaching Cues:</h6>
                          <ul className="list-disc list-inside text-sm pl-1 space-y-0.5">
                            {block.coaching_cues.map((cue: string, i: number) => (
                              <li key={i} className="text-gray-700 dark:text-gray-300">{cue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {/* Notes */}
                      {block.notes && (
                        <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-2">
                          <h6 className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notes:</h6>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{block.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            {showActions && session.status === 'pending_approval' && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 flex gap-2 justify-end">
                <button
                  onClick={() => onReject && onReject(session.id)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                  aria-label="Reject practice plan"
                >
                  <XCircle size={16} />
                  Reject
                </button>
                
                <button
                  onClick={() => onEdit && onEdit(session.id)}
                  className="px-4 py-2 border border-blue-300 dark:border-blue-600 rounded-md text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-1"
                  aria-label="Edit practice plan"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
                
                <button
                  onClick={() => onApprove && onApprove(session.id)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                  aria-label="Approve practice plan"
                >
                  <CheckCircle size={16} />
                  Approve
                </button>
              </div>
            )}
            
            {/* Timestamps */}
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
              <span>Created: {new Date(session.created_at).toLocaleString()}</span>
              {session.last_updated && (
                <span>Updated: {new Date(session.last_updated).toLocaleString()}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SessionCard;
