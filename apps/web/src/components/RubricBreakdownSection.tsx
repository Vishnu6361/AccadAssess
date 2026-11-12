import React from 'react';
import { Award, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { CriterionScoreDTO } from '../services/apiClient';

export interface RubricBreakdownSectionProps {
  criterionScores?: CriterionScoreDTO[] | null;
  totalScore?: number | null;
  maxMarks?: number | null;
  evaluatorName?: string | null;
  evaluationStatus?: string | null;
  generalFeedback?: string | null;
  latePenaltyDeducted?: number | null;
  rawScore?: number | null;
  isLoading?: boolean;
  isSubmitted?: boolean;
}

export const RubricBreakdownSection: React.FC<RubricBreakdownSectionProps> = ({
  criterionScores,
  totalScore,
  maxMarks = 50,
  evaluatorName,
  evaluationStatus,
  generalFeedback,
  latePenaltyDeducted,
  rawScore,
  isLoading = false,
  isSubmitted = true
}) => {
  if (isLoading) {
    return (
      <div className="p-5 rounded-lg border border-academic-border bg-academic-surface text-center space-y-2">
        <div className="w-5 h-5 border-2 border-academic-primaryGreen border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-academic-muted font-medium">
          Loading rubric criteria and evaluation breakdown...
        </p>
      </div>
    );
  }

  // Case 1: Unsubmitted assignment
  if (!isSubmitted) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-academic-border bg-academic-surface/60 text-center space-y-1.5">
        <Clock className="w-5 h-5 text-academic-muted mx-auto" />
        <p className="text-xs font-bold text-academic-deepGreen">
          Pending Student Submission
        </p>
        <p className="text-[11px] text-academic-muted max-w-sm mx-auto leading-relaxed">
          No submission turned in yet. Rubric evaluation and criterion scoring will take place after coursework is submitted.
        </p>
      </div>
    );
  }

  // Case 2: Submitted but not evaluated yet
  const hasScores = Array.isArray(criterionScores) && criterionScores.length > 0;
  if (!hasScores && (evaluationStatus === 'pending' || evaluationStatus === 'not_submitted' || !evaluationStatus || evaluationStatus === 'under_evaluation')) {
    return (
      <div className="p-4 rounded-lg border border-academic-border bg-amber-50/50 text-center space-y-1.5">
        <Clock className="w-5 h-5 text-amber-700 mx-auto" />
        <p className="text-xs font-bold text-amber-900">
          Pending Rubric Evaluation
        </p>
        <p className="text-[11px] text-amber-800/90 max-w-sm mx-auto leading-relaxed">
          The student has submitted coursework, but individual rubric criteria have not been evaluated yet. Once course faculty completes scoring, the full breakdown will display here.
        </p>
      </div>
    );
  }

  // Case 3: Evaluation completed/published but no criteria saved
  if (!hasScores) {
    return (
      <div className="p-4 rounded-lg border border-academic-border bg-academic-surface text-center space-y-1">
        <AlertCircle className="w-5 h-5 text-academic-muted mx-auto" />
        <p className="text-xs font-bold text-academic-deepGreen">
          No Rubric Criteria Available
        </p>
        <p className="text-[11px] text-academic-muted">
          A total score of {totalScore ?? '—'} / {maxMarks} was recorded without individual criterion items.
        </p>
      </div>
    );
  }

  // Case 4: Full Rubric Criteria Breakdown Available
  const safeMaxMarks = maxMarks && maxMarks > 0 ? maxMarks : 50;
  const safeTotalScore = totalScore !== null && totalScore !== undefined ? totalScore : 0;
  const totalPercentage = Math.round((safeTotalScore / safeMaxMarks) * 100);

  return (
    <div className="space-y-3.5">
      {/* Rubric Section Header with Total Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-academic-paleGreen/25 border border-academic-border rounded-lg">
        <div className="flex items-center space-x-2">
          <Award className="w-4 h-4 text-academic-primaryGreen shrink-0" />
          <div>
            <span className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider block">
              Rubric-wise Evaluation Breakdown
            </span>
            <span className="text-[11px] text-academic-muted">
              {criterionScores.length} Evaluated {criterionScores.length === 1 ? 'Criterion' : 'Criteria'}
              {evaluatorName ? ` • Evaluated by ${evaluatorName}` : ''}
            </span>
          </div>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <div className="flex items-baseline space-x-1.5 justify-start sm:justify-end">
            <span className="text-base font-bold text-academic-deepGreen">
              {safeTotalScore}
            </span>
            <span className="text-xs text-academic-muted font-medium">
              / {safeMaxMarks} Marks
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-academic-primaryGreen text-white">
              {totalPercentage}%
            </span>
          </div>
          {Boolean(latePenaltyDeducted && latePenaltyDeducted > 0) && (
            <span className="text-[10px] text-amber-800 font-mono block mt-0.5">
              (Raw: {rawScore ?? safeTotalScore + (latePenaltyDeducted || 0)} - {latePenaltyDeducted} late)
            </span>
          )}
        </div>
      </div>

      {/* Individual Criterion Cards */}
      <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
        {criterionScores.map((cs, idx) => {
          const critMax = cs.criterion_max_marks || 0;
          const critScore = cs.score || 0;
          const critPct = critMax > 0 ? Math.round((critScore / critMax) * 100) : 0;

          return (
            <div
              key={cs.id || cs.criterion_id || idx}
              className="p-3.5 rounded-lg border border-academic-border bg-academic-surface space-y-2.5 shadow-2xs hover:border-academic-primaryGreen/40 transition-colors"
            >
              {/* Criterion Title and Marks */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-academic-border/60 pb-2">
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-academic-paleGreen text-academic-deepGreen text-[10px] font-bold flex items-center justify-center shrink-0">
                      {cs.display_order ?? idx + 1}
                    </span>
                    <h4 className="text-xs font-bold text-academic-deepGreen truncate">
                      {cs.criterion_title || `Criterion ${idx + 1}`}
                    </h4>
                  </div>
                  {cs.criterion_description && (
                    <p className="text-[11px] text-academic-muted pl-7 leading-relaxed">
                      {cs.criterion_description}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2 pl-7 sm:pl-0 shrink-0 self-end sm:self-auto">
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-academic-paleGreen/50 text-academic-deepGreen border border-academic-border">
                    {critScore} <span className="text-[10px] text-academic-muted font-normal">/ {critMax} Marks</span>
                  </span>
                  <span className="text-[10px] font-semibold text-academic-primaryGreen">
                    ({critPct}%)
                  </span>
                </div>
              </div>

              {/* Performance Level */}
              {cs.selected_level ? (
                <div className="p-2.5 rounded-md bg-emerald-50/70 border border-emerald-200/80 space-y-1 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="font-bold text-emerald-900 text-[11px]">
                      Performance Level: {cs.selected_level.label}
                    </span>
                  </div>
                  {cs.selected_level.description && (
                    <p className="text-[11px] text-emerald-800/90 leading-relaxed pl-5">
                      {cs.selected_level.description}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Evaluator Criterion Feedback */}
              {cs.feedback && (
                <div className="text-xs text-academic-deepGreen pl-3 border-l-2 border-academic-primaryGreen bg-academic-paleGreen/15 py-1.5 pr-2 rounded-r">
                  <span className="font-semibold text-academic-muted text-[10px] block uppercase tracking-wider">
                    Criterion Feedback:
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

      {/* General Evaluator Feedback (if stored) */}
      {generalFeedback && (
        <div className="p-3.5 rounded-lg border border-academic-border bg-academic-paleGreen/20 space-y-1">
          <span className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider block">
            General Evaluator Feedback
          </span>
          <p className="text-[11px] text-academic-deepGreen/90 leading-relaxed italic">
            "{generalFeedback}"
          </p>
        </div>
      )}
    </div>
  );
};

