import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { StatusBadge } from '../components/StatusBadge';
import { 
  Server, 
  Cpu, 
  Database, 
  ShieldAlert, 
  Palette, 
  RefreshCw
} from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabase';
import { UserManagement } from '../features/hod/UserManagement';
import { AcademicStructure } from '../features/hod/AcademicStructure';
import { AuditViewer } from '../features/hod/AuditViewer';
import { AssessmentManagement } from '../features/teacher/AssessmentManagement';

export const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('assessments');
  const [activeRole, setActiveRole] = useState<'student' | 'subject_teacher' | 'class_teacher' | 'proctor' | 'hod'>('subject_teacher');
  
  // Health checks status
  const [apiHealth, setApiHealth] = useState<'unknown' | 'connected' | 'unreachable'>('unknown');
  const [processorHealth, setProcessorHealth] = useState<'unknown' | 'connected' | 'unreachable'>('unknown');
  const [isChecking, setIsChecking] = useState(false);

  const checkServices = async () => {
    setIsChecking(true);
    
    // Check Node.js Express API
    try {
      const apiRes = await fetch('http://localhost:4000/health', { method: 'GET' });
      if (apiRes.ok) {
        setApiHealth('connected');
      } else {
        setApiHealth('unreachable');
      }
    } catch {
      setApiHealth('unreachable');
    }

    // Check Python FastAPI Processor
    try {
      const procRes = await fetch('http://localhost:8000/health', { method: 'GET' });
      if (procRes.ok) {
        setProcessorHealth('connected');
      } else {
        setProcessorHealth('unreachable');
      }
    } catch {
      setProcessorHealth('unreachable');
    }

    setIsChecking(false);
  };

  useEffect(() => {
    checkServices();
  }, []);

  const handleRoleChange = (role: 'student' | 'subject_teacher' | 'class_teacher' | 'proctor' | 'hod') => {
    setActiveRole(role);
    if (role === 'hod' && activeItem === 'assessments') {
      setActiveItem('academics');
    } else if (role !== 'hod' && (activeItem === 'users' || activeItem === 'academics' || activeItem === 'audit')) {
      setActiveItem('assessments');
    }
  };

  const availableRoles = ['student', 'subject_teacher', 'class_teacher', 'proctor', 'hod'];

  return (
    <div className="min-h-screen bg-academic-bg text-[#27452C] flex flex-col font-sans">
      <Header
        activeRole={activeRole}
        availableRoles={availableRoles}
        onRoleChange={(role) => handleRoleChange(role as any)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeItem={activeItem}
          onSelectItem={setActiveItem}
          activeRole={activeRole}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Breadcrumbs 
              items={[
                { label: activeRole === 'hod' ? 'Institutional Admin' : activeRole === 'subject_teacher' ? 'Faculty Workspace' : 'Student Workspace' },
                { 
                  label: activeItem === 'users' 
                    ? 'User Directory & Roles' 
                    : activeItem === 'academics' 
                    ? 'Academic Structure' 
                    : activeItem === 'audit' 
                    ? 'Audit Trail' 
                    : activeItem === 'assessments'
                    ? 'Assessment Authoring & Rubrics'
                    : 'System Overview & Architecture', 
                  current: true 
                }
              ]} 
            />

            {/* Conditionally Render Feature Views */}
            {activeItem === 'users' && <UserManagement />}
            {activeItem === 'academics' && <AcademicStructure />}
            {activeItem === 'audit' && <AuditViewer />}
            {activeItem === 'assessments' && <AssessmentManagement activeRole={activeRole} />}

            {activeItem !== 'users' && activeItem !== 'academics' && activeItem !== 'audit' && activeItem !== 'assessments' && (
              <>
                {/* Title & Primary Action Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-academic-border gap-4">
                  <div>
                    <div className="flex items-center space-x-3">
                      <h1 className="text-2xl font-bold text-academic-deepGreen tracking-tight">
                        SmartFA Architecture & UI Foundation
                      </h1>
                      <StatusBadge label="Phase 3 Active" variant="published" />
                    </div>
                    <p className="text-xs text-academic-muted mt-1 max-w-3xl">
                      Institutional Formative Assessment, Evaluation and Internal Answer Similarity Review System.
                      Phase 2 Identity, Scoped RBAC, Academic Structure, and Audit Logging active.
                    </p>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={checkServices}
                      disabled={isChecking}
                      className="btn-secondary text-xs flex items-center space-x-1.5"
                      aria-label="Refresh service connection checks"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                      <span>Check Services</span>
                    </button>
                  </div>
                </div>

            {/* Architecture Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* API Node Service Card */}
              <div className="card-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded bg-academic-paleGreen text-academic-primaryGreen">
                      <Server className="w-5 h-5" />
                    </span>
                    <StatusBadge 
                      label={apiHealth === 'connected' ? 'Port 4000 Active' : apiHealth === 'unreachable' ? 'Not Running' : 'Pending Probe'} 
                      variant={apiHealth === 'connected' ? 'published' : 'warning'} 
                    />
                  </div>
                  <h2 className="text-sm font-bold text-academic-deepGreen">Trusted API Service</h2>
                  <p className="text-xs text-academic-muted mt-1 leading-relaxed">
                    Node.js + Express + Zod. Responsible for verifying Supabase JWTs, rubric freezing, and transactional publication.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-academic-border/60 text-[11px] text-academic-muted">
                  Endpoint: <code className="font-mono text-academic-deepGreen">apps/api</code>
                </div>
              </div>

              {/* Processor Python Service Card */}
              <div className="card-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded bg-academic-paleGreen text-academic-primaryGreen">
                      <Cpu className="w-5 h-5" />
                    </span>
                    <StatusBadge 
                      label={processorHealth === 'connected' ? 'Port 8000 Active' : processorHealth === 'unreachable' ? 'Not Running' : 'Pending Probe'} 
                      variant={processorHealth === 'connected' ? 'published' : 'warning'} 
                    />
                  </div>
                  <h2 className="text-sm font-bold text-academic-deepGreen">Document Processing Worker</h2>
                  <p className="text-xs text-academic-muted mt-1 leading-relaxed">
                    Python + FastAPI + scikit-learn. Handles PDF rendering, replaceable HTR adapter, and TF-IDF pairwise similarity.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-academic-border/60 text-[11px] text-academic-muted">
                  Endpoint: <code className="font-mono text-academic-deepGreen">services/processor</code>
                </div>
              </div>

              {/* Supabase PostgreSQL & Storage Card */}
              <div className="card-surface flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded bg-academic-paleGreen text-academic-primaryGreen">
                      <Database className="w-5 h-5" />
                    </span>
                    <StatusBadge 
                      label={isSupabaseConfigured ? 'Configured' : 'Local Standby'} 
                      variant={isSupabaseConfigured ? 'published' : 'draft'} 
                    />
                  </div>
                  <h2 className="text-sm font-bold text-academic-deepGreen">Database & Private Storage</h2>
                  <p className="text-xs text-academic-muted mt-1 leading-relaxed">
                    Supabase PostgreSQL + Private Storage. SQL migrations in <code className="font-mono">supabase/migrations</code> are the sole schema authority.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-academic-border/60 text-[11px] text-academic-muted">
                  Bucket: <code className="font-mono text-academic-deepGreen">submissions-private</code> (5 MB limit)
                </div>
              </div>
            </div>

            {/* Design Tokens & Aesthetic System */}
            <div className="card-surface">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-academic-primaryGreen" />
                  <h2 className="text-sm font-bold text-academic-deepGreen">Academic Beige & Green Design System</h2>
                </div>
                <span className="text-xs text-academic-muted">Specification 03 / 06 - UI/UX</span>
              </div>

              <p className="text-xs text-academic-muted mb-4 leading-relaxed">
                The visual identity uses a calm, scholarly aesthetic designed for focused evaluation and clear evidence review.
                No gradients, neon palettes, glassmorphism, or distracting decorations are permitted.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded border border-academic-border bg-[#F4EFE3]">
                  <p className="font-mono text-[11px] font-bold text-academic-deepGreen">#F4EFE3</p>
                  <p className="text-[11px] text-academic-muted">Page Background</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#FFFDF8]">
                  <p className="font-mono text-[11px] font-bold text-academic-deepGreen">#FFFDF8</p>
                  <p className="text-[11px] text-academic-muted">Primary Surface</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#E7F0E4]">
                  <p className="font-mono text-[11px] font-bold text-academic-deepGreen">#E7F0E4</p>
                  <p className="text-[11px] text-academic-muted">Light Green</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#F2F7EF]">
                  <p className="font-mono text-[11px] font-bold text-academic-deepGreen">#F2F7EF</p>
                  <p className="text-[11px] text-academic-muted">Pale Green</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#355E3B] text-white">
                  <p className="font-mono text-[11px] font-bold">#355E3B</p>
                  <p className="text-[11px] opacity-90">Primary Green</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#27452C] text-white">
                  <p className="font-mono text-[11px] font-bold">#27452C</p>
                  <p className="text-[11px] opacity-90">Deep Green</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#667066] text-white">
                  <p className="font-mono text-[11px] font-bold">#667066</p>
                  <p className="text-[11px] opacity-90">Muted Text</p>
                </div>
                <div className="p-3 rounded border border-academic-border bg-[#C9D2C5]">
                  <p className="font-mono text-[11px] font-bold text-academic-deepGreen">#C9D2C5</p>
                  <p className="text-[11px] text-academic-muted">Border / Dividers</p>
                </div>
              </div>
            </div>

            {/* Strict Non-Negotiable Boundaries & Academic Safeguards */}
            <div className="card-surface bg-academic-paleGreen/40 border-academic-border">
              <div className="flex items-start space-x-3">
                <ShieldAlert className="w-5 h-5 text-academic-primaryGreen flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-academic-deepGreen">Authoritative Project Boundary Guidelines</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-academic-muted pt-1">
                    <div className="space-y-1">
                      <p className="font-semibold text-academic-deepGreen">✓ Human-Controlled Decisions</p>
                      <p>Similarity scores are evidence for teacher review, never automatic verdicts. HTR output is derived and subject to human review.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-academic-deepGreen">✓ Strict PDF Preservation</p>
                      <p>Original PDFs are authoritative and survive any processing failure. Versioned submissions retain immutable history.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-academic-deepGreen">✓ Explicit Result Publication</p>
                      <p>Grades and rubric breakdowns remain hidden through database RLS until explicitly published by authorized teachers.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-academic-deepGreen">✓ Zero Mock Record Fabrication</p>
                      <p>Phase 1 establishes clean architectural foundations without fabricated student submissions or synthetic grades.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Implementation Roadmap Preview */}
            <div className="card-surface">
              <h2 className="text-sm font-bold text-academic-deepGreen mb-3">Planned Build Milestones (Phases 1 - 7)</h2>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-lightGreen/50 border border-academic-primaryGreen/30">
                  <span className="font-medium text-academic-deepGreen">Phase 1: Project Foundation & Architecture (Monorepo, Tokens, Express API, FastAPI Worker)</span>
                  <StatusBadge label="Complete" variant="completed" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 2: Identity, RBAC & Institutional Academic Structure (Supabase Auth, RLS, 5 Roles, HOD Setup)</span>
                  <StatusBadge label="Next Phase" variant="draft" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 3: Assessment Authoring & Rubric Management (Questions, Frozen Rubric Invariants, Publishing)</span>
                  <StatusBadge label="Pending" variant="neutral" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 4: Private Student PDF Submissions & Storage (Private Bucket, 5 MB Limit, Versioning, Receipts)</span>
                  <StatusBadge label="Pending" variant="neutral" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 5: Evaluation, Human Rubric Grading & Publication (Side-by-side Grader, Publication RLS)</span>
                  <StatusBadge label="Pending" variant="neutral" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 6: Document Processing & Internal Similarity Engine (FastAPI Worker, HTR Adapter, Pairwise TF-IDF)</span>
                  <StatusBadge label="Pending" variant="neutral" />
                </div>
                <div className="flex items-center justify-between p-2.5 rounded bg-academic-surface border border-academic-border text-academic-muted">
                  <span>Phase 7: End-to-End Hardening, Audit Reporting, Security & UAT</span>
                  <StatusBadge label="Pending" variant="neutral" />
                </div>
              </div>
            </div>
          </>
        )}

          </div>
        </main>
      </div>
    </div>
  );
};
