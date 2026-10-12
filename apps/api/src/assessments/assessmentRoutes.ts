import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { 
  CreateAssessmentRequestSchema,
  UpdateAssessmentRequestSchema,
  CreateQuestionRequestSchema,
  UpdateQuestionRequestSchema,
  SaveRubricRequestSchema,
  Assessment,
  Question,
  RubricVersion,
  RubricCriterion,
  RubricLevel
} from '@smartfa/contracts';
import { db } from '../storage/db.js';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';

const router = Router();

// Authentication and user context required for all assessment routes
router.use(authenticateJWT);
router.use(loadUserContext);

/**
 * Helper: Assemble complete assessment with its questions, rubrics, criteria, and levels.
 */
function getFullAssessment(assessmentId: string) {
  const assessment = db.assessments.find(a => a.id === assessmentId);
  if (!assessment) return null;

  const questions = db.questions
    .filter(q => q.assessment_id === assessment.id)
    .sort((a, b) => a.display_order - b.display_order)
    .map(q => {
      const rubricVersion = db.rubricVersions.find(rv => rv.question_id === q.id);
      if (!rubricVersion) return { ...q, rubric: null };

      const criteria = db.rubricCriteria
        .filter(rc => rc.rubric_version_id === rubricVersion.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(rc => {
          const levels = db.rubricLevels
            .filter(rl => rl.criterion_id === rc.id)
            .sort((a, b) => a.display_order - b.display_order);
          return { ...rc, levels };
        });

      return {
        ...q,
        rubric: { ...rubricVersion, criteria }
      };
    });

  const cs = db.classSubjects.find(c => c.id === assessment.class_subject_id);
  const cls = cs ? db.classes.find(c => c.id === cs.class_id) : null;
  const sub = cs ? db.subjects.find(s => s.id === cs.subject_id) : null;

  return {
    ...assessment,
    class_details: cls ? `${cls.programme} Sem ${cls.semester}-${cls.section}` : 'Unknown Class',
    subject_details: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
    questions
  };
}

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
 * 1. GET /assessments - List assessments visible to caller
 * -----------------------------------------------------------------------------
 */
router.get('/', (req: Request, res: Response) => {
  const user = req.userContext!;

  if (user.isHOD) {
    // HOD sees all assessments
    const list = db.assessments.map(a => getFullAssessment(a.id));
    return res.status(200).json({ assessments: list });
  }

  if (user.roles.includes('subject_teacher')) {
    // Teacher sees assessments for their assigned class_subjects
    const assignedClassSubjectIds = db.classSubjects
      .filter(cs => cs.subject_teacher_id === user.profile.id && cs.active)
      .map(cs => cs.id);

    const list = db.assessments
      .filter(a => assignedClassSubjectIds.includes(a.class_subject_id))
      .map(a => getFullAssessment(a.id));

    return res.status(200).json({ assessments: list });
  }

  if (user.roles.includes('student')) {
    // Students only see PUBLISHED assessments for their enrolled class
    const studentEnrollments = db.enrollments
      .filter(e => e.student_id === user.profile.id && e.status === 'active')
      .map(e => e.class_id);

    const enrolledClassSubjectIds = db.classSubjects
      .filter(cs => studentEnrollments.includes(cs.class_id) && cs.active)
      .map(cs => cs.id);

    const list = db.assessments
      .filter(a => a.status === 'published' && enrolledClassSubjectIds.includes(a.class_subject_id))
      .map(a => getFullAssessment(a.id));

    return res.status(200).json({ assessments: list });
  }

  // Other roles (e.g., proctors) view high-level published status
  return res.status(200).json({ assessments: [] });
});

/**
 * -----------------------------------------------------------------------------
 * 2. GET /assessments/:id - Get assessment details
 * -----------------------------------------------------------------------------
 */
router.get('/:id', (req: Request, res: Response) => {
  const assessment = getFullAssessment(req.params.id);
  if (!assessment) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Assessment not found' }
    });
  }

  const user = req.userContext!;

  // Strict Role & Scope Enforcement for GET /:id
  if (user.isHOD) {
    return res.status(200).json({ assessment });
  }

  if (user.roles.includes('subject_teacher')) {
    if (!isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment class/subject' }
      });
    }
    return res.status(200).json({ assessment });
  }

  if (user.roles.includes('student')) {
    if (assessment.status !== 'published') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Unpublished assessments are invisible to students' }
      });
    }

    const cs = db.classSubjects.find(c => c.id === assessment.class_subject_id);
    const isEnrolled = cs && db.enrollments.some(
      e => e.class_id === cs.class_id && e.student_id === user.profile.id && e.status === 'active'
    );

    if (!isEnrolled) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Student is not enrolled in this assessment class' }
      });
    }

    return res.status(200).json({ assessment });
  }

  // Any other role (e.g. proctor, external user) denied
  return res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'You do not have permission to view this assessment' }
  });
});

/**
 * -----------------------------------------------------------------------------
 * 3. POST /assessments - Create draft assessment
 * -----------------------------------------------------------------------------
 */
router.post('/', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const body = CreateAssessmentRequestSchema.parse(req.body);
  const user = req.userContext!;

  // Authorization check: User must be the assigned subject teacher or HOD
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, body.class_subject_id)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN_UNASSIGNED_TEACHER',
        message: 'You are not assigned as the Subject Teacher for this class and subject'
      }
    });
  }

  // Deadline check: Common assessment deadline must be in the future
  const deadlineDate = new Date(body.deadline_at);
  if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
    return res.status(400).json({
      error: {
        code: 'INVALID_DEADLINE',
        message: 'Assessment deadline must be a valid timestamp in the future'
      }
    });
  }

  const assessment: Assessment = {
    id: randomUUID(),
    class_subject_id: body.class_subject_id,
    title: body.title,
    instructions: body.instructions,
    deadline_at: body.deadline_at,
    status: 'draft',
    created_by: user.profile.id,
    published_at: null,
    published_by: null,
    version: 1,
    questions: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.assessments.push(assessment);

  logAuditEvent({
    actorId: user.profile.id,
    action: 'CREATE_ASSESSMENT',
    resourceType: 'assessments',
    resourceId: assessment.id,
    after: assessment as any
  });

  res.status(201).json({ assessment });
});

/**
 * -----------------------------------------------------------------------------
 * 4. PUT /assessments/:id - Update draft assessment
 * -----------------------------------------------------------------------------
 */
router.put('/:id', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  // Lifecycle invariant: Published or closed assessments are locked
  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: {
        code: 'LIFECYCLE_LOCKED',
        message: `Cannot update assessment with status '${assessment.status}'. Only draft assessments may be edited.`
      }
    });
  }

  const body = UpdateAssessmentRequestSchema.parse(req.body);

  if (body.deadline_at) {
    const deadlineDate = new Date(body.deadline_at);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
      return res.status(400).json({
        error: { code: 'INVALID_DEADLINE', message: 'Deadline must be in the future' }
      });
    }
    assessment.deadline_at = body.deadline_at;
  }

  if (body.title) assessment.title = body.title;
  if (body.instructions) assessment.instructions = body.instructions;
  assessment.updated_at = new Date().toISOString();

  logAuditEvent({
    actorId: user.profile.id,
    action: 'UPDATE_ASSESSMENT',
    resourceType: 'assessments',
    resourceId: assessment.id,
    after: assessment as any
  });

  res.status(200).json({ assessment });
});

/**
 * -----------------------------------------------------------------------------
 * 5. POST /assessments/:id/questions - Add question to draft assessment
 * -----------------------------------------------------------------------------
 */
router.post('/:id/questions', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  // Invariant: Locked once published
  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: 'Cannot add questions to a published assessment' }
    });
  }

  const body = CreateQuestionRequestSchema.parse(req.body);

  // Check unique display_order within assessment
  if (db.questions.some(q => q.assessment_id === assessment.id && q.display_order === body.display_order)) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_ORDER', message: `Question with order ${body.display_order} already exists` }
    });
  }

  const question: Question = {
    id: randomUUID(),
    assessment_id: assessment.id,
    display_order: body.display_order,
    prompt: body.prompt,
    max_marks: body.max_marks,
    rubric: null,
    created_at: new Date().toISOString()
  };

  db.questions.push(question);

  logAuditEvent({
    actorId: user.profile.id,
    action: 'ADD_QUESTION',
    resourceType: 'questions',
    resourceId: question.id,
    after: question as any
  });

  res.status(201).json({ question });
});

/**
 * -----------------------------------------------------------------------------
 * 6. PUT /assessments/:id/questions/:questionId - Edit question
 * -----------------------------------------------------------------------------
 */
router.put('/:id/questions/:questionId', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: 'Cannot edit questions on a published assessment' }
    });
  }

  const question = db.questions.find(q => q.id === req.params.questionId && q.assessment_id === assessment.id);
  if (!question) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found' } });
  }

  const body = UpdateQuestionRequestSchema.parse(req.body);

  if (body.display_order !== undefined && body.display_order !== question.display_order) {
    if (db.questions.some(q => q.assessment_id === assessment.id && q.display_order === body.display_order && q.id !== question.id)) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_ORDER', message: `Question order ${body.display_order} already taken` }
      });
    }
    question.display_order = body.display_order;
  }

  if (body.prompt) question.prompt = body.prompt;
  if (body.max_marks !== undefined) question.max_marks = body.max_marks;

  res.status(200).json({ question });
});

/**
 * -----------------------------------------------------------------------------
 * 7. DELETE /assessments/:id/questions/:questionId - Remove question
 * -----------------------------------------------------------------------------
 */
router.delete('/:id/questions/:questionId', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: 'Cannot delete questions on a published assessment' }
    });
  }

  const index = db.questions.findIndex(q => q.id === req.params.questionId && q.assessment_id === assessment.id);
  if (index === -1) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found' } });
  }

  const [deletedQuestion] = db.questions.splice(index, 1);

  // Clean up associated rubric versions, criteria, and levels
  const rvs = db.rubricVersions.filter(rv => rv.question_id === deletedQuestion.id);
  for (const rv of rvs) {
    const criteria = db.rubricCriteria.filter(rc => rc.rubric_version_id === rv.id);
    for (const c of criteria) {
      db.rubricLevels = db.rubricLevels.filter(rl => rl.criterion_id !== c.id);
    }
    db.rubricCriteria = db.rubricCriteria.filter(rc => rc.rubric_version_id !== rv.id);
  }
  db.rubricVersions = db.rubricVersions.filter(rv => rv.question_id !== deletedQuestion.id);

  res.status(200).json({ success: true, message: 'Question deleted' });
});

/**
 * -----------------------------------------------------------------------------
 * 8. POST /assessments/:id/questions/:questionId/rubric - Save question rubric
 * -----------------------------------------------------------------------------
 */
router.post('/:id/questions/:questionId/rubric', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: 'Cannot modify rubric on a published assessment' }
    });
  }

  const question = db.questions.find(q => q.id === req.params.questionId && q.assessment_id === assessment.id);
  if (!question) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found' } });
  }

  const body = SaveRubricRequestSchema.parse(req.body);

  // Check if existing rubric version is frozen (defense-in-depth)
  const existingRv = db.rubricVersions.find(rv => rv.question_id === question.id);
  if (existingRv && existingRv.frozen_at !== null) {
    return res.status(400).json({
      error: { code: 'LIFECYCLE_LOCKED', message: 'Cannot modify a frozen rubric version' }
    });
  }

  // Remove existing rubric version and criteria for this question if re-saving draft
  if (existingRv) {
    const existingCriteria = db.rubricCriteria.filter(rc => rc.rubric_version_id === existingRv.id);
    for (const c of existingCriteria) {
      db.rubricLevels = db.rubricLevels.filter(rl => rl.criterion_id !== c.id);
    }
    db.rubricCriteria = db.rubricCriteria.filter(rc => rc.rubric_version_id !== existingRv.id);
    db.rubricVersions = db.rubricVersions.filter(rv => rv.id !== existingRv.id);
  }

  // Create new RubricVersion
  const rubricVersion: RubricVersion = {
    id: randomUUID(),
    template_id: null,
    question_id: question.id,
    version: 1,
    title: body.title,
    frozen_at: null,
    created_by: user.profile.id,
    criteria: [],
    created_at: new Date().toISOString()
  };

  db.rubricVersions.push(rubricVersion);

  // Add criteria and levels
  const savedCriteria: RubricCriterion[] = [];
  for (const critDto of body.criteria) {
    const criterionId = randomUUID();
    const criterion: RubricCriterion = {
      id: criterionId,
      rubric_version_id: rubricVersion.id,
      display_order: critDto.display_order,
      title: critDto.title,
      description: critDto.description,
      max_marks: critDto.max_marks,
      levels: [],
      created_at: new Date().toISOString()
    };

    db.rubricCriteria.push(criterion);

    const savedLevels: RubricLevel[] = [];
    for (const levelDto of critDto.levels || []) {
      const level: RubricLevel = {
        id: randomUUID(),
        criterion_id: criterionId,
        display_order: levelDto.display_order,
        label: levelDto.label,
        description: levelDto.description,
        min_guidance: levelDto.min_guidance ?? null,
        max_guidance: levelDto.max_guidance ?? null,
        created_at: new Date().toISOString()
      };
      db.rubricLevels.push(level);
      savedLevels.push(level);
    }

    criterion.levels = savedLevels;
    savedCriteria.push(criterion);
  }

  rubricVersion.criteria = savedCriteria;

  res.status(201).json({ rubric: rubricVersion });
});

/**
 * -----------------------------------------------------------------------------
 * 9. POST /assessments/:id/publish - Transactional Publication & Rubric Invariant Check
 * -----------------------------------------------------------------------------
 */
router.post('/:id/publish', requireRoles(['subject_teacher', 'hod']), (req: Request, res: Response) => {
  const assessment = db.assessments.find(a => a.id === req.params.id);
  if (!assessment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assessment not found' } });
  }

  const user = req.userContext!;
  if (!user.isHOD && !isAuthorizedTeacher(user.profile.id, assessment.class_subject_id)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not authorized for this assessment' } });
  }

  if (assessment.status !== 'draft') {
    return res.status(400).json({
      error: { code: 'ALREADY_PUBLISHED', message: 'Assessment is already published' }
    });
  }

  // Invariant 1: Deadline must be in the future
  const deadlineDate = new Date(assessment.deadline_at);
  if (deadlineDate <= new Date()) {
    return res.status(400).json({
      error: {
        code: 'INVALID_DEADLINE',
        message: 'Cannot publish assessment with a past deadline. Extend deadline first.'
      }
    });
  }

  // Invariant 2: Assessment must have at least one question
  const questions = db.questions.filter(q => q.assessment_id === assessment.id);
  if (questions.length === 0) {
    return res.status(400).json({
      error: { code: 'EMPTY_ASSESSMENT', message: 'Assessment must contain at least one question before publication' }
    });
  }

  // Invariant 3: STRICT RUBRIC TOTAL EQUIVALENCE INVARIANT
  // For every question: SUM(rubric_criteria.max_marks) == question.max_marks
  for (const q of questions) {
    const rv = db.rubricVersions.find(r => r.question_id === q.id);
    if (!rv) {
      return res.status(422).json({
        error: {
          code: 'MISSING_RUBRIC',
          message: `Question ${q.display_order} ("${q.prompt.slice(0, 30)}...") does not have a rubric defined. All questions must have rubrics.`,
          question_id: q.id,
          question_display_order: q.display_order
        }
      });
    }

    const criteria = db.rubricCriteria.filter(rc => rc.rubric_version_id === rv.id);
    const sumCriteriaMarks = criteria.reduce((sum, c) => sum + Number(c.max_marks), 0);

    // Exact numeric comparison within standard precision
    if (Math.abs(sumCriteriaMarks - Number(q.max_marks)) > 0.001) {
      return res.status(422).json({
        error: {
          code: 'RUBRIC_TOTAL_MISMATCH',
          message: `Question ${q.display_order} criteria sum (${sumCriteriaMarks.toFixed(2)}) must exactly equal question maximum marks (${Number(q.max_marks).toFixed(2)})`,
          question_id: q.id,
          question_display_order: q.display_order,
          question_max_marks: Number(q.max_marks),
          rubric_criteria_total: sumCriteriaMarks
        }
      });
    }
  }

  // Transaction: Freeze rubrics and publish assessment
  const now = new Date().toISOString();
  assessment.status = 'published';
  assessment.published_at = now;
  assessment.published_by = user.profile.id;
  assessment.updated_at = now;

  // Freeze all rubric versions on this assessment
  for (const q of questions) {
    const rv = db.rubricVersions.find(r => r.question_id === q.id);
    if (rv) {
      rv.frozen_at = now;
    }
  }

  logAuditEvent({
    actorId: user.profile.id,
    action: 'PUBLISH_ASSESSMENT',
    resourceType: 'assessments',
    resourceId: assessment.id,
    after: {
      assessment_id: assessment.id,
      published_at: now,
      questions_count: questions.length
    }
  });

  const fullPublished = getFullAssessment(assessment.id);
  res.status(200).json({ assessment: fullPublished });
});

export default router;
