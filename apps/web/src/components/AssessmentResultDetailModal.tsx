import React, { useEffect, useState } from 'react';
import {
  X,
  ScrollText,
  Award,
  AlertCircle,
  CheckCircle2,
  User,
  FileText,
  Loader2
} from 'lucide-react';
import {
  evaluationApi,
  AssessmentResultDetailDTO,
  CriterionScoreDTO
} from '../services/apiClient';

interface AssessmentResultDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId?: string | null;
  /**
   * Optional pre-loaded detail if parent component already has it
   */
  initialDetail?: AssessmentResultDetailDTO | null;
}

export const AssessmentResultDetailModal: React.FC<AssessmentResultDetailModalProps> = ({
  isOpen,
  onClose,
  submissionId,
  initialDetail = null
}) => {
  const [detail, setDetail] = useState<AssessmentResultDetailDTO | null>(initialDetail);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load result detail when submissionId changes or modal opens
  useEffect(() => {
    if (!isOpen) {
      setDetail(null);
      setErrorMessage(null);
      return;
    }

    if (initialDetail) {
      setDetail(initialDetail);
      return;
    }

    if (!submissionId) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    evaluationApi
      .getResultDetail(submissionId)
      .then((data) => {
        if (isMounted) {
          setDetail(data);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setErrorMessage(err.message || 'Unable to load assessment result details.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, submissionId, initialDetail]);

  if (!isOpen) return null;

  const evaluation = detail?.evaluation;
  const assessment = detail?.assessment;
  const student = detail?.student;
  const submission = detail?.submission;

  const totalScore = evaluation?.total_score ?? 0;
  const maxMarks = assessment?.max_marks || 50;
  const percentage = evaluation?.percentage ?? (maxMarks ? Math.round((totalScore / maxMarks) * 100) : 0);
  const latePenalty = evaluation?.late_penalty_deducted ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative bg-academic-surface border border-academic-border rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-academic-border bg-academic-paleGreen/30 flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-academic-primaryGreen text-white shadow-xs shrink-0 mt-0.5">
              <ScrollText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Official Academic Result
                </span>
                {assessment?.subject_code && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white border border-academic-border text-academic-deepGreen">
                    {assessment.subject_code} &bull; {assessment.subject_name || 'Subject'}
                  </span>
                )}
                {assessment?.semester && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white border border-academic-border text-academic-muted">
                    Sem {assessment.semester} {assessment.section ? `• Sec ${assessment.section}` : ''}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-academic-deepGreen mt-1 truncate">
                {assessment?.title || 'Assessment Result & Rubric Evaluation'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {isLoading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-academic-primaryGreen animate-spin" />
              <p className="text-xs font-semibold text-academic-deepGreen">
                Loading official rubric breakdown & marks...
              </p>
              <p className="text-[11px] text-academic-muted">
                Fetching criterion scores and instructor feedback.
              </p>
            </div>
          ) : errorMessage ? (
            <div className="p-5 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-bold">Error Loading Result</p>
                <p>{errorMessage}</p>
              </div>
            </div>
          ) : !detail ? (
            <div className="py-16 text-center text-academic-muted space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-academic-muted" />
              <p className="text-xs font-semibold">No detailed result record found.</p>
            </div>
          ) : (
            <>
              {/* Student & Score Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Student Info Card */}
                <div className="p-4 rounded-lg bg-academic-paleGreen/15 border border-academic-border space-y-2 md:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                    Student Details & Academic Context
                  </span>
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-full bg-academic-primaryGreen/10 border border-academic-primaryGreen/30 flex items-center justify-center text-academic-primaryGreen font-bold text-xs">
                      {student?.name?.charAt(0) || <User className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-academic-deepGreen truncate">
                        {student?.name || 'Student'}
                      </p>
                      <p className="text-xs text-academic-muted font-mono">
                        Roll: {student?.roll_number || 'N/A'} {student?.email ? `• ${student.email}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-academic-border/60 text-[11px]">
                    <div>
                      <span className="text-academic-muted block text-[10px]">Evaluator</span>
                      <span className="font-semibold text-academic-deepGreen truncate block">
                        {evaluation?.evaluator_name || 'Course Instructor'}
                      </span>
                    </div>
                    <div>
                      <span className="text-academic-muted block text-[10px]">Submission Status</span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded font-semibold text-[10px] ${
                          submission?.late_status === 'late'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {submission?.late_status === 'late' ? 'Late Submission' : 'On Time'}
                      </span>
                    </div>
                    <div>
                      <span className="text-academic-muted block text-[10px]">Published Date</span>
                      <span className="font-medium text-academic-deepGreen block">
                        {evaluation?.published_at
                          ? new Date(evaluation.published_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })
                          : 'Official'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score Pill Card */}
                <div className="p-4 rounded-lg bg-academic-surface border-2 border-academic-primaryGreen/40 shadow-xs flex flex-col justify-between space-y-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-academic-muted block">
                      Awarded Formative Score
                    </span>
                    <div className="mt-1 flex items-baseline space-x-1">
                      <span className="text-2xl font-black text-academic-deepGreen">
                        {totalScore}
                      </span>
                      <span className="text-xs font-semibold text-academic-muted">
                        / {maxMarks} Marks
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-academic-border/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-academic-muted">Percentage</span>
                      <span className="font-bold text-academic-primaryGreen text-sm">
                        {percentage}%
                      </span>
                    </div>
                    {Boolean(latePenalty && latePenalty > 0) && (
                      <div className="flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                        <span>Late Deduction</span>
                        <span>-{latePenalty} Marks</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Assessment Instructions / Prompt */}
              {assessment?.instructions && (
                <div className="p-4 rounded-lg bg-[#FFFDF8] border border-academic-border text-xs space-y-1">
                  <span className="font-bold text-academic-deepGreen block flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-academic-primaryGreen" />
                    <span>Assessment Instructions / Prompt:</span>
                  </span>
                  <p className="text-academic-deepGreen/90 leading-relaxed">
                    {assessment.instructions}
                  </p>
                </div>
              )}

              {/* Rubric Criteria Evaluation Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider flex items-center space-x-2">
                    <Award className="w-4 h-4 text-academic-primaryGreen" />
                    <span>Criterion-Level Rubric Breakdown</span>
                  </h3>
                  <span className="text-[11px] text-academic-muted font-medium">
                    {evaluation?.criterion_scores?.length || 0} Evaluated Criteria
                  </span>
                </div>

                {(!evaluation?.criterion_scores || evaluation.criterion_scores.length === 0) ? (
                  <div className="p-6 text-center bg-academic-paleGreen/10 border border-academic-border rounded-lg text-xs text-academic-muted">
                    No individual criterion scores recorded for this evaluation.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evaluation.criterion_scores.map((cs: CriterionScoreDTO, idx: number) => {
                      const critMax = cs.criterion_max_marks || 0;
                      const critScore = cs.score || 0;
                      const critPct = critMax > 0 ? Math.round((critScore / critMax) * 100) : 0;

                      return (
                        <div
                          key={cs.id || cs.criterion_id || idx}
                          className="p-4 rounded-lg border border-academic-border bg-academic-surface space-y-3 shadow-2xs hover:border-academic-primaryGreen/50 transition-colors"
                        >
                          {/* Criterion Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-academic-border/60 pb-2.5">
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="w-5 h-5 rounded-full bg-academic-paleGreen text-academic-deepGreen text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {cs.display_order ?? idx + 1}
                                </span>
                                <h4 className="text-xs font-bold text-academic-deepGreen">
                                  {cs.criterion_title || `Criterion ${idx + 1}`}
                                </h4>
                              </div>
                              {cs.criterion_description && (
                                <p className="text-[11px] text-academic-muted pl-7">
                                  {cs.criterion_description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center space-x-2 pl-7 sm:pl-0">
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-academic-paleGreen/60 text-academic-deepGreen border border-academic-border">
                                {critScore} <span className="text-[10px] text-academic-muted font-normal">/ {critMax} Marks</span>
                              </span>
                              <span className="text-[10px] font-semibold text-academic-primaryGreen">
                                ({critPct}%)
                              </span>
                            </div>
                          </div>

                          {/* Selected Rubric Level */}
                          {cs.selected_level ? (
                            <div className="p-3 rounded-md bg-emerald-50/60 border border-emerald-200/80 space-y-1 text-xs">
                              <div className="flex items-center space-x-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span className="font-bold text-emerald-900 text-[11px]">
                                  Attained Performance Level: {cs.selected_level.label}
                                </span>
                              </div>
                              {cs.selected_level.description && (
                                <p className="text-[11px] text-emerald-800/90 leading-relaxed pl-5">
                                  {cs.selected_level.description}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="text-[10px] text-academic-muted italic">
                              Direct criterion score awarded without level descriptor.
                            </div>
                          )}

                          {/* Criterion Feedback */}
                          {cs.feedback && (
                            <div className="text-xs text-academic-deepGreen pl-3 border-l-2 border-academic-primaryGreen bg-academic-paleGreen/15 py-1.5 pr-2 rounded-r">
                              <span className="font-semibold text-academic-muted text-[10px] block uppercase tracking-wider">
                                Faculty Note:
                              </span>
                              <p className="text-[11px] text-academic-deepGreen mt-0.5">
                                {cs.feedback}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Overall Faculty Feedback */}
              {evaluation?.general_feedback && (
                <div className="p-4 rounded-lg border border-academic-border bg-academic-paleGreen/20 space-y-1.5">
                  <span className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider flex items-center space-x-2">
                    <span>Instructor General Feedback & Recommendations</span>
                  </span>
                  <p className="text-xs text-academic-deepGreen leading-relaxed italic bg-academic-surface/60 p-3 rounded border border-academic-border/50">
                    "{evaluation.general_feedback}"
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Bar */}
        <div className="px-5 py-3 border-t border-academic-border bg-academic-surface flex items-center justify-between">
          <span className="text-[11px] text-academic-muted font-medium">
            AcadAssess Academic Moderation & Formative Evaluation System
          </span>
          <button
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-1.5"
          >
            Close Detail
          </button>
        </div>
      </div>
    </div>
  );
};
