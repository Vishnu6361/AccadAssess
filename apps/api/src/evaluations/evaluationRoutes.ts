import { Router, Request, Response } from 'express';
import { 
  SaveEvaluationRequestSchema,
  PublishAssessmentResultsRequestSchema
} from '@smartfa/contracts';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT, supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';
import { getEvaluationRepository } from '../storage/evaluationRepository.js';
import { getSubmissionRepository } from '../storage/submissionRepository.js';
import { getAssessmentRepository } from '../storage/assessmentRepository.js';
import { getAcademicRepository } from '../storage/academicRepository.js';
import { db } from '../storage/db.js';

const router = Router();

router.use(authenticateJWT);
router.use(loadUserContext);
function getAdminClient() {
  if (!supabaseAdmin) throw new Error('Supabase admin client not initialized');
  return supabaseAdmin;
}


// Stage 1: Published assignments overview for evaluating faculty
router.get('/teacher/assignments-overview', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();
  const evalRepo = getEvaluationRepository();

  try {
    const allAssessments = await assRepo.listAssessments(user);
    const publishedAssessments = allAssessments.filter(a => a.status === 'published');

    const overview = await Promise.all(
      publishedAssessments.map(async (ass) => {
        const fullAss = await assRepo.getFullAssessment(ass.id).catch(() => ass);

        let enrolledCount = 0;
        let isPublished = false;

        if (isLiveSupabaseConfigured && Boolean(supabaseAdmin)) {
          // 1. Get class_id and subject details from class_subjects
          const { data: cs } = await getAdminClient().from('class_subjects')
            .select('class_id, subject_id, subject:subjects(specialization_id)')
            .eq('id', ass.class_subject_id)
            .maybeSingle();

          if (cs) {
            let subSpecId = (cs as any)?.subject?.specialization_id || null;
            if (!subSpecId && cs.subject_id) {
              const { data: ss } = await getAdminClient().from('subject_specializations')
                .select('specialization_id')
                .eq('subject_id', cs.subject_id)
                .maybeSingle();
              if (ss?.specialization_id) subSpecId = ss.specialization_id;
            }

            let enrQuery = getAdminClient().from('enrollments')
              .select('id', { count: 'exact', head: true })
              .eq('class_id', cs.class_id)
              .eq('status', 'active');
            if (subSpecId) {
              enrQuery = enrQuery.eq('specialization_id', subSpecId);
            }
            const { count } = await enrQuery;
            enrolledCount = count || 0;
          }

          // 2. Check if published
          const { data: pubRec } = await getAdminClient().from('result_publications')
            .select('id')
            .eq('assessment_id', ass.id)
            .maybeSingle();
          isPublished = Boolean(pubRec);
        } else {
          const cs = db.classSubjects.find(c => c.id === ass.class_subject_id);
          const sub = cs ? db.subjects.find(s => s.id === cs.subject_id) : null;
          const subSpecId = (sub as any)?.specialization_id ||
            db.subject_specializations?.find(ss => ss.subject_id === sub?.id)?.specialization_id ||
            null;
          if (cs) {
            enrolledCount = db.enrollments.filter(e => {
              if (e.class_id !== cs.class_id || e.status !== 'active') return false;
              if (subSpecId) return e.specialization_id === subSpecId;
              return true;
            }).length;
          }
          isPublished = db.resultPublications.some(rp => rp.assessment_id === ass.id);
        }

        const subs = await subRepo.listSubmissionsForAssessment(ass.id);
        const evals = await evalRepo.listEvaluationsForAssessment(ass.id);

        const submittedCount = subs.length;
        const evaluatedCount = subs.filter(s => {
          const ev = evals.find(e => e.submission_id === s.id);
          return ev && (ev.status === 'completed' || ev.status === 'published');
        }).length;

        const awaitingCount = Math.max(0, submittedCount - evaluatedCount);
        const publishedCount = isPublished ? evaluatedCount : evals.filter(e => e.status === 'published').length;

        return {
          id: ass.id,
          title: fullAss?.title || ass.title,
          max_marks: Number(fullAss?.max_marks || ass.max_marks || 50),
          deadline_at: fullAss?.deadline_at || ass.deadline_at,
          extension_deadline_at: fullAss?.extension_deadline_at || ass.extension_deadline_at || null,
          allow_late: Boolean(ass.allow_late),
          class_details: fullAss?.class_details || null,
          subject_details: fullAss?.subject_details || null,
          class_subject_id: ass.class_subject_id,
          summary: {
            total_enrolled: enrolledCount,
            submitted_count: submittedCount,
            evaluated_count: evaluatedCount,
            awaiting_count: awaitingCount,
            is_published: isPublished,
            published_count: publishedCount
          }
        };
      })
    );

    return res.status(200).json({ assignments: overview });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'OVERVIEW_FETCH_FAILED', message: err.message || 'Failed to retrieve assignments overview' }
    });
  }
});

// Stage 2: Student submission ledger for selected assessment
router.get('/assessment/:assessmentId/ledger', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();
  const evalRepo = getEvaluationRepository();

  const assessment = await assRepo.getFullAssessment(req.params.assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  if (!user.isHOD) {
    const isAuth = await assRepo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' } });
    }
  }

  try {
    let enrolledStudents: any[] = [];
    let isPublished = false;

    if (isLiveSupabaseConfigured && Boolean(supabaseAdmin)) {
      const { data: cs } = await getAdminClient().from('class_subjects')
        .select('class_id, subject_id, subject:subjects(specialization_id)')
        .eq('id', assessment.class_subject_id)
        .maybeSingle();

      if (cs) {
        let subSpecId = (cs as any)?.subject?.specialization_id || null;
        if (!subSpecId && cs.subject_id) {
          const { data: ss } = await getAdminClient().from('subject_specializations')
            .select('specialization_id')
            .eq('subject_id', cs.subject_id)
            .maybeSingle();
          if (ss?.specialization_id) subSpecId = ss.specialization_id;
        }

        let enrQuery = getAdminClient().from('enrollments')
          .select('student_id, specialization_id, profiles(id, full_name, email, usn)')
          .eq('class_id', cs.class_id)
          .eq('status', 'active');

        if (subSpecId) {
          enrQuery = enrQuery.eq('specialization_id', subSpecId);
        }

        const { data: enrollments } = await enrQuery;

        enrolledStudents = (enrollments || []).map(e => (e as any).profiles).filter(Boolean);
      }

      const { data: pubRec } = await getAdminClient().from('result_publications')
        .select('id')
        .eq('assessment_id', assessment.id)
        .maybeSingle();
      isPublished = Boolean(pubRec);
    } else {
      const cs = db.classSubjects.find(c => c.id === assessment.class_subject_id);
      const sub = cs ? db.subjects.find(s => s.id === cs.subject_id) : null;
      const subSpecId = (sub as any)?.specialization_id ||
        db.subject_specializations?.find(ss => ss.subject_id === sub?.id)?.specialization_id ||
        null;
      if (cs) {
        enrolledStudents = db.enrollments
          .filter(e => {
            if (e.class_id !== cs.class_id || e.status !== 'active') return false;
            if (subSpecId) return e.specialization_id === subSpecId;
            return true;
          })
          .map(e => db.profiles.find(p => p.id === e.student_id))
          .filter(Boolean);
      }
      isPublished = db.resultPublications.some(rp => rp.assessment_id === assessment.id);
    }

    const subs = await subRepo.listSubmissionsForAssessment(assessment.id);
    const evals = await evalRepo.listEvaluationsForAssessment(assessment.id);

    // Build ledger rows for EVERY enrolled student
    const ledger = enrolledStudents.map(student => {
      const sub = subs.find(s => s.student_id === student.id);
      const activeVer = sub?.active_version;
      const evaluation = sub ? evals.find(e => e.submission_id === sub.id) : null;

      const isSubmitted = Boolean(sub);
      const isLate = Boolean(sub?.late_status === 'late' || activeVer?.late_status === 'late');

      let evalStatus: 'not_submitted' | 'pending' | 'draft' | 'completed' | 'published' = 'not_submitted';
      if (isSubmitted) {
        if (isPublished || evaluation?.status === 'published') {
          evalStatus = 'published';
        } else if (evaluation?.status === 'completed') {
          evalStatus = 'completed';
        } else if (evaluation?.status === 'draft') {
          evalStatus = 'draft';
        } else {
          evalStatus = 'pending';
        }
      }

      const files = (activeVer?.files && Array.isArray(activeVer.files) && activeVer.files.length > 0)
        ? activeVer.files
        : (activeVer?.storage_path ? [{
            id: 'primary',
            storage_key: activeVer.storage_path,
            original_filename: activeVer.original_name || 'submission.pdf',
            file_size_bytes: activeVer.size_bytes || 0,
            mime_type: activeVer.mime_type || 'application/pdf',
            uploaded_at: activeVer.uploaded_at
          }] : []);

      return {
        student_id: student.id,
        student_name: student.full_name,
        student_email: student.email,
        student_usn: student.usn || '—',
        is_submitted: isSubmitted,
        submission_status: isSubmitted ? 'Submitted' : 'Not Submitted',
        timing_status: isSubmitted ? (isLate ? 'Late' : 'On Time') : '—',
        is_late: isLate,
        submitted_at: activeVer?.uploaded_at || sub?.first_submitted_at || null,
        version_number: activeVer?.version || 1,
        files_count: files.length,
        files,
        answers: activeVer?.answers || [],
        versions: sub?.versions || [],
        evaluation_status: evalStatus,
        evaluation: evaluation ? {
          id: evaluation.id,
          status: evaluation.status,
          raw_score: evaluation.raw_score,
          late_penalty_deducted: evaluation.late_penalty_deducted,
          total_score: evaluation.total_score,
          general_feedback: evaluation.general_feedback,
          criterion_scores: evaluation.criterion_scores || [],
          updated_at: evaluation.updated_at
        } : null,
        submission: sub ? {
          id: sub.id,
          active_version_id: sub.active_version_id,
          status: sub.status,
          late_status: sub.late_status
        } : null
      };
    });

    const submittedCount = ledger.filter(r => r.is_submitted).length;
    const evaluatedCount = ledger.filter(r => r.evaluation_status === 'completed' || r.evaluation_status === 'published').length;
    const awaitingCount = Math.max(0, submittedCount - evaluatedCount);

    return res.status(200).json({
      assessment,
      ledger,
      summary: {
        total_enrolled: enrolledStudents.length,
        submitted_count: submittedCount,
        evaluated_count: evaluatedCount,
        awaiting_count: awaitingCount,
        is_published: isPublished
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'LEDGER_FETCH_FAILED', message: err.message || 'Failed to retrieve assessment ledger' }
    });
  }
});

router.get('/assessment/:assessmentId', async (req: Request, res: Response) => {
  const user = req.userContext!;
  if (user.roles.includes('student') || user.activeRole === 'proctor' || (user.roles.includes('proctor') && !user.isHOD && !user.roles.includes('subject_teacher'))) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Unauthorized to view assessment evaluations directly' }
    });
  }

  const evalRepo = getEvaluationRepository();
  const assRepo = getAssessmentRepository();

  const assessment = await assRepo.getAssessmentById(req.params.assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  if (assessment.status === 'deletion_pending') {
    return res.status(409).json({ error: { code: 'DELETION_PENDING', message: 'Cannot publish grades: This assessment is scheduled for deletion.' } });
  }

  const evaluations = await evalRepo.listEvaluationsForAssessment(assessment.id);
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';
  let isPublished = false;

  if (!isTestMode && isLiveSupabaseConfigured && Boolean(supabaseAdmin)) {
    const { data: pubRec } = await getAdminClient().from('result_publications')
      .select('id')
      .eq('assessment_id', assessment.id)
      .maybeSingle();
    isPublished = Boolean(pubRec);
  } else {
    isPublished = db.resultPublications.some(rp => rp.assessment_id === assessment.id);
  }

  return res.status(200).json({
    evaluations,
    is_published: isPublished
  });
});

router.get('/submission/:submissionId', async (req: Request, res: Response) => {
  const user = req.userContext!;
  const evalRepo = getEvaluationRepository();
  const subRepo = getSubmissionRepository();

  const submission = await subRepo.getSubmissionById(req.params.submissionId);
  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  if (user.roles.includes('student') && submission.student_id !== user.profile.id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  }

  if (user.activeRole === 'proctor' || (user.roles.includes('proctor') && !user.isHOD && !user.roles.includes('subject_teacher'))) {
    const academicRepo = getAcademicRepository();
    const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
    const isMentee = mentees.some(m => m.student_id === submission.student_id && !m.valid_to);
    if (!isMentee) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only view evaluations for your assigned mentees' } });
    }
  }

  const evaluation = await evalRepo.getEvaluationBySubmissionId(submission.id);
  if (!evaluation) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evaluation not found' } });
  }

  if (user.roles.includes('student') && evaluation.status !== 'published') {
    return res.status(403).json({ error: { code: 'RESULTS_NOT_PUBLISHED', message: 'Evaluation results not published yet' } });
  }

  return res.status(200).json({ evaluation });
});

router.post('/', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const evalRepo = getEvaluationRepository();
  const subRepo = getSubmissionRepository();
  const assRepo = getAssessmentRepository();

  const parseResult = SaveEvaluationRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid evaluation payload', details: parseResult.error.errors }
    });
  }

  const body = parseResult.data;
  const submission = await subRepo.getSubmissionById(body.submission_id);

  if (!submission) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
  }

  const assessment = await assRepo.getAssessmentById(submission.assessment_id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  if (assessment.status === 'deletion_pending') {
    return res.status(409).json({ error: { code: 'DELETION_PENDING', message: 'This assessment is scheduled for deletion and cannot accept evaluations.' } });
  }

  if (!user.isHOD) {
    const isAuth = await assRepo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' } });
    }
  }

  const fullAss = await assRepo.getFullAssessment(assessment.id);
  const allCriteria: any[] = [];
  if (fullAss?.assignment_rubric?.criteria) {
    allCriteria.push(...fullAss.assignment_rubric.criteria);
  }
  if (fullAss?.questions) {
    for (const q of fullAss.questions) {
      if (q.rubric?.criteria) {
        allCriteria.push(...q.rubric.criteria);
      }
    }
  }

  if (body.criterion_scores && body.criterion_scores.length > 0) {
    for (const cs of body.criterion_scores) {
      const matchCrit = allCriteria.find(c => c.id === cs.criterion_id);
      if (matchCrit && cs.score > matchCrit.max_marks) {
        return res.status(400).json({
          error: {
            code: 'SCORE_EXCEEDS_MAX',
            message: `Score ${cs.score} exceeds maximum allowed marks of ${matchCrit.max_marks} for criterion "${matchCrit.title}"`
          }
        });
      }
    }
  }

  if (body.status === 'completed' && allCriteria.length > 0) {
    const scoredCritIds = new Set(body.criterion_scores?.map(cs => cs.criterion_id) || []);
    const missingCriteria = allCriteria.filter(c => !scoredCritIds.has(c.id));
    if (missingCriteria.length > 0) {
      return res.status(400).json({
        error: {
          code: 'INCOMPLETE_EVALUATION',
          message: 'Completed evaluation requires all criteria to be scored'
        }
      });
    }
  }

  const existingEval = await evalRepo.getEvaluationBySubmissionId(submission.id);
  if (existingEval?.status === 'published') {
    return res.status(400).json({
      error: {
        code: 'ALREADY_PUBLISHED',
        message: 'Cannot modify an already published evaluation'
      }
    });
  }

  try {
    const evaluation = await evalRepo.saveEvaluation({
      submissionId: submission.id,
      evaluatorId: user.profile.id,
      status: body.status,
      rawScore: body.raw_score,
      generalFeedback: body.general_feedback || undefined,
      criterionScores: body.criterion_scores
    });

    const auditAction = body.status === 'completed' ? 'COMPLETE_EVALUATION' : 'SAVE_EVALUATION_DRAFT';
    await logAuditEvent({
      actorId: user.profile.id,
      action: auditAction,
      resourceType: 'evaluation',
      resourceId: evaluation.id,
      after: {
        raw_score: evaluation.raw_score,
        late_penalty_deducted: evaluation.late_penalty_deducted,
        total_score: evaluation.total_score,
        status: evaluation.status
      },
      correlationId: req.headers['x-correlation-id'] as string
    });

    return res.status(existingEval ? 200 : 201).json({ evaluation });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'SERVER_ERROR', message: err.message || 'Failed to save evaluation' }
    });
  }
});

// Stage 4: Publish all grades for an assessment (strictly validated server-side)
router.post('/assessment/:assessmentId/publish', requireRoles(['subject_teacher', 'hod']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const evalRepo = getEvaluationRepository();
  const assRepo = getAssessmentRepository();
  const subRepo = getSubmissionRepository();

  const assessment = await assRepo.getAssessmentById(req.params.assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  if (assessment.status === 'deletion_pending') {
    return res.status(409).json({ error: { code: 'DELETION_PENDING', message: 'Cannot publish grades: This assessment is scheduled for deletion.' } });
  }

  if (!user.isHOD) {
    const isAuth = await assRepo.isAuthorizedTeacher(user.profile.id, assessment.class_subject_id);
    if (!isAuth) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Unauthorized teacher for this assessment' } });
    }
  }

  // 1. Prevent duplicate publication
  let alreadyPublished = false;
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true';
  if (!isTestMode && isLiveSupabaseConfigured && Boolean(supabaseAdmin)) {
    const { data: pubRec } = await getAdminClient().from('result_publications')
      .select('id')
      .eq('assessment_id', assessment.id)
      .maybeSingle();
    alreadyPublished = Boolean(pubRec);
  } else {
    alreadyPublished = db.resultPublications.some(rp => rp.assessment_id === assessment.id);
  }

  if (alreadyPublished) {
    return res.status(400).json({
      error: { code: 'ALREADY_PUBLISHED', message: 'Grades for this assessment have already been published.' }
    });
  }

  // 2. Query all submissions for this assessment
  const subs = await subRepo.listSubmissionsForAssessment(assessment.id);
  if (subs.length === 0) {
    return res.status(400).json({
      error: { code: 'NO_SUBMISSIONS', message: 'Cannot publish grades: No student submissions exist for this assessment.' }
    });
  }

  // 3. Verify that every submission has a completed evaluation
  const evals = await evalRepo.listEvaluationsForAssessment(assessment.id);
  const incompleteSubmissions = subs.filter(s => {
    const ev = evals.find(e => e.submission_id === s.id);
    return !ev || ev.status !== 'completed';
  });

  if (incompleteSubmissions.length > 0) {
    return res.status(400).json({
      error: {
        code: 'INCOMPLETE_EVALUATIONS',
        message: `Cannot publish grades: ${incompleteSubmissions.length} submitted assignment(s) are awaiting completed evaluation. All submitted coursework must be evaluated before publishing.`
      }
    });
  }

  const parseResult = PublishAssessmentResultsRequestSchema.safeParse(req.body);
  const remarks = parseResult.success && parseResult.data.remarks ? parseResult.data.remarks : undefined;

  const { publication, publishedCount } = await evalRepo.publishResults(assessment.id, user.profile.id, remarks);

  await logAuditEvent({
    actorId: user.profile.id,
    action: 'PUBLISH_ASSESSMENT_RESULTS',
    resourceType: 'result_publication',
    resourceId: publication.id,
    after: { assessment_id: assessment.id, published_evaluations_count: publishedCount },
    correlationId: req.headers['x-correlation-id'] as string
  });

  return res.status(200).json({
    publication,
    published_count: publishedCount,
    published_evaluations_count: publishedCount
  });
});

router.get('/student/my-results', requireRoles(['student']), async (req: Request, res: Response) => {
  const user = req.userContext!;
  const evalRepo = getEvaluationRepository();
  const results = await evalRepo.getStudentPublishedResults(user.profile.id);

  return res.status(200).json({ results });
});

router.get('/student/performance-dashboard', requireRoles(['student']), async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const evalRepo = getEvaluationRepository();
    const subjects = await evalRepo.getStudentPerformanceDashboard(user.profile.id);

    return res.status(200).json({ subjects });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: err.message || 'Failed to fetch student performance dashboard' }
    });
  }
});

router.get('/reports/class-teacher', requireRoles(['class_teacher', 'hod']), async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const evalRepo = getEvaluationRepository();
    const { class_id, subject_id, assessment_id } = req.query as {
      class_id?: string;
      subject_id?: string;
      assessment_id?: string;
    };

    const report = await evalRepo.getClassTeacherAcademicReport(user.profile.id, user.isHOD, {
      class_id,
      subject_id,
      assessment_id
    });

    return res.status(200).json(report);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: err.message || 'Failed to fetch class teacher report' }
    });
  }
});

router.get('/reports/proctor', requireRoles(['proctor', 'hod']), async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const evalRepo = getEvaluationRepository();
    const report = await evalRepo.getProctorAcademicReport(user.profile.id, user.isHOD);

    return res.status(200).json(report);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: err.message || 'Failed to fetch proctor report' }
    });
  }
});

router.get('/reports/hod', requireRoles(['hod']), async (req: Request, res: Response) => {
  try {
    const evalRepo = getEvaluationRepository();
    const { semester, class_id, section, subject_id, assessment_id, publication_status } = req.query as {
      semester?: string;
      class_id?: string;
      section?: string;
      subject_id?: string;
      assessment_id?: string;
      publication_status?: string;
    };

    const report = await evalRepo.getHodDepartmentAcademicReport({
      semester: semester ? Number(semester) : undefined,
      class_id,
      section,
      subject_id,
      assessment_id,
      publication_status
    });

    return res.status(200).json(report);
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'REPORT_ERROR', message: err.message || 'Failed to fetch HOD department report' }
    });
  }
});

router.get('/result-detail/:submissionId', async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const evalRepo = getEvaluationRepository();
    const subRepo = getSubmissionRepository();
    const academicRepo = getAcademicRepository();
    const assRepo = getAssessmentRepository();

    const submission = await subRepo.getSubmissionById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Submission not found' } });
    }

    // Role-based security checks
    if (user.isHOD || user.roles.includes('hod') || user.activeRole === 'hod') {
      // HOD has institutional oversight authorization
    } else if (user.roles.includes('student') || user.activeRole === 'student') {
      if (submission.student_id !== user.profile.id) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied: Cannot view another student results' } });
      }
    } else {
      // Faculty authorization checks: Must be either Subject Teacher, Class Teacher, or Proctor
      const assessment = await assRepo.getAssessmentById(submission.assessment_id);
      const classSubject = assessment ? await academicRepo.getClassSubjectById(assessment.class_subject_id) : null;

      let isAuthorizedFaculty = false;

      // 1. Subject Teacher check
      if (user.roles.includes('subject_teacher') && classSubject && classSubject.subject_teacher_id === user.profile.id) {
        isAuthorizedFaculty = true;
      }

      // 2. Class Teacher check
      if (!isAuthorizedFaculty && user.roles.includes('class_teacher') && classSubject) {
        const teacherClasses = await academicRepo.listClassesByTeacher(user.profile.id);
        if (teacherClasses.some((c: any) => c.id === classSubject.class_id)) {
          isAuthorizedFaculty = true;
        }
      }

      // 3. Proctor check
      if (!isAuthorizedFaculty && user.roles.includes('proctor')) {
        const mentees = await academicRepo.listProctorAssignmentsByProctor(user.profile.id);
        if (mentees.some(m => m.student_id === submission.student_id && (!m.valid_to || new Date(m.valid_to) > new Date()))) {
          isAuthorizedFaculty = true;
        }
      }

      if (!isAuthorizedFaculty) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Access denied: You are not authorized to view this student assessment result' }
        });
      }
    }

    const detail = await evalRepo.getDetailedResult(submission.id);
    if (!detail) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Result detail not found' } });
    }

    // Confidentiality check: Students can ONLY view official published evaluations
    const isStudentUser = user.roles.includes('student') || user.activeRole === 'student';
    if (isStudentUser && (!detail.evaluation || detail.evaluation.status !== 'published')) {
      return res.status(403).json({ error: { code: 'RESULTS_NOT_PUBLISHED', message: 'Evaluation results not published yet' } });
    }

    return res.status(200).json({ detail });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'DETAIL_ERROR', message: err.message || 'Failed to fetch result detail' }
    });
  }
});

export default router;
