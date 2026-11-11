import { 
  Submission, 
  SubmissionVersion,
  SubmissionReceipt,
  SubmissionFile,
  formatClassName,
  MenteeHierarchyItem,
  MenteeSubjectItem,
  MenteeAssessmentItem,
  ProctorSubjectHierarchyItem,
  ProctorSubjectAssessmentItem,
  ProctorAssessmentStudentItem
} from '@smartfa/contracts';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { UserContext } from '../authorization/rbac.js';
import { db, InMemoryDatabase } from './db.js';

export interface ISubmissionRepository {
  getSubmissionById(id: string): Promise<Submission | null>;
  getFullSubmission(id: string): Promise<any | null>;
  getSubmissionByAssessmentAndStudent(assessmentId: string, studentId: string): Promise<Submission | null>;
  getActiveVersion(submissionId: string): Promise<SubmissionVersion | null>;
  getSubmissionVersions(submissionId: string): Promise<SubmissionVersion[]>;
  getDraftSubmission(assessmentId: string, studentId: string): Promise<any | null>;
  saveDraftSubmission(assessmentId: string, studentId: string, answers: any[]): Promise<any>;
  deleteDraftSubmission(assessmentId: string, studentId: string): Promise<void>;
  createOrUpdateSubmission(params: {
    assessmentId: string;
    studentId: string;
    answers?: Array<{ question_id: string; answer_text: string }>;
    files: Array<any>;
    serverTime: Date;
    lateStatus: 'on_time' | 'late';
  }): Promise<{ submission: Submission; version: SubmissionVersion; receipt: SubmissionReceipt }>;
  listSubmissionsForAssessment(assessmentId: string): Promise<any[]>;
  listSubmissionsForStudent(studentId: string): Promise<any[]>;
  getLateSubmissionsReport(user: UserContext, assessmentIdFilter?: string): Promise<any[]>;
  getMenteeSubmissionsHierarchy(proctorId: string): Promise<MenteeHierarchyItem[]>;
  getProctorSubjectsHierarchy(proctorId: string): Promise<ProctorSubjectHierarchyItem[]>;
  downloadSubmissionFile(storagePath: string): Promise<{ buffer: Buffer; mimeType: string } | null>;
  getSignedSubmissionFileUrl(storageKey: string, expiresInSeconds?: number): Promise<string | null>;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

/**
 * Transforms a mentee-centric hierarchy (Mentee -> Subjects -> Assessments)
 * into a subject-first hierarchy (Subject -> Assessments -> Students)
 * for Proctor Mentee Submissions Monitoring.
 */
export function transformMenteesToSubjectsHierarchy(mentees: MenteeHierarchyItem[]): ProctorSubjectHierarchyItem[] {
  const subjectsMap = new Map<string, {
    subject_id: string;
    subject_code: string;
    subject_name: string;
    class_subject_id: string;
    credits?: number;
    assessmentsMap: Map<string, {
      assessment_id: string;
      title: string;
      instructions?: string;
      deadline_at: string;
      extension_deadline_at?: string | null;
      allow_late: boolean;
      max_marks: number;
      students: ProctorAssessmentStudentItem[];
    }>;
  }>();

  for (const mentee of mentees) {
    for (const sub of mentee.subjects) {
      let subjEntry = subjectsMap.get(sub.subject_id);
      if (!subjEntry) {
        subjEntry = {
          subject_id: sub.subject_id,
          subject_code: sub.subject_code,
          subject_name: sub.subject_name,
          class_subject_id: sub.class_subject_id,
          credits: sub.credits,
          assessmentsMap: new Map()
        };
        subjectsMap.set(sub.subject_id, subjEntry);
      }

      for (const ass of sub.assessments) {
        let assEntry = subjEntry.assessmentsMap.get(ass.assessment_id);
        if (!assEntry) {
          assEntry = {
            assessment_id: ass.assessment_id,
            title: ass.title,
            instructions: ass.instructions,
            deadline_at: ass.deadline_at,
            extension_deadline_at: ass.extension_deadline_at,
            allow_late: ass.allow_late,
            max_marks: ass.max_marks,
            students: []
          };
          subjEntry.assessmentsMap.set(ass.assessment_id, assEntry);
        }

        assEntry.students.push({
          student_id: mentee.student_id,
          student_name: mentee.student_name,
          student_email: mentee.student_email,
          student_usn: mentee.student_usn,
          programme: mentee.programme,
          semester: mentee.semester,
          section: mentee.section,
          specialization_name: mentee.specialization_name,
          is_submitted: ass.is_submitted,
          submission_id: ass.submission_id,
          submitted_at: ass.submitted_at,
          is_late: ass.is_late,
          timing_status: ass.timing_status,
          late_status: ass.late_status,
          evaluation_status: ass.evaluation_status,
          evaluation_status_label: ass.evaluation_status_label,
          published_score: ass.published_score,
          files_count: ass.files_count
        });
      }
    }
  }

  const result: ProctorSubjectHierarchyItem[] = [];

  for (const subj of subjectsMap.values()) {
    const assessments: ProctorSubjectAssessmentItem[] = [];
    for (const ass of subj.assessmentsMap.values()) {
      ass.students.sort((a, b) => a.student_name.localeCompare(b.student_name));

      const submittedCount = ass.students.filter(s => s.is_submitted).length;
      const pendingCount = ass.students.filter(s => !s.is_submitted).length;

      assessments.push({
        assessment_id: ass.assessment_id,
        title: ass.title,
        instructions: ass.instructions,
        deadline_at: ass.deadline_at,
        extension_deadline_at: ass.extension_deadline_at,
        allow_late: ass.allow_late,
        max_marks: ass.max_marks,
        total_mentees: ass.students.length,
        submitted_count: submittedCount,
        pending_count: pendingCount,
        students: ass.students
      });
    }

    assessments.sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime());

    result.push({
      subject_id: subj.subject_id,
      subject_code: subj.subject_code,
      subject_name: subj.subject_name,
      class_subject_id: subj.class_subject_id,
      credits: subj.credits,
      total_assessments: assessments.length,
      assessments
    });
  }

  result.sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  return result;
}

export class InMemorySubmissionRepository implements ISubmissionRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async getSubmissionById(id: string): Promise<Submission | null> {
    const found = this.inMemoryDb.submissions.find(s => s.id === id);
    return found ? { ...found } : null;
  }

  async getFullSubmission(id: string): Promise<any | null> {
    const submission = await this.getSubmissionById(id);
    if (!submission) return null;

    const activeVersion = this.inMemoryDb.submissionVersions.find(v => v.id === submission.active_version_id);
    const versions = this.inMemoryDb.submissionVersions
      .filter(v => v.submission_id === submission.id)
      .sort((a, b) => a.version - b.version);
    const evaluation = this.inMemoryDb.evaluations.find(e => e.submission_id === submission.id);

    return {
      ...submission,
      active_version: activeVersion || null,
      versions,
      evaluation: evaluation || null
    };
  }

  async getSubmissionByAssessmentAndStudent(assessmentId: string, studentId: string): Promise<Submission | null> {
    const found = this.inMemoryDb.submissions.find(
      s => s.assessment_id === assessmentId && s.student_id === studentId
    );
    return found ? { ...found } : null;
  }

  async getActiveVersion(submissionId: string): Promise<SubmissionVersion | null> {
    const sub = await this.getSubmissionById(submissionId);
    if (!sub || !sub.active_version_id) return null;
    const v = this.inMemoryDb.submissionVersions.find(ver => ver.id === sub.active_version_id);
    return v ? { ...v } : null;
  }

  async getSubmissionVersions(submissionId: string): Promise<SubmissionVersion[]> {
    return this.inMemoryDb.submissionVersions
      .filter(v => v.submission_id === submissionId)
      .sort((a, b) => a.version - b.version);
  }

  async getDraftSubmission(assessmentId: string, studentId: string): Promise<any | null> {
    const draft = this.inMemoryDb.studentSubmissionDrafts.find(
      d => d.assessment_id === assessmentId && d.student_id === studentId
    );
    return draft ? { ...draft } : null;
  }

  async saveDraftSubmission(assessmentId: string, studentId: string, answers: any[]): Promise<any> {
    const nowIso = new Date().toISOString();
    let draft = this.inMemoryDb.studentSubmissionDrafts.find(
      d => d.assessment_id === assessmentId && d.student_id === studentId
    );
    if (draft) {
      draft.answers = answers;
      draft.updated_at = nowIso;
    } else {
      draft = {
        id: randomUUID(),
        assessment_id: assessmentId,
        student_id: studentId,
        answers,
        created_at: nowIso,
        updated_at: nowIso
      };
      this.inMemoryDb.studentSubmissionDrafts.push(draft);
    }
    return { ...draft };
  }

  async deleteDraftSubmission(assessmentId: string, studentId: string): Promise<void> {
    const idx = this.inMemoryDb.studentSubmissionDrafts.findIndex(
      d => d.assessment_id === assessmentId && d.student_id === studentId
    );
    if (idx !== -1) {
      this.inMemoryDb.studentSubmissionDrafts.splice(idx, 1);
    }
  }

  async createOrUpdateSubmission(params: {
    assessmentId: string;
    studentId: string;
    answers?: Array<{ question_id: string; answer_text: string }>;
    files?: Array<any>;
    serverTime?: Date;
    lateStatus?: 'on_time' | 'late';
  }): Promise<{ submission: Submission; version: SubmissionVersion; receipt: SubmissionReceipt }> {
    const nowIso = (params.serverTime ? new Date(params.serverTime) : new Date()).toISOString();
    const files = params.files || [];
    const lateStatus = params.lateStatus || 'on_time';

    if (this.inMemoryDb.resultPublications.some(rp => rp.assessment_id === params.assessmentId)) {
      throw new Error('Submissions are closed: Results have already been published for this assessment');
    }

    let submission = this.inMemoryDb.submissions.find(
      s => s.assessment_id === params.assessmentId && s.student_id === params.studentId
    );

    const isResubmission = Boolean(submission);
    const submissionId = submission ? submission.id : randomUUID();

    const existingVersions = this.inMemoryDb.submissionVersions.filter(v => v.submission_id === submissionId);
    const newVersionNumber = existingVersions.length + 1;
    const versionId = randomUUID();

    const uploadedFilesMeta: SubmissionFile[] = (params.files || []).map(f => {
      if (f.storage_key) {
        return f as SubmissionFile;
      }
      const storagePath = `submissions/${submissionId}/${newVersionNumber}/${f.file_name}`;
      this.inMemoryDb.storageBlobs.set(storagePath, f.buffer);
      return {
        id: randomUUID(),
        storage_key: storagePath,
        original_filename: f.file_name,
        file_size_bytes: f.file_size,
        mime_type: f.mime_type,
        sha256: f.sha256,
        uploaded_at: nowIso
      };
    });

    const primaryFile = uploadedFilesMeta.length > 0 ? uploadedFilesMeta[0] : null;
    const totalBytes = uploadedFilesMeta.reduce((sum, f) => sum + f.file_size_bytes, 0);

    const submissionVersion: SubmissionVersion = {
      id: versionId,
      submission_id: submissionId,
      version: newVersionNumber,
      storage_path: primaryFile ? primaryFile.storage_key : null,
      original_name: primaryFile ? primaryFile.original_filename : null,
      mime_type: primaryFile ? primaryFile.mime_type : null,
      size_bytes: totalBytes,
      sha256: primaryFile?.sha256 || null,
      uploaded_at: nowIso,
      superseded_at: null,
      files: uploadedFilesMeta,
      answers: params.answers || [],
      late_status: lateStatus
    };

    if (submission) {
      submission.active_version_id = versionId;
      submission.status = 'uploaded';
      submission.late_status = lateStatus;
      submission.updated_at = nowIso;
    } else {
      submission = {
        id: submissionId,
        assessment_id: params.assessmentId,
        question_id: null,
        student_id: params.studentId,
        active_version_id: versionId,
        status: 'uploaded',
        first_submitted_at: nowIso,
        updated_at: nowIso,
        late_status: lateStatus
      };
      this.inMemoryDb.submissions.push(submission);
    }

    this.inMemoryDb.submissionVersions.push(submissionVersion);

    // Clean up draft upon submission
    await this.deleteDraftSubmission(params.assessmentId, params.studentId);

    const receipt: SubmissionReceipt = {
      submission_id: submissionId,
      version_id: versionId,
      version: newVersionNumber,
      status: 'uploaded',
      late_status: params.lateStatus,
      sha256: primaryFile?.sha256 || null,
      size_bytes: totalBytes,
      file_count: uploadedFilesMeta.length,
      files: uploadedFilesMeta,
      answers: params.answers || [],
      answers_count: (params.answers || []).length,
      uploaded_at: nowIso,
      is_resubmission: isResubmission,
      storage_path: primaryFile ? primaryFile.storage_key : null
    };

    return { submission, version: submissionVersion, receipt };
  }

  async listSubmissionsForAssessment(assessmentId: string): Promise<any[]> {
    const list = this.inMemoryDb.submissions.filter(s => s.assessment_id === assessmentId);
    return Promise.all(list.map(s => this.getFullSubmission(s.id)));
  }

  async getMenteeSubmissionsHierarchy(proctorId: string): Promise<MenteeHierarchyItem[]> {
    const activeAssignments = this.inMemoryDb.proctorAssignments.filter(
      pa => pa.proctor_id === proctorId && !pa.valid_to
    );
    const menteeIds = activeAssignments.map(pa => pa.student_id);
    if (menteeIds.length === 0) return [];

    const result: MenteeHierarchyItem[] = [];

    for (const menteeId of menteeIds) {
      const studentProfile = this.inMemoryDb.profiles.find(p => p.id === menteeId);
      if (!studentProfile) continue;

      const enrollment = this.inMemoryDb.enrollments.find(
        e => e.student_id === menteeId && e.status === 'active'
      );
      if (!enrollment) continue;

      const cls = this.inMemoryDb.classes.find(c => c.id === enrollment.class_id);
      if (!cls) continue;

      const spec = enrollment.specialization_id
        ? this.inMemoryDb.specializations?.find(s => s.id === enrollment.specialization_id)
        : null;
      const specName = spec?.name || (enrollment.specialization_id ? 'Specialized' : 'General');
      const specCode = spec?.code || null;

      const classSubjects = this.inMemoryDb.classSubjects.filter(
        cs => cs.class_id === cls.id && cs.active
      );

      const subjectItems: MenteeSubjectItem[] = [];

      for (const cs of classSubjects) {
        const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
        if (!sub) continue;

        const subSpecId = (sub as any).specialization_id;
        const studentSpecId = enrollment.specialization_id;

        if (subSpecId) {
          if (!studentSpecId || studentSpecId !== subSpecId) {
            continue;
          }
        }

        const publishedAssessments = this.inMemoryDb.assessments.filter(
          a => a.class_subject_id === cs.id && a.status === 'published'
        );

        const assessmentItems: MenteeAssessmentItem[] = [];

        for (const ass of publishedAssessments) {
          const subRec = this.inMemoryDb.submissions.find(
            s => s.assessment_id === ass.id && s.student_id === menteeId
          );
          const verRec = subRec?.active_version_id
            ? this.inMemoryDb.submissionVersions.find(v => v.id === subRec.active_version_id)
            : null;
          const evalRec = subRec
            ? this.inMemoryDb.evaluations.find(e => e.submission_id === subRec.id)
            : null;
          const isPublished = this.inMemoryDb.resultPublications.some(
            rp => rp.assessment_id === ass.id
          );

          const isSubmitted = Boolean(subRec);
          const isLate = Boolean(subRec?.late_status === 'late' || verRec?.late_status === 'late');

          let evalStatus: 'not_submitted' | 'pending' | 'under_evaluation' | 'completed' | 'published' = 'not_submitted';
          let evalLabel: 'Pending' | 'Pending Evaluation' | 'Evaluated' | 'Published' = 'Pending';
          let pubScore: number | null = null;

          if (isSubmitted) {
            if (isPublished || evalRec?.status === 'published') {
              evalStatus = 'published';
              evalLabel = 'Published';
              pubScore = evalRec?.total_score ?? null;
            } else if (evalRec?.status === 'completed') {
              evalStatus = 'completed';
              evalLabel = 'Evaluated';
              pubScore = null;
            } else if (evalRec?.status === 'draft') {
              evalStatus = 'under_evaluation';
              evalLabel = 'Pending Evaluation';
              pubScore = null;
            } else {
              evalStatus = 'pending';
              evalLabel = 'Pending Evaluation';
              pubScore = null;
            }
          }

          assessmentItems.push({
            assessment_id: ass.id,
            title: ass.title,
            instructions: ass.instructions,
            deadline_at: ass.deadline_at,
            extension_deadline_at: ass.extension_deadline_at || null,
            allow_late: Boolean(ass.allow_late),
            max_marks: Number(ass.max_marks || 50),
            is_submitted: isSubmitted,
            submission_id: subRec?.id || null,
            submitted_at: verRec?.uploaded_at || subRec?.first_submitted_at || null,
            is_late: isLate,
            timing_status: isSubmitted ? (isLate ? 'Late' : 'On Time') : '—',
            late_status: subRec?.late_status || (isSubmitted ? 'on_time' : 'not_submitted'),
            evaluation_status: evalStatus,
            evaluation_status_label: evalLabel,
            published_score: pubScore,
            files_count: verRec?.files?.length || (verRec ? 1 : 0)
          });
        }

        const totalAss = assessmentItems.length;
        const submittedCount = assessmentItems.filter(a => a.is_submitted).length;
        const pendingCount = totalAss - submittedCount;
        const lateCount = assessmentItems.filter(a => a.is_submitted && a.is_late).length;
        const evaluatedCount = assessmentItems.filter(a => a.evaluation_status === 'completed' || a.evaluation_status === 'published').length;

        subjectItems.push({
          subject_id: sub.id,
          subject_code: sub.code,
          subject_name: sub.name,
          class_subject_id: cs.id,
          credits: sub.credits,
          specialization_id: subSpecId || null,
          specialization_name: specName,
          total_assessments: totalAss,
          submitted_count: submittedCount,
          pending_count: pendingCount,
          late_count: lateCount,
          evaluated_count: evaluatedCount,
          assessments: assessmentItems
        });
      }

      const totalStudentAss = subjectItems.reduce((acc, s) => acc + s.total_assessments, 0);
      const totalSubmitted = subjectItems.reduce((acc, s) => acc + s.submitted_count, 0);
      const totalPending = subjectItems.reduce((acc, s) => acc + s.pending_count, 0);
      const totalLate = subjectItems.reduce((acc, s) => acc + s.late_count, 0);
      const totalEvaluated = subjectItems.reduce((acc, s) => acc + s.evaluated_count, 0);

      result.push({
        student_id: studentProfile.id,
        student_name: studentProfile.full_name,
        student_email: studentProfile.email,
        student_usn: studentProfile.usn || 'N/A',
        programme: cls.programme || 'MCA',
        semester: Number(cls.semester || 1),
        section: cls.section || 'A',
        class_id: cls.id,
        class_name: formatClassName(cls),
        specialization_id: enrollment.specialization_id || null,
        specialization_code: specCode,
        specialization_name: specName,
        subjects_count: subjectItems.length,
        total_assessments: totalStudentAss,
        submitted_count: totalSubmitted,
        pending_count: totalPending,
        late_count: totalLate,
        evaluated_count: totalEvaluated,
        subjects: subjectItems
      });
    }

    return result;
  }

  async getProctorSubjectsHierarchy(proctorId: string): Promise<ProctorSubjectHierarchyItem[]> {
    const mentees = await this.getMenteeSubmissionsHierarchy(proctorId);
    return transformMenteesToSubjectsHierarchy(mentees);
  }

  async getLateSubmissionsReport(user: UserContext, assessmentIdFilter?: string): Promise<any[]> {
    const effectiveRole = user.activeRole || (
      user.isHOD ? 'hod' :
      user.roles.includes('subject_teacher') ? 'subject_teacher' :
      user.roles.includes('class_teacher') ? 'class_teacher' :
      user.roles.includes('proctor') ? 'proctor' :
      user.roles[0]
    );

    if (effectiveRole === 'proctor') {
      const hierarchy = await this.getMenteeSubmissionsHierarchy(user.profile.id);
      const rows: any[] = [];
      for (const mentee of hierarchy) {
        for (const sub of mentee.subjects) {
          for (const ass of sub.assessments) {
            rows.push({
              submission_id: ass.submission_id || null,
              assessment_id: ass.assessment_id,
              assessment_title: ass.title,
              class_id: mentee.class_id,
              class_name: mentee.class_name,
              programme: mentee.programme,
              semester: mentee.semester,
              specialization_id: mentee.specialization_id,
              specialization_name: mentee.specialization_name,
              subject_id: sub.subject_id,
              subject_code: sub.subject_code,
              subject_name: `${sub.subject_code} - ${sub.subject_name}`,
              student_id: mentee.student_id,
              student_name: mentee.student_name,
              student_email: mentee.student_email,
              student_usn: mentee.student_usn,
              original_deadline: ass.deadline_at,
              extension_deadline: ass.extension_deadline_at,
              deadline_at: ass.deadline_at,
              extension_deadline_at: ass.extension_deadline_at,
              is_submitted: ass.is_submitted,
              submission_status: ass.is_submitted ? 'Submitted' : 'Pending',
              submitted_at: ass.submitted_at,
              is_late: ass.is_late,
              timing_status: ass.timing_status,
              late_status: ass.late_status,
              penalty_marks: 0,
              raw_score: null,
              final_score: ass.published_score,
              published_score: ass.published_score,
              evaluation_status: ass.evaluation_status,
              evaluation_status_label: ass.evaluation_status_label,
              is_published: ass.evaluation_status === 'published',
              feedback: null,
              files_count: ass.files_count || 0
            });
          }
        }
      }
      if (assessmentIdFilter) {
        return rows.filter(r => r.assessment_id === assessmentIdFilter);
      }
      return rows;
    }

    let scopedAssessments = [...this.inMemoryDb.assessments];

    if (effectiveRole === 'hod' || (user.isHOD && !user.activeRole)) {
      // HOD sees all
    } else if (effectiveRole === 'subject_teacher') {
      const assignedClassSubjectIds = this.inMemoryDb.classSubjects
        .filter(cs => cs.subject_teacher_id === user.profile.id && cs.active)
        .map(cs => cs.id);
      scopedAssessments = scopedAssessments.filter(a => assignedClassSubjectIds.includes(a.class_subject_id));
    } else if (effectiveRole === 'class_teacher') {
      const assignedClassIds = new Set<string>(
        this.inMemoryDb.classes
          .filter(c => c.class_teacher_id === user.profile.id)
          .map(c => c.id)
      );

      // Check allocations
      const allocations = this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === user.profile.id);
      if (allocations.length > 0) {
        this.inMemoryDb.classes
          .filter(c =>
            allocations.some(a =>
              (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
              (!a.semester || a.semester === c.semester)
            )
          )
          .forEach(c => assignedClassIds.add(c.id));
      }

      const allowedClasses = Array.from(assignedClassIds);
      const classSubjectIds = this.inMemoryDb.classSubjects
        .filter(cs => allowedClasses.includes(cs.class_id) && cs.active)
        .map(cs => cs.id);
      scopedAssessments = scopedAssessments.filter(a => classSubjectIds.includes(a.class_subject_id));
    }

    if (assessmentIdFilter) {
      scopedAssessments = scopedAssessments.filter(a => a.id === assessmentIdFilter);
    }

    const reportRows: any[] = [];
    for (const assessment of scopedAssessments) {
      const cs = this.inMemoryDb.classSubjects.find(c => c.id === assessment.class_subject_id);
      const cls = cs ? this.inMemoryDb.classes.find(c => c.id === cs.class_id) : null;
      const sub = cs ? this.inMemoryDb.subjects.find(s => s.id === cs.subject_id) : null;
      if (!cs || !cls) continue;

      const enrolledStudents = this.inMemoryDb.enrollments
        .filter(e => e.class_id === cs.class_id && e.status === 'active')
        .map(e => this.inMemoryDb.profiles.find(p => p.id === e.student_id))
        .filter(Boolean);

      for (const student of enrolledStudents) {
        if (!student) continue;
        const submission = this.inMemoryDb.submissions.find(
          s => s.assessment_id === assessment.id && s.student_id === student.id
        );
        const version = submission?.active_version_id
          ? this.inMemoryDb.submissionVersions.find(v => v.id === submission.active_version_id)
          : null;
        const evaluation = submission ? this.inMemoryDb.evaluations.find(e => e.submission_id === submission.id) : null;

        const isLate = Boolean(submission?.late_status === 'late' || version?.late_status === 'late');
        const isSubmitted = Boolean(submission);
        const isAssessmentPublished = this.inMemoryDb.resultPublications.some(rp => rp.assessment_id === assessment.id);
        const isScoreDisclosable = isAssessmentPublished || evaluation?.status === 'published';

        reportRows.push({
          submission_id: submission?.id || null,
          assessment_id: assessment.id,
          assessment_title: assessment.title,
          class_id: cls.id,
          class_name: formatClassName(cls),
          subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
          student_id: student.id,
          student_name: student.full_name,
          student_email: student.email,
          student_usn: student.usn || 'N/A',
          original_deadline: assessment.deadline_at,
          extension_deadline: assessment.extension_deadline_at || null,
          deadline_at: assessment.deadline_at,
          extension_deadline_at: assessment.extension_deadline_at || null,
          is_submitted: isSubmitted,
          submission_status: isSubmitted ? 'Submitted' : 'Not Submitted',
          submitted_at: version?.uploaded_at || submission?.first_submitted_at || null,
          is_late: isLate,
          timing_status: isSubmitted ? (isLate ? 'Late' : 'On Time') : '—',
          late_status: submission?.late_status || 'not_submitted',
          penalty_marks: evaluation ? Number(evaluation.late_penalty_deducted) : (isLate ? Number(assessment.late_penalty_marks || 0) : 0),
          raw_score: isScoreDisclosable ? evaluation?.raw_score ?? null : null,
          final_score: isScoreDisclosable ? evaluation?.total_score ?? null : null,
          published_score: isScoreDisclosable && evaluation?.total_score !== undefined ? evaluation.total_score : null,
          evaluation_status: evaluation ? (evaluation.status === 'published' ? 'published' : evaluation.status) : (isSubmitted ? 'pending' : 'not_submitted'),
          is_published: isAssessmentPublished,
          feedback: isScoreDisclosable ? evaluation?.general_feedback || null : null,
          files_count: version?.files?.length || (version ? 1 : 0)
        });
      }
    }

    return reportRows;
  }

  async listSubmissionsForStudent(studentId: string): Promise<any[]> {
    const list = this.inMemoryDb.submissions.filter(s => s.student_id === studentId);
    return Promise.all(list.map(s => this.getFullSubmission(s.id)));
  }

  async downloadSubmissionFile(storagePath: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const buf = this.inMemoryDb.storageBlobs.get(storagePath);
    if (!buf) return null;
    return { buffer: buf, mimeType: 'application/octet-stream' };
  }

  async getSignedSubmissionFileUrl(storageKey: string): Promise<string | null> {
    return null;
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'in_memory_mock';
  }
}

export class SupabaseSubmissionRepository implements ISubmissionRepository {
  private bucketName = process.env.STORAGE_BUCKET_SUBMISSIONS || 'submissions-private';

  constructor(private client: SupabaseClient) {}

  private assertStagingProject(): void {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    if (url.includes('rdfloxppwlbocxplbixu') && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production') {
      throw new Error('SECURITY VIOLATION: Writes to production project rdfloxppwlbocxplbixu are strictly forbidden in non-production mode!');
    }
  }

  async getSubmissionById(id: string): Promise<Submission | null> {
    const { data, error } = await this.client
      .from('submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to get submission: ${error.message}`);
    return data || null;
  }

  async getFullSubmission(id: string): Promise<any | null> {
    const submission = await this.getSubmissionById(id);
    if (!submission) return null;

    let activeVersion: SubmissionVersion | null = null;
    if (submission.active_version_id) {
      const { data: v } = await this.client
        .from('submission_versions')
        .select('*')
        .eq('id', submission.active_version_id)
        .maybeSingle();
      activeVersion = v || null;
    }

    const { data: allVersions } = await this.client
      .from('submission_versions')
      .select('*')
      .eq('submission_id', submission.id)
      .order('version', { ascending: true });

    const { data: evaluation } = await this.client
      .from('evaluations')
      .select('*')
      .eq('submission_id', submission.id)
      .maybeSingle();

    return {
      ...submission,
      active_version: activeVersion,
      versions: allVersions || [],
      evaluation: evaluation || null
    };
  }

  async getSubmissionVersions(submissionId: string): Promise<SubmissionVersion[]> {
    const { data, error } = await this.client
      .from('submission_versions')
      .select('*')
      .eq('submission_id', submissionId)
      .order('version', { ascending: true });
    if (error) throw new Error(`Failed to get submission versions: ${error.message}`);
    return data || [];
  }

  async getDraftSubmission(assessmentId: string, studentId: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('student_submission_drafts')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) {
      // If table doesn't exist yet in a mock or unmigrated DB, fail gracefully
      console.warn('getDraftSubmission error (ignorable if pre-migration):', error.message);
      return null;
    }
    return data || null;
  }

  async saveDraftSubmission(assessmentId: string, studentId: string, answers: any[]): Promise<any> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.client
      .from('student_submission_drafts')
      .upsert({
        assessment_id: assessmentId,
        student_id: studentId,
        answers,
        updated_at: nowIso
      }, {
        onConflict: 'assessment_id,student_id'
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to save draft: ${error.message}`);
    return data;
  }

  async deleteDraftSubmission(assessmentId: string, studentId: string): Promise<void> {
    const { error } = await this.client
      .from('student_submission_drafts')
      .delete()
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId);
    if (error) {
      console.warn('deleteDraftSubmission error (ignorable):', error.message);
    }
  }

  async getSubmissionByAssessmentAndStudent(assessmentId: string, studentId: string): Promise<Submission | null> {
    const { data, error } = await this.client
      .from('submissions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) throw new Error(`Failed to find submission: ${error.message}`);
    return data || null;
  }

  async getActiveVersion(submissionId: string): Promise<SubmissionVersion | null> {
    const sub = await this.getSubmissionById(submissionId);
    if (!sub || !sub.active_version_id) return null;

    const { data, error } = await this.client
      .from('submission_versions')
      .select('*')
      .eq('id', sub.active_version_id)
      .maybeSingle();

    if (error) throw new Error(`Failed to get active version: ${error.message}`);
    return data || null;
  }

  async createOrUpdateSubmission(params: {
    assessmentId: string;
    studentId: string;
    answers?: Array<{ question_id: string; answer_text: string }>;
    files: Array<any>;
    serverTime: Date;
    lateStatus: 'on_time' | 'late';
  }): Promise<{ submission: Submission; version: SubmissionVersion; receipt: SubmissionReceipt }> {
    this.assertStagingProject();
    const nowIso = params.serverTime.toISOString();

    let submission = await this.getSubmissionByAssessmentAndStudent(params.assessmentId, params.studentId);
    const isResubmission = Boolean(submission);
    const submissionId = submission ? submission.id : randomUUID();

    const { count } = await this.client
      .from('submission_versions')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);

    const newVersionNumber = (count || 0) + 1;
    const versionId = randomUUID();

    const uploadedFilesMeta: SubmissionFile[] = [];
    for (const f of (params.files || [])) {
      if ((f as any).storage_key) {
        uploadedFilesMeta.push(f as SubmissionFile);
        continue;
      }

      const storagePath = `submissions/${submissionId}/${newVersionNumber}/${f.file_name}`;
      const { error: uploadError } = await this.client.storage
        .from(this.bucketName)
        .upload(storagePath, f.buffer, {
          contentType: f.mime_type,
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Failed to upload submission file '${f.file_name}' to storage: ${uploadError.message}`);
      }

      uploadedFilesMeta.push({
        id: randomUUID(),
        storage_key: storagePath,
        original_filename: f.file_name,
        file_size_bytes: f.file_size,
        mime_type: f.mime_type,
        sha256: f.sha256,
        uploaded_at: nowIso
      });
    }

    const primaryFile = uploadedFilesMeta.length > 0 ? uploadedFilesMeta[0] : null;
    const totalBytes = uploadedFilesMeta.reduce((sum, f) => sum + f.file_size_bytes, 0);

    const { data: rpcResult, error: rpcErr } = await this.client.rpc('create_submission_atomic', {
      p_assessment_id: params.assessmentId,
      p_student_id: params.studentId,
      p_submission_id: submissionId,
      p_version_id: versionId,
      p_storage_path: primaryFile ? primaryFile.storage_key : null,
      p_original_name: primaryFile ? primaryFile.original_filename : null,
      p_mime_type: primaryFile ? primaryFile.mime_type : null,
      p_size_bytes: totalBytes,
      p_sha256: primaryFile?.sha256 || null,
      p_files: uploadedFilesMeta,
      p_submitted_at: nowIso,
      p_late_status: params.lateStatus,
      p_answers: params.answers || []
    });

    if (rpcErr) {
      throw new Error(`Failed to commit submission transaction: ${rpcErr.message}`);
    }

    // Clean up draft upon submission
    await this.deleteDraftSubmission(params.assessmentId, params.studentId).catch(() => {});

    const updatedSub: Submission = {
      id: rpcResult.submission_id,
      assessment_id: params.assessmentId,
      question_id: null,
      student_id: params.studentId,
      status: 'uploaded',
      first_submitted_at: nowIso,
      updated_at: nowIso,
      late_status: params.lateStatus
    };

    const versionRec: SubmissionVersion = {
      id: rpcResult.version_id,
      submission_id: rpcResult.submission_id,
      version: rpcResult.version_number,
      storage_path: primaryFile ? primaryFile.storage_key : null,
      original_name: primaryFile ? primaryFile.original_filename : null,
      mime_type: primaryFile ? primaryFile.mime_type : null,
      size_bytes: totalBytes,
      sha256: primaryFile?.sha256 || null,
      uploaded_at: nowIso,
      superseded_at: null,
      files: uploadedFilesMeta,
      answers: params.answers || [],
      late_status: params.lateStatus
    };

    submission = updatedSub;

    const receipt: SubmissionReceipt = {
      submission_id: submissionId,
      version_id: versionId,
      version: newVersionNumber,
      status: 'uploaded',
      late_status: params.lateStatus,
      sha256: primaryFile?.sha256 || null,
      size_bytes: totalBytes,
      file_count: uploadedFilesMeta.length,
      files: uploadedFilesMeta,
      answers: params.answers || [],
      answers_count: (params.answers || []).length,
      uploaded_at: nowIso,
      is_resubmission: isResubmission,
      storage_path: primaryFile ? primaryFile.storage_key : null
    };

    return { submission: submission!, version: versionRec, receipt };
  }

  async listSubmissionsForAssessment(assessmentId: string): Promise<any[]> {
    const { data: list, error } = await this.client
      .from('submissions')
      .select('*')
      .eq('assessment_id', assessmentId);

    if (error) throw new Error(`Failed to list submissions: ${error.message}`);
    return Promise.all((list || []).map(s => this.getFullSubmission(s.id)));
  }

  async getMenteeSubmissionsHierarchy(proctorId: string): Promise<MenteeHierarchyItem[]> {
    const { data: paRows, error: paErr } = await this.client
      .from('proctor_assignments')
      .select('student_id')
      .eq('proctor_id', proctorId)
      .is('valid_to', null);

    if (paErr) throw new Error(`Failed to query proctor assignments: ${paErr.message}`);
    const menteeIds = (paRows || []).map(p => p.student_id);
    if (menteeIds.length === 0) return [];

    const { data: enRows, error: enErr } = await this.client
      .from('enrollments')
      .select(`
        id, student_id, class_id, specialization_id, status,
        profiles(id, full_name, email, usn),
        classes(id, programme, semester, section),
        specializations(id, code, name)
      `)
      .in('student_id', menteeIds)
      .eq('status', 'active');

    if (enErr) throw new Error(`Failed to query mentee enrollments: ${enErr.message}`);
    if (!enRows || enRows.length === 0) return [];

    const classIds = Array.from(new Set(enRows.map(e => e.class_id).filter(Boolean)));
    if (classIds.length === 0) return [];

    const { data: csRows, error: csErr } = await this.client
      .from('class_subjects')
      .select(`
        id, class_id, subject_id,
        subjects(id, code, name, credits, specialization_id)
      `)
      .in('class_id', classIds)
      .eq('active', true);

    if (csErr) throw new Error(`Failed to query class subjects: ${csErr.message}`);

    const csIds = (csRows || []).map(c => c.id);

    let publishedAssessments: any[] = [];
    if (csIds.length > 0) {
      const { data: assRows, error: assErr } = await this.client
        .from('assessments')
        .select('*')
        .in('class_subject_id', csIds)
        .eq('status', 'published');
      if (assErr) throw new Error(`Failed to query assessments: ${assErr.message}`);
      publishedAssessments = assRows || [];
    }

    const assessmentIds = publishedAssessments.map(a => a.id);

    let submissions: any[] = [];
    if (assessmentIds.length > 0) {
      const { data: subRows, error: subErr } = await this.client
        .from('submissions')
        .select('*')
        .in('assessment_id', assessmentIds)
        .in('student_id', menteeIds);
      if (subErr) throw new Error(`Failed to query submissions: ${subErr.message}`);
      submissions = subRows || [];
    }

    const subIds = submissions.map(s => s.id);
    const activeVersionIds = submissions.map(s => s.active_version_id).filter(Boolean);

    let versions: any[] = [];
    if (activeVersionIds.length > 0) {
      const { data: verRows } = await this.client
        .from('submission_versions')
        .select('*')
        .in('id', activeVersionIds);
      versions = verRows || [];
    }

    let evaluations: any[] = [];
    if (subIds.length > 0) {
      const { data: evalRows } = await this.client
        .from('evaluations')
        .select('*')
        .in('submission_id', subIds);
      evaluations = evalRows || [];
    }

    let publications: any[] = [];
    if (assessmentIds.length > 0) {
      const { data: pubRows } = await this.client
        .from('result_publications')
        .select('assessment_id')
        .in('assessment_id', assessmentIds);
      publications = pubRows || [];
    }
    const publishedAssessmentIds = new Set(publications.map(p => p.assessment_id));

    const result: MenteeHierarchyItem[] = [];

    for (const enrollment of enRows) {
      const student = (enrollment as any).profiles;
      const cls = (enrollment as any).classes;
      const spec = (enrollment as any).specializations;
      if (!student || !cls) continue;

      const specName = spec?.name || (enrollment.specialization_id ? 'Specialized' : 'General');
      const specCode = spec?.code || null;
      const studentSpecId = enrollment.specialization_id;

      const applicableCS = (csRows || []).filter(c => c.class_id === cls.id);
      const subjectItems: MenteeSubjectItem[] = [];

      for (const cs of applicableCS) {
        const sub = (cs as any).subjects;
        if (!sub) continue;

        const subSpecId = sub.specialization_id;
        if (subSpecId) {
          if (!studentSpecId || studentSpecId !== subSpecId) {
            continue;
          }
        }

        const subjectAssessments = publishedAssessments.filter(a => a.class_subject_id === cs.id);
        const assessmentItems: MenteeAssessmentItem[] = [];

        for (const ass of subjectAssessments) {
          const subRec = submissions.find(s => s.assessment_id === ass.id && s.student_id === student.id);
          const verRec = subRec?.active_version_id
            ? versions.find(v => v.id === subRec.active_version_id)
            : null;
          const evalRec = subRec
            ? evaluations.find(e => e.submission_id === subRec.id)
            : null;
          const isResultPublished = publishedAssessmentIds.has(ass.id);

          const isSubmitted = Boolean(subRec);
          const isLate = Boolean(subRec?.late_status === 'late' || verRec?.late_status === 'late');

          let evalStatus: 'not_submitted' | 'pending' | 'under_evaluation' | 'completed' | 'published' = 'not_submitted';
          let evalLabel: 'Pending' | 'Pending Evaluation' | 'Evaluated' | 'Published' = 'Pending';
          let pubScore: number | null = null;

          if (isSubmitted) {
            if (isResultPublished || evalRec?.status === 'published') {
              evalStatus = 'published';
              evalLabel = 'Published';
              pubScore = evalRec?.total_score ?? null;
            } else if (evalRec?.status === 'completed') {
              evalStatus = 'completed';
              evalLabel = 'Evaluated';
              pubScore = null;
            } else if (evalRec?.status === 'draft') {
              evalStatus = 'under_evaluation';
              evalLabel = 'Pending Evaluation';
              pubScore = null;
            } else {
              evalStatus = 'pending';
              evalLabel = 'Pending Evaluation';
              pubScore = null;
            }
          }

          assessmentItems.push({
            assessment_id: ass.id,
            title: ass.title,
            instructions: ass.instructions,
            deadline_at: ass.deadline_at,
            extension_deadline_at: ass.extension_deadline_at || null,
            allow_late: Boolean(ass.allow_late),
            max_marks: Number(ass.max_marks || 50),
            is_submitted: isSubmitted,
            submission_id: subRec?.id || null,
            submitted_at: verRec?.uploaded_at || subRec?.first_submitted_at || null,
            is_late: isLate,
            timing_status: isSubmitted ? (isLate ? 'Late' : 'On Time') : '—',
            late_status: subRec?.late_status || (isSubmitted ? 'on_time' : 'not_submitted'),
            evaluation_status: evalStatus,
            evaluation_status_label: evalLabel,
            published_score: pubScore,
            files_count: verRec?.files?.length || (verRec ? 1 : 0)
          });
        }

        const totalAss = assessmentItems.length;
        const submittedCount = assessmentItems.filter(a => a.is_submitted).length;
        const pendingCount = totalAss - submittedCount;
        const lateCount = assessmentItems.filter(a => a.is_submitted && a.is_late).length;
        const evaluatedCount = assessmentItems.filter(a => a.evaluation_status === 'completed' || a.evaluation_status === 'published').length;

        subjectItems.push({
          subject_id: sub.id,
          subject_code: sub.code,
          subject_name: sub.name,
          class_subject_id: cs.id,
          credits: sub.credits,
          specialization_id: subSpecId || null,
          specialization_name: specName,
          total_assessments: totalAss,
          submitted_count: submittedCount,
          pending_count: pendingCount,
          late_count: lateCount,
          evaluated_count: evaluatedCount,
          assessments: assessmentItems
        });
      }

      const totalStudentAss = subjectItems.reduce((acc, s) => acc + s.total_assessments, 0);
      const totalSubmitted = subjectItems.reduce((acc, s) => acc + s.submitted_count, 0);
      const totalPending = subjectItems.reduce((acc, s) => acc + s.pending_count, 0);
      const totalLate = subjectItems.reduce((acc, s) => acc + s.late_count, 0);
      const totalEvaluated = subjectItems.reduce((acc, s) => acc + s.evaluated_count, 0);

      result.push({
        student_id: student.id,
        student_name: student.full_name,
        student_email: student.email,
        student_usn: student.usn || 'N/A',
        programme: cls.programme || 'MCA',
        semester: Number(cls.semester || 1),
        section: cls.section || 'A',
        class_id: cls.id,
        class_name: formatClassName(cls),
        specialization_id: studentSpecId || null,
        specialization_code: specCode,
        specialization_name: specName,
        subjects_count: subjectItems.length,
        total_assessments: totalStudentAss,
        submitted_count: totalSubmitted,
        pending_count: totalPending,
        late_count: totalLate,
        evaluated_count: totalEvaluated,
        subjects: subjectItems
      });
    }

    return result;
  }

  async getProctorSubjectsHierarchy(proctorId: string): Promise<ProctorSubjectHierarchyItem[]> {
    const mentees = await this.getMenteeSubmissionsHierarchy(proctorId);
    return transformMenteesToSubjectsHierarchy(mentees);
  }

  async getLateSubmissionsReport(user: UserContext, assessmentIdFilter?: string): Promise<any[]> {
    const effectiveRole = user.activeRole || (
      user.isHOD ? 'hod' :
      user.roles.includes('subject_teacher') ? 'subject_teacher' :
      user.roles.includes('class_teacher') ? 'class_teacher' :
      user.roles.includes('proctor') ? 'proctor' :
      user.roles[0]
    );

    if (effectiveRole === 'proctor') {
      const hierarchy = await this.getMenteeSubmissionsHierarchy(user.profile.id);
      const rows: any[] = [];
      for (const mentee of hierarchy) {
        for (const sub of mentee.subjects) {
          for (const ass of sub.assessments) {
            rows.push({
              submission_id: ass.submission_id || null,
              assessment_id: ass.assessment_id,
              assessment_title: ass.title,
              class_id: mentee.class_id,
              class_name: mentee.class_name,
              programme: mentee.programme,
              semester: mentee.semester,
              specialization_id: mentee.specialization_id,
              specialization_name: mentee.specialization_name,
              subject_id: sub.subject_id,
              subject_code: sub.subject_code,
              subject_name: `${sub.subject_code} - ${sub.subject_name}`,
              student_id: mentee.student_id,
              student_name: mentee.student_name,
              student_email: mentee.student_email,
              student_usn: mentee.student_usn,
              original_deadline: ass.deadline_at,
              extension_deadline: ass.extension_deadline_at,
              deadline_at: ass.deadline_at,
              extension_deadline_at: ass.extension_deadline_at,
              is_submitted: ass.is_submitted,
              submission_status: ass.is_submitted ? 'Submitted' : 'Pending',
              submitted_at: ass.submitted_at,
              is_late: ass.is_late,
              timing_status: ass.timing_status,
              late_status: ass.late_status,
              penalty_marks: 0,
              raw_score: null,
              final_score: ass.published_score,
              published_score: ass.published_score,
              evaluation_status: ass.evaluation_status,
              evaluation_status_label: ass.evaluation_status_label,
              is_published: ass.evaluation_status === 'published',
              feedback: null,
              files_count: ass.files_count || 0
            });
          }
        }
      }
      if (assessmentIdFilter) {
        return rows.filter(r => r.assessment_id === assessmentIdFilter);
      }
      return rows;
    }

    let query = this.client.from('assessments').select('*');

    if (effectiveRole === 'hod' || (user.isHOD && !user.activeRole)) {
      // HOD sees all
    } else if (effectiveRole === 'subject_teacher') {
      const { data: assignedCS } = await this.client
        .from('class_subjects')
        .select('id')
        .eq('subject_teacher_id', user.profile.id)
        .eq('active', true);
      const csIds = (assignedCS || []).map(c => c.id);
      if (csIds.length === 0) return [];
      query = query.in('class_subject_id', csIds);
    } else if (effectiveRole === 'class_teacher') {
      const clsIdSet = new Set<string>();

      const { data: assignedClasses } = await this.client
        .from('classes')
        .select('id')
        .eq('class_teacher_id', user.profile.id);
      (assignedClasses || []).forEach(c => clsIdSet.add(c.id));

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
            clsIdSet.add(c.id);
          }
        });
      }

      const clsIds = Array.from(clsIdSet);
      if (clsIds.length === 0) return [];

      const { data: csRows } = await this.client
        .from('class_subjects')
        .select('id')
        .in('class_id', clsIds)
        .eq('active', true);
      const csIds = (csRows || []).map(c => c.id);
      if (csIds.length === 0) return [];

      query = query.in('class_subject_id', csIds);
    }

    if (assessmentIdFilter) {
      query = query.eq('id', assessmentIdFilter);
    }

    const { data: scopedAssessments, error } = await query;
    if (error) throw new Error(`Failed to query assessments for late report: ${error.message}`);

    const reportRows: any[] = [];
    for (const assessment of (scopedAssessments || [])) {
      const { data: cs } = await this.client
        .from('class_subjects')
        .select('id, class_id, subject_id')
        .eq('id', assessment.class_subject_id)
        .maybeSingle();

      if (!cs) continue;

      const { data: cls } = await this.client
        .from('classes')
        .select('id, programme, semester, section')
        .eq('id', cs.class_id)
        .maybeSingle();

      const { data: sub } = await this.client
        .from('subjects')
        .select('code, name')
        .eq('id', cs.subject_id)
        .maybeSingle();

      if (!cls) continue;

      const enrollmentsQuery = this.client
        .from('enrollments')
        .select('student_id, profiles(id, full_name, email, usn)')
        .eq('class_id', cls.id)
        .eq('status', 'active');

      const { data: enrolledStudents } = await enrollmentsQuery;

      for (const row of (enrolledStudents || [])) {
        const student = (row as any).profiles;
        if (!student) continue;

        const { data: subRec } = await this.client
          .from('submissions')
          .select('*')
          .eq('assessment_id', assessment.id)
          .eq('student_id', student.id)
          .maybeSingle();

        let versionRec: any = null;
        if (subRec?.active_version_id) {
          const { data: v } = await this.client
            .from('submission_versions')
            .select('*')
            .eq('id', subRec.active_version_id)
            .maybeSingle();
          versionRec = v || null;
        }

        let evalRec: any = null;
        if (subRec) {
          const { data: ev } = await this.client
            .from('evaluations')
            .select('*')
            .eq('submission_id', subRec.id)
            .maybeSingle();
          evalRec = ev || null;
        }

        const isLate = Boolean(subRec?.late_status === 'late' || versionRec?.late_status === 'late');
        const isSubmitted = Boolean(subRec);

        const { data: pubRec } = await this.client
          .from('result_publications')
          .select('id')
          .eq('assessment_id', assessment.id)
          .maybeSingle();

        const isAssessmentPublished = Boolean(pubRec);
        const isScoreDisclosable = isAssessmentPublished || evalRec?.status === 'published';

        reportRows.push({
          submission_id: subRec?.id || null,
          assessment_id: assessment.id,
          assessment_title: assessment.title,
          class_id: cls.id,
          class_name: formatClassName(cls),
          subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
          student_id: student.id,
          student_name: student.full_name,
          student_email: student.email,
          student_usn: student.usn || 'N/A',
          original_deadline: assessment.deadline_at,
          extension_deadline: assessment.extension_deadline_at || null,
          deadline_at: assessment.deadline_at,
          extension_deadline_at: assessment.extension_deadline_at || null,
          is_submitted: isSubmitted,
          submission_status: isSubmitted ? 'Submitted' : 'Not Submitted',
          submitted_at: versionRec?.uploaded_at || subRec?.first_submitted_at || null,
          is_late: isLate,
          timing_status: isSubmitted ? (isLate ? 'Late' : 'On Time') : '—',
          late_status: subRec?.late_status || 'not_submitted',
          penalty_marks: evalRec ? Number(evalRec.late_penalty_deducted) : (isLate ? Number(assessment.late_penalty_marks || 0) : 0),
          raw_score: isScoreDisclosable ? evalRec?.raw_score ?? null : null,
          final_score: isScoreDisclosable ? evalRec?.total_score ?? null : null,
          published_score: isScoreDisclosable && evalRec?.total_score !== undefined ? evalRec.total_score : null,
          evaluation_status: evalRec ? (evalRec.status === 'published' ? 'published' : evalRec.status) : (isSubmitted ? 'pending' : 'not_submitted'),
          is_published: isAssessmentPublished,
          feedback: isScoreDisclosable ? evalRec?.general_feedback || null : null,
          files_count: versionRec?.files?.length || (versionRec ? 1 : 0)
        });
      }
    }

    return reportRows;
  }

  async listSubmissionsForStudent(studentId: string): Promise<any[]> {
    const { data: list, error } = await this.client
      .from('submissions')
      .select('*')
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to list student submissions: ${error.message}`);
    return Promise.all((list || []).map(s => this.getFullSubmission(s.id)));
  }

  async downloadSubmissionFile(storagePath: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(storagePath);

    if (error || !data) return null;

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return { buffer, mimeType: 'application/octet-stream' };
  }

  async getSignedSubmissionFileUrl(storageKey: string, expiresInSeconds: number = 3600): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (error || !data) return null;
    return data.signedUrl;
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

let activeSubmissionRepoOverride: ISubmissionRepository | null = null;

export const setSubmissionRepositoryForTesting = (repo: ISubmissionRepository | null): void => {
  activeSubmissionRepoOverride = repo;
};

export const getSubmissionRepository = (): ISubmissionRepository => {
  if (activeSubmissionRepoOverride) return activeSubmissionRepoOverride;

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    return new InMemorySubmissionRepository(db);
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    return new SupabaseSubmissionRepository(supabaseAdmin);
  }

  return new InMemorySubmissionRepository(db);
};
