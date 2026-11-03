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
  BookOpen,
  ArrowLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import {
  classTeacherApi,
  assessmentApi,
  submissionApi,
  ClassTeacherCohortDTO,
  ClassTeacherCohortSubjectDTO,
  AssessmentDTO
} from '../../services/apiClient';

interface ClassTeacherWorkspaceProps {
  initialTab?: 'overview' | 'assessments' | 'reports' | 'students';
}

export const ClassTeacherWorkspace: React.FC<ClassTeacherWorkspaceProps> = ({
  initialTab = 'overview'
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'assessments' | 'reports' | 'students'>(initialTab);
  const [cohortClasses, setCohortClasses] = useState<ClassTeacherCohortDTO[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [lateReports, setLateReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters for Assessments Tab
  const [assessmentSearch, setAssessmentSearch] = useState<string>('');
  const [assessmentSubjectFilter, setAssessmentSubjectFilter] = useState<string>('all');

  // Hierarchy state for Submission Report Tab (Subject-First 3-level pattern)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  // Search & Filter states for Submission Report Tab
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [reportAssessmentSearch, setReportAssessmentSearch] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'submitted' | 'pending'>('all');

  // Filters for Cohort Roster Tab
  const [cohortSearch, setCohortSearch] = useState<string>('');

  // Selected submission modal (Read-Only)
  const [selectedSubmissionDetails, setSelectedSubmissionDetails] = useState<any | null>(null);
  const [isLoadingSubmissionDetails, setIsLoadingSubmissionDetails] = useState<boolean>(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
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

  // Selected subject and assessment in 3-level hierarchy
  const selectedSubject = useMemo(() => {
    if (!selectedSubjectId || !currentClass) return null;
    return classSubjectsList.find(s => s.id === selectedSubjectId || s.subject_id === selectedSubjectId) || null;
  }, [classSubjectsList, selectedSubjectId, currentClass]);

  const selectedAssessment = useMemo(() => {
    if (!selectedAssessmentId) return null;
    return assessments.find(a => a.id === selectedAssessmentId) || null;
  }, [assessments, selectedAssessmentId]);

  // Helper to get published assessments for a given subject
  const getPublishedAssessmentsForSubject = (subject: ClassTeacherCohortSubjectDTO) => {
    return assessments.filter(a => {
      const matchesSubject = a.class_subject_id === subject.id || a.class_subject_id === subject.subject_id;
      const isPublished = a.status === 'published' || a.status === 'closed' || Boolean(a.published_at);
      return matchesSubject && isPublished;
    });
  };

  // Academic Cohort Specialization Rule (e.g. MCA Semester 3):
  // If the subject is tied to a specialization, only enrolled students with matching specialization are eligible.
  // If the subject has no specialization (Core / Common), all enrolled students in the class are eligible.
  const getEligibleStudentsForSubject = (subject: ClassTeacherCohortSubjectDTO | null) => {
    if (!currentClass || !subject) return [];
    const allStudents = currentClass.students || [];

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

  // Level 1: Filtered Subjects List
  const filteredSubjectsList = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return classSubjectsList;
    return classSubjectsList.filter(s =>
      s.subject_name.toLowerCase().includes(q) ||
      (s.subject_code && s.subject_code.toLowerCase().includes(q))
    );
  }, [classSubjectsList, subjectSearch]);

  // Level 2: Filtered Assessments for Selected Subject
  const publishedAssessmentsForSelectedSubject = useMemo(() => {
    if (!selectedSubject) return [];
    return getPublishedAssessmentsForSubject(selectedSubject);
  }, [selectedSubject, assessments]);

  const filteredAssessmentsInLevel2 = useMemo(() => {
    const q = reportAssessmentSearch.trim().toLowerCase();
    if (!q) return publishedAssessmentsForSelectedSubject;
    return publishedAssessmentsForSelectedSubject.filter(a =>
      a.title.toLowerCase().includes(q)
    );
  }, [publishedAssessmentsForSelectedSubject, reportAssessmentSearch]);

  // Level 3: Eligible Students & Submissions for Selected Assessment
  const eligibleStudentsForSelectedSubject = useMemo(() => {
    return getEligibleStudentsForSubject(selectedSubject);
  }, [selectedSubject, currentClass]);

  const level3Students = useMemo(() => {
    if (!selectedAssessment || !selectedSubject) return [];

    return eligibleStudentsForSelectedSubject.map(student => {
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
        subject_name: selectedSubject.subject_name,
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
        submission_id: match?.submission_id || null,
        submitted_at: match?.submitted_at || null,
        timing_status: timingStatus,
        evaluation_status: match?.evaluation_status || (isSubmitted ? 'pending' : 'not_submitted'),
        evaluation_status_label: evaluationLabel,
        score,
        reportRow: fallbackRow
      };
    });
  }, [selectedAssessment, selectedSubject, eligibleStudentsForSelectedSubject, classReports, currentClass]);

  const filteredLevel3Students = useMemo(() => {
    return level3Students.filter(item => {
      // Status filter
      if (studentStatusFilter === 'submitted' && !item.is_submitted) return false;
      if (studentStatusFilter === 'pending' && item.is_submitted) return false;

      // Search filter
      const q = studentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.usn && item.usn.toLowerCase().includes(q)) ||
        item.email.toLowerCase().includes(q)
      );
    });
  }, [level3Students, studentSearch, studentStatusFilter]);

  // Focused 4 KPI Metrics for Overview Tab
  const kpiMetrics = useMemo(() => {
    const totalStudents = currentClass?.students_count || 0;
    const totalAssessments = classAssessments.length;
    const totalPossibleSubmissions = totalStudents * totalAssessments;

    const submittedCount = classReports.filter(r => r.is_submitted).length;
    const pendingCount = totalPossibleSubmissions > 0
      ? Math.max(0, totalPossibleSubmissions - submittedCount)
      : 0;

    return {
      totalStudents,
      totalAssessments,
      submittedCount,
      pendingCount
    };
  }, [currentClass, classAssessments, classReports]);

  // Filtered Assessments for Tab B
  const filteredAssessments = useMemo(() => {
    return classAssessments.filter(ass => {
      const matchesSearch = assessmentSearch.trim() === '' ||
        ass.title.toLowerCase().includes(assessmentSearch.toLowerCase()) ||
        (ass.subject_details && ass.subject_details.toLowerCase().includes(assessmentSearch.toLowerCase()));

      const matchesSubject = assessmentSubjectFilter === 'all' || ass.class_subject_id === assessmentSubjectFilter;
      return matchesSearch && matchesSubject;
    });
  }, [classAssessments, assessmentSearch, assessmentSubjectFilter]);

  // Filtered Cohort Students
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
    if (!row.submission_id) {
      setSelectedSubmissionDetails({
        reportRow: row,
        fullSubmission: null
      });
      return;
    }

    setIsLoadingSubmissionDetails(true);
    try {
      const fullSub = await submissionApi.getSubmissionById(row.submission_id);
      setSelectedSubmissionDetails({
        reportRow: row,
        fullSubmission: fullSub
      });
    } catch {
      setSelectedSubmissionDetails({
        reportRow: row,
        fullSubmission: null
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
    if (!selectedAssessment || !selectedSubject) return;
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

    const rows = filteredLevel3Students.map(item => {
      return [
        `"${(item.name || '').replace(/"/g, '""')}"`,
        `"${(item.usn || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.specialization_code || 'Core').replace(/"/g, '""')}"`,
        `"${(selectedAssessment.title || '').replace(/"/g, '""')}"`,
        `"${(selectedSubject.subject_code || '').replace(/"/g, '""')}"`,
        `"${(selectedSubject.name || selectedSubject.subject_name || '').replace(/"/g, '""')}"`,
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
    link.download = `${selectedSubject.subject_code || 'subject'}_${safeTitle}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
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
                  'Supervise enrolled students, published assessments, and submission reports.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Show selector only if multiple distinct classes are authorized */}
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

        {/* Clear HOD Assignment Indicator if viewing via semester allocation without explicit appointment */}
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
      {/* 2. PRIMARY 4-FUNCTION TAB NAVIGATION                                      */}
      {/* ========================================================================= */}
      <div className="border-b border-academic-border">
        <nav className="flex space-x-2 sm:space-x-6" aria-label="Class Teacher Workspace Tabs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'overview'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('assessments')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'assessments'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <span>Assessments</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {classAssessments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'reports'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <span>Submissions & Late Report</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {classSubjectsList.length} Subjects
            </span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center space-x-2 ${activeTab === 'students'
              ? 'border-academic-primaryGreen text-academic-deepGreen font-bold'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
          >
            <span>Student Cohort</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-academic-paleGreen text-academic-deepGreen">
              {currentClass?.students_count || 0}
            </span>
          </button>
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB A: OVERVIEW (FOCUSED 4-METRIC DASHBOARD ONLY)                          */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Metric 1: Assigned Class */}
            <div className="card p-5 bg-academic-surface border border-academic-border shadow-sm">
              <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                Assigned Class
              </span>
              <div className="mt-2 text-2xl font-bold text-academic-deepGreen truncate">
                {currentClass?.name || 'Unassigned'}
              </div>
              <p className="text-xs text-academic-muted mt-1 truncate">
                Teacher: {currentClass?.class_teacher_name || 'Unassigned'}
              </p>
            </div>

            {/* Metric 2: Enrolled Student Count */}
            <div className="card p-5 bg-academic-surface border border-academic-border shadow-sm">
              <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                Enrolled Students
              </span>
              <div className="mt-2 text-2xl font-bold text-academic-deepGreen">
                {kpiMetrics.totalStudents}
              </div>
              <p className="text-xs text-academic-muted mt-1">
                Active students registered in cohort
              </p>
            </div>

            {/* Metric 3: Published Assessment Count */}
            <div className="card p-5 bg-academic-surface border border-academic-border shadow-sm">
              <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                Published Assessments
              </span>
              <div className="mt-2 text-2xl font-bold text-academic-deepGreen">
                {kpiMetrics.totalAssessments}
              </div>
              <p className="text-xs text-academic-muted mt-1">
                Active published evaluations in class
              </p>
            </div>

            {/* Metric 4: Pending Submissions Count */}
            <div className="card p-5 bg-academic-surface border border-academic-border shadow-sm">
              <span className="text-xs font-semibold text-academic-muted uppercase tracking-wider block">
                Pending Submissions
              </span>
              <div className="mt-2 text-2xl font-bold text-amber-700">
                {kpiMetrics.pendingCount}
              </div>
              <p className="text-xs text-academic-muted mt-1">
                Submissions awaiting student completion
              </p>
            </div>
          </div>

          {/* Quick Access Navigation */}
          <div className="card p-5 bg-academic-surface border border-academic-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-academic-muted">
              Use <strong className="text-academic-deepGreen">Submission Report</strong> to inspect all student submissions, timing status, and evaluation results, or <strong className="text-academic-deepGreen">Student Cohort</strong> for the class roster.
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('reports')}
                className="btn-primary py-1.5 px-3 text-xs"
              >
                Open Submission Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB B: ASSESSMENTS (COMPACT TABLE)                                        */}
      {/* ========================================================================= */}
      {activeTab === 'assessments' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-academic-surface border border-academic-border rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-academic-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search assessments by title..."
                value={assessmentSearch}
                onChange={(e) => setAssessmentSearch(e.target.value)}
                className="input-field pl-9 text-xs w-full py-1.5"
              />
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="subject-filter" className="text-xs text-academic-muted whitespace-nowrap">
                Subject:
              </label>
              <select
                id="subject-filter"
                value={assessmentSubjectFilter}
                onChange={(e) => setAssessmentSubjectFilter(e.target.value)}
                className="input-field text-xs py-1.5 px-3 min-w-[160px]"
              >
                <option value="all">All Class Subjects</option>
                {(currentClass?.subjects || []).map(s => (
                  <option key={s.id} value={s.id}>{s.subject_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-academic-paleGreen/50 text-academic-deepGreen font-semibold border-b border-academic-border">
                  <tr>
                    <th className="py-3 px-4">Assessment Title</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Submission Progress</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-academic-border">
                  {filteredAssessments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-academic-muted">
                        No published assessments found for this class cohort.
                      </td>
                    </tr>
                  ) : (
                    filteredAssessments.map(ass => {
                      const assReports = classReports.filter(r => r.assessment_id === ass.id);
                      const submitted = assReports.filter(r => r.is_submitted).length;
                      const totalStudents = currentClass?.students_count || 0;
                      const progressPct = totalStudents > 0 ? Math.round((submitted / totalStudents) * 100) : 0;
                      const isPastDue = ass.deadline_at ? new Date(ass.deadline_at) < new Date() : false;

                      return (
                        <tr key={ass.id} className="hover:bg-academic-paleGreen/20 transition-colors">
                          <td className="py-3 px-4 font-semibold text-academic-deepGreen">
                            <span className="block">{ass.title}</span>
                            <span className="text-[11px] font-normal text-academic-muted">Max marks: {ass.max_marks || 50}</span>
                          </td>
                          <td className="py-3 px-4 text-academic-deepGreen">
                            {ass.subject_details || 'Subject'}
                          </td>
                          <td className="py-3 px-4 text-academic-muted">
                            <span>{ass.deadline_at ? new Date(ass.deadline_at).toLocaleDateString() : 'Open'}</span>
                            {isPastDue && <span className="ml-1.5 text-[10px] text-red-600 font-bold">(Closed)</span>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-20 bg-academic-paleGreen rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-1.5 rounded-full bg-academic-primaryGreen"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="font-semibold text-academic-deepGreen">
                                {submitted} / {totalStudents} ({progressPct}%)
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                const sub = classSubjectsList.find(s => s.id === ass.class_subject_id || s.subject_id === ass.class_subject_id);
                                if (sub) {
                                  setSelectedSubjectId(sub.id || sub.subject_id);
                                }
                                setSelectedAssessmentId(ass.id);
                                setActiveTab('reports');
                              }}
                              className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center space-x-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Report</span>
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
      {/* TAB C: SUBMISSIONS REPORT (SUBJECT-FIRST 3-LEVEL HIERARCHY)                */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Breadcrumb Navigation Trail */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-academic-muted flex-wrap">
            <button
              onClick={() => {
                setSelectedSubjectId(null);
                setSelectedAssessmentId(null);
              }}
              className={`font-medium transition-colors hover:text-academic-primaryGreen ${
                !selectedSubject ? 'text-academic-deepGreen font-semibold cursor-default' : ''
              }`}
            >
              Class Submissions Report
            </button>

            {selectedSubject && (
              <>
                <ChevronRight className="w-4 h-4 text-academic-muted/60 shrink-0" />
                <button
                  onClick={() => setSelectedAssessmentId(null)}
                  className={`font-medium transition-colors hover:text-academic-primaryGreen ${
                    !selectedAssessment ? 'text-academic-deepGreen font-semibold cursor-default' : ''
                  }`}
                >
                  {selectedSubject.subject_code || 'Subject'} - {selectedSubject.name || selectedSubject.subject_name}
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

          {/* ================================================================== */}
          {/* LEVEL 1: SUBJECTS LIST (Clean, Subject-First Overview)             */}
          {/* ================================================================== */}
          {!selectedSubject && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
                <div>
                  <h2 className="text-xl font-bold text-academic-deepGreen flex items-center gap-2.5">
                    <BookOpen className="w-6 h-6 text-academic-primaryGreen" />
                    Class Submissions Report
                  </h2>
                  <p className="text-sm text-academic-muted mt-1">
                    Select a subject to monitor published assessments and student submission progress for your class cohort
                  </p>
                </div>
                <button
                  onClick={loadData}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
                  title="Refresh Cohort Data"
                >
                  <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Search by Subject Name or Subject Code */}
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

              {/* Subjects Grid */}
              {filteredSubjectsList.length === 0 ? (
                <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
                  <BookOpen className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-academic-deepGreen">No Subjects Found</h3>
                  <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                    {subjectSearch.trim()
                      ? `No subjects match "${subjectSearch}". Try a different keyword.`
                      : 'No subjects are currently assigned to this class cohort.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredSubjectsList.map((sub) => {
                    const publishedAss = getPublishedAssessmentsForSubject(sub);
                    const publishedCount = publishedAss.length;

                    return (
                      <div
                        key={sub.id || sub.subject_id}
                        onClick={() => {
                          setSelectedSubjectId(sub.id || sub.subject_id);
                          setSelectedAssessmentId(null);
                          setReportAssessmentSearch('');
                        }}
                        className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/40 hover:shadow-academicCard transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                              {sub.subject_code || 'SUB'}
                            </span>
                            {sub.specialization_code ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {sub.specialization_code}
                              </span>
                            ) : (
                              <span className="text-xs text-academic-muted font-medium">Core / Common</span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors mt-2">
                            {sub.name || (sub.subject_name.includes(' - ') ? sub.subject_name.split(' - ').slice(1).join(' - ') : sub.subject_name)}
                          </h3>
                          {sub.teacher_name && sub.teacher_name !== 'Unassigned' && (
                            <p className="text-xs text-academic-muted mt-1">
                              Faculty: <span className="font-medium text-academic-deepGreen">{sub.teacher_name}</span>
                            </p>
                          )}
                        </div>

                        <div className="pt-4 mt-4 border-t border-academic-borderSubtle flex justify-between items-center text-xs">
                          <div className="flex items-center gap-1.5 text-academic-muted">
                            <FileText className="w-4 h-4 text-academic-primaryGreen" />
                            <span className="font-semibold text-academic-deepGreen">{publishedCount}</span>
                            <span>{publishedCount === 1 ? 'Assessment' : 'Assessments'}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-academic-primaryGreen font-semibold group-hover:translate-x-0.5 transition-transform">
                            <span>View Assessments</span>
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================================================================== */}
          {/* LEVEL 2: ASSESSMENTS LIST (Belonging to Selected Subject)           */}
          {/* ================================================================== */}
          {selectedSubject && !selectedAssessment && (
            <div className="space-y-6">
              <button
                onClick={() => {
                  setSelectedSubjectId(null);
                  setSelectedAssessmentId(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-muted hover:text-academic-deepGreen transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Subjects</span>
              </button>

              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                      {selectedSubject.subject_code || 'SUB'}
                    </span>
                    {selectedSubject.specialization_code && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {selectedSubject.specialization_code}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-academic-deepGreen">
                    {selectedSubject.name || selectedSubject.subject_name}
                  </h2>
                  <p className="text-sm text-academic-muted mt-1">
                    Published assessments for this subject. Select an assessment to view student submissions.
                  </p>
                </div>
                <button
                  onClick={loadData}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-academic-deepGreen bg-academic-surface border border-academic-border rounded-lg hover:bg-academic-lightGreen/50 transition-colors self-start sm:self-auto shadow-sm"
                  title="Refresh Assessments"
                >
                  <RefreshCw className={`w-4 h-4 text-academic-primaryGreen ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Search by Assessment Title */}
              <div className="relative max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
                <input
                  type="text"
                  placeholder="Search assessments by title..."
                  value={reportAssessmentSearch}
                  onChange={(e) => setReportAssessmentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-academic-border rounded-lg text-sm bg-academic-surface text-academic-deepGreen placeholder:text-academic-muted/70 focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen/20 focus:border-academic-primaryGreen"
                />
              </div>

              {/* Assessments Grid */}
              {filteredAssessmentsInLevel2.length === 0 ? (
                <div className="text-center py-16 bg-academic-surface border border-dashed border-academic-border rounded-xl">
                  <FileText className="w-12 h-12 text-academic-muted/50 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-academic-deepGreen">No Assessments Found</h3>
                  <p className="text-sm text-academic-muted mt-1 max-w-md mx-auto">
                    {reportAssessmentSearch.trim()
                      ? `No assessments match "${reportAssessmentSearch}". Try a different keyword.`
                      : 'No published assessments are available for this subject yet.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAssessmentsInLevel2.map((ass) => {
                    const eligible = getEligibleStudentsForSubject(selectedSubject);
                    const totalEligible = eligible.length;
                    const submittedCount = eligible.filter(st => {
                      const rep = classReports.find(r => r.assessment_id === ass.id && (r.student_id === st.id || (st.usn && r.student_usn === st.usn)));
                      return rep && rep.is_submitted;
                    }).length;
                    const progressPct = totalEligible > 0 ? Math.round((submittedCount / totalEligible) * 100) : 0;
                    const isPastDue = ass.deadline_at ? new Date(ass.deadline_at) < new Date() : false;

                    return (
                      <div
                        key={ass.id}
                        className="bg-academic-surface border border-academic-border rounded-xl p-5 hover:border-academic-primaryGreen/40 hover:shadow-academicCard transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
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
                          <p className="text-xs text-academic-muted">
                            Subject: <span className="font-medium text-academic-deepGreen">{selectedSubject.subject_code || 'SUB'} - {selectedSubject.name || selectedSubject.subject_name}</span>
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-academic-muted mt-2">
                            <Calendar className="w-3.5 h-3.5 text-academic-primaryGreen" />
                            <span>Due: {ass.deadline_at ? formatDateTime(ass.deadline_at) : 'Open'}</span>
                            {isPastDue && <span className="text-[10px] text-rose-600 font-bold ml-1">(Closed)</span>}
                          </div>
                        </div>

                        <div className="pt-4 mt-4 border-t border-academic-borderSubtle space-y-3">
                          <div>
                            <div className="flex justify-between items-center text-xs mb-1.5">
                              <span className="text-academic-muted">Submission Progress</span>
                              <span className="font-bold text-academic-deepGreen">{submittedCount} / {totalEligible} ({progressPct}%)</span>
                            </div>
                            <div className="w-full bg-academic-paleGreen rounded-full h-2 overflow-hidden">
                              <div
                                className="h-2 rounded-full bg-academic-primaryGreen transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => {
                                setSelectedAssessmentId(ass.id);
                                setStudentSearch('');
                                setStudentStatusFilter('all');
                              }}
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

          {/* ================================================================== */}
          {/* LEVEL 3: STUDENT SUBMISSION REPORT (For Selected Assessment)       */}
          {/* ================================================================== */}
          {selectedSubject && selectedAssessment && (
            <div className="space-y-6">
              <button
                onClick={() => setSelectedAssessmentId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-academic-muted hover:text-academic-deepGreen transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Assessments</span>
              </button>

              {/* Assessment Summary Header */}
              <div className="p-4 bg-academic-surface border border-academic-border rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Published
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                      {selectedSubject.subject_code || 'SUB'}
                    </span>
                    {selectedSubject.specialization_code && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {selectedSubject.specialization_code}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-academic-deepGreen">
                    {selectedAssessment.title}
                  </h2>
                  <div className="flex items-center gap-4 text-xs text-academic-muted mt-2 flex-wrap">
                    <span>Subject: <strong className="text-academic-deepGreen font-semibold">{selectedSubject.name || selectedSubject.subject_name}</strong></span>
                    <span>Max Marks: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.max_marks || 50}</strong></span>
                    <span>Deadline: <strong className="text-academic-deepGreen font-semibold">{selectedAssessment.deadline_at ? formatDateTime(selectedAssessment.deadline_at) : 'Open'}</strong></span>
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
                    className="input-field text-xs py-1.5 px-2.5 min-w-[130px]"
                  >
                    <option value="all">All Students ({level3Students.length})</option>
                    <option value="submitted">Submitted ({level3Students.filter(s => s.is_submitted).length})</option>
                    <option value="pending">Pending ({level3Students.filter(s => !s.is_submitted).length})</option>
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
                      {filteredLevel3Students.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-academic-muted">
                            No student records match your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredLevel3Students.map((item) => (
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
      {/* TAB D: STUDENT COHORT (ROSTER ONLY)                                      */}
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
                                setSelectedSubjectId(null);
                                setSelectedAssessmentId(null);
                                setSubjectSearch('');
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
      {/* 5. SUBMISSION DETAILS MODAL (READ-ONLY FOR CLASS TEACHER)                 */}
      {/* ========================================================================= */}
      {selectedSubmissionDetails && (
        <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-xl w-full shadow-2xl border border-academic-border animate-in fade-in p-6">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
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
            <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 text-xs flex items-center space-x-2">
              <Shield className="w-4 h-4 text-blue-700 flex-shrink-0" />
              <span>
                <strong>Read-Only Class Teacher View:</strong> Grading, score authoring, and rubric mark modifications are strictly restricted to authorized Subject Teachers.
              </span>
            </div>

            {isLoadingSubmissionDetails ? (
              <div className="py-8 text-center text-academic-muted flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                <span>Loading submission files and evaluation details...</span>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
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

                {/* Evaluator Feedback if Available */}
                {selectedSubmissionDetails.reportRow.feedback && (
                  <div className="p-3 bg-academic-surface rounded border border-academic-border">
                    <span className="font-bold text-academic-deepGreen uppercase tracking-wider block mb-1 text-[11px]">
                      Evaluator Feedback
                    </span>
                    <p className="text-academic-muted italic">
                      "{selectedSubmissionDetails.reportRow.feedback}"
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-academic-border flex justify-end">
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
