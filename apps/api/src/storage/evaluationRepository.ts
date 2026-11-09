import { 
  Evaluation, 
  ResultPublication
} from '@smartfa/contracts';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { db, InMemoryDatabase } from './db.js';

export interface IEvaluationRepository {
  getEvaluationById(id: string): Promise<Evaluation | null>;
  getEvaluationBySubmissionId(submissionId: string): Promise<Evaluation | null>;
  listEvaluationsForAssessment(assessmentId: string): Promise<any[]>;
  saveEvaluation(params: {
    submissionId: string;
    evaluatorId: string;
    status: 'draft' | 'completed';
    rawScore?: number;
    generalFeedback?: string;
    criterionScores?: any[];
  }): Promise<Evaluation>;
  publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }>;
  getStudentPublishedResults(studentId: string): Promise<any[]>;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

export class InMemoryEvaluationRepository implements IEvaluationRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async getEvaluationById(id: string): Promise<Evaluation | null> {
    const found = this.inMemoryDb.evaluations.find(e => e.id === id);
    if (!found) return null;
    const criterion_scores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === found.id);
    return { ...found, criterion_scores };
  }

  async getEvaluationBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const found = this.inMemoryDb.evaluations.find(e => e.submission_id === submissionId);
    if (!found) return null;
    const criterion_scores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === found.id);
    return { ...found, criterion_scores };
  }

  async listEvaluationsForAssessment(assessmentId: string): Promise<any[]> {
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = subs.map(s => s.id);
    return this.inMemoryDb.evaluations
      .filter(e => subIds.includes(e.submission_id))
      .map(e => ({
        ...e,
        criterion_scores: this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === e.id)
      }));
  }

  async saveEvaluation(params: {
    submissionId: string;
    evaluatorId: string;
    status: 'draft' | 'completed';
    rawScore?: number;
    generalFeedback?: string;
    criterionScores?: any[];
  }): Promise<Evaluation> {
    const submission = this.inMemoryDb.submissions.find(s => s.id === params.submissionId);
    if (!submission) throw new Error('Submission not found');

    const assessment = this.inMemoryDb.assessments.find(a => a.id === submission.assessment_id);
    if (!assessment) throw new Error('Assessment not found');

    const nowIso = new Date().toISOString();

    if (this.inMemoryDb.resultPublications.some(rp => rp.assessment_id === submission.assessment_id)) {
      throw new Error('Cannot grade assignment: Results have already been published for this assessment');
    }

    let evaluation = this.inMemoryDb.evaluations.find(e => e.submission_id === params.submissionId);

    const isLate = submission.late_status === 'late';
    let penaltyToDeduct = 0;
    if (isLate && assessment.late_penalty_mode === 'fixed') {
      penaltyToDeduct = Number(assessment.late_penalty_marks || 0);
    }

    let calculatedTotal = 0;
    let finalRawScore = params.rawScore ?? 0;

    if (params.criterionScores && params.criterionScores.length > 0) {
      finalRawScore = params.criterionScores.reduce((sum, cs) => sum + Number(cs.score || 0), 0);
    }

    calculatedTotal = Math.max(0, finalRawScore - penaltyToDeduct);

    if (params.status !== 'draft' && params.status !== 'completed') {
      throw new Error(`Invalid evaluation status "${params.status}": Evaluations can only be saved as draft or completed. Result publication must proceed through publishResults.`);
    }

    if (evaluation) {
      if (evaluation.status === 'published') {
        throw new Error('Cannot modify a published evaluation');
      }
      evaluation.status = params.status;
      evaluation.raw_score = finalRawScore;
      evaluation.late_penalty_deducted = penaltyToDeduct;
      evaluation.total_score = calculatedTotal;
      evaluation.general_feedback = params.generalFeedback || null;
      evaluation.updated_at = nowIso;
    } else {
      evaluation = {
        id: randomUUID(),
        submission_id: params.submissionId,
        submission_version_id: submission.active_version_id || randomUUID(),
        evaluator_id: params.evaluatorId,
        status: params.status,
        raw_score: finalRawScore,
        late_penalty_deducted: penaltyToDeduct,
        total_score: calculatedTotal,
        general_feedback: params.generalFeedback || null,
        criterion_scores: [],
        created_at: nowIso,
        updated_at: nowIso
      };
      this.inMemoryDb.evaluations.push(evaluation);
    }

    if (params.criterionScores && params.criterionScores.length > 0) {
      this.inMemoryDb.evaluationCriterionScores = this.inMemoryDb.evaluationCriterionScores.filter(
        cs => cs.evaluation_id !== evaluation!.id
      );

      for (const cs of params.criterionScores) {
        this.inMemoryDb.evaluationCriterionScores.push({
          id: randomUUID(),
          evaluation_id: evaluation.id,
          criterion_id: cs.criterion_id,
          selected_level_id: cs.selected_level_id || null,
          score: Number(cs.score),
          feedback: cs.feedback || null,
          created_at: nowIso
        });
      }
    }

    const criterion_scores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === evaluation!.id);
    return { ...evaluation, criterion_scores };
  }

  async publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }> {
    const nowIso = new Date().toISOString();

    if (this.inMemoryDb.resultPublications.some(rp => rp.assessment_id === assessmentId)) {
      const err: any = new Error(`Grades for assessment ${assessmentId} have already been published`);
      err.code = 'ALREADY_PUBLISHED';
      throw err;
    }

    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    if (subs.length === 0) {
      const err: any = new Error(`Cannot publish grades: No student submissions exist for assessment ${assessmentId}`);
      err.code = 'NO_SUBMISSIONS';
      throw err;
    }

    const incomplete = subs.filter(s => {
      const ev = this.inMemoryDb.evaluations.find(e => e.submission_id === s.id);
      return !ev || ev.status !== 'completed';
    });

    if (incomplete.length > 0) {
      const err: any = new Error(`Cannot publish grades: ${incomplete.length} submitted assignment(s) are awaiting completed evaluation`);
      err.code = 'INCOMPLETE_EVALUATIONS';
      throw err;
    }

    const subIds = subs.map(s => s.id);
    let count = 0;
    for (const ev of this.inMemoryDb.evaluations) {
      if (subIds.includes(ev.submission_id) && ev.status === 'completed') {
        ev.status = 'published';
        ev.updated_at = nowIso;
        count++;
      }
    }

    const publication: ResultPublication = {
      id: randomUUID(),
      assessment_id: assessmentId,
      published_by: publishedBy,
      published_at: nowIso,
      remarks: remarks || null
    };
    this.inMemoryDb.resultPublications.push(publication);

    return { publication, publishedCount: count };
  }

  async getStudentPublishedResults(studentId: string): Promise<any[]> {
    const studentSubs = this.inMemoryDb.submissions.filter(s => s.student_id === studentId);
    const subIds = studentSubs.map(s => s.id);

    return this.inMemoryDb.evaluations
      .filter(e => subIds.includes(e.submission_id) && e.status === 'published')
      .map(e => {
        const criterion_scores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === e.id);
        return { ...e, criterion_scores };
      });
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'in_memory_mock';
  }
}

export class SupabaseEvaluationRepository implements IEvaluationRepository {
  constructor(private client: SupabaseClient) {}

  private assertStagingProject(): void {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    if (url.includes('rdfloxppwlbocxplbixu') && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production') {
      throw new Error('SECURITY VIOLATION: Writes to production project rdfloxppwlbocxplbixu are strictly forbidden in non-production mode!');
    }
  }

  async getEvaluationById(id: string): Promise<Evaluation | null> {
    const { data, error } = await this.client
      .from('evaluations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to get evaluation: ${error.message}`);
    return data || null;
  }

  async getEvaluationBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const { data, error } = await this.client
      .from('evaluations')
      .select('*')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (error) throw new Error(`Failed to find evaluation: ${error.message}`);
    if (!data) return null;

    const { data: scores } = await this.client
      .from('evaluation_criterion_scores')
      .select('*')
      .eq('evaluation_id', data.id);

    return {
      ...data,
      criterion_scores: scores || []
    };
  }

  async listEvaluationsForAssessment(assessmentId: string): Promise<any[]> {
    const { data: subs } = await this.client
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessmentId);

    const subIds = (subs || []).map(s => s.id);
    if (subIds.length === 0) return [];

    const { data: evals, error } = await this.client
      .from('evaluations')
      .select('*')
      .in('submission_id', subIds);

    if (error) throw new Error(`Failed to list evaluations: ${error.message}`);
    return evals || [];
  }

  async saveEvaluation(params: {
    submissionId: string;
    evaluatorId: string;
    status: 'draft' | 'completed';
    rawScore?: number;
    generalFeedback?: string;
    criterionScores?: any[];
  }): Promise<Evaluation> {
    this.assertStagingProject();

    const { data: submission, error: subErr } = await this.client
      .from('submissions')
      .select('id, assessment_id, active_version_id, late_status')
      .eq('id', params.submissionId)
      .single();

    if (subErr || !submission) throw new Error('Submission not found in PostgreSQL');

    const { data: assessment, error: assErr } = await this.client
      .from('assessments')
      .select('late_penalty_mode, late_penalty_marks')
      .eq('id', submission.assessment_id)
      .single();

    if (assErr || !assessment) throw new Error('Assessment not found in PostgreSQL');

    const isLate = submission.late_status === 'late';
    let penaltyToDeduct = 0;
    if (isLate && assessment.late_penalty_mode === 'fixed') {
      penaltyToDeduct = Number(assessment.late_penalty_marks || 0);
    }

    let finalRawScore = params.rawScore ?? 0;
    if (params.criterionScores && params.criterionScores.length > 0) {
      finalRawScore = params.criterionScores.reduce((sum: number, cs: any) => sum + Number(cs.score || 0), 0);
    }

    const calculatedTotal = Math.max(0, finalRawScore - penaltyToDeduct);

    const { data: evalResult, error: evalErr } = await this.client.rpc('save_evaluation_atomic', {
      p_submission_id: params.submissionId,
      p_submission_version_id: submission.active_version_id || randomUUID(),
      p_evaluator_id: params.evaluatorId,
      p_status: params.status,
      p_raw_score: finalRawScore,
      p_late_penalty_deducted: penaltyToDeduct,
      p_total_score: calculatedTotal,
      p_general_feedback: params.generalFeedback || null,
      p_criterion_scores: (params.criterionScores || []).map((cs: any) => ({
        id: cs.id || randomUUID(),
        criterion_id: cs.criterion_id,
        selected_level_id: cs.selected_level_id || null,
        score: Number(cs.score),
        feedback: cs.feedback || null
      }))
    });

    if (evalErr) {
      throw new Error(`Failed to save evaluation: ${evalErr.message}`);
    }

    const fullEval = await this.getEvaluationById(evalResult.id);
    return fullEval as Evaluation;
  }

  async publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }> {
    this.assertStagingProject();

    const { data, error } = await this.client.rpc('publish_evaluation_results', {
      p_assessment_id: assessmentId,
      p_published_by: publishedBy,
      p_remarks: remarks || null
    });

    if (error) {
      if (error.code === 'P0004' || error.message?.includes('already been published')) {
        const err: any = new Error(error.message);
        err.code = 'ALREADY_PUBLISHED';
        throw err;
      }
      if (error.code === 'P0005' || error.message?.includes('No student submissions exist')) {
        const err: any = new Error(error.message);
        err.code = 'NO_SUBMISSIONS';
        throw err;
      }
      if (error.code === 'P0006' || error.message?.includes('awaiting completed evaluation')) {
        const err: any = new Error(error.message);
        err.code = 'INCOMPLETE_EVALUATIONS';
        throw err;
      }
      throw new Error(`Failed to publish evaluation results: ${error.message}`);
    }

    return {
      publication: data.publication as ResultPublication,
      publishedCount: data.published_count as number
    };
  }

  async getStudentPublishedResults(studentId: string): Promise<any[]> {
    const { data: subs } = await this.client
      .from('submissions')
      .select('id')
      .eq('student_id', studentId);

    const subIds = (subs || []).map(s => s.id);
    if (subIds.length === 0) return [];

    const { data: evals, error } = await this.client
      .from('evaluations')
      .select('*, criterion_scores:evaluation_criterion_scores(*)')
      .in('submission_id', subIds)
      .eq('status', 'published')
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to query student published results: ${error.message}`);
    return evals || [];
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

let activeEvaluationRepoOverride: IEvaluationRepository | null = null;

export const setEvaluationRepositoryForTesting = (repo: IEvaluationRepository | null): void => {
  activeEvaluationRepoOverride = repo;
};

export const getEvaluationRepository = (): IEvaluationRepository => {
  if (activeEvaluationRepoOverride) return activeEvaluationRepoOverride;

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    return new InMemoryEvaluationRepository(db);
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    return new SupabaseEvaluationRepository(supabaseAdmin);
  }

  return new InMemoryEvaluationRepository(db);
};
