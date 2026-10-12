import React from 'react';
import { 
  LayoutDashboard, 
  BookOpen, 
  FileCheck2, 
  Scale, 
  Users, 
  ShieldCheck, 
  ScrollText, 
  X,
  FileSpreadsheet
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeItem: string;
  onSelectItem: (item: string) => void;
  activeRole: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeItem,
  onSelectItem,
  activeRole
}) => {
  // Navigation items defined according to role specifications
  const getNavItems = () => {
    const commonItems = [
      { id: 'foundation', label: 'Phase 1 Architecture', icon: LayoutDashboard },
    ];

    if (activeRole === 'hod') {
      return [
        ...commonItems,
        { id: 'academics', label: 'Academic Structure', icon: BookOpen },
        { id: 'users', label: 'User Directory & Roles', icon: Users },
        { id: 'audit', label: 'Audit Records', icon: ShieldCheck },
      ];
    }

    if (activeRole === 'subject_teacher') {
      return [
        ...commonItems,
        { id: 'assessments', label: 'Formative Assessments', icon: BookOpen },
        { id: 'submissions', label: 'Submissions & PDFs', icon: FileCheck2 },
        { id: 'similarity', label: 'Similarity Reviews', icon: Scale },
        { id: 'grading', label: 'Rubric Evaluations', icon: FileSpreadsheet },
      ];
    }

    // Default / student view
    return [
      ...commonItems,
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
        className={`fixed lg:static top-0 left-0 bottom-0 z-40 w-64 bg-academic-surface border-r border-academic-border flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Sidebar navigation"
      >
        <div className="h-16 px-6 border-b border-academic-border flex items-center justify-between lg:hidden">
          <span className="font-bold text-academic-deepGreen text-base">Navigation</span>
          <button 
            onClick={onClose}
            className="p-2 rounded-md hover:bg-academic-paleGreen text-academic-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4 border-b border-academic-border bg-academic-paleGreen/50">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-academic-muted">Workspace Scope</p>
          <p className="text-xs font-semibold text-academic-deepGreen capitalize mt-0.5">
            {activeRole.replace('_', ' ')} Workspace
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
                    ? 'bg-academic-lightGreen text-academic-deepGreen font-semibold border border-academic-primaryGreen/30'
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
              <span>System Version</span>
              <span className="font-mono font-medium text-academic-deepGreen">2.0.0 (Phase 1)</span>
            </div>
            <div className="flex justify-between">
              <span>Security</span>
              <span className="text-academic-primaryGreen font-medium">RLS Enforced</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
