import { 
  Assessment, 
  Question, 
  RubricVersion, 
  RubricCriterion, 
  RubricLevel,
  CreateAssessmentRequest,
  formatClassName
} from '@smartfa/contracts';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { UserContext } from '../authorization/rbac.js';
import { db, InMemoryDatabase } from './db.js';

export interface AssessmentDeletionCounts {
  submissions: number;
  submission_versions: number;
  evaluations: number;
  evaluation_criterion_scores: number;
  questions: number;
  rubric_versions: number;
  rubric_criteria: number;
  result_publications: number;
  storage_files: number;
}

export interface AssessmentDeletionSummary {
  can_delete: boolean;
  assessment_id: string;
  title: string;
  status: string;
  counts: AssessmentDeletionCounts;
  storage_keys: string[];
}

export interface IAssessmentRepository {
  getAssessmentById(id: string): Promise<Assessment | null>;
  getFullAssessment(id: string): Promise<any | null>;
  listAssessments(user: UserContext): Promise<any[]>;
  createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment>;
  getAssessmentByIdempotencyKey?(createdBy: string, idempotencyKey: string): Promise<Assessment | null>;
  updateAssessment(id: string, updates: Partial<Assessment> & { document_base64?: string }): Promise<Assessment>;
  saveDraftAssessmentAtomic(assessmentId: string | null, data: any, callerId: string): Promise<any>;
  hasRelatedStudentRecords(assessmentId: string): Promise<{
    hasRecords: boolean;
    submissionsCount: number;
    evaluationsCount: number;
    isPublished: boolean;
  }>;
  deleteAssessment(id: string): Promise<void>;
  getAssessmentDeletionSummary(assessmentId: string): Promise<AssessmentDeletionSummary>;
  markAssessmentDeletionPending(assessmentId: string, callerId: string): Promise<void>;
  listAssessmentStorageKeys(assessmentId: string): Promise<string[]>;
  deleteAssessmentPermanent(assessmentId: string, callerId: string): Promise<AssessmentDeletionCounts>;
  publishAssessment(id: string, publishedBy: string): Promise<Assessment>;
  getNextAssessmentSequence(classSubjectId: string): Promise<{ sequence_number: number; title: string; short_label: string }>;
  createQuestion(assessmentId: string, data: any): Promise<Question>;
  updateQuestion(questionId: string, data: any): Promise<Question>;
  deleteQuestion?(questionId: string): Promise<void>;
  saveRubric(questionId: string, rubricData: any, createdBy: string): Promise<any>;
  getDocumentBlob(storageKey: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null>;
  getSignedDocumentUrl?(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
  isAuthorizedTeacher(userId: string, classSubjectId: string): Promise<boolean>;
  isClassTeacherForAssessment(userId: string, classSubjectId: string): Promise<boolean>;
  isEnrolledStudent(studentId: string, classSubjectId: string): Promise<boolean>;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

export class InMemoryAssessmentRepository implements IAssessmentRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async getAssessmentById(id: string): Promise<Assessment | null> {
    const found = this.inMemoryDb.assessments.find(a => a.id === id);
    return found ? { ...found } : null;
  }

  async getFullAssessment(id: string): Promise<any | null> {
    const assessment = this.inMemoryDb.assessments.find(a => a.id === id);
    if (!assessment) return null;

    const questions = this.inMemoryDb.questions
      .filter(q => q.assessment_id === assessment.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map(q => {
        const rubricVersion = this.inMemoryDb.rubricVersions.find(rv => rv.question_id === q.id);
        if (!rubricVersion) return { ...q, rubric: null };

        const criteria = this.inMemoryDb.rubricCriteria
          .filter(rc => rc.rubric_version_id === rubricVersion.id)
          .sort((a, b) => a.display_order - b.display_order)
          .map(rc => {
            const levels = this.inMemoryDb.rubricLevels
              .filter(rl => rl.criterion_id === rc.id)
              .sort((a, b) => a.display_order - b.display_order);
            return { ...rc, levels };
          });

        return { ...q, rubric: { ...rubricVersion, criteria } };
      });

    // Assignment-level rubric
    const assRv = this.inMemoryDb.rubricVersions.find(rv => rv.assessment_id === assessment.id);
    let fullRubric = null;
    if (assRv) {
      const criteria = this.inMemoryDb.rubricCriteria
        .filter(rc => rc.rubric_version_id === assRv.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(rc => {
          const levels = this.inMemoryDb.rubricLevels
            .filter(rl => rl.criterion_id === rc.id)
            .sort((a, b) => a.display_order - b.display_order);
          return { ...rc, levels };
        });
      fullRubric = { ...assRv, criteria };
    }

    const cs = this.inMemoryDb.classSubjects.find(c => c.id === assessment.class_subject_id);
    const cls = cs ? this.inMemoryDb.classes.find(c => c.id === cs.class_id) : null;
    const sub = cs ? this.inMemoryDb.subjects.find(s => s.id === cs.subject_id) : null;

    return {
      ...assessment,
      class_details: cls ? formatClassName(cls) : 'Unknown Class',
      subject_details: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
      questions,
      rubric: fullRubric
    };
  }

  async listAssessments(user: UserContext): Promise<any[]> {
    let list: Assessment[] = [];

    const effectiveRole = user.activeRole || (user.isHOD ? 'hod' : (user.roles.includes('subject_teacher') ? 'subject_teacher' : user.roles.includes('class_teacher') ? 'class_teacher' : user.roles[0]));

    if (effectiveRole === 'proctor') {
      return [];
    }

    if (effectiveRole === 'hod' && user.isHOD) {
      list = [...this.inMemoryDb.assessments];
    } else if (effectiveRole === 'subject_teacher' && user.roles.includes('subject_teacher')) {
      const allowedCSIds = new Set<string>();
      this.inMemoryDb.classSubjects
        .filter(cs => cs.subject_teacher_id === user.profile.id && cs.active)
        .forEach(cs => allowedCSIds.add(cs.id));
      list = this.inMemoryDb.assessments.filter(a => allowedCSIds.has(a.class_subject_id));
    } else if (effectiveRole === 'class_teacher' && user.roles.includes('class_teacher')) {
      const allowedCSIds = new Set<string>();
      const teacherClassIds = new Set<string>(
        this.inMemoryDb.classes
          .filter(c => c.class_teacher_id === user.profile.id)
          .map(c => c.id)
      );

      // Also check allocations
      const allocations = this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === user.profile.id);
      if (allocations.length > 0) {
        this.inMemoryDb.classes
          .filter(c =>
            allocations.some(a =>
              (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
              (!a.semester || a.semester === c.semester)
            )
          )
          .forEach(c => teacherClassIds.add(c.id));
      }

      const allowedClasses = Array.from(teacherClassIds);
      this.inMemoryDb.classSubjects
        .filter(cs => allowedClasses.includes(cs.class_id) && cs.active)
        .forEach(cs => allowedCSIds.add(cs.id));
      list = this.inMemoryDb.assessments.filter(a => allowedCSIds.has(a.class_subject_id));
    } else if (user.roles.includes('subject_teacher') || user.roles.includes('class_teacher')) {
      const allowedCSIds = new Set<string>();
      if (user.roles.includes('subject_teacher')) {
        this.inMemoryDb.classSubjects
          .filter(cs => cs.subject_teacher_id === user.profile.id && cs.active)
          .forEach(cs => allowedCSIds.add(cs.id));
      }
      if (user.roles.includes('class_teacher')) {
        const teacherClassIds = new Set<string>(
          this.inMemoryDb.classes
            .filter(c => c.class_teacher_id === user.profile.id)
            .map(c => c.id)
        );

        const allocations = this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === user.profile.id);
        if (allocations.length > 0) {
          this.inMemoryDb.classes
            .filter(c =>
              allocations.some(a =>
                (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
                (!a.semester || a.semester === c.semester)
              )
            )
            .forEach(c => teacherClassIds.add(c.id));
        }

        const allowedClasses = Array.from(teacherClassIds);
        this.inMemoryDb.classSubjects
          .filter(cs => allowedClasses.includes(cs.class_id) && cs.active)
          .forEach(cs => allowedCSIds.add(cs.id));
      }
      list = this.inMemoryDb.assessments.filter(a => allowedCSIds.has(a.class_subject_id));
    } else if (user.roles.includes('student')) {
      const studentEnrollments = this.inMemoryDb.enrollments
        .filter(e => e.student_id === user.profile.id && e.status === 'active');
      const studentClasses = studentEnrollments.map(e => e.class_id);
      const studentSpecIds = new Set(studentEnrollments.map(e => e.specialization_id).filter(Boolean));

      const studentCS = this.inMemoryDb.classSubjects
        .filter(cs => {
          if (!studentClasses.includes(cs.class_id) || !cs.active) return false;
          const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
          const subSpecId = (sub as any)?.specialization_id;
          if (subSpecId) {
            return studentSpecIds.has(subSpecId);
          }
          return true;
        })
        .map(cs => cs.id);
      list = this.inMemoryDb.assessments.filter(a => a.status === 'published' && studentCS.includes(a.class_subject_id));
    } else {
      list = [];
    }

    const full = await Promise.all(list.map(a => this.getFullAssessment(a.id)));
    return full.filter(Boolean);
  }

  async getAssessmentByIdempotencyKey(createdBy: string, idempotencyKey: string): Promise<Assessment | null> {
    const found = this.inMemoryDb.assessments.find(a => a.created_by === createdBy && a.idempotency_key === idempotencyKey);
    return found || null;
  }

  async getNextAssessmentSequence(classSubjectId: string): Promise<{ sequence_number: number; title: string; short_label: string }> {
    const classAssessments = this.inMemoryDb.assessments.filter(
      a => a.class_subject_id === classSubjectId && a.status !== 'deletion_pending'
    );
    const numbers = classAssessments.map(a => {
      const match = (a.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    }).filter(n => n > 0);

    const nextSeq = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return {
      sequence_number: nextSeq,
      title: `Formative Assessment ${nextSeq}`,
      short_label: `FA${nextSeq}`
    };
  }

  async createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment> {
    if (data.idempotency_key) {
      const existing = this.inMemoryDb.assessments.find(a => a.created_by === createdBy && a.idempotency_key === data.idempotency_key);
      if (existing) return existing;
    }

    if (!data.title || data.title.trim().length === 0 || !data.title.match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*\d+/i)) {
      const seq = await this.getNextAssessmentSequence(data.class_subject_id);
      data.title = seq.title;
    }

    const id = randomUUID();
    let storageKey = data.document_storage_key || null;

    if (data.document_base64 && data.document_filename) {
      const buf = Buffer.from(data.document_base64, 'base64');
      storageKey = `assessments/${id}/documents/${data.document_filename}`;
      this.inMemoryDb.storageBlobs.set(storageKey, buf);
    }

    const newAss: Assessment = {
      id,
      class_subject_id: data.class_subject_id,
      title: data.title,
      instructions: data.instructions,
      deadline_at: data.deadline_at,
      status: 'draft',
      created_by: createdBy,
      published_at: null,
      published_by: null,
      version: 1,
      questions: [],
      document_storage_key: storageKey,
      document_filename: data.document_filename || null,
      document_size_bytes: data.document_size_bytes || null,
      document_mime_type: data.document_mime_type || null,
      max_files: data.max_files || 1,
      allow_late: Boolean(data.allow_late),
      extension_deadline_at: data.extension_deadline_at || null,
      late_penalty_mode: data.late_penalty_mode || 'none',
      late_penalty_marks: data.late_penalty_marks || 0,
      max_marks: data.max_marks || 100,
      idempotency_key: data.idempotency_key || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.inMemoryDb.assessments.push(newAss);
    return newAss;
  }

  async updateAssessment(id: string, updates: Partial<Assessment> & { document_base64?: string }): Promise<Assessment> {
    const idx = this.inMemoryDb.assessments.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Assessment not found');

    const anyUpdates: any = { ...updates };
    if (anyUpdates.document_base64 && anyUpdates.document_filename) {
      const buf = Buffer.from(anyUpdates.document_base64, 'base64');
      const storageKey = `assessments/${id}/documents/${anyUpdates.document_filename}`;
      this.inMemoryDb.storageBlobs.set(storageKey, buf);
      anyUpdates.document_storage_key = storageKey;
      anyUpdates.document_size_bytes = buf.length;
      anyUpdates.document_mime_type = anyUpdates.document_mime_type || 'application/pdf';
      delete anyUpdates.document_base64;
    }

    this.inMemoryDb.assessments[idx] = {
      ...this.inMemoryDb.assessments[idx],
      ...anyUpdates,
      updated_at: new Date().toISOString()
    };
    return this.inMemoryDb.assessments[idx];
  }

  async saveDraftAssessmentAtomic(assessmentId: string | null, data: any, callerId: string): Promise<any> {
    let ass: Assessment;
    const nowIso = new Date().toISOString();

    if (!assessmentId && data.idempotency_key) {
      const existing = this.inMemoryDb.assessments.find(a => a.created_by === callerId && a.idempotency_key === data.idempotency_key);
      if (existing) {
        return this.getFullAssessment(existing.id);
      }
    }

    if (assessmentId) {
      const idx = this.inMemoryDb.assessments.findIndex(a => a.id === assessmentId);
      if (idx === -1) throw new Error('Assessment not found');
      if (this.inMemoryDb.assessments[idx].status !== 'draft') {
        throw new Error('Only draft assessments may be edited');
      }
      this.inMemoryDb.assessments[idx] = {
        ...this.inMemoryDb.assessments[idx],
        title: data.title,
        instructions: data.instructions,
        deadline_at: data.deadline_at,
        allow_late: Boolean(data.allow_late),
        extension_deadline_at: data.extension_deadline_at || null,
        late_penalty_mode: data.late_penalty_mode || 'none',
        late_penalty_marks: data.late_penalty_marks || 0,
        max_marks: 50,
        updated_at: nowIso
      };
      ass = this.inMemoryDb.assessments[idx];
    } else {
      const newId = randomUUID();
      ass = {
        id: newId,
        class_subject_id: data.class_subject_id,
        title: data.title,
        instructions: data.instructions,
        deadline_at: data.deadline_at,
        status: 'draft',
        created_by: callerId,
        published_at: null,
        published_by: null,
        version: 1,
        questions: [],
        document_storage_key: data.document_storage_key || null,
        document_filename: data.document_filename || null,
        document_size_bytes: data.document_size_bytes || null,
        document_mime_type: data.document_mime_type || null,
        max_files: data.max_files || 1,
        allow_late: Boolean(data.allow_late),
        extension_deadline_at: data.extension_deadline_at || null,
        late_penalty_mode: data.late_penalty_mode || 'none',
        late_penalty_marks: data.late_penalty_marks || 0,
        max_marks: 50,
        idempotency_key: data.idempotency_key || null,
        created_at: nowIso,
        updated_at: nowIso
      };
      this.inMemoryDb.assessments.push(ass);
    }

    if (data.document_base64 && data.document_filename) {
      const buf = Buffer.from(data.document_base64, 'base64');
      const storageKey = `assessments/${ass.id}/documents/${data.document_filename}`;
      this.inMemoryDb.storageBlobs.set(storageKey, buf);
      ass.document_storage_key = storageKey;
      ass.document_filename = data.document_filename;
      ass.document_size_bytes = buf.length;
      ass.document_mime_type = data.document_mime_type || 'application/pdf';
    }

    if (data.questions !== undefined) {
      const remainingQIds: string[] = [];
      for (const qInput of data.questions) {
        const qId = qInput.id || randomUUID();
        remainingQIds.push(qId);
        const existingQIdx = this.inMemoryDb.questions.findIndex(q => q.id === qId);
        if (existingQIdx !== -1) {
          this.inMemoryDb.questions[existingQIdx] = {
            ...this.inMemoryDb.questions[existingQIdx],
            prompt: qInput.prompt,
            display_order: qInput.display_order,
            max_marks: qInput.max_marks ?? null
          };
        } else {
          this.inMemoryDb.questions.push({
            id: qId,
            assessment_id: ass.id,
            prompt: qInput.prompt,
            display_order: qInput.display_order,
            max_marks: qInput.max_marks ?? null
          });
        }
      }
      this.inMemoryDb.questions = this.inMemoryDb.questions.filter(
        q => q.assessment_id !== ass.id || remainingQIds.includes(q.id)
      );
    }

    if (data.rubric) {
      let rv = this.inMemoryDb.rubricVersions.find(r => r.assessment_id === ass.id);
      if (rv && rv.frozen_at) {
        throw new Error('Cannot modify rubric: Rubric is frozen');
      }
      if (!rv) {
        rv = {
          id: randomUUID(),
          assessment_id: ass.id,
          version: 1,
          title: data.rubric.title,
          created_by: callerId,
          criteria: [],
          created_at: nowIso
        };
        this.inMemoryDb.rubricVersions.push(rv);
      } else {
        rv.title = data.rubric.title;
      }

      const activeRv = rv!;
      const remainingCIds: string[] = [];
      for (const cInput of (data.rubric.criteria || [])) {
        const cId = cInput.id || randomUUID();
        remainingCIds.push(cId);
        const existingCIdx = this.inMemoryDb.rubricCriteria.findIndex(c => c.id === cId);
        if (existingCIdx !== -1) {
          this.inMemoryDb.rubricCriteria[existingCIdx] = {
            ...this.inMemoryDb.rubricCriteria[existingCIdx],
            title: cInput.title || cInput.criterion_title,
            description: cInput.description || '',
            display_order: cInput.display_order || remainingCIds.length,
            max_marks: Number(cInput.max_marks)
          };
        } else {
          this.inMemoryDb.rubricCriteria.push({
            id: cId,
            rubric_version_id: activeRv.id,
            title: cInput.title || cInput.criterion_title,
            description: cInput.description || '',
            display_order: cInput.display_order || remainingCIds.length,
            max_marks: Number(cInput.max_marks),
            levels: [],
            created_at: nowIso
          });
        }
      }
      this.inMemoryDb.rubricCriteria = this.inMemoryDb.rubricCriteria.filter(
        c => c.rubric_version_id !== activeRv.id || remainingCIds.includes(c.id)
      );
    }

    return this.getFullAssessment(ass.id);
  }

  async hasRelatedStudentRecords(assessmentId: string): Promise<{
    hasRecords: boolean;
    submissionsCount: number;
    evaluationsCount: number;
    isPublished: boolean;
  }> {
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = new Set(subs.map(s => s.id));
    const evals = (this.inMemoryDb.evaluations || []).filter(e => subIds.has(e.submission_id));
    const isPub = (this.inMemoryDb.resultPublications || []).some(rp => rp.assessment_id === assessmentId);
    return {
      hasRecords: subs.length > 0 || evals.length > 0 || isPub,
      submissionsCount: subs.length,
      evaluationsCount: evals.length,
      isPublished: isPub
    };
  }

  async deleteAssessment(id: string): Promise<void> {
    const idx = this.inMemoryDb.assessments.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Assessment not found');

    const records = await this.hasRelatedStudentRecords(id);
    if (records.hasRecords) {
      throw new Error(`Cannot delete assessment: it has ${records.submissionsCount} submission(s) and academic records attached.`);
    }

    const ass = this.inMemoryDb.assessments[idx];
    if (ass.document_storage_key) {
      this.inMemoryDb.storageBlobs.delete(ass.document_storage_key);
    }
    this.inMemoryDb.questions = this.inMemoryDb.questions.filter(q => q.assessment_id !== id);
    this.inMemoryDb.assessments.splice(idx, 1);
  }

  async getAssessmentDeletionSummary(assessmentId: string): Promise<AssessmentDeletionSummary> {
    const ass = this.inMemoryDb.assessments.find(a => a.id === assessmentId);
    if (!ass) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = new Set(subs.map(s => s.id));
    const subVersions = (this.inMemoryDb.submissionVersions || []).filter(sv => subIds.has(sv.submission_id));
    const evals = (this.inMemoryDb.evaluations || []).filter(e => subIds.has(e.submission_id));
    const evalIds = new Set(evals.map(e => e.id));
    const evalScores = (this.inMemoryDb.evaluationCriterionScores || []).filter(ecs => evalIds.has(ecs.evaluation_id));
    const questions = this.inMemoryDb.questions.filter(q => q.assessment_id === assessmentId);
    const qIds = new Set(questions.map(q => q.id));
    const rubricVersions = (this.inMemoryDb.rubricVersions || []).filter(
      rv => rv.assessment_id === assessmentId || (rv.question_id && qIds.has(rv.question_id))
    );
    const rvIds = new Set(rubricVersions.map(rv => rv.id));
    const rubricCriteria = (this.inMemoryDb.rubricCriteria || []).filter(rc => rvIds.has(rc.rubric_version_id));
    const pubs = (this.inMemoryDb.resultPublications || []).filter(rp => rp.assessment_id === assessmentId);

    const storageKeys = await this.listAssessmentStorageKeys(assessmentId);

    return {
      can_delete: true,
      assessment_id: ass.id,
      title: ass.title,
      status: ass.status,
      counts: {
        submissions: subs.length,
        submission_versions: subVersions.length,
        evaluations: evals.length,
        evaluation_criterion_scores: evalScores.length,
        questions: questions.length,
        rubric_versions: rubricVersions.length,
        rubric_criteria: rubricCriteria.length,
        result_publications: pubs.length,
        storage_files: storageKeys.length
      },
      storage_keys: storageKeys
    };
  }

  async markAssessmentDeletionPending(assessmentId: string, _callerId: string): Promise<void> {
    const ass = this.inMemoryDb.assessments.find(a => a.id === assessmentId);
    if (!ass) throw new Error(`Assessment ${assessmentId} not found`);
    ass.status = 'deletion_pending' as any;
    ass.updated_at = new Date().toISOString();
  }

  async listAssessmentStorageKeys(assessmentId: string): Promise<string[]> {
    const keys = new Set<string>();
    const ass = this.inMemoryDb.assessments.find(a => a.id === assessmentId);
    if (ass?.document_storage_key) {
      keys.add(ass.document_storage_key);
    }

    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = new Set(subs.map(s => s.id));
    const subVersions = (this.inMemoryDb.submissionVersions || []).filter(sv => subIds.has(sv.submission_id));

    for (const sv of subVersions) {
      if (sv.storage_path) keys.add(sv.storage_path);
      if (Array.isArray((sv as any).files)) {
        for (const f of (sv as any).files) {
          if (f?.storage_key) keys.add(f.storage_key);
          if (f?.storage_path) keys.add(f.storage_path);
        }
      }
    }

    return Array.from(keys).filter(k => Boolean(k && k.trim()));
  }

  async deleteAssessmentPermanent(assessmentId: string, _callerId: string): Promise<AssessmentDeletionCounts> {
    const assIndex = this.inMemoryDb.assessments.findIndex(a => a.id === assessmentId);
    if (assIndex === -1) {
      return {
        submissions: 0,
        submission_versions: 0,
        evaluations: 0,
        evaluation_criterion_scores: 0,
        questions: 0,
        rubric_versions: 0,
        rubric_criteria: 0,
        result_publications: 0,
        storage_files: 0
      };
    }

    const summary = await this.getAssessmentDeletionSummary(assessmentId);

    // 1. Result publications
    this.inMemoryDb.resultPublications = (this.inMemoryDb.resultPublications || []).filter(
      rp => rp.assessment_id !== assessmentId
    );

    // 2. Submissions & evaluations
    const subs = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    const subIds = new Set(subs.map(s => s.id));
    const evals = (this.inMemoryDb.evaluations || []).filter(e => subIds.has(e.submission_id));
    const evalIds = new Set(evals.map(e => e.id));

    this.inMemoryDb.evaluationCriterionScores = (this.inMemoryDb.evaluationCriterionScores || []).filter(
      ecs => !evalIds.has(ecs.evaluation_id)
    );
    this.inMemoryDb.evaluations = (this.inMemoryDb.evaluations || []).filter(
      e => !subIds.has(e.submission_id)
    );
    this.inMemoryDb.submissionVersions = (this.inMemoryDb.submissionVersions || []).filter(
      sv => !subIds.has(sv.submission_id)
    );
    this.inMemoryDb.submissions = this.inMemoryDb.submissions.filter(
      s => s.assessment_id !== assessmentId
    );

    // 3. Questions & Rubrics
    const questions = this.inMemoryDb.questions.filter(q => q.assessment_id === assessmentId);
    const qIds = new Set(questions.map(q => q.id));
    const rubricVersions = (this.inMemoryDb.rubricVersions || []).filter(
      rv => rv.assessment_id === assessmentId || (rv.question_id && qIds.has(rv.question_id))
    );
    const rvIds = new Set(rubricVersions.map(rv => rv.id));
    const rubricCriteria = (this.inMemoryDb.rubricCriteria || []).filter(rc => rvIds.has(rc.rubric_version_id));
    const rcIds = new Set(rubricCriteria.map(rc => rc.id));

    this.inMemoryDb.rubricLevels = (this.inMemoryDb.rubricLevels || []).filter(
      rl => !rcIds.has(rl.criterion_id)
    );
    this.inMemoryDb.rubricCriteria = (this.inMemoryDb.rubricCriteria || []).filter(
      rc => !rvIds.has(rc.rubric_version_id)
    );
    this.inMemoryDb.rubricVersions = (this.inMemoryDb.rubricVersions || []).filter(
      rv => !rvIds.has(rv.id)
    );
    this.inMemoryDb.questions = this.inMemoryDb.questions.filter(
      q => q.assessment_id !== assessmentId
    );

    // 4. Clean storage blobs in memory
    for (const key of summary.storage_keys) {
      this.inMemoryDb.storageBlobs.delete(key);
    }

    // 5. Delete assessment record
    this.inMemoryDb.assessments.splice(assIndex, 1);

    return summary.counts;
  }

  async publishAssessment(id: string, publishedBy: string): Promise<Assessment> {
    const idx = this.inMemoryDb.assessments.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Assessment not found');
    const ass = this.inMemoryDb.assessments[idx];
    if (ass.status !== 'draft') {
      throw new Error(`Cannot publish assessment: status is ${ass.status}`);
    }

    const rv = this.inMemoryDb.rubricVersions.find(r => r.assessment_id === id);
    const questions = this.inMemoryDb.questions.filter(q => q.assessment_id === id);

    if (rv) {
      // Assignment-level rubric workflow (must equal exactly 50 marks)
      const criteria = this.inMemoryDb.rubricCriteria.filter(c => c.rubric_version_id === rv.id);
      if (criteria.length === 0) {
        throw new Error('Cannot publish assessment: Rubric contains zero criteria');
      }

      const totalMarks = criteria.reduce((sum, c) => sum + Number(c.max_marks), 0);
      if (Math.abs(totalMarks - 50) > 0.001) {
        throw new Error(`Cannot publish assessment: Rubric criteria sum (${totalMarks}) must equal exactly 50.00 marks`);
      }

      const nowIso = new Date().toISOString();
      rv.frozen_at = nowIso;
      ass.status = 'published';
      ass.published_at = nowIso;
      ass.published_by = publishedBy;
      ass.max_marks = 50;
      ass.updated_at = nowIso;
      return ass;
    }

    // Fallback: Legacy Question-level rubrics workflow
    if (questions.length === 0) {
      throw new Error('Cannot publish assessment: An assignment-level rubric or questions with rubrics must be configured before publication');
    }

    for (const q of questions) {
      const qRv = this.inMemoryDb.rubricVersions.find(r => r.question_id === q.id);
      if (!qRv) {
        throw new Error(`Cannot publish assessment: Question ${q.display_order} is missing a defined rubric`);
      }
      const criteria = this.inMemoryDb.rubricCriteria.filter(c => c.rubric_version_id === qRv.id);
      const totalMarks = criteria.reduce((sum, c) => sum + Number(c.max_marks), 0);
      if (Math.abs(totalMarks - Number(q.max_marks)) > 0.001) {
        throw new Error(`Cannot publish assessment: Question ${q.display_order} rubric criteria sum (${totalMarks}) does not equal question marks (${q.max_marks})`);
      }
    }

    const nowIso = new Date().toISOString();
    for (const q of questions) {
      const qRv = this.inMemoryDb.rubricVersions.find(r => r.question_id === q.id);
      if (qRv) qRv.frozen_at = nowIso;
    }
    ass.status = 'published';
    ass.published_at = nowIso;
    ass.published_by = publishedBy;
    ass.updated_at = nowIso;
    return ass;
  }

  async deleteQuestion(questionId: string): Promise<void> {
    this.inMemoryDb.questions = this.inMemoryDb.questions.filter(q => q.id !== questionId);
  }

  async createQuestion(assessmentId: string, data: any): Promise<Question> {
    const q: Question = {
      id: randomUUID(),
      assessment_id: assessmentId,
      prompt: data.prompt || data.title || '',
      max_marks: data.max_marks ?? null,
      display_order: data.display_order || data.question_number || 1,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.questions.push(q);
    return q;
  }

  async updateQuestion(questionId: string, data: any): Promise<Question> {
    const idx = this.inMemoryDb.questions.findIndex(q => q.id === questionId);
    if (idx === -1) throw new Error('Question not found');
    this.inMemoryDb.questions[idx] = { ...this.inMemoryDb.questions[idx], ...data };
    return this.inMemoryDb.questions[idx];
  }

  async saveRubric(questionId: string, rubricData: any, createdBy: string): Promise<any> {
    let rubricVersion = this.inMemoryDb.rubricVersions.find(rv => rv.question_id === questionId);
    if (!rubricVersion) {
      rubricVersion = {
        id: randomUUID(),
        question_id: questionId,
        version: 1,
        title: rubricData.title,
        created_by: createdBy,
        criteria: [],
        created_at: new Date().toISOString()
      };
      this.inMemoryDb.rubricVersions.push(rubricVersion);
    }

    this.inMemoryDb.rubricCriteria = this.inMemoryDb.rubricCriteria.filter(
      rc => rc.rubric_version_id !== rubricVersion!.id
    );

    const criteria = (rubricData.criteria || []).map((c: any, cIdx: number) => {
      const critId = randomUUID();
      const levels: RubricLevel[] = (c.levels || []).map((lvl: any, lIdx: number) => {
        const level: RubricLevel = {
          id: randomUUID(),
          criterion_id: critId,
          label: lvl.level_name || lvl.label || `Level ${lIdx + 1}`,
          description: lvl.description || '',
          min_guidance: lvl.points ?? lvl.min_guidance ?? null,
          max_guidance: lvl.points ?? lvl.max_guidance ?? null,
          display_order: lvl.display_order ?? lIdx + 1,
          created_at: new Date().toISOString()
        };
        this.inMemoryDb.rubricLevels.push(level);
        return level;
      });

      const criterion: RubricCriterion = {
        id: critId,
        rubric_version_id: rubricVersion!.id,
        title: c.title,
        description: c.description || '',
        max_marks: c.max_marks,
        display_order: c.display_order ?? cIdx + 1,
        levels,
        created_at: new Date().toISOString()
      };
      this.inMemoryDb.rubricCriteria.push(criterion);
      return criterion;
    });

    return { ...rubricVersion, criteria };
  }

  async getSignedDocumentUrl(storageKey: string): Promise<string | null> {
    return null;
  }

  async getDocumentBlob(storageKey: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const buf = this.inMemoryDb.storageBlobs.get(storageKey);
    if (!buf) return null;
    const filename = storageKey.split('/').pop() || 'document.pdf';
    return { buffer: buf, mimeType: 'application/pdf', filename };
  }

  async isAuthorizedTeacher(userId: string, classSubjectId: string): Promise<boolean> {
    return this.inMemoryDb.classSubjects.some(
      cs => cs.id === classSubjectId && cs.subject_teacher_id === userId && cs.active
    );
  }

  async isClassTeacherForAssessment(userId: string, classSubjectId: string): Promise<boolean> {
    const cs = this.inMemoryDb.classSubjects.find(c => c.id === classSubjectId);
    if (!cs) return false;
    const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
    if (!cls) return false;
    if (cls.class_teacher_id === userId) return true;

    // Check allocations
    const allocations = this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === userId);
    return allocations.some(a =>
      (!a.programme_id || a.programme_id === cls.programme_id || (cls.programme && cls.programme === 'MCA')) &&
      (!a.semester || a.semester === cls.semester)
    );
  }

  async isEnrolledStudent(studentId: string, classSubjectId: string): Promise<boolean> {
    const cs = this.inMemoryDb.classSubjects.find(c => c.id === classSubjectId);
    if (!cs) return false;
    const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
    const subSpecId = (sub as any)?.specialization_id;
    return this.inMemoryDb.enrollments.some(e => {
      if (e.class_id !== cs.class_id || e.student_id !== studentId || e.status !== 'active') return false;
      if (subSpecId) {
        return Boolean(e.specialization_id && e.specialization_id === subSpecId);
      }
      return true;
    });
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'in_memory_mock';
  }
}

export class SupabaseAssessmentRepository implements IAssessmentRepository {
  async getSignedDocumentUrl(storageKey: string, expiresInSeconds: number = 3600): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(storageKey, expiresInSeconds);
    if (error || !data) return null;
    return data.signedUrl;
  }
  private bucketName = process.env.STORAGE_BUCKET_ASSIGNMENTS || 'submissions-private';

  constructor(private client: SupabaseClient) {}

  private assertStagingProject(): void {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    if (url.includes('rdfloxppwlbocxplbixu') && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production') {
      throw new Error('SECURITY VIOLATION: Writes to production project rdfloxppwlbocxplbixu are strictly forbidden in non-production mode!');
    }
  }

  async getAssessmentById(id: string): Promise<Assessment | null> {
    const { data, error } = await this.client
      .from('assessments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to get assessment: ${error.message}`);
    return data ? { ...data, questions: [] } : null;
  }

  async getFullAssessment(id: string): Promise<any | null> {
    const assessment = await this.getAssessmentById(id);
    if (!assessment) return null;

    // Parallel Round 1: Fetch questions, class_subject linkage, and assignment-level rubric version concurrently
    const [questionsRes, csRes, assRubricVersionRes] = await Promise.all([
      this.client
        .from('questions')
        .select('*')
        .eq('assessment_id', id)
        .order('display_order', { ascending: true }),
      this.client
        .from('class_subjects')
        .select('id, class_id, subject_id')
        .eq('id', assessment.class_subject_id)
        .maybeSingle(),
      this.client
        .from('rubric_versions')
        .select('*')
        .eq('assessment_id', id)
        .maybeSingle()
    ]);

    const questions = questionsRes.data || [];
    const cs = csRes.data;
    const assRubricVersion = assRubricVersionRes.data;

    // Parallel Round 2: Fetch class and subject names, and rubric criteria concurrently
    const [clsRes, subRes, criteriaRes] = await Promise.all([
      cs
        ? this.client
            .from('classes')
            .select('programme, semester, section')
            .eq('id', cs.class_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      cs
        ? this.client
            .from('subjects')
            .select('code, name')
            .eq('id', cs.subject_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      assRubricVersion
        ? this.client
            .from('rubric_criteria')
            .select('*')
            .eq('rubric_version_id', assRubricVersion.id)
            .order('display_order', { ascending: true })
        : Promise.resolve({ data: null })
    ]);

    const classDetails = clsRes.data ? formatClassName(clsRes.data) : 'Unknown Class';
    const subjectDetails = subRes.data ? `${subRes.data.code} - ${subRes.data.name}` : 'Unknown Subject';

    // Parallel Round 3: Fetch levels for all criteria in a single query
    let fullAssignmentRubric = null;
    if (assRubricVersion && criteriaRes.data && criteriaRes.data.length > 0) {
      const criteria = criteriaRes.data;
      const criterionIds = criteria.map(c => c.id);

      const { data: levels } = await this.client
        .from('rubric_levels')
        .select('*')
        .in('criterion_id', criterionIds)
        .order('display_order', { ascending: true });

      const allLevels = levels || [];
      const fullCriteria = criteria.map(rc => ({
        ...rc,
        levels: allLevels.filter(l => l.criterion_id === rc.id)
      }));

      fullAssignmentRubric = {
        ...assRubricVersion,
        criteria: fullCriteria
      };
    } else if (assRubricVersion) {
      fullAssignmentRubric = {
        ...assRubricVersion,
        criteria: []
      };
    }

    return {
      ...assessment,
      class_details: classDetails,
      subject_details: subjectDetails,
      questions: questions.map(q => ({ ...q, rubric: null })),
      rubric: fullAssignmentRubric
    };
  }

  async listAssessments(user: UserContext): Promise<any[]> {
    let query = this.client.from('assessments').select('*');

    const effectiveRole = user.activeRole || (user.isHOD ? 'hod' : (user.roles.includes('subject_teacher') ? 'subject_teacher' : user.roles.includes('class_teacher') ? 'class_teacher' : user.roles[0]));

    if (effectiveRole === 'proctor') {
      return [];
    }

    if (effectiveRole === 'hod' && user.isHOD) {
      // HOD sees all
    } else if (effectiveRole === 'subject_teacher' && user.roles.includes('subject_teacher')) {
      const { data: assignedCS } = await this.client
        .from('class_subjects')
        .select('id')
        .eq('subject_teacher_id', user.profile.id)
        .eq('active', true);
      const csIds = (assignedCS || []).map(c => c.id);
      if (csIds.length === 0) return [];
      query = query.in('class_subject_id', csIds);
    } else if (effectiveRole === 'class_teacher' && user.roles.includes('class_teacher')) {
      const classIdSet = new Set<string>();

      const { data: assignedClasses } = await this.client
        .from('classes')
        .select('id')
        .eq('class_teacher_id', user.profile.id);
      (assignedClasses || []).forEach(c => classIdSet.add(c.id));

      // Also check allocations
      const { data: allocs } = await this.client
        .from('faculty_allocations')
        .select('*')
        .eq('faculty_id', user.profile.id);
      const memAllocs = db.faculty_allocations.filter(a => a.faculty_id === user.profile.id);
      const allTeacherAllocs = [...(allocs || []), ...memAllocs];

      if (allTeacherAllocs.length > 0) {
        const { data: allClasses } = await this.client.from('classes').select('id, programme_id, programme, semester');
        (allClasses || []).forEach(c => {
          if (allTeacherAllocs.some(a =>
            (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
            (!a.semester || a.semester === c.semester)
          )) {
            classIdSet.add(c.id);
          }
        });
      }

      const classIds = Array.from(classIdSet);
      if (classIds.length === 0) return [];

      const { data: teacherCS } = await this.client
        .from('class_subjects')
        .select('id')
        .in('class_id', classIds)
        .eq('active', true);
      const csIds = (teacherCS || []).map(c => c.id);
      if (csIds.length === 0) return [];
      query = query.in('class_subject_id', csIds);
    } else if (user.roles.includes('subject_teacher') || user.roles.includes('class_teacher')) {
      const csIdSet = new Set<string>();

      if (user.roles.includes('subject_teacher')) {
        const { data: assignedCS } = await this.client
          .from('class_subjects')
          .select('id')
          .eq('subject_teacher_id', user.profile.id)
          .eq('active', true);
        (assignedCS || []).forEach(c => csIdSet.add(c.id));
      }

      if (user.roles.includes('class_teacher')) {
        const classIdSet = new Set<string>();

        const { data: teacherClasses } = await this.client
          .from('classes')
          .select('id')
          .eq('class_teacher_id', user.profile.id);
        (teacherClasses || []).forEach(c => classIdSet.add(c.id));

        // Also check allocations
        const { data: allocs } = await this.client
          .from('faculty_allocations')
          .select('*')
          .eq('faculty_id', user.profile.id);
        const memAllocs = db.faculty_allocations.filter(a => a.faculty_id === user.profile.id);
        const allTeacherAllocs = [...(allocs || []), ...memAllocs];

        if (allTeacherAllocs.length > 0) {
          const { data: allClasses } = await this.client.from('classes').select('id, programme_id, programme, semester');
          (allClasses || []).forEach(c => {
            if (allTeacherAllocs.some(a =>
              (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
              (!a.semester || a.semester === c.semester)
            )) {
              classIdSet.add(c.id);
            }
          });
        }

        const classIds = Array.from(classIdSet);
        if (classIds.length > 0) {
          const { data: teacherCS } = await this.client
            .from('class_subjects')
            .select('id')
            .in('class_id', classIds)
            .eq('active', true);
          (teacherCS || []).forEach(c => csIdSet.add(c.id));
        }
      }

      const csIds = Array.from(csIdSet);
      if (csIds.length === 0) return [];
      query = query.in('class_subject_id', csIds);
    } else if (user.roles.includes('student')) {
      const { data: enrollments } = await this.client
        .from('enrollments')
        .select('class_id, specialization_id')
        .eq('student_id', user.profile.id)
        .eq('status', 'active');
      const classIds = (enrollments || []).map(e => e.class_id);
      if (classIds.length === 0) return [];

      const studentSpecIds = new Set((enrollments || []).map(e => e.specialization_id).filter(Boolean));

      const { data: studentCS } = await this.client
        .from('class_subjects')
        .select('id, class_id, subject:subjects(specialization_id)')
        .in('class_id', classIds)
        .eq('active', true);

      const csIds = (studentCS || [])
        .filter(cs => {
          const subSpecId = (cs as any)?.subject?.specialization_id;
          if (subSpecId) {
            return studentSpecIds.has(subSpecId);
          }
          return true;
        })
        .map(c => c.id);

      if (csIds.length === 0) return [];

      query = query.eq('status', 'published').in('class_subject_id', csIds);
    } else {
      return [];
    }

    const { data: assessments, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list assessments: ${error.message}`);

    const fullList = await Promise.all((assessments || []).map(a => this.getFullAssessment(a.id)));
    return fullList.filter(Boolean);
  }

  async getAssessmentByIdempotencyKey(createdBy: string, idempotencyKey: string): Promise<Assessment | null> {
    this.assertStagingProject();
    try {
      const { data, error } = await this.client
        .from('assessments')
        .select('id')
        .eq('created_by', createdBy)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (error || !data) return null;
      return this.getFullAssessment(data.id);
    } catch {
      return null;
    }
  }

  async getNextAssessmentSequence(classSubjectId: string): Promise<{ sequence_number: number; title: string; short_label: string }> {
    const { data: assessments, error } = await this.client
      .from('assessments')
      .select('id, title, status')
      .eq('class_subject_id', classSubjectId)
      .neq('status', 'deletion_pending');

    if (error) {
      throw new Error(`Failed to query assessment sequence: ${error.message}`);
    }

    const numbers = (assessments || []).map(a => {
      const match = (a.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i);
      return match && match[1] ? parseInt(match[1], 10) : 0;
    }).filter(n => n > 0);

    const nextSeq = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return {
      sequence_number: nextSeq,
      title: `Formative Assessment ${nextSeq}`,
      short_label: `FA${nextSeq}`
    };
  }

  async createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment> {
    this.assertStagingProject();

    if (data.idempotency_key) {
      const existing = await this.getAssessmentByIdempotencyKey(createdBy, data.idempotency_key);
      if (existing) return existing;
    }

    if (!data.title || data.title.trim().length === 0 || !data.title.match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*\d+/i)) {
      const seq = await this.getNextAssessmentSequence(data.class_subject_id);
      data.title = seq.title;
    }

    const id = randomUUID();
    let storageKey = data.document_storage_key || null;
    let sizeBytes = data.document_size_bytes || null;
    let mimeType = data.document_mime_type || 'application/pdf';

    if (data.document_base64 && data.document_filename) {
      const buf = Buffer.from(data.document_base64, 'base64');
      sizeBytes = buf.length;
      storageKey = `assessments/${id}/documents/${data.document_filename}`;

      const { error: uploadError } = await this.client.storage
        .from(this.bucketName)
        .upload(storageKey, buf, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Failed to upload assignment PDF to storage: ${uploadError.message}`);
      }
    }

    const payload = {
      id,
      class_subject_id: data.class_subject_id,
      title: data.title,
      instructions: data.instructions,
      deadline_at: data.deadline_at,
      status: 'draft',
      created_by: createdBy,
      published_at: null,
      published_by: null,
      version: 1,
      document_storage_key: storageKey,
      document_filename: data.document_filename || null,
      document_size_bytes: sizeBytes,
      document_mime_type: mimeType,
      max_files: data.max_files || 1,
      allow_late: Boolean(data.allow_late),
      extension_deadline_at: data.extension_deadline_at || null,
      late_penalty_mode: data.late_penalty_mode || 'none',
      late_penalty_marks: data.late_penalty_marks || 0,
      max_marks: data.max_marks || 100,
      idempotency_key: data.idempotency_key || null
    };

    const { data: inserted, error: insertError } = await this.client
      .from('assessments')
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505' && data.idempotency_key) {
        const existing = await this.getAssessmentByIdempotencyKey(createdBy, data.idempotency_key);
        if (existing) return existing;
      }
      throw new Error(`Failed to insert assessment record: ${insertError.message}`);
    }

    return { ...inserted, questions: [] };
  }

  async updateAssessment(id: string, updates: Partial<Assessment> & { document_base64?: string }): Promise<Assessment> {
    this.assertStagingProject();

    let storageKey = updates.document_storage_key;
    let sizeBytes = updates.document_size_bytes;
    let mimeType = updates.document_mime_type || 'application/pdf';

    // If new document uploaded, upload to private storage and replace
    if (updates.document_base64 && updates.document_filename) {
      const buf = Buffer.from(updates.document_base64, 'base64');
      sizeBytes = buf.length;
      storageKey = `assessments/${id}/documents/${updates.document_filename}`;

      const { error: uploadError } = await this.client.storage
        .from(this.bucketName)
        .upload(storageKey, buf, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Failed to upload updated assignment PDF to storage: ${uploadError.message}`);
      }

      // Clean up previous storage file if key changed to avoid orphaned files
      const existing = await this.getAssessmentById(id);
      if (existing?.document_storage_key && existing.document_storage_key !== storageKey) {
        await this.client.storage.from(this.bucketName).remove([existing.document_storage_key]).catch(() => {});
      }
    }

    // Whitelist only valid DB columns
    const allowedColumns = [
      'title', 'instructions', 'deadline_at', 'status', 'published_at', 'published_by',
      'document_storage_key', 'document_filename', 'document_size_bytes', 'document_mime_type',
      'max_files', 'allow_late', 'extension_deadline_at', 'late_penalty_mode', 'late_penalty_marks',
      'max_marks'
    ];

    const dbUpdates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    for (const key of allowedColumns) {
      if ((updates as any)[key] !== undefined) {
        dbUpdates[key] = (updates as any)[key];
      }
    }

    if (storageKey !== undefined) dbUpdates.document_storage_key = storageKey;
    if (sizeBytes !== undefined) dbUpdates.document_size_bytes = sizeBytes;
    if (mimeType !== undefined) dbUpdates.document_mime_type = mimeType;

    const { data, error } = await this.client
      .from('assessments')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update assessment: ${error.message}`);
    return { ...data, questions: [] };
  }

  async hasRelatedStudentRecords(assessmentId: string): Promise<{
    hasRecords: boolean;
    submissionsCount: number;
    evaluationsCount: number;
    isPublished: boolean;
  }> {
    // 1. Submissions count
    const { count: subsCount } = await this.client
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const submissionsCount = subsCount || 0;

    // 2. Evaluations count
    let evaluationsCount = 0;
    const { data: subIds } = await this.client
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessmentId);

    if (subIds && subIds.length > 0) {
      const ids = subIds.map(s => s.id);
      const { count: evCount } = await this.client
        .from('evaluations')
        .select('id', { count: 'exact', head: true })
        .in('submission_id', ids);
      evaluationsCount = evCount || 0;
    }

    // 3. Published record
    const { data: pubRec } = await this.client
      .from('result_publications')
      .select('id')
      .eq('assessment_id', assessmentId)
      .maybeSingle();

    const isPublished = Boolean(pubRec);

    return {
      hasRecords: submissionsCount > 0 || evaluationsCount > 0 || isPublished,
      submissionsCount,
      evaluationsCount,
      isPublished
    };
  }

  async deleteAssessment(id: string): Promise<void> {
    this.assertStagingProject();

    const assessment = await this.getAssessmentById(id);
    if (!assessment) {
      throw new Error('Assessment not found');
    }

    const records = await this.hasRelatedStudentRecords(id);
    if (records.hasRecords) {
      throw new Error(`Cannot delete assessment: it has ${records.submissionsCount} submission(s) and academic records attached.`);
    }

    // Delete questions
    const { data: questions } = await this.client
      .from('questions')
      .select('id')
      .eq('assessment_id', id);

    if (questions && questions.length > 0) {
      const qIds = questions.map(q => q.id);
      await this.client.from('questions').delete().in('id', qIds);
    }

    // Delete storage file
    if (assessment.document_storage_key) {
      await this.client.storage
        .from(this.bucketName)
        .remove([assessment.document_storage_key])
        .catch(() => {});
    }

    // Delete assessment row
    const { error } = await this.client
      .from('assessments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete assessment: ${error.message}`);
    }
  }

  async getAssessmentDeletionSummary(assessmentId: string): Promise<AssessmentDeletionSummary> {
    const assessment = await this.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    const { count: subsCount } = await this.client
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const { data: subs } = await this.client
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessmentId);

    const subIds = (subs || []).map(s => s.id);
    let subVersionsCount = 0;
    let evalsCount = 0;
    let evalScoresCount = 0;

    if (subIds.length > 0) {
      const { count: svCount } = await this.client
        .from('submission_versions')
        .select('id', { count: 'exact', head: true })
        .in('submission_id', subIds);
      subVersionsCount = svCount || 0;

      const { count: eCount } = await this.client
        .from('evaluations')
        .select('id', { count: 'exact', head: true })
        .in('submission_id', subIds);
      evalsCount = eCount || 0;

      const { data: evals } = await this.client
        .from('evaluations')
        .select('id')
        .in('submission_id', subIds);
      const evalIds = (evals || []).map(e => e.id);
      if (evalIds.length > 0) {
        const { count: esCount } = await this.client
          .from('evaluation_criterion_scores')
          .select('id', { count: 'exact', head: true })
          .in('evaluation_id', evalIds);
        evalScoresCount = esCount || 0;
      }
    }

    const { count: qCount } = await this.client
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const { data: questions } = await this.client
      .from('questions')
      .select('id')
      .eq('assessment_id', assessmentId);
    const qIds = (questions || []).map(q => q.id);

    // Rubric versions
    const { data: rvsAss } = await this.client
      .from('rubric_versions')
      .select('id')
      .eq('assessment_id', assessmentId);
    let rvIds = (rvsAss || []).map(r => r.id);
    if (qIds.length > 0) {
      const { data: rvsQ } = await this.client
        .from('rubric_versions')
        .select('id')
        .in('question_id', qIds);
      rvIds = [...rvIds, ...(rvsQ || []).map(r => r.id)];
    }

    let rubricCriteriaCount = 0;
    if (rvIds.length > 0) {
      const { count: rcCount } = await this.client
        .from('rubric_criteria')
        .select('id', { count: 'exact', head: true })
        .in('rubric_version_id', rvIds);
      rubricCriteriaCount = rcCount || 0;
    }

    const { count: pubsCount } = await this.client
      .from('result_publications')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId);

    const storageKeys = await this.listAssessmentStorageKeys(assessmentId);

    return {
      can_delete: true,
      assessment_id: assessment.id,
      title: assessment.title,
      status: assessment.status,
      counts: {
        submissions: subsCount || 0,
        submission_versions: subVersionsCount,
        evaluations: evalsCount,
        evaluation_criterion_scores: evalScoresCount,
        questions: qCount || 0,
        rubric_versions: rvIds.length,
        rubric_criteria: rubricCriteriaCount,
        result_publications: pubsCount || 0,
        storage_files: storageKeys.length
      },
      storage_keys: storageKeys
    };
  }

  async markAssessmentDeletionPending(assessmentId: string, callerId: string): Promise<void> {
    this.assertStagingProject();
    const { error: rpcErr } = await this.client.rpc('mark_assessment_deletion_pending', {
      p_assessment_id: assessmentId,
      p_caller_id: callerId
    });

    if (rpcErr) {
      const { error } = await this.client
        .from('assessments')
        .update({ status: 'deletion_pending', updated_at: new Date().toISOString() })
        .eq('id', assessmentId);
      if (error) {
        throw new Error(`Failed to mark assessment deletion pending: ${error.message}`);
      }
    }
  }

  async listAssessmentStorageKeys(assessmentId: string): Promise<string[]> {
    const keys = new Set<string>();
    const assessment = await this.getAssessmentById(assessmentId);
    if (assessment?.document_storage_key) {
      keys.add(assessment.document_storage_key);
    }

    const { data: subs } = await this.client
      .from('submissions')
      .select('id')
      .eq('assessment_id', assessmentId);

    const subIds = (subs || []).map(s => s.id);
    if (subIds.length > 0) {
      const { data: versions } = await this.client
        .from('submission_versions')
        .select('storage_path, files')
        .in('submission_id', subIds);

      for (const v of versions || []) {
        if (v.storage_path) keys.add(v.storage_path);
        if (Array.isArray(v.files)) {
          for (const f of v.files) {
            if (f?.storage_key) keys.add(f.storage_key);
            if (f?.storage_path) keys.add(f.storage_path);
          }
        }
      }
    }

    return Array.from(keys).filter(k => Boolean(k && k.trim()));
  }

  async deleteAssessmentPermanent(assessmentId: string, callerId: string): Promise<AssessmentDeletionCounts> {
    this.assertStagingProject();
    const summary = await this.getAssessmentDeletionSummary(assessmentId);

    // Try RPC first
    const { data: rpcData, error: rpcErr } = await this.client.rpc('delete_assessment_atomic', {
      p_assessment_id: assessmentId,
      p_caller_id: callerId
    });

    if (!rpcErr && rpcData?.success) {
      return {
        submissions: rpcData.deleted_counts?.submissions ?? summary.counts.submissions,
        submission_versions: summary.counts.submission_versions,
        evaluations: rpcData.deleted_counts?.evaluations ?? summary.counts.evaluations,
        evaluation_criterion_scores: summary.counts.evaluation_criterion_scores,
        questions: rpcData.deleted_counts?.questions ?? summary.counts.questions,
        rubric_versions: rpcData.deleted_counts?.rubric_versions ?? summary.counts.rubric_versions,
        rubric_criteria: summary.counts.rubric_criteria,
        result_publications: rpcData.deleted_counts?.publications ?? summary.counts.result_publications,
        storage_files: summary.counts.storage_files
      };
    }

    // Fallback: Delete in foreign key order
    // 1. Result publications
    await this.client.from('result_publications').delete().eq('assessment_id', assessmentId);

    // 2. Evaluations & submissions
    const { data: subs } = await this.client.from('submissions').select('id').eq('assessment_id', assessmentId);
    const subIds = (subs || []).map(s => s.id);
    if (subIds.length > 0) {
      const { data: evals } = await this.client.from('evaluations').select('id').in('submission_id', subIds);
      const evalIds = (evals || []).map(e => e.id);
      if (evalIds.length > 0) {
        await this.client.from('evaluation_criterion_scores').delete().in('evaluation_id', evalIds);
        await this.client.from('evaluations').delete().in('id', evalIds);
      }
      // Null active version id
      await this.client.from('submissions').update({ active_version_id: null }).in('id', subIds);
      await this.client.from('submission_versions').delete().in('submission_id', subIds);
      await this.client.from('submissions').delete().in('id', subIds);
    }

    // 3. Rubrics & Questions
    const { data: questions } = await this.client.from('questions').select('id').eq('assessment_id', assessmentId);
    const qIds = (questions || []).map(q => q.id);

    const { data: rvsAss } = await this.client.from('rubric_versions').select('id').eq('assessment_id', assessmentId);
    let rvIds = (rvsAss || []).map(r => r.id);
    if (qIds.length > 0) {
      const { data: rvsQ } = await this.client.from('rubric_versions').select('id').in('question_id', qIds);
      rvIds = [...rvIds, ...(rvsQ || []).map(r => r.id)];
    }

    if (rvIds.length > 0) {
      const { data: rcs } = await this.client.from('rubric_criteria').select('id').in('rubric_version_id', rvIds);
      const rcIds = (rcs || []).map(c => c.id);
      if (rcIds.length > 0) {
        await this.client.from('rubric_levels').delete().in('criterion_id', rcIds);
        await this.client.from('rubric_criteria').delete().in('id', rcIds);
      }
      await this.client.from('rubric_versions').delete().in('id', rvIds);
    }

    if (qIds.length > 0) {
      await this.client.from('questions').delete().in('id', qIds);
    }

    // 4. Assessment row
    const { error: delErr } = await this.client.from('assessments').delete().eq('id', assessmentId);
    if (delErr) {
      throw new Error(`Failed to delete assessment: ${delErr.message}`);
    }

    return summary.counts;
  }

  async publishAssessment(id: string, publishedBy: string): Promise<Assessment> {
    this.assertStagingProject();
    const { error } = await this.client.rpc('publish_assessment', {
      p_assessment_id: id,
      p_published_by: publishedBy
    });

    if (error) {
      throw new Error(`Failed to publish assessment: ${error.message}`);
    }

    const full = await this.getFullAssessment(id);
    return full as Assessment;
  }

  async saveDraftAssessmentAtomic(assessmentId: string | null, data: any, callerId: string): Promise<any> {
    this.assertStagingProject();

    if (!assessmentId && data.idempotency_key) {
      const existing = await this.getAssessmentByIdempotencyKey(callerId, data.idempotency_key);
      if (existing) {
        return existing;
      }
    }

    let storageKey = data.document_storage_key || null;
    let sizeBytes = data.document_size_bytes || null;
    let mimeType = data.document_mime_type || null;

    if (data.document_base64 && data.document_filename) {
      const buf = Buffer.from(data.document_base64, 'base64');
      const tempId = assessmentId || randomUUID();
      storageKey = `assessments/${tempId}/documents/${data.document_filename}`;
      sizeBytes = buf.length;
      mimeType = data.document_mime_type || 'application/pdf';

      const { error: uploadError } = await this.client.storage
        .from(this.bucketName)
        .upload(storageKey, buf, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Failed to upload assignment PDF: ${uploadError.message}`);
      }
    }

    if (!assessmentId) {
      if (!data.title || data.title.trim().length === 0 || !data.title.match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*\d+/i)) {
        const seq = await this.getNextAssessmentSequence(data.class_subject_id);
        data.title = seq.title;
      }
    }

    const { data: result, error } = await this.client.rpc('save_draft_assessment_atomic', {
      p_assessment_id: assessmentId || null,
      p_class_subject_id: data.class_subject_id,
      p_title: data.title,
      p_instructions: data.instructions,
      p_deadline_at: data.deadline_at,
      p_allow_late: Boolean(data.allow_late),
      p_extension_deadline_at: data.extension_deadline_at || null,
      p_late_penalty_mode: data.late_penalty_mode || 'none',
      p_late_penalty_marks: data.late_penalty_marks || 0,
      p_document_storage_key: storageKey,
      p_document_filename: data.document_filename || null,
      p_document_size_bytes: sizeBytes,
      p_document_mime_type: mimeType,
      p_caller_id: callerId,
      p_idempotency_key: data.idempotency_key || null,
      p_questions: (data.questions || []).map((q: any, idx: number) => ({
        id: q.id || null,
        prompt: q.prompt,
        display_order: q.display_order || (idx + 1),
        max_marks: q.max_marks ?? 50
      })),
      p_rubric: data.rubric ? {
        id: data.rubric.id || null,
        title: data.rubric.title || 'Assignment Evaluation Rubric',
        criteria: (data.rubric.criteria || []).map((c: any, idx: number) => ({
          id: c.id || null,
          title: (c.title || c.criterion_title || '').trim(),
          criterion_title: (c.criterion_title || c.title || '').trim(),
          description: c.description || '',
          display_order: c.display_order || (idx + 1),
          max_marks: Number(c.max_marks || c.max_score || 10)
        }))
      } : null
    });

    if (error) {
      if (error.code === 'PGRST202' || error.message?.includes('save_draft_assessment_atomic')) {
        let effectiveAssessmentId = assessmentId;
        if (!effectiveAssessmentId) {
          const created = await this.createAssessment({
            class_subject_id: data.class_subject_id,
            title: data.title,
            instructions: data.instructions,
            deadline_at: data.deadline_at,
            document_storage_key: storageKey,
            document_filename: data.document_filename || null,
            document_size_bytes: sizeBytes,
            document_mime_type: mimeType,
            max_files: data.max_files || 1,
            allow_late: Boolean(data.allow_late),
            extension_deadline_at: data.extension_deadline_at || null,
            late_penalty_mode: data.late_penalty_mode || 'none',
            late_penalty_marks: data.late_penalty_marks || 0,
            max_marks: 50,
            idempotency_key: data.idempotency_key || null,
            questions: []
          }, callerId);
          effectiveAssessmentId = created.id;
        } else {
          await this.updateAssessment(effectiveAssessmentId, {
            title: data.title,
            instructions: data.instructions,
            deadline_at: data.deadline_at,
            allow_late: Boolean(data.allow_late),
            extension_deadline_at: data.extension_deadline_at || null,
            late_penalty_mode: data.late_penalty_mode || 'none',
            late_penalty_marks: data.late_penalty_marks || 0,
            max_marks: 50,
            idempotency_key: data.idempotency_key || null,
            questions: []
          });
        }

        // Reconcile questions
        if (data.questions !== undefined) {
          const remainingQIds: string[] = [];
          for (let qIdx = 0; qIdx < data.questions.length; qIdx++) {
            const q = data.questions[qIdx];
            if (q.id) {
              remainingQIds.push(q.id);
              await this.updateQuestion(q.id, {
                prompt: q.prompt,
                display_order: q.display_order || (qIdx + 1),
                max_marks: 50
              });
            } else {
              const inserted = await this.createQuestion(effectiveAssessmentId, {
                prompt: q.prompt,
                display_order: q.display_order || (qIdx + 1),
                max_marks: 50
              });
              remainingQIds.push(inserted.id);
            }
          }
          if (remainingQIds.length > 0) {
            await this.client.from('questions')
              .delete()
              .eq('assessment_id', effectiveAssessmentId)
              .not('id', 'in', `(${remainingQIds.join(',')})`);
          } else {
            await this.client.from('questions')
              .delete()
              .eq('assessment_id', effectiveAssessmentId);
          }
        }

        // Reconcile assignment-level rubric
        if (data.rubric) {
          let { data: rv } = await this.client
            .from('rubric_versions')
            .select('*')
            .eq('assessment_id', effectiveAssessmentId)
            .maybeSingle();

          if (!rv) {
            const { data: newRv } = await this.client
              .from('rubric_versions')
              .insert({
                id: randomUUID(),
                assessment_id: effectiveAssessmentId,
                version: 1,
                title: data.rubric.title || 'Assignment Evaluation Rubric',
                created_by: callerId
              })
              .select()
              .single();
            rv = newRv;
          }

          if (rv && data.rubric.criteria) {
            await this.client.from('rubric_criteria').delete().eq('rubric_version_id', rv.id);
            const criteriaToInsert = data.rubric.criteria.map((c: any, cIdx: number) => ({
              id: c.id || randomUUID(),
              rubric_version_id: rv.id,
              title: (c.title || c.criterion_title || '').trim(),
              description: c.description || '',
              max_marks: Number(c.max_marks || c.max_score || 10),
              display_order: c.display_order || (cIdx + 1)
            }));
            if (criteriaToInsert.length > 0) {
              await this.client.from('rubric_criteria').insert(criteriaToInsert);
            }
          }
        }

        return this.getFullAssessment(effectiveAssessmentId);
      }

      throw new Error(`Failed to save draft assessment: ${error.message}`);
    }

    return this.getFullAssessment(result.assessment_id);
  }

  async createQuestion(assessmentId: string, data: any): Promise<Question> {
    this.assertStagingProject();
    const payload = {
      id: randomUUID(),
      assessment_id: assessmentId,
      prompt: data.prompt || data.title || '',
      max_marks: data.max_marks ?? 50,
      display_order: data.display_order || data.question_number || 1
    };

    const { data: inserted, error } = await this.client
      .from('questions')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(`Failed to create question: ${error.message}`);
    return inserted;
  }

  async updateQuestion(questionId: string, data: any): Promise<Question> {
    this.assertStagingProject();
    const { data: updated, error } = await this.client
      .from('questions')
      .update(data)
      .eq('id', questionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update question: ${error.message}`);
    return updated;
  }

  async saveRubric(questionId: string, rubricData: any, createdBy: string): Promise<any> {
    this.assertStagingProject();
    let { data: rubricVersion } = await this.client
      .from('rubric_versions')
      .select('*')
      .eq('question_id', questionId)
      .maybeSingle();

    if (!rubricVersion) {
      const { data: newRv, error: rvErr } = await this.client
        .from('rubric_versions')
        .insert({
          id: randomUUID(),
          question_id: questionId,
          version: 1,
          title: rubricData.title,
          created_by: createdBy
        })
        .select()
        .single();
      if (rvErr) throw new Error(`Failed to create rubric version: ${rvErr.message}`);
      rubricVersion = newRv;
    }

    await this.client.from('rubric_criteria').delete().eq('rubric_version_id', rubricVersion.id);

    const criteriaList: any[] = [];
    for (let cIdx = 0; cIdx < (rubricData.criteria || []).length; cIdx++) {
      const c = rubricData.criteria[cIdx];
      const { data: crit, error: critErr } = await this.client
        .from('rubric_criteria')
        .insert({
          id: randomUUID(),
          rubric_version_id: rubricVersion.id,
          title: c.title,
          description: c.description || '',
          max_marks: c.max_marks,
          display_order: c.display_order ?? cIdx + 1
        })
        .select()
        .single();

      if (critErr) throw new Error(`Failed to insert criterion: ${critErr.message}`);

      const levelsToInsert = (c.levels || []).map((lvl: any, lIdx: number) => ({
        id: randomUUID(),
        criterion_id: crit.id,
        label: lvl.level_name || lvl.label || `Level ${lIdx + 1}`,
        description: lvl.description || '',
        min_guidance: lvl.points ?? lvl.min_guidance ?? null,
        max_guidance: lvl.points ?? lvl.max_guidance ?? null,
        display_order: lvl.display_order ?? lIdx + 1
      }));

      if (levelsToInsert.length > 0) {
        await this.client.from('rubric_levels').insert(levelsToInsert);
      }

      criteriaList.push({ ...crit, levels: levelsToInsert });
    }

    return { ...rubricVersion, criteria: criteriaList };
  }

  async getDocumentBlob(storageKey: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(storageKey);

    if (error || !data) return null;

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = storageKey.split('/').pop() || 'document.pdf';
    return { buffer, mimeType: 'application/pdf', filename };
  }

  async isAuthorizedTeacher(userId: string, classSubjectId: string): Promise<boolean> {
    const { data } = await this.client
      .from('class_subjects')
      .select('id')
      .eq('id', classSubjectId)
      .eq('subject_teacher_id', userId)
      .eq('active', true)
      .maybeSingle();
    return Boolean(data);
  }

  async isClassTeacherForAssessment(userId: string, classSubjectId: string): Promise<boolean> {
    const { data: cs } = await this.client
      .from('class_subjects')
      .select('class_id')
      .eq('id', classSubjectId)
      .maybeSingle();

    if (!cs) return false;

    const { data: cls } = await this.client
      .from('classes')
      .select('*')
      .eq('id', cs.class_id)
      .maybeSingle();

    if (!cls) return false;
    if (cls.class_teacher_id === userId) return true;

    // Check allocations
    const { data: allocs } = await this.client
      .from('faculty_allocations')
      .select('*')
      .eq('faculty_id', userId);
    const memAllocs = db.faculty_allocations.filter(a => a.faculty_id === userId);
    const allTeacherAllocs = [...(allocs || []), ...memAllocs];

    return allTeacherAllocs.some(a =>
      (!a.programme_id || a.programme_id === cls.programme_id || (cls.programme && cls.programme === 'MCA')) &&
      (!a.semester || a.semester === cls.semester)
    );
  }

  async isEnrolledStudent(studentId: string, classSubjectId: string): Promise<boolean> {
    const { data: cs } = await this.client
      .from('class_subjects')
      .select('class_id, subject:subjects(specialization_id)')
      .eq('id', classSubjectId)
      .maybeSingle();

    if (!cs) return false;

    const subSpecId = (cs as any)?.subject?.specialization_id;

    const { data: en } = await this.client
      .from('enrollments')
      .select('id, specialization_id')
      .eq('class_id', cs.class_id)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle();

    if (!en) return false;

    if (subSpecId) {
      return Boolean(en.specialization_id && en.specialization_id === subSpecId);
    }

    return true;
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

let activeAssessmentRepoOverride: IAssessmentRepository | null = null;
let cachedSupabaseAssessmentRepo: SupabaseAssessmentRepository | null = null;
let cachedInMemoryAssessmentRepo: InMemoryAssessmentRepository | null = null;

export const setAssessmentRepositoryForTesting = (repo: IAssessmentRepository | null): void => {
  activeAssessmentRepoOverride = repo;
};

export const getAssessmentRepository = (): IAssessmentRepository => {
  if (activeAssessmentRepoOverride) return activeAssessmentRepoOverride;

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    if (!cachedInMemoryAssessmentRepo) cachedInMemoryAssessmentRepo = new InMemoryAssessmentRepository(db);
    return cachedInMemoryAssessmentRepo;
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    if (!cachedSupabaseAssessmentRepo) cachedSupabaseAssessmentRepo = new SupabaseAssessmentRepository(supabaseAdmin);
    return cachedSupabaseAssessmentRepo;
  }

  if (!cachedInMemoryAssessmentRepo) cachedInMemoryAssessmentRepo = new InMemoryAssessmentRepository(db);
  return cachedInMemoryAssessmentRepo;
};
