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
  getStudentPerformanceDashboard(studentId: string): Promise<any[]>;
  getClassTeacherAcademicReport(userId: string, isHOD: boolean, filters?: { class_id?: string; subject_id?: string; assessment_id?: string }): Promise<any>;
  getProctorAcademicReport(proctorId: string, isHOD: boolean): Promise<any>;
  getHodDepartmentAcademicReport(filters?: { semester?: number; class_id?: string; section?: string; subject_id?: string; assessment_id?: string; publication_status?: string }): Promise<any>;
  getDetailedResult(submissionId: string): Promise<any | null>;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

function enrichInMemoryCriterionScores(inMemoryDb: InMemoryDatabase, scores: any[]): any[] {
  return (scores || []).map(s => {
    const crit = inMemoryDb.rubricCriteria.find(c => c.id === s.criterion_id);
    const lvl = s.selected_level_id ? inMemoryDb.rubricLevels.find(l => l.id === s.selected_level_id) : null;
    return {
      id: s.id,
      evaluation_id: s.evaluation_id,
      criterion_id: s.criterion_id,
      criterion_title: crit?.title || 'Criterion',
      criterion_description: crit?.description || '',
      criterion_max_marks: crit ? Number(crit.max_marks) : 0,
      score: Number(s.score),
      display_order: crit?.display_order || 0,
      feedback: s.feedback || null,
      selected_level_id: s.selected_level_id || null,
      selected_level: lvl ? {
        id: lvl.id,
        label: lvl.label,
        description: lvl.description
      } : null
    };
  }).sort((a, b) => a.display_order - b.display_order);
}

export class InMemoryEvaluationRepository implements IEvaluationRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async getEvaluationById(id: string): Promise<Evaluation | null> {
    const found = this.inMemoryDb.evaluations.find(e => e.id === id);
    if (!found) return null;
    const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === found.id);
    const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);
    return { ...found, criterion_scores };
  }

  async getEvaluationBySubmissionId(submissionId: string): Promise<Evaluation | null> {
    const found = this.inMemoryDb.evaluations.find(e => e.submission_id === submissionId);
    if (!found) return null;
    const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === found.id);
    const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);
    return { ...found, criterion_scores };
  }

  async listEvaluationsForAssessment(assessmentId: string): Promise<any[]> {
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = subs.map(s => s.id);
    return this.inMemoryDb.evaluations
      .filter(e => subIds.includes(e.submission_id))
      .map(e => {
        const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === e.id);
        const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);
        return {
          ...e,
          criterion_scores
        };
      });
  }

  async saveEvaluation(params: {
    submissionId: string;
    evaluatorId: string;
    status: 'draft' | 'completed';
    rawScore?: number;
    generalFeedback?: string;
    criterionScores?: any[];
  }): Promise<Evaluation> {
    const sub = this.inMemoryDb.submissions.find(s => s.id === params.submissionId);
    if (!sub) throw new Error('Submission not found');

    const ass = this.inMemoryDb.assessments.find(a => a.id === sub.assessment_id);
    if (!ass) throw new Error('Assessment not found');

    const isLate = sub.late_status === 'late';
    let penaltyToDeduct = 0;
    if (isLate && ass.late_penalty_mode === 'fixed') {
      penaltyToDeduct = Number(ass.late_penalty_marks || 0);
    }

    let finalRawScore = params.rawScore ?? 0;
    if (params.rawScore === undefined && params.criterionScores && params.criterionScores.length > 0) {
      finalRawScore = params.criterionScores.reduce((sum: number, cs: any) => sum + Number(cs.score || 0), 0);
    }
    const calculatedTotal = Math.max(0, finalRawScore - penaltyToDeduct);

    let evaluation = this.inMemoryDb.evaluations.find(e => e.submission_id === params.submissionId);
    const nowIso = new Date().toISOString();

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
        submission_version_id: sub.active_version_id || randomUUID(),
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

    this.inMemoryDb.evaluationCriterionScores = this.inMemoryDb.evaluationCriterionScores.filter(
      cs => cs.evaluation_id !== evaluation!.id
    );

    if (params.criterionScores && params.criterionScores.length > 0) {
      for (const cs of params.criterionScores) {
        this.inMemoryDb.evaluationCriterionScores.push({
          id: cs.id || randomUUID(),
          evaluation_id: evaluation.id,
          criterion_id: cs.criterion_id,
          selected_level_id: cs.selected_level_id || null,
          score: Number(cs.score),
          feedback: cs.feedback || null,
          created_at: nowIso
        });
      }
    }

    const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === evaluation.id);
    evaluation.criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

    return evaluation;
  }

  async publishResults(assessmentId: string, publishedBy: string, remarks?: string): Promise<{ publication: ResultPublication; publishedCount: number }> {
    const nowIso = new Date().toISOString();

    const existingPub = this.inMemoryDb.resultPublications.find(rp => rp.assessment_id === assessmentId);
    if (existingPub) {
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
        const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === e.id);
        const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);
        const sub = this.inMemoryDb.submissions.find(s => s.id === e.submission_id);
        const ass = sub ? this.inMemoryDb.assessments.find(a => a.id === sub.assessment_id) : null;
        return {
          ...e,
          assessment_title: ass?.title || 'Formative Assessment',
          assessment_max_marks: ass?.max_marks || 50,
          criterion_scores
        };
      });
  }

  async getStudentPerformanceDashboard(studentId: string): Promise<any[]> {
    const enrollments = this.inMemoryDb.enrollments.filter(e => e.student_id === studentId && e.status === 'active');
    const classIds = enrollments.map(e => e.class_id);

    const classSubjects = this.inMemoryDb.classSubjects.filter(cs => classIds.includes(cs.class_id) && cs.active);

    return classSubjects.map(cs => {
      const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
      const subject = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
      const assessments = this.inMemoryDb.assessments.filter(a => a.class_subject_id === cs.id && a.status === 'published');

      let resultsCount = 0;
      let totalScoreSum = 0;
      let maxMarksSum = 0;

      const assList = assessments.map(ass => {
        const sub = this.inMemoryDb.submissions.find(s => s.assessment_id === ass.id && s.student_id === studentId);
        const ev = sub ? this.inMemoryDb.evaluations.find(e => e.submission_id === sub.id && e.status === 'published') : null;
        const pub = this.inMemoryDb.resultPublications.find(rp => rp.assessment_id === ass.id);

        let resultDetail = null;
        if (ev) {
          resultsCount++;
          totalScoreSum += Number(ev.total_score || 0);
          maxMarksSum += Number(ass.max_marks || 50);

          const rawScores = this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === ev.id);
          const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

          resultDetail = {
            evaluation_id: ev.id,
            submission_id: sub!.id,
            raw_score: Number(ev.raw_score || ev.total_score),
            late_penalty_deducted: Number(ev.late_penalty_deducted || 0),
            total_score: Number(ev.total_score),
            max_marks: Number(ass.max_marks || 50),
            percentage: Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100),
            late_status: sub!.late_status || 'on_time',
            published_at: pub?.published_at || ev.updated_at,
            general_feedback: ev.general_feedback || null,
            criterion_scores
          };
        }

        return {
          assessment_id: ass.id,
          title: ass.title,
          max_marks: Number(ass.max_marks || 50),
          due_date: ass.deadline_at,
          published_at: pub?.published_at || ass.created_at,
          has_result: Boolean(ev),
          publication_status: ev ? 'results_published' : (sub ? 'evaluation_pending' : 'not_submitted'),
          result: resultDetail
        };
      });

      return {
        subject_id: subject?.id,
        subject_code: subject?.code || 'SUB',
        subject_name: subject?.name || 'Subject',
        credits: subject?.credits || 3,
        class_id: cls?.id,
        programme: cls?.programme || 'MCA',
        semester: cls?.semester || 1,
        section: cls?.section || 'A',
        published_assessment_count: assessments.length,
        results_available_count: resultsCount,
        average_percentage: resultsCount > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null,
        average_marks: resultsCount > 0 ? Math.round((totalScoreSum / resultsCount) * 10) / 10 : null,
        assessments: assList
      };
    });
  }

  async getClassTeacherAcademicReport(userId: string, isHOD: boolean, filters?: { class_id?: string; subject_id?: string; assessment_id?: string }): Promise<any> {
    const classes = isHOD 
      ? this.inMemoryDb.classes 
      : this.inMemoryDb.classes.filter(c => c.class_teacher_id === userId);

    const classIds = classes.map(c => c.id);

    const classList = classes.map(cls => {
      const enrollments = this.inMemoryDb.enrollments.filter(e => e.class_id === cls.id && e.status === 'active');
      const csList = this.inMemoryDb.classSubjects.filter(cs => cs.class_id === cls.id && cs.active);

      const subjects = csList.map(cs => {
        const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
        const teacher = this.inMemoryDb.profiles.find(p => p.id === cs.subject_teacher_id);
        const assessments = this.inMemoryDb.assessments.filter(a => a.class_subject_id === cs.id && a.status === 'published');

        return {
          class_subject_id: cs.id,
          subject_id: sub?.id,
          subject_code: sub?.code,
          subject_name: sub?.name,
          subject_teacher_name: teacher?.full_name || 'Faculty',
          published_assessment_count: assessments.length,
          assessments: assessments.map(a => ({
            id: a.id,
            title: a.title,
            max_marks: a.max_marks || 50,
            due_date: a.deadline_at,
            published_at: a.created_at
          }))
        };
      });

      return {
        class_id: cls.id,
        programme: cls.programme,
        semester: cls.semester,
        section: cls.section,
        student_count: enrollments.length,
        subjects
      };
    });

    let selectedAssessmentRoster: any[] | null = null;
    let selectedAssessmentMeta: any | null = null;

    if (filters?.assessment_id) {
      const ass = this.inMemoryDb.assessments.find(a => a.id === filters.assessment_id);
      if (ass) {
        selectedAssessmentMeta = {
          id: ass.id,
          title: ass.title,
          max_marks: ass.max_marks || 50,
          due_date: ass.deadline_at
        };

        const cs = this.inMemoryDb.classSubjects.find(c => c.id === ass.class_subject_id);
        let classEnrs = cs ? this.inMemoryDb.enrollments.filter(e => e.class_id === cs.class_id && e.status === 'active') : [];
        if (ass.publishing_audience === 'selected') {
          const targets = (this.inMemoryDb.assessment_student_targets || []).filter(t => t.assessment_id === ass.id);
          const targetIds = new Set(targets.map(t => t.student_id));
          classEnrs = classEnrs.filter(e => targetIds.has(e.student_id));
        }
        const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === ass.id);

        selectedAssessmentRoster = classEnrs.map(enr => {
          const student = this.inMemoryDb.profiles.find(p => p.id === enr.student_id);
          const sub = subs.find(s => s.student_id === enr.student_id);
          const ev = sub ? this.inMemoryDb.evaluations.find(e => e.submission_id === sub.id) : null;
          const rawScores = ev ? this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === ev.id) : [];
          const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

          return {
            student_id: enr.student_id,
            student_name: student?.full_name || 'Student',
            roll_number: enr.roll_number || '—',
            email: student?.email,
            submission_id: sub?.id || null,
            has_submitted: Boolean(sub),
            submission_date: sub?.first_submitted_at || null,
            late_status: sub?.late_status || 'not_submitted',
            evaluation_id: ev?.id || null,
            evaluation_status: ev ? ev.status : (sub ? 'pending_evaluation' : 'not_submitted'),
            raw_score: ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: ev ? Number(ev.late_penalty_deducted || 0) : 0,
            total_score: ev ? Number(ev.total_score) : null,
            max_marks: Number(ass.max_marks || 50),
            percentage: ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            criterion_scores
          };
        });
      }
    }

    return {
      classes: classList,
      selected_assessment: selectedAssessmentMeta,
      student_roster: selectedAssessmentRoster
    };
  }

  async getProctorAcademicReport(proctorId: string, isHOD: boolean): Promise<any> {
    const assignments = (isHOD
      ? this.inMemoryDb.proctorAssignments
      : this.inMemoryDb.proctorAssignments.filter(pa => pa.proctor_id === proctorId)
    ).filter(pa => !pa.valid_to || new Date(pa.valid_to) > new Date());

    const mentees = assignments.map(pa => {
      const student = this.inMemoryDb.profiles.find(p => p.id === pa.student_id);
      const enr = this.inMemoryDb.enrollments.find(e => e.student_id === pa.student_id && e.status === 'active');
      const cls = enr ? this.inMemoryDb.classes.find(c => c.id === enr.class_id) : null;
      const studentSpecId = enr?.specialization_id;
      const spec = studentSpecId ? (this.inMemoryDb as any).specializations?.find((s: any) => s.id === studentSpecId) : null;

      const csList = (cls ? this.inMemoryDb.classSubjects.filter(cs => cs.class_id === cls.id && cs.active) : []).filter(cs => {
        const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
        const subSpecId = (sub as any)?.specialization_id;
        if (subSpecId) {
          return Boolean(studentSpecId && subSpecId === studentSpecId);
        }
        return true;
      });

      let totalResultsCount = 0;
      let totalScoreSum = 0;
      let maxMarksSum = 0;

      const subjects = csList.map(cs => {
        const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
        const assessments = this.inMemoryDb.assessments.filter(a => a.class_subject_id === cs.id && a.status === 'published');

        let subResultsCount = 0;
        let subScoreSum = 0;
        let subMaxSum = 0;

        const assList = assessments.map(ass => {
          const submission = this.inMemoryDb.submissions.find(s => s.assessment_id === ass.id && s.student_id === pa.student_id);
          const ev = submission ? this.inMemoryDb.evaluations.find(e => e.submission_id === submission.id) : null;
          const isPub = ev?.status === 'published';

          if (isPub && ev) {
            subResultsCount++;
            totalResultsCount++;
            subScoreSum += Number(ev.total_score || 0);
            totalScoreSum += Number(ev.total_score || 0);
            subMaxSum += Number(ass.max_marks || 50);
            maxMarksSum += Number(ass.max_marks || 50);
          }

          const rawScores = (isPub && ev) ? this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === ev.id) : [];
          const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

          return {
            assessment_id: ass.id,
            title: ass.title,
            max_marks: Number(ass.max_marks || 50),
            has_result: Boolean(isPub),
            submission_id: submission?.id || null,
            total_score: isPub && ev ? Number(ev.total_score) : null,
            raw_score: isPub && ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: isPub && ev ? Number(ev.late_penalty_deducted || 0) : 0,
            percentage: isPub && ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            publication_status: ev ? ev.status : (submission ? 'pending_evaluation' : 'not_submitted'),
            criterion_scores
          };
        });

        return {
          subject_id: sub?.id,
          subject_code: sub?.code,
          subject_name: sub?.name,
          credits: sub?.credits || 3,
          published_assessment_count: assessments.length,
          results_available_count: subResultsCount,
          average_percentage: subResultsCount > 0 ? Math.round((subScoreSum / subMaxSum) * 100) : null,
          assessments: assList
        };
      });

      return {
        student_id: pa.student_id,
        student_name: student?.full_name || 'Mentee',
        student_email: student?.email,
        roll_number: enr?.roll_number || '—',
        programme: cls?.programme || 'MCA',
        semester: cls?.semester || 1,
        section: cls?.section || 'A',
        class_id: cls?.id,
        specialization_id: studentSpecId || null,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        enrolled_subjects_count: subjects.length,
        overall_results_count: totalResultsCount,
        overall_average_percentage: totalResultsCount > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null,
        subjects
      };
    });

    return { mentees };
  }

  async getHodDepartmentAcademicReport(filters?: { semester?: number; class_id?: string; section?: string; subject_id?: string; assessment_id?: string; publication_status?: string }): Promise<any> {
    const classes = this.inMemoryDb.classes.filter(c => 
      (!filters?.semester || c.semester === Number(filters.semester)) &&
      (!filters?.class_id || c.id === filters.class_id)
    );
    const classIds = classes.map(c => c.id);

    const allEnrollments = this.inMemoryDb.enrollments.filter(e => e.status === 'active' && classIds.includes(e.class_id));
    const allClassSubjects = this.inMemoryDb.classSubjects.filter(cs => 
      cs.active && classIds.includes(cs.class_id) &&
      (!filters?.subject_id || cs.subject_id === filters.subject_id)
    );
    const classSubIds = allClassSubjects.map(cs => cs.id);

    const allAssessments = this.inMemoryDb.assessments.filter(a => 
      a.status === 'published' && classSubIds.includes(a.class_subject_id) &&
      (!filters?.assessment_id || a.id === filters.assessment_id)
    );
    const assIds = allAssessments.map(a => a.id);

    const allSubmissions = this.inMemoryDb.submissions.filter(s => assIds.includes(s.assessment_id));
    const subIds = allSubmissions.map(s => s.id);

    const allEvaluations = this.inMemoryDb.evaluations.filter(e => subIds.includes(e.submission_id));
    const publishedEvaluations = allEvaluations.filter(e => e.status === 'published');
    const completedUnpublishedEvaluations = allEvaluations.filter(e => e.status === 'completed');

    const uniqueEvaluatedStudents = new Set(
      allEvaluations.map(e => {
        const sub = allSubmissions.find(s => s.id === e.submission_id);
        return sub?.student_id;
      }).filter(Boolean)
    );

    let totalScoreSum = 0;
    let maxMarksSum = 0;
    for (const ev of publishedEvaluations) {
      const sub = allSubmissions.find(s => s.id === ev.submission_id);
      const ass = sub ? allAssessments.find(a => a.id === sub.assessment_id) : null;
      if (ass) {
        totalScoreSum += Number(ev.total_score || 0);
        maxMarksSum += Number(ass.max_marks || 50);
      }
    }

    const pendingCount = allSubmissions.filter(s => 
      !allEvaluations.some(e => e.submission_id === s.id && (e.status === 'completed' || e.status === 'published'))
    ).length;

    const kpis = {
      total_students: allEnrollments.length,
      total_published_assessments: allAssessments.length,
      students_evaluated: uniqueEvaluatedStudents.size,
      total_evaluations_completed: allEvaluations.length,
      completed_unpublished_results: completedUnpublishedEvaluations.length,
      pending_evaluations: pendingCount,
      published_results: publishedEvaluations.length,
      department_average_score: maxMarksSum > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null
    };

    const distinctSemesters = [...new Set(classes.map(c => c.semester))].sort((a, b) => a - b);

    const semesters = distinctSemesters.map(sem => {
      const semClasses = classes.filter(c => c.semester === sem);
      return {
        semester: sem,
        classes: semClasses.map(cls => {
          const csList = allClassSubjects.filter(cs => cs.class_id === cls.id);
          const classEnrs = allEnrollments.filter(e => e.class_id === cls.id);

          return {
            class_id: cls.id,
            programme: cls.programme,
            semester: cls.semester,
            section: cls.section,
            student_count: classEnrs.length,
            subjects: csList.map(cs => {
              const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
              const teacher = this.inMemoryDb.profiles.find(p => p.id === cs.subject_teacher_id);
              const assessments = allAssessments.filter(a => a.class_subject_id === cs.id);

              return {
                class_subject_id: cs.id,
                subject_id: sub?.id,
                subject_code: sub?.code,
                subject_name: sub?.name,
                teacher_name: teacher?.full_name || 'Faculty',
                published_assessment_count: assessments.length,
                assessments: assessments.map(a => ({
                  id: a.id,
                  title: a.title,
                  max_marks: a.max_marks || 50,
                  due_date: a.deadline_at,
                  published_at: a.created_at
                }))
              };
            })
          };
        })
      };
    });

    let selectedAssessmentRoster: any[] | null = null;
    let selectedAssessmentMeta: any | null = null;

    if (filters?.assessment_id) {
      const ass = allAssessments.find(a => a.id === filters.assessment_id);
      if (ass) {
        selectedAssessmentMeta = {
          id: ass.id,
          title: ass.title,
          max_marks: Number(ass.max_marks || 50),
          due_date: ass.deadline_at
        };

        const cs = allClassSubjects.find(c => c.id === ass.class_subject_id);
        const targetEnrs = cs ? allEnrollments.filter(e => e.class_id === cs.class_id) : allEnrollments;
        const subs = allSubmissions.filter(s => s.assessment_id === ass.id);

        selectedAssessmentRoster = targetEnrs.map(enr => {
          const student = this.inMemoryDb.profiles.find(p => p.id === enr.student_id);
          const sub = subs.find(s => s.student_id === enr.student_id);
          const ev = sub ? allEvaluations.find(e => e.submission_id === sub.id) : null;
          const rawScores = ev ? this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === ev.id) : [];
          const scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

          return {
            student_id: enr.student_id,
            student_name: student?.full_name || 'Student',
            roll_number: enr.roll_number || '—',
            email: student?.email,
            submission_id: sub?.id || null,
            has_submitted: Boolean(sub),
            submission_date: sub?.first_submitted_at || null,
            late_status: sub?.late_status || 'not_submitted',
            evaluation_id: ev?.id || null,
            evaluation_status: ev ? ev.status : (sub ? 'pending_evaluation' : 'not_submitted'),
            raw_score: ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: ev ? Number(ev.late_penalty_deducted || 0) : 0,
            total_score: ev ? Number(ev.total_score) : null,
            max_marks: Number(ass.max_marks || 50),
            percentage: ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            criterion_scores: scores
          };
        });

        if (filters?.publication_status) {
          if (filters.publication_status === 'results_published') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'published');
          } else if (filters.publication_status === 'evaluation_pending') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'pending_evaluation' || r.evaluation_status === 'completed');
          } else if (filters.publication_status === 'not_submitted') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'not_submitted');
          }
        }
      }
    }

    return {
      kpis,
      hierarchy: semesters,
      selected_assessment: selectedAssessmentMeta,
      student_roster: selectedAssessmentRoster
    };
  }

  async getDetailedResult(submissionId: string): Promise<any | null> {
    const sub = this.inMemoryDb.submissions.find(s => s.id === submissionId);
    if (!sub) return null;

    const student = this.inMemoryDb.profiles.find(p => p.id === sub.student_id);
    const enr = this.inMemoryDb.enrollments.find(e => e.student_id === sub.student_id && e.status === 'active');
    const ass = this.inMemoryDb.assessments.find(a => a.id === sub.assessment_id);
    const cs = ass ? this.inMemoryDb.classSubjects.find(c => c.id === ass.class_subject_id) : null;
    const cls = cs ? this.inMemoryDb.classes.find(c => c.id === cs.class_id) : null;
    const subject = cs ? this.inMemoryDb.subjects.find(s => s.id === cs.subject_id) : null;
    const ev = this.inMemoryDb.evaluations.find(e => e.submission_id === sub.id);
    const evaluator = ev ? this.inMemoryDb.profiles.find(p => p.id === ev.evaluator_id) : null;
    const pub = ass ? this.inMemoryDb.resultPublications.find(rp => rp.assessment_id === ass.id) : null;

    const rawScores = ev ? this.inMemoryDb.evaluationCriterionScores.filter(cs => cs.evaluation_id === ev.id) : [];
    const criterion_scores = enrichInMemoryCriterionScores(this.inMemoryDb, rawScores);

    return {
      assessment: {
        id: ass?.id,
        title: ass?.title,
        instructions: ass?.instructions,
        max_marks: ass?.max_marks || 50,
        due_date: ass?.deadline_at,
        class_name: cls?.programme || 'MCA',
        semester: cls?.semester || 1,
        section: cls?.section || 'A',
        subject_code: subject?.code,
        subject_name: subject?.name
      },
      student: {
        id: student?.id,
        name: student?.full_name,
        email: student?.email,
        roll_number: enr?.roll_number || '—'
      },
      submission: {
        id: sub.id,
        version: 1,
        submitted_at: sub.first_submitted_at,
        late_status: sub.late_status || 'on_time'
      },
      evaluation: ev ? {
        id: ev.id,
        evaluator_name: evaluator?.full_name || 'Faculty',
        status: ev.status,
        raw_score: Number(ev.raw_score || ev.total_score),
        late_penalty_deducted: Number(ev.late_penalty_deducted || 0),
        total_score: Number(ev.total_score),
        percentage: Math.round((Number(ev.total_score) / Number(ass?.max_marks || 50)) * 100),
        general_feedback: ev.general_feedback || null,
        published_at: pub?.published_at || ev.updated_at,
        criterion_scores
      } : null
    };
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'in_memory_mock';
  }
}

async function enrichCriterionScores(client: SupabaseClient, scores: any[]): Promise<any[]> {
  if (!scores || scores.length === 0) return [];
  const criterionIds = [...new Set(scores.map(s => s.criterion_id).filter(Boolean))];
  const levelIds = [...new Set(scores.map(s => s.selected_level_id).filter(Boolean))];

  let criteriaMap = new Map<string, any>();
  if (criterionIds.length > 0) {
    const { data: crits } = await client
      .from('rubric_criteria')
      .select('*')
      .in('id', criterionIds);
    (crits || []).forEach(c => criteriaMap.set(c.id, c));
  }

  let levelsMap = new Map<string, any>();
  if (levelIds.length > 0) {
    const { data: lvls } = await client
      .from('rubric_levels')
      .select('*')
      .in('id', levelIds);
    (lvls || []).forEach(l => levelsMap.set(l.id, l));
  }

  return scores.map(s => {
    const crit = criteriaMap.get(s.criterion_id);
    const lvl = s.selected_level_id ? levelsMap.get(s.selected_level_id) : null;
    return {
      id: s.id,
      evaluation_id: s.evaluation_id,
      criterion_id: s.criterion_id,
      criterion_title: crit?.title || 'Criterion',
      criterion_description: crit?.description || '',
      criterion_max_marks: crit ? Number(crit.max_marks) : 0,
      score: Number(s.score),
      display_order: crit?.display_order || 0,
      feedback: s.feedback || null,
      selected_level_id: s.selected_level_id || null,
      selected_level: lvl ? {
        id: lvl.id,
        label: lvl.label,
        description: lvl.description
      } : null
    };
  }).sort((a, b) => a.display_order - b.display_order);
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
    if (!data) return null;

    const { data: scores } = await this.client
      .from('evaluation_criterion_scores')
      .select('*')
      .eq('evaluation_id', data.id);

    const enriched = await enrichCriterionScores(this.client, scores || []);

    return {
      ...data,
      criterion_scores: enriched
    };
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

    const enriched = await enrichCriterionScores(this.client, scores || []);

    return {
      ...data,
      criterion_scores: enriched
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
    if (!evals || evals.length === 0) return [];

    const evalIds = evals.map(e => e.id);
    const { data: allScores } = await this.client
      .from('evaluation_criterion_scores')
      .select('*')
      .in('evaluation_id', evalIds);

    const enriched = await enrichCriterionScores(this.client, allScores || []);

    return evals.map(e => ({
      ...e,
      criterion_scores: enriched.filter(cs => cs.evaluation_id === e.id)
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
    if (params.rawScore === undefined && params.criterionScores && params.criterionScores.length > 0) {
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

    // Record teacher_confirmed_marks and quiz_score
    try {
      const { data: activeVer } = await this.client
        .from('submission_versions')
        .select('quiz_score')
        .eq('id', submission.active_version_id)
        .maybeSingle();

      await this.client
        .from('evaluations')
        .update({
          teacher_confirmed_marks: finalRawScore,
          quiz_score: activeVer?.quiz_score ?? null
        })
        .eq('id', evalResult.id);
    } catch (ignoreErr) {
      console.warn('Failed to update teacher_confirmed_marks on evaluation:', ignoreErr);
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
      .select('id, assessment_id')
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
    if (!evals || evals.length === 0) return [];

    const evalIds = evals.map(e => e.id);
    const { data: allScores } = await this.client
      .from('evaluation_criterion_scores')
      .select('*')
      .in('evaluation_id', evalIds);

    const enrichedScores = await enrichCriterionScores(this.client, allScores || []);

    const assIds = [...new Set((subs || []).map(s => s.assessment_id).filter(Boolean))];
    const { data: assessments } = await this.client
      .from('assessments')
      .select('id, title, max_marks')
      .in('id', assIds);

    const assMap = new Map<string, any>();
    (assessments || []).forEach(a => assMap.set(a.id, a));

    return evals.map(e => {
      const sub = subs?.find(s => s.id === e.submission_id);
      const ass = sub ? assMap.get(sub.assessment_id) : null;
      return {
        ...e,
        assessment_title: ass?.title || 'Formative Assessment',
        assessment_max_marks: ass?.max_marks || 50,
        criterion_scores: enrichedScores.filter(s => s.evaluation_id === e.id)
      };
    });
  }

  async getStudentPerformanceDashboard(studentId: string): Promise<any[]> {
    // 1. Student active enrollments
    const { data: enrollments } = await this.client
      .from('enrollments')
      .select('*, class:classes(*)')
      .eq('student_id', studentId)
      .eq('status', 'active');

    const classIds = (enrollments || []).map(e => e.class_id);
    if (classIds.length === 0) return [];

    // 2. Class subjects for enrolled classes
    const { data: classSubjects } = await this.client
      .from('class_subjects')
      .select('*, subject:subjects(*), class:classes(*)')
      .in('class_id', classIds)
      .eq('active', true);

    const classSubIds = (classSubjects || []).map(cs => cs.id);
    if (classSubIds.length === 0) return [];

    // 3. Published assessments
    const { data: assessments } = await this.client
      .from('assessments')
      .select('*')
      .in('class_subject_id', classSubIds)
      .eq('status', 'published');

    const assIds = (assessments || []).map(a => a.id);

    // 4. Student submissions
    const { data: submissions } = await this.client
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .in('assessment_id', assIds.length > 0 ? assIds : [randomUUID()]);

    const subIds = (submissions || []).map(s => s.id);

    // 5. Published evaluations & scores
    let evaluations: any[] = [];
    let enrichedScores: any[] = [];
    if (subIds.length > 0) {
      const { data: evals } = await this.client
        .from('evaluations')
        .select('*')
        .in('submission_id', subIds)
        .eq('status', 'published');
      evaluations = evals || [];

      const evalIds = evaluations.map(e => e.id);
      if (evalIds.length > 0) {
        const { data: scores } = await this.client
          .from('evaluation_criterion_scores')
          .select('*')
          .in('evaluation_id', evalIds);
        enrichedScores = await enrichCriterionScores(this.client, scores || []);
      }
    }

    // 6. Publications
    let pubMap = new Map<string, any>();
    if (assIds.length > 0) {
      const { data: pubs } = await this.client
        .from('result_publications')
        .select('*')
        .in('assessment_id', assIds);
      (pubs || []).forEach(p => pubMap.set(p.assessment_id, p));
    }

    // 7. Group into subject cards
    return (classSubjects || []).map(cs => {
      const subjectAssessments = (assessments || []).filter(a => a.class_subject_id === cs.id);
      let resultsCount = 0;
      let totalScoreSum = 0;
      let maxMarksSum = 0;

      const assList = subjectAssessments.map(ass => {
        const sub = (submissions || []).find(s => s.assessment_id === ass.id);
        const ev = sub ? evaluations.find(e => e.submission_id === sub.id) : null;
        const pub = pubMap.get(ass.id);

        let resultDetail = null;
        if (ev) {
          resultsCount++;
          totalScoreSum += Number(ev.total_score || 0);
          maxMarksSum += Number(ass.max_marks || 50);

          const scores = enrichedScores.filter(cs => cs.evaluation_id === ev.id);

          resultDetail = {
            evaluation_id: ev.id,
            submission_id: sub!.id,
            raw_score: Number(ev.raw_score || ev.total_score),
            late_penalty_deducted: Number(ev.late_penalty_deducted || 0),
            total_score: Number(ev.total_score),
            max_marks: Number(ass.max_marks || 50),
            percentage: Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100),
            late_status: sub!.late_status || 'on_time',
            published_at: pub?.published_at || ev.updated_at,
            general_feedback: ev.general_feedback || null,
            criterion_scores: scores
          };
        }

        return {
          assessment_id: ass.id,
          title: ass.title,
          max_marks: Number(ass.max_marks || 50),
          due_date: ass.deadline_at,
          published_at: pub?.published_at || ass.published_at || ass.created_at,
          has_result: Boolean(ev),
          publication_status: ev ? 'results_published' : (sub ? 'evaluation_pending' : 'not_submitted'),
          result: resultDetail
        };
      });

      return {
        subject_id: cs.subject?.id,
        subject_code: cs.subject?.code || 'SUB',
        subject_name: cs.subject?.name || 'Subject',
        credits: cs.subject?.credits || 3,
        class_id: cs.class?.id,
        programme: cs.class?.programme || 'MCA',
        semester: cs.class?.semester || 1,
        section: cs.class?.section || 'A',
        published_assessment_count: subjectAssessments.length,
        results_available_count: resultsCount,
        average_percentage: resultsCount > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null,
        average_marks: resultsCount > 0 ? Math.round((totalScoreSum / resultsCount) * 10) / 10 : null,
        assessments: assList
      };
    });
  }

  async getClassTeacherAcademicReport(userId: string, isHOD: boolean, filters?: { class_id?: string; subject_id?: string; assessment_id?: string }): Promise<any> {
    let classQuery = this.client.from('classes').select('*');
    if (!isHOD) {
      classQuery = classQuery.eq('class_teacher_id', userId);
    }
    const { data: classes } = await classQuery;
    const classIds = (classes || []).map(c => c.id);
    if (classIds.length === 0) {
      return { classes: [], selected_assessment: null, student_roster: [] };
    }

    // Active enrollments for authorized classes
    const { data: enrollments } = await this.client
      .from('enrollments')
      .select('*, student:profiles(*)')
      .in('class_id', classIds)
      .eq('status', 'active');

    // Class subjects
    const { data: classSubjects } = await this.client
      .from('class_subjects')
      .select('*, subject:subjects(*), teacher:profiles!subject_teacher_id(*)')
      .in('class_id', classIds)
      .eq('active', true);

    const classSubIds = (classSubjects || []).map(cs => cs.id);

    // Published assessments
    const { data: assessments } = await this.client
      .from('assessments')
      .select('*')
      .in('class_subject_id', classSubIds.length > 0 ? classSubIds : [randomUUID()])
      .eq('status', 'published');

    const classList = (classes || []).map(cls => {
      const classEnrs = (enrollments || []).filter(e => e.class_id === cls.id);
      const csList = (classSubjects || []).filter(cs => cs.class_id === cls.id);

      const subjects = csList.map(cs => {
        const subjectAssessments = (assessments || []).filter(a => a.class_subject_id === cs.id);
        return {
          class_subject_id: cs.id,
          subject_id: cs.subject?.id,
          subject_code: cs.subject?.code,
          subject_name: cs.subject?.name,
          subject_teacher_name: cs.teacher?.full_name || 'Faculty',
          published_assessment_count: subjectAssessments.length,
          assessments: subjectAssessments.map(a => ({
            id: a.id,
            title: a.title,
            max_marks: Number(a.max_marks || 50),
            due_date: a.deadline_at,
            published_at: a.published_at || a.created_at
          }))
        };
      });

      return {
        class_id: cls.id,
        programme: cls.programme,
        semester: cls.semester,
        section: cls.section,
        student_count: classEnrs.length,
        subjects
      };
    });

    let selectedAssessmentRoster: any[] | null = null;
    let selectedAssessmentMeta: any | null = null;

    if (filters?.assessment_id) {
      const ass = (assessments || []).find(a => a.id === filters.assessment_id);
      if (ass) {
        selectedAssessmentMeta = {
          id: ass.id,
          title: ass.title,
          max_marks: Number(ass.max_marks || 50),
          due_date: ass.deadline_at
        };

        const cs = (classSubjects || []).find(c => c.id === ass.class_subject_id);
        let targetEnrs = cs ? (enrollments || []).filter(e => e.class_id === cs.class_id) : [];
        if (ass.publishing_audience === 'selected') {
          try {
            const { data: targets } = await this.client
              .from('assessment_student_targets')
              .select('student_id')
              .eq('assessment_id', ass.id);
            const targetIds = new Set((targets || []).map(t => t.student_id));
            targetEnrs = targetEnrs.filter(e => targetIds.has(e.student_id));
          } catch {}
        }

        const { data: subs } = await this.client
          .from('submissions')
          .select('*')
          .eq('assessment_id', ass.id);

        const subIds = (subs || []).map(s => s.id);
        let evals: any[] = [];
        let enrichedScores: any[] = [];

        if (subIds.length > 0) {
          const { data: evData } = await this.client
            .from('evaluations')
            .select('*')
            .in('submission_id', subIds);
          evals = evData || [];

          const evalIds = evals.map(e => e.id);
          if (evalIds.length > 0) {
            const { data: scData } = await this.client
              .from('evaluation_criterion_scores')
              .select('*')
              .in('evaluation_id', evalIds);
            enrichedScores = await enrichCriterionScores(this.client, scData || []);
          }
        }

        selectedAssessmentRoster = targetEnrs.map(enr => {
          const sub = (subs || []).find(s => s.student_id === enr.student_id);
          const ev = sub ? evals.find(e => e.submission_id === sub.id) : null;
          const scores = ev ? enrichedScores.filter(cs => cs.evaluation_id === ev.id) : [];

          return {
            student_id: enr.student_id,
            student_name: enr.student?.full_name || 'Student',
            roll_number: enr.roll_number || '—',
            email: enr.student?.email,
            submission_id: sub?.id || null,
            has_submitted: Boolean(sub),
            submission_date: sub?.first_submitted_at || null,
            late_status: sub?.late_status || 'not_submitted',
            evaluation_id: ev?.id || null,
            evaluation_status: ev ? ev.status : (sub ? 'pending_evaluation' : 'not_submitted'),
            raw_score: ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: ev ? Number(ev.late_penalty_deducted || 0) : 0,
            total_score: ev ? Number(ev.total_score) : null,
            max_marks: Number(ass.max_marks || 50),
            percentage: ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            criterion_scores: scores
          };
        });
      }
    }

    return {
      classes: classList,
      selected_assessment: selectedAssessmentMeta,
      student_roster: selectedAssessmentRoster
    };
  }

  async getProctorAcademicReport(proctorId: string, isHOD: boolean): Promise<any> {
    let paQuery = this.client
      .from('proctor_assignments')
      .select('*, student:profiles!student_id(*), class:classes(*)')
      .is('valid_to', null);
    if (!isHOD) {
      paQuery = paQuery.eq('proctor_id', proctorId);
    }
    const { data: assignments } = await paQuery;
    if (!assignments || assignments.length === 0) {
      return { mentees: [] };
    }

    const studentIds = assignments.map(pa => pa.student_id);
    const classIds = [...new Set(assignments.map(pa => pa.class_id).filter(Boolean))];

    // Enrollments
    const { data: enrollments } = await this.client
      .from('enrollments')
      .select('*, class:classes(*), specialization:specializations(*)')
      .in('student_id', studentIds)
      .eq('status', 'active');

    // Class subjects
    const { data: classSubjects } = await this.client
      .from('class_subjects')
      .select('*, subject:subjects(*), class:classes(*)')
      .in('class_id', classIds.length > 0 ? classIds : [randomUUID()])
      .eq('active', true);

    const classSubIds = (classSubjects || []).map(cs => cs.id);

    // Published assessments
    const { data: assessments } = await this.client
      .from('assessments')
      .select('*')
      .in('class_subject_id', classSubIds.length > 0 ? classSubIds : [randomUUID()])
      .eq('status', 'published');

    const assIds = (assessments || []).map(a => a.id);

    // Submissions for all mentees
    const { data: submissions } = await this.client
      .from('submissions')
      .select('*')
      .in('student_id', studentIds)
      .in('assessment_id', assIds.length > 0 ? assIds : [randomUUID()]);

    const subIds = (submissions || []).map(s => s.id);

    // Evaluations
    let evals: any[] = [];
    let enrichedScores: any[] = [];
    if (subIds.length > 0) {
      const { data: evData } = await this.client
        .from('evaluations')
        .select('*')
        .in('submission_id', subIds);
      evals = evData || [];

      const evalIds = evals.map(e => e.id);
      if (evalIds.length > 0) {
        const { data: scData } = await this.client
          .from('evaluation_criterion_scores')
          .select('*')
          .in('evaluation_id', evalIds);
        enrichedScores = await enrichCriterionScores(this.client, scData || []);
      }
    }

    const mentees = assignments.map(pa => {
      const student = pa.student;
      const enr = (enrollments || []).find(e => e.student_id === pa.student_id);
      const cls = enr?.class || pa.class;
      const studentSpecId = enr?.specialization_id;
      const spec = (enr as any)?.specialization;

      const csList = (classSubjects || []).filter(cs => {
        if (cs.class_id !== (cls?.id || pa.class_id)) return false;
        const subSpecId = (cs.subject as any)?.specialization_id;
        if (subSpecId) {
          return Boolean(studentSpecId && subSpecId === studentSpecId);
        }
        return true;
      });

      let totalResultsCount = 0;
      let totalScoreSum = 0;
      let maxMarksSum = 0;

      const subjects = csList.map(cs => {
        const subjectAssessments = (assessments || []).filter(a => a.class_subject_id === cs.id);

        let subResultsCount = 0;
        let subScoreSum = 0;
        let subMaxSum = 0;

        const assList = subjectAssessments.map(ass => {
          const sub = (submissions || []).find(s => s.assessment_id === ass.id && s.student_id === pa.student_id);
          const ev = sub ? evals.find(e => e.submission_id === sub.id) : null;
          const isPub = ev?.status === 'published';

          if (isPub && ev) {
            subResultsCount++;
            totalResultsCount++;
            subScoreSum += Number(ev.total_score || 0);
            totalScoreSum += Number(ev.total_score || 0);
            subMaxSum += Number(ass.max_marks || 50);
            maxMarksSum += Number(ass.max_marks || 50);
          }

          const scores = (isPub && ev) ? enrichedScores.filter(cs => cs.evaluation_id === ev.id) : [];

          return {
            assessment_id: ass.id,
            title: ass.title,
            max_marks: Number(ass.max_marks || 50),
            has_result: Boolean(isPub),
            submission_id: sub?.id || null,
            total_score: isPub && ev ? Number(ev.total_score) : null,
            raw_score: isPub && ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: isPub && ev ? Number(ev.late_penalty_deducted || 0) : 0,
            percentage: isPub && ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            publication_status: ev ? ev.status : (sub ? 'pending_evaluation' : 'not_submitted'),
            criterion_scores: scores
          };
        });

        return {
          subject_id: cs.subject?.id,
          subject_code: cs.subject?.code,
          subject_name: cs.subject?.name,
          credits: cs.subject?.credits || 3,
          published_assessment_count: subjectAssessments.length,
          results_available_count: subResultsCount,
          average_percentage: subResultsCount > 0 ? Math.round((subScoreSum / subMaxSum) * 100) : null,
          assessments: assList
        };
      });

      return {
        student_id: pa.student_id,
        student_name: student?.full_name || 'Mentee',
        student_email: student?.email,
        roll_number: enr?.roll_number || '—',
        programme: cls?.programme || 'MCA',
        semester: cls?.semester || 1,
        section: cls?.section || 'A',
        class_id: cls?.id || pa.class_id,
        specialization_id: studentSpecId || null,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        enrolled_subjects_count: subjects.length,
        overall_results_count: totalResultsCount,
        overall_average_percentage: totalResultsCount > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null,
        subjects
      };
    });

    return { mentees };
  }

  async getHodDepartmentAcademicReport(filters?: { semester?: number; class_id?: string; section?: string; subject_id?: string; assessment_id?: string; publication_status?: string }): Promise<any> {
    const { data: allClasses } = await this.client.from('classes').select('*');
    const { data: allEnrollments } = await this.client.from('enrollments').select('*, student:profiles(*)').eq('status', 'active');
    const { data: allClassSubjects } = await this.client.from('class_subjects').select('*, subject:subjects(*), teacher:profiles!subject_teacher_id(*)').eq('active', true);
    const { data: allAssessments } = await this.client.from('assessments').select('*').eq('status', 'published');
    const { data: allEvaluations } = await this.client.from('evaluations').select('*');
    const { data: allSubmissions } = await this.client.from('submissions').select('*');

    // Filter classes by semester / class_id if requested
    const scopedClasses = (allClasses || []).filter(c => 
      (!filters?.semester || c.semester === Number(filters.semester)) &&
      (!filters?.class_id || c.id === filters.class_id)
    );
    const scopedClassIds = scopedClasses.map(c => c.id);

    const scopedEnrollments = (allEnrollments || []).filter(e => scopedClassIds.includes(e.class_id));

    const scopedClassSubjects = (allClassSubjects || []).filter(cs => 
      scopedClassIds.includes(cs.class_id) &&
      (!filters?.subject_id || cs.subject_id === filters.subject_id || cs.subject?.id === filters.subject_id)
    );
    const scopedClassSubIds = scopedClassSubjects.map(cs => cs.id);

    const scopedAssessments = (allAssessments || []).filter(a => 
      scopedClassSubIds.includes(a.class_subject_id) &&
      (!filters?.assessment_id || a.id === filters.assessment_id)
    );
    const scopedAssIds = scopedAssessments.map(a => a.id);

    const scopedSubmissions = (allSubmissions || []).filter(s => scopedAssIds.includes(s.assessment_id));
    const scopedSubIds = scopedSubmissions.map(s => s.id);

    const scopedEvaluations = (allEvaluations || []).filter(e => scopedSubIds.includes(e.submission_id));

    const publishedEvaluations = scopedEvaluations.filter(e => e.status === 'published');
    const completedUnpublishedEvaluations = scopedEvaluations.filter(e => e.status === 'completed');

    const uniqueEvaluatedStudents = new Set(
      scopedEvaluations.map(e => {
        const sub = scopedSubmissions.find(s => s.id === e.submission_id);
        return sub?.student_id;
      }).filter(Boolean)
    );

    let totalScoreSum = 0;
    let maxMarksSum = 0;
    for (const ev of publishedEvaluations) {
      const sub = scopedSubmissions.find(s => s.id === ev.submission_id);
      const ass = sub ? scopedAssessments.find(a => a.id === sub.assessment_id) : null;
      if (ass) {
        totalScoreSum += Number(ev.total_score || 0);
        maxMarksSum += Number(ass.max_marks || 50);
      }
    }

    const pendingCount = scopedSubmissions.filter(s => 
      !scopedEvaluations.some(e => e.submission_id === s.id && (e.status === 'completed' || e.status === 'published'))
    ).length;

    const kpis = {
      total_students: scopedEnrollments.length,
      total_published_assessments: scopedAssessments.length,
      students_evaluated: uniqueEvaluatedStudents.size,
      total_evaluations_completed: scopedEvaluations.length,
      completed_unpublished_results: completedUnpublishedEvaluations.length,
      pending_evaluations: pendingCount,
      published_results: publishedEvaluations.length,
      department_average_score: maxMarksSum > 0 ? Math.round((totalScoreSum / maxMarksSum) * 100) : null
    };

    const distinctSemesters = [...new Set(scopedClasses.map(c => c.semester))].sort((a, b) => a - b);

    const semesters = distinctSemesters.map(sem => {
      const semClasses = scopedClasses.filter(c => c.semester === sem);
      return {
        semester: sem,
        classes: semClasses.map(cls => {
          const csList = scopedClassSubjects.filter(cs => cs.class_id === cls.id);
          const classEnrs = scopedEnrollments.filter(e => e.class_id === cls.id);

          return {
            class_id: cls.id,
            programme: cls.programme,
            semester: cls.semester,
            section: cls.section,
            student_count: classEnrs.length,
            subjects: csList.map(cs => {
              const subjectAssessments = scopedAssessments.filter(a => a.class_subject_id === cs.id);
              return {
                class_subject_id: cs.id,
                subject_id: cs.subject?.id,
                subject_code: cs.subject?.code,
                subject_name: cs.subject?.name,
                teacher_name: cs.teacher?.full_name || 'Faculty',
                published_assessment_count: subjectAssessments.length,
                assessments: subjectAssessments.map(a => ({
                  id: a.id,
                  title: a.title,
                  max_marks: Number(a.max_marks || 50),
                  due_date: a.deadline_at,
                  published_at: a.published_at || a.created_at
                }))
              };
            })
          };
        })
      };
    });

    let selectedAssessmentRoster: any[] | null = null;
    let selectedAssessmentMeta: any | null = null;

    if (filters?.assessment_id) {
      const ass = (allAssessments || []).find(a => a.id === filters.assessment_id);
      if (ass) {
        selectedAssessmentMeta = {
          id: ass.id,
          title: ass.title,
          max_marks: Number(ass.max_marks || 50),
          due_date: ass.deadline_at
        };

        const cs = (allClassSubjects || []).find(c => c.id === ass.class_subject_id);
        const targetEnrs = cs ? (allEnrollments || []).filter(e => e.class_id === cs.class_id) : (allEnrollments || []);
        const subs = (allSubmissions || []).filter(s => s.assessment_id === ass.id);

        const subIds = subs.map(s => s.id);
        let evals: any[] = [];
        let enrichedScores: any[] = [];

        if (subIds.length > 0) {
          evals = (allEvaluations || []).filter(e => subIds.includes(e.submission_id));
          const evalIds = evals.map(e => e.id);
          if (evalIds.length > 0) {
            const { data: scData } = await this.client
              .from('evaluation_criterion_scores')
              .select('*')
              .in('evaluation_id', evalIds);
            enrichedScores = await enrichCriterionScores(this.client, scData || []);
          }
        }

        selectedAssessmentRoster = targetEnrs.map(enr => {
          const sub = subs.find(s => s.student_id === enr.student_id);
          const ev = sub ? evals.find(e => e.submission_id === sub.id) : null;
          const scores = ev ? enrichedScores.filter(cs => cs.evaluation_id === ev.id) : [];

          return {
            student_id: enr.student_id,
            student_name: enr.student?.full_name || 'Student',
            roll_number: enr.roll_number || '—',
            email: enr.student?.email,
            submission_id: sub?.id || null,
            has_submitted: Boolean(sub),
            submission_date: sub?.first_submitted_at || null,
            late_status: sub?.late_status || 'not_submitted',
            evaluation_id: ev?.id || null,
            evaluation_status: ev ? ev.status : (sub ? 'pending_evaluation' : 'not_submitted'),
            raw_score: ev ? Number(ev.raw_score || ev.total_score) : null,
            late_penalty_deducted: ev ? Number(ev.late_penalty_deducted || 0) : 0,
            total_score: ev ? Number(ev.total_score) : null,
            max_marks: Number(ass.max_marks || 50),
            percentage: ev ? Math.round((Number(ev.total_score) / Number(ass.max_marks || 50)) * 100) : null,
            criterion_scores: scores
          };
        });

        if (filters?.publication_status) {
          if (filters.publication_status === 'results_published') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'published');
          } else if (filters.publication_status === 'evaluation_pending') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'pending_evaluation' || r.evaluation_status === 'completed');
          } else if (filters.publication_status === 'not_submitted') {
            selectedAssessmentRoster = selectedAssessmentRoster.filter(r => r.evaluation_status === 'not_submitted');
          }
        }
      }
    }

    return {
      kpis,
      hierarchy: semesters,
      selected_assessment: selectedAssessmentMeta,
      student_roster: selectedAssessmentRoster
    };
  }

  async getDetailedResult(submissionId: string): Promise<any | null> {
    const { data: sub } = await this.client
      .from('submissions')
      .select('*, assessment:assessments(*, class_subject:class_subjects(*, class:classes(*), subject:subjects(*))), student:profiles(*)')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub) return null;

    const { data: enr } = await this.client
      .from('enrollments')
      .select('roll_number')
      .eq('student_id', sub.student_id)
      .eq('class_id', sub.assessment?.class_subject?.class?.id)
      .maybeSingle();

    const { data: ev } = await this.client
      .from('evaluations')
      .select('*, evaluator:profiles!evaluator_id(*)')
      .eq('submission_id', sub.id)
      .maybeSingle();

    let enrichedScores: any[] = [];
    if (ev) {
      const { data: scores } = await this.client
        .from('evaluation_criterion_scores')
        .select('*')
        .eq('evaluation_id', ev.id);
      enrichedScores = await enrichCriterionScores(this.client, scores || []);
    }

    const { data: pub } = await this.client
      .from('result_publications')
      .select('published_at')
      .eq('assessment_id', sub.assessment_id)
      .maybeSingle();

    return {
      assessment: {
        id: sub.assessment?.id,
        title: sub.assessment?.title,
        instructions: sub.assessment?.instructions,
        max_marks: Number(sub.assessment?.max_marks || 50),
        due_date: sub.assessment?.deadline_at,
        class_name: sub.assessment?.class_subject?.class?.programme || 'MCA',
        semester: sub.assessment?.class_subject?.class?.semester || 1,
        section: sub.assessment?.class_subject?.class?.section || 'A',
        subject_code: sub.assessment?.class_subject?.subject?.code,
        subject_name: sub.assessment?.class_subject?.subject?.name
      },
      student: {
        id: sub.student?.id,
        name: sub.student?.full_name,
        email: sub.student?.email,
        roll_number: enr?.roll_number || '—'
      },
      submission: {
        id: sub.id,
        version: 1,
        submitted_at: sub.first_submitted_at,
        late_status: sub.late_status || 'on_time'
      },
      evaluation: ev ? {
        id: ev.id,
        evaluator_name: ev.evaluator?.full_name || 'Faculty',
        status: ev.status,
        raw_score: Number(ev.raw_score || ev.total_score),
        late_penalty_deducted: Number(ev.late_penalty_deducted || 0),
        total_score: Number(ev.total_score),
        percentage: Math.round((Number(ev.total_score) / Number(sub.assessment?.max_marks || 50)) * 100),
        general_feedback: ev.general_feedback || null,
        published_at: pub?.published_at || ev.updated_at,
        criterion_scores: enrichedScores
      } : null
    };
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

let activeEvaluationRepoOverride: IEvaluationRepository | null = null;
let cachedSupabaseEvaluationRepo: SupabaseEvaluationRepository | null = null;
let cachedInMemoryEvaluationRepo: InMemoryEvaluationRepository | null = null;

export const setEvaluationRepositoryForTesting = (repo: IEvaluationRepository | null): void => {
  activeEvaluationRepoOverride = repo;
};

export const getEvaluationRepository = (): IEvaluationRepository => {
  if (activeEvaluationRepoOverride) return activeEvaluationRepoOverride;

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    if (!cachedInMemoryEvaluationRepo) cachedInMemoryEvaluationRepo = new InMemoryEvaluationRepository(db);
    return cachedInMemoryEvaluationRepo;
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    if (!cachedSupabaseEvaluationRepo) cachedSupabaseEvaluationRepo = new SupabaseEvaluationRepository(supabaseAdmin);
    return cachedSupabaseEvaluationRepo;
  }

  if (!cachedInMemoryEvaluationRepo) cachedInMemoryEvaluationRepo = new InMemoryEvaluationRepository(db);
  return cachedInMemoryEvaluationRepo;
};
