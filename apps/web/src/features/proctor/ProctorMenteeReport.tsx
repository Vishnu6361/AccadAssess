import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Users,
  Search,
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  RefreshCw,
  Filter
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProctorReport } from './proctorReportStore';

/**
 * Subtle loading skeleton for first-time visit while data is being fetched.
 */
const ProctorReportSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
    {/* Breadcrumbs placeholder */}
    <div className="h-4 w-48 bg-academic-borderSubtle rounded" />

    {/* Header placeholder */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
      <div className="space-y-2">
        <div className="h-7 w-64 bg-academic-borderSubtle rounded" />
        <div className="h-4 w-96 bg-academic-borderSubtle rounded" />
      </div>
      <div className="h-9 w-24 bg-academic-borderSubtle rounded-lg" />
    </div>

    {/* Search Input placeholder */}
    <div className="h-10 w-full max-w-md bg-academic-borderSubtle rounded-lg" />

    {/* Subject Cards placeholder */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="bg-academic-surface border border-academic-border rounded-xl p-5 space-y-4 shadow-sm"
        >
          <div className="flex justify-between items-center">
            <div className="h-5 w-16 bg-academic-borderSubtle rounded" />
            <div className="h-4 w-12 bg-academic-borderSubtle rounded" />
          </div>
          <div className="h-6 w-3/4 bg-academic-borderSubtle rounded" />
          <div className="pt-4 border-t border-academic-borderSubtle flex justify-between items-center">
            <div className="h-5 w-32 bg-academic-borderSubtle rounded" />
            <div className="h-4 w-20 bg-academic-borderSubtle rounded" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ProctorMenteeReport: React.FC = () => {
  const { userContext } = useAuth();
  const proctorId = userContext?.profile.id || '';

  // Cached data hook with background re-validation and zero-flicker revisiting
  const {
    subjects,
    isInitialLoading,
    isRefreshing,
    error,
    refresh
  } = useProctorReport(proctorId);

  // Active navigation selection
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Search & Filter states
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [assessmentSearch, setAssessmentSearch] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'submitted' | 'pending'>('all');

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return '—';
    }
  };

  // Find currently selected subject & assessment
  const selectedSubject = useMemo(() => {
    if (!selectedSubjectId) return null;
    return subjects.find(s => s.subject_id === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  const selectedAssessment = useMemo(() => {
    if (!selectedSubject || !selectedAssessmentId) return null;
    return selectedSubject.assessments.find(a => a.assessment_id === selectedAssessmentId) || null;
  }, [selectedSubject, selectedAssessmentId]);

  // Level 1: Filtered subjects
  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(s =>
      s.subject_name.toLowerCase().includes(q) ||
      s.subject_code.toLowerCase().includes(q)
    );
  }, [subjects, subjectSearch]);

  // Level 2: Filtered assessments for selected subject
  const filteredAssessments = useMemo(() => {
    if (!selectedSubject) return [];
    const q = assessmentSearch.trim().toLowerCase();
    if (!q) return selectedSubject.assessments;
    return selectedSubject.assessments.filter(a =>
      a.title.toLowerCase().includes(q)
    );
  }, [selectedSubject, assessmentSearch]);

  // Level 3: Filtered students for selected assessment
  const filteredStudents = useMemo(() => {
    if (!selectedAssessment) return [];
    return selectedAssessment.students.filter(student => {
      // Status filter
      if (studentStatusFilter === 'submitted' && !student.is_submitted) return false;
      if (studentStatusFilter === 'pending' && student.is_submitted) return false;

      // Search filter
      const q = studentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        student.student_name.toLowerCase().includes(q) ||
        student.student_usn.toLowerCase().includes(q)
      );
    });
  }, [selectedAssessment, studentSearch, studentStatusFilter]);

  // Handlers for navigation
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedAssessmentId(null);
    setAssessmentSearch('');
  };

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setStudentSearch('');
    setStudentStatusFilter('all');
  };

  const handleBackToSubjects = () => {
    setSelectedSubjectId(null);
    setSelectedAssessmentId(null);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessmentId(null);
  };

  // ============================================================================
  // RENDER: Initial Loading Skeleton (displayed ONLY when no cached data exists)
  // ============================================================================
  if (isInitialLoading && subjects.length === 0 && !error) {
    return <ProctorReportSkeleton />;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Breadcrumb Navigation Trail */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-academic-muted flex-wrap">
        <button
          onClick={handleBackToSubjects}
          className={`font-medium transition-colors hover:text-academic-primaryGreen ${
            !selectedSubject ? 'text-academic-deepGreen font-semibold cursor-default' : ''
          }`}
        >
          Mentee Submissions Report
        </button>

        {selectedSubject && (
          <>
            <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
            <button
              onClick={handleBackToAssessments}
              className={`font-medium transition-colors hover:text-academic-primaryGreen ${
                !selectedAssessment ? 'text-academic-deepGreen font-semibold cursor-default' : ''
              }`}
            >
              {selectedSubject.subject_code} - {selectedSubject.subject_name}
            </button>
          </>
        )}

        {selectedAssessment && (
          <>
            <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
            <span className="text-academic-deepGreen font-semibold truncate max-w-xs sm:max-w-md">
              {selectedAssessment.title}
            </span>
            <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
            <span className="text-academic-primaryGreen font-semibold">
              Student Submission Report
            </span>
          </>
        )}
      </nav>

      {/* Error Banner: Initial load failure or non-blocking background refresh alert */}
      {error && (
        <div className="p-4 bg-[#FFF5F2] border border-[#F8D2C9] rounded-lg flex items-center gap-3 text-[#A63214] text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-[#C8421E]" />
          <span>{error}</span>
          <button
            onClick={() => refresh()}
            className="ml-auto font-medium underline hover:text-[#78230D]"
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================================== */}
      {/* LEVEL 1: SUBJECTS LIST (Clean, Subject-First Main Page)                 */}
      {/* ====================================================================== */}
      {!selectedSubject && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <h1 className="text-2xl font-bold text-academic-deepGreen flex items-center gap-2.5">
                <BookOpen className="w-6 h-6 text-academic-primaryGreen" />
                Mentee Submissions Report
              </h1>
              <p className="text-sm text-academic-muted mt-1">
                Select a subject to monitor assessment submissions for your assigned mentees
              </p>
            </div>
            <button
              onClick={() => refresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
              title="Refresh Report"
            >
              <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Minimal Search by Subject Name or Subject Code */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
            <input
              type="text"
              placeholder="Search by subject name or subject code..."
              value={subjectSearch}
              onChange={(e) => setSubjectSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen placeholder:text-academic-muted/70 focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
            />
          </div>

          {/* Subjects Grid/List */}
          {filteredSubjects.length === 0 ? (
            <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
              <BookOpen className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-academic-deepGreen">No Subjects Found</h3>
              <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                {subjectSearch.trim()
                  ? `No subjects match "${subjectSearch}". Try a different keyword.`
                  : 'No subjects are currently applicable to your assigned mentees.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSubjects.map((sub) => (
                <div
                  key={sub.subject_id}
                  onClick={() => handleSelectSubject(sub.subject_id)}
                  className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/40 hover:shadow-academicCard transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                        {sub.subject_code}
                      </span>
                      {sub.credits !== undefined && (
                        <span className="text-xs text-academic-muted font-medium">
                          {sub.credits} Credits
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors line-clamp-2">
                      {sub.subject_name}
                    </h3>
                  </div>

                  <div className="mt-5 pt-4 border-t border-academic-borderSubtle flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-deepGreen bg-academic-paleGreen px-2.5 py-1 rounded-md border border-academic-border">
                      <FileText className="w-3.5 h-3.5 text-academic-primaryGreen" />
                      {sub.total_assessments} Published Assessment{sub.total_assessments === 1 ? '' : 's'}
                    </span>
                    <span className="text-xs font-semibold text-academic-primaryGreen group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                      View Assessments <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* LEVEL 2: ASSESSMENTS LIST FOR SELECTED SUBJECT                         */}
      {/* ====================================================================== */}
      {selectedSubject && !selectedAssessment && (
        <div className="space-y-6">
          {/* Header & Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <button
                onClick={handleBackToSubjects}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-academic-primaryGreen hover:text-academic-primaryHover mb-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Subjects
              </button>
              <h1 className="text-2xl font-bold text-academic-deepGreen flex items-center gap-2">
                <span>{selectedSubject.subject_name}</span>
                <span className="text-sm font-semibold px-2 py-0.5 bg-academic-lightGreen text-academic-deepGreen rounded-md border border-academic-border">
                  {selectedSubject.subject_code}
                </span>
              </h1>
              <p className="text-sm text-academic-muted mt-1">
                Published assessments applicable to your assigned mentees
              </p>
            </div>
            <button
              onClick={() => refresh()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
              title="Refresh Report"
            >
              <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Minimal Search by Assessment Title */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
            <input
              type="text"
              placeholder="Search by assessment title..."
              value={assessmentSearch}
              onChange={(e) => setAssessmentSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen placeholder:text-academic-muted/70 focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
            />
          </div>

          {/* Assessments List */}
          {filteredAssessments.length === 0 ? (
            <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
              <FileText className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-academic-deepGreen">No Assessments Found</h3>
              <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                {assessmentSearch.trim()
                  ? `No assessments match "${assessmentSearch}".`
                  : 'No published assessments exist for this subject.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAssessments.map((ass) => (
                <div
                  key={ass.assessment_id}
                  className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/30 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5"
                >
                  <div className="space-y-2 flex-1">
                    <h3 className="text-base font-semibold text-academic-deepGreen">
                      {ass.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-academic-muted">
                      <div className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-academic-muted" />
                        <span>Deadline: <strong className="text-academic-deepGreen font-medium">{formatDateTime(ass.deadline_at)}</strong></span>
                      </div>

                      {ass.extension_deadline_at && (
                        <div className="inline-flex items-center gap-1.5 text-amber-700">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Extended: <strong className="font-medium">{formatDateTime(ass.extension_deadline_at)}</strong></span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-academic-surfaceAlt text-academic-deepGreen border border-academic-border">
                        <Users className="w-3 h-3 text-academic-muted" />
                        Total Mentees: {ass.total_mentees}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30">
                        <CheckCircle2 className="w-3 h-3 text-academic-primaryGreen" />
                        Submitted: {ass.submitted_count}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FFF5F2] text-[#A63214] border border-[#F8D2C9]">
                        <AlertCircle className="w-3 h-3 text-[#C8421E]" />
                        Pending: {ass.pending_count}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 pt-2 md:pt-0">
                    <button
                      onClick={() => handleSelectAssessment(ass.assessment_id)}
                      className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-academic-primaryGreen hover:bg-academic-primaryHover rounded-lg shadow-sm transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      View Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* LEVEL 3: STUDENT SUBMISSION REPORT FOR SELECTED ASSESSMENT             */}
      {/* ====================================================================== */}
      {selectedSubject && selectedAssessment && (
        <div className="space-y-6">
          {/* Header & Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <button
                onClick={handleBackToAssessments}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-academic-primaryGreen hover:text-academic-primaryHover mb-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Assessments
              </button>
              <h1 className="text-2xl font-bold text-academic-deepGreen">
                {selectedAssessment.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-academic-muted">
                <span className="font-semibold text-academic-deepGreen">
                  {selectedSubject.subject_code} - {selectedSubject.subject_name}
                </span>
                <span>•</span>
                <span>Original Deadline: {formatDateTime(selectedAssessment.deadline_at)}</span>
                {selectedAssessment.extension_deadline_at && (
                  <>
                    <span>•</span>
                    <span className="text-amber-700 font-medium">
                      Extended: {formatDateTime(selectedAssessment.extension_deadline_at)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30">
                Submitted: {selectedAssessment.submitted_count}
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#FFF5F2] text-[#A63214] border border-[#F8D2C9]">
                Pending: {selectedAssessment.pending_count}
              </span>
            </div>
          </div>

          {/* Minimal Search and Submission Status Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative max-w-md w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
              <input
                type="text"
                placeholder="Search by student name or USN..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen placeholder:text-academic-muted/70 focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-academic-muted shrink-0" />
              <label htmlFor="submission-status-filter" className="text-xs font-medium text-academic-muted">Status:</label>
              <select
                id="submission-status-filter"
                value={studentStatusFilter}
                onChange={(e) => setStudentStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
              >
                <option value="all">All ({selectedAssessment.students.length})</option>
                <option value="submitted">Submitted ({selectedAssessment.submitted_count})</option>
                <option value="pending">Pending ({selectedAssessment.pending_count})</option>
              </select>
            </div>
          </div>

          {/* Students Table */}
          {filteredStudents.length === 0 ? (
            <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
              <Users className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-academic-deepGreen">No Student Records Found</h3>
              <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                No students match your search criteria.
              </p>
            </div>
          ) : (
            <div className="bg-academic-surface border border-academic-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-academic-border text-sm">
                  <thead className="bg-academic-canvasAlt text-academic-deepGreen font-semibold text-xs uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 text-left">
                        Student Name
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-left">
                        USN
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Submission Status
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-left">
                        Submitted Date & Time
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Timing Status
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-center">
                        Evaluation Status
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right">
                        Published Marks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-academic-border bg-academic-surface">
                    {filteredStudents.map((student) => {
                      // Timing badge formatting
                      let timingBadgeClass = 'text-academic-muted';
                      if (student.timing_status === 'On Time') {
                        timingBadgeClass = 'bg-academic-lightGreen text-academic-deepGreen border-academic-primaryGreen/30';
                      } else if (student.timing_status === 'Late') {
                        timingBadgeClass = 'bg-[#FFF5F2] text-[#A63214] border-[#F8D2C9]';
                      }

                      // Evaluation status label: Pending or Evaluated
                      const evalDisplay = student.is_submitted
                        ? (student.evaluation_status === 'completed' || student.evaluation_status === 'published'
                            ? 'Evaluated'
                            : 'Pending')
                        : '—';

                      return (
                        <tr key={student.student_id} className="hover:bg-academic-surfaceAlt transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-academic-deepGreen">{student.student_name}</div>
                            {student.specialization_name && (
                              <div className="text-xs text-academic-muted font-normal">
                                {student.specialization_name}
                              </div>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-academic-muted font-mono text-xs">
                            {student.student_usn}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {student.is_submitted ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30">
                                <CheckCircle2 className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                                Submitted
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF5F2] text-[#A63214] border border-[#F8D2C9]">
                                <AlertCircle className="w-3 h-3 mr-1 text-[#C8421E]" />
                                Pending
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-academic-muted">
                            {student.is_submitted && student.submitted_at
                              ? formatDateTime(student.submitted_at)
                              : <span className="text-academic-muted/50">—</span>}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {student.timing_status === '—' ? (
                              <span className="text-academic-muted/50">—</span>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${timingBadgeClass}`}>
                                <Clock className="w-3 h-3 mr-1" />
                                {student.timing_status}
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {evalDisplay === 'Evaluated' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                                Evaluated
                              </span>
                            ) : evalDisplay === 'Pending' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-academic-paleGreen text-academic-muted border border-academic-border">
                                Pending
                              </span>
                            ) : (
                              <span className="text-academic-muted/50">—</span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                            {student.published_score !== null && student.published_score !== undefined ? (
                              <span className="text-academic-deepGreen font-semibold">
                                {student.published_score} <span className="text-academic-muted font-normal">/ {selectedAssessment.max_marks}</span>
                              </span>
                            ) : (
                              <span className="text-academic-muted/50">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
