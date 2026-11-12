import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  BookOpen,
  AlertCircle,
  Search,
  ScrollText,
  RefreshCw,
  GraduationCap
} from 'lucide-react';
import {
  evaluationApi,
  ProctorAcademicReportDTO,
  ProctorMenteeDTO
} from '../../services/apiClient';
import { AssessmentResultDetailModal } from '../../components/AssessmentResultDetailModal';

export const ProctorAcademicReport: React.FC = () => {
  const [reportData, setReportData] = useState<ProctorAcademicReportDTO | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.getProctorAcademicReport();
      setReportData(data);
      if (data.mentees.length > 0 && !selectedStudentId) {
        setSelectedStudentId(data.mentees[0].student_id);
      }
    } catch (err: any) {
      console.error('Failed to load proctor academic report:', err);
      setError(err.message || 'Unable to load mentee academic report.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const mentees = reportData?.mentees || [];

  // Filtered mentees
  const filteredMentees = useMemo(() => {
    if (!searchQuery.trim()) return mentees;
    const q = searchQuery.toLowerCase().trim();
    return mentees.filter(
      (m) =>
        m.student_name.toLowerCase().includes(q) ||
        m.roll_number.toLowerCase().includes(q) ||
        m.programme.toLowerCase().includes(q)
    );
  }, [mentees, searchQuery]);

  // Selected mentee object
  const currentMentee = useMemo(() => {
    if (!selectedStudentId) return filteredMentees[0] || null;
    return mentees.find((m) => m.student_id === selectedStudentId) || mentees[0] || null;
  }, [mentees, selectedStudentId, filteredMentees]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const totalMentees = mentees.length;
    let totalResults = 0;
    let sumPct = 0;
    let menteesWithGrades = 0;

    for (const m of mentees) {
      totalResults += m.overall_results_count;
      if (m.overall_average_percentage !== null) {
        sumPct += m.overall_average_percentage;
        menteesWithGrades++;
      }
    }

    const cohortAvg = menteesWithGrades > 0 ? Math.round(sumPct / menteesWithGrades) : null;

    return {
      totalMentees,
      totalResults,
      cohortAvg
    };
  }, [mentees]);

  const handleOpenDetailModal = (submissionId?: string | null) => {
    if (!submissionId) return;
    setSelectedSubmissionId(submissionId);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-academic-paleGreen text-academic-primaryGreen shadow-2xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
                Mentee Academic Performance & Rubric Results
              </h1>
              <p className="text-xs text-academic-muted mt-0.5">
                Official academic standing, subject-wise performance, and criterion-level rubric breakdowns for your assigned mentees.
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="btn-secondary text-xs px-3.5 py-1.5 self-start sm:self-auto shrink-0 flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Mentees</span>
          </button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-academic-border">
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Assigned Mentees
            </span>
            <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
              {kpis.totalMentees}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Published Results
            </span>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">
              {kpis.totalResults}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Cumulative Average
            </span>
            <div className="text-lg font-bold text-academic-primaryGreen mt-0.5">
              {kpis.cohortAvg !== null ? `${kpis.cohortAvg}%` : '—'}
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

      {/* Loading State */}
      {isLoading ? (
        <div className="p-16 text-center text-academic-muted flex flex-col items-center space-y-2 bg-academic-surface border border-academic-border rounded-xl shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-academic-primaryGreen" />
          <p className="text-xs font-semibold text-academic-deepGreen">
            Loading assigned mentee academic records...
          </p>
        </div>
      ) : mentees.length === 0 ? (
        <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl shadow-xs space-y-3">
          <Users className="w-12 h-12 text-academic-muted mx-auto" />
          <h2 className="text-sm font-bold text-academic-deepGreen">
            No Assigned Mentees
          </h2>
          <p className="text-xs text-academic-muted max-w-md mx-auto leading-relaxed">
            There are currently no students assigned to your proctor cohort in the institutional database.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Mentee Selector List */}
          <div className="lg:col-span-1 space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-academic-border">
              <span className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider">
                Assigned Mentees ({mentees.length})
              </span>
            </div>

            {/* Mentee Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-academic-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search mentee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-academic pl-8 text-xs w-full py-1.5"
              />
            </div>

            {/* Mentees Scroll Area */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredMentees.map((m: ProctorMenteeDTO) => {
                const isSelected = currentMentee?.student_id === m.student_id;

                return (
                  <div
                    key={m.student_id}
                    onClick={() => setSelectedStudentId(m.student_id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-academic-paleGreen/40 border-academic-primaryGreen shadow-2xs'
                        : 'bg-academic-surface border-academic-border hover:bg-academic-paleGreen/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-academic-deepGreen' : 'text-academic-deepGreen'}`}>
                          {m.student_name}
                        </p>
                        <p className="text-[11px] font-mono text-academic-muted">
                          {m.roll_number}
                        </p>
                        <p className="text-[10px] text-academic-muted mt-0.5">
                          {m.programme} Sem {m.semester} Sec {m.section}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-xs font-bold ${
                            m.overall_average_percentage !== null
                              ? 'text-academic-primaryGreen'
                              : 'text-academic-muted'
                          }`}
                        >
                          {m.overall_average_percentage !== null ? `${m.overall_average_percentage}%` : 'N/A'}
                        </span>
                        <span className="text-[9px] text-academic-muted block mt-0.5">
                          {m.overall_results_count} results
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Mentee Academic Dashboard */}
          <div className="lg:col-span-3 space-y-6">
            {currentMentee && (
              <>
                {/* Mentee Profile Summary Card */}
                <div className="p-4 sm:p-5 rounded-xl bg-academic-surface border border-academic-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-academic-primaryGreen text-white">
                        Mentee Profile
                      </span>
                      <span className="text-xs text-academic-muted font-mono font-semibold">
                        {currentMentee.roll_number}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-academic-deepGreen">
                      {currentMentee.student_name}
                    </h2>
                    <p className="text-xs text-academic-muted">
                      {currentMentee.programme} &bull; Semester {currentMentee.semester} &bull; Section {currentMentee.section}
                      {currentMentee.student_email ? ` • ${currentMentee.student_email}` : ''}
                    </p>
                  </div>

                  {/* Standing Pill */}
                  <div className="p-3 rounded-lg bg-academic-paleGreen/30 border border-academic-border sm:text-right shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                      Academic Standing
                    </span>
                    <div className="text-xl font-black text-academic-primaryGreen mt-0.5">
                      {currentMentee.overall_average_percentage !== null
                        ? `${currentMentee.overall_average_percentage}%`
                        : '—'}
                    </div>
                    <span className="text-[10px] text-academic-muted block mt-0.5">
                      {currentMentee.overall_results_count} Published Evaluation{currentMentee.overall_results_count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                {/* Enrolled Subjects & Assessments */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-academic-border">
                    <h3 className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-academic-primaryGreen" />
                      <span>Enrolled Subjects & Assessment Performance</span>
                    </h3>
                    <span className="text-xs text-academic-muted font-medium">
                      {currentMentee.subjects.length} Enrolled Courses
                    </span>
                  </div>

                  {currentMentee.subjects.length === 0 ? (
                    <div className="p-8 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl">
                      No active subject enrollments found for this mentee.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {currentMentee.subjects.map((sub) => (
                        <div
                          key={sub.subject_id}
                          className="bg-academic-surface border border-academic-border rounded-xl shadow-xs overflow-hidden"
                        >
                          {/* Subject Header */}
                          <div className="p-4 border-b border-academic-border bg-academic-paleGreen/15 flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-academic-primaryGreen text-white">
                                  {sub.subject_code}
                                </span>
                                <span className="text-[11px] text-academic-muted font-semibold">
                                  {sub.credits} Credits
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-academic-deepGreen mt-1">
                                {sub.subject_name}
                              </h4>
                            </div>

                            <div className="text-right">
                              <span className="text-xs font-bold text-academic-primaryGreen block">
                                Average: {sub.average_percentage !== null ? `${sub.average_percentage}%` : 'N/A'}
                              </span>
                              <span className="text-[10px] text-academic-muted block mt-0.5">
                                {sub.results_available_count} of {sub.published_assessment_count} Results
                              </span>
                            </div>
                          </div>

                          {/* Subject Assessments List */}
                          <div className="divide-y divide-academic-border">
                            {sub.assessments.length === 0 ? (
                              <div className="p-4 text-center text-xs text-academic-muted">
                                No assessments recorded for this subject.
                              </div>
                            ) : (
                              sub.assessments.map((ass) => {
                                const hasResult = ass.has_result && Boolean(ass.submission_id);

                                return (
                                  <div
                                    key={ass.assessment_id}
                                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-academic-paleGreen/5 transition-colors"
                                  >
                                    <div className="space-y-1 min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <span
                                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            ass.publication_status === 'published'
                                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                              : ass.publication_status === 'completed'
                                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                              : ass.publication_status === 'pending_evaluation'
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                              : 'bg-gray-100 text-gray-700 border border-gray-300'
                                          }`}
                                        >
                                          {ass.publication_status === 'published'
                                            ? 'Result Published'
                                            : ass.publication_status === 'completed'
                                            ? 'Awaiting Release'
                                            : ass.publication_status === 'pending_evaluation'
                                            ? 'Pending Evaluation'
                                            : 'Not Submitted'}
                                        </span>
                                        <span className="text-xs text-academic-muted">
                                          Max Marks: {ass.max_marks}
                                        </span>
                                      </div>

                                      <p className="text-xs font-bold text-academic-deepGreen truncate">
                                        {ass.title}
                                      </p>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                      {hasResult ? (
                                        <div className="text-right">
                                          <div className="flex items-baseline space-x-1.5 justify-end">
                                            <span className="text-sm font-bold text-academic-deepGreen">
                                              {ass.total_score}
                                            </span>
                                            <span className="text-[11px] text-academic-muted">
                                              / {ass.max_marks}
                                            </span>
                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-academic-paleGreen text-academic-primaryGreen">
                                              {ass.percentage}%
                                            </span>
                                          </div>
                                          {Boolean(ass.late_penalty_deducted && ass.late_penalty_deducted > 0) && (
                                            <span className="text-[9px] text-amber-800 block font-mono">
                                              (-{ass.late_penalty_deducted} late)
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-xs text-academic-muted italic">
                                          {ass.publication_status === 'completed'
                                            ? 'Graded (Awaiting Release)'
                                            : ass.publication_status === 'not_submitted'
                                            ? 'Not Submitted'
                                            : 'Grade Pending'}
                                        </span>
                                      )}

                                      {ass.submission_id && (ass.publication_status === 'published' || ass.publication_status === 'completed') ? (
                                        <button
                                          type="button"
                                          onClick={() => handleOpenDetailModal(ass.submission_id)}
                                          className="btn-primary text-xs px-3 py-1 flex items-center space-x-1"
                                        >
                                          <ScrollText className="w-3.5 h-3.5" />
                                          <span>Rubric Detail</span>
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled
                                          className="py-1 px-2.5 text-xs text-academic-muted/50 cursor-not-allowed bg-gray-100 rounded border border-gray-200"
                                        >
                                          {ass.publication_status === 'not_submitted' ? 'No Submission' : 'Pending'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
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
