import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  BookOpen,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Eye,
  Filter,
  GraduationCap,
  FileText
} from 'lucide-react';
import {
  evaluationApi,
  HodAcademicReportDTO,
  ClassTeacherStudentRosterRowDTO
} from '../../services/apiClient';
import { AssessmentResultDetailModal } from '../../components/AssessmentResultDetailModal';
import { AssessmentMarksReportModal } from '../reports/AssessmentMarksReportModal';

export const DepartmentAcademicPerformance: React.FC = () => {
  const [reportData, setReportData] = useState<HodAcademicReportDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active filters
  const [selectedSemester, setSelectedSemester] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Roster search
  const [studentSearch, setStudentSearch] = useState<string>('');

  // Modal State
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isReportPdfModalOpen, setIsReportPdfModalOpen] = useState<boolean>(false);

  // Persistent option lists
  const [availableSemesters, setAvailableSemesters] = useState<number[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Array<{ id: string; name: string; semester: number }>>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; code: string; name: string; semester: number }>>([]);

  // Load department data
  const loadData = async (assessmentId?: string | null) => {
    if (assessmentId) {
      setIsLoadingRoster(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await evaluationApi.getHodDepartmentAcademicReport({
        semester: selectedSemester !== 'all' ? Number(selectedSemester) : undefined,
        class_id: selectedClassId !== 'all' ? selectedClassId : undefined,
        subject_id: selectedSubjectId !== 'all' ? selectedSubjectId : undefined,
        assessment_id: assessmentId || (selectedAssessmentId ? selectedAssessmentId : undefined),
        publication_status: selectedStatus !== 'all' ? selectedStatus : undefined
      });
      setReportData(data);

      // Populate filter options from initial complete hierarchy if not set yet
      if (availableSemesters.length === 0 && data.hierarchy?.length > 0) {
        const sems = data.hierarchy.map((s) => s.semester).sort((a, b) => a - b);
        setAvailableSemesters(sems);

        const clsList: Array<{ id: string; name: string; semester: number }> = [];
        const subMap = new Map<string, { id: string; code: string; name: string; semester: number }>();

        for (const sem of data.hierarchy) {
          for (const cls of sem.classes) {
            clsList.push({
              id: cls.class_id,
              name: `${cls.programme} Sem ${cls.semester} Sec ${cls.section}`,
              semester: cls.semester
            });
            for (const sub of cls.subjects) {
              if (!subMap.has(sub.subject_id)) {
                subMap.set(sub.subject_id, {
                  id: sub.subject_id,
                  code: sub.subject_code,
                  name: sub.subject_name,
                  semester: cls.semester
                });
              }
            }
          }
        }
        setAvailableClasses(clsList);
        setAvailableSubjects(Array.from(subMap.values()));
      }
    } catch (err: any) {
      console.error('Failed to load department academic report:', err);
      setError(err.message || 'Unable to load department academic performance report.');
    } finally {
      setIsLoading(false);
      setIsLoadingRoster(false);
    }
  };

  useEffect(() => {
    loadData(selectedAssessmentId);
  }, [selectedSemester, selectedClassId, selectedSubjectId, selectedStatus]);

  const handleSelectAssessment = (assessmentId: string) => {
    setSelectedAssessmentId(assessmentId);
    setStudentSearch('');
    loadData(assessmentId);
  };

  const handleBackToHierarchy = () => {
    setSelectedAssessmentId(null);
    loadData(null);
  };

  const handleOpenDetailModal = (submissionId?: string | null) => {
    if (!submissionId) return;
    setSelectedSubmissionId(submissionId);
    setIsModalOpen(true);
  };

  const kpis = reportData?.kpis;
  const hierarchy = reportData?.hierarchy || [];

  // Filtered roster
  const studentRoster = reportData?.student_roster || [];
  const filteredRoster = useMemo(() => {
    if (!studentSearch.trim()) return studentRoster;
    const q = studentSearch.toLowerCase().trim();
    return studentRoster.filter(
      (r: ClassTeacherStudentRosterRowDTO) =>
        r.student_name.toLowerCase().includes(q) ||
        r.roll_number.toLowerCase().includes(q)
    );
  }, [studentRoster, studentSearch]);

  // Selected assessment stats
  const assessmentStats = useMemo(() => {
    if (!studentRoster || studentRoster.length === 0) {
      return {
        total: 0,
        submitted: 0,
        published: 0,
        avg: null,
        highest: null,
        lowest: null
      };
    }

    const total = studentRoster.length;
    let submitted = 0;
    let published = 0;
    let sumScore = 0;
    let highest = -Infinity;
    let lowest = Infinity;

    for (const r of studentRoster) {
      if (r.has_submitted) submitted++;
      if (r.evaluation_status === 'published' && r.total_score !== null && r.total_score !== undefined) {
        published++;
        sumScore += r.total_score;
        if (r.total_score > highest) highest = r.total_score;
        if (r.total_score < lowest) lowest = r.total_score;
      }
    }

    const avg = published > 0 ? Math.round((sumScore / published) * 10) / 10 : null;
    return {
      total,
      submitted,
      published,
      avg,
      highest: published > 0 ? highest : null,
      lowest: published > 0 ? lowest : null
    };
  }, [studentRoster]);

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
                Department Academic Performance Dashboard
              </h1>
              <p className="text-xs text-academic-muted mt-0.5">
                Institutional oversight of course assessments, formative evaluations, rubric performance, and published results.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-start sm:self-auto shrink-0">
            <button
              onClick={() => setIsReportPdfModalOpen(true)}
              className="btn-primary text-xs px-3.5 py-1.5 flex items-center space-x-1.5 bg-academic-primaryGreen text-white rounded-lg shadow-xs hover:bg-academic-deepGreen transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-white" />
              <span>Assessment Marks PDF</span>
            </button>

            <button
              onClick={() => loadData(selectedAssessmentId)}
              disabled={isLoading || isLoadingRoster}
              className="btn-secondary text-xs px-3.5 py-1.5 flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-academic-primaryGreen ${isLoading || isLoadingRoster ? 'animate-spin' : ''}`} />
              <span>Refresh Department</span>
            </button>
          </div>
        </div>

        {/* Department KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-5 pt-4 border-t border-academic-border">
          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Department Students
            </span>
            <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
              {kpis?.total_students ?? 0}
            </div>
            <span className="text-[10px] text-academic-muted block mt-0.5">
              Active Enrollments
            </span>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Published Tasks
            </span>
            <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
              {kpis?.total_published_assessments ?? 0}
            </div>
            <span className="text-[10px] text-academic-muted block mt-0.5">
              Authored Tasks
            </span>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Results Published
            </span>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">
              {kpis?.published_results ?? 0}
            </div>
            <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
              Released to Students
            </span>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Graded (Unreleased)
            </span>
            <div className="text-lg font-bold text-blue-800 mt-0.5">
              {kpis?.completed_unpublished_results ?? 0}
            </div>
            <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
              Awaiting Release
            </span>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Pending Grading
            </span>
            <div className="text-lg font-bold text-amber-800 mt-0.5">
              {kpis?.pending_evaluations ?? 0}
            </div>
            <span className="text-[10px] text-amber-700 font-medium block mt-0.5">
              Submissions Ungraded
            </span>
          </div>

          <div className="p-3 rounded-lg bg-academic-paleGreen/20 border border-academic-border/70 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
              Department Avg
            </span>
            <div className="text-lg font-bold text-academic-primaryGreen mt-0.5">
              {kpis?.department_average_score !== null && kpis?.department_average_score !== undefined
                ? `${kpis.department_average_score}%`
                : '—'}
            </div>
            <span className="text-[10px] text-academic-primaryGreen font-medium block mt-0.5">
              Published Marks Only
            </span>
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

      {/* Filter Controls Bar */}
      <div className="p-4 bg-academic-surface border border-academic-border rounded-xl shadow-xs space-y-3">
        <div className="flex items-center space-x-2 pb-2 border-b border-academic-border/60">
          <Filter className="w-4 h-4 text-academic-primaryGreen" />
          <span className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider">
            Academic Scope & Performance Filters
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Semester Filter */}
          <div>
            <label htmlFor="filter-semester" className="text-[11px] font-semibold text-academic-muted block mb-1">
              Semester:
            </label>
            <select
              id="filter-semester"
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setSelectedClassId('all');
                setSelectedSubjectId('all');
                setSelectedAssessmentId(null);
              }}
              className="input-academic text-xs py-1.5 px-2.5 w-full"
            >
              <option value="all">All Semesters</option>
              {availableSemesters.map((sem) => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter */}
          <div>
            <label htmlFor="filter-class" className="text-[11px] font-semibold text-academic-muted block mb-1">
              Class & Section:
            </label>
            <select
              id="filter-class"
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSelectedSubjectId('all');
                setSelectedAssessmentId(null);
              }}
              className="input-academic text-xs py-1.5 px-2.5 w-full"
            >
              <option value="all">All Classes</option>
              {availableClasses
                .filter((c) => selectedSemester === 'all' || c.semester === Number(selectedSemester))
                .map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Subject Filter */}
          <div>
            <label htmlFor="filter-subject" className="text-[11px] font-semibold text-academic-muted block mb-1">
              Subject:
            </label>
            <select
              id="filter-subject"
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedAssessmentId(null);
              }}
              className="input-academic text-xs py-1.5 px-2.5 w-full"
            >
              <option value="all">All Subjects</option>
              {availableSubjects
                .filter((s) => selectedSemester === 'all' || s.semester === Number(selectedSemester))
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} - {sub.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Publication Status Filter */}
          <div>
            <label htmlFor="filter-status" className="text-[11px] font-semibold text-academic-muted block mb-1">
              Result Status:
            </label>
            <select
              id="filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="input-academic text-xs py-1.5 px-2.5 w-full"
            >
              <option value="all">All Result States</option>
              <option value="results_published">Results Published</option>
              <option value="evaluation_pending">Evaluation Pending / In Progress</option>
              <option value="not_submitted">Not Submitted</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-16 text-center text-academic-muted flex flex-col items-center space-y-2 bg-academic-surface border border-academic-border rounded-xl shadow-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-academic-primaryGreen" />
          <p className="text-xs font-semibold text-academic-deepGreen">
            Loading department academic performance data...
          </p>
        </div>
      ) : selectedAssessmentId && reportData?.selected_assessment ? (
        /* ======================================================================= */
        /* ASSESSMENT MARKS ROSTER DRILL-DOWN VIEW                                 */
        /* ======================================================================= */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-academic-border">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Assessment Performance Roster
                </span>
                <span className="text-xs text-academic-muted font-bold">
                  Max Marks: {reportData.selected_assessment.max_marks}
                </span>
              </div>
              <h2 className="text-lg font-bold text-academic-deepGreen mt-1">
                {reportData.selected_assessment.title}
              </h2>
            </div>

            <button
              onClick={handleBackToHierarchy}
              className="btn-secondary text-xs px-3.5 py-1.5 self-start sm:self-auto flex items-center space-x-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Department Overview</span>
            </button>
          </div>

          {/* Assessment Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Total Submissions
              </span>
              <div className="text-lg font-bold text-academic-deepGreen mt-0.5">
                {assessmentStats.submitted} <span className="text-xs text-academic-muted font-normal">/ {assessmentStats.total}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Class Average
              </span>
              <div className="text-lg font-bold text-academic-primaryGreen mt-0.5">
                {assessmentStats.avg !== null ? `${assessmentStats.avg}` : '—'}
                {assessmentStats.avg !== null && (
                  <span className="text-xs text-academic-muted font-normal"> / {reportData.selected_assessment.max_marks}</span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Highest Score
              </span>
              <div className="text-lg font-bold text-emerald-800 mt-0.5">
                {assessmentStats.highest !== null ? `${assessmentStats.highest}` : '—'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                Lowest Score
              </span>
              <div className="text-lg font-bold text-amber-800 mt-0.5">
                {assessmentStats.lowest !== null ? `${assessmentStats.lowest}` : '—'}
              </div>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student by name or roll number..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="input-academic pl-9 text-xs w-full py-1.5"
            />
          </div>

          {/* Student Table */}
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-xs overflow-hidden">
            {isLoadingRoster ? (
              <div className="py-12 text-center text-academic-muted flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-academic-primaryGreen" />
                <p className="text-xs font-semibold">Loading student marks and evaluations...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-academic-paleGreen/40 text-academic-deepGreen font-semibold border-b border-academic-border">
                    <tr>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Roll Number</th>
                      <th className="py-3 px-4 text-center">Submission Status</th>
                      <th className="py-3 px-4">Submitted Date</th>
                      <th className="py-3 px-4 text-center">Timing</th>
                      <th className="py-3 px-4 text-center">Publication Status</th>
                      <th className="py-3 px-4 text-right">Marks</th>
                      <th className="py-3 px-4 text-right">Percentage</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-academic-border">
                    {filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-academic-muted">
                          No student records match the search filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((row: ClassTeacherStudentRosterRowDTO) => {
                        const isPublished = row.evaluation_status === 'published';
                        const maxMarks = row.max_marks || reportData.selected_assessment?.max_marks || 50;

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
                            <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                              <span>{row.student_name}</span>
                              {row.email && (
                                <span className="text-[11px] font-normal text-academic-muted block truncate max-w-xs">
                                  {row.email}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono text-academic-deepGreen font-semibold">
                              {row.roll_number || 'N/A'}
                            </td>
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
                                </div>
                              ) : (
                                <span className="text-academic-muted font-mono">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-academic-primaryGreen">
                              {row.percentage !== null && row.percentage !== undefined
                                ? `${row.percentage}%`
                                : '—'}
                            </td>
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
      ) : (
        /* ======================================================================= */
        /* HIERARCHY OVERVIEW: SEMESTER -> CLASS -> SUBJECT -> ASSESSMENTS         */
        /* ======================================================================= */
        <div className="space-y-6">
          {hierarchy.length === 0 ? (
            <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-xl shadow-xs">
              <BookOpen className="w-8 h-8 mx-auto text-academic-muted mb-2" />
              <p className="text-xs font-semibold text-academic-deepGreen">No academic structures match the active filters.</p>
              <p className="text-[11px] text-academic-muted mt-1">Try resetting the semester or class filter above.</p>
            </div>
          ) : (
            hierarchy.map((sem) => (
              <div key={sem.semester} className="space-y-4">
                <div className="flex items-center space-x-2 pb-1 border-b border-academic-border">
                  <GraduationCap className="w-4 h-4 text-academic-primaryGreen" />
                  <h2 className="text-sm font-bold text-academic-deepGreen uppercase tracking-wider">
                    Semester {sem.semester} Programs & Cohorts
                  </h2>
                </div>

                <div className="space-y-4">
                  {sem.classes.map((cls) => (
                    <div
                      key={cls.class_id}
                      className="bg-academic-surface border border-academic-border rounded-xl p-5 shadow-xs space-y-4"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-academic-border/70">
                        <div>
                          <h3 className="text-base font-bold text-academic-deepGreen">
                            {cls.programme} &bull; Semester {cls.semester} &bull; Section {cls.section}
                          </h3>
                          <span className="text-xs text-academic-muted">
                            {cls.student_count} Enrolled Students &bull; {cls.subjects.length} Subjects
                          </span>
                        </div>
                      </div>

                      {/* Subjects in this class */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cls.subjects.map((sub) => (
                          <div
                            key={sub.subject_id}
                            className="p-4 rounded-lg bg-academic-paleGreen/15 border border-academic-border space-y-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-academic-primaryGreen text-white">
                                  {sub.subject_code}
                                </span>
                                <span className="text-[10px] text-academic-muted font-semibold">
                                  {sub.published_assessment_count} Assessments
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-academic-deepGreen mt-1 truncate">
                                {sub.subject_name}
                              </h4>
                              <p className="text-[11px] text-academic-muted truncate">
                                Teacher: {sub.teacher_name || 'Assigned Faculty'}
                              </p>
                            </div>

                            {/* Assessments in this subject */}
                            <div className="space-y-1.5 pt-2 border-t border-academic-border/60">
                              {sub.assessments.length === 0 ? (
                                <p className="text-[10px] text-academic-muted italic">
                                  No assessments published yet.
                                </p>
                              ) : (
                                sub.assessments.map((ass) => (
                                  <div
                                    key={ass.id}
                                    data-assessment-id={ass.id}
                                    onClick={() => handleSelectAssessment(ass.id)}
                                    className="p-2 rounded bg-academic-surface border border-academic-border hover:border-academic-primaryGreen/60 cursor-pointer flex items-center justify-between group transition-colors"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="text-xs font-semibold text-academic-deepGreen truncate group-hover:text-academic-primaryGreen transition-colors">
                                        {ass.title}
                                      </p>
                                      <span className="text-[10px] text-academic-muted">
                                        Max: {ass.max_marks} Marks
                                      </span>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-academic-primaryGreen shrink-0 group-hover:translate-x-0.5 transition-transform" />
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
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

      {/* Official Assessment Marks Report PDF Generator Modal */}
      <AssessmentMarksReportModal
        isOpen={isReportPdfModalOpen}
        onClose={() => setIsReportPdfModalOpen(false)}
        activeRole="hod"
        defaultAssessmentId={selectedAssessmentId || undefined}
      />
    </div>
  );
};
