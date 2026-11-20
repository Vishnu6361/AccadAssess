import { Router, Request, Response } from 'express';
import {
  CreateAssessmentRequestSchema,
  UpdateAssessmentRequestSchema,
  CreateQuestionRequestSchema,
  UpdateQuestionRequestSchema,
  SaveRubricRequestSchema,
  PublishAssessmentRequestSchema,
  formatClassName
} from '@smartfa/contracts';
import { logAuditEvent } from '../audit/auditService.js';
import jwt from 'jsonwebtoken';
import { authenticateJWT, supabaseAdmin, DEV_JWT_SECRET, REAUTH_JWT_SECRET, consumeReauthTokenAtomic, isReauthTokenConsumed, markReauthTokenConsumed } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';
import { getAssessmentRepository } from '../storage/assessmentRepository.js';
import { getAcademicRepository } from '../storage/academicRepository.js';

const router = Router();

router.use(authenticateJWT);
router.use(loadUserContext);

router.get('/', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const list = await repo.listAssessments(user);
  return res.status(200).json({ assessments: list });
});

router.get('/class-teacher/cohort', requireRoles(['class_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const academicRepo = getAcademicRepository();

  let teacherClasses: any[] = [];
  if (user.isHOD) {
    const requestedTeacherId = (req.query.teacher_id as string) || user.profile.id;
    teacherClasses = await academicRepo.listClassesByTeacher(requestedTeacherId);
    if (teacherClasses.length === 0 && !req.query.teacher_id) {
      teacherClasses = await academicRepo.listClasses();
    }
  } else {
    teacherClasses = await academicRepo.listClassesByTeacher(user.profile.id);
    if (teacherClasses.length === 0) {
      const allocations = await academicRepo.listFacultyAllocations(user.profile.id);
      if (allocations.length > 0) {
        const allClasses = await academicRepo.listClasses();
        teacherClasses = allClasses.filter(c =>
          allocations.some(a =>
            (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
            (!a.semester || a.semester === c.semester)
          )
        );
      }
    }
  }

  const requestedClassId = req.query.class_id as string;
  if (requestedClassId) {
    const match = teacherClasses.find(c => c.id === requestedClassId);
    if (!match && !user.isHOD) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not authorized to access this class cohort' }
      });
    }
    if (match) {
      teacherClasses = [match];
    }
  }

  const allClassSubjects = await academicRepo.listClassSubjects();
  const allSubjects = await academicRepo.listSubjects().catch(() => []);
  const allSpecializations = await academicRepo.listSpecializations().catch(() => []);
  let subjectSpecializations: Array<{ subject_id: string; specialization_id: string }> = [];
  try {
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin.from('subject_specializations').select('subject_id, specialization_id');
      if (data) subjectSpecializations = data;
    }
  } catch {}

  let enrichedClasses = await Promise.all(
    teacherClasses.map(async (cls) => {
      const enrollments = await academicRepo.listEnrollments(cls.id);
      const activeEnrollments = enrollments.filter(e => e.status === 'active');
      const classSubjects = allClassSubjects.filter(cs => cs.class_id === cls.id && cs.active);

      let resolvedTeacherId = cls.class_teacher_id || null;
      let resolvedTeacherName = (cls.class_teacher_name && cls.class_teacher_name !== 'Unassigned')
        ? cls.class_teacher_name
        : (cls.class_teacher_id && cls.class_teacher_id === user.profile.id ? user.profile.full_name : 'Unassigned');

      if (cls.class_teacher_id && cls.class_teacher_id === user.profile.id) {
        resolvedTeacherName = user.profile.full_name;
      }

      return {
        id: cls.id,
        name: formatClassName(cls),
        programme: cls.programme,
        semester: cls.semester,
        section: cls.section,
        class_teacher_id: resolvedTeacherId,
        class_teacher_name: resolvedTeacherName,
        students_count: activeEnrollments.length,
        students: activeEnrollments.map(e => ({
          id: e.student_id,
          name: e.student_name,
          email: e.student_email,
          usn: e.student_usn,
          status: e.status,
          specialization_id: e.specialization_id || null,
          specialization_code: e.specialization_code || null,
          specialization_name: e.specialization_name || null
        })),
        subjects: classSubjects.map(cs => {
          const matchedSub = allSubjects.find(s => s.id === cs.subject_id);
          const rawSpecId = matchedSub?.specialization_id || subjectSpecializations.find(ss => ss.subject_id === cs.subject_id)?.specialization_id || null;
          const spec = rawSpecId ? allSpecializations.find(sp => sp.id === rawSpecId) : undefined;
          const code = matchedSub?.code || (cs.subject_name.includes(' - ') ? cs.subject_name.split(' - ')[0].trim() : '');
          const nameOnly = matchedSub?.name || (cs.subject_name.includes(' - ') ? cs.subject_name.split(' - ').slice(1).join(' - ').trim() : cs.subject_name);

          return {
            id: cs.id,
            subject_id: cs.subject_id,
            subject_name: cs.subject_name,
            subject_code: code,
            name: nameOnly,
            specialization_id: rawSpecId,
            specialization_code: spec?.code || matchedSub?.specialization_code || null,
            specialization_name: spec?.name || matchedSub?.specialization_name || null,
            subject_teacher_id: cs.subject_teacher_id,
            teacher_name: cs.teacher_name
          };
        })
      };
    })
  );

  // Canonical deduplication across academic scopes:
  // If multiple classes share the exact same programme and semester (e.g. legacy/phantom sections for MCA Sem 3),
  // prioritize the canonical active class:
  // 1) Appointed class teacher (appointed teacher beats Unassigned)
  // 2) Number of active enrolled students (cohort with students beats 0 students)
  // 3) Number of active subjects
  if (enrichedClasses.length > 1 && !requestedClassId) {
    const scopeMap = new Map<string, typeof enrichedClasses[0]>();
    for (const c of enrichedClasses) {
      const scopeKey = `${(c.programme || '').toUpperCase()}_SEM_${c.semester}`;
      const existing = scopeMap.get(scopeKey);
      if (!existing) {
        scopeMap.set(scopeKey, c);
        continue;
      }

      const score = (item: typeof enrichedClasses[0]) => {
        let pts = 0;
        if (item.class_teacher_id && item.class_teacher_name && item.class_teacher_name !== 'Unassigned') {
          pts += 1000;
        }
        pts += (item.students_count || 0) * 100;
        pts += (item.subjects?.length || 0) * 10;
        return pts;
      };

      if (score(c) > score(existing)) {
        scopeMap.set(scopeKey, c);
      }
    }
    enrichedClasses = Array.from(scopeMap.values());
  }

  return res.status(200).json({ classes: enrichedClasses });
});

/**
 * Returns authorized class-subjects for assessment authoring:
 * - When in 'hod' workspace: returns all active class subjects in the department.
 * - When in 'subject_teacher' workspace: strictly returns only the teacher's authorized subject allocations.
 */
router.get('/teacher/class-subjects', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const academicRepo = getAcademicRepository();

    if (user.isHOD && (!user.activeRole || user.activeRole === 'hod')) {
      const allClassSubjects = await academicRepo.listClassSubjects();
      return res.status(200).json({ class_subjects: allClassSubjects.filter(cs => cs.active) });
    }

    const teacherClassSubjects = await academicRepo.listClassSubjectsByTeacher(user.profile.id);
    return res.status(200).json({ class_subjects: teacherClassSubjects.filter(cs => cs.active) });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

/**
 * Returns the next automatic sequential formative assessment title and numbering
 * for a specific class-subject allocation (e.g. Formative Assessment 2, FA2).
 */
router.get('/next-sequence', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  try {
    const classSubjectId = req.query.class_subject_id as string;
    if (!classSubjectId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'class_subject_id query parameter is required' } });
    }
    const repo = getAssessmentRepository();
    const nextSeq = await repo.getNextAssessmentSequence(classSubjectId);
    return res.status(200).json(nextSeq);
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err.message } });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getFullAssessment(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (user.isHOD) {
    // HOD has full access across all department assessments
  } else if (user.roles.includes('student')) {
    if (assessment.status !== 'published') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Students can only view published assessments' }
      });
    }

    const isEnrolled = await repo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not enrolled in the class for this assessment' }
      });
    }

    if (assessment.publishing_audience === 'selected') {
      const isTargeted = await repo.isStudentTargeted(assessment.id, user.profile.id);
      if (!isTargeted) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' }
        });
      }
    }
  } else if (user.roles.includes('subject_teacher')) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('class_teacher')) {
    const isClassTeacher = await repo.isClassTeacherForAssessment(user.profile.id, assessment.class_subject_id);
    if (!isClassTeacher) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not the class teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('proctor')) {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    const menteeIds = mentees.filter(m => !m.valid_to).map(m => m.student_id);
    let hasMenteeInAssessment = false;
    for (const menteeId of menteeIds) {
      if (await repo.isEnrolledStudent(menteeId, assessment.class_subject_id)) {
        hasMenteeInAssessment = true;
        break;
      }
    }
    if (!hasMenteeInAssessment) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have any mentees associated with this assessment' }
      });
    }
  }

  let responseAssessment = { ...assessment };
  if (user.roles.includes('student')) {
    if (responseAssessment.quiz_questions && Array.isArray(responseAssessment.quiz_questions)) {
      responseAssessment.quiz_questions = responseAssessment.quiz_questions.map((q: any) => {
        const { correct_option_id, ...safeQuestion } = q;
        return safeQuestion;
      });
    }
  }

  return res.status(200).json({ assessment: responseAssessment });
});

router.get('/:id/document', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  const storageKey = assessment.document_storage_key || (assessment.instruction_files && assessment.instruction_files[0]?.storage_path);
  if (!storageKey) {
    return res.status(404).json({
      error: { code: 'DOCUMENT_NOT_FOUND', message: 'No document attached to this assessment' }
    });
  }

  if (user.isHOD) {
    // Granted
  } else if (user.roles.includes('subject_teacher')) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('class_teacher')) {
    const isClassTeacher = await repo.isClassTeacherForAssessment(user.profile.id, assessment.class_subject_id);
    if (!isClassTeacher) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized class teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('student')) {
    if (assessment.status !== 'published') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Students can only access published assessment documents' }
      });
    }
    const isEnrolled = await repo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only enrolled students may access the assignment brief' }
      });
    }
    if (assessment.publishing_audience === 'selected') {
      const isTargeted = await repo.isStudentTargeted(assessment.id, user.profile.id);
      if (!isTargeted) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' }
        });
      }
    }
  } else if (user.roles.includes('proctor')) {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    const menteeIds = mentees.filter(m => !m.valid_to).map(m => m.student_id);
    let hasMenteeInAssessment = false;
    for (const menteeId of menteeIds) {
      if (await repo.isEnrolledStudent(menteeId, assessment.class_subject_id)) {
        hasMenteeInAssessment = true;
        break;
      }
    }
    if (!hasMenteeInAssessment) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Proctors can only access documents for assessments assigned to their mentees' }
      });
    }
  } else {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Unauthorized role' }
    });
  }

  const doc = await repo.getDocumentBlob(storageKey);
  if (!doc) {
    return res.status(404).json({
      error: { code: 'DOCUMENT_BYTES_NOT_FOUND', message: 'Document binary not found in storage' }
    });
  }

  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
  res.setHeader('Content-Length', doc.buffer.length);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(doc.buffer);
});

router.get('/:id/document-url', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  const storageKey = assessment.document_storage_key || (assessment.instruction_files && assessment.instruction_files[0]?.storage_path);
  if (!storageKey) {
    return res.status(404).json({
      error: { code: 'DOCUMENT_NOT_FOUND', message: 'No document attached to this assessment' }
    });
  }

  if (user.isHOD) {
    // Granted
  } else if (user.roles.includes('subject_teacher')) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('class_teacher')) {
    const isClassTeacher = await repo.isClassTeacherForAssessment(user.profile.id, assessment.class_subject_id);
    if (!isClassTeacher) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized class teacher for this assessment' }
      });
    }
  } else if (user.roles.includes('student')) {
    if (assessment.status !== 'published') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Students can only access published assessment documents' }
      });
    }
    const isEnrolled = await repo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only enrolled students may access the assignment brief' }
      });
    }
    if (assessment.publishing_audience === 'selected') {
      const isTargeted = await repo.isStudentTargeted(assessment.id, user.profile.id);
      if (!isTargeted) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' }
        });
      }
    }
  } else if (user.roles.includes('proctor')) {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    const menteeIds = mentees.filter(m => !m.valid_to).map(m => m.student_id);
    let hasMenteeInAssessment = false;
    for (const menteeId of menteeIds) {
      if (await repo.isEnrolledStudent(menteeId, assessment.class_subject_id)) {
        hasMenteeInAssessment = true;
        break;
      }
    }
    if (!hasMenteeInAssessment) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Proctors can only access documents for assessments assigned to their mentees' }
      });
    }
  } else {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Unauthorized role' }
    });
  }

  const signedUrl = repo.getSignedDocumentUrl ? await repo.getSignedDocumentUrl(storageKey) : null;
  return res.status(200).json({
    document: {
      storage_key: storageKey,
      filename: assessment.document_filename || (assessment.instruction_files && assessment.instruction_files[0]?.file_name),
      size_bytes: assessment.document_size_bytes,
      mime_type: assessment.document_mime_type,
      signed_url: signedUrl,
      download_url: `/api/v1/assessments/${assessment.id}/document`
    }
  });
});

// In-flight creation promises to prevent race conditions during concurrent identical submissions
const inFlightCreations = new Map<string, Promise<{ status: number; body: any }>>();

router.post('/', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();

  const parseResult = CreateAssessmentRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors;
    const formattedErrors = errorDetails
      .map(e => `${e.path.join('.') || 'payload'}: ${e.message}`)
      .join('; ');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid assessment creation payload: ${formattedErrors}`,
        details: errorDetails
      }
    });
  }
  const body = parseResult.data;

  // Header or body idempotency key
  const rawIdempKey = req.headers['idempotency-key'] || body.idempotency_key;
  const idempotencyKey = typeof rawIdempKey === 'string' && rawIdempKey.trim().length > 0 
    ? rawIdempKey.trim() 
    : undefined;

  if (idempotencyKey) {
    body.idempotency_key = idempotencyKey;
  }

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, body.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_UNASSIGNED_TEACHER', message: 'You are not assigned as the teacher for this class subject' }
      });
    }
  }

  if (new Date(body.deadline_at).getTime() <= Date.now()) {
    return res.status(400).json({
      error: { code: 'INVALID_DEADLINE', message: 'Assessment submission deadline must be in the future' }
    });
  }

  // Idempotency Deduplication Key (scoped to user and key)
  const dedupKey = idempotencyKey ? `${user.profile.id}:${idempotencyKey}` : null;

  // 1. If an identical creation is currently in-flight, await its completion and return existing result
  if (dedupKey && inFlightCreations.has(dedupKey)) {
    try {
      const inFlightRes = await inFlightCreations.get(dedupKey)!;
      return res.status(inFlightRes.status === 201 ? 200 : inFlightRes.status).json({
        ...inFlightRes.body,
        idempotent_replay: true
      });
    } catch (err: any) {
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: err.message || 'Failed to create assessment' }
      });
    }
  }

  // 2. If already saved under this idempotency key in the repository, return existing draft immediately
  if (idempotencyKey && repo.getAssessmentByIdempotencyKey) {
    const existing = await repo.getAssessmentByIdempotencyKey(user.profile.id, idempotencyKey);
    if (existing) {
      return res.status(200).json({
        assessment: existing,
        idempotent_replay: true
      });
    }
  }

  // 2.1 Enforce Automatic Sequential Formative Assessment Naming
  // Guarantees sequential Formative Assessment 1, 2, 3... without manual number entry
  const nextSeqInfo = await repo.getNextAssessmentSequence(body.class_subject_id);
  body.title = nextSeqInfo.title;

  // 3. Execution logic
  const executeCreation = async () => {
    const assessment = repo.saveDraftAssessmentAtomic
      ? await repo.saveDraftAssessmentAtomic(null, body, user.profile.id)
      : await repo.createAssessment(body, user.profile.id);

    await logAuditEvent({
      actorId: user.profile.id,
      action: 'ASSESSMENT_CREATED',
      resourceType: 'assessment',
      resourceId: assessment.id,
      after: assessment as any,
      correlationId: req.headers['x-correlation-id'] as string
    });

    return { status: 201, body: { assessment } };
  };

  if (dedupKey) {
    const creationPromise = executeCreation();
    inFlightCreations.set(dedupKey, creationPromise);
    try {
      const outcome = await creationPromise;
      return res.status(outcome.status).json(outcome.body);
    } catch (err: any) {
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: err.message || 'Failed to create assessment' }
      });
    } finally {
      inFlightCreations.delete(dedupKey);
    }
  } else {
    try {
      const outcome = await executeCreation();
      return res.status(outcome.status).json(outcome.body);
    } catch (err: any) {
      return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: err.message || 'Failed to create assessment' }
      });
    }
  }
});

router.get('/:id/deletion-check', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const repo = getAssessmentRepository();
    const assessment = await repo.getAssessmentById(req.params.id);

    if (!assessment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Assessment not found' }
      });
    }

    if (!user.isHOD) {
      const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
      if (!isAuth) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
        });
      }
    }

    const summary = await repo.getAssessmentDeletionSummary(assessment.id);
    const records = await repo.hasRelatedStudentRecords(assessment.id);

    return res.status(200).json({
      can_delete: true,
      summary,
      counts: summary.counts,
      submissions_count: summary.counts.submissions,
      evaluations_count: summary.counts.evaluations,
      is_published: summary.counts.result_publications > 0 || records.isPublished,
      reason: null
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to check assessment deletion status' }
    });
  }
});

router.put('/:id', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (assessment.status === 'published' || assessment.status === 'closed') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: `Cannot modify assessment with status ${assessment.status}` }
    });
  }

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  const parseResult = UpdateAssessmentRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.errors;
    const formattedErrors = errorDetails
      .map(e => `${e.path.join('.') || 'payload'}: ${e.message}`)
      .join('; ');
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid assessment update payload: ${formattedErrors}`,
        details: errorDetails
      }
    });
  }

  const body = parseResult.data;

  // Validate deadline and extension constraints
  const effectiveDeadline = body.deadline_at || assessment.deadline_at;
  const effectiveAllowLate = body.allow_late !== undefined ? body.allow_late : assessment.allow_late;
  const effectiveExtension = body.extension_deadline_at !== undefined ? body.extension_deadline_at : assessment.extension_deadline_at;

  if (effectiveAllowLate && effectiveExtension) {
    const extTime = new Date(effectiveExtension).getTime();
    const origTime = new Date(effectiveDeadline).getTime();
    if (extTime <= origTime) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Extension deadline must be later than the submission deadline',
          path: ['extension_deadline_at']
        }
      });
    }
  }

  // Validate late penalty against max marks
  const effectiveMaxMarks = body.max_marks || assessment.max_marks || 100;
  const effectivePenalty = body.late_penalty_marks !== undefined ? body.late_penalty_marks : assessment.late_penalty_marks;
  if (effectivePenalty > effectiveMaxMarks) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Late penalty marks cannot exceed maximum assessment marks',
        path: ['late_penalty_marks']
      }
    });
  }

  // Check if student submissions or evaluations already exist
  const records = await repo.hasRelatedStudentRecords(assessment.id);

  const updated = repo.saveDraftAssessmentAtomic
    ? await repo.saveDraftAssessmentAtomic(assessment.id, { ...body, class_subject_id: assessment.class_subject_id }, user.profile.id)
    : await repo.updateAssessment(assessment.id, body as any);

  await logAuditEvent({
    actorId: user.profile.id,
    action: 'ASSESSMENT_UPDATED',
    resourceType: 'assessment',
    resourceId: assessment.id,
    before: assessment as any,
    after: updated as any,
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(200).json({
    assessment: updated,
    warning: records.hasRecords
      ? 'Student submissions exist for this assessment. Existing submitted files and historical grades have been preserved intact.'
      : null
  });
});

router.delete('/:id', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  // 1. Authorization: check active assignment on backend
  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  // 2. Password Confirmation (Reauth Token Verification)
  const reauthToken = (req.headers['x-reauth-token'] || req.headers['authorization-reauth']) as string;
  if (!reauthToken) {
    return res.status(401).json({
      error: {
        code: 'REAUTH_REQUIRED',
        message: 'Password confirmation required. Please enter your institutional login password to proceed with permanent deletion.'
      }
    });
  }

  try {
    const decoded: any = jwt.verify(reauthToken, REAUTH_JWT_SECRET);
    if (!decoded || decoded.sub !== user.profile.id || decoded.purpose !== 'assignment_deletion') {
      return res.status(403).json({
        error: {
          code: 'REAUTH_INVALID',
          message: 'Invalid or unauthorized password confirmation token. Please re-enter your password.'
        }
      });
    }

    // 1. Single-use replay protection: token cannot be reused across any operation or assignment
    if (decoded.jti && isReauthTokenConsumed(decoded.jti)) {
      return res.status(403).json({
        error: {
          code: 'REAUTH_ALREADY_USED',
          message: 'This password confirmation token has already been used and cannot be reused.'
        }
      });
    }

    // 2. Target assignment binding check: token cannot be used for a different assignment
    if (decoded.assessment_id && decoded.assessment_id !== assessment.id) {
      return res.status(403).json({
        error: {
          code: 'REAUTH_TARGET_MISMATCH',
          message: 'This password confirmation token is not valid for this assignment.'
        }
      });
    }

    if (!decoded.jti) {
      return res.status(403).json({
        error: {
          code: 'REAUTH_INVALID',
          message: 'Password confirmation token missing unique identifier (jti).'
        }
      });
    }

    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 5 * 60 * 1000);

    // 3. Atomically consume token - prevents concurrent races across multiple instances
    const consumption = await consumeReauthTokenAtomic({
      jti: decoded.jti,
      purpose: decoded.purpose,
      targetId: assessment.id,
      consumedBy: user.profile.id,
      expiresAt
    });

    if (!consumption.success) {
      return res.status(403).json({
        error: {
          code: consumption.code || 'REAUTH_ALREADY_USED',
          message: consumption.message || 'This password confirmation token has already been used and cannot be reused.'
        }
      });
    }
  } catch (reauthErr: any) {
    return res.status(403).json({
      error: {
        code: 'REAUTH_EXPIRED',
        message: 'Password confirmation has expired or is invalid. Please re-enter your institutional password.',
        details: reauthErr.message
      }
    });
  }

  try {
    // Stage 1: Transition status to deletion_pending to lock any concurrent submissions or evaluations
    await repo.markAssessmentDeletionPending(assessment.id, user.profile.id);

    // Stage 2: Collect all storage objects
    const storageKeys = await repo.listAssessmentStorageKeys(assessment.id);

    // Stage 3: Delete storage files from storage
    // If storage deletion throws/fails, abort before database cascade to prevent orphaned storage objects
    if (storageKeys.length > 0) {
      const isLive = repo.getMode() === 'supabase_postgresql';
      if (isLive && supabaseAdmin) {
        const bucket = process.env.STORAGE_BUCKET_ASSIGNMENTS || 'submissions-private';
        const { error: storageError } = await supabaseAdmin.storage.from(bucket).remove(storageKeys);
        if (storageError) {
          return res.status(502).json({
            error: {
              code: 'STORAGE_DELETION_FAILED',
              message: `Failed to remove storage files associated with assessment: ${storageError.message}. Deletion was aborted to prevent orphaned records. You may retry.`,
              details: storageError
            }
          });
        }
      }
    }

    // Stage 4: Atomic cascade database deletion
    const deletedCounts = await repo.deleteAssessmentPermanent(assessment.id, user.profile.id);

    // Stage 5: Log audit event (only metadata and counts - NEVER passwords or academic content)
    await logAuditEvent({
      actorId: user.profile.id,
      action: 'ASSESSMENT_PERMANENTLY_DELETED',
      resourceType: 'assessment',
      resourceId: assessment.id,
      before: {
        id: assessment.id,
        title: assessment.title,
        class_subject_id: assessment.class_subject_id,
        status: assessment.status
      },
      after: {
        deleted_counts: deletedCounts,
        deleted_storage_files_count: storageKeys.length
      },
      correlationId: (req.headers['x-correlation-id'] as string) || (req.headers['x-request-id'] as string)
    });

    return res.status(200).json({
      success: true,
      message: `Assessment "${assessment.title}" and all associated academic records were permanently deleted.`,
      deleted_counts: deletedCounts
    });
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'DELETION_FAILED',
        message: err.message || 'An error occurred during permanent assessment deletion.'
      }
    });
  }
});

router.post('/:id/questions', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (assessment.status === 'published' || assessment.status === 'closed') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: `Cannot add questions: assessment is ${assessment.status}` }
    });
  }

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  const body = CreateQuestionRequestSchema.parse(req.body);
  const question = await repo.createQuestion(assessment.id, body);

  return res.status(201).json({ question });
});

router.put('/:id/questions/:questionId', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);
  if (assessment && (assessment.status === 'published' || assessment.status === 'closed')) {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: `Cannot modify questions: assessment is ${assessment.status}` }
    });
  }
  const body = UpdateQuestionRequestSchema.parse(req.body);
  const updated = await repo.updateQuestion(req.params.questionId, body);
  return res.status(200).json({ question: updated });
});

router.delete('/:id/questions/:questionId', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);
  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }
  if (assessment.status === 'published' || assessment.status === 'closed') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: `Cannot delete question: assessment is ${assessment.status}` }
    });
  }
  if (repo.deleteQuestion) {
    await repo.deleteQuestion(req.params.questionId);
  }
  return res.status(200).json({ success: true, message: 'Question deleted' });
});

router.post('/:id/questions/:questionId/rubric', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);
  if (assessment && (assessment.status === 'published' || assessment.status === 'closed')) {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: `Cannot modify rubric: assessment is ${assessment.status}` }
    });
  }
  const body = SaveRubricRequestSchema.parse(req.body);
  const rubric = await repo.saveRubric(req.params.questionId, body, user.profile.id);
  return res.status(201).json({ rubric });
});

router.get('/:id/eligible-students', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  try {
    const students = await repo.listEligibleStudents(assessment.class_subject_id);
    return res.status(200).json({ students });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list eligible students' }
    });
  }
});

router.post('/:id/publish', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getAssessmentById(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  let audience: 'all' | 'selected' = 'all';
  let studentIds: string[] = [];
  if (req.body && Object.keys(req.body).length > 0) {
    const parseResult = PublishAssessmentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formattedErrors = parseResult.error.errors
        .map(e => `${e.path.join('.') || 'payload'}: ${e.message}`)
        .join('; ');
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: formattedErrors, details: parseResult.error.errors }
      });
    }
    audience = parseResult.data.audience;
    studentIds = parseResult.data.student_ids || [];
  }

  let published: any;
  try {
    published = await repo.publishAssessment(assessment.id, user.profile.id, audience, studentIds);
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('rubric') && (msg.includes('missing') || msg.includes('configured') || msg.includes('zero criteria'))) {
      return res.status(422).json({
        error: { code: 'MISSING_RUBRIC', message: msg }
      });
    }
    if (msg.includes('total') || msg.includes('does not equal') || msg.includes('mismatch')) {
      return res.status(422).json({
        error: { code: 'RUBRIC_TOTAL_MISMATCH', message: msg }
      });
    }
    if (msg.includes('At least one student must be selected') || msg.includes('not eligible') || msg.includes('not actively enrolled') || msg.includes('does not belong to the required specialization')) {
      return res.status(400).json({
        error: { code: 'INVALID_AUDIENCE_SELECTION', message: msg }
      });
    }
    return res.status(400).json({
      error: { code: 'PUBLISH_FAILED', message: msg }
    });
  }

  await logAuditEvent({
    actorId: user.profile.id,
    action: 'PUBLISH_ASSESSMENT',
    resourceType: 'assessment',
    resourceId: assessment.id,
    before: assessment as any,
    after: published as any,
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(200).json({ assessment: published });
});

export default router;
