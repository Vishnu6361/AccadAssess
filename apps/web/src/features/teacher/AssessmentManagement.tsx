import React, { useState, useEffect, useMemo } from 'react';
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
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { PdfViewer } from '../../components/PdfViewer';
import { assessmentApi, AssessmentDTO, submissionApi, SubmissionDTO, authApi } from '../../services/apiClient';
import { formatClassName } from '@smartfa/contracts';
import { ProctorMenteeReport } from '../proctor/ProctorMenteeReport';

interface AssessmentManagementProps {
  activeRole: string;
  initialTab?: 'questions' | 'rubric' | 'submissions' | 'submissions_report' | 'late_reports';
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
  const [activeTab, setActiveTab] = useState<'questions' | 'rubric' | 'submissions' | 'submissions_report'>(
    activeRole === 'proctor' || initialTab === 'late_reports' || initialTab === 'submissions_report' ? 'submissions_report' : (initialTab || 'questions')
  );

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);

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
  const [formPdfFileName, setFormPdfFileName] = useState<string | null>(null);
  const [formPdfFileSize, setFormPdfFileSize] = useState<number | null>(null);
  const [formPdfBase64, setFormPdfBase64] = useState<string | null>(null);
  const [formPdfError, setFormPdfError] = useState<string | null>(null);

  // Question & Rubric Builders for Create Form
  const [formQuestions, setFormQuestions] = useState<ManualQuestionItem[]>([]);
  const [formRubricCriteria, setFormRubricCriteria] = useState<RubricCriterionItem[]>(DEFAULT_RUBRIC_CRITERIA);
  const [newFormQPrompt, setNewFormQPrompt] = useState('');
  const [editingFormQIndex, setEditingFormQIndex] = useState<number | null>(null);
  const [editingFormQPrompt, setEditingFormQPrompt] = useState<string>('');
  const [newFormCritTitle, setNewFormCritTitle] = useState('');
  const [newFormCritDesc, setNewFormCritDesc] = useState('');
  const [newFormCritMarks, setNewFormCritMarks] = useState<number>(10);

  // Selected Assessment - Draft Questions & Rubric Live State
  const [draftQuestions, setDraftQuestions] = useState<ManualQuestionItem[]>([]);
  const [draftRubricCriteria, setDraftRubricCriteria] = useState<RubricCriterionItem[]>([]);
  const [inlineNewQPrompt, setInlineNewQPrompt] = useState('');
  const [editingDraftQId, setEditingDraftQId] = useState<string | null>(null);
  const [editingDraftQPrompt, setEditingDraftQPrompt] = useState<string>('');
  const [inlineNewCritTitle, setInlineNewCritTitle] = useState('');
  const [inlineNewCritDesc, setInlineNewCritDesc] = useState('');
  const [inlineNewCritMarks, setInlineNewCritMarks] = useState<number>(10);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);
  const [isSavingRubric, setIsSavingRubric] = useState(false);

  // Student Multi-file Answer Submission State
  const [studentAnswerFiles, setStudentAnswerFiles] = useState<Array<{ file: File; name: string; size: number; base64: string }>>([]);
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState<boolean>(false);

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

  useEffect(() => {
    if (selectedAssessmentId) {
      loadSubmissions(selectedAssessmentId);
      assessmentApi.getAssessment(selectedAssessmentId).then((full) => {
        if (full) {
          setAssessments(prev => prev.map(a => a.id === full.id ? { ...a, ...full } : a));
          setDraftQuestions(full.questions || []);
          setDraftRubricCriteria(full.rubric?.criteria || []);
        }
      }).catch(err => {
        console.error('Failed to load full assessment details:', err);
      });
    }
  }, [selectedAssessmentId]);

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

  // Handle Assignment PDF File Selection in Create Modal
  const handleAssignmentPdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormPdfError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setFormPdfError('Only PDF files (.pdf) are accepted for the assignment document.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setFormPdfError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 20.00 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
      try {
        const binaryHeader = atob(base64.substring(0, 16));
        if (!binaryHeader.startsWith('%PDF-')) {
          setFormPdfError('Invalid PDF file signature. The file is not a valid PDF.');
          return;
        }
      } catch {
        setFormPdfError('Failed to read file signature.');
        return;
      }
      setFormPdfFileName(file.name);
      setFormPdfFileSize(file.size);
      setFormPdfBase64(base64);
    };
    reader.onerror = () => {
      setFormPdfError('Failed to read file from disk.');
    };
    reader.readAsDataURL(file);
  };

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

  // Form Rubric Sum and Draft Rubric Sum
  const formRubricSum = useMemo(() => {
    return formRubricCriteria.reduce((sum, c) => sum + Number(c.max_marks || c.max_score || 0), 0);
  }, [formRubricCriteria]);

  const draftRubricSum = useMemo(() => {
    return draftRubricCriteria.reduce((sum, c) => sum + Number(c.max_marks || c.max_score || 0), 0);
  }, [draftRubricCriteria]);

  // Form Question Handlers
  const handleAddFormQuestion = () => {
    if (!newFormQPrompt.trim()) return;
    setFormQuestions(prev => [
      ...prev,
      {
        prompt: newFormQPrompt.trim(),
        display_order: prev.length + 1
      }
    ]);
    setNewFormQPrompt('');
  };

  const handleRemoveFormQuestion = (index: number) => {
    setFormQuestions(prev => prev.filter((_, i) => i !== index).map((q, idx) => ({ ...q, display_order: idx + 1 })));
    if (editingFormQIndex === index) {
      setEditingFormQIndex(null);
      setEditingFormQPrompt('');
    }
  };

  const handleMoveFormQuestion = (index: number, direction: 'up' | 'down') => {
    setFormQuestions(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((q, idx) => ({ ...q, display_order: idx + 1 }));
    });
  };

  const handleStartEditFormQuestion = (index: number) => {
    setEditingFormQIndex(index);
    setEditingFormQPrompt(formQuestions[index].prompt);
  };

  const handleSaveEditFormQuestion = () => {
    if (editingFormQIndex === null || !editingFormQPrompt.trim()) return;
    setFormQuestions(prev => prev.map((q, idx) =>
      idx === editingFormQIndex ? { ...q, prompt: editingFormQPrompt.trim() } : q
    ));
    setEditingFormQIndex(null);
    setEditingFormQPrompt('');
  };

  // Form Rubric Handlers
  const handleAddFormCriterion = () => {
    if (!newFormCritTitle.trim()) return;
    setFormRubricCriteria(prev => [
      ...prev,
      {
        title: newFormCritTitle.trim(),
        criterion_title: newFormCritTitle.trim(),
        description: newFormCritDesc.trim(),
        display_order: prev.length + 1,
        max_marks: Number(newFormCritMarks || 10)
      }
    ]);
    setNewFormCritTitle('');
    setNewFormCritDesc('');
    setNewFormCritMarks(10);
  };

  const handleRemoveFormCriterion = (index: number) => {
    setFormRubricCriteria(prev => prev.filter((_, i) => i !== index));
  };

  const handleResetFormRubric = () => {
    setFormRubricCriteria(DEFAULT_RUBRIC_CRITERIA);
  };

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

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formTitle.trim()) {
      setErrorMessage('Assessment title is required.');
      return;
    }

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

    if (!formPdfBase64 && formQuestions.length === 0) {
      setErrorMessage('Please provide either an Assignment PDF document, at least one manual question, or both.');
      return;
    }

    if (formRubricCriteria.length === 0) {
      setErrorMessage('Assignment-level rubric is required. Add criteria or use the default template.');
      return;
    }

    try {
      const newAssessment = await assessmentApi.createAssessment({
        class_subject_id: formClassSubjectId,
        title: formTitle.trim(),
        instructions: formInstructions.trim() || 'Refer to the assignment document, questions, and evaluation rubric.',
        deadline_at: deadlineDate.toISOString(),
        max_marks: Number(formMaxMarks || 50),
        document_base64: formPdfBase64 || undefined,
        document_filename: formPdfFileName || undefined,
        max_files: Number(formMaxFiles || 1),
        allow_late: formAllowLate,
        extension_deadline_at: formAllowLate && formExtensionDeadline ? new Date(formExtensionDeadline).toISOString() : undefined,
        late_penalty_mode: formAllowLate ? formLatePenaltyMode : 'none',
        late_penalty_marks: formAllowLate && formLatePenaltyMode === 'fixed' ? Number(formLatePenaltyMarks || 5) : 0,
        questions: formQuestions.map((q, idx) => ({
          prompt: q.prompt.trim(),
          display_order: idx + 1
        })),
        rubric: {
          title: 'Assignment Evaluation Rubric',
          criteria: formRubricCriteria.map((c, idx) => ({
            id: c.id,
            title: (c.title || c.criterion_title || '').trim(),
            criterion_title: (c.criterion_title || c.title || '').trim(),
            description: c.description?.trim() || '',
            display_order: c.display_order || (idx + 1),
            max_marks: Number(c.max_marks || (c as any).max_score || 10)
          }))
        }
      });

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
      setFormPdfBase64(null);
      setFormPdfFileName(null);
      setFormPdfFileSize(null);
      setFormPdfError(null);
      setFormQuestions([]);
      setFormRubricCriteria(DEFAULT_RUBRIC_CRITERIA);
      await loadAssessments();
      setSelectedAssessmentId(newAssessment.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create assessment.');
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

    const allowedExts = ['.pdf', '.ppt', '.pptx'];
    for (const f of newFiles) {
      const ext = f.name.toLowerCase().substring(f.name.lastIndexOf('.'));
      if (!allowedExts.includes(ext)) {
        setErrorMessage(`Invalid file format: ${f.name}. Only PDF (.pdf), PowerPoint (.ppt), and PowerPoint XML (.pptx) are accepted.`);
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setErrorMessage(`File ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB) exceeds 10 MB limit.`);
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
      if (currentTotal + newTotal > 25 * 1024 * 1024) {
        setErrorMessage('Total submission size cannot exceed 25.00 MB.');
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

  const handleSubmitStudentAnswers = async () => {
    if (!selectedAssessment) return;
    if (studentAnswerFiles.length === 0) {
      setErrorMessage('Please select at least one answer file to submit.');
      return;
    }

    setIsSubmittingAnswers(true);
    setErrorMessage(null);
    try {
      const receipt = await submissionApi.uploadSubmission({
        assessment_id: selectedAssessment.id,
        files: studentAnswerFiles.map(f => ({
          file_name: f.name,
          file_base64: f.base64
        }))
      });

      const lateNotice = receipt.late_status === 'late' ? ' (LATE SUBMISSION recorded)' : ' (ON TIME)';
      setActionMessage(
        `Answer files successfully submitted! Version ${receipt.version} saved${lateNotice}. SHA-256: ${receipt.sha256.substring(0, 16)}...`
      );
      setStudentAnswerFiles([]);
      setSubmissionStatuses(prev => ({
        ...prev,
        [selectedAssessment.id]: {
          state: 'submitted',
          submission: null
        }
      }));
      await loadSubmissions(selectedAssessment.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed.');
    } finally {
      setIsSubmittingAnswers(false);
    }
  };

  // Publish Assessment
  const handlePublishAssessment = async () => {
    if (!selectedAssessment) return;
    setErrorMessage(null);

    try {
      const published = await assessmentApi.publishAssessment(selectedAssessment.id);
      setActionMessage(`Assessment "${published.title}" has been published and locked. It is now open for student submissions.`);
      setShowPublishConfirmModal(false);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Publication check failed.');
      setShowPublishConfirmModal(false);
    }
  };

  // Publication checklist: Supports PDF, manual questions, or both, plus assignment-level rubric summing to 50
  const publicationChecklist = () => {
    if (!selectedAssessment) return { valid: false, errors: [] };
    const errors: string[] = [];

    // 1. Content check: Assessment must have PDF, manual questions, or both
    const hasDoc = Boolean(selectedAssessment.document_storage_key || selectedAssessment.document_filename);
    const questions = selectedAssessment.questions || [];
    const hasQuestions = Array.isArray(questions) && questions.length > 0;

    if (!hasDoc && !hasQuestions) {
      errors.push('Assessment must include an assignment document (PDF), manual questions, or both.');
    }

    // 2. Assignment-Level Rubric check: must exist and criteria total exactly 50
    const criteria = selectedAssessment.rubric?.criteria || [];
    if (criteria.length === 0) {
      errors.push('Assessment requires an assignment-level rubric with at least one criterion.');
    } else {
      const sum = criteria.reduce((acc: number, c: any) => acc + Number(c.max_marks || c.max_score || 0), 0);
      if (Math.abs(sum - 50) > 0.001) {
        errors.push(`Rubric criteria total (${sum} marks) must equal exactly 50 marks before publishing.`);
      }
    }

    // 3. Submission deadline must be in the future
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
              <strong>Offline Mock Mode:</strong> The backend API server (http://localhost:4000) is unreachable. Displaying read-only preview data.
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
                onClick={() => setShowCreateModal(true)}
                className="btn-primary text-xs flex items-center self-start sm:self-auto min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                <span>New Assignment</span>
              </button>
            )}
          </div>

          {/* Top Level Staff Tab Switcher (Assessments vs Submissions Report) */}
          {isStaff && activeRole !== 'proctor' && (
            <div className="flex border-b border-academic-border gap-2">
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
                      onClick={() => setShowCreateModal(true)}
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
                    const isDocBased = Boolean(ass.document_storage_key);

                    return (
                      <div 
                        key={ass.id} 
                        className="card-surface flex flex-col justify-between hover:border-academic-primaryGreen/50 transition-all cursor-pointer group"
                        onClick={() => setSelectedAssessmentId(ass.id)}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex items-center space-x-2">
                              {isTeacher ? (
                                <>
                                  <StatusBadge 
                                    label={ass.status.toUpperCase()} 
                                    variant={isPublished ? 'published' : isDraft ? 'draft' : 'neutral'} 
                                  />
                                  {isDocBased && (
                                    <span className="text-[10px] font-bold text-academic-primaryGreen bg-academic-lightGreen px-2 py-0.5 rounded border border-academic-primaryGreen/30">
                                      PDF-Based
                                    </span>
                                  )}
                                </>
                              ) : isStudent ? (
                                renderStudentSubmissionBadge(ass.id)
                              ) : (
                                <StatusBadge 
                                  label={ass.status.toUpperCase()} 
                                  variant={isPublished ? 'published' : isDraft ? 'draft' : 'neutral'} 
                                />
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-academic-muted bg-academic-paleGreen px-2 py-0.5 rounded border border-academic-border">
                              v{ass.version || 1}
                            </span>
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
                            <span className="flex items-center">
                              <Layers className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                              {isDocBased ? `Max ${ass.max_files || 1} File(s) • ${ass.max_marks || 50} Marks` : `${ass.questions?.length || 0} Questions`}
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
          <div className="card-surface space-y-4">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-bold text-academic-deepGreen">
                    {selectedAssessment.title}
                  </h2>
                  {selectedAssessment.document_storage_key && (
                    <span className="text-[10px] font-bold text-academic-primaryGreen bg-academic-lightGreen px-2 py-0.5 rounded border border-academic-primaryGreen/30">
                      Document-Based
                    </span>
                  )}
                </div>
                <p className="text-xs text-academic-muted mt-1">
                  Class: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.class_details || 'MCA'}</span> • 
                  Subject: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.subject_details || 'Subject'}</span>
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {selectedAssessment.document_storage_key && (
                  <button
                    type="button"
                    onClick={() => handleDownloadDocument(selectedAssessment.id, selectedAssessment.document_filename)}
                    disabled={downloadingDocId === selectedAssessment.id}
                    className="btn-secondary text-xs flex items-center min-h-[44px]"
                    title="Download PDF for offline access"
                  >
                    {downloadingDocId === selectedAssessment.id ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-academic-primaryGreen" />
                    ) : (
                      <Download className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                    )}
                    <span>Assignment PDF</span>
                  </button>
                )}

                {isTeacher && selectedAssessment.status === 'draft' && (
                  <button
                    onClick={() => setShowPublishConfirmModal(true)}
                    className="btn-primary text-xs flex items-center self-start min-h-[44px]"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    <span>Publish Assessment</span>
                  </button>
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
                  Max Files: <span className="font-bold">{selectedAssessment.max_files || 1} file(s)</span> (PDF, PPT, PPTX)
                </p>
                <p className="text-[10px] text-academic-muted">
                  Total Marks: {selectedAssessment.max_marks || 50} Marks
                </p>
              </div>
            </div>
          </div>

          {/* Assessment Detail Tab Switcher */}
          <div className="flex border-b border-academic-border gap-2">
            <button
              onClick={() => setActiveTab('questions')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors ${
                activeTab === 'questions'
                  ? 'border-academic-primaryGreen text-academic-deepGreen'
                  : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
            >
              Document & Questions
            </button>
            <button
              onClick={() => setActiveTab('rubric')}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors flex items-center space-x-1.5 ${
                activeTab === 'rubric'
                  ? 'border-academic-primaryGreen text-academic-deepGreen'
                  : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
              }`}
            >
              <span>Assignment Rubric</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                Math.abs(draftRubricSum - 50) < 0.001
                  ? 'bg-academic-lightGreen text-academic-primaryGreen'
                  : 'bg-[#FDF6E2] text-[#A63214]'
              }`}>
                {draftRubricSum}/50
              </span>
            </button>
            {isTeacher && selectedAssessment.status === 'published' && (
              <button
                onClick={() => setActiveTab('submissions')}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 min-h-[44px] transition-colors ${
                  activeTab === 'submissions'
                    ? 'border-academic-primaryGreen text-academic-deepGreen'
                    : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                }`}
              >
                Student Submissions ({assessmentSubmissions.length})
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
              {draftRubricCriteria.length === 0 ? (
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
          ) : (
            /* Document-Based Assessment Details / Questions View */
            <div className="space-y-4">
              {/* Document Banner */}
              {selectedAssessment.document_storage_key ? (
                <div className="card-surface p-5 border border-academic-border space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                    <div className="space-y-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-academic-primaryGreen">
                        Authoritative Assignment Document
                      </span>
                      <h4 className="text-base font-bold text-academic-deepGreen flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                        {selectedAssessment.document_filename || 'Assignment Document.pdf'}
                      </h4>
                      {selectedAssessment.document_size_bytes && (
                        <p className="text-[11px] text-academic-muted font-mono">
                          Size: {(selectedAssessment.document_size_bytes / 1024).toFixed(1)} KB • PDF Format
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadDocument(selectedAssessment.id, selectedAssessment.document_filename)}
                      disabled={downloadingDocId === selectedAssessment.id}
                      className="btn-secondary text-xs inline-flex items-center self-start sm:self-auto min-h-[44px]"
                      title="Download PDF for offline access"
                    >
                      {downloadingDocId === selectedAssessment.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin text-academic-primaryGreen" />
                      ) : (
                        <Download className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                      )}
                      <span>Download PDF</span>
                    </button>
                  </div>

                  <p className="text-xs text-academic-muted leading-relaxed">
                    This PDF contains all authoritative questions, instructions, and grading rubrics. You can read the assignment directly below or download a copy for offline access.
                  </p>

                  {/* Embedded PDF Viewer */}
                  <div className="pt-2">
                    <PdfViewer
                      assessmentId={selectedAssessment.id}
                      filename={selectedAssessment.document_filename}
                    />
                  </div>
                </div>
              ) : null}

              {/* Manual Questions Section (Shown alongside PDF or as standalone question set) */}
              <div className="card-surface p-5 border border-academic-border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-academic-border">
                  <div>
                    <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                      <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                      Manual Questions ({draftQuestions.length})
                    </h3>
                    <p className="text-xs text-academic-muted mt-0.5">
                      Teacher-authored questions for this assignment.
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
                {draftQuestions.length === 0 ? (
                  <div className="text-center py-6 text-academic-muted text-xs">
                    No manual questions added. {selectedAssessment.document_storage_key ? 'Students refer to the uploaded Assignment PDF document.' : 'Add manual questions below or upload an assignment PDF document.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draftQuestions.map((q, idx) => (
                      <div key={q.id || idx} className="p-3.5 rounded-lg border border-academic-border bg-academic-surface space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                              Q{q.display_order || idx + 1}
                            </span>
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
                    ))}
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

              {/* Student Multi-File Submission Panel */}
              {isStudent && selectedAssessment.status === 'published' && (() => {
                const sub = assessmentSubmissions[0];
                const now = Date.now();
                const origDeadline = new Date(selectedAssessment.deadline_at).getTime();
                const extDeadline = selectedAssessment.allow_late && selectedAssessment.extension_deadline_at
                  ? new Date(selectedAssessment.extension_deadline_at).getTime()
                  : origDeadline;
                const isWindowClosed = now > extDeadline;
                const isInExtensionWindow = now > origDeadline && now <= extDeadline;

                return (
                  <div className="card-surface p-5 border border-academic-border space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-academic-border">
                      <div>
                        <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                          <FileCheck2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                          Your Submission Answers
                        </h3>
                        <p className="text-xs text-academic-muted mt-0.5">
                          Upload up to {selectedAssessment.max_files || 1} answer file(s) (PDF, PPT, PPTX). Max 10MB per file, 25MB total.
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

                    {/* Active Submission Details */}
                    {sub && sub.active_version && (
                      <div className="p-4 bg-academic-paleGreen/40 rounded border border-academic-border space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-academic-deepGreen">Active Version: v{sub.active_version.version}</span>
                            {sub.active_version.late_status === 'late' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FDF6E2] text-[#A63214] border border-[#D9BD71]">
                                ⚠️ LATE SUBMISSION
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-academic-lightGreen text-academic-primaryGreen border border-academic-primaryGreen/30">
                                ✓ ON TIME
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-academic-muted">
                            Uploaded on {new Date(sub.active_version.uploaded_at).toLocaleString()}
                          </span>
                        </div>

                        {/* Submitted Files List */}
                        <div className="space-y-1.5 pt-1">
                          <span className="font-semibold text-academic-deepGreen block">Submitted Answer Files:</span>
                          {sub.active_version.files && sub.active_version.files.length > 0 ? (
                            sub.active_version.files.map((f: any) => (
                              <div key={f.id} className="p-2 rounded bg-academic-surface border border-academic-border flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Paperclip className="w-3.5 h-3.5 text-academic-primaryGreen" />
                                  <span className="font-medium text-academic-deepGreen">{f.original_name}</span>
                                  <span className="text-[11px] font-mono text-academic-muted">
                                    ({(f.size_bytes / 1024).toFixed(1)} KB)
                                  </span>
                                </div>
                                <a
                                  href={submissionApi.downloadFileUrl(sub.id, sub.active_version!.id, f.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center"
                                >
                                  <Download className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                                  <span>Download</span>
                                </a>
                              </div>
                            ))
                          ) : (
                            <div className="p-2 rounded bg-academic-surface border border-academic-border flex items-center justify-between">
                              <span className="font-medium text-academic-deepGreen">{sub.active_version.original_name}</span>
                              <a
                                href={submissionApi.downloadPdfUrl(sub.id, sub.active_version.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center"
                              >
                                <Download className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                                <span>Download PDF</span>
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] text-academic-muted font-mono bg-academic-surface p-1.5 rounded border border-academic-border/60 break-all">
                          SHA-256: {sub.active_version.sha256}
                        </div>
                      </div>
                    )}

                    {/* Multi-File Upload Form (if open) */}
                    {!isWindowClosed ? (
                      <div className="space-y-3 pt-2">
                        {isInExtensionWindow && (
                          <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded text-xs text-[#6D5200] flex items-center space-x-2">
                            <AlertTriangle className="w-4 h-4 text-[#B28704] flex-shrink-0" />
                            <span>
                              <strong>Late Extension Active:</strong> The original deadline has passed. You are submitting during the extension window. A late penalty may apply according to assignment policy.
                            </span>
                          </div>
                        )}

                        {/* Selected Files Staging List */}
                        {studentAnswerFiles.length > 0 && (
                          <div className="space-y-2 p-3 bg-academic-paleGreen/20 border border-academic-border rounded">
                            <span className="font-semibold text-xs text-academic-deepGreen block">
                              Files selected for submission ({studentAnswerFiles.length} of max {selectedAssessment.max_files || 1}):
                            </span>
                            <div className="space-y-1.5">
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
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                          {studentAnswerFiles.length < (selectedAssessment.max_files || 1) && (
                            <label className="btn-secondary text-xs flex items-center cursor-pointer min-h-[44px]">
                              <Upload className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                              <span>Select Answer File ({studentAnswerFiles.length} / {selectedAssessment.max_files || 1})</span>
                              <input
                                type="file"
                                accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                className="hidden"
                                onChange={handleSelectStudentAnswerFiles}
                                disabled={isSubmittingAnswers}
                              />
                            </label>
                          )}

                          {studentAnswerFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={handleSubmitStudentAnswers}
                              disabled={isSubmittingAnswers}
                              className="btn-primary text-xs flex items-center min-h-[44px]"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1.5" />
                              <span>{isSubmittingAnswers ? 'Uploading & Verifying...' : `Submit ${studentAnswerFiles.length} File(s)`}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded text-xs text-[#6D5200] flex items-center space-x-2">
                        <Lock className="w-4 h-4 text-[#B28704] flex-shrink-0" />
                        <span>Submissions locked. The assessment submission deadline has passed. Resubmissions are disabled.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
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
                onClick={() => setShowCreateModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assignment Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Formative Assignment 1: Advanced Algorithms"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Class & Subject Allocation *
                </label>
                <select
                  value={formClassSubjectId}
                  onChange={(e) => setFormClassSubjectId(e.target.value)}
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
                      <option value="c5100000-0000-0000-0000-000000000002">
                        MCA Semester 3 — MCA302 Cloud Computing & Distributed Systems
                      </option>
                    </>
                  )}
                </select>
              </div>

              {/* Assignment PDF File Picker */}
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assignment PDF Document (Optional if manual questions are added)
                </label>
                <div className="p-3 border border-academic-border rounded bg-academic-paleGreen/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="btn-secondary text-xs flex items-center cursor-pointer min-h-[40px]">
                      <Upload className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      <span>{formPdfFileName ? 'Change PDF File' : 'Choose Assignment PDF'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleAssignmentPdfSelect}
                      />
                    </label>
                    <span className="text-[11px] text-academic-muted">
                      Max 20.00 MB. PDF documents only.
                    </span>
                  </div>

                  {formPdfFileName && (
                    <div className="p-2 rounded bg-academic-surface border border-academic-border flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-academic-primaryGreen" />
                        <span className="font-semibold text-academic-deepGreen">{formPdfFileName}</span>
                        <span className="text-[11px] font-mono text-academic-muted">
                          ({formPdfFileSize ? (formPdfFileSize / 1024).toFixed(1) : 0} KB)
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-academic-primaryGreen">✓ Validated</span>
                    </div>
                  )}

                  {formPdfError && (
                    <p className="text-[11px] font-semibold text-red-700">{formPdfError}</p>
                  )}
                </div>
              </div>

              {/* Manual Questions Builder in Create Modal */}
              <div className="p-3 border border-academic-border rounded bg-academic-surface space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-academic-deepGreen text-xs flex items-center">
                      <FileText className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Manual Questions ({formQuestions.length})
                    </span>
                    <p className="text-[10px] text-academic-muted mt-0.5">
                      Optional if PDF is attached. Teachers may provide PDF, questions, or both.
                    </p>
                  </div>
                </div>

                {formQuestions.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {formQuestions.map((q, idx) => (
                      <div key={idx} className="p-2.5 rounded bg-academic-paleGreen/30 border border-academic-border space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-academic-deepGreen text-white text-[10px] font-bold">
                            Q{idx + 1}
                          </span>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleMoveFormQuestion(idx, 'up')}
                              disabled={idx === 0}
                              className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title="Move Question Up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveFormQuestion(idx, 'down')}
                              disabled={idx === formQuestions.length - 1}
                              className={`p-1 rounded text-academic-muted hover:text-academic-deepGreen ${idx === formQuestions.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title="Move Question Down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditFormQuestion(idx)}
                              className="p-1 rounded text-academic-muted hover:text-academic-primaryGreen"
                              title="Edit Question"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFormQuestion(idx)}
                              className="p-1 rounded text-academic-muted hover:text-red-700"
                              title="Remove Question"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {editingFormQIndex === idx ? (
                          <div className="space-y-1.5 pt-1">
                            <textarea
                              rows={2}
                              value={editingFormQPrompt}
                              onChange={(e) => setEditingFormQPrompt(e.target.value)}
                              className="w-full px-2 py-1 border border-academic-primaryGreen rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none"
                            />
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFormQIndex(null);
                                  setEditingFormQPrompt('');
                                }}
                                className="px-2 py-0.5 text-[11px] text-academic-muted hover:text-academic-deepGreen"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditFormQuestion}
                                disabled={!editingFormQPrompt.trim()}
                                className="btn-primary text-[11px] py-0.5 px-2.5"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-academic-deepGreen text-xs line-clamp-3 leading-relaxed">{q.prompt}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-2.5 rounded bg-academic-paleGreen/20 border border-academic-border/70 space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Enter manual question prompt..."
                    value={newFormQPrompt}
                    onChange={(e) => setNewFormQPrompt(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                  />
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleAddFormQuestion}
                      disabled={!newFormQPrompt.trim()}
                      className="btn-secondary text-[11px] py-1 px-2.5 flex items-center"
                    >
                      <PlusCircle className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Assignment-Level Rubric Builder in Create Modal */}
              <div className="p-3 border border-academic-border rounded bg-academic-surface space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <span className="font-bold text-academic-deepGreen text-xs flex items-center">
                      <Layers className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      Assignment-Level Rubric *
                    </span>
                    <p className="text-[10px] text-academic-muted">
                      Used for grading. Total marks must equal 50 before publishing.
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      Math.abs(formRubricSum - 50) < 0.001
                        ? 'bg-academic-lightGreen text-academic-primaryGreen border-academic-primaryGreen/30'
                        : 'bg-[#FDF6E2] text-[#A63214] border-[#D9BD71]'
                    }`}>
                      {Math.abs(formRubricSum - 50) < 0.001 ? '✓ Total: 50 / 50' : `⚠️ Total: ${formRubricSum} / 50`}
                    </span>
                    <button
                      type="button"
                      onClick={handleResetFormRubric}
                      className="text-[10px] text-academic-primaryGreen hover:underline font-semibold"
                    >
                      Reset Template
                    </button>
                  </div>
                </div>

                {formRubricCriteria.length > 0 && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {formRubricCriteria.map((c, idx) => (
                      <div key={idx} className="p-2 rounded bg-academic-paleGreen/20 border border-academic-border flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="font-mono text-[10px] text-academic-muted font-bold">{idx + 1}.</span>
                          <span className="font-semibold text-academic-deepGreen truncate">{c.criterion_title}</span>
                          <span className="font-mono text-[11px] font-bold text-academic-primaryGreen">({c.max_marks}m)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFormCriterion(idx)}
                          className="text-academic-muted hover:text-red-700 p-1 flex-shrink-0"
                          title="Remove Criterion"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-2.5 rounded bg-academic-paleGreen/10 border border-academic-border/70 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="New Criterion Title"
                      value={newFormCritTitle}
                      onChange={(e) => setNewFormCritTitle(e.target.value)}
                      className="col-span-2 px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                    />
                    <input
                      type="number"
                      min="1"
                      max="50"
                      placeholder="Marks"
                      value={newFormCritMarks}
                      onChange={(e) => setNewFormCritMarks(Math.max(1, Math.min(50, Number(e.target.value))))}
                      className="px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Description / Guidance (Optional)"
                    value={newFormCritDesc}
                    onChange={(e) => setNewFormCritDesc(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen text-xs focus:outline-none focus:border-academic-primaryGreen"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddFormCriterion}
                      disabled={!newFormCritTitle.trim()}
                      className="btn-secondary text-[11px] py-1 px-2.5 flex items-center"
                    >
                      <PlusCircle className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                      <span>Add Criterion</span>
                    </button>
                  </div>
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
                  className="btn-secondary text-xs min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs min-h-[44px]"
                >
                  Create Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Publish Checklist & Confirmation Modal */}
      {showPublishConfirmModal && selectedAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
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

            <div className="space-y-3 text-xs">
              <p className="text-academic-deepGreen">
                Publishing locks this assessment and opens it to enrolled students:
              </p>

              <div className="space-y-2 p-3 bg-academic-paleGreen/30 rounded border border-academic-border">
                {checklist.errors.length === 0 ? (
                  <div className="flex items-start space-x-2 text-academic-primaryGreen">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      All publication requirements passed: Assessment content (PDF document and/or manual questions) is present, assignment rubric totals exactly 50 marks, and deadline is in the future.
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
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
              <button
                type="button"
                onClick={() => setShowPublishConfirmModal(false)}
                className="btn-secondary text-xs min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!checklist.valid}
                onClick={handlePublishAssessment}
                className={`btn-primary text-xs min-h-[44px] ${!checklist.valid ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Confirm & Publish
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
                      This action will permanently delete this assignment and completely purge all associated records from the institutional database and private storage. This action <strong>cannot be undone</strong>.
                    </p>
                  </div>

                  {/* Summary of Dependent Entities to be Removed */}
                  <div className="p-3 bg-academic-paleGreen/20 border border-academic-border rounded-lg space-y-1.5">
                    <span className="text-[11px] font-bold text-academic-deepGreen uppercase tracking-wider block">
                      Dependent Entities To Be Purged:
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
    </div>
  );
};
