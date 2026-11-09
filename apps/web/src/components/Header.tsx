import React from 'react';
import {
  Building2, 
  Bell, 
  UserCircle, 
  Menu, 
  LogOut, 
  ShieldCheck,
  Layers,
  ChevronDown
} from 'lucide-react';
import { AcadAssessLogo } from './AcadAssessLogo';

interface HeaderProps {
  institutionName?: string;
  activeRole: string;
  availableRoles: string[];
  userFullName?: string;
  userEmail?: string;
  onRoleChange?: (role: string) => void;
  onOpenWorkspaceModal?: () => void;
  onLogout?: () => void;
  onToggleSidebar: () => void;
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

export const Header: React.FC<HeaderProps> = ({
  institutionName,
  activeRole,
  availableRoles,
  userFullName,
  userEmail,
  onRoleChange,
  onOpenWorkspaceModal,
  onLogout,
  onToggleSidebar
}) => {
  return (
    <header className="h-16 bg-academic-surface border-b border-academic-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-md hover:bg-academic-paleGreen text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5">
          <AcadAssessLogo variant="compact" size="sm" showSubtitle={false} />
          <div className="hidden sm:inline-flex items-center">
            {availableRoles.includes('hod') ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#8A3814]/10 text-[#8A3814] border border-[#8A3814]/30 uppercase tracking-wide">
                Admin Portal
              </span>
            ) : availableRoles.includes('student') ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30 uppercase tracking-wide">
                Student Portal
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-academic-paleGreen text-academic-deepGreen border border-academic-border uppercase tracking-wide">
                Faculty Portal
              </span>
            )}
          </div>
          {institutionName && (
            <div className="hidden sm:block border-l border-academic-border pl-2.5">
              <p className="text-[11px] text-academic-muted flex items-center">
                <Building2 className="w-3 h-3 mr-1 inline text-academic-primaryGreen" />
                <span className="truncate max-w-[200px] md:max-w-[320px]">{institutionName}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Multi-role Switcher (Only visible when user possesses multiple backend-verified approved roles) */}
        {availableRoles.length > 1 ? (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 bg-academic-paleGreen px-2.5 py-1 rounded-md border border-academic-border text-xs shadow-xs">
              <Layers className="w-3.5 h-3.5 text-academic-primaryGreen shrink-0" />
              <label htmlFor="role-select" className="text-academic-muted font-medium hidden sm:inline">Workspace:</label>
              <select
                id="role-select"
                value={activeRole}
                onChange={(e) => onRoleChange?.(e.target.value)}
                className="bg-transparent text-academic-deepGreen font-bold focus:outline-none cursor-pointer py-1"
                title="Switch Active Academic Workspace"
              >
                {availableRoles.map(role => (
                  <option key={role} value={role} className="bg-academic-surface font-semibold text-academic-deepGreen">
                    {formatWorkspaceTitle(role)}
                  </option>
                ))}
              </select>
            </div>

            {onOpenWorkspaceModal && (
              <button
                type="button"
                onClick={onOpenWorkspaceModal}
                className="hidden md:inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md border border-academic-border bg-academic-surface hover:bg-academic-paleGreen text-[11px] font-semibold text-academic-deepGreen transition-colors"
                title="View All Workspaces"
              >
                <span>Switch</span>
                <ChevronDown className="w-3 h-3 text-academic-muted" />
              </button>
            )}
          </div>
        ) : (
          activeRole && (
            <div className="hidden sm:flex items-center space-x-1.5 bg-academic-paleGreen px-2.5 py-1 rounded-md border border-academic-border text-xs font-semibold text-academic-deepGreen">
              <ShieldCheck className="w-3.5 h-3.5 text-academic-primaryGreen" />
              <span>{formatWorkspaceTitle(activeRole)}</span>
            </div>
          )
        )}

        {/* Notifications indicator */}
        <button 
          className="p-2 rounded-md hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen relative min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-academic-primaryGreen rounded-full" />
        </button>

        {/* Account profile badge */}
        <div className="flex items-center space-x-2 border-l border-academic-border pl-2 sm:pl-3">
          <div className="w-8 h-8 rounded-full bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-primaryGreen flex items-center justify-center font-medium text-xs">
            <UserCircle className="w-6 h-6 text-academic-primaryGreen" />
          </div>
          <div className="hidden lg:block text-left text-xs max-w-[140px]">
            <p className="font-semibold text-academic-deepGreen truncate" title={userFullName || userEmail || 'Institutional User'}>
              {userFullName || userEmail || 'Active Session'}
            </p>
            <p className="text-[11px] text-academic-muted capitalize truncate">
              {activeRole ? activeRole.replace('_', ' ') : 'Authenticated'}
            </p>
          </div>
        </div>

        {/* Logout button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="p-2 rounded-md hover:bg-[#FFF5F2] text-academic-muted hover:text-[#A63214] transition-colors min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#A63214] border border-transparent hover:border-[#F2C4B3]"
            title="Sign out of AcadAssess"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline-block ml-1.5 text-xs font-medium">Logout</span>
          </button>
        )}
      </div>
    </header>
  );
};
