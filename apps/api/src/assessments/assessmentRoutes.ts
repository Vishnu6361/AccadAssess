import { Router, Request, Response } from 'express';
import {
  CreateAssessmentRequestSchema,
  UpdateAssessmentRequestSchema,
  CreateQuestionRequestSchema,
  UpdateQuestionRequestSchema,
  SaveRubricRequestSchema,
  formatClassName
} from '@smartfa/contracts';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT, supabaseAdmin } from '../auth/jwt.js';
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

router.get('/:id', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const assessment = await repo.getFullAssessment(req.params.id);

  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (user.roles.includes('student')) {
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
  }

  if (user.roles.includes('class_teacher') && !user.isHOD && !user.roles.includes('subject_teacher')) {
    const isClassTeacher = await repo.isClassTeacherForAssessment(user.profile.id, assessment.class_subject_id);
    if (!isClassTeacher) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not the class teacher for this assessment' }
      });
    }
  }

  if (user.roles.includes('proctor') && !user.isHOD && !user.roles.includes('subject_teacher') && !user.roles.includes('class_teacher')) {
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

  return res.status(200).json({ assessment });
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

  if (!assessment.document_storage_key) {
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
    const isEnrolled = await repo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only enrolled students may access the assignment brief' }
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
        error: { code: 'FORBIDDEN', message: 'Proctors can only access documents for assessments assigned to their mentees' }
      });
    }
  } else {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Unauthorized role' }
    });
  }

  const doc = await repo.getDocumentBlob(assessment.document_storage_key);
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

  if (!assessment.document_storage_key) {
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
    const isEnrolled = await repo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only enrolled students may access the assignment brief' }
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
        error: { code: 'FORBIDDEN', message: 'Proctors can only access documents for assessments assigned to their mentees' }
      });
    }
  } else {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Unauthorized role' }
    });
  }

  const signedUrl = repo.getSignedDocumentUrl ? await repo.getSignedDocumentUrl(assessment.document_storage_key) : null;
  return res.status(200).json({
    document: {
      storage_key: assessment.document_storage_key,
      filename: assessment.document_filename,
      size_bytes: assessment.document_size_bytes,
      mime_type: assessment.document_mime_type,
      signed_url: signedUrl,
      download_url: `/api/v1/assessments/${assessment.id}/document`
    }
  });
});

router.post('/', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();

  const parseResult = CreateAssessmentRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid assessment creation payload',
        details: parseResult.error.errors
      }
    });
  }
  const body = parseResult.data;

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, body.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not assigned as the teacher for this class subject' }
      });
    }
  }

  try {
    const assessment = await repo.createAssessment(body, user.profile.id);

    await logAuditEvent({
      actorId: user.profile.id,
      action: 'ASSESSMENT_CREATED',
      resourceType: 'assessment',
      resourceId: assessment.id,
      after: assessment as any,
      correlationId: req.headers['x-correlation-id'] as string
    });

    return res.status(201).json({ assessment });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to create assessment' }
    });
  }
});

router.get('/:id/deletion-check', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
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

  const records = await repo.hasRelatedStudentRecords(assessment.id);
  return res.status(200).json({
    can_delete: !records.hasRecords,
    submissions_count: records.submissionsCount,
    evaluations_count: records.evaluationsCount,
    is_published: records.isPublished,
    reason: records.hasRecords
      ? `This assessment has ${records.submissionsCount} student submission(s) and evaluation records. To protect academic history, deletion is prevented.`
      : null
  });
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

  if (assessment.status === 'closed') {
    return res.status(400).json({
      error: { code: 'ASSESSMENT_CLOSED', message: 'Closed assessments cannot be modified' }
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
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', details: parseResult.error.errors }
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

  const updated = await repo.updateAssessment(assessment.id, body);

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

  if (!user.isHOD) {
    const isAuth = await repo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' }
      });
    }
  }

  // Check whether student submissions, evaluation records, or published grades exist
  const records = await repo.hasRelatedStudentRecords(assessment.id);
  if (records.hasRecords) {
    return res.status(409).json({
      error: {
        code: 'CANNOT_DELETE_WITH_SUBMISSIONS',
        message: `Cannot delete assessment "${assessment.title}" because it already has ${records.submissionsCount} student submission(s) or evaluation records. To protect academic records and historical integrity, deletion is prevented.`,
        details: {
          submissions_count: records.submissionsCount,
          evaluations_count: records.evaluationsCount,
          is_published: records.isPublished
        }
      }
    });
  }

  await repo.deleteAssessment(assessment.id);

  await logAuditEvent({
    actorId: user.profile.id,
    action: 'ASSESSMENT_DELETED',
    resourceType: 'assessment',
    resourceId: assessment.id,
    before: assessment as any,
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(200).json({
    success: true,
    message: `Assessment "${assessment.title}" was successfully deleted.`
  });
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
  const body = UpdateQuestionRequestSchema.parse(req.body);
  const updated = await repo.updateQuestion(req.params.questionId, body);
  return res.status(200).json({ question: updated });
});

router.post('/:id/questions/:questionId/rubric', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const repo = getAssessmentRepository();
  const body = SaveRubricRequestSchema.parse(req.body);
  const rubric = await repo.saveRubric(req.params.questionId, body, user.profile.id);
  return res.status(200).json({ rubric });
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

  const published = await repo.publishAssessment(assessment.id, user.profile.id);

  await logAuditEvent({
    actorId: user.profile.id,
    action: 'ASSESSMENT_PUBLISHED',
    resourceType: 'assessment',
    resourceId: assessment.id,
    before: assessment as any,
    after: published as any,
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(200).json({ assessment: published });
});

export default router;
