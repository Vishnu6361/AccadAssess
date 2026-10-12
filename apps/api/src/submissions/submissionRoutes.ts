import { Router, Request, Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import { db } from '../storage/db.js';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';
import { 
  Submission, 
  SubmissionVersion, 
  SubmissionReceipt 
} from '@smartfa/contracts';

const router = Router();

// Authentication and user context required for all submission routes
router.use(authenticateJWT);
router.use(loadUserContext);

const UploadSubmissionSchema = z.object({
  assessment_id: z.string().uuid(),
  question_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  file_base64: z.string().min(1, 'File content required')
});

/**
 * Helper: Verify if current user is authorized teacher for class_subject
 */
function isAuthorizedTeacher(userId: string, classSubjectId: string): boolean {
  return db.classSubjects.some(
    cs => cs.id === classSubjectId && cs.subject_teacher_id === userId && cs.active
  );
}

/**
 * -----------------------------------------------------------------------------
 * 1. POST /submissions - Upload / Resubmit Question PDF Answer
 * -----------------------------------------------------------------------------
 */
router.post('/', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;

  const parseResult = UploadSubmissionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: parseResult.error.errors[0]?.message || 'Invalid upload payload' }
    });
  }

  const { assessment_id, question_id, file_name, file_base64 } = parseResult.data;

  // 1. Validate assessment exists and is published
  const assessment = db.assessments.find(a => a.id === assessment_id);
  if (!assessment) {
    return res.status(404).json({
      error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment not found' }
    });
  }

  if (assessment.status !== 'published') {
    return res.status(400).json({
      error: { 
        code: 'ASSESSMENT_NOT_OPEN', 
        message: `Submissions are only accepted for published assessments. Current status: ${assessment.status}` 
      }
    });
  }

  // 2. Validate submission deadline (Server Clock Authority)
  const now = new Date();
  const deadline = new Date(assessment.deadline_at);
  if (now > deadline) {
    return res.status(400).json({
      error: { 
        code: 'DEADLINE_PASSED', 
        message: `Submission deadline passed on ${deadline.toISOString()}. Submissions are locked.` 
      }
    });
  }

  // 3. Validate student active enrollment in the assessment's class
  const cs = db.classSubjects.find(c => c.id === assessment.class_subject_id);
  const isEnrolled = cs && db.enrollments.some(
    e => e.class_id === cs.class_id && e.student_id === user.profile.id && e.status === 'active'
  );

  if (!isEnrolled) {
    return res.status(403).json({
      error: { code: 'NOT_ENROLLED', message: 'You are not actively enrolled in the class for this assessment' }
    });
  }

  // 4. Validate question belongs to this assessment
  const question = db.questions.find(q => q.id === question_id && q.assessment_id === assessment.id);
  if (!question) {
    return res.status(400).json({
      error: { code: 'INVALID_QUESTION', message: 'Question does not belong to this assessment' }
    });
  }

  // 5. Decode file buffer
  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(file_base64, 'base64');
  } catch {
    return res.status(400).json({
      error: { code: 'INVALID_ENCODING', message: 'File must be a valid base64 encoded binary' }
    });
  }

  // 6. Enforce file size limit (Max 5 MB = 5,242,880 bytes)
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5242880 bytes
  if (fileBuffer.length === 0) {
    return res.status(400).json({
      error: { code: 'EMPTY_FILE', message: 'Uploaded file cannot be empty' }
    });
  }

  if (fileBuffer.length > MAX_FILE_SIZE) {
    return res.status(400).json({
      error: { 
        code: 'FILE_SIZE_EXCEEDED', 
        message: `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 5.00 MB` 
      }
    });
  }

  // 7. Enforce PDF Magic Bytes: First 5 bytes must be '%PDF-'
  const magic = fileBuffer.subarray(0, 5).toString('ascii');
  if (!magic.startsWith('%PDF-')) {
    return res.status(400).json({
      error: { 
        code: 'INVALID_FILE_TYPE', 
        message: 'File signature invalid. Only genuine PDF documents starting with %PDF- are permitted' 
      }
    });
  }

  // 8. Compute SHA-256 cryptographic fingerprint
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

  // 9. Check existing submission for (question_id, student_id)
  let submission = db.submissions.find(
    s => s.question_id === question.id && s.student_id === user.profile.id
  );

  const isResubmission = Boolean(submission);
  const nowIso = now.toISOString();
  let submissionId: string;
  let versionNumber = 1;

  if (submission) {
    submissionId = submission.id;
    // Find highest version number
    const existingVersions = db.submissionVersions.filter(v => v.submission_id === submissionId);
    versionNumber = existingVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;

    // Mark previous active version as superseded
    for (const v of existingVersions) {
      if (!v.superseded_at) {
        v.superseded_at = nowIso;
      }
    }
  } else {
    submissionId = randomUUID();
    submission = {
      id: submissionId,
      assessment_id: assessment.id,
      question_id: question.id,
      student_id: user.profile.id,
      active_version_id: null,
      status: 'uploaded',
      first_submitted_at: nowIso,
      updated_at: nowIso
    };
    db.submissions.push(submission);
  }

  // 10. Generate scoped private storage path
  // Standard format: assessments/{assId}/questions/{qId}/students/{studentId}/submissions/{subId}/v{ver}.pdf
  const storagePath = `assessments/${assessment.id}/questions/${question.id}/students/${user.profile.id}/submissions/${submissionId}/v${versionNumber}.pdf`;

  // Store PDF in private storage map
  db.storageBlobs.set(storagePath, fileBuffer);

  // 11. Create immutable SubmissionVersion record
  const versionId = randomUUID();
  const submissionVersion: SubmissionVersion = {
    id: versionId,
    submission_id: submissionId,
    version: versionNumber,
    storage_path: storagePath,
    original_name: file_name,
    mime_type: 'application/pdf',
    size_bytes: fileBuffer.length,
    sha256,
    uploaded_at: nowIso,
    superseded_at: null
  };
  db.submissionVersions.push(submissionVersion);

  // Link active version pointer
  submission.active_version_id = versionId;
  submission.status = 'uploaded';
  submission.updated_at = nowIso;

  // 12. Record Audit Event
  logAuditEvent({
    actorId: user.profile.id,
    action: isResubmission ? 'RESUBMIT_ANSWER' : 'SUBMIT_ANSWER',
    resourceType: 'submissions',
    resourceId: submission.id,
    after: {
      submission_id: submission.id,
      question_id: question.id,
      version: versionNumber,
      sha256,
      size_bytes: fileBuffer.length,
      storage_path: storagePath
    }
  });

  // 13. Return Submission Receipt
  const receipt: SubmissionReceipt = {
    submission_id: submission.id,
    version_id: versionId,
    version: versionNumber,
    status: 'uploaded',
    sha256,
    size_bytes: fileBuffer.length,
    uploaded_at: nowIso,
    is_resubmission: isResubmission,
    storage_path: storagePath
  };

  res.status(isResubmission ? 200 : 201).json({ receipt });
});

/**
 * -----------------------------------------------------------------------------
 * 2. GET /submissions/assessment/:assessmentId - Get assessment submissions
 * -----------------------------------------------------------------------------
 */
router.get('/assessment/:assessmentId', (req: Request, res: Response) => {
  const user = req.userContext!;
  const assessment = db.assessments.find(a => a.id === req.params.assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  // A. Student caller: return only their own submissions
  if (user.roles.includes('student') && !user.roles.includes('subject_teacher') && !user.isHOD) {
    const studentSubmissions = db.submissions
      .filter(s => s.assessment_id === assessment.id && s.student_id === user.profile.id)
      .map(s => {
        const versions = db.submissionVersions
          .filter(v => v.submission_id === s.id)
          .sort((a, b) => b.version - a.version);
        const activeVersion = versions.find(v => v.id === s.active_version_id) || versions[0] || null;
        return {
          ...s,
          active_version: activeVersion,
          versions
        };
      });

    return res.status(200).json({ submissions: studentSubmissions });
  }

  // B. Teacher caller: must be assigned teacher or HOD
  if (user.roles.includes('subject_teacher') && !user.isHOD) {
    if (!isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment class/subject' }
      });
    }
  }

  // Teacher or HOD: return all submissions for this assessment
  const allSubmissions = db.submissions
    .filter(s => s.assessment_id === assessment.id)
    .map(s => {
      const studentProfile = db.profiles.find(p => p.id === s.student_id);
      const versions = db.submissionVersions
        .filter(v => v.submission_id === s.id)
        .sort((a, b) => b.version - a.version);
      const activeVersion = versions.find(v => v.id === s.active_version_id) || versions[0] || null;

      return {
        ...s,
        student_name: studentProfile?.full_name || 'Unknown Student',
        student_email: studentProfile?.email || '',
        student_usn: studentProfile?.usn || null,
        active_version: activeVersion,
        versions
      };
    });

  res.status(200).json({ submissions: allSubmissions });
});

/**
 * -----------------------------------------------------------------------------
 * 3. GET /submissions/:id - Get single submission details
 * -----------------------------------------------------------------------------
 */
router.get('/:id', (req: Request, res: Response) => {
  const user = req.userContext!;
  const submission = db.submissions.find(s => s.id === req.params.id);
  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const assessment = db.assessments.find(a => a.id === submission.assessment_id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  // Authorization check
  if (user.roles.includes('student') && !user.roles.includes('subject_teacher') && !user.isHOD) {
    if (submission.student_id !== user.profile.id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cannot access another student\'s submission' }
      });
    }
  } else if (user.roles.includes('subject_teacher') && !user.isHOD) {
    if (!isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' }
      });
    }
  } else if (!user.isHOD) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  const versions = db.submissionVersions
    .filter(v => v.submission_id === submission.id)
    .sort((a, b) => b.version - a.version);
  const activeVersion = versions.find(v => v.id === submission.active_version_id) || versions[0] || null;

  res.status(200).json({
    submission: {
      ...submission,
      active_version: activeVersion,
      versions
    }
  });
});

/**
 * -----------------------------------------------------------------------------
 * 4. GET /submissions/:id/versions/:versionId/download - Secure PDF Download
 * -----------------------------------------------------------------------------
 */
router.get('/:id/versions/:versionId/download', (req: Request, res: Response) => {
  const user = req.userContext!;
  const submission = db.submissions.find(s => s.id === req.params.id);
  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const version = db.submissionVersions.find(
    v => v.id === req.params.versionId && v.submission_id === submission.id
  );
  if (!version) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission version not found' } });
  }

  const assessment = db.assessments.find(a => a.id === submission.assessment_id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  // Authorization check: student owner, assigned teacher, or HOD only
  if (user.roles.includes('student') && !user.roles.includes('subject_teacher') && !user.isHOD) {
    if (submission.student_id !== user.profile.id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cannot download another student\'s submission' }
      });
    }
  } else if (user.roles.includes('subject_teacher') && !user.isHOD) {
    if (!isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized to download submissions for this subject' }
      });
    }
  } else if (!user.isHOD) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  // Retrieve file buffer from private storage
  const fileBuffer = db.storageBlobs.get(version.storage_path);
  if (!fileBuffer) {
    return res.status(404).json({
      error: { code: 'STORAGE_OBJECT_NOT_FOUND', message: 'Physical file not found in storage' }
    });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${version.original_name}"`);
  res.setHeader('Content-Length', fileBuffer.length);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  res.status(200).send(fileBuffer);
});

export default router;
