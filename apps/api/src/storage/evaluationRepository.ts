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
    return found ? { ...found } : null;
  }

  async getEvaluationBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const found = this.inMemoryDb.evaluations.find(e => e.submission_id === submissionId);
    return found ? { ...found } : null;
  }

  async listEvaluationsForAssessment(assessmentId: string): Promise<any[]> {
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = subs.map(s => s.id);
    return this.inMemoryDb.evaluations.filter(e => subIds.includes(e.submission_id));
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

    if (evaluation) {
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

    return evaluation;
  }

  async publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }> {
    const nowIso = new Date().toISOString();
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
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
      .map(e => ({ ...e }));
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

    const nowIso = new Date().toISOString();
    const isLate = submission.late_status === 'late';
    let penaltyToDeduct = 0;
    if (isLate && assessment.late_penalty_mode === 'fixed') {
      penaltyToDeduct = Number(assessment.late_penalty_marks || 0);
    }

    let finalRawScore = params.rawScore ?? 0;
    if (params.criterionScores && params.criterionScores.length > 0) {
      finalRawScore = params.criterionScores.reduce((sum, cs) => sum + Number(cs.score || 0), 0);
    }

    const calculatedTotal = Math.max(0, finalRawScore - penaltyToDeduct);
    const existing = await this.getEvaluationBySubmissionId(params.submissionId);

    let evaluationResult: Evaluation;

    if (existing) {
      const { data: updated, error: updateErr } = await this.client
        .from('evaluations')
        .update({
          status: params.status,
          raw_score: finalRawScore,
          late_penalty_deducted: penaltyToDeduct,
          total_score: calculatedTotal,
          general_feedback: params.generalFeedback || null,
          updated_at: nowIso
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateErr) throw new Error(`Failed to update evaluation: ${updateErr.message}`);
      evaluationResult = updated;
    } else {
      const { data: inserted, error: insertErr } = await this.client
        .from('evaluations')
        .insert({
          id: randomUUID(),
          submission_id: params.submissionId,
          submission_version_id: submission.active_version_id || randomUUID(),
          evaluator_id: params.evaluatorId,
          status: params.status,
          raw_score: finalRawScore,
          late_penalty_deducted: penaltyToDeduct,
          total_score: calculatedTotal,
          general_feedback: params.generalFeedback || null,
          created_at: nowIso,
          updated_at: nowIso
        })
        .select()
        .single();

      if (insertErr) throw new Error(`Failed to insert evaluation: ${insertErr.message}`);
      evaluationResult = inserted;
    }

    if (params.criterionScores && params.criterionScores.length > 0) {
      await this.client.from('evaluation_criterion_scores').delete().eq('evaluation_id', evaluationResult.id);

      const toInsert = params.criterionScores.map(cs => ({
        id: randomUUID(),
        evaluation_id: evaluationResult.id,
        criterion_id: cs.criterion_id,
        selected_level_id: cs.selected_level_id || null,
        score: Number(cs.score),
        feedback: cs.feedback || null,
        created_at: nowIso
      }));

      await this.client.from('evaluation_criterion_scores').insert(toInsert);
    }

    return evaluationResult;
  }

  async publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }> {
    this.assertStagingProject();
    const nowIso = new Date().toISOString();

    const { data: subs } = await this.client
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessmentId);

    const subIds = (subs || []).map(s => s.id);
    let count = 0;

    if (subIds.length > 0) {
      const { data: updatedEvals, error: updateErr } = await this.client
        .from('evaluations')
        .update({ status: 'published', updated_at: nowIso })
        .in('submission_id', subIds)
        .eq('status', 'completed')
        .select();

      if (updateErr) throw new Error(`Failed to transition evaluations to published: ${updateErr.message}`);
      count = updatedEvals ? updatedEvals.length : 0;
    }

    const { data: publication, error: pubErr } = await this.client
      .from('result_publications')
      .insert({
        id: randomUUID(),
        assessment_id: assessmentId,
        published_by: publishedBy,
        published_at: nowIso,
        remarks: remarks || null
      })
      .select()
      .single();

    if (pubErr) throw new Error(`Failed to record result publication: ${pubErr.message}`);

    return { publication, publishedCount: count };
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
      .select('*')
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

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    return new SupabaseEvaluationRepository(supabaseAdmin);
  }

  return new InMemoryEvaluationRepository(db);
};
