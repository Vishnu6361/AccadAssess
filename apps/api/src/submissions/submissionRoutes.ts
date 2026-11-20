import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';
import { getSubmissionRepository } from '../storage/submissionRepository.js';
import { getAssessmentRepository } from '../storage/assessmentRepository.js';
import { getAcademicRepository } from '../storage/academicRepository.js';

const router = Router();

router.use(authenticateJWT);
router.use(loadUserContext);

const MultiFileSubmissionRequestSchema = z.object({
  assessment_id: z.string().uuid(),
  answers: z.array(z.object({
    question_id: z.string().uuid(),
    question_number: z.number().int().optional(),
    question_prompt: z.string().optional(),
    answer_text: z.string()
  })).optional().default([]),
  quiz_answers: z.array(z.object({
    quiz_question_id: z.string().uuid(),
    selected_option_id: z.string().min(1)
  })).optional().default([]),
  section_statuses: z.record(z.string()).optional().default({}),
  files: z.array(z.object({
    file_name: z.string().min(1).max(255),
    file_base64: z.string().min(1),
    mime_type: z.string().optional()
  })).optional().default([]),
  keep_existing_files: z.boolean().optional().default(false)
});

function detectMagicMime(buffer: Buffer, declaredName: string): string | null {
  const lowerName = declaredName.toLowerCase();
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return 'application/pdf';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
    buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1
  ) {
    if (lowerName.endsWith('.doc')) return 'application/msword';
    return 'application/vnd.ms-powerpoint';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04
  ) {
    if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return null;
}

// Student Draft Saving Endpoints
router.get('/assessment/:assessmentId/draft', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const { assessmentId } = req.params;
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();

  const assessment = await assRepo.getAssessmentById(assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const isEnrolled = await assRepo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
  if (!isEnrolled) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not actively enrolled in the class for this assessment' } });
  }

  if (assessment.publishing_audience === 'selected') {
    const isTargeted = await assRepo.isStudentTargeted(assessment.id, user.profile.id);
    if (!isTargeted) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' } });
    }
  }

  const draft = await subRepo.getDraftSubmission(assessmentId, user.profile.id);
  return res.status(200).json({ draft });
});

router.put('/assessment/:assessmentId/draft', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const { assessmentId } = req.params;
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();

  const assessment = await assRepo.getAssessmentById(assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const isEnrolled = await assRepo.isEnrolledStudent(user.profile.id, assessment.class_subject_id);
  if (!isEnrolled) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not actively enrolled in the class for this assessment' } });
  }

  if (assessment.publishing_audience === 'selected') {
    const isTargeted = await assRepo.isStudentTargeted(assessment.id, user.profile.id);
    if (!isTargeted) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' } });
    }
  }

  const now = new Date();
  const deadline = new Date(assessment.deadline_at);
  const existingSub = await subRepo.getSubmissionByAssessmentAndStudent(assessment.id, user.profile.id);
  if (existingSub && now > deadline) {
    return res.status(403).json({
      error: { code: 'EDIT_DEADLINE_PASSED', message: 'Cannot modify or save drafts after the original submission deadline has passed' }
    });
  }

  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const quizAnswers = Array.isArray(req.body.quiz_answers) ? req.body.quiz_answers : [];
  const sectionStatuses = typeof req.body.section_statuses === 'object' && req.body.section_statuses !== null ? req.body.section_statuses : {};
  const draft = await subRepo.saveDraftSubmission(assessmentId, user.profile.id, answers, quizAnswers, sectionStatuses);
  return res.status(200).json({ success: true, draft });
});

router.post('/', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const assRepo = getAssessmentRepository();

  const parseResult = MultiFileSubmissionRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: { code: 'INVALID_PAYLOAD', message: 'Invalid submission request', details: parseResult.error.errors }
    });
  }

  const { assessment_id, files, answers } = parseResult.data;
  const fullAssessment = await assRepo.getFullAssessment(assessment_id);

  if (!fullAssessment) {
    return res.status(404).json({
      error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment does not exist' }
    });
  }

  if (fullAssessment.status !== 'published') {
    return res.status(400).json({
      error: { code: 'ASSESSMENT_NOT_OPEN', message: 'Cannot submit to an assessment that is not published' }
    });
  }

  const isEnrolled = await assRepo.isEnrolledStudent(user.profile.id, fullAssessment.class_subject_id);
  if (!isEnrolled) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'You are not actively enrolled in the class for this assessment' }
    });
  }

  if (fullAssessment.publishing_audience === 'selected') {
    const isTargeted = await assRepo.isStudentTargeted(fullAssessment.id, user.profile.id);
    if (!isTargeted) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' }
      });
    }
  }

  const existingSubmission = await subRepo.getSubmissionByAssessmentAndStudent(fullAssessment.id, user.profile.id);
  const isResubmission = Boolean(existingSubmission);

  const types = fullAssessment.assessment_types && fullAssessment.assessment_types.length > 0
    ? fullAssessment.assessment_types
    : (fullAssessment.questions?.length > 0 ? ['manual_questions'] : ['file_based']);

  // 1. Validate File-Based Submissions
  if (types.includes('file_based')) {
    const hasFiles = (files && files.length > 0) || (parseResult.data.keep_existing_files && isResubmission);
    if (!hasFiles) {
      return res.status(400).json({
        error: {
          code: 'FILE_REQUIRED',
          message: 'At least one answer file (PDF, PPT, PPTX, DOC, or DOCX) must be uploaded for file-based assessment.'
        }
      });
    }
  }

  // 2. Validate Manual Questions Answering
  if (types.includes('manual_questions')) {
    const manualQuestions = fullAssessment.questions || [];
    if (manualQuestions.length > 0) {
      const unansweredQuestions = manualQuestions.filter((q: any) => {
        const userAns = (answers || []).find((a: any) => a.question_id === q.id);
        return !userAns || !userAns.answer_text || userAns.answer_text.trim().length === 0;
      });

      if (unansweredQuestions.length > 0) {
        return res.status(400).json({
          error: {
            code: 'QUESTIONS_UNANSWERED',
            message: `All manual questions must be answered before submitting (${unansweredQuestions.length} unanswered).`,
            unanswered_question_ids: unansweredQuestions.map((q: any) => q.id)
          }
        });
      }
    }
  }

  // 3. Validate Quiz Questions
  if (types.includes('quiz')) {
    const quizQuestions = fullAssessment.quiz_questions || [];
    if (quizQuestions.length > 0) {
      const unansweredQuiz = quizQuestions.filter((qq: any) => {
        const userAns = (parseResult.data.quiz_answers || []).find((qa: any) => qa.quiz_question_id === qq.id);
        return !userAns || !userAns.selected_option_id;
      });

      if (unansweredQuiz.length > 0) {
        return res.status(400).json({
          error: {
            code: 'QUIZ_UNANSWERED',
            message: `All quiz questions must be answered before submitting (${unansweredQuiz.length} unanswered).`,
            unanswered_quiz_question_ids: unansweredQuiz.map((q: any) => q.id)
          }
        });
      }
    }
  }

  // 2. Validate Files (if any attached)
  const maxAllowedFiles = Number(fullAssessment.max_files || 1);
  if (files && files.length > maxAllowedFiles) {
    return res.status(400).json({
      error: {
        code: 'MAX_FILES_EXCEEDED',
        message: `Submission exceeds maximum allowed file count of ${maxAllowedFiles} (received ${files.length})`
      }
    });
  }

  // 3. Deadline and Editing Authorization (Strict Server-Side Database Clock)
  const now = new Date();
  const deadline = new Date(fullAssessment.deadline_at);
  const allowLate = Boolean(fullAssessment.allow_late);
  const extensionDeadline = fullAssessment.extension_deadline_at ? new Date(fullAssessment.extension_deadline_at) : null;

  let lateStatus: 'on_time' | 'late' = 'on_time';

  if (isResubmission) {
    // Requirement 4: Editing after submission is strictly restricted to BEFORE the ORIGINAL deadline
    if (now > deadline) {
      return res.status(403).json({
        error: {
          code: 'EDIT_DEADLINE_PASSED',
          message: 'Submitted assignments cannot be modified after the original deadline has passed.'
        }
      });
    }
  } else {
    // First submission: verify original deadline or extension window
    if (now > deadline) {
      if (!allowLate) {
        return res.status(400).json({
          error: {
            code: 'DEADLINE_EXCEEDED',
            message: 'The deadline for this assessment has passed and late submissions are not permitted.'
          }
        });
      }
      if (extensionDeadline && now > extensionDeadline) {
        return res.status(400).json({
          error: {
            code: 'DEADLINE_EXCEEDED',
            message: 'The extended deadline for late submissions has elapsed.'
          }
        });
      }
      lateStatus = 'late';
    }
  }

  let validatedFiles: any[] = [];
  let totalBytes = 0;

  if (files && files.length > 0) {
    for (const item of files) {
      const fileBuffer = Buffer.from(item.file_base64, 'base64');
      const sizeBytes = fileBuffer.length;
      totalBytes += sizeBytes;

      if (sizeBytes > 20971520) {
        return res.status(400).json({
          error: { code: 'FILE_TOO_LARGE', message: `File ${item.file_name} exceeds 20 MB limit` }
        });
      }

      const detectedMime = detectMagicMime(fileBuffer, item.file_name);
      if (!detectedMime) {
        return res.status(400).json({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: `File ${item.file_name} is not an authentic PDF, PPT, PPTX, DOC, or DOCX file binary signature.`
          }
        });
      }

      const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
      validatedFiles.push({
        file_name: item.file_name,
        file_size: sizeBytes,
        buffer: fileBuffer,
        mime_type: detectedMime,
        sha256
      });
    }

    if (totalBytes > 20971520) {
      return res.status(400).json({
        error: { code: 'TOTAL_SIZE_EXCEEDED', message: 'Combined submission size exceeds 20 MB' }
      });
    }
  } else if (parseResult.data.keep_existing_files && isResubmission && existingSubmission) {
    const activeVer = await subRepo.getActiveVersion(existingSubmission.id);
    if (activeVer && Array.isArray(activeVer.files) && activeVer.files.length > 0) {
      validatedFiles = activeVer.files;
    }
  }

  const result = await subRepo.createOrUpdateSubmission({
    assessmentId: fullAssessment.id,
    studentId: user.profile.id,
    answers: answers || [],
    quizAnswers: parseResult.data.quiz_answers || [],
    sectionStatuses: parseResult.data.section_statuses || {},
    files: validatedFiles,
    serverTime: now,
    lateStatus
  });

  await logAuditEvent({
    actorId: user.profile.id,
    action: result.receipt.is_resubmission ? 'SUBMISSION_RESUBMITTED' : 'SUBMISSION_CREATED',
    resourceType: 'submission',
    resourceId: result.submission.id,
    after: {
      version: result.receipt.version,
      files_count: result.receipt.file_count,
      answers_count: (answers || []).length,
      late_status: result.receipt.late_status
    },
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(result.receipt.is_resubmission ? 200 : 201).json({
    receipt: result.receipt,
    version: result.version
  });
});

router.get('/reports/late-submissions', requireRoles(['subject_teacher', 'class_teacher', 'proctor', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const { assessment_id } = req.query as { assessment_id?: string };
  const subRepo = getSubmissionRepository();

  let menteesHierarchy: any[] | undefined = undefined;
  let subjectsHierarchy: any[] | undefined = undefined;
  const effectiveRole = user.activeRole || (
    user.isHOD ? 'hod' :
    user.roles.includes('proctor') ? 'proctor' :
    user.roles[0]
  );
  if (effectiveRole === 'proctor' || user.roles.includes('proctor')) {
    menteesHierarchy = await subRepo.getMenteeSubmissionsHierarchy(user.profile.id);
    subjectsHierarchy = await subRepo.getProctorSubjectsHierarchy(user.profile.id);
  }

  const reportRows = await subRepo.getLateSubmissionsReport(user, assessment_id);
  return res.status(200).json({ reports: reportRows, mentees: menteesHierarchy, subjects: subjectsHierarchy });
});

// Dedicated Proctor Mentee Progress endpoint
router.get('/reports/mentee-progress', requireRoles(['proctor', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const mentees = await subRepo.getMenteeSubmissionsHierarchy(user.profile.id);
  const subjects = await subRepo.getProctorSubjectsHierarchy(user.profile.id);
  return res.status(200).json({ mentees, subjects });
});

// Student: Authoritative My Submissions endpoint
router.get('/student/my-submissions', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const assRepo = getAssessmentRepository();

  try {
    const list = await subRepo.listSubmissionsForStudent(user.profile.id);

    const enriched = await Promise.all(
      list.map(async (sub) => {
        const fullAss = await assRepo.getFullAssessment(sub.assessment_id).catch(() => null);

        // Sanitize evaluation: Only disclose scores and feedback if published
        let evaluationInfo: any = null;
        if (sub.evaluation) {
          const isPublished = sub.evaluation.status === 'published';
          evaluationInfo = {
            id: sub.evaluation.id,
            status: isPublished ? 'published' : 'under_evaluation',
            updated_at: sub.evaluation.updated_at,
            ...(isPublished ? {
              total_score: sub.evaluation.total_score,
              raw_score: sub.evaluation.raw_score,
              late_penalty_deducted: sub.evaluation.late_penalty_deducted,
              general_feedback: sub.evaluation.general_feedback,
              criterion_scores: sub.evaluation.criterion_scores || []
            } : {})
          };
        }

        const activeVer = sub.active_version;
        const rawFiles = activeVer?.files;
        const files = (rawFiles && Array.isArray(rawFiles) && rawFiles.length > 0)
          ? rawFiles
          : (activeVer?.storage_path ? [{
              id: 'primary',
              storage_key: activeVer.storage_path,
              original_filename: activeVer.original_name || 'submission.pdf',
              file_size_bytes: activeVer.size_bytes || 0,
              mime_type: activeVer.mime_type || 'application/pdf',
              uploaded_at: activeVer.uploaded_at
            }] : []);

        return {
          id: sub.id,
          assessment_id: sub.assessment_id,
          assessment_title: fullAss?.title || 'Assessment',
          assessment_instructions: fullAss?.instructions || '',
          max_marks: fullAss?.max_marks || 50,
          deadline_at: fullAss?.deadline_at,
          class_details: fullAss?.class_details || null,
          subject_details: fullAss?.subject_details || null,
          status: sub.status,
          late_status: sub.late_status || activeVer?.late_status || 'on_time',
          first_submitted_at: sub.first_submitted_at,
          updated_at: sub.updated_at || activeVer?.uploaded_at,
          version_number: activeVer?.version || 1,
          active_version_id: sub.active_version_id,
          files_count: files.length,
          total_size_bytes: activeVer?.size_bytes || files.reduce((acc: number, f: any) => acc + (f.file_size_bytes || 0), 0),
          files,
          answers: activeVer?.answers || [],
          versions: sub.versions || [],
          evaluation: evaluationInfo
        };
      })
    );

    return res.status(200).json({ submissions: enriched });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'FETCH_SUBMISSIONS_FAILED', message: err.message || 'Failed to retrieve student submissions' }
    });
  }
});

router.get('/assessment/:assessmentId', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();

  if (user.activeRole === 'proctor') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Proctors cannot view assessment submissions ledger' } });
  }

  const assessment = await assRepo.getAssessmentById(req.params.assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  if (user.roles.includes('student')) {
    if (assessment.publishing_audience === 'selected') {
      const isTargeted = await assRepo.isStudentTargeted(assessment.id, user.profile.id);
      if (!isTargeted) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not assigned to this targeted assessment' } });
      }
    }
    const studentSub = await subRepo.getSubmissionByAssessmentAndStudent(assessment.id, user.profile.id);
    const full = studentSub ? await subRepo.getFullSubmission(studentSub.id) : null;
    return res.status(200).json({ submissions: full ? [full] : [] });
  }

  if (user.roles.includes('class_teacher') && !user.isHOD && !user.roles.includes('subject_teacher')) {
    const isClassTeacher = await assRepo.isClassTeacherForAssessment(user.profile.id, assessment.class_subject_id);
    if (!isClassTeacher) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not the class teacher for this assessment class' } });
    }
  }

  if (!user.isHOD && !user.roles.includes('subject_teacher') && !user.roles.includes('class_teacher')) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized role' } });
  }

  const submissions = await subRepo.listSubmissionsForAssessment(assessment.id);
  return res.status(200).json({ submissions });
});

async function isUserAuthorizedForSubmission(user: any, submission: any): Promise<boolean> {
  if (user.roles.includes('student')) {
    return submission.student_id === user.profile.id;
  }

  const effectiveRole = user.activeRole;
  if (effectiveRole === 'proctor') {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    return mentees.some(m => m.student_id === submission.student_id && !m.valid_to);
  }

  if (user.isHOD && (!effectiveRole || effectiveRole === 'hod')) return true;

  const assRepo = getAssessmentRepository();
  const ass = await assRepo.getAssessmentById(submission.assessment_id);
  if (!ass) return false;

  if (effectiveRole === 'subject_teacher' || (!effectiveRole && user.roles.includes('subject_teacher'))) {
    const isTeacher = await assRepo.isAuthorizedTeacher(user.profile.id, ass.class_subject_id);
    if (isTeacher) return true;
  }
  if (effectiveRole === 'class_teacher' || (!effectiveRole && user.roles.includes('class_teacher'))) {
    const isClassTeacher = await assRepo.isClassTeacherForAssessment(user.profile.id, ass.class_subject_id);
    if (isClassTeacher) return true;
  }
  if (!effectiveRole && user.roles.includes('proctor')) {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    const isMentee = mentees.some(m => m.student_id === submission.student_id && !m.valid_to);
    if (isMentee) return true;
  }
  return false;
}

router.get('/:id', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getFullSubmission(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission' } });
  }

  return res.status(200).json({ submission });
});

router.get('/:id/versions', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getSubmissionById(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission versions' } });
  }

  const versions = await subRepo.getSubmissionVersions(submission.id);
  return res.status(200).json({ versions });
});

router.get('/:id/versions/:versionId/download', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getSubmissionById(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission' } });
  }

  const version = await subRepo.getActiveVersion(submission.id);
  if (!version) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
  }

  if (!version.storage_path) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'No file attached to this submission version' } });
  }

  const file = await subRepo.downloadSubmissionFile(version.storage_path);
  if (!file) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'Binary not found in storage' } });
  }

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(version.original_name || 'submission.pdf')}"`);
  return res.send(file.buffer);
});

// Download specific file from multi-file submission version
router.get('/:id/versions/:versionId/files/:fileId/download', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getSubmissionById(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission file' } });
  }

  const version = await subRepo.getActiveVersion(submission.id);
  if (!version) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
  }

  const files = (version.files && Array.isArray(version.files)) ? version.files : [];
  const targetFile = files.find((f: any) => f.id === req.params.fileId) || {
    id: req.params.fileId,
    storage_key: version.storage_path || '',
    original_filename: version.original_name || 'file',
    mime_type: version.mime_type || 'application/octet-stream'
  };

  if (!targetFile.storage_key) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
  }

  const fileData = await subRepo.downloadSubmissionFile(targetFile.storage_key);
  if (!fileData) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
  }

  res.setHeader('Content-Type', targetFile.mime_type || fileData.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(targetFile.original_filename || 'file')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(fileData.buffer);
});

// Stream specific file for in-app inline preview (e.g. PDF canvas viewing)
router.get('/:id/versions/:versionId/files/:fileId/blob', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getSubmissionById(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission file' } });
  }

  const version = await subRepo.getActiveVersion(submission.id);
  if (!version) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
  }

  const files = (version.files && Array.isArray(version.files)) ? version.files : [];
  const targetFile = files.find((f: any) => f.id === req.params.fileId) || {
    id: req.params.fileId,
    storage_key: version.storage_path || '',
    original_filename: version.original_name || 'file.pdf',
    mime_type: version.mime_type || 'application/pdf'
  };

  if (!targetFile.storage_key) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
  }

  const fileData = await subRepo.downloadSubmissionFile(targetFile.storage_key);
  if (!fileData) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } });
  }

  res.setHeader('Content-Type', targetFile.mime_type || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(targetFile.original_filename || 'file.pdf')}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(fileData.buffer);
});

// Get short-lived signed URL for direct high-performance preview/download from private storage
router.get('/:id/versions/:versionId/files/:fileId/url', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const subRepo = getSubmissionRepository();
  const submission = await subRepo.getSubmissionById(req.params.id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const authorized = await isUserAuthorizedForSubmission(user, submission);
  if (!authorized) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized access to submission file' } });
  }

  const version = await subRepo.getActiveVersion(submission.id);
  if (!version) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
  }

  const files = (version.files && Array.isArray(version.files)) ? version.files : [];
  const targetFile = files.find((f: any) => f.id === req.params.fileId) || {
    id: req.params.fileId,
    storage_key: version.storage_path || '',
    original_filename: version.original_name || 'file',
    mime_type: version.mime_type || 'application/pdf',
    file_size_bytes: version.size_bytes
  };

  if (!targetFile.storage_key) {
    return res.status(404).json({ error: { code: 'FILE_NOT_FOUND', message: 'No file attached to this version' } });
  }

  const signedUrl = await subRepo.getSignedSubmissionFileUrl(targetFile.storage_key, 3600);

  return res.status(200).json({
    file: {
      id: targetFile.id,
      filename: targetFile.original_filename,
      mime_type: targetFile.mime_type,
      size_bytes: targetFile.file_size_bytes,
      signed_url: signedUrl,
      download_url: `/api/v1/submissions/${submission.id}/versions/${version.id}/files/${targetFile.id}/download`
    }
  });
});

export default router;
