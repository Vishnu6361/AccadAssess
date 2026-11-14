import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  FileText,
  Search,
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Download,
  Eye,
  Shield,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  hodApi,
  submissionApi,
  evaluationApi,
  InstitutionalSubjectReportItem,
  InstitutionalStudentReportItem,
  ApiErrorKind,
} from '../../services/apiClient';
import { RubricBreakdownSection } from '../../components/RubricBreakdownSection';

/**
 * Loading skeleton for first-time visit while data is being fetched.
 */
const RenderApiErrorAlert: React.FC<{
  error: { message: string; kind?: ApiErrorKind; status?: number; isRetryable?: boolean };
  onRetry: () => void;
  isLoading: boolean;
}> = ({ error, onRetry, isLoading }) => {
  const getBadgeStyle = () => {
    switch (error.kind) {
      case 'TIMEOUT':
        return { label: 'Request Timeout', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'BACKEND_UNAVAILABLE':
        return { label: 'Server Unavailable', bg: 'bg-red-100 text-red-800 border-red-300' };
      case 'AUTH_FAILURE':
        return { label: 'Access Denied', bg: 'bg-purple-100 text-purple-800 border-purple-300' };
      case 'DATABASE_FAILURE':
        return { label: 'Database Error', bg: 'bg-orange-100 text-orange-800 border-orange-300' };
      default:
        return { label: error.status ? `Error ${error.status}` : 'API Error', bg: 'bg-rose-100 text-rose-800 border-rose-300' };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div className="p-4 bg-red-50/90 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm shadow-xs">
      <div className="flex items-start sm:items-center gap-2.5">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badge.bg}`}>
              {badge.label}
            </span>
            {error.status && <span className="text-xs text-academic-muted font-mono">HTTP {error.status}</span>}
          </div>
          <p className="text-red-900 font-medium text-xs sm:text-sm">{error.message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={isLoading}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        <span>{isLoading ? 'Retrying...' : 'Retry'}</span>
      </button>
    </div>
  );
};

const InstitutionalReportSkeleton: React.FC = () => (
  <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-pulse">
    <div className="h-4 w-48 bg-academic-borderSubtle rounded" />
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
      <div className="space-y-2">
        <div className="h-7 w-64 bg-academic-borderSubtle rounded" />
        <div className="h-4 w-96 bg-academic-borderSubtle rounded" />
      </div>
      <div className="h-9 w-24 bg-academic-borderSubtle rounded-lg" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3].map(n => (
        <div key={n} className="bg-academic-surface border border-academic-border rounded-xl p-5 space-y-4 shadow-sm h-48" />
      ))}
    </div>
  </div>
);

export const InstitutionalSubmissionReport: React.FC = () => {
  // Navigation Selection State (Three-level hierarchy)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Raw Server Data
  const [subjects, setSubjects] = useState<InstitutionalSubjectReportItem[]>([]);
  const [classesList, setClassesList] = useState<Array<{ id: string; name: string; programme: string; semester: number }>>([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<{ message: string; kind?: ApiErrorKind; status?: number; isRetryable?: boolean } | null>(null);
  const [level3Error, setLevel3Error] = useState<{ message: string; kind?: ApiErrorKind; status?: number; isRetryable?: boolean } | null>(null);

  // Level 3 Cache (Assessment ID -> Students array)
  const [assessmentStudentsCache, setAssessmentStudentsCache] = useState<Record<string, InstitutionalStudentReportItem[]>>({});
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);

  // Level 2 Filters
  const [assessmentSearch, setAssessmentSearch] = useState<string>('');
  const [assessmentClassFilter, setAssessmentClassFilter] = useState<string>('all');

  // Level 3 Filters
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'submitted' | 'pending'>('all');
  const [studentEvaluationFilter, setStudentEvaluationFilter] = useState<string>('all');

  // Submission Details Modal State (Strictly Read-Only)
  const [selectedSubmissionDetails, setSelectedSubmissionDetails] = useState<any | null>(null);
  const [isLoadingSubmissionDetails, setIsLoadingSubmissionDetails] = useState<boolean>(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Load Institutional Overview Data
  const loadOverviewData = async () => {
    setIsLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await hodApi.getInstitutionalSubmissionsReport();
      setSubjects(res.subjects || []);
      setClassesList(res.classes || []);
    } catch (err: any) {
      console.error('Failed to load institutional submissions report overview:', err);
      setOverviewError({
        message: err.message || 'Failed to load institutional overview data.',
        kind: err.kind || (err.isTimeout ? 'TIMEOUT' : 'ENDPOINT_FAILURE'),
        status: err.status,
        isRetryable: err.isRetryable ?? true
      });
    } finally {
      setIsLoadingOverview(false);
    }
  };

  useEffect(() => {
    loadOverviewData();
  }, []);

  // On-Demand Fetch for Level 3: Assessment Students Roster
  useEffect(() => {
    if (!selectedAssessmentId) return;

    // If already cached, avoid re-fetching unless explicitly refreshed
    if (assessmentStudentsCache[selectedAssessmentId]) {
      return;
    }

    const fetchAssessmentStudents = async () => {
      setIsLoadingStudents(true);
      setLevel3Error(null);
      try {
        const res = await hodApi.getInstitutionalSubmissionsReport(selectedAssessmentId);
        if (res.students) {
          setAssessmentStudentsCache(prev => ({
            ...prev,
            [selectedAssessmentId]: res.students
          }));
        }
      } catch (err: any) {
        console.error('Failed to load assessment student roster:', err);
        setLevel3Error({
          message: err.message || 'Failed to load student roster for this assessment.',
          kind: err.kind || (err.isTimeout ? 'TIMEOUT' : 'ENDPOINT_FAILURE'),
          status: err.status,
          isRetryable: err.isRetryable ?? true
        });
      } finally {
        setIsLoadingStudents(false);
      }
    };

    fetchAssessmentStudents();
  }, [selectedAssessmentId]);

  // Date/Time Formatter
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

  // Find Currently Selected Subject & Assessment
  const selectedSubject = useMemo(() => {
    if (!selectedSubjectId) return null;
    return subjects.find(s => (s.id && s.id === selectedSubjectId) || s.subject_id === selectedSubjectId || s.subject_code === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  const selectedAssessment = useMemo(() => {
    if (!selectedSubject || !selectedAssessmentId) return null;
    return selectedSubject.assessments.find(a => a.id === selectedAssessmentId || a.assessment_id === selectedAssessmentId) || null;
  }, [selectedSubject, selectedAssessmentId]);

  // Level 2: Filtered Assessments for Selected Subject
  const filteredAssessments = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.assessments.filter(ass => {
      if (assessmentClassFilter !== 'all' && ass.class_id !== assessmentClassFilter) {
        return false;
      }
      const q = assessmentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        ass.title.toLowerCase().includes(q) ||
        ass.class_name.toLowerCase().includes(q)
      );
    });
  }, [selectedSubject, assessmentSearch, assessmentClassFilter]);

  // Level 3: Current Assessment Students and Filtered Roster
  const currentAssessmentStudents = useMemo(() => {
    if (!selectedAssessmentId) return [];
    return assessmentStudentsCache[selectedAssessmentId] || [];
  }, [assessmentStudentsCache, selectedAssessmentId]);

  const filteredLevel3Students = useMemo(() => {
    return currentAssessmentStudents.filter(st => {
      // Status Filter
      if (studentStatusFilter === 'submitted' && !st.is_submitted) return false;
      if (studentStatusFilter === 'pending' && st.is_submitted) return false;

      // Evaluation Status Filter
      if (studentEvaluationFilter !== 'all') {
        if (studentEvaluationFilter === 'evaluated' && !(st.evaluation_status === 'completed' || st.evaluation_status === 'published')) {
          return false;
        }
        if (studentEvaluationFilter === 'pending_eval' && !(st.is_submitted && st.evaluation_status !== 'completed' && st.evaluation_status !== 'published')) {
          return false;
        }
        if (studentEvaluationFilter === 'published' && st.evaluation_status !== 'published') {
          return false;
        }
      }

      // Search Filter
      const q = studentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        st.name.toLowerCase().includes(q) ||
        (st.usn && st.usn.toLowerCase().includes(q)) ||
        st.email.toLowerCase().includes(q) ||
        (st.class_name && st.class_name.toLowerCase().includes(q)) ||
        (st.specialization_code && st.specialization_code.toLowerCase().includes(q))
      );
    });
  }, [currentAssessmentStudents, studentSearch, studentStatusFilter, studentEvaluationFilter]);

  // Navigation Handlers
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedAssessmentId(null);
    setAssessmentSearch('');
    setAssessmentClassFilter('all');
  };

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setStudentSearch('');
    setStudentStatusFilter('all');
    setStudentEvaluationFilter('all');
  };

  const handleBackToSubjects = () => {
    setSelectedSubjectId(null);
    setSelectedAssessmentId(null);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessmentId(null);
  };

  // Read-Only Submission Details Modal Handlers
  const handleOpenSubmissionDetails = async (row: any) => {
    setSelectedSubmissionDetails({
      reportRow: row,
      fullSubmission: null,
      resultDetail: null
    });

    if (!row.submission_id) {
      return;
    }

    setIsLoadingSubmissionDetails(true);
    try {
      const [fullSub, resDetail] = await Promise.all([
        submissionApi.getSubmissionById(row.submission_id).catch(() => null),
        evaluationApi.getResultDetail(row.submission_id).catch(() => null)
      ]);
      setSelectedSubmissionDetails({
        reportRow: row,
        fullSubmission: fullSub,
        resultDetail: resDetail
      });
    } catch {
      setSelectedSubmissionDetails({
        reportRow: row,
        fullSubmission: null,
        resultDetail: null
      });
    } finally {
      setIsLoadingSubmissionDetails(false);
    }
  };

  const handleDownloadFile = async (submissionId: string, versionId: string, fileId: string, filename: string) => {
    try {
      setDownloadingFileId(fileId);
      await submissionApi.downloadSubmissionFile(submissionId, versionId, fileId, filename);
    } catch (err: any) {
      console.error('Failed to download submission file:', err);
      alert(err.message || 'Failed to download file.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // CSV Export for Selected Assessment Report
  const exportAssessmentReportToCsv = () => {
    if (!selectedAssessment || !selectedSubject) return;
    const headers = [
      'Student Name',
      'Institutional ID (USN)',
      'Programme',
      'Specialization',
      'Semester',
      'Class',
      'Assessment Title',
      'Subject Code',
      'Subject Name',
      'Submission Status',
      'Submitted Date/Time',
      'Timing Status',
      'Evaluation Status',
      'Marks Obtained',
      'Max Marks'
    ];

    const rows = filteredLevel3Students.map(item => {
      return [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.usn || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.programme || 'MCA').replace(/"/g, '""')}"`,
        `"${(item.specialization_code || 'Core').replace(/"/g, '""')}"`,
        `"${item.semester ?? '—'}"`,
        `"${(item.class_name || 'Class').replace(/"/g, '""')}"`,
        `"${(selectedAssessment.title || '').replace(/"/g, '""')}"`,
        `"${(selectedSubject.subject_code || '').replace(/"/g, '""')}"`,
        `"${(selectedSubject.subject_name || '').replace(/"/g, '""')}"`,
        `"${item.is_submitted ? 'Submitted' : 'Pending'}"`,
        `"${item.submitted_at ? formatDateTime(item.submitted_at) : '—'}"`,
        `"${item.timing_status}"`,
        `"${item.evaluation_status_label}"`,
        `"${item.score !== null ? item.score : '—'}"`,
        `"${selectedAssessment.max_marks || 50}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = selectedAssessment.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `institutional_${selectedSubject.subject_code || 'subject'}_${safeTitle}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isLoadingOverview && subjects.length === 0 && !overviewError) {
    return <InstitutionalReportSkeleton />;
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
          Institutional Submission Report
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
              Institution-wide Student Submission Report
            </span>
          </>
        )}
      </nav>

      {/* Error Alert */}
      {overviewError && (
        <RenderApiErrorAlert
          error={overviewError}
          onRetry={loadOverviewData}
          isLoading={isLoadingOverview}
        />
      )}

      {/* LEVEL 1: SUBJECTS LIST (Clean, Subject-First Main Page)                 */}
      {/* ====================================================================== */}
      {!selectedSubject && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <h2 className="text-xl font-bold text-academic-deepGreen flex items-center gap-2.5">
                <BookOpen className="w-6 h-6 text-academic-primaryGreen" />
                Institutional Submissions Report
              </h2>
              <p className="text-sm text-academic-muted mt-1">
                Select a subject to monitor published assessments and student submission progress across the institution
              </p>
            </div>
            <button
              onClick={loadOverviewData}
              disabled={isLoadingOverview}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
              title="Refresh Institutional Data"
            >
              <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isLoadingOverview ? 'animate-spin' : ''}`} />
              <span>{isLoadingOverview ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Subjects Grid */}
          {subjects.length === 0 ? (
            <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
              <BookOpen className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-academic-deepGreen">No Subjects Found</h3>
              <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                No subjects with published assessments were found across the institution.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {subjects.map((sub) => (
                <div
                  key={sub.id || sub.subject_id}
                  onClick={() => handleSelectSubject(sub.id || sub.subject_id)}
                  className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/40 hover:shadow-academicCard transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                          {sub.subject_code}
                        </span>
                        <span className="text-[11px] font-medium text-academic-muted bg-academic-surface border border-academic-border px-2 py-0.5 rounded">
                          {sub.programme} {sub.semester ? `Sem ${sub.semester}` : ''}
                        </span>
                      </div>

                      {sub.specialization_code ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {sub.specialization_code}
                        </span>
                      ) : (
                        <span className="text-xs text-academic-muted font-medium">Core / Common</span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors mt-2">
                      {sub.subject_name}
                    </h3>
                  </div>

                  <div className="pt-4 mt-4 border-t border-academic-borderSubtle flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3 text-academic-muted">
                      <div className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">{sub.published_assessments_count}</span>
                        <span>{sub.published_assessments_count === 1 ? 'Assessment' : 'Assessments'}</span>
                      </div>
                      <span>•</span>
                      <span>
                        <strong className="text-academic-deepGreen font-semibold">{sub.total_eligible_students}</strong> Enrolled
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1 text-academic-primaryGreen font-semibold group-hover:translate-x-0.5 transition-transform">
                      <span>View Assessments</span>
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* LEVEL 2: ASSESSMENTS LIST (Belonging to Selected Subject)               */}
      {/* ====================================================================== */}
      {selectedSubject && !selectedAssessment && (
        <div className="space-y-6">
          <button
            onClick={handleBackToSubjects}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-muted hover:text-academic-deepGreen transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Subjects</span>
          </button>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                  {selectedSubject.subject_code}
                </span>
                <span className="text-xs font-medium text-academic-muted bg-academic-surface border border-academic-border px-2 py-0.5 rounded">
                  {selectedSubject.programme} {selectedSubject.semester ? `Semester ${selectedSubject.semester}` : ''}
                </span>
                {selectedSubject.specialization_code && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {selectedSubject.specialization_code}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-academic-deepGreen">
                {selectedSubject.subject_name}
              </h2>
              <p className="text-sm text-academic-muted mt-1">
                Published assessments across all cohorts taking this subject. Select an assessment to inspect student submissions.
              </p>
            </div>
            <button
              onClick={loadOverviewData}
              disabled={isLoadingOverview}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
              title="Refresh Assessments"
            >
              <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isLoadingOverview ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Level 2 Filters */}
          <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
              <input
                type="text"
                placeholder="Search assessments by title..."
                value={assessmentSearch}
                onChange={(e) => setAssessmentSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen placeholder:text-academic-muted/70 focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
              />
            </div>

            {/* Filter by Class (if multi-class subject) */}
            <div className="flex items-center space-x-2">
              <label htmlFor="filter-ass-class" className="text-xs text-academic-muted whitespace-nowrap">
                Class:
              </label>
              <select
                id="filter-ass-class"
                value={assessmentClassFilter}
                onChange={(e) => setAssessmentClassFilter(e.target.value)}
                className="input-field text-xs py-1.5 px-3 min-w-[140px]"
              >
                <option value="all">All Classes</option>
                {Array.from(new Set(selectedSubject.assessments.map(a => a.class_id))).map(cid => {
                  const matched = classesList.find(c => c.id === cid) || selectedSubject.assessments.find(a => a.class_id === cid);
                  const label = (matched as any)?.name || (matched as any)?.class_name || 'Class';
                  return (
                    <option key={cid} value={cid}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Assessments Grid */}
          {filteredAssessments.length === 0 ? (
            <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
              <FileText className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-academic-deepGreen">No Assessments Found</h3>
              <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                {assessmentSearch.trim() || assessmentClassFilter !== 'all'
                  ? 'No published assessments match your filter criteria.'
                  : 'No published assessments are available for this subject.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAssessments.map((ass) => {
                const isPastDue = ass.deadline_at ? new Date(ass.deadline_at) < new Date() : false;

                return (
                  <div
                    key={ass.id}
                    className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/40 hover:shadow-academicCard transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Published
                        </span>
                        <span className="text-xs font-medium text-academic-muted">
                          Max marks: {ass.max_marks || 50}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-academic-deepGreen mb-1">
                        {ass.title}
                      </h3>

                      <div className="text-xs text-academic-muted space-y-0.5 mt-2">
                        <p>
                          Class: <strong className="text-academic-deepGreen font-semibold">{ass.class_name}</strong>
                        </p>
                        <p>
                          Programme: <span className="font-medium text-academic-deepGreen">{ass.programme} {ass.semester ? `Sem ${ass.semester}` : ''}</span>
                          {ass.specialization_code && (
                            <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {ass.specialization_code}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-academic-muted mt-3">
                        <Calendar className="w-3.5 h-3.5 text-academic-primaryGreen" />
                        <span>Due: {ass.deadline_at ? formatDateTime(ass.deadline_at) : 'Open'}</span>
                        {isPastDue && <span className="text-[10px] text-rose-600 font-bold ml-1">(Closed)</span>}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-academic-borderSubtle space-y-3">
                      <div>
                        <div className="flex justify-between items-center text-xs mb-1.5">
                          <span className="text-academic-muted">Submissions Progress</span>
                          <span className="font-bold text-academic-deepGreen">{ass.submission_count} / {ass.total_eligible_students} ({ass.progress_pct}%)</span>
                        </div>
                        <div className="w-full bg-academic-paleGreen rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-academic-primaryGreen transition-all duration-300"
                            style={{ width: `${ass.progress_pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-academic-muted">
                        <span>Evaluated: <strong className="text-academic-deepGreen">{ass.evaluated_count}</strong></span>
                        <span>Pending: <strong className="text-amber-700">{ass.pending_count}</strong></span>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleSelectAssessment(ass.id)}
                          className="btn-primary py-1.5 px-3 text-xs inline-flex items-center space-x-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Student Report</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* LEVEL 3: INSTITUTION-WIDE STUDENT SUBMISSION REPORT                     */}
      {/* ====================================================================== */}
      {selectedSubject && selectedAssessment && (
        <div className="space-y-6">
          <button
            onClick={handleBackToAssessments}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-muted hover:text-academic-deepGreen transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Assessments</span>
          </button>

          {/* Assessment Summary Header Card */}
          <div className="p-4 bg-academic-surface border border-academic-border rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Published
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                  {selectedSubject.subject_code}
                </span>
                {selectedAssessment.specialization_code && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    {selectedAssessment.specialization_code}
                  </span>
                )}
                <span className="text-xs text-academic-muted font-medium bg-academic-surface border border-academic-border px-2 py-0.5 rounded">
                  {selectedAssessment.class_name}
                </span>
              </div>
              <h2 className="text-xl font-bold text-academic-deepGreen">
                {selectedAssessment.title}
              </h2>
              <div className="flex items-center gap-4 text-xs text-academic-muted mt-2 flex-wrap">
                <span>Subject: <strong className="text-academic-deepGreen font-semibold">{selectedSubject.subject_name}</strong></span>
                <span>Max Marks: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.max_marks || 50}</strong></span>
                <span>Deadline: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.deadline_at ? formatDateTime(selectedAssessment.deadline_at) : 'Open'}</strong></span>
                <span>Eligible Cohort: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.total_eligible_students} Students</strong></span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={exportAssessmentReportToCsv}
                disabled={filteredLevel3Students.length === 0}
                className="btn-secondary text-xs px-3 py-2 flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => {
                  if (selectedAssessmentId) {
                    setIsLoadingStudents(true);
                    hodApi.getInstitutionalSubmissionsReport(selectedAssessmentId)
                      .then(res => {
                        if (res.students) {
                          setAssessmentStudentsCache(prev => ({
                            ...prev,
                            [selectedAssessmentId]: res.students
                          }));
                        }
                      })
                      .finally(() => setIsLoadingStudents(false));
                  }
                }}
                disabled={isLoadingStudents}
                className="btn-secondary text-xs px-3 py-2 flex items-center space-x-1.5 shadow-sm"
                title="Refresh Report Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-academic-primaryGreen ${isLoadingStudents ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Filter Controls Bar */}
          <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by student name or USN..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="input-field pl-9 text-xs w-full py-1.5"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Submission Status Selector */}
              <div className="flex items-center space-x-2">
                <label htmlFor="filter-inst-status" className="text-xs text-academic-muted whitespace-nowrap">
                  Submission:
                </label>
                <select
                  id="filter-inst-status"
                  value={studentStatusFilter}
                  onChange={(e) => setStudentStatusFilter(e.target.value as any)}
                  className="input-field text-xs py-1.5 px-2.5 min-w-[130px]"
                >
                  <option value="all">All Students ({currentAssessmentStudents.length})</option>
                  <option value="submitted">Submitted ({currentAssessmentStudents.filter(s => s.is_submitted).length})</option>
                  <option value="pending">Pending ({currentAssessmentStudents.filter(s => !s.is_submitted).length})</option>
                </select>
              </div>

              {/* Evaluation Status Selector */}
              <div className="flex items-center space-x-2">
                <label htmlFor="filter-inst-eval" className="text-xs text-academic-muted whitespace-nowrap">
                  Evaluation:
                </label>
                <select
                  id="filter-inst-eval"
                  value={studentEvaluationFilter}
                  onChange={(e) => setStudentEvaluationFilter(e.target.value)}
                  className="input-field text-xs py-1.5 px-2.5 min-w-[150px]"
                >
                  <option value="all">All Evaluation States</option>
                  <option value="evaluated">Evaluated / Completed</option>
                  <option value="pending_eval">Pending Evaluation</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
          </div>

          {/* Student Submissions Table */}
          {level3Error && (
            <RenderApiErrorAlert
              error={level3Error}
              onRetry={() => {
                if (selectedAssessmentId) {
                  setAssessmentStudentsCache(prev => {
                    const next = { ...prev };
                    delete next[selectedAssessmentId];
                    return next;
                  });
                  setIsLoadingStudents(true);
                  setLevel3Error(null);
                  hodApi.getInstitutionalSubmissionsReport(selectedAssessmentId)
                    .then(res => {
                      if (res.students) {
                        setAssessmentStudentsCache(prev => ({
                          ...prev,
                          [selectedAssessmentId]: res.students
                        }));
                      }
                    })
                    .catch(err => {
                      setLevel3Error({
                        message: err.message || 'Failed to load student roster.',
                        kind: err.kind || (err.isTimeout ? 'TIMEOUT' : 'ENDPOINT_FAILURE'),
                        status: err.status,
                        isRetryable: err.isRetryable ?? true
                      });
                    })
                    .finally(() => setIsLoadingStudents(false));
                }
              }}
              isLoading={isLoadingStudents}
            />
          )}

          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden">
            {isLoadingStudents ? (
              <div className="py-16 text-center text-academic-muted flex items-center justify-center space-x-2">
                <RefreshCw className="w-5 h-5 animate-spin text-academic-primaryGreen" />
                <span className="text-sm">Loading student cohort submission records...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-academic-paleGreen/50 text-academic-deepGreen font-semibold border-b border-academic-border">
                    <tr>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">USN / Admission No.</th>
                      <th className="py-3 px-4">Programme & Spec</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4 text-center">Submission Status</th>
                      <th className="py-3 px-4">Submitted Date/Time</th>
                      <th className="py-3 px-4 text-center">Timing Status</th>
                      <th className="py-3 px-4 text-center">Evaluation Status</th>
                      <th className="py-3 px-4 text-right">Published Marks</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-academic-border">
                    {filteredLevel3Students.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-academic-muted">
                          No student records match your filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredLevel3Students.map((item) => (
                        <tr key={item.id} className="hover:bg-academic-paleGreen/20 transition-colors">
                          <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                            <span>{item.name}</span>
                            <span className="text-[11px] font-normal text-academic-muted block">{item.email}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-academic-deepGreen">
                            {item.usn}
                          </td>
                          <td className="py-3 px-4 text-academic-deepGreen">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{item.programme} {item.semester ? `S${item.semester}` : ''}</span>
                              {item.specialization_code && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {item.specialization_code}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-academic-muted">
                            {item.class_name}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.is_submitted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                Submitted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3" />
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-academic-muted text-[11px]">
                            {formatDateTime(item.submitted_at)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.timing_status === 'On Time' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                On Time
                              </span>
                            )}
                            {item.timing_status === 'Late' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                Late
                              </span>
                            )}
                            {item.timing_status === '—' && (
                              <span className="text-academic-muted font-mono">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.evaluation_status_label === 'Published' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                Published
                              </span>
                            )}
                            {item.evaluation_status_label === 'Evaluated' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                Evaluated
                              </span>
                            )}
                            {item.evaluation_status_label === 'Pending Evaluation' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Pending Evaluation
                              </span>
                            )}
                            {item.evaluation_status_label === '—' && (
                              <span className="text-academic-muted font-mono">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-academic-deepGreen">
                            {item.score !== null ? (
                              <span>{item.score} / {item.max_marks || 50}</span>
                            ) : item.is_submitted ? (
                              <span className="text-xs text-academic-muted italic">Pending</span>
                            ) : (
                              <span className="text-academic-muted font-mono">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.is_submitted ? (
                              <button
                                onClick={() => handleOpenSubmissionDetails(item.report_row)}
                                className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center space-x-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Details</span>
                              </button>
                            ) : (
                              <button
                                disabled
                                className="py-1 px-2.5 text-xs text-academic-muted/50 cursor-not-allowed inline-flex items-center space-x-1 opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Details</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* READ-ONLY SUBMISSION DETAILS MODAL FOR HOD                             */}
      {/* ====================================================================== */}
      {selectedSubmissionDetails && (
        <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-2xl w-full max-h-[90vh] shadow-2xl border border-academic-border animate-in fade-in p-6 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4 shrink-0">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-academic-primaryGreen" />
                <h3 className="text-base font-bold text-academic-deepGreen">
                  Submission & Evaluation Details
                </h3>
              </div>
              <button
                onClick={() => setSelectedSubmissionDetails(null)}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Read-Only Oversight Notice */}
            <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 text-xs flex items-center space-x-2 shrink-0">
              <Shield className="w-4 h-4 text-blue-700 shrink-0" />
              <span>
                <strong>HOD Institutional Oversight View:</strong> Read-only inspection of submission metadata and evaluation results. Mark authoring is restricted to assigned Subject Teachers.
              </span>
            </div>

            {isLoadingSubmissionDetails ? (
              <div className="py-12 text-center text-academic-muted flex items-center justify-center space-x-2 flex-1">
                <RefreshCw className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                <span>Loading submission files and rubric evaluation breakdown...</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 p-3 bg-academic-surface rounded border border-academic-border">
                  <div>
                    <span className="text-academic-muted block text-[11px]">Student</span>
                    <span className="font-bold text-academic-deepGreen text-sm block">
                      {selectedSubmissionDetails.reportRow.student_name}
                    </span>
                    <span className="font-mono text-academic-muted text-[11px]">
                      {selectedSubmissionDetails.reportRow.student_usn || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-academic-muted block text-[11px]">Assessment & Subject</span>
                    <span className="font-bold text-academic-deepGreen text-sm block">
                      {selectedSubmissionDetails.reportRow.assessment_title}
                    </span>
                    <span className="text-academic-muted text-[11px]">
                      {selectedSubmissionDetails.reportRow.subject_name}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3 bg-academic-surface rounded border border-academic-border">
                  <div>
                    <span className="text-academic-muted block text-[11px]">Submission Status</span>
                    <span className="font-semibold text-academic-deepGreen block">
                      {selectedSubmissionDetails.reportRow.is_submitted ? (
                        selectedSubmissionDetails.reportRow.is_late ? 'Submitted (Late)' : 'Submitted (On Time)'
                      ) : 'Pending Submission'}
                    </span>
                  </div>
                  <div>
                    <span className="text-academic-muted block text-[11px]">Submitted At</span>
                    <span className="text-academic-deepGreen block">
                      {selectedSubmissionDetails.reportRow.submitted_at
                        ? new Date(selectedSubmissionDetails.reportRow.submitted_at).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-academic-muted block text-[11px]">Marks Obtained</span>
                    <span className="font-bold text-academic-primaryGreen text-sm block">
                      {selectedSubmissionDetails.reportRow.published_score !== null && selectedSubmissionDetails.reportRow.published_score !== undefined
                        ? `${selectedSubmissionDetails.reportRow.published_score} / ${selectedSubmissionDetails.reportRow.max_marks || 50}`
                        : (selectedSubmissionDetails.reportRow.evaluation_status === 'completed'
                          ? 'Awaiting Publication'
                          : (selectedSubmissionDetails.reportRow.is_submitted ? 'Under Evaluation' : '—'))}
                    </span>
                  </div>
                </div>

                {/* Uploaded Files Section */}
                <div className="p-3 bg-academic-surface rounded border border-academic-border">
                  <span className="font-bold text-academic-deepGreen uppercase tracking-wider block mb-2 text-[11px]">
                    Submitted Binary Files
                  </span>
                  {(!selectedSubmissionDetails.fullSubmission?.active_version?.files || selectedSubmissionDetails.fullSubmission.active_version.files.length === 0) ? (
                    <p className="text-academic-muted italic">
                      {selectedSubmissionDetails.reportRow.is_submitted
                        ? '1 file attached to this submission record.'
                        : 'No files submitted.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedSubmissionDetails.fullSubmission.active_version.files.map((file: any) => (
                        <div key={file.id} className="flex items-center justify-between p-2 rounded bg-white border border-academic-border">
                          <span className="font-medium text-academic-deepGreen truncate max-w-xs">
                            {file.original_filename || file.filename || 'Submitted File'}
                          </span>
                          <button
                            onClick={() => handleDownloadFile(
                              selectedSubmissionDetails.reportRow.submission_id,
                              selectedSubmissionDetails.fullSubmission.active_version.id,
                              file.id,
                              file.original_filename || file.filename
                            )}
                            disabled={downloadingFileId === file.id}
                            className="btn-secondary py-1 px-2 text-xs flex items-center space-x-1"
                          >
                            <Download className={`w-3.5 h-3.5 ${downloadingFileId === file.id ? 'animate-spin' : ''}`} />
                            <span>Download</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rubric-wise Evaluation Breakdown Section */}
                <div className="pt-1">
                  <RubricBreakdownSection
                    criterionScores={selectedSubmissionDetails.resultDetail?.evaluation?.criterion_scores}
                    totalScore={selectedSubmissionDetails.resultDetail?.evaluation?.total_score ?? selectedSubmissionDetails.reportRow.published_score}
                    maxMarks={selectedSubmissionDetails.resultDetail?.assessment?.max_marks || selectedSubmissionDetails.reportRow.max_marks || 50}
                    evaluatorName={selectedSubmissionDetails.resultDetail?.evaluation?.evaluator_name}
                    evaluationStatus={selectedSubmissionDetails.resultDetail?.evaluation?.status || selectedSubmissionDetails.reportRow.evaluation_status}
                    generalFeedback={selectedSubmissionDetails.resultDetail?.evaluation?.general_feedback || selectedSubmissionDetails.reportRow.feedback}
                    latePenaltyDeducted={selectedSubmissionDetails.resultDetail?.evaluation?.late_penalty_deducted}
                    rawScore={selectedSubmissionDetails.resultDetail?.evaluation?.raw_score}
                    isSubmitted={Boolean(selectedSubmissionDetails.reportRow.is_submitted)}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-academic-border flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedSubmissionDetails(null)}
                className="btn-secondary text-xs px-4 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
