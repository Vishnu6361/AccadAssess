import React, { useState, useEffect, useMemo } from 'react';
import {
  ScrollText,
  Clock,
  Loader2,
  AlertCircle,
  Search,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  evaluationApi,
  StudentSubjectPerformanceDTO,
  StudentSubjectAssessmentDTO
} from '../../services/apiClient';
import { AssessmentResultDetailModal } from '../../components/AssessmentResultDetailModal';

export const StudentResults: React.FC = () => {
  const [subjects, setSubjects] = useState<StudentSubjectPerformanceDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSubjectIds, setExpandedSubjectIds] = useState<Set<string>>(new Set());

  // Modal State
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const loadDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.getStudentPerformanceDashboard();
      setSubjects(data);
      // Auto-expand all subjects initially
      setExpandedSubjectIds(new Set(data.map((s) => s.subject_id)));
    } catch (err: any) {
      console.error('Failed to load student performance dashboard:', err);
      setError(err.message || 'Unable to load published results. Please verify your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const toggleSubjectExpand = (subjectId: string) => {
    setExpandedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  const handleOpenDetail = (submissionId: string) => {
    setSelectedSubmissionId(submissionId);
    setIsModalOpen(true);
  };

  // Filtered subjects based on search query
  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return subjects;
    const q = searchQuery.toLowerCase().trim();
    return subjects.filter(
      (s) =>
        s.subject_code.toLowerCase().includes(q) ||
        s.subject_name.toLowerCase().includes(q) ||
        s.programme.toLowerCase().includes(q)
    );
  }, [subjects, searchQuery]);

  // Overall KPIs across all subjects
  const overallKPIs = useMemo(() => {
    const totalSubjects = subjects.length;
    let totalAssessments = 0;
    let totalResults = 0;
    let scoreSumPct = 0;

    for (const sub of subjects) {
      totalAssessments += sub.published_assessment_count;
      totalResults += sub.results_available_count;
      if (sub.average_percentage !== null && sub.results_available_count > 0) {
        scoreSumPct += sub.average_percentage * sub.results_available_count;
      }
    }

    const overallAveragePct = totalResults > 0 ? Math.round(scoreSumPct / totalResults) : null;

    return {
      totalSubjects,
      totalAssessments,
      totalResults,
      overallAveragePct
    };
  }, [subjects]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-academic-paleGreen text-academic-primaryGreen shadow-2xs">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
                Subject-Wise Academic Performance & Results
              </h1>
              <p className="text-xs text-academic-muted mt-0.5">
                Official formative grades, criterion-level rubric breakdowns, and instructor feedback across enrolled subjects.
              </p>
            </div>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={loadDashboard}
            disabled={isLoading}
            className="btn-secondary text-xs px-3.5 py-1.5 self-start sm:self-auto shrink-0 flex items-center space-x-1.5"
          >
            <Clock className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Results</span>
          </button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-academic-border">
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Enrolled Subjects
            </span>
            <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
              {overallKPIs.totalSubjects}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Published Tasks
            </span>
            <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
              {overallKPIs.totalAssessments}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Results Published
            </span>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">
              {overallKPIs.totalResults}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Overall Average
            </span>
            <div className="text-lg font-bold text-academic-primaryGreen mt-0.5">
              {overallKPIs.overallAveragePct !== null ? `${overallKPIs.overallAveragePct}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by subject code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-academic pl-9 text-xs w-full py-2"
          />
        </div>
        <span className="text-xs text-academic-muted self-end sm:self-center font-medium">
          Showing {filteredSubjects.length} of {subjects.length} Subjects
        </span>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-16 text-center text-academic-muted flex flex-col items-center space-y-2 bg-academic-surface border border-academic-border rounded-xl shadow-xs">
          <Loader2 className="w-6 h-6 animate-spin text-academic-primaryGreen" />
          <p className="text-xs font-semibold text-academic-deepGreen">
            Fetching subject performance and published evaluations...
          </p>
          <p className="text-[11px] text-academic-muted">
            Resolving course enrollments, criterion scores, and rubric levels.
          </p>
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl shadow-xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-academic-paleGreen text-academic-primaryGreen flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-academic-deepGreen">
            {searchQuery ? 'No Matching Subjects Found' : 'No Enrolled Subjects or Published Results'}
          </h2>
          <p className="text-xs text-academic-muted max-w-md mx-auto leading-relaxed">
            {searchQuery
              ? `No subject matched "${searchQuery}". Please check the subject code or clear the filter.`
              : 'Your active enrollments have not published assessment results yet. Once course faculty publish rubric evaluations, grades and feedback will display here.'}
          </p>
        </div>
      ) : (
        /* Subject Cards */
        <div className="space-y-4">
          {filteredSubjects.map((sub) => {
            const isExpanded = expandedSubjectIds.has(sub.subject_id);

            return (
              <div
                key={sub.subject_id}
                className="bg-academic-surface border border-academic-border rounded-xl shadow-xs overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Subject Header Bar */}
                <div
                  onClick={() => toggleSubjectExpand(sub.subject_id)}
                  className="p-4 sm:p-5 border-b border-academic-border bg-academic-paleGreen/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-academic-paleGreen/25 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-academic-primaryGreen text-white">
                        {sub.subject_code}
                      </span>
                      <span className="text-xs text-academic-muted font-medium">
                        {sub.programme} &bull; Sem {sub.semester} &bull; Sec {sub.section}
                      </span>
                      <span className="text-[10px] text-academic-muted bg-academic-surface border border-academic-border px-1.5 py-0.2 rounded">
                        {sub.credits} Credits
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-academic-deepGreen truncate">
                      {sub.subject_name}
                    </h2>
                  </div>

                  {/* Summary Metric Badges & Expand Arrow */}
                  <div className="flex items-center space-x-3 self-end sm:self-auto">
                    <div className="text-right">
                      <div className="flex items-center space-x-1.5 justify-end">
                        <span className="text-[11px] font-semibold text-academic-muted">
                          Average:
                        </span>
                        <span
                          className={`text-sm font-bold ${
                            sub.average_percentage !== null
                              ? 'text-academic-primaryGreen'
                              : 'text-academic-muted'
                          }`}
                        >
                          {sub.average_percentage !== null ? `${sub.average_percentage}%` : 'N/A'}
                        </span>
                      </div>
                      <span className="text-[10px] text-academic-muted block mt-0.5">
                        {sub.results_available_count} of {sub.published_assessment_count} Results Published
                      </span>
                    </div>

                    <button
                      type="button"
                      className="p-1 rounded-md text-academic-muted hover:text-academic-deepGreen hover:bg-academic-paleGreen"
                      aria-label={isExpanded ? 'Collapse subject' : 'Expand subject'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Subject Assessment List */}
                {isExpanded && (
                  <div className="divide-y divide-academic-border">
                    {sub.assessments.length === 0 ? (
                      <div className="p-6 text-center text-xs text-academic-muted bg-[#FFFDF8]">
                        No assessments currently scheduled or published for this subject.
                      </div>
                    ) : (
                      sub.assessments.map((ass: StudentSubjectAssessmentDTO) => {
                        const res = ass.result;
                        const isPublished = ass.publication_status === 'results_published' && Boolean(res);

                        return (
                          <div
                            key={ass.assessment_id}
                            className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-academic-paleGreen/5 transition-colors"
                          >
                            {/* Assessment Details */}
                            <div className="space-y-1.5 min-w-0 md:max-w-md">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isPublished
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : ass.publication_status === 'evaluation_pending'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                                  }`}
                                >
                                  {isPublished
                                    ? 'Result Published'
                                    : ass.publication_status === 'evaluation_pending'
                                    ? 'Evaluation Pending'
                                    : 'Not Submitted'}
                                </span>

                                {ass.due_date && (
                                  <span className="text-[11px] text-academic-muted flex items-center space-x-1">
                                    <Calendar className="w-3 h-3" />
                                    <span>
                                      Due:{' '}
                                      {new Date(ass.due_date).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric'
                                      })}
                                    </span>
                                  </span>
                                )}
                              </div>

                              <h3 className="text-sm font-bold text-academic-deepGreen truncate">
                                {ass.title}
                              </h3>

                              {isPublished && res && (
                                <p className="text-[11px] text-academic-muted">
                                  Evaluated on{' '}
                                  {new Date(res.published_at).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </p>
                              )}
                            </div>

                            {/* Score & Action Button */}
                            <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 shrink-0">
                              {isPublished && res ? (
                                <div className="text-right">
                                  <div className="flex items-baseline space-x-1.5 justify-end">
                                    <span className="text-base font-bold text-academic-deepGreen">
                                      {res.total_score}
                                    </span>
                                    <span className="text-xs text-academic-muted">
                                      / {ass.max_marks} Marks
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-academic-paleGreen text-academic-primaryGreen">
                                      {res.percentage}%
                                    </span>
                                  </div>

                                  {Boolean(res.late_penalty_deducted && res.late_penalty_deducted > 0) && (
                                    <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded font-mono block mt-0.5">
                                      Late Penalty: -{res.late_penalty_deducted} Marks
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="text-right">
                                  <span className="text-xs text-academic-muted font-medium italic block">
                                    {ass.publication_status === 'evaluation_pending'
                                      ? 'Instructor grading in progress'
                                      : 'No submission recorded'}
                                  </span>
                                  <span className="text-[10px] text-academic-muted">
                                    Max: {ass.max_marks} Marks
                                  </span>
                                </div>
                              )}

                              {/* View Rubric Result Button */}
                              {isPublished && res ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDetail(res.submission_id)}
                                  className="btn-primary text-xs px-3.5 py-1.5 flex items-center space-x-1.5"
                                >
                                  <ScrollText className="w-3.5 h-3.5" />
                                  <span>View Rubric Result</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="py-1.5 px-3 rounded-md bg-gray-100 border border-gray-200 text-gray-400 text-xs font-semibold cursor-not-allowed"
                                >
                                  Result Unavailable
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Shared Assessment Result Detail Modal */}
      <AssessmentResultDetailModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSubmissionId(null);
        }}
        submissionId={selectedSubmissionId}
      />
    </div>
  );
};
