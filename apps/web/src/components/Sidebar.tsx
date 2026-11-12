import React from 'react';
import { 
  BookOpen, 
  FileCheck2, 
  Users, 
  ScrollText, 
  X, 
  FileSpreadsheet, 
  Award
} from 'lucide-react';
import { AcadAssessLogo } from './AcadAssessLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeItem: string;
  onSelectItem: (item: string) => void;
  activeRole: string;
  availableRoles?: string[];
  onRoleChange?: (role: string) => void;
  onOpenWorkspaceModal?: () => void;
}

const formatWorkspaceTitle = (role: string): string => {
  switch (role) {
    case 'hod':
      return 'HOD Workspace';
    case 'subject_teacher':
      return 'Subject Teacher Workspace';
    case 'class_teacher':
      return 'Class Teacher Workspace';
    case 'proctor':
      return 'Proctor Workspace';
    case 'student':
      return 'Student Workspace';
    default:
      return `${role.replace('_', ' ').toUpperCase()} Workspace`;
  }
};

const formatRoleButtonLabel = (role: string): string => {
  switch (role) {
    case 'hod':
      return 'HOD';
    case 'subject_teacher':
      return 'Subject Teacher';
    case 'class_teacher':
      return 'Class Teacher';
    case 'proctor':
      return 'Proctor';
    case 'student':
      return 'Student';
    default:
      return role.replace('_', ' ');
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeItem,
  onSelectItem,
  activeRole,
  availableRoles = [],
  onRoleChange,
  onOpenWorkspaceModal
}) => {
  // Navigation items defined according to role specifications
  const getNavItems = () => {
    if (activeRole === 'hod') {
      return [
        { id: 'academics', label: 'Academic Structure', icon: BookOpen },
        { id: 'users', label: 'User Directory & Roles', icon: Users },
        { id: 'academic_performance', label: 'Department Performance', icon: Award },
        { id: 'institutional_reports', label: 'Institutional Submission Report', icon: FileSpreadsheet },
      ];
    }

    if (activeRole === 'subject_teacher') {
      return [
        { id: 'assessments', label: 'Formative Assessments', icon: BookOpen },
        { id: 'grading', label: 'Rubric Evaluations', icon: FileSpreadsheet },
      ];
    }

    if (activeRole === 'class_teacher') {
      return [
        { id: 'performance', label: 'Academic Performance', icon: Award },
        { id: 'late_reports', label: 'Submissions & Late Report', icon: FileSpreadsheet },
        { id: 'students', label: 'Student Cohort', icon: Users },
      ];
    }

    if (activeRole === 'proctor') {
      return [
        { id: 'performance', label: 'Academic Performance', icon: Award },
        { id: 'late_reports', label: 'Mentee Submissions & Deadlines', icon: FileSpreadsheet },
      ];
    }

    // Default / student view
    return [
      { id: 'assessments', label: 'My Assessments', icon: BookOpen },
      { id: 'submissions', label: 'My Submissions', icon: FileCheck2 },
      { id: 'results', label: 'Published Results', icon: ScrollText },
    ];
  };

  const navItems = getNavItems();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-academic-deepGreen/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed lg:static top-0 left-0 bottom-0 z-40 w-64 lg:h-full lg:flex-shrink-0 bg-academic-surface border-r border-academic-border flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Sidebar navigation"
      >
        <div className="h-16 px-4 border-b border-academic-border flex items-center justify-between lg:hidden">
          <AcadAssessLogo variant="compact" size="sm" showSubtitle={false} />
          <button 
            onClick={onClose}
            className="p-2 rounded-md hover:bg-academic-paleGreen text-academic-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-academic-border bg-academic-paleGreen/50">
          <p className="text-[10px] font-bold tracking-wider uppercase text-academic-muted">
            {availableRoles.includes('hod') ? 'Admin Portal Workspace' : 'Workspace Scope'}
          </p>
          <p className="text-xs font-bold text-academic-deepGreen mt-0.5">
            {formatWorkspaceTitle(activeRole)}
          </p>
          {availableRoles.includes('hod') && activeRole !== 'hod' && onRoleChange && (
            <div className="mt-1.5 p-1.5 bg-[#FFFDF8] border border-[#F2C4B3]/60 rounded text-[10px] text-[#8A3814] flex items-center justify-between">
              <span>Teaching Workspace</span>
              <button
                onClick={() => {
                  onRoleChange('hod');
                  onClose();
                }}
                className="font-bold underline hover:text-[#5C1D06]"
              >
                Return to HOD
              </button>
            </div>
          )}
          {availableRoles.length > 1 && onRoleChange && (
            <div className="mt-2 pt-2 border-t border-academic-border/50">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] uppercase font-bold text-academic-muted">Switch Workspace</p>
                {onOpenWorkspaceModal && (
                  <button
                    onClick={onOpenWorkspaceModal}
                    className="text-[9px] font-semibold text-academic-primaryGreen hover:underline cursor-pointer"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {availableRoles.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      onRoleChange(r);
                      onClose();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      activeRole === r
                        ? 'bg-academic-deepGreen text-white shadow-xs'
                        : 'bg-white border border-academic-border text-academic-deepGreen hover:bg-academic-paleGreen'
                    }`}
                  >
                    {formatRoleButtonLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectItem(item.id);
                  onClose();
                }}
                className={`w-full flex items-center px-3 py-2.5 text-xs font-medium rounded-md transition-colors min-h-[44px] ${
                  isActive
                    ? 'bg-academic-lightGreen text-academic-deepGreen font-semibold border border-academic-primaryGreen/30 shadow-sm'
                    : 'text-academic-muted hover:bg-academic-paleGreen hover:text-academic-deepGreen'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className={`w-4 h-4 mr-3 flex-shrink-0 ${isActive ? 'text-academic-primaryGreen' : 'text-academic-muted'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-academic-border bg-academic-paleGreen/30">
          <div className="text-[11px] text-academic-muted space-y-1">
            <div className="flex justify-between">
              <span>Portal</span>
              <span className="font-semibold text-academic-deepGreen">
                {availableRoles.includes('hod')
                  ? 'Admin Portal'
                  : availableRoles.includes('student')
                  ? 'Student Portal'
                  : 'Faculty Portal'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Security</span>
              <span className="text-academic-primaryGreen font-medium">RBAC / RLS Active</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
