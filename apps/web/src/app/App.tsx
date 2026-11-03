import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { 
  ShieldAlert, 
  Loader2,
  AlertTriangle,
  LogOut,
  UserX
} from 'lucide-react';
const UserManagement = React.lazy(() => import('../features/hod/UserManagement').then(m => ({ default: m.UserManagement })));
const AcademicStructure = React.lazy(() => import('../features/hod/AcademicStructure').then(m => ({ default: m.AcademicStructure })));
const InstitutionalSubmissionReport = React.lazy(() => import('../features/hod/InstitutionalSubmissionReport').then(m => ({ default: m.InstitutionalSubmissionReport })));
const AssessmentManagement = React.lazy(() => import('../features/teacher/AssessmentManagement').then(m => ({ default: m.AssessmentManagement })));
const EvaluationGrading = React.lazy(() => import('../features/teacher/EvaluationGrading').then(m => ({ default: m.EvaluationGrading })));
const StudentResults = React.lazy(() => import('../features/student/StudentResults').then(m => ({ default: m.StudentResults })));
const StudentSubmissions = React.lazy(() => import('../features/student/StudentSubmissions').then(m => ({ default: m.StudentSubmissions })));
const ClassTeacherWorkspace = React.lazy(() => import('../features/teacher/ClassTeacherWorkspace').then(m => ({ default: m.ClassTeacherWorkspace })));
const ProctorMenteeReport = React.lazy(() => import('../features/proctor/ProctorMenteeReport').then(m => ({ default: m.ProctorMenteeReport })));

const FeatureLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-20 space-y-3">
    <Loader2 className="w-6 h-6 text-academic-primaryGreen animate-spin" />
    <span className="text-xs font-semibold text-academic-deepGreen">Loading Academic View...</span>
  </div>
);
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LoginView } from '../features/auth/LoginView';
import { PortalSelectionView } from '../features/portal/PortalSelectionView';
import { AcadAssessLogo } from '../components/AcadAssessLogo';
import { WorkspaceSelectionModal } from '../components/WorkspaceSelectionModal';
import { useRouter } from '../hooks/useRouter';

const getDefaultActiveItemForRole = (role: string | null): string => {
  switch (role) {
    case 'hod':
      return 'academics';
    case 'proctor':
      return 'late_reports';
    case 'subject_teacher':
    case 'class_teacher':
    case 'student':
    default:
      return 'assessments';
  }
};

export const AppContent: React.FC = () => {
  const {
    user,
    session,
    userContext,
    activeRole,
    availableRoles,
    isLoading,
    accountStatus,
    accountStatusMessage,
    isPasswordRecovery,
    logout,
    switchRole
  } = useAuth();

  const { pathname, navigate } = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(() => getDefaultActiveItemForRole(activeRole));
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [hasPromptedWorkspaceModal, setHasPromptedWorkspaceModal] = useState(false);

  // If user has multiple roles and has not explicitly selected a workspace in this session, open modal
  useEffect(() => {
    if (user && availableRoles.length > 1 && !hasPromptedWorkspaceModal) {
      const saved = sessionStorage.getItem('smartfa_active_workspace');
      if (!saved) {
        setIsWorkspaceModalOpen(true);
      }
      setHasPromptedWorkspaceModal(true);
    }
  }, [user, availableRoles, hasPromptedWorkspaceModal]);

  const handleRoleChange = (newRole: string) => {
    switchRole(newRole);
    setActiveItem(getDefaultActiveItemForRole(newRole));
  };

  // Sync navigation view and redirect removed/unauthorized routes per role
  useEffect(() => {
    if (!activeRole) return;

    if (activeRole === 'hod') {
      // HOD workspace allows: academics (Academic Structure), users (User Directory & Roles), institutional_reports (Institutional Submission Report)
      if (activeItem !== 'academics' && activeItem !== 'users' && activeItem !== 'institutional_reports') {
        setActiveItem('academics');
      }
    } else if (activeRole === 'subject_teacher') {
      // Subject Teacher workspace allows: assessments (Formative Assessments), grading (Rubric Evaluations)
      if (activeItem !== 'assessments' && activeItem !== 'grading') {
        setActiveItem('assessments');
      }
    } else if (activeRole === 'class_teacher') {
      // Class Teacher workspace allows: assessments, students, late_reports
      if (activeItem !== 'assessments' && activeItem !== 'students' && activeItem !== 'late_reports') {
        setActiveItem('assessments');
      }
    } else if (activeRole === 'proctor') {
      // Proctor workspace allows: late_reports
      if (activeItem !== 'late_reports') {
        setActiveItem('late_reports');
      }
    } else if (activeRole === 'student') {
      // Student workspace allows: assessments, submissions, results
      if (activeItem !== 'assessments' && activeItem !== 'submissions' && activeItem !== 'results') {
        setActiveItem('assessments');
      }
    }
  }, [activeRole, activeItem]);

  // 1. Loading State: Prevent premature privileged page rendering
  if (isLoading) {
    return (
      <div className="min-h-screen bg-academic-bg flex flex-col justify-center items-center p-6 text-center space-y-4">
        <AcadAssessLogo variant="emblem" size="md" />
        <Loader2 className="w-6 h-6 text-academic-primaryGreen animate-spin" />
        <p className="text-sm font-semibold text-academic-deepGreen">
          Restoring Institutional Session...
        </p>
        <p className="text-xs text-academic-muted max-w-sm">
          Verifying Supabase authentication token and backend role authorization context.
        </p>
      </div>
    );
  }

  // 2. Unauthenticated State or Password Recovery State: Route to Selected Portal or Landing Page
  if (!user || !session || isPasswordRecovery || pathname === '/reset-password') {
    if (isPasswordRecovery || pathname === '/reset-password') {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const queryPortal = urlParams?.get('portal');
      const recoveryPortal: 'student' | 'faculty' = (queryPortal === 'faculty' || pathname.includes('faculty')) ? 'faculty' : 'student';
      return (
        <LoginView
          portal={recoveryPortal}
          initialMode="reset_password"
          onNavigatePortal={(p) => navigate(`/${p}/login`)}
          onBackToSelection={() => navigate('/')}
        />
      );
    }

    if (pathname === '/student/login') {
      return (
        <LoginView
          portal="student"
          onNavigatePortal={(p) => navigate(`/${p}/login`)}
          onBackToSelection={() => navigate('/')}
        />
      );
    }

    if (pathname === '/faculty/login') {
      return (
        <LoginView
          portal="faculty"
          onNavigatePortal={(p) => navigate(`/${p}/login`)}
          onBackToSelection={() => navigate('/')}
        />
      );
    }

    // Default route `/` or any other route shows the official portal selection landing page
    return (
      <PortalSelectionView
        onSelectPortal={(p) => navigate(`/${p}/login`)}
      />
    );
  }

  // 3. Inactive Profile, Profile Missing, or Zero Roles State
  if (accountStatus === 'inactive' || accountStatus === 'no_profile' || accountStatus === 'no_roles' || !activeRole) {
    return (
      <div className="min-h-screen bg-academic-bg flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-lg bg-academic-surface border border-academic-border rounded-lg shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center space-x-3 text-[#A63214]">
            <div className="p-2.5 rounded-full bg-[#FFF5F2] border border-[#F2C4B3]">
              {accountStatus === 'inactive' ? (
                <UserX className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-academic-deepGreen">
                {accountStatus === 'inactive' 
                  ? 'Institutional Account Inactive' 
                  : accountStatus === 'no_profile'
                  ? 'Institutional Profile Required'
                  : 'No Active Roles Provisioned'}
              </h2>
              <p className="text-xs text-academic-muted">
                Authenticated Identity: {user.email}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-md bg-[#FFFDF8] border border-academic-border text-xs text-academic-deepGreen leading-relaxed space-y-2">
            <p className="font-medium text-[#A63214]">
              {accountStatusMessage || 'Your account cannot access academic workspaces at this time.'}
            </p>
            <p className="text-academic-muted">
              Role permissions and account status are strictly governed by institutional policy in accordance with AcadAssess Specifications. Contact your Academic Head (HOD) for verification or reactivation.
            </p>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-academic-border">
            <span className="text-[11px] text-academic-muted">
              Security Boundary: Express API + Supabase RBAC
            </span>
            <button
              onClick={logout}
              className="py-2 px-4 rounded-md bg-academic-surface border border-academic-border hover:bg-[#FFF5F2] text-[#A63214] font-medium text-xs flex items-center space-x-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#A63214]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Portal-level Route Guard: Reject authenticated users visiting the wrong portal route
  const staffRoles = ['subject_teacher', 'class_teacher', 'proctor', 'hod'];
  const isStaff = userContext?.roles.some(r => staffRoles.includes(r));
  const isStudent = userContext?.roles.includes('student');

  if (pathname === '/faculty/login' && !isStaff) {
    return (
      <div className="min-h-screen bg-academic-bg flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-lg bg-academic-surface border border-academic-border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center space-x-3 text-[#A63214]">
            <div className="p-2.5 rounded-full bg-[#FFF5F2] border border-[#F2C4B3]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-academic-deepGreen">
                Faculty Portal Access Denied
              </h2>
              <p className="text-xs text-academic-muted">
                Authenticated Identity: {user.email}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-md bg-[#FFFDF8] border border-academic-border text-xs text-academic-deepGreen leading-relaxed space-y-2">
            <p className="font-semibold text-[#A63214]">
              Access restricted: You are authenticated with a student account.
            </p>
            <p className="text-academic-muted">
              Students cannot access faculty assessment creation, rubric evaluation, or administrative tools. Please access your designated academic portal.
            </p>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-academic-border">
            <button
              onClick={() => navigate('/student/login')}
              className="btn-primary text-xs"
            >
              Go to Student Workspace
            </button>
            <button
              onClick={logout}
              className="py-2 px-4 rounded-md bg-academic-surface border border-academic-border hover:bg-[#FFF5F2] text-[#A63214] font-medium text-xs flex items-center space-x-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#A63214]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pathname === '/student/login' && !isStudent) {
    return (
      <div className="min-h-screen bg-academic-bg flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-lg bg-academic-surface border border-academic-border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center space-x-3 text-[#A63214]">
            <div className="p-2.5 rounded-full bg-[#FFF5F2] border border-[#F2C4B3]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-academic-deepGreen">
                Student Portal Access Denied
              </h2>
              <p className="text-xs text-academic-muted">
                Authenticated Identity: {user.email}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-md bg-[#FFFDF8] border border-academic-border text-xs text-academic-deepGreen leading-relaxed space-y-2">
            <p className="font-semibold text-[#A63214]">
              Access restricted: You are authenticated with faculty/staff credentials.
            </p>
            <p className="text-academic-muted">
              Faculty members and administrators must manage academic evaluations through the Faculty Portal.
            </p>
          </div>

          <div className="pt-2 flex justify-between items-center border-t border-academic-border">
            <button
              onClick={() => navigate('/faculty/login')}
              className="btn-primary text-xs"
            >
              Go to Faculty Workspace
            </button>
            <button
              onClick={logout}
              className="py-2 px-4 rounded-md bg-academic-surface border border-academic-border hover:bg-[#FFF5F2] text-[#A63214] font-medium text-xs flex items-center space-x-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[#A63214]"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Authenticated & Verified State: Render Workspaces
  return (
    <div className="min-h-screen bg-academic-bg text-[#27452C] flex flex-col font-sans">
      <Header
        activeRole={activeRole}
        availableRoles={availableRoles}
        userFullName={userContext?.profile.full_name}
        userEmail={user.email}
        onRoleChange={handleRoleChange}
        onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        onLogout={logout}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeItem={activeItem}
          onSelectItem={setActiveItem}
          activeRole={activeRole}
          availableRoles={availableRoles}
          onRoleChange={handleRoleChange}
          onOpenWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Breadcrumbs 
              items={[
                { 
                  label: activeRole === 'hod' 
                    ? 'HOD Workspace' 
                    : activeRole === 'subject_teacher' 
                    ? 'Subject Teacher Workspace' 
                    : activeRole === 'class_teacher'
                    ? 'Class Teacher Workspace'
                    : activeRole === 'proctor'
                    ? 'Proctor Workspace'
                    : `${activeRole.replace('_', ' ').toUpperCase()} Workspace` 
                },
                { 
                  label: activeItem === 'users' 
                    ? 'User Directory & Roles' 
                    : activeItem === 'academics' 
                    ? 'Academic Structure' 
                    : activeRole === 'class_teacher' && activeItem === 'assessments'
                    ? 'Class Teacher Workspace'
                    : activeRole === 'class_teacher' && activeItem === 'students'
                    ? 'Student Submission Tracking'
                    : activeRole === 'class_teacher' && (activeItem === 'late_reports' || activeItem === 'submissions')
                    ? 'Class Submissions & Late Report'
                    : activeRole === 'proctor' && activeItem === 'late_reports'
                    ? 'Mentee Submissions Report'
                    : activeRole === 'subject_teacher' && activeItem === 'assessments'
                    ? 'Formative Assessments'
                    : activeItem === 'assessments'
                    ? 'Assessment Authoring & Rubrics'
                    : activeItem === 'grading'
                    ? 'Rubric Evaluations'
                    : activeItem === 'results'
                    ? 'Official Published Results'
                    : activeItem === 'submissions'
                    ? 'Student Submissions & PDFs'
                    : activeItem === 'late_reports'
                    ? 'Submissions Report'
                    : activeItem === 'institutional_reports'
                    ? 'Institutional Submission Report'
                    : 'Workspace', 
                  current: true 
                }
              ]} 
            />

            {/* Conditionally Render Feature Views based on backend-verified role with Lazy Loading */}
            <React.Suspense fallback={<FeatureLoadingFallback />}>
              {activeItem === 'users' && activeRole === 'hod' && <UserManagement />}
              {activeItem === 'academics' && activeRole === 'hod' && <AcademicStructure />}
              {activeItem === 'institutional_reports' && activeRole === 'hod' && <InstitutionalSubmissionReport />}

              {/* Class Teacher Dedicated Role-Specific Workspace */}
              {activeRole === 'class_teacher' && (
                activeItem === 'assessments' ? (
                  <ClassTeacherWorkspace initialTab="overview" />
                ) : activeItem === 'students' ? (
                  <ClassTeacherWorkspace initialTab="students" />
                ) : (activeItem === 'submissions' || activeItem === 'late_reports') ? (
                  <ClassTeacherWorkspace initialTab="reports" />
                ) : null
              )}

              {/* Other Roles Assessment / Submission Management */}
              {activeRole !== 'class_teacher' && activeRole !== 'proctor' && activeRole !== 'hod' && activeItem === 'assessments' && (
                <AssessmentManagement activeRole={activeRole} initialTab="questions" />
              )}
              {activeRole !== 'class_teacher' && activeRole !== 'proctor' && activeRole !== 'hod' && activeItem === 'submissions' && (
                activeRole === 'student' ? (
                  <StudentSubmissions onNavigateToAssessments={() => setActiveItem('assessments')} />
                ) : (
                  <AssessmentManagement activeRole={activeRole} initialTab="submissions" />
                )
              )}
              {activeRole === 'proctor' && activeItem === 'late_reports' && (
                <ProctorMenteeReport />
              )}
              {activeRole !== 'class_teacher' && activeRole !== 'proctor' && activeRole !== 'hod' && activeItem === 'late_reports' && (
                <AssessmentManagement activeRole={activeRole} initialTab="submissions_report" />
              )}

              {/* Proctor Access Restriction Fallback for Unauthorized Tabs */}
              {activeRole === 'proctor' && (activeItem === 'assessments' || activeItem === 'submissions' || activeItem === 'grading' || activeItem === 'users' || activeItem === 'academics') && (
                <div className="card-surface p-6 text-center space-y-3">
                  <div className="p-3 bg-[#FFF5F2] border border-[#F2C4B3] rounded-full inline-flex text-[#A63214]">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-academic-deepGreen">Access Restricted for Proctor Role</h3>
                  <p className="text-xs text-academic-muted max-w-md mx-auto">
                    Proctors are authorized to monitor student submission progress through the Mentee Submissions Report. Direct assessment authoring and unrestricted submissions management are reserved for Subject Teachers and Institutional Administrators.
                  </p>
                  <div className="flex flex-wrap justify-center items-center gap-3 pt-1">
                    <button onClick={() => setActiveItem('late_reports')} className="btn-primary text-xs">
                      Go to Mentee Submissions Report
                    </button>
                    {availableRoles.includes('hod') && (
                      <button onClick={() => handleRoleChange('hod')} className="px-3 py-1.5 rounded-md border border-academic-border bg-white hover:bg-academic-paleGreen text-xs font-semibold text-academic-deepGreen transition-colors">
                        Switch to HOD Workspace
                      </button>
                    )}
                    {availableRoles.includes('subject_teacher') && (
                      <button onClick={() => handleRoleChange('subject_teacher')} className="px-3 py-1.5 rounded-md border border-academic-border bg-white hover:bg-academic-paleGreen text-xs font-semibold text-academic-deepGreen transition-colors">
                        Switch to Subject Teacher Workspace
                      </button>
                    )}
                    {availableRoles.includes('class_teacher') && (
                      <button onClick={() => handleRoleChange('class_teacher')} className="px-3 py-1.5 rounded-md border border-academic-border bg-white hover:bg-academic-paleGreen text-xs font-semibold text-academic-deepGreen transition-colors">
                        Switch to Class Teacher Workspace
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeRole !== 'proctor' && activeRole !== 'hod' && activeItem === 'grading' && <EvaluationGrading activeRole={activeRole} />}
              {activeRole !== 'proctor' && activeItem === 'results' && <StudentResults />}
            </React.Suspense>
          </div>
        </main>
      </div>

      <WorkspaceSelectionModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        availableRoles={availableRoles}
        activeRole={activeRole}
        onSelectRole={handleRoleChange}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
