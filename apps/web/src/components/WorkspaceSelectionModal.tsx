import React from 'react';
import { 
  BookOpen, 
  GraduationCap, 
  ShieldCheck, 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  X,
  Layers
} from 'lucide-react';

interface WorkspaceSelectionModalProps {
  isOpen: boolean;
  onClose?: () => void;
  availableRoles: string[];
  activeRole: string;
  onSelectRole: (role: string) => void;
  canDismiss?: boolean;
}

interface RoleCardMeta {
  title: string;
  badge: string;
  description: string;
  icon: React.ElementType;
}

const ROLE_META_MAP: Record<string, RoleCardMeta> = {
  subject_teacher: {
    title: 'Subject Teacher Workspace',
    badge: 'Formative Assessment & Grading',
    description: 'Author assessments, publish deadlines, review student submissions, evaluate with rubrics, and disclose grades.',
    icon: BookOpen
  },
  class_teacher: {
    title: 'Class Teacher Workspace',
    badge: 'Cohort Academic Monitoring',
    description: 'Track assigned class cohort progress, monitor student submissions, view late submission reports, and oversee class performance.',
    icon: GraduationCap
  },
  proctor: {
    title: 'Proctor Mentorship Workspace',
    badge: 'Mentee Progress Oversight',
    description: 'Monitor submission progress and timeliness for your assigned student mentees via the Mentee Submissions Report.',
    icon: ShieldCheck
  },
  hod: {
    title: 'HOD Workspace',
    badge: 'Departmental Administration',
    description: 'Manage academic programs, classes, faculty allocations, user directory, and oversee departmental academic operations.',
    icon: Users
  },
  student: {
    title: 'Student Workspace',
    badge: 'Coursework & Submissions',
    description: 'Access assigned coursework, upload assignment submissions, and review official published results.',
    icon: GraduationCap
  }
};

export const WorkspaceSelectionModal: React.FC<WorkspaceSelectionModalProps> = ({
  isOpen,
  onClose,
  availableRoles,
  activeRole,
  onSelectRole,
  canDismiss = true
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-academic-deepGreen/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-2xl bg-academic-surface border border-academic-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-modal-title"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-academic-border bg-academic-paleGreen/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-primaryGreen flex items-center justify-center">
              <Layers className="w-5 h-5 text-academic-primaryGreen" />
            </div>
            <div>
              <h2 id="workspace-modal-title" className="text-base font-bold text-academic-deepGreen">
                Select Academic Workspace
              </h2>
              <p className="text-xs text-academic-muted">
                {availableRoles.includes('hod')
                  ? 'Your Admin account has multiple authorized roles. You can operate in teaching workspaces without leaving the Admin Portal.'
                  : 'Your institutional account has multiple authorized roles. Choose a workspace to proceed.'}
              </p>
            </div>
          </div>
          {canDismiss && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Workspace Cards */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-academic-muted">
            Authorized Workspaces ({availableRoles.length})
          </p>

          <div className="grid grid-cols-1 gap-3">
            {availableRoles.map((role) => {
              const meta = ROLE_META_MAP[role] || {
                title: `${role.replace('_', ' ').toUpperCase()} Workspace`,
                badge: 'Academic Role',
                description: `Authorized workspace access for institutional role: ${role}`,
                icon: Layers
              };
              const Icon = meta.icon;
              const isActive = activeRole === role;

              return (
                <div
                  key={role}
                  onClick={() => {
                    onSelectRole(role);
                    if (onClose) onClose();
                  }}
                  className={`group relative p-4 rounded-lg border text-left cursor-pointer transition-all ${
                    isActive
                      ? 'border-academic-primaryGreen bg-academic-lightGreen/40 shadow-xs'
                      : 'border-academic-border bg-white hover:border-academic-primaryGreen/60 hover:bg-academic-paleGreen/30 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3.5">
                      <div className={`p-2.5 rounded-lg border mt-0.5 ${
                        isActive
                          ? 'bg-academic-primaryGreen text-white border-academic-primaryGreen'
                          : 'bg-academic-paleGreen text-academic-deepGreen border-academic-border group-hover:border-academic-primaryGreen/40'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-bold text-academic-deepGreen">
                            {meta.title}
                          </h3>
                          {isActive && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-academic-primaryGreen text-white">
                              <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-semibold text-academic-primaryGreen mt-0.5">
                          {meta.badge}
                        </p>
                        <p className="text-xs text-academic-muted mt-1 leading-relaxed max-w-lg">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`shrink-0 ml-3 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                        isActive
                          ? 'bg-academic-primaryGreen text-white'
                          : 'bg-academic-paleGreen border border-academic-border text-academic-deepGreen group-hover:bg-academic-primaryGreen group-hover:text-white group-hover:border-academic-primaryGreen'
                      }`}
                    >
                      <span>{isActive ? 'Current' : 'Select'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-academic-border bg-academic-paleGreen/20 flex items-center justify-between">
          <p className="text-[11px] text-academic-muted">
            You can switch workspaces at any time from the top header or sidebar.
          </p>
          {canDismiss && onClose && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-md border border-academic-border bg-white hover:bg-academic-paleGreen text-xs font-semibold text-academic-deepGreen transition-colors"
            >
              Continue with Active Workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

