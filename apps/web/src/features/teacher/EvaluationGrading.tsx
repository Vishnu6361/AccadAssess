import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download, 
  Send, 
  FileText, 
  ChevronRight, 
  Save, 
  X, 
  Clock, 
  AlertTriangle, 
   
  ArrowLeft, 
  Search, 
  RefreshCw, 
  Layers, 
  Eye, 
  Award, 
  ShieldCheck, 
  FileSpreadsheet as PresentationIcon, 
  FileCode, 
  File
} from 'lucide-react';
import { 
  evaluationApi, 
  submissionApi, 
  TeacherAssignmentOverviewDTO, 
  StudentLedgerRowDTO, 
  SubmittedFileDTO 
} from '../../services/apiClient';
import { StatusBadge } from '../../components/StatusBadge';

const PdfViewer = React.lazy(() => import('../../components/PdfViewer').then(m => ({ default: m.PdfViewer })));

interface EvaluationGradingProps {
  activeRole?: string;
}

export const EvaluationGrading: React.FC<EvaluationGradingProps> = () => {
  // Stage state: 'assignments_list' (Stage 1) or 'ledger' (Stage 2)
  const [currentStage, setCurrentStage] = useState<'assignments_list' | 'ledger'>('assignments_list');

  // Stage 1: Assignments Overview List
  const [assignments, setAssignments] = useState<TeacherAssignmentOverviewDTO[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoadingAssignments, setIsLoadingAssignments] = useState<boolean>(true);

  // Stage 2: Selected Assessment & Ledger
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<any | null>(null);
  const [ledger, setLedger] = useState<StudentLedgerRowDTO[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<{
    total_enrolled: number;
    submitted_count: number;
    evaluated_count: number;
    awaiting_count: number;
    is_published: boolean;
  }>({
    total_enrolled: 0,
    submitted_count: 0,
    evaluated_count: 0,
    awaiting_count: 0,
    is_published: false
  });
  const [isLoadingLedger, setIsLoadingLedger] = useState<boolean>(false);
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // Stage 3: Evaluation Modal State
  const [activeStudentRow, setActiveStudentRow] = useState<StudentLedgerRowDTO | null>(null);
  const [criterionScores, setCriterionScores] = useState<Record<string, { score: number; levelId: string | null; feedback: string }>>({});
  const [rawScoreInput, setRawScoreInput] = useState<number | ''>('');
  const [generalFeedback, setGeneralFeedback] = useState<string>('');
  const [isSavingEvaluation, setIsSavingEvaluation] = useState<boolean>(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  // File Preview in Evaluation Modal
  const [previewingFile, setPreviewingFile] = useState<SubmittedFileDTO | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Stage 4: Publish Confirmation Modal
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [publishRemarks, setPublishRemarks] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Global Alerts / Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Load Published Assignments Overview (Stage 1)
  const loadAssignmentsOverview = async () => {
    setIsLoadingAssignments(true);
    setNotification(null);
    try {
      const data = await evaluationApi.getTeacherAssignmentsOverview();
      setAssignments(data);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load assignments overview.' });
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  useEffect(() => {
    loadAssignmentsOverview();
  }, []);

  // 2. Select Assignment and Load Ledger (Stage 2)
  const handleSelectAssessment = async (ass: TeacherAssignmentOverviewDTO) => {
    setSelectedAssessmentId(ass.id);
    setCurrentStage('ledger');
    setIsLoadingLedger(true);
    setNotification(null);
    try {
      const data = await evaluationApi.getAssessmentLedger(ass.id);
      setCurrentAssessment(data.assessment);
      setLedger(data.ledger);
      setLedgerSummary(data.summary);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to load assessment student ledger.' });
    } finally {
      setIsLoadingLedger(false);
    }
  };

  const handleBackToAssignments = () => {
    setCurrentStage('assignments_list');
    setSelectedAssessmentId(null);
    setCurrentAssessment(null);
    setLedger([]);
    closeEvaluationModal();
    loadAssignmentsOverview(); // Refresh overview counts
  };

  const reloadCurrentLedger = async () => {
    if (!selectedAssessmentId) return;
    setIsLoadingLedger(true);
    try {
      const data = await evaluationApi.getAssessmentLedger(selectedAssessmentId);
      setCurrentAssessment(data.assessment);
      setLedger(data.ledger);
      setLedgerSummary(data.summary);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to refresh assessment student ledger.' });
    } finally {
      setIsLoadingLedger(false);
    }
  };

  // 3. Open Individual Evaluation Modal (Stage 3)
  const handleOpenEvaluation = (row: StudentLedgerRowDTO) => {
    if (!row.is_submitted || !row.submission) {
      alert('This student has not submitted any coursework. An evaluation cannot be created for non-existent work.');
      return;
    }

    setActiveStudentRow(row);
    setEvaluationError(null);
    setPreviewingFile(null);
    setPreviewBlobUrl(null);
    setPreviewNotice(null);

    const questions = currentAssessment?.questions || [];
    const question = questions[0] || null;
    const existing = row.evaluation;

    const initialScores: Record<string, { score: number; levelId: string | null; feedback: string }> = {};
    const rubricCriteria = currentAssessment?.rubric?.criteria?.length
      ? currentAssessment.rubric.criteria
      : (question?.rubric?.criteria || []);

    if (rubricCriteria.length > 0) {
      for (const crit of rubricCriteria) {
        const foundScore = existing?.criterion_scores?.find((cs: any) => cs.criterion_id === crit.id);
        initialScores[crit.id] = {
          score: foundScore ? foundScore.score : 0,
          levelId: foundScore?.selected_level_id || null,
          feedback: foundScore?.feedback || ''
        };
      }
    }

    setCriterionScores(initialScores);
    setRawScoreInput(existing?.raw_score !== undefined ? existing.raw_score : (existing?.total_score ?? ''));
    setGeneralFeedback(existing?.general_feedback || '');

    // Auto-select first PDF for preview if available
    const firstPdf = row.files.find(f => f.mime_type === 'application/pdf' || f.original_filename.toLowerCase().endsWith('.pdf'));
    if (firstPdf) {
      handlePreviewSubmittedFile(row, firstPdf);
    }
  };

  const closeEvaluationModal = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setActiveStudentRow(null);
    setPreviewingFile(null);
    setPreviewBlobUrl(null);
    setPreviewNotice(null);
    setEvaluationError(null);
  };

  // Handle previewing file inside evaluation modal
  const handlePreviewSubmittedFile = async (row: StudentLedgerRowDTO, file: SubmittedFileDTO) => {
    const isPdf = file.mime_type === 'application/pdf' || file.original_filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setPreviewNotice(`In-app preview is optimized for PDF documents. "${file.original_filename}" can be downloaded for offline review.`);
      setPreviewingFile(file);
      setPreviewBlobUrl(null);
      return;
    }

    setPreviewingFile(file);
    setPreviewNotice(null);
    setPreviewLoading(true);

    try {
      const blob = await submissionApi.fetchSubmissionFileBlob(
        row.submission!.id,
        row.submission!.active_version_id || 'v1',
        file.id
      );
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl(url);
    } catch (err: any) {
      setPreviewNotice(`Failed to render PDF preview: ${err.message || 'Storage error'}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle authenticated download
  const handleDownloadSubmittedFile = async (row: StudentLedgerRowDTO, file: SubmittedFileDTO) => {
    if (!row.submission) return;
    setDownloadingFileId(file.id);
    try {
      await submissionApi.downloadSubmissionFile(
        row.submission.id,
        row.submission.active_version_id || 'v1',
        file.id,
        file.original_filename
      );
    } catch (err: any) {
      alert(err.message || 'Failed to download file');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // Calculation helpers
  const rubricCriteria = currentAssessment?.rubric?.criteria?.length
    ? currentAssessment.rubric.criteria
    : (currentAssessment?.questions?.[0]?.rubric?.criteria || []);
  const hasRubricCriteria = Boolean(rubricCriteria.length > 0);

  const criteriaSum = Object.values(criterionScores).reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  const liveRawScore = hasRubricCriteria ? criteriaSum : (typeof rawScoreInput === 'number' ? rawScoreInput : 0);

  const isLate = Boolean(activeStudentRow?.is_late || activeStudentRow?.submission?.late_status === 'late');
  const hasFixedPenalty = currentAssessment?.late_penalty_mode === 'fixed';
  const penaltyMarks = (isLate && hasFixedPenalty) ? Number(currentAssessment?.late_penalty_marks || 0) : 0;
  const liveFinalScore = Math.max(0, liveRawScore - penaltyMarks);
  const maxAssessmentMarks = Number(currentAssessment?.max_marks || 50);

  // Save evaluation (Draft or Complete)
  const handleSaveEvaluation = async (status: 'draft' | 'completed') => {
    if (!activeStudentRow?.submission) return;

    setIsSavingEvaluation(true);
    setEvaluationError(null);

    try {
      if (status === 'completed') {
        if (hasRubricCriteria) {
          for (const crit of rubricCriteria) {
            const score = Number(criterionScores[crit.id]?.score || 0);
            const critMax = Number(crit.max_marks ?? crit.max_score ?? 10);
            if (score < 0 || score > critMax) {
              throw new Error(`Criterion "${crit.title}" score must be between 0 and ${critMax} marks.`);
            }
          }
        } else {
          if (rawScoreInput === '' || Number(rawScoreInput) < 0 || Number(rawScoreInput) > maxAssessmentMarks) {
            throw new Error(`Please enter a valid raw score between 0 and ${maxAssessmentMarks} marks.`);
          }
        }

        if (liveFinalScore > maxAssessmentMarks) {
          throw new Error(`Calculated final score (${liveFinalScore}) exceeds maximum assessment marks (${maxAssessmentMarks}).`);
        }
      }

      const payload: any = {
        submission_id: activeStudentRow.submission.id,
        status,
        general_feedback: generalFeedback
      };

      if (hasRubricCriteria) {
        payload.criterion_scores = Object.entries(criterionScores).map(([critId, data]) => ({
          criterion_id: critId,
          selected_level_id: data.levelId,
          score: Number(data.score) || 0,
          feedback: data.feedback
        }));
      } else {
        payload.raw_score = Number(rawScoreInput);
      }

      await evaluationApi.saveEvaluation(payload);

      setNotification({
        type: 'success',
        message: status === 'completed' 
          ? `Evaluation completed successfully for ${activeStudentRow.student_name}!` 
          : `Evaluation draft saved for ${activeStudentRow.student_name}.`
      });

      closeEvaluationModal();
      await reloadCurrentLedger();
    } catch (err: any) {
      setEvaluationError(err.message || 'Failed to save evaluation.');
    } finally {
      setIsSavingEvaluation(false);
    }
  };

  // 4. Publish All Grades (Stage 4)
  const handleConfirmPublishAll = async () => {
    if (!selectedAssessmentId) return;
    setIsPublishing(true);
    setNotification(null);

    try {
      const res = await evaluationApi.publishResults(selectedAssessmentId, publishRemarks || 'Official Faculty Evaluation Published');
      setShowPublishModal(false);
      setPublishRemarks('');
      setNotification({
        type: 'success',
        message: `Grades officially published! ${res.published_count} student evaluation(s) are now accessible to students.`
      });
      await reloadCurrentLedger();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to publish grades. Please resolve all pending evaluations first.'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string, filename: string) => {
    const lower = filename.toLowerCase();
    if (mimeType.includes('pdf') || lower.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />;
    }
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint') || lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
      return <PresentationIcon className="w-4 h-4 text-amber-600 flex-shrink-0" />;
    }
    if (mimeType.includes('word') || lower.endsWith('.doc') || lower.endsWith('.docx')) {
      return <FileCode className="w-4 h-4 text-blue-600 flex-shrink-0" />;
    }
    return <File className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />;
  };

  const filteredAssignments = assignments.filter(a => 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.subject_details && a.subject_details.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (a.class_details && a.class_details.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredLedger = ledger.filter(r => 
    r.student_name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
    r.student_usn.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
    r.student_email.toLowerCase().includes(ledgerSearch.toLowerCase())
  );

  const canPublishAll = 
    ledgerSummary.submitted_count > 0 && 
    ledgerSummary.awaiting_count === 0 && 
    !ledgerSummary.is_published;

  return (
    <div className="space-y-6">
      {/* Global Notification */}
      {notification && (
        <div className={`p-4 rounded-lg border flex items-center justify-between text-xs ${
          notification.type === 'success' 
            ? 'bg-academic-lightGreen border-academic-primaryGreen/40 text-academic-deepGreen' 
            : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          <div className="flex items-center space-x-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STAGE 1: PUBLISHED ASSIGNMENTS LIST */}
      {currentStage === 'assignments_list' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="card-surface p-6 rounded-lg border border-academic-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2.5">
                  <span className="p-2 rounded-lg bg-academic-lightGreen text-academic-primaryGreen">
                    <FileSpreadsheet className="w-5 h-5" />
                  </span>
                  <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
                    Rubric Evaluations & Grading
                  </h1>
                </div>
                <p className="text-xs text-academic-muted mt-1.5 max-w-2xl leading-relaxed">
                  Select a published course assessment to review enrolled students, evaluate submitted answers against rubrics, and publish official grades.
                </p>
              </div>

              <button
                onClick={loadAssignmentsOverview}
                disabled={isLoadingAssignments}
                className="btn-secondary text-xs flex items-center self-start sm:self-auto min-h-[40px]"
                title="Refresh assignments list"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoadingAssignments ? 'animate-spin text-academic-primaryGreen' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Search Filter */}
            <div className="mt-5 pt-4 border-t border-academic-border/70 flex items-center">
              <div className="relative max-w-md w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-academic-muted" />
                <input
                  type="text"
                  placeholder="Search by assessment title, subject, or class..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[40px]"
                />
              </div>
            </div>
          </div>

          {/* Assignments Grid */}
          {isLoadingAssignments ? (
            <div className="card-surface p-12 text-center border border-academic-border rounded-lg space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-academic-primaryGreen mx-auto" />
              <p className="text-xs font-semibold text-academic-deepGreen">Loading authorized published assessments...</p>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="card-surface p-12 text-center border border-academic-border rounded-lg max-w-xl mx-auto space-y-3">
              <FileSpreadsheet className="w-12 h-12 text-academic-muted/40 mx-auto" />
              <h3 className="text-base font-bold text-academic-deepGreen">No Published Assessments Found</h3>
              <p className="text-xs text-academic-muted">
                No published assessments were found for your assigned classes. Publish an assessment from the Academic Assessments section to begin student rubric evaluations.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredAssignments.map((ass) => {
                const isPublished = ass.summary.is_published;
                const isReadyToPublish = ass.summary.submitted_count > 0 && ass.summary.awaiting_count === 0 && !isPublished;

                return (
                  <div
                    key={ass.id}
                    className="card-surface flex flex-col justify-between hover:border-academic-primaryGreen/50 transition-all rounded-lg border border-academic-border p-5 group space-y-4"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center flex-wrap gap-2">
                          {isPublished ? (
                            <StatusBadge label="Grades Published" variant="completed" />
                          ) : isReadyToPublish ? (
                            <StatusBadge label="Ready to Publish" variant="submitted" />
                          ) : ass.summary.submitted_count > 0 ? (
                            <StatusBadge label="Grading in Progress" variant="processing" />
                          ) : (
                            <StatusBadge label="Awaiting Submissions" variant="neutral" />
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-academic-deepGreen bg-academic-paleGreen px-2 py-0.5 rounded border border-academic-border flex-shrink-0">
                          {ass.max_marks} Marks
                        </span>
                      </div>

                      {/* Title & Subject */}
                      <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors line-clamp-2">
                        {ass.title}
                      </h3>
                      <p className="text-xs text-academic-muted mt-1">
                        {ass.class_details || 'Enrolled Class'} &bull; {ass.subject_details || 'Subject'}
                      </p>

                      {/* Deadlines */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-academic-muted">
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-academic-primaryGreen" />
                          <span>Deadline: {new Date(ass.deadline_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {ass.allow_late && ass.extension_deadline_at && (
                          <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Extension: {new Date(ass.extension_deadline_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress & Metrics Chips */}
                    <div className="pt-3 border-t border-academic-border/70 grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 bg-academic-bg border border-academic-border/70 rounded">
                        <p className="text-[10px] text-academic-muted">Enrolled</p>
                        <p className="font-bold text-academic-deepGreen mt-0.5">{ass.summary.total_enrolled}</p>
                      </div>
                      <div className="p-2 bg-academic-bg border border-academic-border/70 rounded">
                        <p className="text-[10px] text-academic-muted">Submitted</p>
                        <p className="font-bold text-academic-primaryGreen mt-0.5">{ass.summary.submitted_count}</p>
                      </div>
                      <div className="p-2 bg-academic-bg border border-academic-border/70 rounded">
                        <p className="text-[10px] text-academic-muted">Evaluated</p>
                        <p className="font-bold text-academic-deepGreen mt-0.5">{ass.summary.evaluated_count}</p>
                      </div>
                      <div className="p-2 bg-academic-bg border border-academic-border/70 rounded">
                        <p className="text-[10px] text-academic-muted">Awaiting</p>
                        <p className={`font-bold mt-0.5 ${ass.summary.awaiting_count > 0 ? 'text-amber-700' : 'text-academic-muted'}`}>
                          {ass.summary.awaiting_count}
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleSelectAssessment(ass)}
                        className="btn-primary text-xs w-full flex items-center justify-center min-h-[40px]"
                      >
                        <span>Evaluate Students &bull; View Ledger</span>
                        <ChevronRight className="w-4 h-4 ml-1.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STAGE 2: STUDENT SUBMISSION LEDGER */}
      {currentStage === 'ledger' && currentAssessment && (
        <div className="space-y-6">
          {/* Top Bar with Back Action & Assessment Details */}
          <div className="card-surface p-6 rounded-lg border border-academic-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleBackToAssignments}
                  className="btn-secondary text-xs flex items-center min-h-[40px]"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  <span>Back to Assignments</span>
                </button>
                <div>
                  <h1 className="text-lg font-bold text-academic-deepGreen tracking-tight">
                    {currentAssessment.title}
                  </h1>
                  <p className="text-xs text-academic-muted">
                    {currentAssessment.class_details || 'Enrolled Class'} &bull; {currentAssessment.subject_details || 'Subject'} &bull; Max: {currentAssessment.max_marks} Marks
                  </p>
                </div>
              </div>

              {/* Publish Action Button */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowPublishModal(true)}
                  disabled={!canPublishAll || ledgerSummary.is_published}
                  className={`btn-primary text-xs flex items-center min-h-[40px] px-4 shadow-sm ${
                    ledgerSummary.is_published 
                      ? 'bg-academic-paleGreen text-academic-muted border-academic-border cursor-not-allowed opacity-80' 
                      : !canPublishAll 
                      ? 'opacity-50 cursor-not-allowed' 
                      : ''
                  }`}
                  title={
                    ledgerSummary.is_published 
                      ? 'Grades for this assessment are already officially published.' 
                      : ledgerSummary.submitted_count === 0 
                      ? 'No student submissions exist to publish.' 
                      : ledgerSummary.awaiting_count > 0 
                      ? `Cannot publish: ${ledgerSummary.awaiting_count} submitted assignment(s) are awaiting evaluation.` 
                      : 'Publish all verified grades to student portal'
                  }
                >
                  {ledgerSummary.is_published ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      <span>Grades Officially Published</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      <span>Publish All Grades</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Summary Metrics Bar */}
            <div className="pt-3 border-t border-academic-border/70 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center flex-wrap gap-4 text-academic-deepGreen font-semibold">
                <span>Total Enrolled: <strong className="text-academic-primaryGreen">{ledgerSummary.total_enrolled}</strong></span>
                <span>Submitted: <strong className="text-academic-primaryGreen">{ledgerSummary.submitted_count}</strong></span>
                <span>Evaluated: <strong className="text-academic-deepGreen">{ledgerSummary.evaluated_count}</strong></span>
                <span>Awaiting Review: <strong className={ledgerSummary.awaiting_count > 0 ? 'text-amber-700' : 'text-academic-muted'}>{ledgerSummary.awaiting_count}</strong></span>
              </div>

              {/* Search input in ledger */}
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-academic-muted" />
                <input
                  type="text"
                  placeholder="Search students in this class..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[36px]"
                />
              </div>
            </div>
          </div>

          {/* Student Ledger Table */}
          {isLoadingLedger ? (
            <div className="card-surface p-12 text-center border border-academic-border rounded-lg space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-academic-primaryGreen mx-auto" />
              <p className="text-xs font-semibold text-academic-deepGreen">Loading student submission ledger...</p>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="card-surface p-10 text-center border border-academic-border rounded-lg text-xs text-academic-muted">
              No enrolled students found matching search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto border border-academic-border rounded-lg bg-academic-surface shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-academic-paleGreen text-academic-deepGreen border-b border-academic-border text-[11px] font-semibold">
                  <tr>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">USN</th>
                    <th className="p-3">Submission Status</th>
                    <th className="p-3">Version & Files</th>
                    <th className="p-3">Submitted At</th>
                    <th className="p-3">Timing Status</th>
                    <th className="p-3">Evaluation Status</th>
                    <th className="p-3 text-right">Score</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-academic-border bg-academic-surface">
                  {filteredLedger.map((row) => {
                    const isSubmitted = row.is_submitted;
                    const evalStatus = row.evaluation_status;

                    return (
                      <tr key={row.student_id} className="hover:bg-academic-paleGreen/25 transition-colors">
                        <td className="p-3">
                          <p className="font-semibold text-academic-deepGreen">{row.student_name}</p>
                          <p className="text-[10px] text-academic-muted">{row.student_email}</p>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-academic-muted">{row.student_usn}</td>
                        <td className="p-3">
                          {isSubmitted ? (
                            <StatusBadge label="Submitted" variant="submitted" />
                          ) : (
                            <StatusBadge label="Not Submitted" variant="neutral" />
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-academic-muted font-mono">
                          {isSubmitted ? `v${row.version_number} (${row.files_count} file${row.files_count > 1 ? 's' : ''})` : '—'}
                        </td>
                        <td className="p-3 text-[11px] text-academic-muted">
                          {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}
                        </td>
                        <td className="p-3">
                          {!isSubmitted ? (
                            <span className="text-academic-muted text-[11px]">—</span>
                          ) : row.is_late ? (
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
                          {evalStatus === 'published' ? (
                            <StatusBadge label="Published" variant="completed" />
                          ) : evalStatus === 'completed' ? (
                            <StatusBadge label="Evaluated" variant="completed" />
                          ) : evalStatus === 'draft' ? (
                            <StatusBadge label="Under Evaluation" variant="processing" />
                          ) : evalStatus === 'pending' ? (
                            <StatusBadge label="Pending Evaluation" variant="neutral" />
                          ) : (
                            <span className="text-academic-muted text-[11px] italic">Not Submitted</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {row.evaluation?.total_score !== undefined && row.evaluation?.total_score !== null ? (
                            <span className="font-bold text-academic-deepGreen font-mono">
                              {row.evaluation.total_score} / {currentAssessment.max_marks}
                            </span>
                          ) : (
                            <span className="text-academic-muted text-[11px]">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {!isSubmitted ? (
                            <span className="text-academic-muted text-[11px] italic">No Submission</span>
                          ) : evalStatus === 'published' ? (
                            <button
                              onClick={() => handleOpenEvaluation(row)}
                              className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                              <span>View Grade</span>
                            </button>
                          ) : evalStatus === 'completed' ? (
                            <button
                              onClick={() => handleOpenEvaluation(row)}
                              className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center"
                            >
                              <span>Edit Evaluation</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenEvaluation(row)}
                              className="btn-primary text-[11px] py-1 px-2.5 inline-flex items-center"
                            >
                              <span>Evaluate Submission</span>
                              <ChevronRight className="w-3.5 h-3.5 ml-1" />
                            </button>
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
      )}

      {/* STAGE 3: INDIVIDUAL SUBMISSION REVIEW & EVALUATION MODAL */}
      {activeStudentRow && currentAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="p-4 border-b border-academic-border flex items-center justify-between bg-academic-paleGreen/40">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="p-2 rounded-lg bg-academic-lightGreen text-academic-primaryGreen flex-shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-academic-deepGreen truncate">
                    Evaluating Coursework &bull; {activeStudentRow.student_name} ({activeStudentRow.student_usn})
                  </h3>
                  <p className="text-[11px] text-academic-muted truncate">
                    {currentAssessment.title} &bull; Max: {maxAssessmentMarks} Marks &bull; Version {activeStudentRow.version_number}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={closeEvaluationModal}
                  className="p-1.5 rounded-lg hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: 2-Column Split (Left: Submission Files & PDF Viewer | Right: Rubric & Score Inputs) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Student Uploads & In-App PDF Preview (7 cols) */}
              <div className="lg:col-span-7 flex flex-col space-y-4">
                {/* Uploaded Files Selector List */}
                <div className="p-3.5 bg-academic-bg border border-academic-border rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-academic-deepGreen font-semibold">
                    <span className="flex items-center">
                      <Layers className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                      <span>Uploaded Files ({activeStudentRow.files.length})</span>
                    </span>
                    <span className="text-[10px] text-academic-muted">
                      Submitted on {activeStudentRow.submitted_at ? new Date(activeStudentRow.submitted_at).toLocaleString() : '—'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {activeStudentRow.files.map((file) => {
                      const isSelected = previewingFile?.id === file.id;
                      const isDownloading = downloadingFileId === file.id;

                      return (
                        <div
                          key={file.id}
                          className={`p-2.5 rounded border text-xs flex items-center justify-between gap-3 transition-colors ${
                            isSelected 
                              ? 'bg-academic-lightGreen/50 border-academic-primaryGreen/50' 
                              : 'bg-academic-surface border-academic-border/70 hover:border-academic-primaryGreen/30'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0 flex-1">
                            {getFileIcon(file.mime_type, file.original_filename)}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-academic-deepGreen truncate">{file.original_filename}</p>
                              <p className="text-[10px] text-academic-muted">
                                {formatFileSize(file.file_size_bytes)} &bull; {file.mime_type.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button
                              onClick={() => handlePreviewSubmittedFile(activeStudentRow, file)}
                              className="btn-secondary text-[10px] py-1 px-2 flex items-center"
                              title="Preview file"
                            >
                              <Eye className="w-3 h-3 mr-1 text-academic-primaryGreen" />
                              <span>Preview</span>
                            </button>
                            <button
                              onClick={() => handleDownloadSubmittedFile(activeStudentRow, file)}
                              disabled={isDownloading}
                              className="btn-secondary text-[10px] py-1 px-2 flex items-center"
                              title="Download original file"
                            >
                              {isDownloading ? (
                                <Loader2 className="w-3 h-3 animate-spin text-academic-primaryGreen" />
                              ) : (
                                <Download className="w-3 h-3 text-academic-primaryGreen" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Embedded In-App PDF Preview Window */}
                <div className="flex-1 min-h-[380px] bg-slate-100 rounded-lg border border-academic-border overflow-hidden flex flex-col">
                  {previewLoading ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 space-y-3">
                      <Loader2 className="w-7 h-7 animate-spin text-academic-primaryGreen" />
                      <p className="text-xs font-semibold text-academic-deepGreen">Loading document preview...</p>
                    </div>
                  ) : previewBlobUrl ? (
                    <div className="h-full flex-1">
                      <React.Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-academic-primaryGreen" /><span className="ml-2 text-sm text-academic-muted">Loading PDF Viewer...</span></div>}>
                        <PdfViewer
                          directUrl={previewBlobUrl}
                          filename={previewingFile?.original_filename || 'student-submission.pdf'}
                          assessmentId={activeStudentRow.submission?.id || ""}
                        />
                      </React.Suspense>
                    </div>
                  ) : previewNotice ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                      <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                      <p className="text-xs font-semibold text-academic-deepGreen">{previewNotice}</p>
                      {previewingFile && (
                        <button
                          onClick={() => handleDownloadSubmittedFile(activeStudentRow, previewingFile)}
                          className="btn-primary text-xs inline-flex items-center"
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          <span>Download {previewingFile.original_filename}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-xs text-academic-muted space-y-2">
                      <Eye className="w-8 h-8 text-academic-muted/50 mx-auto" />
                      <p>Select a submitted file above to preview document in-app</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Rubric Criteria & Score Inputs (5 cols) */}
              <div className="lg:col-span-5 flex flex-col space-y-4">
                {/* Error Banner */}
                {evaluationError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span>{evaluationError}</span>
                    </div>
                    <button onClick={() => setEvaluationError(null)} className="p-0.5 hover:opacity-75">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Timing & Penalty Info Box */}
                {isLate && hasFixedPenalty && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Late Submission Notice</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Automated institutional late penalty: <strong>-{penaltyMarks} Marks</strong> will be deducted from raw marks.
                    </p>
                  </div>
                )}

                {/* Rubric Criteria Section */}
                <div className="card-surface p-4 border border-academic-border rounded-lg space-y-4 flex-1">
                  <div className="flex items-center justify-between border-b border-academic-border/70 pb-2">
                    <h4 className="font-bold text-xs text-academic-deepGreen">
                      {hasRubricCriteria ? 'Rubric Criteria Scoring' : 'Direct Score Award'}
                    </h4>
                    <span className="text-[11px] font-mono text-academic-muted">
                      Max: {maxAssessmentMarks}
                    </span>
                  </div>

                  {hasRubricCriteria ? (
                    <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">
                      {rubricCriteria.map((crit: any) => {
                        const critState = criterionScores[crit.id] || { score: 0, levelId: null, feedback: '' };
                        const critMaxMarks = Number(crit.max_marks ?? crit.max_score ?? 10);

                        return (
                          <div key={crit.id} className="p-3 bg-academic-bg border border-academic-border/80 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-academic-deepGreen">{crit.title}</span>
                              <span className="text-[11px] font-mono text-academic-muted">Max: {critMaxMarks}</span>
                            </div>
                            {crit.description && (
                              <p className="text-[10px] text-academic-muted leading-tight">{crit.description}</p>
                            )}

                            {/* Criterion Levels if defined */}
                            {crit.levels && crit.levels.length > 0 && (
                              <div className="grid grid-cols-3 gap-1.5 pt-1">
                                {crit.levels.map((lvl: any) => {
                                  const isLevelSelected = critState.levelId === lvl.id;
                                  return (
                                    <button
                                      key={lvl.id}
                                      type="button"
                                      onClick={() => {
                                        setCriterionScores(prev => ({
                                          ...prev,
                                          [crit.id]: {
                                            ...prev[crit.id],
                                            score: lvl.score,
                                            levelId: lvl.id
                                          }
                                        }));
                                      }}
                                      className={`p-1.5 rounded border text-[10px] text-center transition-colors ${
                                        isLevelSelected 
                                          ? 'bg-academic-primaryGreen text-white border-academic-primaryGreen font-bold' 
                                          : 'bg-academic-surface border-academic-border text-academic-deepGreen hover:bg-academic-paleGreen'
                                      }`}
                                    >
                                      <div>{lvl.title}</div>
                                      <div className="font-mono text-[9px] opacity-90">{lvl.score} pts</div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Score Input */}
                            <div className="flex items-center space-x-2 pt-1">
                              <label className="text-[10px] font-semibold text-academic-deepGreen">Score:</label>
                              <input
                                type="number"
                                min="0"
                                max={critMaxMarks}
                                step="0.5"
                                value={critState.score}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCriterionScores(prev => ({
                                    ...prev,
                                    [crit.id]: {
                                      ...prev[crit.id],
                                      score: val
                                    }
                                  }));
                                }}
                                className="w-20 px-2 py-1 text-xs border border-academic-border rounded bg-academic-surface text-academic-deepGreen font-mono"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 bg-academic-bg border border-academic-border rounded-lg space-y-2">
                      <label className="block text-xs font-semibold text-academic-deepGreen">
                        Raw Score Awarded (out of {maxAssessmentMarks}):
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={maxAssessmentMarks}
                        step="0.5"
                        value={rawScoreInput}
                        onChange={(e) => setRawScoreInput(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        placeholder={`Enter score (0 - ${maxAssessmentMarks})`}
                        className="w-full px-3 py-2 text-xs border border-academic-border rounded bg-academic-surface text-academic-deepGreen font-mono"
                      />
                    </div>
                  )}

                  {/* General Feedback Textarea */}
                  <div className="space-y-1 pt-2">
                    <label className="block text-xs font-semibold text-academic-deepGreen">
                      Teacher Comments & Feedback:
                    </label>
                    <textarea
                      rows={3}
                      value={generalFeedback}
                      onChange={(e) => setGeneralFeedback(e.target.value)}
                      placeholder="Constructive feedback visible to the student upon official grade publication..."
                      className="w-full p-2.5 text-xs border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                    />
                  </div>

                  {/* Live Final Score Summary Card */}
                  <div className="p-3 bg-academic-lightGreen/60 border border-academic-primaryGreen/40 rounded-lg space-y-1 text-xs">
                    <div className="flex items-center justify-between text-academic-muted">
                      <span>Raw Score:</span>
                      <span className="font-mono">{liveRawScore} Marks</span>
                    </div>
                    {penaltyMarks > 0 && (
                      <div className="flex items-center justify-between text-[#A63214]">
                        <span>Late Penalty:</span>
                        <span className="font-mono">-{penaltyMarks} Marks</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-academic-primaryGreen/30 font-bold text-academic-deepGreen">
                      <span>Final Calculated Grade:</span>
                      <span className="text-sm font-mono text-academic-primaryGreen">
                        {liveFinalScore} / {maxAssessmentMarks} Marks
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modal Action Buttons */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={closeEvaluationModal}
                    className="btn-secondary text-xs min-h-[40px]"
                  >
                    Cancel
                  </button>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isSavingEvaluation}
                      onClick={() => handleSaveEvaluation('draft')}
                      className="btn-secondary text-xs flex items-center min-h-[40px]"
                    >
                      <Save className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                      <span>Save Draft</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSavingEvaluation}
                      onClick={() => handleSaveEvaluation('completed')}
                      className="btn-primary text-xs flex items-center min-h-[40px] px-4"
                    >
                      {isSavingEvaluation ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          <span>Mark Evaluation Complete</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 4: PUBLISH ALL GRADES CONFIRMATION MODAL */}
      {showPublishModal && currentAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-academic-border bg-academic-paleGreen/40 flex items-center space-x-3">
              <div className="p-2 rounded-full bg-academic-lightGreen text-academic-primaryGreen">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen">Publish All Verified Grades</h3>
                <p className="text-xs text-academic-muted">{currentAssessment.title}</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-academic-bg border border-academic-border rounded-lg space-y-2">
                <div className="flex items-center justify-between text-academic-deepGreen">
                  <span>Enrolled Class Students:</span>
                  <span className="font-bold">{ledgerSummary.total_enrolled}</span>
                </div>
                <div className="flex items-center justify-between text-academic-primaryGreen font-bold">
                  <span>Completed Evaluations to Publish:</span>
                  <span>{ledgerSummary.submitted_count}</span>
                </div>
                <div className="flex items-center justify-between text-academic-muted">
                  <span>Unsubmitted Students (excluded):</span>
                  <span>{ledgerSummary.total_enrolled - ledgerSummary.submitted_count}</span>
                </div>
              </div>

              <div className="p-3 bg-academic-lightGreen/50 border border-academic-primaryGreen/30 rounded-lg text-academic-deepGreen space-y-1">
                <p className="font-bold flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-1 text-academic-primaryGreen" />
                  Official Grade Disclosure
                </p>
                <p className="text-[11px] text-academic-muted">
                  Upon confirmation, all evaluated students will immediately gain authorized access to view their scores, late penalties, and rubric feedback in their student portal.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-academic-deepGreen">
                  Publication Remarks (Optional):
                </label>
                <input
                  type="text"
                  value={publishRemarks}
                  onChange={(e) => setPublishRemarks(e.target.value)}
                  placeholder="e.g. Official Faculty Evaluation Published"
                  className="w-full px-3 py-2 text-xs border border-academic-border rounded bg-academic-bg text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[38px]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-academic-border flex items-center justify-end space-x-2 bg-academic-paleGreen/20">
              <button
                onClick={() => setShowPublishModal(false)}
                disabled={isPublishing}
                className="btn-secondary text-xs min-h-[38px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPublishAll}
                disabled={isPublishing}
                className="btn-primary text-xs flex items-center min-h-[38px] px-4"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    <span>Confirm & Publish All Grades</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
