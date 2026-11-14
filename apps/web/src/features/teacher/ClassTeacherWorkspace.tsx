import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  AlertCircle,
  RefreshCw,
  Search,
  Download,
  Eye,
  FileText,
  X,
  Shield,
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Calendar,
  Award,
  FileSpreadsheet,
  Users
} from 'lucide-react';
import {
  classTeacherApi,
  assessmentApi,
  submissionApi,
  evaluationApi,
  ClassTeacherCohortDTO,
  ClassTeacherCohortSubjectDTO,
  AssessmentDTO
} from '../../services/apiClient';
import { ClassTeacherAcademicReport } from './ClassTeacherAcademicReport';
import { RubricBreakdownSection } from '../../components/RubricBreakdownSection';
import { AssessmentMarksReportModal } from '../reports/AssessmentMarksReportModal';

interface ClassTeacherWorkspaceProps {
  initialTab?: 'performance' | 'reports' | 'students';
}

export const ClassTeacherWorkspace: React.FC<ClassTeacherWorkspaceProps> = ({
  initialTab = 'performance'
}) => {
  const normalizeTab = (tab?: string): 'performance' | 'reports' | 'students' => {
    if (tab === 'reports' || tab === 'late_reports' || tab === 'submissions') return 'reports';
    if (tab === 'students') return 'students';
    return 'performance';
  };

  const [activeTab, setActiveTab] = useState<'performance' | 'reports' | 'students'>(normalizeTab(initialTab));
  const [isReportPdfModalOpen, setIsReportPdfModalOpen] = useState<boolean>(false);
  const [cohortClasses, setCohortClasses] = useState<ClassTeacherCohortDTO[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [lateReports, setLateReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Operational Submissions & Late Report State (Direct Assessment View - NO duplicate subject cards)
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState<string>('');
  const [reportSubjectFilter, setReportSubjectFilter] = useState<string>('all');
  const [reportTimelineFilter, setReportTimelineFilter] = useState<'all' | 'open' | 'closed'>('all');

  // Level 2 student roster filters within selected assessment
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'submitted' | 'pending' | 'late'>('all');

  // Filters for Cohort Roster Tab
  const [cohortSearch, setCohortSearch] = useState<string>('');

  // Selected submission modal (Read-Only)
  const [selectedSubmissionDetails, setSelectedSubmissionDetails] = useState<any | null>(null);
  const [isLoadingSubmissionDetails, setIsLoadingSubmissionDetails] = useState<boolean>(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Fetch authorized class cohorts
      const cohortRes = await classTeacherApi.getCohortOverview();
      const rawClasses = cohortRes.classes || [];

      // Defensive deduplication by academic scope (programme + semester)
      const scopeMap = new Map<string, ClassTeacherCohortDTO>();
      for (const cls of rawClasses) {
        const scopeKey = `${(cls.programme || '').toUpperCase()}_SEM_${cls.semester}`;
        const existing = scopeMap.get(scopeKey);
        if (!existing) {
          scopeMap.set(scopeKey, cls);
          continue;
        }
        // Score canonical class: prefer appointed teacher > students count > subjects count
        const score = (c: ClassTeacherCohortDTO) => {
          let pts = 0;
          if (c.class_teacher_id && c.class_teacher_name && c.class_teacher_name !== 'Unassigned') {
            pts += 1000;
          }
          pts += (c.students_count || 0) * 100;
          pts += (c.subjects?.length || 0) * 10;
          return pts;
        };
        if (score(cls) > score(existing)) {
          scopeMap.set(scopeKey, cls);
        }
      }
      const uniqueClasses = Array.from(scopeMap.values());
      setCohortClasses(uniqueClasses);

      const activeClass = selectedClassId
        ? uniqueClasses.find(c => c.id === selectedClassId) || uniqueClasses[0]
        : uniqueClasses[0];

      if (activeClass) {
        setSelectedClassId(activeClass.id);
      }

      // 2. Fetch scoped assessments
      const assRes = await assessmentApi.getAssessments();
      setAssessments(assRes.assessments || []);

      // 3. Fetch authoritative class submissions report
      const reports = await submissionApi.getLateSubmissionsReport();
      setLateReports(reports || []);
    } catch (err: any) {
      console.error('Failed to load Class Teacher Workspace data:', err);
      setErrorMessage(err.message || 'Failed to load class cohort data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentClass = useMemo(() => {
    return cohortClasses.find(c => c.id === selectedClassId) || cohortClasses[0] || null;
  }, [cohortClasses, selectedClassId]);

  // Deduplicated list of subjects belonging to current class
  const classSubjectsList = useMemo(() => {
    if (!currentClass) return [];
    const map = new Map<string, ClassTeacherCohortSubjectDTO>();
    for (const sub of (currentClass.subjects || [])) {
      const key = sub.subject_id || sub.id;
      if (!map.has(key)) {
        map.set(key, sub);
      }
    }
    return Array.from(map.values());
  }, [currentClass]);

  // Assessments for current class
  const classAssessments = useMemo(() => {
    if (!currentClass) return [];
    const classSubjectIds = (currentClass.subjects || []).flatMap(s => [s.id, s.subject_id]);
    return assessments.filter(a => classSubjectIds.includes(a.class_subject_id));
  }, [assessments, currentClass]);

  // Submission reports for current class
  const classReports = useMemo(() => {
    if (!currentClass) return lateReports;
    return lateReports.filter(r => r.class_id === currentClass.id);
  }, [lateReports, currentClass]);

  // Selected assessment object for Level 2 submissions view
  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentId) return null;
    return assessments.find(a => a.id === selectedAssessmentId) || null;
  }, [assessments, selectedAssessmentId]);

  // Subject object corresponding to the selected assessment
  const selectedAssessmentSubject = useMemo(() => {
    if (!selectedAssessment) return null;
    return classSubjectsList.find(s => s.id === selectedAssessment.class_subject_id || s.subject_id === selectedAssessment.class_subject_id) || null;
  }, [selectedAssessment, classSubjectsList]);

  // Academic Cohort Specialization Rule:
  // If the subject is tied to a specialization, only enrolled students with matching specialization are eligible.
  // If the subject has no specialization (Core / Common), all enrolled students in the class are eligible.
  const getEligibleStudentsForSubject = (subject: ClassTeacherCohortSubjectDTO | null) => {
    if (!currentClass) return [];
    const allStudents = currentClass.students || [];
    if (!subject) return allStudents;

    if (subject.specialization_id || subject.specialization_code) {
      return allStudents.filter(student => {
        if (subject.specialization_id && student.specialization_id) {
          return student.specialization_id === subject.specialization_id;
        }
        if (subject.specialization_code && student.specialization_code) {
          return student.specialization_code.toUpperCase() === subject.specialization_code.toUpperCase();
        }
        return false;
      });
    }

    return allStudents;
  };

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

  // Operational KPI Metrics for Submissions & Late Report
  const operationalMetrics = useMemo(() => {
    const totalStudents = currentClass?.students_count || 0;
    const totalAssessments = classAssessments.length;
    const totalPossibleSubmissions = totalStudents * totalAssessments;

    const submittedCount = classReports.filter(r => r.is_submitted).length;
    const lateCount = classReports.filter(r => r.is_submitted && (r.is_late || r.timing_status === 'Late')).length;
    const pendingCount = totalPossibleSubmissions > 0
      ? Math.max(0, totalPossibleSubmissions - submittedCount)
      : 0;

    return {
      totalStudents,
      totalAssessments,
      submittedCount,
      totalPossibleSubmissions,
      lateCount,
      pendingCount
    };
  }, [currentClass, classAssessments, classReports]);

  // Filtered operational assessments for the Submissions & Deadlines direct view
  const filteredReportAssessments = useMemo(() => {
    return classAssessments.filter(ass => {
      // Subject filter
      if (reportSubjectFilter !== 'all') {
        const matchesSubject = ass.class_subject_id === reportSubjectFilter;
        if (!matchesSubject) {
          const targetSub = classSubjectsList.find(s => s.id === reportSubjectFilter || s.subject_id === reportSubjectFilter);
          if (!targetSub || (ass.class_subject_id !== targetSub.id && ass.class_subject_id !== targetSub.subject_id)) {
            return false;
          }
        }
      }

      // Timeline filter
      const isPastDue = ass.deadline_at ? new Date(ass.deadline_at) < new Date() : false;
      if (reportTimelineFilter === 'open' && isPastDue) return false;
      if (reportTimelineFilter === 'closed' && !isPastDue) return false;

      // Search filter
      const q = reportSearch.trim().toLowerCase();
      if (!q) return true;
      const titleMatch = (ass.title || '').toLowerCase().includes(q);
      const subMatch = (ass.subject_details || '').toLowerCase().includes(q);
      return titleMatch || subMatch;
    });
  }, [classAssessments, reportSubjectFilter, reportTimelineFilter, reportSearch, classSubjectsList]);

  // Level 2: Student roster & submissions for selected assessment
  const assessmentStudentsRoster = useMemo(() => {
    if (!selectedAssessment) return [];
    const eligible = selectedAssessmentSubject ? getEligibleStudentsForSubject(selectedAssessmentSubject) : (currentClass?.students || []);

    return eligible.map(student => {
      const match = classReports.find(r =>
        r.assessment_id === selectedAssessment.id &&
        (r.student_id === student.id || (student.usn && r.student_usn === student.usn))
      );

      const isSubmitted = Boolean(match && match.is_submitted);
      const isLate = Boolean(match?.is_late || match?.timing_status === 'Late');
      const timingStatus: 'On Time' | 'Late' | '—' = isSubmitted
        ? (isLate ? 'Late' : 'On Time')
        : '—';

      const isEvaluated = match && (
        match.evaluation_status === 'completed' ||
        match.evaluation_status === 'published' ||
        (match.final_score !== null && match.final_score !== undefined)
      );
      const isPublished = match?.is_published || match?.evaluation_status === 'published';

      let evaluationLabel: 'Pending' | 'Pending Evaluation' | 'Evaluated' | 'Published' | '—' = '—';
      if (isSubmitted) {
        if (isPublished) evaluationLabel = 'Published';
        else if (isEvaluated) evaluationLabel = 'Evaluated';
        else evaluationLabel = 'Pending Evaluation';
      }

      const score = (match?.published_score !== null && match?.published_score !== undefined)
        ? match.published_score
        : (isEvaluated && match?.final_score !== null && match?.final_score !== undefined ? match.final_score : null);

      const fallbackRow = match || {
        submission_id: null,
        assessment_id: selectedAssessment.id,
        assessment_title: selectedAssessment.title,
        class_id: currentClass?.id,
        class_name: currentClass?.name,
        subject_name: selectedAssessmentSubject?.subject_name || selectedAssessment.subject_details,
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
        student_usn: student.usn,
        is_submitted: false,
        submitted_at: null,
        is_late: false,
        timing_status: '—',
        evaluation_status: 'not_submitted',
        published_score: null,
        max_marks: selectedAssessment.max_marks || 50
      };

      return {
        id: student.id,
        student_id: student.id,
        name: student.name,
        usn: student.usn || 'N/A',
        email: student.email,
        specialization_code: student.specialization_code,
        specialization_name: student.specialization_name,
        is_submitted: isSubmitted,
        is_late: isLate,
        submission_id: match?.submission_id || null,
        submitted_at: match?.submitted_at || null,
        timing_status: timingStatus,
        evaluation_status: match?.evaluation_status || (isSubmitted ? 'pending' : 'not_submitted'),
        evaluation_status_label: evaluationLabel,
        score,
        reportRow: fallbackRow
      };
    });
  }, [selectedAssessment, selectedAssessmentSubject, currentClass, classReports]);

  // Filtered Level 2 student roster
  const filteredAssessmentStudents = useMemo(() => {
    return assessmentStudentsRoster.filter(item => {
      // Status filter
      if (studentStatusFilter === 'submitted' && !item.is_submitted) return false;
      if (studentStatusFilter === 'pending' && item.is_submitted) return false;
      if (studentStatusFilter === 'late' && (!item.is_submitted || !item.is_late)) return false;

      // Search filter
      const q = studentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.usn && item.usn.toLowerCase().includes(q)) ||
        item.email.toLowerCase().includes(q)
      );
    });
  }, [assessmentStudentsRoster, studentSearch, studentStatusFilter]);

  // Filtered Cohort Students for Tab Students
  const filteredCohortStudents = useMemo(() => {
    if (!currentClass) return [];
    const students = currentClass.students || [];
    return students.filter(s => {
      if (cohortSearch.trim() === '') return true;
      const q = cohortSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) ||
        (s.usn && s.usn.toLowerCase().includes(q)) ||
        s.email.toLowerCase().includes(q);
    });
  }, [currentClass, cohortSearch]);

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

  const exportAssessmentReportToCsv = () => {
    if (!selectedAssessment) return;
    const subjectName = selectedAssessmentSubject?.name || selectedAssessmentSubject?.subject_name || selectedAssessment.subject_details || 'Subject';
    const subjectCode = selectedAssessmentSubject?.subject_code || 'SUB';

    const headers = [
      'Student Name',
      'Institutional ID (USN)',
      'Specialization',
      'Assessment Title',
      'Subject Code',
      'Subject Name',
      'Submission Status',
      'Submitted Date/Time',
      'Timing Status',
      'Evaluation Status',
      'Published Marks',
      'Max Marks'
    ];

    const rows = filteredAssessmentStudents.map(item => {
      return [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.usn || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.specialization_code || 'Core').replace(/"/g, '""')}"`,
        `"${(selectedAssessment.title || '').replace(/"/g, '""')}"`,
        `"${subjectCode.replace(/"/g, '""')}"`,
        `"${subjectName.replace(/"/g, '""')}"`,
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
    link.download = `${subjectCode}_${safeTitle}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. COMPACT AUTHORITATIVE HEADER                                          */}
      {/* ========================================================================= */}
      <div className="bg-academic-surface border border-academic-border rounded-lg p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="p-2.5 bg-academic-paleGreen rounded-lg text-academic-primaryGreen">
              <GraduationCap className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
                  Class Teacher Workspace
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30">
                  Cohort Supervision
                </span>
              </div>
              <p className="text-xs text-academic-muted mt-0.5">
                {currentClass ? (
                  <span>
                    Assigned Class: <strong className="text-academic-deepGreen font-semibold">{currentClass.name}</strong> • Authorized Class Teacher: <strong className="text-academic-deepGreen font-semibold">{currentClass.class_teacher_name}</strong>
                  </span>
                ) : (
                  'Supervise enrolled students, academic performance, and operational submissions.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {cohortClasses.length > 1 && (
              <div className="flex items-center space-x-2">
                <label htmlFor="class-select" className="text-xs font-medium text-academic-muted whitespace-nowrap">
                  Cohort:
                </label>
                <select
                  id="class-select"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="input-field text-xs py-1.5 px-3 min-w-[160px]"
                >
                  {cohortClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={loadData}
              disabled={isLoading}
              className="btn-secondary text-xs flex items-center space-x-1.5 py-1.5 px-3"
              aria-label="Refresh class cohort data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {currentClass && currentClass.class_teacher_name === 'Unassigned' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                <strong>Semester Allocation Distinction:</strong> You are viewing this cohort via an academic semester allocation, but an explicit Class Teacher responsibility has not yet been appointed on the class record. Please contact the Academic HOD to assign Class Teacher responsibility.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
              HOD Appointable
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <span className="font-semibold">Unable to load cohort data:</span> {errorMessage}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STREAMLINED 3-FUNCTION WORKSPACE TAB NAVIGATION                        */}
      {/* Distinct responsibilities: Performance vs Submissions vs Cohort Directory */}
      {/* ========================================================================= */}
      <div className="border-b border-academic-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex space-x-2 sm:space-x-6 overflow-x-auto" aria-label="Class Teacher Workspace Tabs">
          <button
            onClick={() => setActiveTab('performance')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'performance'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <Award className="w-4 h-4 text-academic-primaryGreen" />
            <span>Academic Performance</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {classSubjectsList.length} Subjects
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('reports');
              setSelectedAssessmentId(null);
            }}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'reports'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-academic-primaryGreen" />
            <span>Submissions & Late Report</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {classAssessments.length} Assessments
            </span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'students'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <Users className="w-4 h-4 text-academic-primaryGreen" />
            <span>Student Cohort</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {currentClass?.students_count || 0}
            </span>
          </button>
        </nav>

        <button
          onClick={() => setIsReportPdfModalOpen(true)}
          className="btn-primary text-xs px-3.5 py-1.5 flex items-center space-x-1.5 bg-academic-primaryGreen text-white rounded-lg shadow-xs hover:bg-academic-deepGreen transition-colors self-start sm:self-auto mb-2 sm:mb-0 shrink-0"
        >
          <FileText className="w-3.5 h-3.5 text-white" />
          <span>Assessment Marks PDF</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ACADEMIC PERFORMANCE (Subject-Wise Marks, Class Avg & Rubrics)      */}
      {/* ========================================================================= */}
      {activeTab === 'performance' && (
        <ClassTeacherAcademicReport initialClassId={selectedClassId} />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SUBMISSIONS & LATE REPORT (Direct Operational Tracking - NO DUPES)  */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Breadcrumb Navigation Trail */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-academic-muted flex-wrap">
            <button
              onClick={() => setSelectedAssessmentId(null)}
              className={`font-medium transition-colors hover:text-academic-primaryGreen ${
                !selectedAssessment ? 'text-academic-deepGreen font-semibold cursor-default' : ''
              }`}
            >
              Assessments & Deadlines
            </button>

            {selectedAssessment && (
              <>
                <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
                <span className="text-academic-deepGreen font-semibold truncate max-w-xs sm:max-w-md">
                  {selectedAssessment.title}
                </span>
                <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
                <span className="text-academic-primaryGreen font-semibold">
                  Student Submissions Roster
                </span>
              </>
            )}
          </nav>

          {/* ================================================================== */}
          {/* LEVEL 1: DIRECT ASSESSMENTS & DEADLINES VIEW (Zero Duplicate Cards) */}
          {/* ================================================================== */}
          {!selectedAssessment && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
                <div>
                  <h2 className="text-xl font-bold text-academic-deepGreen flex items-center gap-2.5">
                    <FileSpreadsheet className="w-6 h-6 text-academic-primaryGreen" />
                    Submissions & Late Report
                  </h2>
                  <p className="text-sm text-academic-muted mt-1">
                    Operational deadline tracking, submission compliance, and late turn-in monitoring across all class assessments.
                  </p>
                </div>
                <button
                  onClick={loadData}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
                  title="Refresh Submission Data"
                >
                  <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Operational KPI Metric Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4 bg-academic-surface border border-academic-border shadow-sm">
                  <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                    Published Assessments
                  </span>
                  <div className="mt-1.5 text-2xl font-bold text-academic-deepGreen">
                    {operationalMetrics.totalAssessments}
                  </div>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Across {classSubjectsList.length} subjects
                  </p>
                </div>

                <div className="card p-4 bg-academic-surface border border-academic-border shadow-sm">
                  <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                    Submissions Received
                  </span>
                  <div className="mt-1.5 text-2xl font-bold text-academic-deepGreen">
                    {operationalMetrics.submittedCount}
                    <span className="text-xs font-normal text-academic-muted ml-1.5">
                      / {operationalMetrics.totalPossibleSubmissions} (
                      {operationalMetrics.totalPossibleSubmissions > 0
                        ? Math.round((operationalMetrics.submittedCount / operationalMetrics.totalPossibleSubmissions) * 100)
                        : 0}%)
                    </span>
                  </div>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Turned in by cohort students
                  </p>
                </div>

                <div className="card p-4 bg-academic-surface border border-academic-border shadow-sm">
                  <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                    Late Submissions
                  </span>
                  <div className={`mt-1.5 text-2xl font-bold ${operationalMetrics.lateCount > 0 ? 'text-rose-600' : 'text-academic-deepGreen'}`}>
                    {operationalMetrics.lateCount}
                  </div>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Turned in past deadline
                  </p>
                </div>

                <div className="card p-4 bg-academic-surface border border-academic-border shadow-sm">
                  <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                    Pending Submissions
                  </span>
                  <div className="mt-1.5 text-2xl font-bold text-amber-700">
                    {operationalMetrics.pendingCount}
                  </div>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Awaiting student submission
                  </p>
                </div>
              </div>

              {/* Filter Controls Bar */}
              <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search assessments by title..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="input-field pl-9 text-xs w-full py-1.5"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center space-x-2">
                    <label htmlFor="filter-subject" className="text-xs text-academic-muted whitespace-nowrap">
                      Subject:
                    </label>
                    <select
                      id="filter-subject"
                      value={reportSubjectFilter}
                      onChange={(e) => setReportSubjectFilter(e.target.value)}
                      className="input-field text-xs py-1.5 px-3 min-w-[160px]"
                    >
                      <option value="all">All Class Subjects ({classSubjectsList.length})</option>
                      {classSubjectsList.map(s => (
                        <option key={s.id || s.subject_id} value={s.id || s.subject_id}>
                          {s.subject_code || 'SUB'} - {s.name || s.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label htmlFor="filter-timeline" className="text-xs text-academic-muted whitespace-nowrap">
                      Deadline:
                    </label>
                    <select
                      id="filter-timeline"
                      value={reportTimelineFilter}
                      onChange={(e) => setReportTimelineFilter(e.target.value as any)}
                      className="input-field text-xs py-1.5 px-3 min-w-[130px]"
                    >
                      <option value="all">All Deadlines</option>
                      <option value="open">Open (Upcoming)</option>
                      <option value="closed">Closed (Past Due)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Direct Assessments & Deadlines Table */}
              <div className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-academic-paleGreen/50 text-academic-deepGreen font-semibold border-b border-academic-border">
                      <tr>
                        <th className="py-3 px-4">Assessment Title</th>
                        <th className="py-3 px-4">Subject</th>
                        <th className="py-3 px-4">Deadline & Status</th>
                        <th className="py-3 px-4">Submission Progress</th>
                        <th className="py-3 px-4 text-center">Late Turn-ins</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-academic-border">
                      {filteredReportAssessments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-academic-muted">
                            <FileText className="w-10 h-10 text-academic-muted/40 mx-auto mb-2" />
                            <p className="font-semibold text-academic-deepGreen">No assessments match your criteria</p>
                            <p className="text-xs text-academic-muted mt-0.5">Try clearing or adjusting the search query and filters.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredReportAssessments.map(ass => {
                          const assSubject = classSubjectsList.find(s => s.id === ass.class_subject_id || s.subject_id === ass.class_subject_id);
                          const eligible = getEligibleStudentsForSubject(assSubject || null);
                          const totalEligible = eligible.length;
                          const assReports = classReports.filter(r => r.assessment_id === ass.id);
                          const submittedCount = eligible.filter(st => {
                            const rep = assReports.find(r => r.student_id === st.id || (st.usn && r.student_usn === st.usn));
                            return rep && rep.is_submitted;
                          }).length;
                          const lateCount = eligible.filter(st => {
                            const rep = assReports.find(r => r.student_id === st.id || (st.usn && r.student_usn === st.usn));
                            return rep && rep.is_submitted && (rep.is_late || rep.timing_status === 'Late');
                          }).length;
                          const progressPct = totalEligible > 0 ? Math.round((submittedCount / totalEligible) * 100) : 0;
                          const isPastDue = ass.deadline_at ? new Date(ass.deadline_at) < new Date() : false;

                          return (
                            <tr key={ass.id} className="hover:bg-academic-paleGreen/20 transition-colors">
                              <td className="py-3.5 px-4 font-semibold text-academic-deepGreen">
                                <span className="block text-sm">{ass.title}</span>
                                <span className="text-[11px] font-normal text-academic-muted">Max marks: {ass.max_marks || 50}</span>
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                                    {assSubject?.subject_code || 'SUB'}
                                  </span>
                                  {assSubject?.specialization_code && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      {assSubject.specialization_code}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-academic-deepGreen mt-0.5 block truncate max-w-xs">
                                  {assSubject?.name || assSubject?.subject_name || ass.subject_details || 'Subject'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-academic-muted">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-academic-primaryGreen shrink-0" />
                                  <span>{ass.deadline_at ? formatDateTime(ass.deadline_at) : 'Open Schedule'}</span>
                                </div>
                                {isPastDue ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 mt-1">
                                    Closed (Past Due)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                                    Open
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="space-y-1">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <span className="font-semibold text-academic-deepGreen">
                                      {submittedCount} / {totalEligible}
                                    </span>
                                    <span className="text-academic-muted">{progressPct}%</span>
                                  </div>
                                  <div className="w-28 bg-academic-paleGreen rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="h-1.5 rounded-full bg-academic-primaryGreen transition-all duration-300"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {lateCount > 0 ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    {lateCount} Late
                                  </span>
                                ) : (
                                  <span className="text-academic-muted font-mono text-[11px]">0 Late</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => {
                                    setSelectedAssessmentId(ass.id);
                                    setStudentSearch('');
                                    setStudentStatusFilter('all');
                                  }}
                                  className="btn-primary py-1.5 px-3 text-xs inline-flex items-center space-x-1.5 shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Submissions</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* LEVEL 2: STUDENT SUBMISSIONS ROSTER (For Selected Assessment)       */}
          {/* ================================================================== */}
          {selectedAssessment && (
            <div className="space-y-6">
              <button
                onClick={() => setSelectedAssessmentId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-muted hover:text-academic-deepGreen transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Assessments & Deadlines</span>
              </button>

              {/* Assessment Summary Header */}
              <div className="p-4 bg-academic-surface border border-academic-border rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Published Assessment
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                      {selectedAssessmentSubject?.subject_code || 'SUB'}
                    </span>
                    {selectedAssessmentSubject?.specialization_code && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {selectedAssessmentSubject.specialization_code}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-academic-deepGreen">
                    {selectedAssessment.title}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-academic-muted mt-2 flex-wrap">
                    <span>Subject: <strong className="text-academic-deepGreen font-semibold">{selectedAssessmentSubject?.name || selectedAssessmentSubject?.subject_name || selectedAssessment.subject_details}</strong></span>
                    <span>Max Marks: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.max_marks || 50}</strong></span>
                    <span>Deadline: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.deadline_at ? formatDateTime(selectedAssessment.deadline_at) : 'Open Schedule'}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={exportAssessmentReportToCsv}
                    disabled={filteredAssessmentStudents.length === 0}
                    className="btn-secondary text-xs px-3 py-2 flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={loadData}
                    disabled={isLoading}
                    className="btn-secondary text-xs px-3 py-2 flex items-center space-x-1.5 shadow-sm"
                    title="Refresh Data"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Bar */}
              <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

                <div className="flex items-center space-x-2">
                  <label htmlFor="filter-student-status" className="text-xs text-academic-muted whitespace-nowrap">
                    Submission Status:
                  </label>
                  <select
                    id="filter-student-status"
                    value={studentStatusFilter}
                    onChange={(e) => setStudentStatusFilter(e.target.value as any)}
                    className="input-field text-xs py-1.5 px-2.5 min-w-[140px]"
                  >
                    <option value="all">All Students ({assessmentStudentsRoster.length})</option>
                    <option value="submitted">Submitted ({assessmentStudentsRoster.filter(s => s.is_submitted).length})</option>
                    <option value="pending">Pending ({assessmentStudentsRoster.filter(s => !s.is_submitted).length})</option>
                    <option value="late">Late Only ({assessmentStudentsRoster.filter(s => s.is_submitted && s.is_late).length})</option>
                  </select>
                </div>
              </div>

              {/* Student-wise Submissions Table */}
              <div className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-academic-paleGreen/50 text-academic-deepGreen font-semibold border-b border-academic-border">
                      <tr>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Institutional USN</th>
                        <th className="py-3 px-4 text-center">Submission Status</th>
                        <th className="py-3 px-4">Submitted Date/Time</th>
                        <th className="py-3 px-4 text-center">Timing Status</th>
                        <th className="py-3 px-4 text-center">Evaluation Status</th>
                        <th className="py-3 px-4 text-right">Published Marks</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-academic-border">
                      {filteredAssessmentStudents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-academic-muted">
                            No student records match your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredAssessmentStudents.map((item) => (
                          <tr key={item.id} className="hover:bg-academic-paleGreen/20 transition-colors">
                            <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                              <div className="flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {item.specialization_code && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    {item.specialization_code}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-normal text-academic-muted block">{item.email}</span>
                            </td>
                            <td className="py-3 px-4 font-mono text-academic-deepGreen">
                              {item.usn}
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
                                <span>{item.score} / {selectedAssessment.max_marks || 50}</span>
                              ) : item.is_submitted ? (
                                <span className="text-xs text-academic-muted italic">Pending</span>
                              ) : (
                                <span className="text-academic-muted font-mono">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {item.is_submitted ? (
                                <button
                                  onClick={() => handleOpenSubmissionDetails(item.reportRow)}
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STUDENT COHORT (Roster & Directory Only)                          */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student name or USN..."
                value={cohortSearch}
                onChange={(e) => setCohortSearch(e.target.value)}
                className="input-field pl-9 text-xs w-full py-1.5"
              />
            </div>
            <div className="text-xs text-academic-muted">
              Total Enrolled Students: <strong className="text-academic-deepGreen">{filteredCohortStudents.length}</strong>
            </div>
          </div>

          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-academic-paleGreen/50 text-academic-deepGreen font-semibold border-b border-academic-border">
                  <tr>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Institutional USN</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4 text-center">Academic Status</th>
                    <th className="py-3 px-4">Submission Progress</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-academic-border">
                  {filteredCohortStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-academic-muted">
                        No enrolled students found for this class cohort.
                      </td>
                    </tr>
                  ) : (
                    filteredCohortStudents.map(student => {
                      const studentReports = classReports.filter(r => r.student_id === student.id);
                      const submitted = studentReports.filter(r => r.is_submitted).length;
                      const totalAssessments = classAssessments.length;

                      return (
                        <tr key={student.id} className="hover:bg-academic-paleGreen/20 transition-colors">
                          <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                            {student.name}
                          </td>
                          <td className="py-3 px-4 font-mono text-academic-deepGreen">
                            {student.usn || 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-academic-muted">
                            {student.email}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-academic-lightGreen text-academic-deepGreen border border-academic-primaryGreen/30">
                              {student.status || 'Active'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                            {submitted} / {totalAssessments} Submitted
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedAssessmentId(null);
                                setReportSearch('');
                                setStudentSearch(student.usn || student.name);
                                setActiveTab('reports');
                              }}
                              className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center space-x-1"
                            >
                              <span>View In Report</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SUBMISSION DETAILS MODAL (READ-ONLY FOR CLASS TEACHER)                 */}
      {/* ========================================================================= */}
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

            {/* Read-Only Notice */}
            <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 text-xs flex items-center space-x-2 shrink-0">
              <Shield className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                <strong>Read-Only Class Teacher View:</strong> Grading, score authoring, and rubric mark modifications are strictly restricted to authorized Subject Teachers.
              </span>
            </div>

            {isLoadingSubmissionDetails ? (
              <div className="py-12 text-center text-academic-muted flex items-center justify-center space-x-2 flex-1">
                <RefreshCw className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                <span>Loading submission files and rubric evaluation details...</span>
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
                    <span className="text-academic-muted block text-[11px]">Marks</span>
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
                    Uploaded Files
                  </span>
                  {(!selectedSubmissionDetails.fullSubmission?.active_version?.files || selectedSubmissionDetails.fullSubmission.active_version.files.length === 0) ? (
                    <p className="text-academic-muted italic">
                      {selectedSubmissionDetails.reportRow.is_submitted
                        ? '1 file attached to this submission version.'
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
      {/* Official Assessment Marks Report PDF Generator Modal */}
      <AssessmentMarksReportModal
        isOpen={isReportPdfModalOpen}
        onClose={() => setIsReportPdfModalOpen(false)}
        activeRole="class_teacher"
        defaultAssessmentId={selectedAssessmentId || undefined}
      />
    </div>
  );
};
