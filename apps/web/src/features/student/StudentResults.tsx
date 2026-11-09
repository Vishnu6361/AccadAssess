import React, { useState, useEffect } from 'react';
import { 
  ScrollText, 
  Clock, 
  Loader2, 
  AlertCircle
} from 'lucide-react';
import { evaluationApi, EvaluationDTO } from '../../services/apiClient';

export const StudentResults: React.FC = () => {
  const [results, setResults] = useState<EvaluationDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadResults = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.getMyResults();
      setResults(data);
    } catch {
      setError('Unable to load published results. Please verify your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-academic-surface border border-academic-border rounded-lg p-5 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-academic-paleGreen text-academic-primaryGreen">
            <ScrollText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-academic-deepGreen tracking-tight">
              Published Assessment Results & Rubric Feedback
            </h1>
            <p className="text-xs text-academic-muted mt-0.5">
              Official formative grades and criterion-level rubric feedback published by your course faculty.
            </p>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="p-16 text-center text-academic-muted flex flex-col items-center space-y-2 bg-academic-surface border border-academic-border rounded-lg shadow-sm">
          <Loader2 className="w-6 h-6 animate-spin text-academic-primaryGreen" />
          <p className="text-xs font-medium">Fetching published academic results...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="p-12 text-center text-academic-muted bg-academic-surface border border-academic-border rounded-lg shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-full bg-academic-paleGreen text-academic-primaryGreen flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-bold text-academic-deepGreen">
            No Published Results Yet
          </h2>
          <p className="text-xs text-academic-muted max-w-md mx-auto leading-relaxed">
            Your submitted answers are currently undergoing instructor evaluation and academic moderation. Grades and rubric score breakdowns will appear here immediately upon official publication.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {results.map((result) => {
            const maxMarks = (result as any).assessment_max_marks || result.question_max_marks || 50;
            const percentage = maxMarks 
              ? Math.round((result.total_score / maxMarks) * 100) 
              : 0;

            return (
              <div 
                key={result.id} 
                className="bg-academic-surface border border-academic-border rounded-lg shadow-sm overflow-hidden"
              >
                {/* Result Card Header */}
                <div className="p-5 border-b border-academic-border bg-academic-paleGreen/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Official Result
                      </span>
                      <span className="text-xs text-academic-muted font-medium">
                        Evaluator: {result.evaluator_name || 'Faculty'}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-academic-deepGreen">
                      {result.assessment_title || 'Formative Assessment'}
                    </h2>
                    <p className="text-xs text-academic-muted">
                      Published on {new Date(result.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Score Pill */}
                  <div className="flex items-center space-x-3 sm:text-right">
                    <div className="p-3 rounded-lg bg-academic-surface border border-academic-border shadow-xs">
                      <span className="text-[11px] font-semibold text-academic-muted uppercase tracking-wider block">
                        Final Score
                      </span>
                      <div className="text-lg font-bold text-academic-deepGreen">
                        {result.total_score} <span className="text-xs text-academic-muted font-normal">/ {maxMarks} Marks</span>
                      </div>
                      <span className="text-[11px] text-academic-primaryGreen font-semibold block">
                        {percentage}% Score
                      </span>
                      {Boolean(result.late_penalty_deducted && result.late_penalty_deducted > 0) && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono inline-block mt-1">
                          Late Penalty: -{result.late_penalty_deducted} Marks
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Question Prompt or Instructions */}
                <div className="p-5 border-b border-academic-border bg-[#FFFDF8] text-xs">
                  <span className="font-semibold text-academic-deepGreen block mb-1">
                    {result.question_prompt ? 'Evaluated Question Prompt:' : 'Course Assessment Instructions:'}
                  </span>
                  <p className="text-academic-deepGreen leading-relaxed">
                    {result.question_prompt || (result as any).assessment_instructions || 'Refer to submitted coursework and published assignment brief.'}
                  </p>
                </div>

                {/* Rubric Criteria Breakdown */}
                <div className="p-5 space-y-4">
                  <h3 className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider">
                    Rubric Criteria Evaluation Breakdown
                  </h3>

                  <div className="space-y-3">
                    {result.criterion_scores.map((cs, idx) => (
                      <div 
                        key={cs.id || idx} 
                        className="p-4 rounded-lg border border-academic-border bg-academic-surface space-y-2 text-xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span className="font-bold text-academic-deepGreen">
                            {cs.criterion_title}
                          </span>
                          <span className="font-semibold text-academic-deepGreen whitespace-nowrap">
                            Marks Awarded: <strong>{cs.score}</strong> / {cs.criterion_max_marks}
                          </span>
                        </div>

                        {cs.selected_level && (
                          <div className="p-2.5 rounded bg-academic-paleGreen/30 border border-academic-border/60">
                            <span className="font-semibold text-academic-deepGreen text-[11px] block">
                              Achieved Performance Level: {cs.selected_level.label}
                            </span>
                            <p className="text-[11px] text-academic-muted mt-0.5">
                              {cs.selected_level.description}
                            </p>
                          </div>
                        )}

                        {cs.feedback && (
                          <div className="text-[11px] text-academic-deepGreen pl-2 border-l-2 border-academic-primaryGreen">
                            <strong className="text-academic-muted">Faculty Note:</strong> {cs.feedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Overall Faculty Feedback */}
                {result.general_feedback && (
                  <div className="px-5 py-4 border-t border-academic-border bg-academic-paleGreen/10 text-xs">
                    <span className="font-bold text-academic-deepGreen block mb-1">
                      Instructor General Remarks:
                    </span>
                    <p className="text-academic-deepGreen leading-relaxed italic">
                      "{result.general_feedback}"
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default StudentResults;
