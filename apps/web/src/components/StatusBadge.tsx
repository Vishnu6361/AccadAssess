import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileCheck, 
  Sparkles,
  HelpCircle
} from 'lucide-react';

export type BadgeVariant = 
  | 'draft' 
  | 'published' 
  | 'queued' 
  | 'processing' 
  | 'completed' 
  | 'ready_for_review' 
  | 'warning' 
  | 'neutral'
  | 'submitted'
  | 'not_submitted';

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  className?: string;
  title?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ label, variant, className = '', title }) => {
  const getBadgeStyle = () => {
    switch (variant) {
      case 'submitted':
      case 'published':
      case 'completed':
        return {
          bg: 'bg-academic-lightGreen',
          text: 'text-academic-deepGreen',
          border: 'border-academic-primaryGreen/30',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
        };
      case 'not_submitted':
        return {
          bg: 'bg-[#FFF5F2]',
          text: 'text-[#A63214]',
          border: 'border-[#F8D2C9]',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-[#C8421E]" />
        };
      case 'processing':
      case 'queued':
        return {
          bg: 'bg-academic-paleGreen',
          text: 'text-academic-deepGreen',
          border: 'border-academic-border',
          icon: <Clock className="w-3.5 h-3.5 mr-1.5 text-academic-muted" />
        };
      case 'ready_for_review':
        return {
          bg: 'bg-[#EBF3E8]',
          text: 'text-[#204E26]',
          border: 'border-[#355E3B]/40',
          icon: <Sparkles className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
        };
      case 'warning':
        return {
          bg: 'bg-[#FDF6E2]',
          text: 'text-[#6D5200]',
          border: 'border-[#D9BD71]',
          icon: <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-[#B28704]" />
        };
      case 'draft':
        return {
          bg: 'bg-[#F2F1ED]',
          text: 'text-academic-muted',
          border: 'border-academic-border',
          icon: <FileCheck className="w-3.5 h-3.5 mr-1.5 text-academic-muted" />
        };
      case 'neutral':
      default:
        return {
          bg: 'bg-academic-surface',
          text: 'text-academic-muted',
          border: 'border-academic-border',
          icon: <HelpCircle className="w-3.5 h-3.5 mr-1.5 text-academic-muted" />
        };
    }
  };

  const style = getBadgeStyle();

  return (
    <span 
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${style.bg} ${style.text} ${style.border} ${className}`}
      role="status"
      title={title}
    >
      {style.icon}
      <span>{label}</span>
    </span>
  );
};
