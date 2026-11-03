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

export interface IAssessmentRepository {
  getAssessmentById(id: string): Promise<Assessment | null>;
  getFullAssessment(id: string): Promise<any | null>;
  listAssessments(user: UserContext): Promise<any[]>;
  createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment>;
  updateAssessment(id: string, updates: Partial<Assessment> & { document_base64?: string }): Promise<Assessment>;
  hasRelatedStudentRecords(assessmentId: string): Promise<{
    hasRecords: boolean;
    submissionsCount: number;
    evaluationsCount: number;
    isPublished: boolean;
  }>;
  deleteAssessment(id: string): Promise<void>;
  publishAssessment(id: string, publishedBy: string): Promise<Assessment>;
  createQuestion(assessmentId: string, data: any): Promise<Question>;
  updateQuestion(questionId: string, data: any): Promise<Question>;
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

    const cs = this.inMemoryDb.classSubjects.find(c => c.id === assessment.class_subject_id);
    const cls = cs ? this.inMemoryDb.classes.find(c => c.id === cs.class_id) : null;
    const sub = cs ? this.inMemoryDb.subjects.find(s => s.id === cs.subject_id) : null;

    return {
      ...assessment,
      class_details: cls ? formatClassName(cls) : 'Unknown Class',
      subject_details: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
      questions
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
      const studentClasses = this.inMemoryDb.enrollments
        .filter(e => e.student_id === user.profile.id && e.status === 'active')
        .map(e => e.class_id);
      const studentCS = this.inMemoryDb.classSubjects
        .filter(cs => studentClasses.includes(cs.class_id) && cs.active)
        .map(cs => cs.id);
      list = this.inMemoryDb.assessments.filter(a => a.status === 'published' && studentCS.includes(a.class_subject_id));
    } else {
      list = [];
    }

    const full = await Promise.all(list.map(a => this.getFullAssessment(a.id)));
    return full.filter(Boolean);
  }

  async createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment> {
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

  async publishAssessment(id: string, publishedBy: string): Promise<Assessment> {
    return this.updateAssessment(id, {
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: publishedBy
    });
  }

  async createQuestion(assessmentId: string, data: any): Promise<Question> {
    const q: Question = {
      id: randomUUID(),
      assessment_id: assessmentId,
      prompt: data.prompt || data.title || '',
      max_marks: data.max_marks,
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
    return this.inMemoryDb.enrollments.some(
      e => e.class_id === cs.class_id && e.student_id === studentId && e.status === 'active'
    );
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

    const { data: questions } = await this.client
      .from('questions')
      .select('*')
      .eq('assessment_id', id)
      .order('display_order', { ascending: true });

    const fullQuestions = await Promise.all((questions || []).map(async q => {
      const { data: rv } = await this.client
        .from('rubric_versions')
        .select('*')
        .eq('question_id', q.id)
        .maybeSingle();

      if (!rv) return { ...q, rubric: null };

      const { data: criteria } = await this.client
        .from('rubric_criteria')
        .select('*')
        .eq('rubric_version_id', rv.id)
        .order('display_order', { ascending: true });

      const fullCriteria = await Promise.all((criteria || []).map(async rc => {
        const { data: levels } = await this.client
          .from('rubric_levels')
          .select('*')
          .eq('criterion_id', rc.id)
          .order('display_order', { ascending: true });
        return { ...rc, levels: levels || [] };
      }));

      return { ...q, rubric: { ...rv, criteria: fullCriteria } };
    }));

    const { data: cs } = await this.client
      .from('class_subjects')
      .select('id, class_id, subject_id')
      .eq('id', assessment.class_subject_id)
      .maybeSingle();

    let classDetails = 'Unknown Class';
    let subjectDetails = 'Unknown Subject';

    if (cs) {
      const { data: cls } = await this.client
        .from('classes')
        .select('programme, semester, section')
        .eq('id', cs.class_id)
        .maybeSingle();
      if (cls) classDetails = formatClassName(cls);

      const { data: sub } = await this.client
        .from('subjects')
        .select('code, name')
        .eq('id', cs.subject_id)
        .maybeSingle();
      if (sub) subjectDetails = `${sub.code} - ${sub.name}`;
    }

    return {
      ...assessment,
      class_details: classDetails,
      subject_details: subjectDetails,
      questions: fullQuestions
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
        .select('class_id')
        .eq('student_id', user.profile.id)
        .eq('status', 'active');
      const classIds = (enrollments || []).map(e => e.class_id);
      if (classIds.length === 0) return [];

      const { data: studentCS } = await this.client
        .from('class_subjects')
        .select('id')
        .in('class_id', classIds)
        .eq('active', true);
      const csIds = (studentCS || []).map(c => c.id);
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

  async createAssessment(data: CreateAssessmentRequest, createdBy: string): Promise<Assessment> {
    this.assertStagingProject();
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
      max_marks: data.max_marks || 100
    };

    const { data: inserted, error: insertError } = await this.client
      .from('assessments')
      .insert(payload)
      .select()
      .single();

    if (insertError) {
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
    this.assertStagingProject();

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

  async publishAssessment(id: string, publishedBy: string): Promise<Assessment> {
    return this.updateAssessment(id, {
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: publishedBy
    });
  }

  async createQuestion(assessmentId: string, data: any): Promise<Question> {
    this.assertStagingProject();
    const payload = {
      id: randomUUID(),
      assessment_id: assessmentId,
      prompt: data.prompt || data.title || '',
      max_marks: data.max_marks,
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
      .select('class_id')
      .eq('id', classSubjectId)
      .maybeSingle();

    if (!cs) return false;

    const { data: en } = await this.client
      .from('enrollments')
      .select('id')
      .eq('class_id', cs.class_id)
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle();

    return Boolean(en);
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

let activeAssessmentRepoOverride: IAssessmentRepository | null = null;

export const setAssessmentRepositoryForTesting = (repo: IAssessmentRepository | null): void => {
  activeAssessmentRepoOverride = repo;
};

export const getAssessmentRepository = (): IAssessmentRepository => {
  if (activeAssessmentRepoOverride) return activeAssessmentRepoOverride;

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    return new SupabaseAssessmentRepository(supabaseAdmin);
  }

  return new InMemoryAssessmentRepository(db);
};
