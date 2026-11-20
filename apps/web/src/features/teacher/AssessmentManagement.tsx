import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Pencil,
  BookOpen,
  Loader2, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Calendar, 
  Clock, 
  FileText, 
  Layers, 
  ChevronRight, 
  ArrowLeft, 
  X, 
  Upload, 
  Download, 
  FileCheck2, 
  Search, 
  Filter, 
  Trash2, 
  Paperclip, 
  FileSpreadsheet, 
  AlertTriangle,
  RotateCw,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Save,
  Send,
  HelpCircle,
  Check,
  Users
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';

const PdfViewer = React.lazy(() => import('../../components/PdfViewer').then(m => ({ default: m.PdfViewer })));
import { assessmentApi, AssessmentDTO, submissionApi, SubmissionDTO, authApi } from '../../services/apiClient';
import { formatClassName, AssessmentType, QuizQuestion, QuizOption } from '@smartfa/contracts';
import { ProctorMenteeReport } from '../proctor/ProctorMenteeReport';
import { AssessmentMarksReportModal } from '../reports/AssessmentMarksReportModal';

interface AssessmentManagementProps {
  activeRole: string;
  initialTab?: 'file_based' | 'questions' | 'quiz' | 'rubric' | 'submissions' | 'submissions_report' | 'late_reports';
}

export interface ManualQuestionItem {
  id?: string;
  prompt: string;
  max_marks?: number | null;
  display_order: number;
}

export interface RubricCriterionItem {
  id?: string;
  title?: string;
  criterion_title: string;
  description?: string;
  max_marks: number;
  max_score?: number;
  display_order?: number;
}

export const DEFAULT_RUBRIC_CRITERIA: RubricCriterionItem[] = [
  { title: 'Concept & Understanding', criterion_title: 'Concept & Understanding', description: 'Grasp of fundamental theories, principles, and problem formulation', max_marks: 15, display_order: 1 },
  { title: 'Implementation & Solution', criterion_title: 'Implementation & Solution', description: 'Technical accuracy, methodology, algorithm design, and execution', max_marks: 20, display_order: 2 },
  { title: 'Analysis & Verification', criterion_title: 'Analysis & Verification', description: 'Results evaluation, edge cases, complexity analysis, and reasoning', max_marks: 10, display_order: 3 },
  { title: 'Presentation & Clarity', criterion_title: 'Presentation & Clarity', description: 'Structure, documentation, readability, neatness, and diagrams', max_marks: 5, display_order: 4 }
];

export const AssessmentManagement: React.FC<AssessmentManagementProps> = ({ activeRole, initialTab }) => {
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [isReportPdfModalOpen, setIsReportPdfModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const handleDownloadDocument = async (assessmentId: string, filename?: string | null) => {
    try {
      setDownloadingDocId(assessmentId);
      await assessmentApi.downloadDocument(assessmentId, filename || 'Assignment Document.pdf');
    } catch (err: any) {
      console.error('Failed to download document:', err);
      setErrorMessage(err.message || 'Failed to download document');
    } finally {
      setDownloadingDocId(null);
    }
  };

  // Tab & View States
  const [activeTab, setActiveTab] = useState<'file_based' | 'questions' | 'quiz' | 'rubric' | 'submissions' | 'submissions_report'>(
    activeRole === 'proctor' || (initialTab as string) === 'late_reports' || initialTab === 'submissions_report'
      ? 'submissions_report'
      : ((initialTab as any) || 'file_based')
  );

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStage, setCreationStage] = useState<string | null>(null);
  const isSubmittingCreateRef = useRef(false);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
  });

  const computeNextTitleForSubject = (csId: string) => {
    const classAss = assessments.filter(a => a.class_subject_id === csId && (a.status as string) !== 'deletion_pending');
    const numbers = classAss.map(a => {
      const match = (a.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    }).filter(n => n > 0);
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `Formative Assessment ${nextNum}`;
  };

  const openCreateModal = () => {
    const nextKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
    setCreateIdempotencyKey(nextKey);
    setErrorMessage(null);
    const nextTitle = computeNextTitleForSubject(formClassSubjectId);
    setFormTitle(nextTitle);
    setShowCreateModal(true);
  };
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);
  const [publishAudience, setPublishAudience] = useState<'all' | 'selected'>('all');
  const [eligibleStudents, setEligibleStudents] = useState<any[]>([]);
  const [loadingEligibleStudents, setLoadingEligibleStudents] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Edit Assessment State
  const [editingAssessment, setEditingAssessment] = useState<AssessmentDTO | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editMaxMarks, setEditMaxMarks] = useState<number>(50);
  const [editMaxFiles, setEditMaxFiles] = useState<number>(1);
  const [editAllowLate, setEditAllowLate] = useState<boolean>(false);
  const [editExtensionDeadline, setEditExtensionDeadline] = useState<string>('');
  const [editLatePenaltyMode, setEditLatePenaltyMode] = useState<'none' | 'fixed'>('none');
  const [editLatePenaltyMarks, setEditLatePenaltyMarks] = useState<number>(5);
  const [editPdfFileName, setEditPdfFileName] = useState<string | null>(null);
  const [editPdfFileSize, setEditPdfFileSize] = useState<number | null>(null);
  const [editPdfBase64, setEditPdfBase64] = useState<string | null>(null);
  const [editPdfError, setEditPdfError] = useState<string | null>(null);
  const [isReplacingPdf, setIsReplacingPdf] = useState<boolean>(false);
  const [editSubmissionsCount, setEditSubmissionsCount] = useState<number>(0);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Assessment State
  const [deletingAssessment, setDeletingAssessment] = useState<AssessmentDTO | null>(null);
  const [deleteCheckLoading, setDeleteCheckLoading] = useState<boolean>(false);
  const [deleteCheckResult, setDeleteCheckResult] = useState<any | null>(null);
  const [deletePassword, setDeletePassword] = useState<string>('');
  const [showDeletePassword, setShowDeletePassword] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteStatusMessage, setDeleteStatusMessage] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create Assessment Form State
  const [formTitle, setFormTitle] = useState('');
  const [formClassSubjectId, setFormClassSubjectId] = useState('c5100000-0000-0000-0000-000000000001');
  const [availableClassSubjects, setAvailableClassSubjects] = useState<any[]>([]);
  const [formInstructions, setFormInstructions] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formMaxMarks, setFormMaxMarks] = useState<number>(50);
  const [formMaxFiles, setFormMaxFiles] = useState<number>(1);
  const [formAllowLate, setFormAllowLate] = useState<boolean>(false);
  const [formExtensionDeadline, setFormExtensionDeadline] = useState<string>('');
  const [formLatePenaltyMode, setFormLatePenaltyMode] = useState<'none' | 'fixed'>('none');
  const [formLatePenaltyMarks, setFormLatePenaltyMarks] = useState<number>(5);
  const [formAssessmentTypes, setFormAssessmentTypes] = useState<AssessmentType[]>(['file_based']);

  // Selected Assessment - Draft Questions & Rubric Live State
  const [draftQuestions, setDraftQuestions] = useState<ManualQuestionItem[]>([]);
  const [draftRubricCriteria, setDraftRubricCriteria] = useState<RubricCriterionItem[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [inlineNewQPrompt, setInlineNewQPrompt] = useState('');
  const [editingDraftQId, setEditingDraftQId] = useState<string | null>(null);
  const [editingDraftQPrompt, setEditingDraftQPrompt] = useState<string>('');
  const [inlineNewCritTitle, setInlineNewCritTitle] = useState('');
  const [inlineNewCritDesc, setInlineNewCritDesc] = useState('');
  const [inlineNewCritMarks, setInlineNewCritMarks] = useState<number>(10);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);
  const [isSavingRubric, setIsSavingRubric] = useState(false);

  // Selected Assessment - Draft Quiz Live State
  const [draftQuizQuestions, setDraftQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isSavingQuiz, setIsSavingQuiz] = useState<boolean>(false);
  const [newQuizPrompt, setNewQuizPrompt] = useState<string>('');
  const [newQuizOptions, setNewQuizOptions] = useState<[string, string, string, string]>(['', '', '', '']);
  const [newQuizCorrectIndex, setNewQuizCorrectIndex] = useState<number>(0);
  const [newQuizMarks, setNewQuizMarks] = useState<number>(1);
  const [newQuizExplanation, setNewQuizExplanation] = useState<string>('');
  const [editingQuizQId, setEditingQuizQId] = useState<string | null>(null);
  const [editingQuizPrompt, setEditingQuizPrompt] = useState<string>('');
  const [editingQuizOptions, setEditingQuizOptions] = useState<[string, string, string, string]>(['', '', '', '']);
  const [editingQuizCorrectIndex, setEditingQuizCorrectIndex] = useState<number>(0);
  const [editingQuizMarks, setEditingQuizMarks] = useState<number>(1);
  const [editingQuizExplanation, setEditingQuizExplanation] = useState<string>('');

  // Selected Assessment - Draft Instruction File Live State
  const [draftInstructionFile, setDraftInstructionFile] = useState<{
    file: File;
    name: string;
    size: number;
    base64: string;
    mime_type: string;
  } | null>(null);
  const [draftInstructionError, setDraftInstructionError] = useState<string | null>(null);
  const [isSavingInstructionFile, setIsSavingInstructionFile] = useState<boolean>(false);
  const [draftMaxFiles, setDraftMaxFiles] = useState<number>(1);

  // Student Multi-file Answer Submission State
  const [studentAnswerFiles, setStudentAnswerFiles] = useState<Array<{ file: File; name: string; size: number; base64: string }>>([]);
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState<boolean>(false);

  // Student Manual Question Answers & Draft State
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  const [studentQuizAnswers, setStudentQuizAnswers] = useState<Record<string, string>>({});
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'unsaved'>('idle');
  const [draftLastSavedTime, setDraftLastSavedTime] = useState<Date | null>(null);
  const [unansweredQuestionIds, setUnansweredQuestionIds] = useState<string[]>([]);
  const [unansweredQuizQuestionIds, setUnansweredQuizQuestionIds] = useState<string[]>([]);
  const [isConfirmSubmitOpen, setIsConfirmSubmitOpen] = useState<boolean>(false);
  const [removeExistingUploadedFile, setRemoveExistingUploadedFile] = useState<boolean>(false);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Late Reports State
  const [lateReports, setLateReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);
  const [reportAssessmentFilter, setReportAssessmentFilter] = useState<string>('all');
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');

  const isTeacher = activeRole === 'subject_teacher' || activeRole === 'hod';
  const isStudent = activeRole === 'student';
  const isStaff = ['subject_teacher', 'class_teacher', 'proctor', 'hod'].includes(activeRole);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  useEffect(() => {
    if (isTeacher) {
      assessmentApi.getClassSubjectsForTeacher().then((csList) => {
        if (csList && csList.length > 0) {
          setAvailableClassSubjects(csList);
          setFormClassSubjectId(csList[0].id);
        } else {
          setAvailableClassSubjects([]);
        }
      }).catch(() => {
        setAvailableClassSubjects([]);
      });
    }
  }, [isTeacher, activeRole]);

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const { assessments: data, isOfflineFallback: fallback } = await assessmentApi.getAssessments();
      setIsOfflineFallback(fallback);
      if (isStudent) {
        const studentAssessments = data.filter(a => a.status === 'published' || a.status === 'closed');
        setAssessments(studentAssessments);
        loadStudentSubmissionStatuses(studentAssessments);
      } else {
        setAssessments(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [activeRole]);

  useEffect(() => {
    if (activeRole === 'proctor') {
      setActiveTab('submissions_report');
    } else if (initialTab) {
      setActiveTab(initialTab === 'late_reports' ? 'submissions_report' : initialTab);
    }
  }, [initialTab, activeRole]);

  const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId);

  // Submissions State
  const [assessmentSubmissions, setAssessmentSubmissions] = useState<SubmissionDTO[]>([]);
  const [submissionStatuses, setSubmissionStatuses] = useState<Record<string, {
    state: 'loading' | 'submitted' | 'not_submitted' | 'error';
    submission?: SubmissionDTO | null;
  }>>({});

  const loadStudentSubmissionStatuses = async (assessmentList: AssessmentDTO[]) => {
    if (isTeacher || assessmentList.length === 0) return;

    setSubmissionStatuses(prev => {
      const next = { ...prev };
      for (const ass of assessmentList) {
        if (!next[ass.id]) {
          next[ass.id] = { state: 'loading' };
        }
      }
      return next;
    });

    await Promise.all(
      assessmentList.map(async (ass) => {
        try {
          const res = await submissionApi.getStudentSubmissionStatus(ass.id);
          setSubmissionStatuses(prev => ({
            ...prev,
            [ass.id]: {
              state: res.state,
              submission: res.submissions?.[0] || null
            }
          }));
        } catch {
          setSubmissionStatuses(prev => ({
            ...prev,
            [ass.id]: { state: 'error' }
          }));
        }
      })
    );
  };

  const renderStudentSubmissionBadge = (assessmentId: string) => {
    const statusInfo = submissionStatuses[assessmentId];
    if (!statusInfo || statusInfo.state === 'loading') {
      return (
        <span 
          className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border bg-academic-surface text-academic-muted border-academic-border"
          role="status"
          aria-label="Checking submission status"
        >
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-academic-muted" />
          <span>Checking Status...</span>
        </span>
      );
    }

    if (statusInfo.state === 'error') {
      return (
        <StatusBadge 
          label="Status Unavailable" 
          variant="neutral" 
          title="Could not verify submission status from server"
        />
      );
    }

    if (statusInfo.state === 'submitted') {
      return (
        <StatusBadge 
          label="Submitted" 
          variant="submitted" 
        />
      );
    }

    return (
      <StatusBadge 
        label="Not Submitted" 
        variant="not_submitted" 
      />
    );
  };

  const loadStudentAnswers = useCallback(async (assessmentId: string, currentSub?: SubmissionDTO | null) => {
    if (!isStudent) return;
    try {
      const serverDraft = await submissionApi.getDraft(assessmentId);
      if (serverDraft && Array.isArray(serverDraft.answers) && serverDraft.answers.length > 0) {
        const map: Record<string, string> = {};
        serverDraft.answers.forEach((a: any) => {
          if (a.question_id) map[a.question_id] = a.answer_text;
          if (a.question_order) map[`q-${a.question_order}`] = a.answer_text;
        });
        setStudentAnswers(map);
        setDraftSaveStatus('saved');
        if (serverDraft.updated_at) {
          setDraftLastSavedTime(new Date(serverDraft.updated_at));
        }
        return;
      }
    } catch {
      // ignore draft fetch failure, fallback to submission or local storage
    }

    if (currentSub?.active_version) {
      if (currentSub.active_version.answers && currentSub.active_version.answers.length > 0) {
        const map: Record<string, string> = {};
        currentSub.active_version.answers.forEach((a: any) => {
          if (a.question_id) map[a.question_id] = a.answer_text;
          if (a.question_order) map[`q-${a.question_order}`] = a.answer_text;
        });
        setStudentAnswers(map);
      }
      if (currentSub.active_version.quiz_answers && currentSub.active_version.quiz_answers.length > 0) {
        const qMap: Record<string, string> = {};
        currentSub.active_version.quiz_answers.forEach((qa: any) => {
          if (qa.quiz_question_id && qa.selected_option_id) {
            qMap[qa.quiz_question_id] = qa.selected_option_id;
          }
        });
        setStudentQuizAnswers(qMap);
      }
      setDraftSaveStatus('saved');
      if (currentSub.active_version.uploaded_at) {
        setDraftLastSavedTime(new Date(currentSub.active_version.uploaded_at));
      }
      return;
    }

    try {
      const cached = localStorage.getItem(`acadassess_answers_${assessmentId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setStudentAnswers(parsed);
        }
      }
      const cachedQuiz = localStorage.getItem(`acadassess_quiz_answers_${assessmentId}`);
      if (cachedQuiz) {
        const parsedQuiz = JSON.parse(cachedQuiz);
        if (parsedQuiz && typeof parsedQuiz === 'object') {
          setStudentQuizAnswers(parsedQuiz);
        }
      }
      if (cached || cachedQuiz) {
        setDraftSaveStatus('unsaved');
        return;
      }
    } catch {
      // ignore
    }

    setStudentAnswers({});
    setStudentQuizAnswers({});
    setDraftSaveStatus('idle');
  }, [isStudent]);

  const loadSubmissions = async (assessmentId: string) => {
    try {
      const subs = await submissionApi.getSubmissionsForAssessment(assessmentId);
      setAssessmentSubmissions(subs);
      if (isStudent) {
        setSubmissionStatuses(prev => ({
          ...prev,
          [assessmentId]: {
            state: subs.length > 0 ? 'submitted' : 'not_submitted',
            submission: subs[0] || null
          }
        }));
        loadStudentAnswers(assessmentId, subs[0] || null);
      }
    } catch {
      if (isStudent) {
        setSubmissionStatuses(prev => ({
          ...prev,
          [assessmentId]: { state: 'error' }
        }));
      }
    }
  };

  const loadAssessmentDetails = useCallback(async (assId: string) => {
    setIsLoadingDetails(true);
    setDetailsError(null);
    try {
      const full = await assessmentApi.getAssessment(assId);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
        setDraftQuestions(full.questions || []);
        setDraftRubricCriteria(full.rubric?.criteria || []);
        setDraftQuizQuestions(full.quiz_questions || []);
        if (full.max_files) {
          setDraftMaxFiles(full.max_files);
        }
      }
    } catch (err: any) {
      console.error('Failed to load full assessment details:', err);
      setDetailsError(err.message || 'Failed to load assignment details.');
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAssessmentId) {
      // 1. Seed immediately from current in-memory assessment object if available
      const existing = assessments.find(a => a.id === selectedAssessmentId);
      if (existing) {
        if (Array.isArray(existing.questions) && existing.questions.length > 0) {
          setDraftQuestions(existing.questions);
        } else {
          setDraftQuestions([]);
        }
        if (existing.rubric?.criteria && Array.isArray(existing.rubric.criteria) && existing.rubric.criteria.length > 0) {
          setDraftRubricCriteria(existing.rubric.criteria);
        } else {
          setDraftRubricCriteria([]);
        }
        if (Array.isArray(existing.quiz_questions) && existing.quiz_questions.length > 0) {
          setDraftQuizQuestions(existing.quiz_questions);
        } else {
          setDraftQuizQuestions([]);
        }
        if (existing.max_files) {
          setDraftMaxFiles(existing.max_files);
        }
      } else {
        setDraftQuestions([]);
        setDraftRubricCriteria([]);
        setDraftQuizQuestions([]);
      }

      // 2. Fetch authoritative details, submissions and student answers
      loadSubmissions(selectedAssessmentId);
      loadAssessmentDetails(selectedAssessmentId);
      loadStudentAnswers(selectedAssessmentId);
    } else {
      setDraftQuestions([]);
      setDraftRubricCriteria([]);
      setDraftQuizQuestions([]);
      setDetailsError(null);
      setStudentAnswers({});
      setStudentQuizAnswers({});
      setDraftSaveStatus('idle');
      setUnansweredQuestionIds([]);
      setUnansweredQuizQuestionIds([]);
      setRemoveExistingUploadedFile(false);
    }
  }, [selectedAssessmentId, loadAssessmentDetails, loadStudentAnswers]);

  const saveDraftAnswers = async (
    answersToSave: Record<string, string>,
    quizAnswersToSave: Record<string, string> = studentQuizAnswers
  ) => {
    if (!selectedAssessmentId) return;
    setDraftSaveStatus('saving');
    try {
      const formatted = Object.entries(answersToSave).map(([key, val], idx) => ({
        question_id: key,
        question_order: idx + 1,
        answer_text: val
      }));
      const formattedQuiz = Object.entries(quizAnswersToSave).map(([qid, oid]) => ({
        quiz_question_id: qid,
        selected_option_id: oid
      }));

      await submissionApi.saveDraft({
        assessment_id: selectedAssessmentId,
        answers: formatted,
        quiz_answers: formattedQuiz,
        section_statuses: {
          manual_questions: formatted.length > 0 ? 'draft' : 'pending',
          quiz: formattedQuiz.length > 0 ? 'draft' : 'pending'
        }
      });
      setDraftSaveStatus('saved');
      setDraftLastSavedTime(new Date());
    } catch (err: any) {
      console.warn('Failed to save draft:', err);
      setDraftSaveStatus('error');
    }
  };

  const handleSelectQuizOption = (questionId: string, optionId: string) => {
    const updated = { ...studentQuizAnswers, [questionId]: optionId };
    setStudentQuizAnswers(updated);
    setUnansweredQuizQuestionIds(prev => prev.filter(id => id !== questionId));
    setDraftSaveStatus('unsaved');

    if (selectedAssessmentId) {
      try {
        localStorage.setItem(`acadassess_quiz_answers_${selectedAssessmentId}`, JSON.stringify(updated));
      } catch {}

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        saveDraftAnswers(studentAnswers, updated);
      }, 1500);
    }
  };

  const handleClearQuizOption = (questionId: string) => {
    const updated = { ...studentQuizAnswers };
    delete updated[questionId];
    setStudentQuizAnswers(updated);
    setDraftSaveStatus('unsaved');

    if (selectedAssessmentId) {
      try {
        localStorage.setItem(`acadassess_quiz_answers_${selectedAssessmentId}`, JSON.stringify(updated));
      } catch {}

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        saveDraftAnswers(studentAnswers, updated);
      }, 1500);
    }
  };

  const handleAnswerChange = (qKey: string, text: string) => {
    const updated = { ...studentAnswers, [qKey]: text };
    setStudentAnswers(updated);
    setDraftSaveStatus('unsaved');
    setUnansweredQuestionIds(prev => prev.filter(k => k !== qKey));

    if (selectedAssessmentId) {
      try {
        localStorage.setItem(`acadassess_answers_${selectedAssessmentId}`, JSON.stringify(updated));
      } catch {}

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        saveDraftAnswers(updated);
      }, 1500);
    }
  };

  const handleSaveDraftManual = async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    await saveDraftAnswers(studentAnswers);
  };

  // Load Late Submissions Report
  const loadLateReports = async (assId?: string) => {
    setLoadingReports(true);
    try {
      const data = await submissionApi.getLateSubmissionsReport(assId && assId !== 'all' ? assId : undefined);
      setLateReports(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load late submissions report');
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'submissions_report') {
      loadLateReports(reportAssessmentFilter);
    }
  }, [activeTab, reportAssessmentFilter]);


  // Handle Document-Based Assessment Creation
  const formatIsoForInput = (iso?: string | null): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const openEditModal = async (assessment: AssessmentDTO) => {
    setEditingAssessment(assessment);
    setEditTitle(assessment.title || '');
    setEditInstructions(assessment.instructions || '');
    setEditDeadline(formatIsoForInput(assessment.deadline_at));
    setEditMaxMarks(assessment.max_marks || 50);
    setEditMaxFiles(assessment.max_files || 1);
    setEditAllowLate(Boolean(assessment.allow_late));
    setEditExtensionDeadline(formatIsoForInput(assessment.extension_deadline_at));
    setEditLatePenaltyMode(assessment.late_penalty_mode || 'none');
    setEditLatePenaltyMarks(assessment.late_penalty_marks || 5);
    setEditPdfFileName(assessment.document_filename || null);
    setEditPdfFileSize(assessment.document_size_bytes || null);
    setEditPdfBase64(null);
    setEditPdfError(null);
    setIsReplacingPdf(false);
    setEditError(null);
    setEditSubmissionsCount(0);

    try {
      const check = await assessmentApi.checkAssessmentDeletion(assessment.id);
      setEditSubmissionsCount(check.submissions_count || 0);
    } catch {}
  };

  const handleEditPdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditPdfError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setEditPdfError('Only PDF files (.pdf) are accepted for the assignment document.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setEditPdfError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 20.00 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
      try {
        const binaryHeader = atob(base64.substring(0, 16));
        if (!binaryHeader.startsWith('%PDF-')) {
          setEditPdfError('Invalid PDF file signature. The file is not a valid PDF.');
          return;
        }
      } catch {
        setEditPdfError('Failed to read file signature.');
        return;
      }
      setEditPdfFileName(file.name);
      setEditPdfFileSize(file.size);
      setEditPdfBase64(base64);
      setIsReplacingPdf(true);
    };
    reader.onerror = () => {
      setEditPdfError('Failed to read file from disk.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEditAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssessment) return;
    setEditError(null);

    if (!editTitle.trim()) {
      setEditError('Assessment title is required.');
      return;
    }

    if (!editDeadline) {
      setEditError('Submission deadline is required.');
      return;
    }

    const deadlineDate = new Date(editDeadline);
    if (isNaN(deadlineDate.getTime())) {
      setEditError('Valid submission deadline is required.');
      return;
    }

    if (editAllowLate) {
      if (!editExtensionDeadline) {
        setEditError('Extension deadline is required when late submissions are enabled.');
        return;
      }
      const extensionDate = new Date(editExtensionDeadline);
      if (extensionDate.getTime() <= deadlineDate.getTime()) {
        setEditError('Extension deadline must be later than the submission deadline.');
        return;
      }
    }

    if (editAllowLate && editLatePenaltyMode === 'fixed' && editLatePenaltyMarks > editMaxMarks) {
      setEditError('Late penalty marks cannot exceed maximum assessment marks.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const updatePayload: any = {
        title: editTitle.trim(),
        instructions: editInstructions.trim() || 'Refer to the uploaded Assignment PDF for questions, instructions, and rubric.',
        deadline_at: deadlineDate.toISOString(),
        max_marks: Number(editMaxMarks || 50),
        max_files: Number(editMaxFiles || 1),
        allow_late: editAllowLate,
        extension_deadline_at: editAllowLate && editExtensionDeadline ? new Date(editExtensionDeadline).toISOString() : null,
        late_penalty_mode: editAllowLate ? editLatePenaltyMode : 'none',
        late_penalty_marks: editAllowLate && editLatePenaltyMode === 'fixed' ? Number(editLatePenaltyMarks || 5) : 0
      };

      if (isReplacingPdf && editPdfBase64 && editPdfFileName) {
        updatePayload.document_base64 = editPdfBase64;
        updatePayload.document_filename = editPdfFileName;
      }

      const result = await assessmentApi.updateAssessment(editingAssessment.id, updatePayload);

      setActionMessage(`Assessment "${result.assessment.title}" updated successfully.`);
      setEditingAssessment(null);
      await loadAssessments();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update assessment.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openDeleteModal = async (assessment: AssessmentDTO) => {
    setDeletingAssessment(assessment);
    setDeleteCheckLoading(true);
    setDeleteError(null);
    setDeleteCheckResult(null);
    setDeletePassword('');
    setShowDeletePassword(false);
    setDeleteStatusMessage('');

    try {
      const check = await assessmentApi.checkAssessmentDeletion(assessment.id);
      setDeleteCheckResult(check);
    } catch (err: any) {
      setDeleteCheckResult({
        can_delete: false,
        submissions_count: 0,
        evaluations_count: 0,
        is_published: false,
        reason: err.message || 'Failed to verify deletion status.'
      });
    } finally {
      setDeleteCheckLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAssessment) return;
    if (!deletePassword.trim()) {
      setDeleteError('Please enter your institutional login password to confirm permanent deletion.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setDeleteStatusMessage('Verifying institutional password...');

    try {
      // 1. Re-authenticate teacher with Supabase Auth
      const reauth = await authApi.confirmPassword(deletePassword.trim(), deletingAssessment.id);
      if (!reauth?.reauth_token) {
        throw new Error('Password verification failed. Please try again.');
      }

      // 2. Perform staged permanent deletion with reauth token
      setDeleteStatusMessage('Deleting assignment, student submissions, and storage files...');
      const res = await assessmentApi.deleteAssessment(deletingAssessment.id, reauth.reauth_token);

      setActionMessage(res.message || `Assessment "${deletingAssessment.title}" was permanently deleted.`);
      if (selectedAssessmentId === deletingAssessment.id) {
        setSelectedAssessmentId(null);
      }
      setDeletingAssessment(null);
      setDeletePassword('');
      await loadAssessments();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete assessment.');
    } finally {
      setIsDeleting(false);
      setDeleteStatusMessage('');
    }
  };

  // Draft Rubric Sum
  const draftRubricSum = useMemo(() => {
    return draftRubricCriteria.reduce((sum, c) => sum + Number(c.max_marks || c.max_score || 0), 0);
  }, [draftRubricCriteria]);

  // Live Draft Assessment Update Handlers
  const handleSaveDraftQuestions = async (updatedQuestions: ManualQuestionItem[]) => {
    if (!selectedAssessment) return;
    setIsSavingQuestions(true);
    try {
      const payloadQuestions = updatedQuestions.map((q, idx) => ({
        id: q.id,
        prompt: q.prompt,
        display_order: idx + 1
      }));
      await assessmentApi.updateAssessment(selectedAssessment.id, {
        questions: payloadQuestions
      });
      setActionMessage('Questions updated successfully.');
      const full = await assessmentApi.getAssessment(selectedAssessment.id);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
        setDraftQuestions(full.questions || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update questions.');
    } finally {
      setIsSavingQuestions(false);
    }
  };

  const handleAddDraftQuestion = async () => {
    if (!inlineNewQPrompt.trim()) return;
    const updated = [
      ...draftQuestions,
      {
        prompt: inlineNewQPrompt.trim(),
        display_order: draftQuestions.length + 1
      }
    ];
    setDraftQuestions(updated);
    setInlineNewQPrompt('');
    await handleSaveDraftQuestions(updated);
  };

  const handleRemoveDraftQuestion = async (index: number) => {
    const updated = draftQuestions.filter((_, i) => i !== index).map((q, idx) => ({ ...q, display_order: idx + 1 }));
    setDraftQuestions(updated);
    if (editingDraftQId) {
      setEditingDraftQId(null);
      setEditingDraftQPrompt('');
    }
    await handleSaveDraftQuestions(updated);
  };

  const handleMoveDraftQuestion = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftQuestions.length) return;
    const copy = [...draftQuestions];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    const updated = copy.map((q, idx) => ({ ...q, display_order: idx + 1 }));
    setDraftQuestions(updated);
    await handleSaveDraftQuestions(updated);
  };

  const handleStartEditDraftQuestion = (q: ManualQuestionItem) => {
    setEditingDraftQId(q.id || `temp-${q.display_order}`);
    setEditingDraftQPrompt(q.prompt);
  };

  const handleSaveEditDraftQuestion = async (index: number) => {
    if (!editingDraftQPrompt.trim()) return;
    const updated = draftQuestions.map((q, idx) =>
      idx === index ? { ...q, prompt: editingDraftQPrompt.trim() } : q
    );
    setDraftQuestions(updated);
    setEditingDraftQId(null);
    setEditingDraftQPrompt('');
    await handleSaveDraftQuestions(updated);
  };

  const handleSaveDraftRubric = async (updatedCriteria: RubricCriterionItem[]) => {
    if (!selectedAssessment) return;
    setIsSavingRubric(true);
    try {
      await assessmentApi.updateAssessment(selectedAssessment.id, {
        rubric: {
          title: selectedAssessment.rubric?.title || 'Assignment Evaluation Rubric',
          criteria: updatedCriteria.map((c, idx) => ({
            id: c.id,
            title: (c.title || c.criterion_title || '').trim(),
            criterion_title: (c.criterion_title || c.title || '').trim(),
            description: c.description || '',
            display_order: c.display_order || (idx + 1),
            max_marks: Number(c.max_marks || c.max_score || 10)
          }))
        }
      });
      setActionMessage('Rubric criteria updated successfully.');
      const full = await assessmentApi.getAssessment(selectedAssessment.id);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
        setDraftRubricCriteria(full.rubric?.criteria || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update rubric.');
    } finally {
      setIsSavingRubric(false);
    }
  };

  const handleAddDraftCriterion = async () => {
    if (!inlineNewCritTitle.trim()) return;
    const updated = [
      ...draftRubricCriteria,
      {
        criterion_title: inlineNewCritTitle.trim(),
        description: inlineNewCritDesc.trim(),
        max_marks: Number(inlineNewCritMarks || 10)
      }
    ];
    setDraftRubricCriteria(updated);
    setInlineNewCritTitle('');
    setInlineNewCritDesc('');
    await handleSaveDraftRubric(updated);
  };

  const handleRemoveDraftCriterion = async (index: number) => {
    const updated = draftRubricCriteria.filter((_, i) => i !== index);
    setDraftRubricCriteria(updated);
    await handleSaveDraftRubric(updated);
  };

  const handleResetDraftRubricToTemplate = async () => {
    setDraftRubricCriteria(DEFAULT_RUBRIC_CRITERIA);
    await handleSaveDraftRubric(DEFAULT_RUBRIC_CRITERIA);
  };

  // Draft Quiz Question Handlers
  const handleSaveDraftQuizQuestions = async (updatedQuizQuestions: QuizQuestion[]) => {
    if (!selectedAssessment) return;
    setIsSavingQuiz(true);
    setErrorMessage(null);
    try {
      const payload = updatedQuizQuestions.map((q, idx) => ({
        id: q.id,
        display_order: idx + 1,
        question_text: q.question_text || (q as any).prompt,
        marks: q.marks,
        options: q.options,
        correct_option_id: q.correct_option_id,
        explanation: q.explanation || null
      }));
      await assessmentApi.updateAssessment(selectedAssessment.id, {
        quiz_questions: payload
      });
      setActionMessage('Quiz questions saved successfully.');
      const full = await assessmentApi.getAssessment(selectedAssessment.id);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
        setDraftQuizQuestions(full.quiz_questions || []);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update quiz questions.');
    } finally {
      setIsSavingQuiz(false);
    }
  };

  const handleAddDraftQuizQuestion = async () => {
    if (!newQuizPrompt.trim()) {
      setErrorMessage('Please enter the quiz question prompt.');
      return;
    }
    for (let i = 0; i < 4; i++) {
      if (!newQuizOptions[i].trim()) {
        setErrorMessage(`Please provide text for Option ${String.fromCharCode(65 + i)}.`);
        return;
      }
    }

    const optIds = ['opt-a', 'opt-b', 'opt-c', 'opt-d'].map((prefix, idx) => 
      `${prefix}-${Date.now()}-${idx}`
    );
    const options: QuizOption[] = [
      { id: optIds[0], text: newQuizOptions[0].trim() },
      { id: optIds[1], text: newQuizOptions[1].trim() },
      { id: optIds[2], text: newQuizOptions[2].trim() },
      { id: optIds[3], text: newQuizOptions[3].trim() }
    ];

    const newQuestion: QuizQuestion = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `qq-${Date.now()}`,
      assessment_id: selectedAssessment?.id || '',
      display_order: draftQuizQuestions.length + 1,
      question_text: newQuizPrompt.trim(),
      marks: Math.max(1, Number(newQuizMarks) || 1),
      options,
      correct_option_id: optIds[newQuizCorrectIndex] || optIds[0],
      explanation: newQuizExplanation.trim() || null
    };

    const updated = [...draftQuizQuestions, newQuestion];
    setDraftQuizQuestions(updated);
    setNewQuizPrompt('');
    setNewQuizOptions(['', '', '', '']);
    setNewQuizCorrectIndex(0);
    setNewQuizMarks(1);
    setNewQuizExplanation('');
    await handleSaveDraftQuizQuestions(updated);
  };

  const handleRemoveDraftQuizQuestion = async (index: number) => {
    const updated = draftQuizQuestions.filter((_, i) => i !== index).map((q, idx) => ({ ...q, display_order: idx + 1 }));
    setDraftQuizQuestions(updated);
    if (editingQuizQId) {
      setEditingQuizQId(null);
      setEditingQuizPrompt('');
    }
    await handleSaveDraftQuizQuestions(updated);
  };

  const handleMoveDraftQuizQuestion = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftQuizQuestions.length) return;
    const copy = [...draftQuizQuestions];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    const updated = copy.map((q, idx) => ({ ...q, display_order: idx + 1 }));
    setDraftQuizQuestions(updated);
    await handleSaveDraftQuizQuestions(updated);
  };

  const handleStartEditDraftQuizQuestion = (q: QuizQuestion) => {
    setEditingQuizQId(q.id);
    setEditingQuizPrompt(q.question_text || (q as any).prompt || '');
    const opts: [string, string, string, string] = [
      q.options[0]?.text || '',
      q.options[1]?.text || '',
      q.options[2]?.text || '',
      q.options[3]?.text || ''
    ];
    setEditingQuizOptions(opts);
    const cIdx = q.options.findIndex(o => o.id === q.correct_option_id);
    setEditingQuizCorrectIndex(cIdx >= 0 ? cIdx : 0);
    setEditingQuizMarks(q.marks || 1);
    setEditingQuizExplanation(q.explanation || '');
  };

  const handleSaveEditDraftQuizQuestion = async (index: number) => {
    if (!editingQuizPrompt.trim()) return;
    for (let i = 0; i < 4; i++) {
      if (!editingQuizOptions[i].trim()) {
        setErrorMessage(`Please provide text for Option ${String.fromCharCode(65 + i)}.`);
        return;
      }
    }
    const currentQ = draftQuizQuestions[index];
    if (!currentQ) return;

    const optIds = currentQ.options && currentQ.options.length === 4
      ? currentQ.options.map(o => o.id)
      : ['opt-a', 'opt-b', 'opt-c', 'opt-d'].map((prefix, idx) => `${prefix}-${Date.now()}-${idx}`);

    const options: QuizOption[] = [
      { id: optIds[0], text: editingQuizOptions[0].trim() },
      { id: optIds[1], text: editingQuizOptions[1].trim() },
      { id: optIds[2], text: editingQuizOptions[2].trim() },
      { id: optIds[3], text: editingQuizOptions[3].trim() }
    ];

    const updated = draftQuizQuestions.map((q, idx) =>
      idx === index
        ? {
            ...q,
            question_text: editingQuizPrompt.trim(),
            options,
            correct_option_id: optIds[editingQuizCorrectIndex] || optIds[0],
            marks: Math.max(1, Number(editingQuizMarks) || 1),
            explanation: editingQuizExplanation.trim() || null
          }
        : q
    );
    setDraftQuizQuestions(updated);
    setEditingQuizQId(null);
    setEditingQuizPrompt('');
    await handleSaveDraftQuizQuestions(updated);
  };

  // Draft Instruction File Handlers
  const handleInstructionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftInstructionError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExts = ['.pdf', '.ppt', '.pptx', '.doc', '.docx'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExts.includes(ext)) {
      setDraftInstructionError('Only PDF (.pdf), PowerPoint (.ppt, .pptx), and Word (.doc, .docx) files are supported.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setDraftInstructionError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 20.00 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
      let mime = file.type;
      if (!mime) {
        if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.ppt') mime = 'application/vnd.ms-powerpoint';
        else if (ext === '.pptx') mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        else if (ext === '.doc') mime = 'application/msword';
        else if (ext === '.docx') mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      setDraftInstructionFile({
        file,
        name: file.name,
        size: file.size,
        base64,
        mime_type: mime || 'application/octet-stream'
      });
    };
    reader.onerror = () => setDraftInstructionError('Failed to read file.');
    reader.readAsDataURL(file);
  };

  const handleSaveInstructionFile = async () => {
    if (!selectedAssessment) return;
    setIsSavingInstructionFile(true);
    setErrorMessage(null);
    try {
      await assessmentApi.updateAssessment(selectedAssessment.id, {
        document_base64: draftInstructionFile ? draftInstructionFile.base64 : undefined,
        document_filename: draftInstructionFile ? draftInstructionFile.name : undefined,
        max_files: draftMaxFiles,
        instruction_files: draftInstructionFile ? [{
          file_name: draftInstructionFile.name,
          original_name: draftInstructionFile.name,
          file_size_bytes: draftInstructionFile.size,
          mime_type: draftInstructionFile.mime_type,
          file_base64: draftInstructionFile.base64
        }] : undefined
      });
      setDraftInstructionFile(null);
      setActionMessage('File-based instruction settings updated successfully.');
      const full = await assessmentApi.getAssessment(selectedAssessment.id);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save instruction file.');
    } finally {
      setIsSavingInstructionFile(false);
    }
  };

  const handleRemoveInstructionFile = async () => {
    if (!selectedAssessment) return;
    setIsSavingInstructionFile(true);
    setErrorMessage(null);
    try {
      await assessmentApi.updateAssessment(selectedAssessment.id, {
        document_base64: '',
        document_filename: '',
        instruction_files: []
      });
      setDraftInstructionFile(null);
      setActionMessage('Instruction file removed.');
      const full = await assessmentApi.getAssessment(selectedAssessment.id);
      if (full) {
        setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove instruction file.');
    } finally {
      setIsSavingInstructionFile(false);
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCreateRef.current) return;
    setErrorMessage(null);

    const effectiveTitle = formTitle.trim() || computeNextTitleForSubject(formClassSubjectId);

    if (!formDeadline) {
      setErrorMessage('Submission deadline is required.');
      return;
    }

    const deadlineDate = new Date(formDeadline);
    if (deadlineDate.getTime() <= Date.now()) {
      setErrorMessage('Submission deadline must be in the future.');
      return;
    }

    if (formAllowLate) {
      if (!formExtensionDeadline) {
        setErrorMessage('Extension deadline is required when late submissions are enabled.');
        return;
      }
      const extensionDate = new Date(formExtensionDeadline);
      if (extensionDate.getTime() <= deadlineDate.getTime()) {
        setErrorMessage('Extension deadline must be later than the original submission deadline.');
        return;
      }
    }

    if (formAssessmentTypes.length === 0) {
      setErrorMessage('Please select at least one assessment type (File-Based, Manual Questions, or Quiz).');
      return;
    }

    isSubmittingCreateRef.current = true;
    setIsCreating(true);
    setCreationStage('Creating draft assessment...');

    try {
      const hasRubricType = formAssessmentTypes.includes('file_based') || formAssessmentTypes.includes('manual_questions');
      const rubricPayload = hasRubricType
        ? {
            title: 'Assignment Evaluation Rubric',
            criteria: DEFAULT_RUBRIC_CRITERIA.map((c, idx) => ({
              id: c.id,
              title: (c.title || c.criterion_title || '').trim(),
              criterion_title: (c.criterion_title || c.title || '').trim(),
              description: c.description?.trim() || '',
              display_order: idx + 1,
              max_marks: Number(c.max_marks || (c as any).max_score || 10)
            }))
          }
        : undefined;

      const newAssessment = await assessmentApi.createAssessment({
        class_subject_id: formClassSubjectId,
        title: effectiveTitle,
        instructions: formInstructions.trim() || 'Follow the instructions provided for the assessment sections below.',
        deadline_at: deadlineDate.toISOString(),
        max_marks: Number(formMaxMarks || 50),
        idempotency_key: createIdempotencyKey,
        assessment_types: formAssessmentTypes,
        max_files: Number(formMaxFiles || 1),
        allow_late: formAllowLate,
        extension_deadline_at: formAllowLate && formExtensionDeadline ? new Date(formExtensionDeadline).toISOString() : undefined,
        late_penalty_mode: formAllowLate ? formLatePenaltyMode : 'none',
        late_penalty_marks: formAllowLate && formLatePenaltyMode === 'fixed' ? Number(formLatePenaltyMarks || 5) : 0,
        rubric: rubricPayload
      });

      setCreationStage('Configuring assessment workspace...');
      setActionMessage(`Assessment "${newAssessment.title}" created successfully in draft status.`);
      setShowCreateModal(false);
      setFormTitle('');
      setFormInstructions('');
      setFormDeadline('');
      setFormExtensionDeadline('');
      setFormAllowLate(false);
      setFormLatePenaltyMode('none');
      setFormLatePenaltyMarks(5);
      setFormMaxFiles(1);
      setFormMaxMarks(50);
      setFormAssessmentTypes(['file_based']);

      // Generate fresh idempotency key
      const nextKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'idem-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
      setCreateIdempotencyKey(nextKey);

      // Select newly created assessment and switch to its primary content tab
      setAssessments(prev => [newAssessment, ...prev.filter(a => a.id !== newAssessment.id)]);
      setSelectedAssessmentId(newAssessment.id);
      if (formAssessmentTypes.includes('file_based')) {
        setActiveTab('file_based');
      } else if (formAssessmentTypes.includes('manual_questions')) {
        setActiveTab('questions');
      } else {
        setActiveTab('quiz');
      }

      loadAssessments().catch(console.error);
    } catch (err: any) {
      // NOTE: Form state and createIdempotencyKey are preserved so that user can retry safely
      setErrorMessage(err.message || 'Failed to create assessment.');
    } finally {
      isSubmittingCreateRef.current = false;
      setIsCreating(false);
      setCreationStage(null);
    }
  };

  // Student Answer File Selector (Multi-file PDF, PPT, PPTX)
  const handleSelectStudentAnswerFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    const maxAllowed = selectedAssessment?.max_files || 1;

    if (studentAnswerFiles.length + newFiles.length > maxAllowed) {
      setErrorMessage(`Cannot exceed the maximum limit of ${maxAllowed} file(s) for this assessment.`);
      return;
    }

    const allowedExts = ['.pdf', '.ppt', '.pptx', '.doc', '.docx'];
    for (const f of newFiles) {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      if (!allowedExts.includes(ext)) {
        setErrorMessage(`Invalid file format: ${f.name}. Only PDF (.pdf), PowerPoint (.ppt, .pptx), and Word (.doc, .docx) are accepted.`);
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        setErrorMessage(`File ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) exceeds 20.00 MB limit.`);
        return;
      }
    }

    Promise.all(newFiles.map(file => {
      return new Promise<{ file: File; name: string; size: number; base64: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const resultStr = reader.result as string;
          const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
          resolve({ file, name: file.name, size: file.size, base64 });
        };
        reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
        reader.readAsDataURL(file);
      });
    })).then(processed => {
      const currentTotal = studentAnswerFiles.reduce((sum, f) => sum + f.size, 0);
      const newTotal = processed.reduce((sum, f) => sum + f.size, 0);
      if (currentTotal + newTotal > 20 * 1024 * 1024) {
        setErrorMessage('Total submission size cannot exceed 20.00 MB.');
        return;
      }
      setStudentAnswerFiles(prev => [...prev, ...processed]);
    }).catch(err => {
      setErrorMessage(err.message || 'Error processing selected files.');
    });
  };

  const handleRemoveStudentAnswerFile = (index: number) => {
    setStudentAnswerFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleValidateAndOpenSubmitConfirm = () => {
    if (!selectedAssessment) return;
    setErrorMessage(null);

    const types = selectedAssessment.assessment_types && selectedAssessment.assessment_types.length > 0
      ? selectedAssessment.assessment_types
      : (selectedAssessment.document_storage_key ? ['file_based', 'manual_questions'] : ['manual_questions']);

    // 1. File-Based Validation: at least 1 file uploaded or retained from existing version
    if (types.includes('file_based')) {
      const activeSub = assessmentSubmissions[0];
      const hasExistingFiles = Boolean(
        activeSub && 
        !removeExistingUploadedFile && 
        ((activeSub.active_version?.files && activeSub.active_version.files.length > 0) || activeSub.active_version?.storage_path || activeSub.active_version?.original_name)
      );
      if (studentAnswerFiles.length === 0 && !hasExistingFiles) {
        setErrorMessage('File-Based Assessment requires at least one answer file (PDF, PPT, PPTX, DOC, DOCX) to be uploaded.');
        return;
      }
    }

    // 2. Manual Questions Validation: all questions must be answered
    if (types.includes('manual_questions') && draftQuestions.length > 0) {
      const missingKeys: string[] = [];
      for (let i = 0; i < draftQuestions.length; i++) {
        const q = draftQuestions[i];
        const key = q.id || `q-${q.display_order || i + 1}`;
        const answer = studentAnswers[key] || (q.id ? studentAnswers[q.id] : undefined) || studentAnswers[`q-${q.display_order || i + 1}`];
        if (!answer || !answer.trim()) {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        setUnansweredQuestionIds(missingKeys);
        setErrorMessage(
          `Please answer all ${draftQuestions.length} manual questions before submitting (${missingKeys.length} question(s) remaining).`
        );
        return;
      }
    }

    // 3. Quiz Validation: all quiz questions must have an option selected
    if (types.includes('quiz') && draftQuizQuestions.length > 0) {
      const missingQuizIds: string[] = [];
      for (const qq of draftQuizQuestions) {
        if (!studentQuizAnswers[qq.id]) {
          missingQuizIds.push(qq.id);
        }
      }
      if (missingQuizIds.length > 0) {
        setUnansweredQuizQuestionIds(missingQuizIds);
        setErrorMessage(
          `Please answer all ${draftQuizQuestions.length} quiz questions before submitting (${missingQuizIds.length} question(s) remaining).`
        );
        return;
      }
    }

    setUnansweredQuestionIds([]);
    setUnansweredQuizQuestionIds([]);
    setIsConfirmSubmitOpen(true);
  };

  const handleConfirmFinalSubmission = async () => {
    if (!selectedAssessment) return;
    setIsSubmittingAnswers(true);
    setErrorMessage(null);
    try {
      const formattedAnswers = draftQuestions.map((q, idx) => {
        const key = q.id || `q-${q.display_order || idx + 1}`;
        const text = studentAnswers[key] || (q.id ? studentAnswers[q.id] : undefined) || studentAnswers[`q-${q.display_order || idx + 1}`] || '';
        return {
          question_id: q.id || key,
          question_order: q.display_order || (idx + 1),
          answer_text: text.trim()
        };
      });

      const formattedQuizAnswers = Object.entries(studentQuizAnswers).map(([qid, oid]) => ({
        quiz_question_id: qid,
        selected_option_id: oid
      }));

      const activeSub = assessmentSubmissions[0];
      const keepFiles = Boolean(
        activeSub && 
        !removeExistingUploadedFile && 
        studentAnswerFiles.length === 0 &&
        ((activeSub.active_version?.files && activeSub.active_version.files.length > 0) || activeSub.active_version?.storage_path || activeSub.active_version?.original_name)
      );

      const sectionStatuses: Record<string, string> = {};
      const types = selectedAssessment.assessment_types && selectedAssessment.assessment_types.length > 0
        ? selectedAssessment.assessment_types
        : (selectedAssessment.document_storage_key ? ['file_based', 'manual_questions'] : ['manual_questions']);

      if (types.includes('file_based')) {
        sectionStatuses['file_based'] = (studentAnswerFiles.length > 0 || keepFiles) ? 'completed' : 'pending';
      }
      if (types.includes('manual_questions')) {
        sectionStatuses['manual_questions'] = formattedAnswers.length === draftQuestions.length ? 'completed' : 'pending';
      }
      if (types.includes('quiz')) {
        sectionStatuses['quiz'] = formattedQuizAnswers.length === draftQuizQuestions.length ? 'completed' : 'pending';
      }

      const receipt = await submissionApi.uploadSubmission({
        assessment_id: selectedAssessment.id,
        answers: formattedAnswers,
        quiz_answers: formattedQuizAnswers,
        section_statuses: sectionStatuses,
        files: studentAnswerFiles.map(f => ({
          file_name: f.name,
          file_base64: f.base64
        })),
        keep_existing_files: keepFiles
      });

      const lateNotice = receipt.late_status === 'late' ? ' (LATE SUBMISSION recorded)' : ' (ON TIME)';
      setActionMessage(
        `Assignment submitted successfully! Version ${receipt.version} saved${lateNotice}.`
      );

      try {
        localStorage.removeItem(`acadassess_answers_${selectedAssessment.id}`);
        localStorage.removeItem(`acadassess_quiz_answers_${selectedAssessment.id}`);
      } catch {}

      setStudentAnswerFiles([]);
      setRemoveExistingUploadedFile(false);
      setIsConfirmSubmitOpen(false);
      setDraftSaveStatus('saved');
      setDraftLastSavedTime(new Date());

      await loadSubmissions(selectedAssessment.id);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed.');
    } finally {
      setIsSubmittingAnswers(false);
    }
  };

  // Open Publish Modal & Load Eligible Students
  const handleOpenPublishModal = async () => {
    if (!selectedAssessment) return;
    setPublishAudience('all');
    setSelectedStudentIds([]);
    setStudentSearchQuery('');
    setShowPublishConfirmModal(true);
    setLoadingEligibleStudents(true);
    try {
      const students = await assessmentApi.getEligibleStudents(selectedAssessment.id);
      setEligibleStudents(students);
    } catch (err: any) {
      console.error('Failed to load eligible students for publication:', err);
      setEligibleStudents([]);
    } finally {
      setLoadingEligibleStudents(false);
    }
  };

  // Publish Assessment
  const handlePublishAssessment = async () => {
    if (!selectedAssessment) return;
    if (publishAudience === 'selected' && selectedStudentIds.length === 0) {
      setErrorMessage('Please select at least one student when publishing to specific students.');
      return;
    }
    setErrorMessage(null);
    setIsPublishing(true);

    try {
      const published = await assessmentApi.publishAssessment(selectedAssessment.id, {
        audience: publishAudience,
        student_ids: publishAudience === 'selected' ? selectedStudentIds : undefined
      });
      const audienceMsg = publishAudience === 'selected'
        ? `published to ${selectedStudentIds.length} selected student(s)`
        : 'published to all eligible students';
      setActionMessage(`Assessment "${published.title}" has been ${audienceMsg} and locked. It is now open for student submissions.`);
      setShowPublishConfirmModal(false);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Publication check failed.');
      setShowPublishConfirmModal(false);
    } finally {
      setIsPublishing(false);
    }
  };

  // Publication checklist: Supports all 7 combinations of File-Based, Manual Questions, and Quiz
  const publicationChecklist = () => {
    if (!selectedAssessment) return { valid: false, errors: [] };
    const errors: string[] = [];

    const types = selectedAssessment.assessment_types && selectedAssessment.assessment_types.length > 0
      ? selectedAssessment.assessment_types
      : (selectedAssessment.document_storage_key ? ['file_based', 'manual_questions'] : ['manual_questions']);

    // 1. File-Based validation
    if (types.includes('file_based')) {
      const hasDoc = Boolean(
        selectedAssessment.document_storage_key || 
        selectedAssessment.document_filename ||
        (selectedAssessment.instruction_files && selectedAssessment.instruction_files.length > 0)
      );
      if (!hasDoc) {
        errors.push('File-Based Assessment requires an instruction file (PDF, PPT, PPTX, DOC, DOCX) to be uploaded.');
      }
    }

    // 2. Manual Questions validation
    if (types.includes('manual_questions')) {
      const questions = draftQuestions.length > 0 ? draftQuestions : (selectedAssessment.questions || []);
      if (!questions || questions.length === 0) {
        errors.push('Manual Question-Based Assessment requires at least one question.');
      }
    }

    // 3. Quiz validation
    if (types.includes('quiz')) {
      const quizzes = draftQuizQuestions.length > 0 ? draftQuizQuestions : (selectedAssessment.quiz_questions || []);
      if (!quizzes || quizzes.length === 0) {
        errors.push('Quiz-Based Assessment requires at least one MCQ question.');
      } else {
        const incompleteQuizIndex = quizzes.findIndex(q => !q.options || q.options.length !== 4 || !q.correct_option_id);
        if (incompleteQuizIndex !== -1) {
          errors.push(`Quiz Question ${incompleteQuizIndex + 1} must have exactly 4 options and 1 correct answer selected.`);
        }
      }
    }

    // 4. Rubric validation: required for file_based or manual_questions, NOT required for quiz-only
    const requiresRubric = types.includes('file_based') || types.includes('manual_questions');
    if (requiresRubric) {
      const criteria = draftRubricCriteria.length > 0 ? draftRubricCriteria : (selectedAssessment.rubric?.criteria || []);
      if (criteria.length === 0) {
        errors.push('Assessment requires an assignment-level evaluation rubric summing to 50 marks.');
      } else {
        const sum = criteria.reduce((acc: number, c: any) => acc + Number(c.max_marks || c.max_score || 0), 0);
        if (Math.abs(sum - 50) > 0.001) {
          errors.push(`Rubric criteria total (${sum} marks) must equal exactly 50 marks before publishing.`);
        }
      }
    }

    // 5. Submission deadline must be in the future
    const isFuture = new Date(selectedAssessment.deadline_at).getTime() > Date.now();
    if (!isFuture) {
      errors.push('Submission deadline must be in the future.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };

  const checklist = publicationChecklist();

  // Filtered Late Submissions Report Data
  const filteredLateReports = lateReports.filter(row => {
    if (!reportSearchQuery.trim()) return true;
    const query = reportSearchQuery.toLowerCase();
    return (
      (row.student_name && row.student_name.toLowerCase().includes(query)) ||
      (row.student_usn && row.student_usn.toLowerCase().includes(query)) ||
      (row.assessment_title && row.assessment_title.toLowerCase().includes(query))
    );
  });

  const distinctReportAssessments = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of lateReports) {
      if (r.assessment_id && r.assessment_title) {
        map.set(r.assessment_id, r.assessment_title);
      }
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [lateReports]);

  return (
    <div className="space-y-6">
      {/* Toast / Notification Messages */}
      {actionMessage && (
        <div className="p-3 bg-academic-paleGreen border border-academic-primaryGreen/40 rounded-md text-xs text-academic-deepGreen flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-academic-primaryGreen" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-academic-muted hover:text-academic-deepGreen">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded-md text-xs text-[#6D5200] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-[#B28704]" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-academic-muted hover:text-[#6D5200]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isOfflineFallback && (
        <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded-md text-xs text-[#6D5200] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-[#B28704] flex-shrink-0" />
            <span>
              <strong>Connection Notice:</strong> Unable to reach the server. Displaying cached academic data.
            </span>
          </div>
        </div>
      )}

      {/* Main View Container: List vs Detail View */}
      {!selectedAssessmentId ? (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
                {activeRole === 'proctor' ? (
                  <FileSpreadsheet className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                ) : (
                  <BookOpen className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                )}
                {activeRole === 'proctor'
                  ? 'Mentee Submissions Report'
                  : isTeacher 
                  ? 'Formative Assessments & Late Policies' 
                  : isStudent 
                  ? 'Enrolled Course Assessments' 
                  : 'Academic Assessments & Submission Policies'}
              </h2>
              <p className="text-xs text-academic-muted mt-1">
                {activeRole === 'proctor'
                  ? 'Monitor academic submission progress, deadlines, pending work, and evaluation status for your assigned mentees.'
                  : isTeacher 
                  ? 'Author assignments using PDF documents and/or manual questions, set deadlines, and manage rubric-based evaluations.'
                  : isStudent
                  ? 'View published assignments, access question materials, and submit coursework.'
                  : 'Review published assessments and monitor academic submissions across departments.'}
              </p>
            </div>

            {isTeacher && (
              <button
                onClick={openCreateModal}
                className="btn-primary text-xs flex items-center self-start sm:self-auto min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                <span>New Assignment</span>
              </button>
            )}
          </div>

          {/* Top Level Staff Tab Switcher (Assessments vs Submissions Report) */}
          {isStaff && activeRole !== 'proctor' && (
            <div className="flex border-b border-academic-border items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('questions')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors ${
                    activeTab !== 'submissions_report'
                      ? 'border-academic-primaryGreen text-academic-deepGreen'
                      : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                  }`}
                >
                  Assessments Catalog ({assessments.length})
                </button>
                <button
                  onClick={() => setActiveTab('submissions_report')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-2 ${
                    activeTab === 'submissions_report'
                      ? 'border-academic-primaryGreen text-academic-deepGreen'
                      : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-academic-primaryGreen" />
                  <span>Submissions Report</span>
                </button>
              </div>

              {isTeacher && (
                <button
                  type="button"
                  onClick={() => setIsReportPdfModalOpen(true)}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center space-x-1.5 bg-academic-primaryGreen text-white rounded-lg shadow-xs hover:bg-academic-deepGreen transition-colors mb-1 shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 text-white" />
                  <span>Assessment Marks PDF</span>
                </button>
              )}
            </div>
          )}

          {/* Tab 1: Submissions Report View */}
          {activeRole === 'proctor' ? (
            <ProctorMenteeReport />
          ) : isStaff && activeTab === 'submissions_report' ? (
            <div className="space-y-4">
              {/* Filter and Search Bar */}
              <div className="card-surface p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
                    <input
                      type="text"
                      placeholder="Search by student name or USN..."
                      value={reportSearchQuery}
                      onChange={(e) => setReportSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-academic-muted flex-shrink-0" />
                    <select
                      value={reportAssessmentFilter}
                      onChange={(e) => setReportAssessmentFilter(e.target.value)}
                      className="text-xs px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
                    >
                      <option value="all">All Assessments</option>
                      {(activeRole === 'proctor' && assessments.length === 0 ? distinctReportAssessments : assessments).map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={() => loadLateReports(reportAssessmentFilter)}
                  disabled={loadingReports}
                  className="btn-secondary text-xs flex items-center justify-center min-h-[40px]"
                >
                  <span>{loadingReports ? 'Refreshing...' : 'Refresh Report'}</span>
                </button>
              </div>

              {/* Report Table */}
              {loadingReports ? (
                <div className="card-surface text-center py-10 text-xs text-academic-muted">
                  Loading {activeRole === 'proctor' ? 'mentee' : 'class'} submissions report...
                </div>
              ) : filteredLateReports.length === 0 ? (
                <div className="card-surface text-center py-12">
                  <FileText className="w-10 h-10 text-academic-muted/40 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-academic-deepGreen">
                    {activeRole === 'proctor' ? 'No mentee submission records found' : 'No student records matching criteria'}
                  </p>
                  <p className="text-xs text-academic-muted mt-0.5">
                    {activeRole === 'proctor'
                      ? 'No submission records found for your assigned mentees. Ensure you have mentees assigned in Proctor Mentors.'
                      : 'No enrolled student records found for the selected assessment and filters.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-academic-border rounded-lg bg-academic-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-academic-paleGreen text-academic-deepGreen border-b border-academic-border text-[11px] font-semibold">
                      <tr>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">USN</th>
                        <th className="p-3">Assessment & Subject</th>
                        <th className="p-3">Original Deadline</th>
                        <th className="p-3">Extension Deadline</th>
                        <th className="p-3">Submission Status</th>
                        <th className="p-3">Submitted At</th>
                        <th className="p-3">Timing Status</th>
                        <th className="p-3">Evaluation Status</th>
                        <th className="p-3 text-right">Published Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-academic-border bg-academic-surface">
                      {filteredLateReports.map((row, idx) => {
                        const isSubmitted = Boolean(row.is_submitted || row.submitted_at || row.submission_id);
                        return (
                          <tr key={idx} className="hover:bg-academic-paleGreen/30 transition-colors">
                            <td className="p-3 font-semibold text-academic-deepGreen">{row.student_name || 'Student'}</td>
                            <td className="p-3 font-mono text-[11px] text-academic-muted">{row.student_usn || '—'}</td>
                            <td className="p-3">
                              <p className="font-semibold text-academic-deepGreen">{row.assessment_title}</p>
                              <p className="text-[10px] text-academic-muted">{row.subject_name || row.class_name}</p>
                            </td>
                            <td className="p-3 text-[11px] text-academic-muted">
                              {row.original_deadline ? new Date(row.original_deadline).toLocaleString() : (row.deadline_at ? new Date(row.deadline_at).toLocaleString() : '—')}
                            </td>
                            <td className="p-3 text-[11px] text-academic-muted">
                              {row.extension_deadline ? new Date(row.extension_deadline).toLocaleString() : (row.extension_deadline_at ? new Date(row.extension_deadline_at).toLocaleString() : '—')}
                            </td>
                            <td className="p-3">
                              {isSubmitted ? (
                                <StatusBadge label="Submitted" variant="submitted" />
                              ) : (
                                <StatusBadge label="Not Submitted" variant="neutral" />
                              )}
                            </td>
                            <td className="p-3 text-[11px] text-academic-muted">
                              {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}
                            </td>
                            <td className="p-3">
                              {!isSubmitted ? (
                                <span className="text-academic-muted text-[11px]">—</span>
                              ) : row.is_late || row.late_status === 'late' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FDF6E2] text-[#A63214] border border-[#D9BD71]">
                                  LATE
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-academic-lightGreen text-academic-primaryGreen border border-academic-primaryGreen/30">
                                  ON TIME
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {!isSubmitted ? (
                                <span className="text-academic-muted text-[11px] italic">Not Submitted</span>
                              ) : row.evaluation_status === 'published' ? (
                                <StatusBadge label="Published" variant="completed" />
                              ) : row.evaluation_status === 'completed' ? (
                                <StatusBadge label="Evaluated" variant="completed" />
                              ) : row.evaluation_status === 'draft' ? (
                                <StatusBadge label="Under Evaluation" variant="processing" />
                              ) : (
                                <StatusBadge label="Pending Evaluation" variant="neutral" />
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {row.published_score !== null && row.published_score !== undefined ? (
                                <span className="font-bold text-academic-deepGreen font-mono">
                                  {row.published_score} Marks
                                </span>
                              ) : (
                                <span className="text-academic-muted text-[11px] italic">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* Tab 2: Assessment Cards Grid */
            <>
              {loading ? (
                <div className="card-surface text-center py-8 text-academic-muted text-xs">
                  Loading assessments...
                </div>
              ) : assessments.length === 0 ? (
                <div className="card-surface text-center py-12">
                  <FileText className="w-10 h-10 text-academic-muted/50 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-academic-deepGreen">No assessments found</p>
                  <p className="text-xs text-academic-muted mt-1">
                    {isTeacher 
                      ? 'Get started by creating your first document-based assessment.'
                      : 'No published assessments are currently open for your enrolled subjects.'}
                  </p>
                  {isTeacher && (
                    <button
                      onClick={openCreateModal}
                      className="btn-primary text-xs mt-4 inline-flex items-center min-h-[44px]"
                    >
                      <PlusCircle className="w-4 h-4 mr-1.5" />
                      <span>Create Assignment</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {assessments.map(ass => {
                    const isDraft = ass.status === 'draft';
                    const isPublished = ass.status === 'published';

                    return (
                      <div 
                        key={ass.id} 
                        className="card-surface flex flex-col justify-between hover:border-academic-primaryGreen/50 transition-all cursor-pointer group"
                        onClick={() => {
                          setSelectedAssessmentId(ass.id);
                          if (Array.isArray(ass.questions) && ass.questions.length > 0) {
                            setDraftQuestions(ass.questions);
                          }
                          if (ass.rubric?.criteria && Array.isArray(ass.rubric.criteria) && ass.rubric.criteria.length > 0) {
                            setDraftRubricCriteria(ass.rubric.criteria);
                          }
                        }}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center space-x-2">
                              {isTeacher ? (
                                <StatusBadge 
                                  label={ass.status.toUpperCase()} 
                                  variant={isPublished ? 'published' : isDraft ? 'draft' : 'neutral'} 
                                />
                              ) : isStudent ? (
                                renderStudentSubmissionBadge(ass.id)
                              ) : (
                                <StatusBadge 
                                  label={ass.status.toUpperCase()} 
                                  variant={isPublished ? 'published' : isDraft ? 'draft' : 'neutral'} 
                                />
                              )}
                            </div>
                          </div>

                          <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors">
                            {ass.title}
                          </h3>

                          <p className="text-xs text-academic-muted mt-1">
                            {ass.class_details || 'Class Allocation'} • {ass.subject_details || 'Subject'}
                          </p>

                          <p className="text-xs text-academic-muted/80 mt-2 line-clamp-2">
                            {ass.instructions}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-academic-border/70 flex flex-col gap-2">
                          <div className="flex items-center justify-between text-xs text-academic-muted">
                            <span className="flex items-center font-medium">
                              <Layers className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                              {`${ass.max_marks || 50} Marks`}
                            </span>
                            <span className="flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                              Due: {new Date(ass.deadline_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            {isTeacher ? (
                              <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(ass)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded text-academic-deepGreen hover:bg-academic-paleGreen border border-academic-border flex items-center transition-colors min-h-[32px]"
                                  title="Edit Assignment"
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openDeleteModal(ass)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded text-red-700 hover:bg-red-50 border border-red-200 flex items-center transition-colors min-h-[32px]"
                                  title="Delete Assignment"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            ) : <div />}

                            <div className="flex items-center text-xs font-semibold text-academic-primaryGreen group-hover:translate-x-0.5 transition-transform">
                              <span>{isTeacher && isDraft ? 'Review & Publish' : 'View Assessment'}</span>
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      ) : selectedAssessment ? (
        /* Detailed Assessment & Submission View */
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-academic-border">
            <button
              onClick={() => setSelectedAssessmentId(null)}
              className="btn-secondary text-xs flex items-center min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span>Back to Assessments</span>
            </button>

            <div className="flex items-center space-x-2">
              {isTeacher ? (
                <>
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedAssessment)}
                    className="btn-secondary text-xs flex items-center min-h-[38px] px-3"
                    title="Edit Assignment Details"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                    <span>Edit Assignment</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteModal(selectedAssessment)}
                    className="px-3 py-1.5 text-xs font-semibold rounded text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center min-h-[38px] transition-colors"
                    title="Delete Assignment"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    <span>Delete</span>
                  </button>
                  <StatusBadge 
                    label={selectedAssessment.status.toUpperCase()} 
                    variant={selectedAssessment.status === 'published' ? 'published' : 'draft'} 
                  />
                  {selectedAssessment.status === 'published' && (
                    <span className="text-xs font-medium text-academic-primaryGreen flex items-center bg-academic-lightGreen px-2.5 py-1 rounded border border-academic-primaryGreen/30">
                      <Lock className="w-3.5 h-3.5 mr-1" />
                      Locked (Published)
                    </span>
                  )}
                </>
              ) : (
                renderStudentSubmissionBadge(selectedAssessment.id)
              )}
            </div>
          </div>

          {/* Assessment Summary Card */}
          {(() => {
            const selectedTypes: AssessmentType[] = selectedAssessment.assessment_types && selectedAssessment.assessment_types.length > 0
              ? selectedAssessment.assessment_types
              : (selectedAssessment.document_storage_key ? ['file_based', 'manual_questions'] : ['manual_questions']);
            const hasInstructionFile = Boolean(selectedAssessment.document_storage_key || selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files.length > 0));

            return (
              <>
                <div className="card-surface space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-bold text-academic-deepGreen">
                          {selectedAssessment.title}
                        </h2>
                        {selectedTypes.map(t => (
                          <span key={t} className="text-[10px] font-bold text-academic-primaryGreen bg-academic-lightGreen px-2 py-0.5 rounded border border-academic-primaryGreen/30 capitalize">
                            {t === 'file_based' ? '📁 File-Based' : t === 'manual_questions' ? '✍️ Manual Questions' : '🧩 Quiz (MCQ)'}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-academic-muted mt-1">
                        Class: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.class_details || 'MCA'}</span> • 
                        Subject: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.subject_details || 'Subject'}</span>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {hasInstructionFile && (
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(selectedAssessment.id, selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files[0]?.file_name))}
                          disabled={downloadingDocId === selectedAssessment.id}
                          className="btn-secondary text-xs flex items-center min-h-[44px]"
                          title="Download instruction document"
                        >
                          {downloadingDocId === selectedAssessment.id ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-academic-primaryGreen" />
                          ) : (
                            <Download className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          )}
                          <span>Instruction File</span>
                        </button>
                      )}

                      {isTeacher && selectedAssessment.status === 'draft' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActionMessage('Draft settings are saved automatically as you edit.')}
                            className="btn-secondary text-xs flex items-center min-h-[44px]"
                          >
                            <Save className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                            <span>Save Draft</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenPublishModal}
                            className="btn-primary text-xs flex items-center min-h-[44px]"
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            <span>Publish Assessment</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Instructions Banner */}
                  <div className="p-3 bg-academic-paleGreen/60 rounded-md border border-academic-border text-xs text-academic-deepGreen space-y-1">
                    <span className="font-semibold block">Instructions:</span>
                    <p className="leading-relaxed">{selectedAssessment.instructions}</p>
                  </div>

                  {/* Deadlines & Late Policy Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                    <div className="p-3 rounded border border-academic-border bg-academic-surface space-y-1">
                      <div className="flex items-center space-x-1.5 text-academic-muted">
                        <Calendar className="w-4 h-4 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">Original Deadline</span>
                      </div>
                      <p className="font-mono text-academic-deepGreen text-[11px]">
                        {new Date(selectedAssessment.deadline_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="p-3 rounded border border-academic-border bg-academic-surface space-y-1">
                      <div className="flex items-center space-x-1.5 text-academic-muted">
                        <Clock className="w-4 h-4 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">Late Policy</span>
                      </div>
                      <p className="text-[11px] text-academic-deepGreen">
                        {selectedAssessment.allow_late ? (
                          <>
                            <span className="font-bold text-[#A63214]">Extension until: </span>
                            {selectedAssessment.extension_deadline_at ? new Date(selectedAssessment.extension_deadline_at).toLocaleString() : '—'}
                            <span className="block text-[10px] text-academic-muted mt-0.5">
                              {selectedAssessment.late_penalty_mode === 'fixed'
                                ? `Fixed penalty: -${selectedAssessment.late_penalty_marks || 0} Marks`
                                : 'No automatic deduction (Teacher discretion)'}
                            </span>
                          </>
                        ) : (
                          <span className="text-academic-muted font-medium">Late submissions not permitted</span>
                        )}
                      </p>
                    </div>

                    <div className="p-3 rounded border border-academic-border bg-academic-surface space-y-1">
                      <div className="flex items-center space-x-1.5 text-academic-muted">
                        <Paperclip className="w-4 h-4 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">Submission Rules</span>
                      </div>
                      <p className="text-[11px] text-academic-deepGreen">
                        Max Answer Files: <span className="font-bold">{selectedAssessment.max_files || 1} file(s)</span> (PDF, PPT, PPTX, DOC, DOCX)
                      </p>
                      <p className="text-[10px] text-academic-muted">
                        Total Marks: {selectedAssessment.max_marks || 50} Marks
                      </p>
                    </div>
                  </div>
                </div>

                {/* Assessment Detail Tab Switcher */}
                <div className="flex flex-wrap border-b border-academic-border gap-2">
                  {selectedTypes.includes('file_based') && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('file_based')}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                        activeTab === 'file_based'
                          ? 'border-academic-primaryGreen text-academic-deepGreen'
                          : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      <span>File-Based Instructions</span>
                      {hasInstructionFile && (
                        <span className="w-2 h-2 rounded-full bg-academic-primaryGreen" title="File uploaded" />
                      )}
                    </button>
                  )}

                  {selectedTypes.includes('manual_questions') && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('questions')}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                        activeTab === 'questions'
                          ? 'border-academic-primaryGreen text-academic-deepGreen'
                          : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      <span>Manual Questions ({draftQuestions.length})</span>
                    </button>
                  )}

                  {selectedTypes.includes('quiz') && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('quiz')}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                        activeTab === 'quiz'
                          ? 'border-academic-primaryGreen text-academic-deepGreen'
                          : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      <span>Quiz (MCQ) ({draftQuizQuestions.length})</span>
                    </button>
                  )}

                  {(selectedTypes.includes('file_based') || selectedTypes.includes('manual_questions')) && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('rubric')}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                        activeTab === 'rubric'
                          ? 'border-academic-primaryGreen text-academic-deepGreen'
                          : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 mr-1" />
                      <span>Assignment Rubric</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        Math.abs(draftRubricSum - 50) < 0.001
                          ? 'bg-academic-lightGreen text-academic-primaryGreen'
                          : 'bg-[#FDF6E2] text-[#A63214]'
                      }`}>
                        {draftRubricSum}/50
                      </span>
                    </button>
                  )}

                  {isTeacher && selectedAssessment.status === 'published' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('submissions')}
                      className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                        activeTab === 'submissions'
                          ? 'border-academic-primaryGreen text-academic-deepGreen'
                          : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                      }`}
                    >
                      <FileCheck2 className="w-3.5 h-3.5 mr-1" />
                      <span>Student Submissions ({assessmentSubmissions.length})</span>
                    </button>
                  )}
                </div>

          {/* Teacher Submissions View */}
          {isTeacher && selectedAssessment.status === 'published' && activeTab === 'submissions' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                    <FileCheck2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                    Student Answer Submissions
                  </h3>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Original student answer documents stored securely in private institutional storage.
                  </p>
                </div>
              </div>

              {assessmentSubmissions.length === 0 ? (
                <div className="card-surface text-center py-12">
                  <FileText className="w-10 h-10 text-academic-muted/40 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-academic-deepGreen">No submissions received yet</p>
                  <p className="text-[11px] text-academic-muted mt-0.5">
                    Enrolled students have not submitted answer files for this assessment.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-academic-border rounded-lg bg-academic-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-academic-paleGreen text-academic-deepGreen border-b border-academic-border text-[11px] font-semibold">
                      <tr>
                        <th className="p-3">Student Name</th>
                        <th className="p-3">USN</th>
                        <th className="p-3">Version</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Submitted At</th>
                        <th className="p-3">Files Submitted</th>
                        <th className="p-3 text-right">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-academic-border bg-academic-surface">
                      {assessmentSubmissions.map((sub) => {
                        const isLate = sub.active_version?.late_status === 'late';
                        const files = sub.active_version?.files || [];

                        return (
                          <tr key={sub.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                            <td className="p-3 font-semibold text-academic-deepGreen">
                              {sub.student_name || 'Enrolled Student'}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-academic-muted">
                              {sub.student_usn || '—'}
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-academic-paleGreen border border-academic-border text-[11px] font-bold text-academic-deepGreen">
                                v{sub.active_version?.version || 1}
                              </span>
                            </td>
                            <td className="p-3">
                              {isLate ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FDF6E2] text-[#A63214] border border-[#D9BD71]">
                                  ⚠️ LATE
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-academic-lightGreen text-academic-primaryGreen border border-academic-primaryGreen/30">
                                  ✓ ON TIME
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-academic-muted text-[11px]">
                              {sub.active_version?.uploaded_at ? new Date(sub.active_version.uploaded_at).toLocaleString() : '—'}
                            </td>
                            <td className="p-3 text-academic-deepGreen">
                              {files.length > 0 ? (
                                <span className="font-semibold">{files.length} file(s)</span>
                              ) : (
                                <span className="text-academic-muted font-mono text-[11px]">
                                  {sub.active_version?.original_name || '1 file'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {files.length > 0 ? (
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  {files.map((f: any) => (
                                    <a
                                      key={f.id}
                                      href={submissionApi.downloadFileUrl(sub.id, sub.active_version!.id, f.id)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center"
                                      title={`${f.original_name} (${(f.size_bytes / 1024).toFixed(1)} KB)`}
                                    >
                                      <Download className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                                      <span className="max-w-[120px] truncate">{f.original_name}</span>
                                    </a>
                                  ))}
                                </div>
                              ) : sub.active_version ? (
                                <a
                                  href={submissionApi.downloadPdfUrl(sub.id, sub.active_version.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-secondary text-xs inline-flex items-center min-h-[36px]"
                                >
                                  <Download className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                                  <span>Download</span>
                                </a>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'rubric' ? (
            /* Assignment Evaluation Rubric View and Builder */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-academic-border">
                <div>
                  <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                    <Layers className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                    Assignment Evaluation Rubric
                  </h3>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Evaluators assess student submissions against these criteria totaling 50 marks.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedAssessment.status === 'published' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-academic-paleGreen text-academic-deepGreen border border-academic-border">
                      <Lock className="w-3.5 h-3.5 mr-1 text-academic-deepGreen" />
                      Rubric Frozen (Published)
                    </span>
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold border ${
                      Math.abs(draftRubricSum - 50) < 0.001
                        ? 'bg-academic-lightGreen text-academic-primaryGreen border-academic-primaryGreen/30'
                        : 'bg-[#FDF6E2] text-[#A63214] border-[#D9BD71]'
                    }`}>
                      {Math.abs(draftRubricSum - 50) < 0.001 ? '✓ Total Marks: 50 / 50' : `⚠️ Total Marks: ${draftRubricSum} / 50 (Must equal 50)`}
                    </span>
                  )}
                </div>
              </div>

              {/* Criteria Table */}
              {isLoadingDetails && draftRubricCriteria.length === 0 ? (
                <div className="card-surface flex items-center justify-center py-8 text-xs text-academic-muted space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                  <span>Loading rubric criteria...</span>
                </div>
              ) : detailsError && draftRubricCriteria.length === 0 ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-xs text-red-800">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{detailsError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedAssessmentId && loadAssessmentDetails(selectedAssessmentId)}
                    className="btn-secondary text-[11px] px-2.5 py-1 h-auto inline-flex items-center"
                  >
                    <RotateCw className="w-3 h-3 mr-1 inline" />
                    Retry
                  </button>
                </div>
              ) : draftRubricCriteria.length === 0 ? (
                <div className="card-surface text-center py-8">
                  <p className="text-xs font-semibold text-academic-deepGreen">No rubric criteria configured yet</p>
                  <p className="text-[11px] text-academic-muted mt-0.5">
                    Add criteria below or reset to the default 4-criterion 50-mark template.
                  </p>
                  {selectedAssessment.status === 'draft' && isTeacher && (
                    <button
                      type="button"
                      onClick={handleResetDraftRubricToTemplate}
                      className="btn-secondary text-xs mt-3 inline-flex items-center"
                    >
                      Use Default 50-Mark Template
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-academic-border rounded-lg bg-academic-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-academic-paleGreen text-academic-deepGreen border-b border-academic-border text-[11px] font-semibold">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Criterion Title</th>
                        <th className="p-3">Description & Expectations</th>
                        <th className="p-3 text-right">Max Marks</th>
                        {selectedAssessment.status === 'draft' && isTeacher && (
                          <th className="p-3 text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-academic-border bg-academic-surface">
                      {draftRubricCriteria.map((c, idx) => (
                        <tr key={c.id || idx} className="hover:bg-academic-paleGreen/20 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-academic-muted font-bold">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-semibold text-academic-deepGreen">
                            {c.criterion_title}
                          </td>
                          <td className="p-3 text-academic-muted text-xs leading-relaxed max-w-md">
                            {c.description || '—'}
                          </td>
                          <td className="p-3 text-right font-bold text-academic-deepGreen font-mono">
                            {c.max_marks || c.max_score || 0}
                          </td>
                          {selectedAssessment.status === 'draft' && isTeacher && (
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftCriterion(idx)}
                                disabled={isSavingRubric}
                                className="text-academic-muted hover:text-red-700 p-1 transition-colors"
                                title="Remove Criterion"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-academic-paleGreen/40 border-t border-academic-border font-bold text-xs">
                      <tr>
                        <td colSpan={3} className="p-3 text-academic-deepGreen text-right">
                          Total Criteria Marks:
                        </td>
                        <td className="p-3 text-right font-mono text-academic-deepGreen">
                          {draftRubricSum} / 50
                        </td>
                        {selectedAssessment.status === 'draft' && isTeacher && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Add Criterion Form in Draft mode */}
              {selectedAssessment.status === 'draft' && isTeacher && (
                <div className="card-surface p-4 border border-academic-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-academic-deepGreen flex items-center">
                      <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Add Rubric Criterion
                    </h4>
                    <button
                      type="button"
                      onClick={handleResetDraftRubricToTemplate}
                      disabled={isSavingRubric}
                      className="text-[11px] text-academic-primaryGreen hover:underline font-medium"
                    >
                      Reset to Default 4-Criterion Template
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <div className="sm:col-span-2">
                      <input
                        type="text"
                        placeholder="Criterion Title (e.g. Analysis & Verification)"
                        value={inlineNewCritTitle}
                        onChange={(e) => setInlineNewCritTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        placeholder="Max Marks"
                        value={inlineNewCritMarks}
                        onChange={(e) => setInlineNewCritMarks(Math.max(1, Math.min(50, Number(e.target.value))))}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleAddDraftCriterion}
                        disabled={isSavingRubric || !inlineNewCritTitle.trim()}
                        className="btn-primary text-xs w-full min-h-[40px] flex items-center justify-center"
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                        <span>{isSavingRubric ? 'Saving...' : 'Add Criterion'}</span>
                      </button>
                    </div>
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Criterion Description / Grading Guidance (Optional)"
                      value={inlineNewCritDesc}
                      onChange={(e) => setInlineNewCritDesc(e.target.value)}
                      className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[38px] text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : isStudent && selectedAssessment.status === 'published' ? (
            /* Student Assessment Multi-Type Answering Workspace */
            <div className="space-y-6">
              {/* SECTION 1: File-Based Assessment (if applicable) */}
              {selectedTypes.includes('file_based') && (
                <div className="card-surface p-5 border border-academic-border space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-academic-primaryGreen">
                        Section 1: File-Based Assignment Instructions & Document Submission
                      </span>
                      <h3 className="text-base font-bold text-academic-deepGreen flex items-center mt-1">
                        <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                        Teacher Instructions & Question Brief
                      </h3>
                    </div>
                  </div>

                  {/* Teacher Instruction Document Download & Preview */}
                  {hasInstructionFile ? (
                    <div className="p-4 rounded-lg bg-academic-paleGreen/30 border border-academic-border space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 rounded bg-academic-lightGreen text-academic-primaryGreen">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-bold text-academic-deepGreen text-sm">
                              {selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files[0]?.file_name) || 'Assignment-Brief.pdf'}
                            </p>
                            <p className="text-[11px] text-academic-muted font-mono mt-0.5">
                              {selectedAssessment.document_size_bytes ? `${(selectedAssessment.document_size_bytes / 1024).toFixed(1)} KB &bull; ` : ''}Authoritative Instruction File
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(selectedAssessment.id, selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files[0]?.file_name))}
                          disabled={downloadingDocId === selectedAssessment.id}
                          className="btn-secondary text-xs inline-flex items-center min-h-[40px]"
                        >
                          {downloadingDocId === selectedAssessment.id ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-academic-primaryGreen" />
                          ) : (
                            <Download className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          )}
                          <span>Download Instructions</span>
                        </button>
                      </div>

                      {/* Embedded PDF Viewer if PDF */}
                      {(selectedAssessment.document_filename?.toLowerCase().endsWith('.pdf') || !selectedAssessment.document_filename) && selectedAssessment.document_storage_key && (
                        <div className="pt-2">
                          <React.Suspense fallback={<div className="flex items-center justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-academic-primaryGreen" /><span className="ml-2 text-xs text-academic-muted">Loading PDF Preview...</span></div>}>
                            <PdfViewer assessmentId={selectedAssessment.id} filename={selectedAssessment.document_filename} />
                          </React.Suspense>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Student Answer Files Staging & Upload */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block font-bold text-academic-deepGreen text-xs">
                          Student Answer Files (PDF, PPT, PPTX, DOC, DOCX) *
                        </label>
                        <p className="text-[11px] text-academic-muted mt-0.5">
                          You may upload up to {selectedAssessment.max_files || 1} answer file(s) (20.00 MB individual limit, 20.00 MB total limit).
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-academic-deepGreen">
                        {studentAnswerFiles.length} of max {selectedAssessment.max_files || 1} files
                      </span>
                    </div>

                    {/* Staged New Answer Files */}
                    {studentAnswerFiles.length > 0 && (
                      <div className="space-y-1.5 p-3 rounded bg-academic-paleGreen/20 border border-academic-border">
                        {studentAnswerFiles.map((sf, idx) => (
                          <div key={idx} className="p-2 rounded bg-academic-surface border border-academic-border flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2">
                              <Paperclip className="w-3.5 h-3.5 text-academic-primaryGreen" />
                              <span className="font-medium text-academic-deepGreen">{sf.name}</span>
                              <span className="text-[11px] font-mono text-academic-muted">
                                ({(sf.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveStudentAnswerFile(idx)}
                              className="text-academic-muted hover:text-red-700 p-1"
                              title="Remove file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* File Dropzone / Selector */}
                    {studentAnswerFiles.length < (selectedAssessment.max_files || 1) && (
                      <label className="btn-secondary text-xs flex items-center justify-center cursor-pointer min-h-[44px] border-dashed border-2">
                        <Upload className="w-3.5 h-3.5 mr-2 text-academic-primaryGreen" />
                        <span>Select Answer File (PDF, PPT, PPTX, DOC, DOCX)</span>
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={handleSelectStudentAnswerFiles}
                          disabled={isSubmittingAnswers}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 2: Manual Questions (if applicable) */}
              {selectedTypes.includes('manual_questions') && (
                <div className="card-surface p-5 border border-academic-border space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-academic-primaryGreen">
                        {selectedTypes.includes('file_based') ? 'Section 2: Manual Question Answers' : 'Section 1: Manual Question Answers'}
                      </span>
                      <h3 className="text-base font-bold text-academic-deepGreen flex items-center mt-1">
                        <Pencil className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                        Manual Questions ({draftQuestions.length})
                      </h3>
                      <p className="text-xs text-academic-muted mt-0.5">
                        Provide comprehensive written answers for each question below.
                      </p>
                    </div>

                    {/* Draft Autosave Status Indicator */}
                    <div className="flex items-center space-x-2">
                      {draftSaveStatus === 'saving' ? (
                        <span className="inline-flex items-center text-xs text-academic-primaryGreen font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                          Autosaving draft...
                        </span>
                      ) : draftSaveStatus === 'saved' ? (
                        <span className="inline-flex items-center text-xs text-academic-primaryGreen font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                          Draft saved {draftLastSavedTime ? `(${draftLastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                        </span>
                      ) : draftSaveStatus === 'unsaved' ? (
                        <span className="inline-flex items-center text-xs text-amber-700 font-medium">
                          <Clock className="w-3.5 h-3.5 mr-1.5" />
                          Unsaved changes (autosaving...)
                        </span>
                      ) : draftSaveStatus === 'error' ? (
                        <span className="inline-flex items-center text-xs text-red-700 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                          Save error (cached locally)
                        </span>
                      ) : (
                        <span className="text-academic-muted text-xs">
                          Autosave enabled
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={handleSaveDraftManual}
                        disabled={draftSaveStatus === 'saving'}
                        className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center"
                        title="Explicitly save draft to server"
                      >
                        <Save className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                        <span>Save Draft</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Answering List */}
                  <div className="space-y-4">
                    {draftQuestions.map((q, idx) => {
                      const qKey = q.id || `q-${q.display_order || idx + 1}`;
                      const isUnanswered = unansweredQuestionIds.includes(qKey);
                      const answerText = studentAnswers[qKey] || (q.id ? studentAnswers[q.id] : undefined) || studentAnswers[`q-${q.display_order || idx + 1}`] || '';
                      const wordCount = answerText.trim() ? answerText.trim().split(/\s+/).length : 0;
                      const charCount = answerText.length;

                      return (
                        <div
                          key={q.id || idx}
                          className={`p-4 rounded-lg border bg-academic-surface space-y-3 ${
                            isUnanswered ? 'border-red-400 bg-red-50/10' : 'border-academic-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                                Question {q.display_order || idx + 1} of {draftQuestions.length}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-academic-muted">
                              {wordCount} {wordCount === 1 ? 'word' : 'words'} &bull; {charCount} chars
                            </span>
                          </div>

                          <p className="text-xs text-academic-deepGreen font-medium leading-relaxed whitespace-pre-wrap">
                            {q.prompt}
                          </p>

                          <div>
                            <textarea
                              rows={5}
                              value={answerText}
                              onChange={(e) => handleAnswerChange(qKey, e.target.value)}
                              placeholder={`Type your detailed answer for Question ${q.display_order || idx + 1} here...`}
                              className={`w-full p-3 rounded-lg border text-xs focus:outline-none transition-colors ${
                                isUnanswered
                                  ? 'border-red-500 bg-red-50/20 text-academic-deepGreen focus:border-red-600'
                                  : 'border-academic-border bg-academic-surface text-academic-deepGreen focus:border-academic-primaryGreen'
                              }`}
                            />
                            {isUnanswered && (
                              <p className="text-[11px] text-red-600 font-semibold flex items-center mt-1">
                                <AlertCircle className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                                Please provide an answer for Question {q.display_order || idx + 1} before submitting.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION 3: Quiz (MCQ) (if applicable) */}
              {selectedTypes.includes('quiz') && (
                <div className="card-surface p-5 border border-academic-border space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-academic-primaryGreen">
                        {selectedTypes.includes('file_based') && selectedTypes.includes('manual_questions')
                          ? 'Section 3: Multiple Choice Quiz'
                          : selectedTypes.includes('file_based') || selectedTypes.includes('manual_questions')
                          ? 'Section 2: Multiple Choice Quiz'
                          : 'Section 1: Multiple Choice Quiz'}
                      </span>
                      <h3 className="text-base font-bold text-academic-deepGreen flex items-center mt-1">
                        <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                        Quiz (MCQ) &bull; {draftQuizQuestions.length} Questions
                      </h3>
                      <p className="text-xs text-academic-muted mt-0.5">
                        Select exactly one option per question. Answers are autosaved as you make selections.
                      </p>
                    </div>

                    {/* Progress Indicator */}
                    <div className="text-right">
                      <span className="text-xs font-bold text-academic-deepGreen">
                        {Object.keys(studentQuizAnswers).length} of {draftQuizQuestions.length} answered
                      </span>
                      <div className="w-36 h-2 bg-academic-paleGreen rounded-full overflow-hidden mt-1 border border-academic-border">
                        <div
                          className="h-full bg-academic-primaryGreen transition-all duration-300"
                          style={{
                            width: `${draftQuizQuestions.length > 0 ? (Object.keys(studentQuizAnswers).length / draftQuizQuestions.length) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* MCQ Questions List */}
                  <div className="space-y-4">
                    {draftQuizQuestions.map((q, idx) => {
                      const selectedOptId = studentQuizAnswers[q.id];
                      const isUnanswered = unansweredQuizQuestionIds.includes(q.id);

                      return (
                        <div
                          key={q.id || idx}
                          className={`p-4 rounded-lg border bg-academic-surface space-y-3 ${
                            isUnanswered ? 'border-red-400 bg-red-50/10' : 'border-academic-border'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                                Question {idx + 1} of {draftQuizQuestions.length}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-academic-lightGreen text-academic-primaryGreen text-[10px] font-bold border border-academic-primaryGreen/20">
                                {q.marks || 1} {q.marks === 1 ? 'Mark' : 'Marks'}
                              </span>
                            </div>

                            {selectedOptId && (
                              <button
                                type="button"
                                onClick={() => handleClearQuizOption(q.id)}
                                className="text-[11px] text-academic-muted hover:text-red-700 underline font-medium"
                              >
                                Clear selection
                              </button>
                            )}
                          </div>

                          <p className="text-xs font-semibold text-academic-deepGreen leading-relaxed">
                            {q.question_text || (q as any).prompt}
                          </p>

                          {/* 4 Options Radio Group */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            {q.options && q.options.map((opt, optIdx) => {
                              const letter = String.fromCharCode(65 + optIdx);
                              const isChecked = selectedOptId === opt.id;

                              return (
                                <label
                                  key={opt.id || optIdx}
                                  onClick={() => handleSelectQuizOption(q.id, opt.id)}
                                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center space-x-2.5 ${
                                    isChecked
                                      ? 'border-academic-primaryGreen bg-academic-lightGreen/50 ring-1 ring-academic-primaryGreen text-academic-deepGreen font-semibold'
                                      : 'border-academic-border bg-academic-surface hover:bg-academic-paleGreen/20 text-academic-deepGreen'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`student-quiz-${q.id}`}
                                    checked={isChecked}
                                    onChange={() => handleSelectQuizOption(q.id, opt.id)}
                                    className="text-academic-primaryGreen focus:ring-academic-primaryGreen"
                                  />
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    isChecked ? 'bg-academic-primaryGreen text-white' : 'bg-academic-paleGreen text-academic-deepGreen'
                                  }`}>
                                    {letter}
                                  </span>
                                  <span className="text-xs leading-snug">{opt.text}</span>
                                </label>
                              );
                            })}
                          </div>

                          {isUnanswered && (
                            <p className="text-[11px] text-red-600 font-semibold flex items-center mt-1">
                              <AlertCircle className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                              Please select an answer for Question {idx + 1} before submitting.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* FINAL SUBMISSION PANEL */}
              {(() => {
                const sub = assessmentSubmissions[0];
                const now = Date.now();
                const origDeadline = new Date(selectedAssessment.deadline_at).getTime();
                const extDeadline = selectedAssessment.allow_late && selectedAssessment.extension_deadline_at
                  ? new Date(selectedAssessment.extension_deadline_at).getTime()
                  : origDeadline;
                const isOriginalDeadlinePassed = now > origDeadline;
                const isExtensionPassed = now > extDeadline;
                const isEditingLocked = sub ? isOriginalDeadlinePassed : isExtensionPassed;
                const isInExtensionWindow = !sub && isOriginalDeadlinePassed && !isExtensionPassed;

                const hasExistingFiles = Boolean(
                  sub &&
                  !removeExistingUploadedFile &&
                  ((sub.active_version?.files && sub.active_version.files.length > 0) || sub.active_version?.original_name)
                );

                return (
                  <div className="card-surface p-5 border border-academic-border space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-academic-border">
                      <div>
                        <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                          <FileCheck2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                          Final Assessment Submission
                        </h3>
                        <p className="text-xs text-academic-muted mt-0.5">
                          Review all completed sections and submit your assessment.
                        </p>
                      </div>

                      {sub ? (
                        <span className="inline-flex items-center text-xs font-semibold text-academic-primaryGreen bg-academic-lightGreen px-2.5 py-1 rounded border border-academic-primaryGreen/30">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Submitted (v{sub.active_version?.version || 1})
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium text-academic-muted bg-academic-paleGreen px-2.5 py-1 rounded border border-academic-border">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          Pending Submission
                        </span>
                      )}
                    </div>

                    {/* Readiness Checklist */}
                    <div className="p-3 rounded-lg bg-academic-paleGreen/30 border border-academic-border space-y-2 text-xs">
                      <span className="font-bold text-academic-deepGreen block">Submission Readiness Checklist:</span>
                      {selectedTypes.includes('file_based') && (
                        <div className="flex items-center justify-between">
                          <span className="text-academic-muted">File-Based Assessment:</span>
                          {(studentAnswerFiles.length > 0 || hasExistingFiles) ? (
                            <span className="font-bold text-academic-primaryGreen flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              {studentAnswerFiles.length > 0 ? `${studentAnswerFiles.length} file(s) attached` : 'Retained from previous version'}
                            </span>
                          ) : (
                            <span className="font-bold text-[#A63214] flex items-center">
                              <AlertCircle className="w-3.5 h-3.5 mr-1" />
                              Required (No file attached)
                            </span>
                          )}
                        </div>
                      )}

                      {selectedTypes.includes('manual_questions') && (
                        <div className="flex items-center justify-between">
                          <span className="text-academic-muted">Manual Questions:</span>
                          {draftQuestions.length > 0 && draftQuestions.every(q => Boolean(studentAnswers[q.id || `q-${q.display_order}`]?.trim())) ? (
                            <span className="font-bold text-academic-primaryGreen flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              All {draftQuestions.length} answered
                            </span>
                          ) : (
                            <span className="font-bold text-[#A63214] flex items-center">
                              <AlertCircle className="w-3.5 h-3.5 mr-1" />
                              Incomplete ({draftQuestions.filter(q => !studentAnswers[q.id || `q-${q.display_order}`]?.trim()).length} remaining)
                            </span>
                          )}
                        </div>
                      )}

                      {selectedTypes.includes('quiz') && (
                        <div className="flex items-center justify-between">
                          <span className="text-academic-muted">Quiz (MCQ):</span>
                          {draftQuizQuestions.length > 0 && Object.keys(studentQuizAnswers).length === draftQuizQuestions.length ? (
                            <span className="font-bold text-academic-primaryGreen flex items-center">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              All {draftQuizQuestions.length} answered
                            </span>
                          ) : (
                            <span className="font-bold text-[#A63214] flex items-center">
                              <AlertCircle className="w-3.5 h-3.5 mr-1" />
                              Incomplete ({draftQuizQuestions.length - Object.keys(studentQuizAnswers).length} remaining)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Deadline Notice */}
                    {isEditingLocked ? (
                      <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded text-xs text-[#6D5200] flex items-center space-x-2">
                        <Lock className="w-4 h-4 text-[#B28704] flex-shrink-0" />
                        <span>
                          {sub 
                            ? `Submissions locked. The original deadline (${new Date(selectedAssessment.deadline_at).toLocaleString()}) has passed. Resubmissions are disabled.`
                            : `Submissions closed. The deadline for this assignment has passed.`
                          }
                        </span>
                      </div>
                    ) : isInExtensionWindow ? (
                      <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded text-xs text-[#6D5200] flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-[#B28704] flex-shrink-0" />
                        <span>
                          <strong>Late Extension Window Active:</strong> Original deadline has passed. Submitting now records a formal LATE timestamp.
                        </span>
                      </div>
                    ) : null}

                    {/* Submit Button */}
                    {!isEditingLocked && (
                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={handleValidateAndOpenSubmitConfirm}
                          disabled={isSubmittingAnswers}
                          className="btn-primary text-xs flex items-center min-h-[44px] px-6 font-semibold"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          <span>
                            {sub 
                              ? `Save Changes & Resubmit Assignment (v${(sub.active_version?.version || 1) + 1})`
                              : isInExtensionWindow 
                              ? 'Submit Late Assignment' 
                              : 'Submit Assignment'
                            }
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : activeTab === 'file_based' ? (
            /* TEACHER / STAFF: File-Based Instructions Configuration */
            <div className="space-y-4">
              <div className="card-surface p-5 border border-academic-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-academic-primaryGreen">
                      File-Based Assessment Configuration
                    </span>
                    <h4 className="text-base font-bold text-academic-deepGreen flex items-center mt-1">
                      <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                      Teacher Instruction Document
                    </h4>
                    <p className="text-xs text-academic-muted mt-0.5">
                      Supported formats: PDF (.pdf), PowerPoint (.ppt, .pptx), Word (.doc, .docx). Max 25 MB.
                    </p>
                  </div>

                  {selectedAssessment.status === 'published' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-academic-paleGreen text-academic-deepGreen border border-academic-border">
                      <Lock className="w-3.5 h-3.5 mr-1 text-academic-deepGreen" />
                      File Frozen (Published)
                    </span>
                  ) : null}
                </div>

                {/* Instruction File Card */}
                {hasInstructionFile ? (
                  <div className="p-4 rounded-lg bg-academic-paleGreen/30 border border-academic-border space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 rounded bg-academic-lightGreen text-academic-primaryGreen">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-academic-deepGreen text-sm">
                            {selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files[0]?.file_name) || 'Instruction-Document.pdf'}
                          </p>
                          <p className="text-[11px] text-academic-muted font-mono mt-0.5">
                            {selectedAssessment.document_size_bytes
                              ? `${(selectedAssessment.document_size_bytes / 1024).toFixed(1)} KB &bull; `
                              : ''}Uploaded Instruction File
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(selectedAssessment.id, selectedAssessment.document_filename || (selectedAssessment.instruction_files && selectedAssessment.instruction_files[0]?.file_name))}
                          disabled={downloadingDocId === selectedAssessment.id}
                          className="btn-secondary text-xs inline-flex items-center min-h-[40px]"
                        >
                          {downloadingDocId === selectedAssessment.id ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-academic-primaryGreen" />
                          ) : (
                            <Download className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          )}
                          <span>Download File</span>
                        </button>

                        {selectedAssessment.status === 'draft' && isTeacher && (
                          <button
                            type="button"
                            onClick={handleRemoveInstructionFile}
                            disabled={isSavingInstructionFile}
                            className="p-2 rounded text-academic-muted hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                            title="Remove instruction file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Embedded PDF Viewer if PDF */}
                    {(selectedAssessment.document_filename?.toLowerCase().endsWith('.pdf') || !selectedAssessment.document_filename) && selectedAssessment.document_storage_key && (
                      <div className="pt-2">
                        <React.Suspense fallback={<div className="flex items-center justify-center p-6"><Loader2 className="w-5 h-5 animate-spin text-academic-primaryGreen" /><span className="ml-2 text-xs text-academic-muted">Loading preview...</span></div>}>
                          <PdfViewer assessmentId={selectedAssessment.id} filename={selectedAssessment.document_filename} />
                        </React.Suspense>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 border-2 border-dashed border-academic-border rounded-lg text-center bg-academic-paleGreen/10 space-y-2">
                    <FileText className="w-10 h-10 text-academic-muted/40 mx-auto" />
                    <p className="text-xs font-semibold text-academic-deepGreen">
                      No instruction file uploaded yet
                    </p>
                    <p className="text-[11px] text-academic-muted max-w-md mx-auto">
                      An instruction document (PDF, PowerPoint, Word) is required before publishing a File-Based Assessment.
                    </p>
                  </div>
                )}

                {/* Upload or Replace Instruction File (Draft Mode) */}
                {selectedAssessment.status === 'draft' && isTeacher && (
                  <div className="p-4 rounded-lg bg-academic-paleGreen/20 border border-academic-border space-y-3">
                    <span className="font-bold text-academic-deepGreen text-xs block">
                      {hasInstructionFile ? 'Replace Instruction Document' : 'Upload Instruction Document'}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <label className="btn-secondary text-xs flex items-center cursor-pointer min-h-[40px] self-start">
                        <Upload className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                        <span>{draftInstructionFile ? 'Change Chosen File' : 'Choose Instruction File'}</span>
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx,.doc,.docx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={handleInstructionFileSelect}
                        />
                      </label>
                      <span className="text-[11px] text-academic-muted">
                        PDF, PPT, PPTX, DOC, DOCX up to 20 MB
                      </span>
                    </div>

                    {draftInstructionFile && (
                      <div className="p-2.5 rounded bg-academic-surface border border-academic-border flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-academic-primaryGreen" />
                          <span className="font-semibold text-academic-deepGreen text-xs">{draftInstructionFile.name}</span>
                          <span className="text-[11px] font-mono text-academic-muted">
                            ({(draftInstructionFile.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveInstructionFile}
                          disabled={isSavingInstructionFile}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          {isSavingInstructionFile ? 'Saving...' : 'Save File'}
                        </button>
                      </div>
                    )}

                    {draftInstructionError && (
                      <p className="text-[11px] font-semibold text-red-600">{draftInstructionError}</p>
                    )}

                    {/* Max Files Setting for Student Submissions */}
                    <div className="pt-3 border-t border-academic-border/60">
                      <label className="block font-semibold text-academic-deepGreen text-xs mb-1">
                        Max Answer Files Allowed per Student Submission (1 to 10)
                      </label>
                      <div className="flex items-center space-x-3 max-w-xs">
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={draftMaxFiles}
                          onChange={(e) => setDraftMaxFiles(Math.max(1, Math.min(10, Number(e.target.value))))}
                          className="px-3 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen w-24"
                        />
                        <button
                          type="button"
                          onClick={handleSaveInstructionFile}
                          disabled={isSavingInstructionFile}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          Update Limit
                        </button>
                      </div>
                      <p className="text-[10px] text-academic-muted mt-0.5">
                        Specifies how many answer files (PDF, PPT, PPTX, DOC, DOCX) students can upload.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'quiz' ? (
            /* TEACHER / STAFF: Quiz (MCQ) Configuration and Builder */
            <div className="space-y-4">
              <div className="card-surface p-5 border border-academic-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                  <div>
                    <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                      <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                      Quiz (Multiple Choice Questions)
                    </h3>
                    <p className="text-xs text-academic-muted mt-0.5">
                      Auto-scored upon submission. Total: {draftQuizQuestions.length} Questions &bull; {draftQuizQuestions.reduce((s, q) => s + (q.marks || 1), 0)} Marks
                    </p>
                  </div>
                  {selectedAssessment.status === 'published' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-academic-paleGreen text-academic-deepGreen border border-academic-border">
                      <Lock className="w-3.5 h-3.5 mr-1 text-academic-deepGreen" />
                      Quiz Frozen (Published)
                    </span>
                  ) : null}
                </div>

                {/* Auto-Scoring & Marks Advisory Banner */}
                <div className="p-3 bg-academic-paleGreen/40 border border-academic-border rounded-lg text-xs text-academic-deepGreen flex items-start space-x-2">
                  <HelpCircle className="w-4 h-4 text-academic-primaryGreen flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Auto-Scoring Policy:</strong> The system automatically grades student MCQ answers on submission. The auto-calculated quiz score is displayed to the subject teacher during evaluation as reference, but the teacher confirms and enters the authoritative final overall assessment mark.
                  </p>
                </div>

                {/* Quiz Questions List */}
                {draftQuizQuestions.length === 0 ? (
                  <div className="text-center py-8 text-academic-muted text-xs card-surface border border-dashed border-academic-border rounded-lg">
                    No MCQ quiz questions added yet. Use the question builder below to add questions with 4 options and 1 correct answer.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draftQuizQuestions.map((q, idx) => {
                      const isEditingThis = editingQuizQId === q.id;

                      return (
                        <div key={q.id || idx} className="p-4 rounded-lg border border-academic-border bg-academic-surface space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                                Q{idx + 1}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-academic-lightGreen text-academic-primaryGreen text-[10px] font-bold border border-academic-primaryGreen/20">
                                {q.marks || 1} {q.marks === 1 ? 'Mark' : 'Marks'}
                              </span>
                            </div>

                            {selectedAssessment.status === 'draft' && isTeacher && (
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveDraftQuizQuestion(idx, 'up')}
                                  disabled={isSavingQuiz || idx === 0}
                                  className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveDraftQuizQuestion(idx, 'down')}
                                  disabled={isSavingQuiz || idx === draftQuizQuestions.length - 1}
                                  className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === draftQuizQuestions.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDraftQuizQuestion(q)}
                                  disabled={isSavingQuiz}
                                  className="p-1 rounded text-academic-muted hover:text-academic-primaryGreen"
                                  title="Edit Question"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftQuizQuestion(idx)}
                                  disabled={isSavingQuiz}
                                  className="p-1 rounded text-academic-muted hover:text-red-700"
                                  title="Delete Question"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {isEditingThis ? (
                            /* Edit Form */
                            <div className="space-y-3 pt-1 border-t border-academic-border/60">
                              <div>
                                <label className="block text-xs font-semibold text-academic-deepGreen mb-1">Question Prompt</label>
                                <textarea
                                  rows={2}
                                  value={editingQuizPrompt}
                                  onChange={(e) => setEditingQuizPrompt(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-academic-primaryGreen rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-semibold text-academic-deepGreen">
                                  Options (Select the single correct answer):
                                </label>
                                {[0, 1, 2, 3].map((optIdx) => {
                                  const letter = String.fromCharCode(65 + optIdx);
                                  const isCorrect = editingQuizCorrectIndex === optIdx;

                                  return (
                                    <div key={optIdx} className={`p-2 rounded border flex items-center space-x-2 ${isCorrect ? 'border-academic-primaryGreen bg-academic-lightGreen/30' : 'border-academic-border bg-academic-surface'}`}>
                                      <input
                                        type="radio"
                                        name={`edit-correct-${q.id}`}
                                        checked={isCorrect}
                                        onChange={() => setEditingQuizCorrectIndex(optIdx)}
                                        className="text-academic-primaryGreen focus:ring-academic-primaryGreen"
                                      />
                                      <span className="font-bold text-academic-deepGreen text-xs w-4">{letter}.</span>
                                      <input
                                        type="text"
                                        value={editingQuizOptions[optIdx]}
                                        onChange={(e) => {
                                          const nextOpts = [...editingQuizOptions] as [string, string, string, string];
                                          nextOpts[optIdx] = e.target.value;
                                          setEditingQuizOptions(nextOpts);
                                        }}
                                        className="flex-1 px-2 py-1 text-xs border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                                        placeholder={`Option ${letter} text`}
                                      />
                                      {isCorrect && (
                                        <span className="text-[10px] font-bold text-academic-primaryGreen">✓ Correct</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-academic-deepGreen mb-1">Marks</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={editingQuizMarks}
                                    onChange={(e) => setEditingQuizMarks(Math.max(1, Number(e.target.value)))}
                                    className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-academic-deepGreen mb-1">Explanation (Optional)</label>
                                  <input
                                    type="text"
                                    value={editingQuizExplanation}
                                    onChange={(e) => setEditingQuizExplanation(e.target.value)}
                                    placeholder="Why this answer is correct..."
                                    className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end space-x-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingQuizQId(null);
                                    setEditingQuizPrompt('');
                                  }}
                                  className="px-2.5 py-1 text-xs text-academic-muted hover:text-academic-deepGreen"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditDraftQuizQuestion(idx)}
                                  disabled={isSavingQuiz}
                                  className="btn-primary text-xs py-1 px-3"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Display View */
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-academic-deepGreen leading-relaxed">
                                {q.question_text || (q as any).prompt}
                              </p>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {q.options && q.options.map((opt, optIdx) => {
                                  const letter = String.fromCharCode(65 + optIdx);
                                  const isCorrect = opt.id === q.correct_option_id;

                                  return (
                                    <div
                                      key={opt.id || optIdx}
                                      className={`p-2 rounded border text-xs flex items-center justify-between ${
                                        isCorrect
                                          ? 'bg-academic-lightGreen/50 border-academic-primaryGreen text-academic-deepGreen font-semibold'
                                          : 'bg-academic-surface border-academic-border text-academic-muted'
                                      }`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                          isCorrect ? 'bg-academic-primaryGreen text-white' : 'bg-academic-paleGreen text-academic-deepGreen'
                                        }`}>
                                          {letter}
                                        </span>
                                        <span>{opt.text}</span>
                                      </div>
                                      {isCorrect && (
                                        <span className="text-[10px] font-bold text-academic-primaryGreen flex items-center">
                                          <Check className="w-3 h-3 mr-0.5" />
                                          Correct
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {q.explanation && (
                                <div className="p-2 rounded bg-academic-paleGreen/30 text-[11px] text-academic-deepGreen border border-academic-border/60">
                                  <span className="font-bold">Explanation:</span> {q.explanation}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add MCQ Question Builder in Draft Mode */}
                {selectedAssessment.status === 'draft' && isTeacher && (
                  <div className="p-4 rounded-lg bg-academic-paleGreen/30 border border-academic-border space-y-3">
                    <h4 className="text-xs font-bold text-academic-deepGreen flex items-center">
                      <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Add MCQ Quiz Question
                    </h4>

                    <div>
                      <label className="block text-[11px] font-semibold text-academic-deepGreen mb-1">
                        Question Prompt *
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Enter the quiz question prompt or problem..."
                        value={newQuizPrompt}
                        onChange={(e) => setNewQuizPrompt(e.target.value)}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[11px] font-semibold text-academic-deepGreen">
                        Exactly 4 Answer Options * (Select the single radio button for the correct option)
                      </label>
                      {[0, 1, 2, 3].map((optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isCorrect = newQuizCorrectIndex === optIdx;

                        return (
                          <div key={optIdx} className={`p-2 rounded border flex items-center space-x-2 ${isCorrect ? 'border-academic-primaryGreen bg-academic-lightGreen/30' : 'border-academic-border bg-academic-surface'}`}>
                            <input
                              type="radio"
                              name="new-quiz-correct-option"
                              checked={isCorrect}
                              onChange={() => setNewQuizCorrectIndex(optIdx)}
                              className="text-academic-primaryGreen focus:ring-academic-primaryGreen cursor-pointer"
                            />
                            <span className="font-bold text-academic-deepGreen text-xs w-4">{letter}.</span>
                            <input
                              type="text"
                              value={newQuizOptions[optIdx]}
                              onChange={(e) => {
                                const next = [...newQuizOptions] as [string, string, string, string];
                                next[optIdx] = e.target.value;
                                setNewQuizOptions(next);
                              }}
                              placeholder={`Enter text for Option ${letter}...`}
                              className="flex-1 px-2.5 py-1 text-xs border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                            />
                            {isCorrect && (
                              <span className="text-[10px] font-bold text-academic-primaryGreen">✓ Correct Answer</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-academic-deepGreen mb-1">
                          Marks for this Question *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={newQuizMarks}
                          onChange={(e) => setNewQuizMarks(Math.max(1, Number(e.target.value)))}
                          className="w-full px-3 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-academic-deepGreen mb-1">
                          Explanation / Guidance (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Explanatory note shown after evaluation..."
                          value={newQuizExplanation}
                          onChange={(e) => setNewQuizExplanation(e.target.value)}
                          className="w-full px-3 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleAddDraftQuizQuestion}
                        disabled={isSavingQuiz || !newQuizPrompt.trim()}
                        className="btn-primary text-xs flex items-center min-h-[38px] px-4"
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                        <span>{isSavingQuiz ? 'Saving...' : 'Add Quiz Question'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* TEACHER / STAFF: Manual Questions Configuration and Builder */
            <div className="space-y-4">
              <div className="card-surface p-5 border border-academic-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                  <div>
                    <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                      Manual Questions ({draftQuestions.length})
                    </h3>
                    <p className="text-xs text-academic-muted mt-0.5">
                      Teacher-authored questions for this assignment. Evaluated using assignment rubric.
                    </p>
                  </div>
                  {selectedAssessment.status === 'published' ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-academic-paleGreen text-academic-deepGreen border border-academic-border">
                      <Lock className="w-3.5 h-3.5 mr-1 text-academic-deepGreen" />
                      Questions Frozen (Published)
                    </span>
                  ) : null}
                </div>

                {/* Question List */}
                {isLoadingDetails && draftQuestions.length === 0 ? (
                  <div className="flex items-center justify-center py-6 text-xs text-academic-muted space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                    <span>Loading questions...</span>
                  </div>
                ) : detailsError && draftQuestions.length === 0 ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between text-xs text-red-800">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>{detailsError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedAssessmentId && loadAssessmentDetails(selectedAssessmentId)}
                      className="btn-secondary text-[11px] px-2.5 py-1 h-auto inline-flex items-center"
                    >
                      <RotateCw className="w-3 h-3 mr-1 inline" />
                      Retry
                    </button>
                  </div>
                ) : draftQuestions.length === 0 ? (
                  <div className="text-center py-6 text-academic-muted text-xs card-surface border border-dashed border-academic-border rounded-lg">
                    No manual questions added yet. Use the question builder below to add questions.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draftQuestions.map((q, idx) => {
                      return (
                        <div key={q.id || idx} className="p-3.5 rounded-lg border border-academic-border bg-academic-surface space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                                Question {q.display_order || idx + 1}
                              </span>
                              {draftQuestions.length > 1 && (
                                <span className="text-[11px] text-academic-muted">
                                  of {draftQuestions.length}
                                </span>
                              )}
                            </div>
                            {selectedAssessment.status === 'draft' && isTeacher && (
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveDraftQuestion(idx, 'up')}
                                  disabled={isSavingQuestions || idx === 0}
                                  className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Question Up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveDraftQuestion(idx, 'down')}
                                  disabled={isSavingQuestions || idx === draftQuestions.length - 1}
                                  className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === draftQuestions.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Question Down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartEditDraftQuestion(q)}
                                  disabled={isSavingQuestions}
                                  className="p-1 rounded text-academic-muted hover:text-academic-primaryGreen"
                                  title="Edit Question"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDraftQuestion(idx)}
                                  disabled={isSavingQuestions}
                                  className="p-1 rounded text-academic-muted hover:text-red-700"
                                  title="Delete Question"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {editingDraftQId === (q.id || `temp-${q.display_order}`) ? (
                            <div className="space-y-2 pt-1">
                              <textarea
                                rows={3}
                                value={editingDraftQPrompt}
                                onChange={(e) => setEditingDraftQPrompt(e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-academic-primaryGreen rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none"
                              />
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDraftQId(null);
                                    setEditingDraftQPrompt('');
                                  }}
                                  className="px-2.5 py-1 text-xs text-academic-muted hover:text-academic-deepGreen"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditDraftQuestion(idx)}
                                  disabled={!editingDraftQPrompt.trim() || isSavingQuestions}
                                  className="btn-primary text-xs py-1 px-3"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-academic-deepGreen leading-relaxed whitespace-pre-wrap font-medium">
                              {q.prompt}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Question Form in Draft mode */}
                {selectedAssessment.status === 'draft' && isTeacher && (
                  <div className="p-4 rounded-lg bg-academic-paleGreen/30 border border-academic-border space-y-3">
                    <h4 className="text-xs font-bold text-academic-deepGreen flex items-center">
                      <PlusCircle className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Add Manual Question
                    </h4>
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        placeholder="Enter the question problem prompt, instructions, or scenario..."
                        value={inlineNewQPrompt}
                        onChange={(e) => setInlineNewQPrompt(e.target.value)}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen text-xs"
                      />
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={handleAddDraftQuestion}
                          disabled={isSavingQuestions || !inlineNewQPrompt.trim()}
                          className="btn-primary text-xs flex items-center min-h-[38px]"
                        >
                          <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                          <span>{isSavingQuestions ? 'Saving...' : 'Add Question'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      );
    })()}

      {/* MODAL: Submit Assignment Confirmation Summary */}
      {isConfirmSubmitOpen && selectedAssessment && (() => {
        const sub = assessmentSubmissions[0];
        const isResubmit = Boolean(sub);
        const nextVersion = isResubmit ? (sub?.active_version?.version || 1) + 1 : 1;
        const now = Date.now();
        const origDeadline = new Date(selectedAssessment.deadline_at).getTime();
        const extDeadline = selectedAssessment.allow_late && selectedAssessment.extension_deadline_at
          ? new Date(selectedAssessment.extension_deadline_at).getTime()
          : origDeadline;
        const isInLateWindow = !sub && now > origDeadline && now <= extDeadline;

        return (
          <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-academic-surface border border-academic-border rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-academic-border">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-lg bg-academic-lightGreen text-academic-primaryGreen">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-academic-deepGreen">
                      {isResubmit ? 'Confirm Assignment Resubmission' : 'Confirm Assignment Submission'}
                    </h3>
                    <p className="text-xs text-academic-muted">
                      Target Version: v{nextVersion}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSubmittingAnswers && setIsConfirmSubmitOpen(false)}
                  disabled={isSubmittingAnswers}
                  className="p-1.5 rounded-lg text-academic-muted hover:text-academic-deepGreen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary Items */}
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-academic-paleGreen/30 rounded border border-academic-border space-y-2">
                  <div className="flex justify-between">
                    <span className="text-academic-muted">Assignment:</span>
                    <span className="font-semibold text-academic-deepGreen text-right">{selectedAssessment.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-academic-muted">Deadline:</span>
                    <span className="font-mono text-academic-deepGreen">{new Date(selectedAssessment.deadline_at).toLocaleString()}</span>
                  </div>
                  {draftQuestions.length > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-academic-border/60">
                      <span className="text-academic-muted">Manual Questions Answered:</span>
                      <span className="font-bold text-academic-primaryGreen flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {draftQuestions.length} of {draftQuestions.length} answered
                      </span>
                    </div>
                  )}
                  {draftQuizQuestions.length > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-academic-border/60">
                      <span className="text-academic-muted">Quiz Questions Answered:</span>
                      <span className="font-bold text-academic-primaryGreen flex items-center">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {Object.keys(studentQuizAnswers).length} of {draftQuizQuestions.length} answered
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1 border-t border-academic-border/60">
                    <span className="text-academic-muted">Attached File(s):</span>
                    <span className="font-medium text-academic-deepGreen">
                      {studentAnswerFiles.length > 0 
                        ? studentAnswerFiles.map(f => f.name).join(', ')
                        : sub && !removeExistingUploadedFile && sub.active_version?.original_name
                        ? `${sub.active_version.original_name} (Retained from v${sub.active_version.version})`
                        : 'None (Text-only answers)'}
                    </span>
                  </div>
                </div>

                {isInLateWindow && (
                  <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded text-xs text-[#6D5200] flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-[#B28704] flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Warning - Late Submission:</strong> The official deadline has passed. Submitting now records a formal LATE timestamp and may apply late penalty deductions.
                    </span>
                  </div>
                )}

                <div className="p-3 bg-academic-paleGreen/20 rounded border border-academic-border text-[11px] text-academic-muted leading-relaxed">
                  Submitting records an authoritative timestamp. Further edits or resubmissions are only permitted before the original deadline.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setIsConfirmSubmitOpen(false)}
                  disabled={isSubmittingAnswers}
                  className="btn-secondary text-xs min-h-[40px] px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFinalSubmission}
                  disabled={isSubmittingAnswers}
                  className="btn-primary text-xs min-h-[40px] px-5 flex items-center"
                >
                  {isSubmittingAnswers ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>Submitting Assignment...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      <span>Confirm & Submit (v{nextVersion})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
        </div>
      ) : null}

      {/* MODAL 1: Create Assessment Modal (Document-Based & Late Policy) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <BookOpen className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Create New Assignment
              </h3>
              <button 
                onClick={() => !isCreating && setShowCreateModal(false)}
                disabled={isCreating}
                className="text-academic-muted hover:text-academic-deepGreen p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                title={isCreating ? "Cannot close while creating assignment" : "Close"}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Class & Subject Allocation *
                </label>
                <select
                  value={formClassSubjectId}
                  onChange={(e) => {
                    const newCsId = e.target.value;
                    setFormClassSubjectId(newCsId);
                    setFormTitle(computeNextTitleForSubject(newCsId));
                  }}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                >
                  {availableClassSubjects.length > 0 ? (
                    availableClassSubjects.map((cs) => (
                      <option key={cs.id} value={cs.id}>
                        {cs.class ? formatClassName(cs.class) : (cs.class_name?.startsWith('MCA') ? 'MCA Semester 3' : (cs.class_name || 'Class'))} — {cs.subject ? `${cs.subject.code} ${cs.subject.name}` : (cs.subject_name || 'Subject')}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="c5100000-0000-0000-0000-000000000001">
                        MCA Semester 3 — MCA301 Analysis and Design of Algorithms
                      </option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assessment Title (Auto-generated)
                </label>
                <div className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface/60 text-academic-deepGreen font-semibold min-h-[44px] flex items-center justify-between">
                  <span className="text-sm">{formTitle || computeNextTitleForSubject(formClassSubjectId)}</span>
                  <span className="text-[11px] font-normal text-academic-primaryGreen bg-academic-primaryGreen/10 border border-academic-primaryGreen/20 px-2.5 py-0.5 rounded-full">
                    Auto-numbered
                  </span>
                </div>
              </div>

              {/* Assessment Types Selector */}
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1.5">
                  Assessment Types * (Select one, two, or all three)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* File-Based Assessment Option */}
                  <label
                    className={`flex flex-col justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      formAssessmentTypes.includes('file_based')
                        ? 'border-academic-primaryGreen bg-academic-lightGreen/40 ring-1 ring-academic-primaryGreen'
                        : 'border-academic-border bg-academic-surface hover:bg-academic-paleGreen/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded bg-academic-paleGreen text-academic-primaryGreen">
                        <FileText className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={formAssessmentTypes.includes('file_based')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormAssessmentTypes(prev => [...prev, 'file_based']);
                          } else {
                            if (formAssessmentTypes.length > 1) {
                              setFormAssessmentTypes(prev => prev.filter(t => t !== 'file_based'));
                            }
                          }
                        }}
                        className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen mt-0.5"
                      />
                    </div>
                    <div className="mt-2">
                      <span className="font-bold text-academic-deepGreen text-xs block">File-Based</span>
                      <p className="text-[10px] text-academic-muted mt-0.5 leading-snug">
                        Upload brief (PDF/PPT/DOC). Students upload answer files.
                      </p>
                    </div>
                  </label>

                  {/* Manual Questions Option */}
                  <label
                    className={`flex flex-col justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      formAssessmentTypes.includes('manual_questions')
                        ? 'border-academic-primaryGreen bg-academic-lightGreen/40 ring-1 ring-academic-primaryGreen'
                        : 'border-academic-border bg-academic-surface hover:bg-academic-paleGreen/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded bg-academic-paleGreen text-academic-primaryGreen">
                        <Pencil className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={formAssessmentTypes.includes('manual_questions')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormAssessmentTypes(prev => [...prev, 'manual_questions']);
                          } else {
                            if (formAssessmentTypes.length > 1) {
                              setFormAssessmentTypes(prev => prev.filter(t => t !== 'manual_questions'));
                            }
                          }
                        }}
                        className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen mt-0.5"
                      />
                    </div>
                    <div className="mt-2">
                      <span className="font-bold text-academic-deepGreen text-xs block">Manual Questions</span>
                      <p className="text-[10px] text-academic-muted mt-0.5 leading-snug">
                        Author custom questions. Students submit written responses.
                      </p>
                    </div>
                  </label>

                  {/* Quiz (MCQ) Option */}
                  <label
                    className={`flex flex-col justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      formAssessmentTypes.includes('quiz')
                        ? 'border-academic-primaryGreen bg-academic-lightGreen/40 ring-1 ring-academic-primaryGreen'
                        : 'border-academic-border bg-academic-surface hover:bg-academic-paleGreen/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded bg-academic-paleGreen text-academic-primaryGreen">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={formAssessmentTypes.includes('quiz')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormAssessmentTypes(prev => [...prev, 'quiz']);
                          } else {
                            if (formAssessmentTypes.length > 1) {
                              setFormAssessmentTypes(prev => prev.filter(t => t !== 'quiz'));
                            }
                          }
                        }}
                        className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen mt-0.5"
                      />
                    </div>
                    <div className="mt-2">
                      <span className="font-bold text-academic-deepGreen text-xs block">Quiz (MCQ)</span>
                      <p className="text-[10px] text-academic-muted mt-0.5 leading-snug">
                        Multiple-choice questions with 4 options and automatic scoring.
                      </p>
                    </div>
                  </label>
                </div>
                {formAssessmentTypes.length === 0 && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">Please select at least one assessment type.</p>
                )}
                <div className="p-2.5 rounded bg-academic-paleGreen/40 border border-academic-border text-[11px] text-academic-muted mt-2">
                  ℹ️ <strong>Draft Workflow:</strong> Creating this assignment saves it as a <strong>Draft</strong>. You will configure the selected sections (instruction documents, questions, quiz, and rubric) in the configuration workspace before publishing to students.
                </div>
              </div>

              {/* Deadlines and File Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-academic-deepGreen mb-1">
                    Original Submission Deadline *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-academic-deepGreen mb-1">
                    Max Answer Files per Submission *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={formMaxFiles}
                    onChange={(e) => setFormMaxFiles(Math.max(1, Math.min(10, Number(e.target.value))))}
                    className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                  />
                  <p className="text-[10px] text-academic-muted mt-0.5">Students can submit up to this number of files (1-10).</p>
                </div>
              </div>

              {/* Late Submission Policy */}
              <div className="p-3 border border-academic-border rounded bg-academic-paleGreen/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-academic-deepGreen text-xs">
                    Late Submission Policy
                  </span>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formAllowLate}
                      onChange={(e) => setFormAllowLate(e.target.checked)}
                      className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen"
                    />
                    <span className="font-semibold text-academic-deepGreen text-xs">Allow Late Submissions</span>
                  </label>
                </div>

                {formAllowLate && (
                  <div className="space-y-3 pt-2 border-t border-academic-border/60">
                    <div>
                      <label className="block font-semibold text-academic-deepGreen mb-1">
                        Extension Deadline * (Must be later than original deadline)
                      </label>
                      <input
                        type="datetime-local"
                        required={formAllowLate}
                        value={formExtensionDeadline}
                        onChange={(e) => setFormExtensionDeadline(e.target.value)}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-academic-deepGreen mb-1">
                          Late Penalty Mode
                        </label>
                        <select
                          value={formLatePenaltyMode}
                          onChange={(e) => setFormLatePenaltyMode(e.target.value as any)}
                          className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                        >
                          <option value="none">No Automatic Deduction (Teacher Discretion)</option>
                          <option value="fixed">Fixed Marks Deduction</option>
                        </select>
                      </div>

                      {formLatePenaltyMode === 'fixed' && (
                        <div>
                          <label className="block font-semibold text-academic-deepGreen mb-1">
                            Penalty Marks (e.g. 5 or 10)
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="1"
                              max={formMaxMarks}
                              value={formLatePenaltyMarks}
                              onChange={(e) => setFormLatePenaltyMarks(Number(e.target.value))}
                              className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                            />
                            <div className="flex space-x-1">
                              <button
                                type="button"
                                onClick={() => setFormLatePenaltyMarks(5)}
                                className={`px-2 py-1 text-xs rounded border ${formLatePenaltyMarks === 5 ? 'bg-academic-deepGreen text-white' : 'btn-secondary'}`}
                              >
                                5
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormLatePenaltyMarks(10)}
                                className={`px-2 py-1 text-xs rounded border ${formLatePenaltyMarks === 10 ? 'bg-academic-deepGreen text-white' : 'btn-secondary'}`}
                              >
                                10
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Submission Instructions & Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Handwritten answers on lined pages or typed slide decks. Submit before the deadline."
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  className="btn-secondary text-xs min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="btn-primary text-xs min-h-[44px] flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                >
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin mr-2 flex-shrink-0" />}
                  <span>{isCreating ? (creationStage || 'Creating Assignment...') : 'Create Assignment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Publish Checklist & Confirmation Modal */}
      {showPublishConfirmModal && selectedAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Publish Assessment Verification
              </h3>
              <button 
                onClick={() => setShowPublishConfirmModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-academic-deepGreen">
                Publishing locks this assessment and opens it for student submissions:
              </p>

              {/* Requirement Checklist */}
              <div className="space-y-2 p-3 bg-academic-paleGreen/30 rounded border border-academic-border">
                {checklist.errors.length === 0 ? (
                  <div className="flex items-start space-x-2 text-academic-primaryGreen">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      All publication requirements passed: Assessment content is configured, rubric totals 50 marks, and deadline is set.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-red-700">
                    <span className="font-bold flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1 text-red-600" />
                      Publication Blockers ({checklist.errors.length}):
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-[11px]">
                      {checklist.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Audience Targeting Selection */}
              {checklist.valid && (
                <div className="space-y-3 pt-2 border-t border-academic-border">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-academic-deepGreen flex items-center text-xs">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Target Audience
                    </label>
                    <span className="text-[11px] text-academic-muted">
                      {loadingEligibleStudents ? 'Loading cohort...' : `${eligibleStudents.length} eligible students`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Option 1: All Students */}
                    <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
                      publishAudience === 'all'
                        ? 'border-academic-primaryGreen bg-academic-lightGreen/50 shadow-sm'
                        : 'border-academic-border bg-academic-surface hover:border-academic-primaryGreen/40'
                    }`}>
                      <input
                        type="radio"
                        name="publishAudience"
                        value="all"
                        checked={publishAudience === 'all'}
                        onChange={() => setPublishAudience('all')}
                        className="mt-0.5 text-academic-primaryGreen focus:ring-academic-primaryGreen"
                      />
                      <div className="ml-2.5">
                        <span className="font-bold text-academic-deepGreen block text-xs">All Students</span>
                        <span className="text-[11px] text-academic-muted block mt-0.5">
                          Publish to all {eligibleStudents.length} actively enrolled Security stream students in this class.
                        </span>
                      </div>
                    </label>

                    {/* Option 2: Specific Students */}
                    <label className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
                      publishAudience === 'selected'
                        ? 'border-academic-primaryGreen bg-academic-lightGreen/50 shadow-sm'
                        : 'border-academic-border bg-academic-surface hover:border-academic-primaryGreen/40'
                    }`}>
                      <input
                        type="radio"
                        name="publishAudience"
                        value="selected"
                        checked={publishAudience === 'selected'}
                        onChange={() => setPublishAudience('selected')}
                        className="mt-0.5 text-academic-primaryGreen focus:ring-academic-primaryGreen"
                      />
                      <div className="ml-2.5">
                        <span className="font-bold text-academic-deepGreen block text-xs">Selected Students</span>
                        <span className="text-[11px] text-academic-muted block mt-0.5">
                          Select specific individual students. Unselected students will have zero access.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Student Selector Interface (when Selected Students is chosen) */}
                  {publishAudience === 'selected' && (
                    <div className="mt-3 p-3 bg-academic-paleGreen/20 rounded-lg border border-academic-border space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        {/* Search Bar */}
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-academic-muted" />
                          <input
                            type="text"
                            placeholder="Search by student name or USN..."
                            value={studentSearchQuery}
                            onChange={(e) => setStudentSearchQuery(e.target.value)}
                            className="input-base pl-8 py-1 text-xs w-full"
                          />
                          {studentSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setStudentSearchQuery('')}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-academic-muted hover:text-academic-deepGreen"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Quick Selection Actions */}
                        <div className="flex items-center space-x-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              const matchingIds = eligibleStudents
                                .filter(st => {
                                  if (!studentSearchQuery) return true;
                                  const q = studentSearchQuery.toLowerCase();
                                  return (
                                    (st.full_name || '').toLowerCase().includes(q) ||
                                    (st.usn || '').toLowerCase().includes(q)
                                  );
                                })
                                .map(st => st.student_id);
                              setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...matchingIds])));
                            }}
                            className="px-2 py-1 rounded bg-academic-lightGreen text-academic-deepGreen hover:bg-academic-primaryGreen/20 border border-academic-border"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedStudentIds([])}
                            className="px-2 py-1 rounded bg-academic-surface text-academic-muted hover:text-academic-deepGreen border border-academic-border"
                          >
                            Clear
                          </button>
                          <span className="font-semibold text-academic-deepGreen ml-1">
                            {selectedStudentIds.length} / {eligibleStudents.length} selected
                          </span>
                        </div>
                      </div>

                      {/* Student Table */}
                      <div className="border border-academic-border rounded overflow-hidden max-h-48 overflow-y-auto bg-academic-surface">
                        {loadingEligibleStudents ? (
                          <div className="p-4 text-center text-academic-muted flex items-center justify-center space-x-2">
                            <Loader2 className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                            <span>Loading eligible Security stream students...</span>
                          </div>
                        ) : eligibleStudents.length === 0 ? (
                          <div className="p-4 text-center text-academic-muted">
                            No active enrolled students found for this subject and class.
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead className="bg-academic-paleGreen/50 text-academic-deepGreen sticky top-0 border-b border-academic-border">
                              <tr>
                                <th className="p-2 w-8 text-center">
                                  <input
                                    type="checkbox"
                                    checked={
                                      eligibleStudents.length > 0 &&
                                      eligibleStudents.every(st => selectedStudentIds.includes(st.student_id))
                                    }
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStudentIds(eligibleStudents.map(st => st.student_id));
                                      } else {
                                        setSelectedStudentIds([]);
                                      }
                                    }}
                                    className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen"
                                  />
                                </th>
                                <th className="p-2 font-semibold">USN</th>
                                <th className="p-2 font-semibold">Student Name</th>
                                <th className="p-2 font-semibold">Specialization</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-academic-border/60">
                              {eligibleStudents
                                .filter(st => {
                                  if (!studentSearchQuery) return true;
                                  const q = studentSearchQuery.toLowerCase();
                                  return (
                                    (st.full_name || '').toLowerCase().includes(q) ||
                                    (st.usn || '').toLowerCase().includes(q)
                                  );
                                })
                                .map((st) => {
                                  const isSelected = selectedStudentIds.includes(st.student_id);
                                  return (
                                    <tr
                                      key={st.student_id}
                                      onClick={() => {
                                        setSelectedStudentIds(prev =>
                                          prev.includes(st.student_id)
                                            ? prev.filter(id => id !== st.student_id)
                                            : [...prev, st.student_id]
                                        );
                                      }}
                                      className={`cursor-pointer transition-colors ${
                                        isSelected ? 'bg-academic-lightGreen/40' : 'hover:bg-academic-paleGreen/20'
                                      }`}
                                    >
                                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {
                                            setSelectedStudentIds(prev =>
                                              prev.includes(st.student_id)
                                                ? prev.filter(id => id !== st.student_id)
                                                : [...prev, st.student_id]
                                            );
                                          }}
                                          className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen"
                                        />
                                      </td>
                                      <td className="p-2 font-mono font-medium text-academic-deepGreen">
                                        {st.usn}
                                      </td>
                                      <td className="p-2 font-medium text-academic-deepGreen">
                                        {st.full_name}
                                      </td>
                                      <td className="p-2 text-academic-muted">
                                        <span className="px-1.5 py-0.5 rounded bg-academic-paleGreen text-[10px] text-academic-deepGreen border border-academic-border font-medium">
                                          {st.specialization_name || st.specialization_code || 'Security'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Zero Selection Validation Warning */}
                      {selectedStudentIds.length === 0 && (
                        <div className="flex items-center space-x-1.5 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>At least 1 student must be selected to publish this assessment.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setShowPublishConfirmModal(false)}
                className="btn-secondary text-xs min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !checklist.valid ||
                  (publishAudience === 'selected' && selectedStudentIds.length === 0) ||
                  isPublishing
                }
                onClick={handlePublishAssessment}
                className={`btn-primary text-xs min-h-[44px] flex items-center ${
                  !checklist.valid || (publishAudience === 'selected' && selectedStudentIds.length === 0) || isPublishing
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    <span>
                      {publishAudience === 'selected'
                        ? `Publish to ${selectedStudentIds.length} Student${selectedStudentIds.length === 1 ? '' : 's'}`
                        : 'Confirm & Publish to All'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL 3: Edit Assessment Modal */}
      {editingAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <Pencil className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Edit Assignment: {editingAssessment.title}
              </h3>
              <button 
                onClick={() => setEditingAssessment(null)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Historical Records Warning */}
            {editSubmissionsCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start space-x-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Academic Integrity Notice</p>
                  <p className="text-[11px] mt-0.5">
                    This assessment already has <strong>{editSubmissionsCount} student submission(s)</strong>.
                    Updated deadlines and late policies apply to new submissions; previously submitted student files, rubric evaluations, and published grades will remain protected and preserved.
                  </p>
                </div>
              </div>
            )}

            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditAssessment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assignment Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
              </div>

              {/* Assignment PDF Replacement */}
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assignment PDF Document
                </label>
                <div className="p-3 border border-academic-border rounded bg-academic-paleGreen/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="btn-secondary text-xs flex items-center cursor-pointer min-h-[40px]">
                      <Upload className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      <span>{isReplacingPdf ? 'Select Another PDF' : 'Replace Assignment PDF'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleEditPdfSelect}
                      />
                    </label>
                    {isReplacingPdf && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsReplacingPdf(false);
                          setEditPdfFileName(editingAssessment.document_filename || null);
                          setEditPdfFileSize(editingAssessment.document_size_bytes || null);
                          setEditPdfBase64(null);
                        }}
                        className="text-[11px] font-semibold text-academic-muted hover:text-red-700 underline"
                      >
                        Keep Existing PDF
                      </button>
                    )}
                  </div>

                  {editPdfFileName && (
                    <div className="p-2 rounded bg-academic-surface border border-academic-border flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">{editPdfFileName}</span>
                        <span className="text-[11px] font-mono text-academic-muted">
                          ({editPdfFileSize ? (editPdfFileSize / 1024).toFixed(1) : 0} KB)
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-academic-primaryGreen">
                        {isReplacingPdf ? '✓ Replacement Ready' : 'Current Active PDF'}
                      </span>
                    </div>
                  )}

                  {editPdfError && (
                    <p className="text-[11px] font-semibold text-red-700">{editPdfError}</p>
                  )}
                </div>
              </div>

              {/* Deadlines and File Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-academic-deepGreen mb-1">
                    Original Submission Deadline *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-academic-deepGreen mb-1">
                    Max Marks *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={editMaxMarks}
                    onChange={(e) => setEditMaxMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Max Answer Files per Submission (1-10) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  required
                  value={editMaxFiles}
                  onChange={(e) => setEditMaxFiles(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
              </div>

              {/* Late Submission Policy */}
              <div className="p-3 border border-academic-border rounded bg-academic-paleGreen/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-academic-deepGreen text-xs">
                    Late Submission Policy
                  </span>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editAllowLate}
                      onChange={(e) => setEditAllowLate(e.target.checked)}
                      className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen"
                    />
                    <span className="font-semibold text-academic-deepGreen text-xs">Allow Late Submissions</span>
                  </label>
                </div>

                {editAllowLate && (
                  <div className="space-y-3 pt-2 border-t border-academic-border/60">
                    <div>
                      <label className="block font-semibold text-academic-deepGreen mb-1">
                        Extension Deadline * (Must be later than original deadline)
                      </label>
                      <input
                        type="datetime-local"
                        required={editAllowLate}
                        value={editExtensionDeadline}
                        onChange={(e) => setEditExtensionDeadline(e.target.value)}
                        className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-academic-deepGreen mb-1">
                          Late Penalty Mode
                        </label>
                        <select
                          value={editLatePenaltyMode}
                          onChange={(e) => setEditLatePenaltyMode(e.target.value as any)}
                          className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                        >
                          <option value="none">No Automatic Deduction (Teacher Discretion)</option>
                          <option value="fixed">Fixed Marks Deduction</option>
                        </select>
                      </div>

                      {editLatePenaltyMode === 'fixed' && (
                        <div>
                          <label className="block font-semibold text-academic-deepGreen mb-1">
                            Penalty Marks
                          </label>
                          <input
                            type="number"
                            min="1"
                            max={editMaxMarks}
                            value={editLatePenaltyMarks}
                            onChange={(e) => setEditLatePenaltyMarks(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Submission Instructions & Notes
                </label>
                <textarea
                  rows={3}
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setEditingAssessment(null)}
                  className="btn-secondary text-xs min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="btn-primary text-xs min-h-[44px] flex items-center"
                >
                  {isSavingEdit && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  <span>{isSavingEdit ? 'Saving Changes...' : 'Save Assessment Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Assessment Confirmation Modal */}
      {deletingAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-red-700 flex items-center">
                <Trash2 className="w-4 h-4 mr-2 text-red-600" />
                Delete Assessment
              </h3>
              <button 
                onClick={() => setDeletingAssessment(null)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <p className="text-academic-deepGreen font-semibold">
                Are you sure you want to permanently delete <span className="font-bold underline text-red-700">{deletingAssessment.title}</span>?
              </p>

              {deleteCheckLoading ? (
                <div className="p-4 bg-academic-paleGreen/30 rounded border border-academic-border text-center text-academic-muted flex items-center justify-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                  <span>Checking academic records and storage files...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2 text-red-900">
                    <div className="flex items-center space-x-2 font-bold text-xs text-red-700">
                      <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>Irreversible Academic Deletion Warning</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      This action will permanently delete this assessment and all associated student submissions and evaluation records. This action <strong>cannot be undone</strong>.
                    </p>
                  </div>

                  {/* Summary of Associated Entities to be Removed */}
                  <div className="p-3 bg-academic-paleGreen/20 border border-academic-border rounded-lg space-y-1.5">
                    <span className="text-[11px] font-bold text-academic-deepGreen uppercase tracking-wider block">
                      Associated Records:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-academic-deepGreen">
                      <div className="flex items-center justify-between p-1.5 bg-white rounded border border-academic-border">
                        <span className="text-academic-muted">Student Submissions:</span>
                        <span className="font-bold text-red-700">{deleteCheckResult?.counts?.submissions ?? deleteCheckResult?.submissions_count ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 bg-white rounded border border-academic-border">
                        <span className="text-academic-muted">Recorded Evaluations:</span>
                        <span className="font-bold text-red-700">{deleteCheckResult?.counts?.evaluations ?? deleteCheckResult?.evaluations_count ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 bg-white rounded border border-academic-border">
                        <span className="text-academic-muted">Assignment Questions:</span>
                        <span className="font-bold text-academic-deepGreen">{deleteCheckResult?.counts?.questions ?? deletingAssessment.questions?.length ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 bg-white rounded border border-academic-border">
                        <span className="text-academic-muted">Storage & PDF Files:</span>
                        <span className="font-bold text-academic-deepGreen">{deleteCheckResult?.counts?.storage_files ?? (deletingAssessment.document_storage_key ? 1 : 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Password Confirmation Field */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-[11px] font-bold text-academic-deepGreen">
                      Institutional Password Confirmation <span className="text-red-600">*</span>
                    </label>
                    <p className="text-[11px] text-academic-muted">
                      Please enter your institutional login password to confirm identity and authorize permanent deletion.
                    </p>
                    <div className="relative">
                      <input
                        type={showDeletePassword ? 'text' : 'password'}
                        value={deletePassword}
                        onChange={(e) => {
                          setDeletePassword(e.target.value);
                          if (deleteError) setDeleteError(null);
                        }}
                        disabled={isDeleting || deleteCheckLoading}
                        placeholder="Enter institutional login password"
                        className="w-full px-3 py-2 pr-10 text-xs rounded border border-academic-border focus:border-red-600 focus:ring-1 focus:ring-red-600 outline-none bg-white font-mono"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeletePassword(prev => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-academic-muted hover:text-academic-deepGreen p-1"
                        tabIndex={-1}
                      >
                        {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {deleteStatusMessage && (
                <div className="p-2.5 bg-academic-paleGreen/30 border border-academic-primaryGreen/40 rounded text-academic-primaryGreen font-semibold text-[11px] flex items-center space-x-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  <span>{deleteStatusMessage}</span>
                </div>
              )}

              {deleteError && (
                <div className="p-2.5 bg-red-100 border border-red-300 rounded text-red-800 font-semibold text-[11px]">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeletingAssessment(null);
                  setDeletePassword('');
                  setDeleteError(null);
                }}
                className="btn-secondary text-xs min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteCheckLoading || !deletePassword.trim() || isDeleting}
                onClick={handleConfirmDelete}
                className={`px-4 py-2 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center min-h-[44px] ${
                  deleteCheckLoading || !deletePassword.trim() || isDeleting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isDeleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                <span>{isDeleting ? (deleteStatusMessage || 'Deleting...') : 'Confirm Permanent Deletion'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Official Assessment Marks Report PDF Generator Modal */}
      <AssessmentMarksReportModal
        isOpen={isReportPdfModalOpen}
        onClose={() => setIsReportPdfModalOpen(false)}
        activeRole="subject_teacher"
        defaultAssessmentId={selectedAssessmentId || undefined}
      />
    </div>
  );
};
