import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Award,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowLeft,
  ChevronRight,
  Eye,
  RefreshCw
} from 'lucide-react';
import {
  evaluationApi,
  ClassTeacherAcademicReportDTO,
  ClassTeacherStudentRosterRowDTO
} from '../../services/apiClient';
import { AssessmentResultDetailModal } from '../../components/AssessmentResultDetailModal';

interface ClassTeacherAcademicReportProps {
  initialClassId?: string;
}

export const ClassTeacherAcademicReport: React.FC<ClassTeacherAcademicReportProps> = ({
  initialClassId
}) => {
  const [reportData, setReportData] = useState<ClassTeacherAcademicReportDTO | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || '');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters for student roster
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'completed' | 'pending' | 'unsubmitted'>('all');

  // Modal State
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Initial load
  const loadClassesAndSubjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.getClassTeacherAcademicReport({
        class_id: selectedClassId || undefined
      });
      setReportData(data);

      if (!selectedClassId && data.classes?.length > 0) {
        setSelectedClassId(data.classes[0].class_id);
      }
    } catch (err: any) {
      console.error('Failed to load class teacher report:', err);
      setError(err.message || 'Unable to load class academic report.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadClassesAndSubjects();
  }, [selectedClassId]);

  // Load student roster when an assessment is selected
  const loadAssessmentRoster = async (classId: string, subjectId: string, assessmentId: string) => {
    setIsLoadingRoster(true);
    try {
      const data = await evaluationApi.getClassTeacherAcademicReport({
        class_id: classId,
        subject_id: subjectId,
        assessment_id: assessmentId
      });
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load assessment student roster:', err);
      setError(err.message || 'Unable to load assessment student marks.');
    } finally {
      setIsLoadingRoster(false);
    }
  };

  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedAssessmentId(null);
  };

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setStudentSearch('');
    setStatusFilter('all');
    if (selectedClassId && selectedSubjectId) {
      loadAssessmentRoster(selectedClassId, selectedSubjectId, assessmentId);
    }
  };

  const handleBackToSubjects = () => {
    setSelectedSubjectId(null);
    setSelectedAssessmentId(null);
  };

  const handleBackToAssessments = () => {
    setSelectedAssessmentId(null);
  };

  const handleOpenDetailModal = (submissionId?: string | null) => {
    if (!submissionId) return;
    setSelectedSubmissionId(submissionId);
    setIsModalOpen(true);
  };

  // Current selected class object
  const currentClass = useMemo(() => {
    if (!reportData?.classes) return null;
    return reportData.classes.find((c) => c.class_id === selectedClassId) || reportData.classes[0] || null;
  }, [reportData, selectedClassId]);

  // Current selected subject object
  const currentSubject = useMemo(() => {
    if (!currentClass || !selectedSubjectId) return null;
    return currentClass.subjects.find((s) => s.subject_id === selectedSubjectId) || null;
  }, [currentClass, selectedSubjectId]);

  // Current selected assessment object
  const currentAssessment = useMemo(() => {
    if (!currentSubject || !selectedAssessmentId) return null;
    return currentSubject.assessments.find((a) => a.id === selectedAssessmentId) || null;
  }, [currentSubject, selectedAssessmentId]);

  // Filtered student roster
  const studentRoster = reportData?.student_roster || [];
  const filteredRoster = useMemo(() => {
    return studentRoster.filter((row: ClassTeacherStudentRosterRowDTO) => {
      // Status Filter
      if (statusFilter === 'published' && row.evaluation_status !== 'published') return false;
      if (statusFilter === 'completed' && row.evaluation_status !== 'completed') return false;
      if (statusFilter === 'pending' && row.evaluation_status !== 'pending_evaluation') return false;
      if (statusFilter === 'unsubmitted' && row.has_submitted) return false;

      // Text Search
      if (!studentSearch.trim()) return true;
      const q = studentSearch.toLowerCase().trim();
      return (
        row.student_name.toLowerCase().includes(q) ||
        row.roll_number.toLowerCase().includes(q)
      );
    });
  }, [studentRoster, statusFilter, studentSearch]);

  // Class-level performance metrics for the selected assessment
  const assessmentStats = useMemo(() => {
    if (!studentRoster || studentRoster.length === 0) {
      return {
        totalStudents: 0,
        submittedCount: 0,
        publishedCount: 0,
        avgScore: null,
        highestScore: null,
        lowestScore: null,
        avgPct: null
      };
    }

    const totalStudents = studentRoster.length;
    let submittedCount = 0;
    let publishedCount = 0;
    let sumScore = 0;
    let highest = -Infinity;
    let lowest = Infinity;
    const maxMarks = currentAssessment?.max_marks || 50;

    for (const r of studentRoster) {
      if (r.has_submitted) submittedCount++;
      if (r.evaluation_status === 'published' && r.total_score !== null && r.total_score !== undefined) {
        publishedCount++;
        sumScore += r.total_score;
        if (r.total_score > highest) highest = r.total_score;
        if (r.total_score < lowest) lowest = r.total_score;
      }
    }

    const avgScore = publishedCount > 0 ? Math.round((sumScore / publishedCount) * 10) / 10 : null;
    const highestScore = publishedCount > 0 ? highest : null;
    const lowestScore = publishedCount > 0 ? lowest : null;
    const avgPct = avgScore !== null && maxMarks > 0 ? Math.round((avgScore / maxMarks) * 100) : null;

    return {
      totalStudents,
      submittedCount,
      publishedCount,
      avgScore,
      highestScore,
      lowestScore,
      avgPct
    };
  }, [studentRoster, currentAssessment]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-academic-paleGreen text-academic-primaryGreen shadow-2xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
                Class Academic Performance & Marks Report
              </h1>
              <p className="text-xs text-academic-muted mt-0.5">
                Official marks rosters, rubric score distributions, and individual criterion breakdowns for your appointed class cohort.
              </p>
            </div>
          </div>

          <button
            onClick={loadClassesAndSubjects}
            disabled={isLoading}
            className="btn-secondary text-xs px-3.5 py-1.5 self-start sm:self-auto shrink-0 flex items-center space-x-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Report</span>
          </button>
        </div>

        {/* Class Selector if multiple classes exist */}
        {reportData?.classes && reportData.classes.length > 1 && (
          <div className="mt-4 pt-3 border-t border-academic-border flex items-center space-x-2">
            <span className="text-xs font-semibold text-academic-muted">Select Appointed Class:</span>
            <div className="flex flex-wrap gap-2">
              {reportData.classes.map((cls) => (
                <button
                  key={cls.class_id}
                  onClick={() => {
                    setSelectedClassId(cls.class_id);
                    setSelectedSubjectId(null);
                    setSelectedAssessmentId(null);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    selectedClassId === cls.class_id
                      ? 'bg-academic-primaryGreen text-white'
                      : 'bg-academic-paleGreen/50 text-academic-deepGreen hover:bg-academic-paleGreen'
                  }`}
                >
                  {cls.programme} Sem {cls.semester} Sec {cls.section} ({cls.student_count} Students)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Breadcrumbs Trail */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-academic-muted flex-wrap">
        <button
          onClick={handleBackToSubjects}
          className={`font-semibold transition-colors hover:text-academic-primaryGreen ${
            !selectedSubjectId ? 'text-academic-deepGreen font-bold cursor-default' : ''
          }`}
        >
          {currentClass ? `${currentClass.programme} Sem ${currentClass.semester} Sec ${currentClass.section}` : 'Class Subjects'}
        </button>

        {currentSubject && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-academic-muted/60 shrink-0" />
            <button
              onClick={handleBackToAssessments}
              className={`font-semibold transition-colors hover:text-academic-primaryGreen ${
                !selectedAssessmentId ? 'text-academic-deepGreen font-bold cursor-default' : ''
              }`}
            >
              {currentSubject.subject_code} &bull; {currentSubject.subject_name}
            </button>
          </>
        )}

        {currentAssessment && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-academic-muted/60 shrink-0" />
            <span className="text-academic-primaryGreen font-bold truncate max-w-xs sm:max-w-md">
              {currentAssessment.title} (Marks Roster)
            </span>
          </>
        )}
      </nav>

      {/* ========================================================================= */}
      {/* LEVEL 1: SUBJECTS LIST                                                    */}
      {/* ========================================================================= */}
      {!selectedSubjectId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-academic-border">
            <h2 className="text-sm font-bold text-academic-deepGreen uppercase tracking-wider flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-academic-primaryGreen" />
              <span>Cohort Subjects & Published Assessments</span>
            </h2>
            <span className="text-xs text-academic-muted font-medium">
              {currentClass?.subjects?.length || 0} Assigned Subjects
            </span>
          </div>

          {!currentClass || currentClass.subjects.length === 0 ? (
            <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl shadow-xs">
              <BookOpen className="w-8 h-8 mx-auto text-academic-muted mb-2" />
              <p className="text-xs font-semibold">No subjects registered for this class cohort.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentClass.subjects.map((sub) => (
                <div
                  key={sub.subject_id}
                  data-subject-id={sub.subject_id}
                  onClick={() => handleSelectSubject(sub.subject_id)}
                  className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs hover:border-academic-primaryGreen/50 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-academic-primaryGreen text-white">
                        {sub.subject_code}
                      </span>
                      <span className="text-[11px] text-academic-muted font-medium">
                        {sub.published_assessment_count} Assessments
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors mt-2">
                      {sub.subject_name}
                    </h3>
                    <p className="text-xs text-academic-muted">
                      Faculty: <span className="font-medium text-academic-deepGreen">{sub.subject_teacher_name || 'Assigned Faculty'}</span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-academic-border flex items-center justify-between text-xs">
                    <span className="text-academic-muted">Click to view assessments</span>
                    <ChevronRight className="w-4 h-4 text-academic-primaryGreen group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 2: ASSESSMENTS LIST FOR SELECTED SUBJECT                            */}
      {/* ========================================================================= */}
      {selectedSubjectId && !selectedAssessmentId && currentSubject && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-academic-border">
            <div>
              <h2 className="text-sm font-bold text-academic-deepGreen uppercase tracking-wider">
                {currentSubject.subject_code} &bull; Formative Assessments
              </h2>
              <p className="text-xs text-academic-muted mt-0.5">
                Select an assessment to review cohort performance and student marks.
              </p>
            </div>
            <button
              onClick={handleBackToSubjects}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Subjects</span>
            </button>
          </div>

          {currentSubject.assessments.length === 0 ? (
            <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl shadow-xs">
              <Clock className="w-8 h-8 mx-auto text-academic-muted mb-2" />
              <p className="text-xs font-semibold text-academic-deepGreen">No assessments published yet for this subject.</p>
              <p className="text-[11px] text-academic-muted mt-1">
                Formative tasks authored by the course faculty will appear here once published.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentSubject.assessments.map((ass) => (
                <div
                  key={ass.id}
                  data-assessment-id={ass.id}
                  onClick={() => handleSelectAssessment(ass.id)}
                  className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs hover:border-academic-primaryGreen/50 hover:shadow-sm cursor-pointer transition-all flex flex-col justify-between space-y-3 group"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Published Task
                      </span>
                      <span className="text-xs font-bold text-academic-deepGreen">
                        Max Marks: {ass.max_marks || 50}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors">
                      {ass.title}
                    </h3>

                    {ass.due_date && (
                      <p className="text-xs text-academic-muted">
                        Due Date: {new Date(ass.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-academic-border flex items-center justify-between text-xs">
                    <span className="text-academic-primaryGreen font-semibold">
                      View Marks & Rubric Breakdown
                    </span>
                    <ChevronRight className="w-4 h-4 text-academic-primaryGreen group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* LEVEL 3: STUDENT MARKS ROSTER & COHORT PERFORMANCE SUMMARY                */}
      {/* ========================================================================= */}
      {selectedSubjectId && selectedAssessmentId && currentAssessment && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-academic-border">
            <div>
              <h2 className="text-base font-bold text-academic-deepGreen">
                {currentAssessment.title}
              </h2>
              <p className="text-xs text-academic-muted">
                {currentSubject?.subject_code} &bull; {currentSubject?.subject_name} &bull; Max Marks: {currentAssessment.max_marks || 50}
              </p>
            </div>
            <button
              onClick={handleBackToAssessments}
              className="btn-secondary text-xs px-3 py-1.5 self-start sm:self-auto flex items-center space-x-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Assessments</span>
            </button>
          </div>

          {/* Performance Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Submissions
              </span>
              <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
                {assessmentStats.submittedCount} <span className="text-xs text-academic-muted font-normal">/ {assessmentStats.totalStudents}</span>
              </div>
              <span className="text-[10px] text-academic-muted block">
                {assessmentStats.totalStudents > 0 ? Math.round((assessmentStats.submittedCount / assessmentStats.totalStudents) * 100) : 0}% Turned In
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Cohort Average
              </span>
              <div className="text-lg font-bold text-academic-primaryGreen mt-0.5">
                {assessmentStats.avgScore !== null ? `${assessmentStats.avgScore}` : '—'}
                {assessmentStats.avgScore !== null && (
                  <span className="text-xs text-academic-muted font-normal"> / {currentAssessment.max_marks || 50}</span>
                )}
              </div>
              <span className="text-[10px] text-academic-primaryGreen font-semibold block">
                {assessmentStats.avgPct !== null ? `${assessmentStats.avgPct}% Score` : 'No published grades'}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Highest Score
              </span>
              <div className="text-lg font-bold text-emerald-800 mt-0.5">
                {assessmentStats.highestScore !== null ? `${assessmentStats.highestScore}` : '—'}
                {assessmentStats.highestScore !== null && (
                  <span className="text-xs text-academic-muted font-normal"> / {currentAssessment.max_marks || 50}</span>
                )}
              </div>
              <span className="text-[10px] text-emerald-700 font-medium block">
                Top Attained Marks
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Lowest Score
              </span>
              <div className="text-lg font-bold text-amber-800 mt-0.5">
                {assessmentStats.lowestScore !== null ? `${assessmentStats.lowestScore}` : '—'}
                {assessmentStats.lowestScore !== null && (
                  <span className="text-xs text-academic-muted font-normal"> / {currentAssessment.max_marks || 50}</span>
                )}
              </div>
              <span className="text-[10px] text-amber-700 font-medium block">
                Lowest Attained Marks
              </span>
            </div>
          </div>

          {/* Roster Controls: Search & Filter */}
          <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student by name or roll number..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="input-academic pl-9 text-xs w-full py-1.5"
              />
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="roster-status-filter" className="text-xs text-academic-muted whitespace-nowrap">
                Evaluation Filter:
              </label>
              <select
                id="roster-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="input-academic text-xs py-1.5 px-2.5 min-w-[140px]"
              >
                <option value="all">All Students ({studentRoster.length})</option>
                <option value="published">Published Results ({studentRoster.filter(r => r.evaluation_status === 'published').length})</option>
                <option value="completed">Awaiting Release ({studentRoster.filter(r => r.evaluation_status === 'completed').length})</option>
                <option value="pending">Pending Evaluation ({studentRoster.filter(r => r.evaluation_status === 'pending_evaluation').length})</option>
                <option value="unsubmitted">Not Submitted ({studentRoster.filter(r => !r.has_submitted).length})</option>
              </select>
            </div>
          </div>

          {/* Student Marks Table */}
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-xs overflow-hidden">
            {isLoadingRoster ? (
              <div className="py-16 text-center text-academic-muted flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-academic-primaryGreen" />
                <p className="text-xs font-semibold text-academic-deepGreen">Loading student marks and rubric details...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-academic-paleGreen/40 text-academic-deepGreen font-semibold border-b border-academic-border">
                    <tr>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Roll Number</th>
                      <th className="py-3 px-4 text-center">Submission Status</th>
                      <th className="py-3 px-4">Submission Date</th>
                      <th className="py-3 px-4 text-center">Timing Status</th>
                      <th className="py-3 px-4 text-center">Publication Status</th>
                      <th className="py-3 px-4 text-right">Awarded Marks</th>
                      <th className="py-3 px-4 text-right">Percentage</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-academic-border">
                    {filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-academic-muted">
                          No student records match the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((row: ClassTeacherStudentRosterRowDTO) => {
                        const isPublished = row.evaluation_status === 'published';
                        const maxMarks = row.max_marks || currentAssessment.max_marks || 50;

                        return (
                          <tr
                            key={row.student_id}
                            className={`hover:bg-academic-paleGreen/20 transition-colors ${
                              isPublished ? 'cursor-pointer' : ''
                            }`}
                            onClick={() => {
                              if (row.submission_id && isPublished) {
                                handleOpenDetailModal(row.submission_id);
                              }
                            }}
                          >
                            {/* Student Name */}
                            <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                              <span>{row.student_name}</span>
                              {row.email && (
                                <span className="text-[11px] font-normal text-academic-muted block truncate max-w-xs">
                                  {row.email}
                                </span>
                              )}
                            </td>

                            {/* Roll Number */}
                            <td className="py-3 px-4 font-mono text-academic-deepGreen font-semibold">
                              {row.roll_number || 'N/A'}
                            </td>

                            {/* Submission Status */}
                            <td className="py-3 px-4 text-center">
                              {row.has_submitted ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Submitted
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-300">
                                  <Clock className="w-3 h-3" />
                                  Not Submitted
                                </span>
                              )}
                            </td>

                            {/* Submission Date */}
                            <td className="py-3 px-4 text-academic-muted text-[11px]">
                              {row.submission_date
                                ? new Date(row.submission_date).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '—'}
                            </td>

                            {/* Timing Status */}
                            <td className="py-3 px-4 text-center">
                              {row.late_status === 'late' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  Late
                                </span>
                              ) : row.has_submitted ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  On Time
                                </span>
                              ) : (
                                <span className="text-academic-muted font-mono">—</span>
                              )}
                            </td>

                            {/* Publication Status */}
                            <td className="py-3 px-4 text-center">
                              {row.evaluation_status === 'published' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  Published
                                </span>
                              ) : row.evaluation_status === 'completed' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                  Awaiting Release
                                </span>
                              ) : row.has_submitted ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  Pending Grading
                                </span>
                              ) : (
                                <span className="text-academic-muted font-mono">—</span>
                              )}
                            </td>

                            {/* Awarded Marks */}
                            <td className="py-3 px-4 text-right font-bold text-academic-deepGreen">
                              {row.total_score !== null && row.total_score !== undefined ? (
                                <div>
                                  <span>{row.total_score}</span>
                                  <span className="text-[10px] text-academic-muted font-normal"> / {maxMarks}</span>
                                  {row.evaluation_status === 'completed' && (
                                    <span className="text-[9px] text-blue-700 block font-sans">
                                      (Unpublished)
                                    </span>
                                  )}
                                  {Boolean(row.late_penalty_deducted && row.late_penalty_deducted > 0) && (
                                    <span className="text-[9px] text-amber-800 block font-mono">
                                      (-{row.late_penalty_deducted} late)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-academic-muted font-mono">—</span>
                              )}
                            </td>

                            {/* Percentage */}
                            <td className="py-3 px-4 text-right font-bold text-academic-primaryGreen">
                              {row.percentage !== null && row.percentage !== undefined
                                ? `${row.percentage}%`
                                : '—'}
                            </td>

                            {/* Action Button */}
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              {row.submission_id && (row.evaluation_status === 'published' || row.evaluation_status === 'completed') ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDetailModal(row.submission_id)}
                                  className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center space-x-1"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Rubric</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="py-1 px-2 text-xs text-academic-muted/50 cursor-not-allowed inline-flex items-center space-x-1 opacity-50"
                                >
                                  <span>Pending</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
