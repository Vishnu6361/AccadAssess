import React from 'react';
import { 
  Building2, 
  Calendar, 
  Bell, 
  UserCircle, 
  Menu
} from 'lucide-react';

interface HeaderProps {
  institutionName?: string;
  academicTerm?: string;
  activeRole: string;
  availableRoles: string[];
  onRoleChange?: (role: string) => void;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  institutionName = "Department of Computer Applications",
  academicTerm = "Autumn 2026",
  activeRole,
  availableRoles,
  onRoleChange,
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

        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 rounded bg-academic-primaryGreen text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-sm">
            SFA
          </div>
          <div>
            <h1 className="text-sm font-bold text-academic-deepGreen tracking-tight leading-none">SmartFA</h1>
            <p className="text-[11px] text-academic-muted flex items-center mt-0.5">
              <Building2 className="w-3 h-3 mr-1 inline" />
              <span className="truncate max-w-[200px] sm:max-w-none">{institutionName}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:space-x-5">
        {/* Academic Term indicator */}
        <div className="hidden md:flex items-center text-xs text-academic-deepGreen bg-academic-paleGreen px-2.5 py-1.5 rounded-md border border-academic-border">
          <Calendar className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
          <span>{academicTerm}</span>
        </div>

        {/* Multi-role Switcher (Only visible when user possesses multiple approved roles) */}
        {availableRoles.length > 1 && (
          <div className="flex items-center space-x-1.5 bg-academic-paleGreen px-2.5 py-1 rounded-md border border-academic-border text-xs">
            <label htmlFor="role-select" className="text-academic-muted font-medium">Role:</label>
            <select
              id="role-select"
              value={activeRole}
              onChange={(e) => onRoleChange?.(e.target.value)}
              className="bg-transparent text-academic-deepGreen font-semibold focus:outline-none cursor-pointer py-1"
            >
              {availableRoles.map(role => (
                <option key={role} value={role} className="bg-academic-surface">
                  {role.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notifications indicator */}
        <button 
          className="p-2 rounded-md hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen relative min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-academic-primaryGreen rounded-full" />
        </button>

        {/* Account menu badge */}
        <div className="flex items-center space-x-2 border-l border-academic-border pl-3 sm:pl-4">
          <div className="w-8 h-8 rounded-full bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-primaryGreen flex items-center justify-center font-medium text-xs">
            <UserCircle className="w-6 h-6 text-academic-primaryGreen" />
          </div>
          <div className="hidden lg:block text-left text-xs">
            <p className="font-semibold text-academic-deepGreen">Active Session</p>
            <p className="text-[11px] text-academic-muted capitalize">{activeRole.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
