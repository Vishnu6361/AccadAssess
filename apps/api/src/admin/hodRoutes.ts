import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { 
  CreateTermRequestSchema,
  CreateClassRequestSchema,
  CreateSubjectRequestSchema,
  UpdateSubjectRequestSchema,
  AssignClassSubjectRequestSchema,
  CreateProgrammeRequestSchema,
  UpdateProgrammeRequestSchema,
  CreateSpecializationRequestSchema,
  UpdateSpecializationRequestSchema,
  AssignFacultySubjectsRequestSchema,
  EnrollStudentRequestSchema,
  EnrollSpecializationStudentsRequestSchema,
  TransferEnrollmentRequestSchema,
  AssignProctorRequestSchema,
  AssignProctorBulkRequestSchema,
  ReassignProctorRequestSchema,
  InviteUserRequestSchema,
  AssignRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  UpdateFacultyProfileRequestSchema,
  AcademicTerm,
  Class,
  Subject,
  ClassSubject,
  Programme,
  Specialization,
  SubjectSpecialization,
  Enrollment,
  ProctorAssignment,
  Profile,
  UserRole,
  AppRole,
  formatClassName
} from '@smartfa/contracts';
import { db } from '../storage/db.js';
import { getAcademicRepository } from '../storage/academicRepository.js';
import { getUserRepository } from '../storage/userRepository.js';
import { getAssessmentRepository } from '../storage/assessmentRepository.js';
import { getSubmissionRepository } from '../storage/submissionRepository.js';
import { logAuditEvent, listAuditEvents } from '../audit/auditService.js';
import { authenticateJWT, supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { loadUserContext, requireRoles, requireHOD, invalidateUserContextCache } from '../authorization/rbac.js';

const router = Router();

// Secure all HOD endpoints with JWT + DB-verified 'hod' role check
router.use(authenticateJWT);
router.use(loadUserContext);
router.use(requireHOD);

/**
 * -----------------------------------------------------------------------------
 * Academic Terms
 * -----------------------------------------------------------------------------
 */
router.get('/terms', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const terms = await academicRepo.listTerms();
    res.status(200).json({ terms });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/terms', async (req: Request, res: Response) => {
  try {
    const body = CreateTermRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const term = await academicRepo.createTerm({
      id: randomUUID(),
      name: body.name,
      starts_on: body.starts_on,
      ends_on: body.ends_on,
      active: body.active
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'CREATE_TERM',
      resourceType: 'academic_terms',
      resourceId: term.id,
      after: term as any
    });

    res.status(201).json({ term });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Classes
 * -----------------------------------------------------------------------------
 */
router.get('/classes', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const classes = await academicRepo.listClasses();
    res.status(200).json({ classes });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/classes', async (req: Request, res: Response) => {
  try {
    const body = CreateClassRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    // Optional Class Teacher validation
    if (body.class_teacher_id) {
      const teacher = await userRepo.getProfileById(body.class_teacher_id);
      if (!teacher || teacher.status !== 'active') {
        return res.status(400).json({
          error: { code: 'INVALID_CLASS_TEACHER', message: 'Assigned class teacher profile does not exist or is inactive' }
        });
      }
      const roles = await userRepo.getActiveRolesByUserId(body.class_teacher_id);
      if (!roles.includes('class_teacher') && !roles.includes('subject_teacher') && !roles.includes('hod')) {
        return res.status(400).json({
          error: { code: 'INVALID_TEACHER_ROLE', message: 'Assigned user does not hold a teaching role' }
        });
      }
    }

    const newClass = await academicRepo.createClass({
      id: randomUUID(),
      programme: body.programme,
      programme_id: body.programme_id || null,
      specialization_id: body.specialization_id || null,
      semester: body.semester,
      section: body.section || null,
      class_teacher_id: body.class_teacher_id || null,
      term_id: body.term_id || undefined
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'CREATE_CLASS',
      resourceType: 'classes',
      resourceId: newClass.id,
      after: newClass as any
    });

    res.status(201).json({ class: newClass });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.patch('/classes/:id/class-teacher', async (req: Request, res: Response) => {
  try {
    const classId = req.params.id;
    const { class_teacher_id } = req.body;
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    const cls = await academicRepo.getClassById(classId);
    if (!cls) {
      return res.status(404).json({
        error: { code: 'CLASS_NOT_FOUND', message: 'Target class does not exist' }
      });
    }

    if (class_teacher_id) {
      const teacher = await userRepo.getProfileById(class_teacher_id);
      if (!teacher || teacher.status !== 'active') {
        return res.status(400).json({
          error: { code: 'INVALID_CLASS_TEACHER', message: 'Assigned class teacher profile does not exist or is inactive' }
        });
      }
      const roles = await userRepo.getActiveRolesByUserId(class_teacher_id);
      if (!roles.includes('class_teacher') && !roles.includes('subject_teacher') && !roles.includes('hod')) {
        return res.status(400).json({
          error: { code: 'INVALID_TEACHER_ROLE', message: 'Assigned user does not hold a teaching role' }
        });
      }
    }

    const previousTeacherId = cls.class_teacher_id;
    const updatedClass = await academicRepo.updateClassTeacher(classId, class_teacher_id || null);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_CLASS_TEACHER',
      resourceType: 'classes',
      resourceId: classId,
      before: { class_teacher_id: previousTeacherId },
      after: { class_teacher_id: class_teacher_id || null }
    });

    res.status(200).json({ class: updatedClass });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Programmes & Specializations
 * -----------------------------------------------------------------------------
 */
router.get('/programmes', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const programmes = await academicRepo.listProgrammes();
    res.status(200).json({ programmes });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/programmes/:id', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const programme = await academicRepo.getProgrammeById(req.params.id);
    if (!programme) {
      return res.status(404).json({ error: { code: 'PROGRAMME_NOT_FOUND', message: 'Programme not found' } });
    }
    const specializations = await academicRepo.listSpecializations(req.params.id);
    res.status(200).json({ programme, specializations });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/programmes', async (req: Request, res: Response) => {
  try {
    const body = CreateProgrammeRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const existing = await academicRepo.getProgrammeByCode(body.code);
    if (existing) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_PROGRAMME_CODE', message: `Programme with code ${body.code} already exists` }
      });
    }

    const prog = await academicRepo.createProgramme({
      id: randomUUID(),
      code: body.code,
      name: body.name,
      duration_years: body.duration_years,
      total_semesters: body.total_semesters,
      status: body.status || 'active'
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'CREATE_PROGRAMME',
      resourceType: 'programmes',
      resourceId: prog.id,
      after: prog as any
    });

    res.status(201).json({ programme: prog });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.patch('/programmes/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateProgrammeRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const existing = await academicRepo.getProgrammeById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'PROGRAMME_NOT_FOUND', message: 'Programme not found' } });
    }

    const updated = await academicRepo.updateProgramme(req.params.id, body);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_PROGRAMME',
      resourceType: 'programmes',
      resourceId: updated.id,
      before: existing as any,
      after: updated as any
    });

    res.status(200).json({ programme: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/specializations', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const programmeId = req.query.programme_id as string | undefined;
    const specializations = await academicRepo.listSpecializations(programmeId);
    res.status(200).json({ specializations });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/specializations/:id', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const specialization = await academicRepo.getSpecializationById(req.params.id);
    if (!specialization) {
      return res.status(404).json({ error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Specialization not found' } });
    }
    const subjects = await academicRepo.listSubjectsBySpecialization(req.params.id);
    res.status(200).json({ specialization, subjects });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/specializations', async (req: Request, res: Response) => {
  try {
    const body = CreateSpecializationRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const prog = await academicRepo.getProgrammeById(body.programme_id);
    if (!prog) {
      return res.status(404).json({
        error: { code: 'PROGRAMME_NOT_FOUND', message: 'Parent programme does not exist' }
      });
    }

    const existingCode = await academicRepo.getSpecializationByCode(body.programme_id, body.code);
    if (existingCode) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_SPECIALIZATION_CODE', message: `Specialization with code ${body.code} already exists in this programme` }
      });
    }

    const spec = await academicRepo.createSpecialization({
      id: randomUUID(),
      programme_id: body.programme_id,
      code: body.code,
      name: body.name,
      applicable_semesters: body.applicable_semesters || (body as any).semesters || [1, 2, 3, 4],
      active: body.active !== undefined ? body.active : true
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'CREATE_SPECIALIZATION',
      resourceType: 'specializations',
      resourceId: spec.id,
      after: spec as any
    });

    res.status(201).json({ specialization: spec });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.patch('/specializations/:id', async (req: Request, res: Response) => {
  try {
    const body = UpdateSpecializationRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const existing = await academicRepo.getSpecializationById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Specialization not found' } });
    }

    const updated = await academicRepo.updateSpecialization(req.params.id, body);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_SPECIALIZATION',
      resourceType: 'specializations',
      resourceId: updated.id,
      before: existing as any,
      after: updated as any
    });

    res.status(200).json({ specialization: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/specializations/:id/subjects', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const semester = req.query.semester ? parseInt(req.query.semester as string) : undefined;
    const subjects = await academicRepo.listSubjectsBySpecialization(req.params.id, semester);
    res.status(200).json({ subjects });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/specializations/:id/subjects', async (req: Request, res: Response) => {
  try {
    const specId = req.params.id;
    const academicRepo = getAcademicRepository();
    const spec = await academicRepo.getSpecializationById(specId);
    if (!spec) {
      return res.status(404).json({ error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Specialization not found' } });
    }

    const { subject_id, semester, code, name, credits } = req.body;

    // Case 1: Create new subject directly under this specialization
    if (code && name) {
      const existingSub = await academicRepo.getSubjectByCode(code.trim().toUpperCase());
      let createdOrFoundSub = existingSub;
      if (!createdOrFoundSub) {
        createdOrFoundSub = await academicRepo.createSubject({
          id: randomUUID(),
          programme_id: spec.programme_id,
          specialization_id: specId,
          semester: semester ? Number(semester) : null,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          credits: credits ? Number(credits) : 3,
          active: true
        });
      }

      const ss = await academicRepo.linkSubjectSpecialization(createdOrFoundSub.id, specId, semester ? Number(semester) : undefined);

      await logAuditEvent({
        actorId: req.userContext?.profile.id,
        action: 'CREATE_AND_LINK_SPECIALIZATION_SUBJECT',
        resourceType: 'subjects',
        resourceId: createdOrFoundSub.id,
        after: { subject: createdOrFoundSub, subject_specialization: ss } as any
      });

      return res.status(201).json({ subject: createdOrFoundSub, subject_specialization: ss });
    }

    // Case 2: Link existing subject
    if (!subject_id) {
      return res.status(400).json({ error: { code: 'SUBJECT_ID_OR_DATA_REQUIRED', message: 'Either subject_id or (code, name) is required' } });
    }

    const sub = await academicRepo.getSubjectById(subject_id);
    if (!sub) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }

    const ss = await academicRepo.linkSubjectSpecialization(subject_id, specId, semester ? Number(semester) : undefined);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'LINK_SUBJECT_SPECIALIZATION',
      resourceType: 'subject_specializations',
      resourceId: ss.id,
      after: ss as any
    });

    res.status(201).json({ subject: sub, subject_specialization: ss });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Subjects
 * -----------------------------------------------------------------------------
 */
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const programmeId = req.query.programme_id as string | undefined;
    const specializationId = req.query.specialization_id as string | undefined;
    const semester = req.query.semester ? parseInt(req.query.semester as string) : undefined;
    const status = req.query.status as string | undefined; // 'all' | 'active' | 'inactive'
    const search = req.query.search as string | undefined;

    let subjects: Subject[];
    if (specializationId) {
      subjects = await academicRepo.listSubjectsBySpecialization(specializationId, semester);
    } else if (programmeId) {
      subjects = await academicRepo.listSubjectsByProgramme(programmeId, semester);
    } else {
      subjects = await academicRepo.listSubjects();
    }

    if (semester && !specializationId && !programmeId) {
      subjects = subjects.filter(s => s.semester === semester);
    }

    if (status && status !== 'all') {
      const wantActive = status === 'active';
      subjects = subjects.filter(s => (s.active !== false) === wantActive);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      subjects = subjects.filter(s =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.programme_code && s.programme_code.toLowerCase().includes(q)) ||
        (s.specialization_code && s.specialization_code.toLowerCase().includes(q))
      );
    }

    res.status(200).json({ subjects });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/subjects/:id', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const subject = await academicRepo.getSubjectById(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }
    res.status(200).json({ subject });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/subjects/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const subject = await academicRepo.getSubjectById(req.params.id);
    if (!subject) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }
    const dependencies = await academicRepo.getSubjectDependencies(req.params.id);
    res.status(200).json({ dependencies });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/subjects', async (req: Request, res: Response) => {
  try {
    const body = CreateSubjectRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    if (body.programme_id) {
      const prog = await academicRepo.getProgrammeById(body.programme_id);
      if (!prog) {
        return res.status(404).json({
          error: { code: 'PROGRAMME_NOT_FOUND', message: 'Target programme does not exist' }
        });
      }
      if (body.semester && prog.total_semesters && (body.semester < 1 || body.semester > prog.total_semesters)) {
        return res.status(400).json({
          error: { code: 'INVALID_SEMESTER', message: `Semester ${body.semester} is out of range (1-${prog.total_semesters}) for programme ${prog.code || prog.name}` }
        });
      }
    }

    if (body.specialization_id) {
      const spec = await academicRepo.getSpecializationById(body.specialization_id);
      if (!spec) {
        return res.status(404).json({
          error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Target specialization does not exist' }
        });
      }
      if (body.programme_id && spec.programme_id !== body.programme_id) {
        return res.status(400).json({
          error: { code: 'INVALID_SPECIALIZATION', message: 'Specialization does not belong to the selected programme' }
        });
      }
      const allowedSemesters = (spec.applicable_semesters && spec.applicable_semesters.length > 0)
        ? spec.applicable_semesters
        : (spec as any).semesters;
      if (body.semester && allowedSemesters && allowedSemesters.length > 0) {
        if (!allowedSemesters.includes(body.semester)) {
          return res.status(400).json({
            error: { code: 'INVALID_SEMESTER_FOR_SPECIALIZATION', message: `Semester ${body.semester} is not applicable for specialization ${spec.code || spec.name} (applicable: ${allowedSemesters.join(', ')})` }
          });
        }
      }
    }

    const existingCode = await academicRepo.getSubjectByCode(body.code);
    if (existingCode) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_SUBJECT_CODE', message: `Subject code ${body.code} already exists` }
      });
    }

    const subject = await academicRepo.createSubject({
      id: randomUUID(),
      programme_id: body.programme_id || null,
      specialization_id: body.specialization_id || null,
      semester: body.semester || null,
      code: body.code,
      name: body.name,
      credits: body.credits,
      active: body.active !== undefined ? body.active : true
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'CREATE_SUBJECT',
      resourceType: 'subjects',
      resourceId: subject.id,
      after: subject as any
    });

    res.status(201).json({ subject });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      const issues = err.issues || [];
      const messages = issues.map((i: any) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; ');
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: messages || err.message || 'Invalid request parameters',
          issues
        }
      });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.patch('/subjects/:id', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const existing = await academicRepo.getSubjectById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }

    const body = UpdateSubjectRequestSchema.parse(req.body);

    const targetProgId = body.programme_id !== undefined ? body.programme_id : existing.programme_id;
    const targetSpecId = body.specialization_id !== undefined ? body.specialization_id : existing.specialization_id;
    const targetSem = body.semester !== undefined ? body.semester : existing.semester;

    // Check duplicate code if changed
    if (body.code && body.code.toUpperCase() !== existing.code.toUpperCase()) {
      const codeDuplicate = await academicRepo.getSubjectByCode(body.code);
      if (codeDuplicate && codeDuplicate.id !== existing.id) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_SUBJECT_CODE', message: `Subject code ${body.code} already exists` }
        });
      }
    }

    // Validate programme
    if (targetProgId) {
      const prog = await academicRepo.getProgrammeById(targetProgId);
      if (!prog) {
        return res.status(404).json({
          error: { code: 'PROGRAMME_NOT_FOUND', message: 'Target programme does not exist' }
        });
      }
      if (targetSem && prog.total_semesters && (targetSem < 1 || targetSem > prog.total_semesters)) {
        return res.status(400).json({
          error: { code: 'INVALID_SEMESTER', message: `Semester ${targetSem} is out of range (1-${prog.total_semesters}) for programme ${prog.code || prog.name}` }
        });
      }
    }

    // Validate specialization
    if (targetSpecId) {
      const spec = await academicRepo.getSpecializationById(targetSpecId);
      if (!spec) {
        return res.status(404).json({
          error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Target specialization does not exist' }
        });
      }
      if (targetProgId && spec.programme_id !== targetProgId) {
        return res.status(400).json({
          error: { code: 'INVALID_SPECIALIZATION', message: 'Specialization does not belong to the selected programme' }
        });
      }
      const allowedSemesters = (spec.applicable_semesters && spec.applicable_semesters.length > 0)
        ? spec.applicable_semesters
        : (spec as any).semesters;
      if (targetSem && allowedSemesters && allowedSemesters.length > 0) {
        if (!allowedSemesters.includes(targetSem)) {
          return res.status(400).json({
            error: { code: 'INVALID_SEMESTER_FOR_SPECIALIZATION', message: `Semester ${targetSem} is not applicable for specialization ${spec.code || spec.name} (applicable: ${allowedSemesters.join(', ')})` }
          });
        }
      }
    }

    // Dependency check if changing programme, specialization, or semester when allocations exist
    const changingStructure = (
      (body.programme_id !== undefined && body.programme_id !== existing.programme_id) ||
      (body.specialization_id !== undefined && body.specialization_id !== existing.specialization_id) ||
      (body.semester !== undefined && body.semester !== existing.semester)
    );
    if (changingStructure) {
      const deps = await academicRepo.getSubjectDependencies(req.params.id);
      if (deps.has_dependencies) {
        return res.status(400).json({
          error: {
            code: 'SUBJECT_ALLOCATION_CONFLICT',
            message: `Cannot change academic structure (programme/specialization/semester) while subject is allocated: ${deps.details?.join('; ')}. Re-allocate or unassign the subject first.`,
            dependencies: deps
          }
        });
      }
    }

    const updated = await academicRepo.updateSubject(req.params.id, {
      ...body,
      code: body.code ? body.code.toUpperCase() : undefined
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_SUBJECT',
      resourceType: 'subjects',
      resourceId: updated.id,
      before: existing as any,
      after: updated as any
    });

    res.status(200).json({ subject: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      const issues = err.issues || [];
      const messages = issues.map((i: any) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; ');
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: messages || err.message || 'Invalid request parameters',
          issues
        }
      });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/subjects/:id/allocations', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const existing = await academicRepo.getSubjectById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }

    const deps = await academicRepo.getSubjectDependencies(req.params.id);
    if (deps.assessments_count > 0 || deps.submissions_count > 0) {
      return res.status(400).json({
        error: {
          code: 'CANNOT_UNASSIGN_ACTIVE_ASSESSMENTS',
          message: 'Cannot unassign class allocations: this subject has active assessments or student submissions that require class cohort context.',
          dependencies: deps
        }
      });
    }

    const unassignedCount = await academicRepo.unassignSubjectAllocations(req.params.id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UNASSIGN_SUBJECT_ALLOCATIONS',
      resourceType: 'subjects',
      resourceId: existing.id,
      before: { allocations_count: deps.class_subjects_count },
      after: { unassigned_count: unassignedCount }
    });

    res.status(200).json({
      success: true,
      count: unassignedCount,
      message: `Successfully unassigned ${unassignedCount} class allocation(s) for subject ${existing.code}`
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/subjects/:id', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const existing = await academicRepo.getSubjectById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'SUBJECT_NOT_FOUND', message: 'Subject not found' } });
    }

    const unassignAllocations = req.query.unassign_allocations === 'true';
    const deps = await academicRepo.getSubjectDependencies(req.params.id);

    // Safeguard genuine academic assessments and student records
    if (deps.assessments_count > 0 || deps.submissions_count > 0) {
      return res.status(400).json({
        error: {
          code: 'SUBJECT_HAS_ASSESSMENTS',
          message: `Cannot delete subject ${existing.code}: genuine student assessment/submission records depend on it (${deps.assessments_count} assessment(s)). Subjects with academic records must be archived/deactivated, not deleted.`,
          dependencies: deps
        }
      });
    }

    if (deps.class_subjects_count > 0) {
      if (!unassignAllocations) {
        return res.status(400).json({
          error: {
            code: 'SUBJECT_HAS_DEPENDENCIES',
            message: `Cannot delete subject ${existing.code}: it is currently allocated to ${deps.class_subjects_count} class cohort(s). Unassign the class allocations first, or confirm unassignment during deletion.`,
            dependencies: deps
          }
        });
      }

      // Safe HOD unassignment of class cohorts prior to subject deletion
      const unassignedCount = await academicRepo.unassignSubjectAllocations(req.params.id);
      await logAuditEvent({
        actorId: req.userContext?.profile.id,
        action: 'UNASSIGN_SUBJECT_ALLOCATIONS',
        resourceType: 'subjects',
        resourceId: existing.id,
        before: { allocations_count: deps.class_subjects_count },
        after: { unassigned_count: unassignedCount }
      });
    }

    await academicRepo.deleteSubject(req.params.id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'DELETE_SUBJECT',
      resourceType: 'subjects',
      resourceId: existing.id,
      before: existing as any
    });

    res.status(200).json({ success: true, message: `Subject ${existing.code} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Class Subjects (Assigning Subject Teachers)
 * -----------------------------------------------------------------------------
 */
router.get('/class-subjects', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const list = await academicRepo.listClassSubjects();
    res.status(200).json({ class_subjects: list });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/class-subjects', async (req: Request, res: Response) => {
  try {
    const body = AssignClassSubjectRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    const cls = await academicRepo.getClassById(body.class_id);
    if (!cls) {
      return res.status(404).json({
        error: { code: 'CLASS_NOT_FOUND', message: 'Target class does not exist' }
      });
    }

    const sub = await academicRepo.getSubjectById(body.subject_id);
    if (!sub) {
      return res.status(404).json({
        error: { code: 'SUBJECT_NOT_FOUND', message: 'Target subject does not exist' }
      });
    }

    const teacher = await userRepo.getProfileById(body.subject_teacher_id);
    if (!teacher || teacher.status !== 'active') {
      return res.status(400).json({
        error: { code: 'INVALID_SUBJECT_TEACHER', message: 'Assigned subject teacher profile does not exist or is inactive' }
      });
    }

    const roles = await userRepo.getActiveRolesByUserId(body.subject_teacher_id);
    if (!roles.includes('subject_teacher') && !roles.includes('class_teacher') && !roles.includes('hod')) {
      return res.status(400).json({
        error: { code: 'INVALID_TEACHER_ROLE', message: 'Assigned user does not hold a teaching role' }
      });
    }

    const existingMapping = await academicRepo.getClassSubjectByClassAndSubject(body.class_id, body.subject_id);
    if (existingMapping) {
      return res.status(409).json({
        error: { code: 'CLASS_SUBJECT_CONFLICT', message: 'This subject is already assigned to this class' }
      });
    }

    const cs = await academicRepo.assignClassSubject({
      id: randomUUID(),
      class_id: body.class_id,
      subject_id: body.subject_id,
      subject_teacher_id: body.subject_teacher_id,
      active: true
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'ASSIGN_CLASS_SUBJECT',
      resourceType: 'class_subjects',
      resourceId: cs.id,
      after: cs as any
    });

    res.status(201).json({ class_subject: cs });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/class-subjects/:id', async (req: Request, res: Response) => {
  try {
    const classSubjectId = req.params.id;
    const academicRepo = getAcademicRepository();

    const cs = await academicRepo.getClassSubjectById(classSubjectId);
    if (!cs) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Class subject assignment not found' }
      });
    }

    await academicRepo.unassignClassSubject(classSubjectId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UNASSIGN_CLASS_SUBJECT',
      resourceType: 'class_subjects',
      resourceId: classSubjectId,
      before: cs as any,
      after: null
    });

    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Student Enrollments
 * -----------------------------------------------------------------------------
 */
router.get('/enrollments', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const classId = req.query.class_id as string | undefined;
    const specializationId = req.query.specialization_id as string | undefined;
    const enrollments = await academicRepo.listEnrollments(classId, specializationId);
    res.status(200).json({ enrollments });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/enrollments', async (req: Request, res: Response) => {
  try {
    const body = EnrollStudentRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    const cls = await academicRepo.getClassById(body.class_id);
    if (!cls) {
      return res.status(404).json({
        error: { code: 'CLASS_NOT_FOUND', message: 'Target class does not exist' }
      });
    }

    const student = await userRepo.getProfileById(body.student_id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'STUDENT_NOT_FOUND', message: 'Target student profile does not exist' }
      });
    }

    if (student.status !== 'active') {
      return res.status(403).json({
        error: { code: 'STUDENT_INACTIVE', message: 'Target student profile is inactive' }
      });
    }

    const roles = await userRepo.getActiveRolesByUserId(body.student_id);
    if (!roles.includes('student')) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'User does not possess the student role' }
      });
    }

    const existing = await academicRepo.getEnrollment(body.class_id, body.student_id);
    if (existing) {
      return res.status(409).json({
        error: { code: 'ENROLLMENT_CONFLICT', message: 'Student is already enrolled in this class' }
      });
    }

    const enrollment = await academicRepo.enrollStudent({
      id: randomUUID(),
      class_id: body.class_id,
      student_id: body.student_id,
      specialization_id: body.specialization_id || null,
      roll_number: body.roll_number || null,
      status: 'active'
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'ENROLL_STUDENT',
      resourceType: 'enrollments',
      resourceId: enrollment.id,
      after: enrollment as any
    });

    res.status(201).json({ enrollment });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/enrollments/specialization', async (req: Request, res: Response) => {
  try {
    const body = EnrollSpecializationStudentsRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    // 1. Validate target specialization
    const spec = await academicRepo.getSpecializationById(body.specialization_id);
    if (!spec || !spec.active) {
      return res.status(404).json({
        error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Target specialization does not exist or is inactive' }
      });
    }

    // 2. Validate applicable semester
    const targetSemester = body.semester || 3;
    if (spec.applicable_semesters?.length && !spec.applicable_semesters.includes(targetSemester)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SPECIALIZATION_SEMESTER',
          message: `Specialization "${spec.name}" is not applicable for semester ${targetSemester}`
        }
      });
    }

    // 3. Validate associated programme
    const prog = await academicRepo.getProgrammeById(spec.programme_id);
    if (!prog || prog.status !== 'active') {
      return res.status(400).json({
        error: { code: 'PROGRAMME_INACTIVE', message: 'Associated programme is inactive or not found' }
      });
    }

    // 4. Validate student accounts from authoritative user directory
    const studentProfiles: Profile[] = [];
    for (const studentId of body.student_ids) {
      const profile = await userRepo.getProfileById(studentId);
      if (!profile) {
        return res.status(404).json({
          error: { code: 'STUDENT_NOT_FOUND', message: `Student profile ${studentId} does not exist` }
        });
      }
      if (profile.status !== 'active') {
        return res.status(403).json({
          error: { code: 'STUDENT_INACTIVE', message: `Student ${profile.full_name} (${profile.usn || profile.email}) is inactive` }
        });
      }
      const roles = await userRepo.getActiveRolesByUserId(studentId);
      if (!roles.includes('student')) {
        return res.status(400).json({
          error: { code: 'INVALID_ROLE', message: `User ${profile.full_name} does not possess the student role` }
        });
      }
      studentProfiles.push(profile);
    }

    // 5. Check current enrollments across all specializations for this programme & semester
    const allEnrollments = await academicRepo.listEnrollments();

    // Check duplicate enrollments in target specialization
    const duplicatesInTarget = allEnrollments.filter(e => 
      e.specialization_id === spec.id && 
      e.semester === targetSemester &&
      body.student_ids.includes(e.student_id)
    );

    if (duplicatesInTarget.length > 0) {
      const names = duplicatesInTarget.map(d => `${d.student_name} (${d.student_usn || d.roll_number || 'N/A'})`).join(', ');
      return res.status(409).json({
        error: {
          code: 'ENROLLMENT_CONFLICT',
          message: `The following student(s) are already enrolled in ${spec.name}: ${names}. Duplicate enrollment is prevented.`,
          duplicate_students: duplicatesInTarget
        }
      });
    }

    // Check if any student is enrolled in another specialization stream for this programme & semester
    const inOtherStream = allEnrollments.filter(e => 
      e.specialization_id && 
      e.specialization_id !== spec.id && 
      e.semester === targetSemester &&
      body.student_ids.includes(e.student_id)
    );

    if (inOtherStream.length > 0 && !body.allow_transfer) {
      const conflictDetails = inOtherStream.map(e => ({
        student_id: e.student_id,
        student_name: e.student_name,
        current_specialization_id: e.specialization_id,
        current_specialization_name: e.specialization_name || 'Other Stream',
        enrollment_id: e.id
      }));
      return res.status(409).json({
        error: {
          code: 'STREAM_TRANSFER_REQUIRED',
          message: `One or more selected students are currently enrolled in another specialization stream. Explicit confirmation is required to transfer stream.`,
          conflicts: conflictDetails
        }
      });
    }

    // 6. Find or resolve canonical class for (programme, semester)
    const allClasses = await academicRepo.listClasses();
    let canonicalClass: any = allClasses.find(c => 
      c.semester === targetSemester &&
      (c.programme_id === prog.id || c.programme.toUpperCase() === prog.code.toUpperCase()) &&
      (!c.specialization_id || c.specialization_id === spec.id)
    );

    if (!canonicalClass) {
      canonicalClass = allClasses.find(c => 
        c.semester === targetSemester &&
        (c.programme_id === prog.id || c.programme.toUpperCase() === prog.code.toUpperCase())
      );
    }

    if (!canonicalClass) {
      // Create a common class cohort for this programme and semester
      try {
        const created = await academicRepo.createClass({
          id: randomUUID(),
          programme: prog.code,
          programme_id: prog.id,
          specialization_id: null,
          semester: targetSemester,
          section: 'A',
          class_teacher_id: null
        });
        canonicalClass = created;
      } catch (createErr) {
        const freshClasses = await academicRepo.listClasses();
        canonicalClass = freshClasses.find(c => 
          c.semester === targetSemester &&
          (c.programme_id === prog.id || c.programme.toUpperCase() === prog.code.toUpperCase())
        );
        if (!canonicalClass) throw createErr;
      }
    }

    if (!canonicalClass) {
      return res.status(500).json({
        error: { code: 'CLASS_RESOLUTION_FAILED', message: 'Failed to resolve or create canonical class for specialization' }
      });
    }

    // 8. Execute enrollments & stream transfers
    const results: any[] = [];
    const otherStreamStudentIds = new Set(inOtherStream.map(e => e.student_id));

    if (body.allow_transfer && inOtherStream.length > 0) {
      for (const existing of inOtherStream) {
        const updated = await academicRepo.updateEnrollmentSpecialization(existing.id, spec.id);
        if (canonicalClass && existing.class_id !== canonicalClass.id) {
          await academicRepo.updateEnrollmentClass(existing.id, canonicalClass.id);
        }
        await logAuditEvent({
          actorId: req.userContext?.profile.id,
          action: 'TRANSFER_STUDENT_STREAM',
          resourceType: 'enrollments',
          resourceId: existing.id,
          before: {
            class_id: existing.class_id,
            specialization_id: existing.specialization_id,
            specialization_name: existing.specialization_name
          },
          after: {
            class_id: canonicalClass.id,
            specialization_id: spec.id,
            specialization_name: spec.name
          }
        });
        results.push({
          ...updated,
          transferred: true,
          previous_specialization_name: existing.specialization_name
        });
      }
    }

    // Enroll students who were not in the other stream (new enrollments)
    const newStudentProfiles = studentProfiles.filter(p => !otherStreamStudentIds.has(p.id));
    for (const student of newStudentProfiles) {
      const existingInCohort = allEnrollments.find(e => 
        e.student_id === student.id && 
        e.semester === targetSemester &&
        (e.programme_id === prog.id || (e.programme && e.programme.toUpperCase() === prog.code.toUpperCase()))
      );
      let enrollment: any;
      if (existingInCohort) {
        enrollment = await academicRepo.updateEnrollmentSpecialization(existingInCohort.id, spec.id);
      } else {
        enrollment = await academicRepo.enrollStudent({
          id: randomUUID(),
          class_id: canonicalClass.id,
          student_id: student.id,
          specialization_id: spec.id,
          roll_number: student.usn || null,
          status: 'active'
        });
      }

      await logAuditEvent({
        actorId: req.userContext?.profile.id,
        action: 'ENROLL_STUDENT_SPECIALIZATION',
        resourceType: 'enrollments',
        resourceId: enrollment.id,
        after: {
          ...enrollment,
          student_name: student.full_name,
          student_usn: student.usn,
          specialization_id: spec.id,
          specialization_name: spec.name,
          programme: prog.code,
          semester: targetSemester
        }
      });

      results.push(enrollment);
    }

    res.status(201).json({
      success: true,
      count: results.length,
      enrollments: results
    });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/enrollments/transfer', async (req: Request, res: Response) => {
  try {
    const body = TransferEnrollmentRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();

    const spec = await academicRepo.getSpecializationById(body.target_specialization_id);
    if (!spec || !spec.active) {
      return res.status(404).json({
        error: { code: 'SPECIALIZATION_NOT_FOUND', message: 'Target specialization not found or inactive' }
      });
    }

    const prog = await academicRepo.getProgrammeById(spec.programme_id);
    if (!prog || prog.status !== 'active') {
      return res.status(400).json({
        error: { code: 'PROGRAMME_INACTIVE', message: 'Associated programme is inactive' }
      });
    }

    // Find student's existing enrollment for this semester
    const enrollments = await academicRepo.listEnrollments();
    const currentEnrollment = enrollments.find(e => 
      e.student_id === body.student_id && 
      e.semester === body.semester &&
      (body.enrollment_id ? e.id === body.enrollment_id : true)
    );

    if (!currentEnrollment) {
      return res.status(404).json({
        error: { code: 'ENROLLMENT_NOT_FOUND', message: `No existing enrollment found for this student in semester ${body.semester}` }
      });
    }

    if (currentEnrollment.specialization_id === spec.id) {
      return res.status(400).json({
        error: { code: 'ALREADY_IN_TARGET_STREAM', message: `Student is already enrolled in ${spec.name}` }
      });
    }

    // Find canonical class cohort for (programme, semester)
    const allClasses = await academicRepo.listClasses();
    let targetClass: any = allClasses.find(c => 
      c.semester === body.semester &&
      (c.programme_id === prog.id || c.programme.toUpperCase() === prog.code.toUpperCase()) &&
      (!c.specialization_id || c.specialization_id === spec.id)
    );

    if (!targetClass) {
      targetClass = allClasses.find(c => 
        c.semester === body.semester &&
        (c.programme_id === prog.id || c.programme.toUpperCase() === prog.code.toUpperCase())
      );
    }

    const finalClassId = targetClass ? targetClass.id : currentEnrollment.class_id;
    if (finalClassId !== currentEnrollment.class_id) {
      await academicRepo.updateEnrollmentClass(currentEnrollment.id, finalClassId);
    }

    const updated = await academicRepo.updateEnrollmentSpecialization(currentEnrollment.id, spec.id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'TRANSFER_STUDENT_STREAM',
      resourceType: 'enrollments',
      resourceId: currentEnrollment.id,
      before: {
        class_id: currentEnrollment.class_id,
        specialization_id: currentEnrollment.specialization_id,
        specialization_name: currentEnrollment.specialization_name
      },
      after: {
        class_id: finalClassId,
        specialization_id: spec.id,
        specialization_name: spec.name
      }
    });

    res.status(200).json({ success: true, enrollment: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/enrollments/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const academicRepo = getAcademicRepository();
    const enrollments = await academicRepo.listEnrollments();
    const existing = enrollments.find(e => e.id === id);

    if (!existing) {
      return res.status(404).json({
        error: { code: 'ENROLLMENT_NOT_FOUND', message: 'Enrollment record not found' }
      });
    }

    await academicRepo.deleteEnrollment(id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UNENROLL_STUDENT',
      resourceType: 'enrollments',
      resourceId: id,
      before: existing as any
    });

    res.status(200).json({ success: true, message: 'Student enrollment removed' });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Proctor Assignments
 * -----------------------------------------------------------------------------
 */
router.get('/proctor-assignments', async (req: Request, res: Response) => {
  try {
    const academicRepo = getAcademicRepository();
    const classId = req.query.class_id as string | undefined;
    const assignments = await academicRepo.listProctorAssignments(classId);
    res.status(200).json({ proctor_assignments: assignments });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/proctor-assignments', async (req: Request, res: Response) => {
  try {
    const body = AssignProctorRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    if (body.valid_to && body.valid_from && body.valid_to < body.valid_from) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'valid_to date cannot be earlier than valid_from date' }
      });
    }

    const cls = await academicRepo.getClassById(body.class_id);
    if (!cls) {
      return res.status(404).json({
        error: { code: 'CLASS_NOT_FOUND', message: 'Target class does not exist' }
      });
    }

    const student = await userRepo.getProfileById(body.student_id);
    if (!student) {
      return res.status(404).json({
        error: { code: 'STUDENT_NOT_FOUND', message: 'Target student profile does not exist' }
      });
    }

    if (student.status !== 'active') {
      return res.status(403).json({
        error: { code: 'STUDENT_INACTIVE', message: 'Target student profile is inactive' }
      });
    }

    const proctor = await userRepo.getProfileById(body.proctor_id);
    if (!proctor) {
      return res.status(404).json({
        error: { code: 'PROCTOR_NOT_FOUND', message: 'Target proctor profile does not exist' }
      });
    }

    if (proctor.status !== 'active') {
      return res.status(403).json({
        error: { code: 'PROCTOR_INACTIVE', message: 'Target proctor profile is inactive' }
      });
    }

    const proctorRoles = await userRepo.getActiveRolesByUserId(body.proctor_id);
    if (!proctorRoles.includes('proctor')) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'Target user does not possess proctor role' }
      });
    }

    const existing = await academicRepo.getProctorAssignment(body.class_id, body.student_id, body.proctor_id);
    if (existing) {
      return res.status(409).json({
        error: { code: 'PROCTOR_ASSIGNMENT_CONFLICT', message: 'Proctor is already assigned to this student for this class' }
      });
    }

    const pa = await academicRepo.assignProctor({
      id: randomUUID(),
      class_id: body.class_id,
      student_id: body.student_id,
      proctor_id: body.proctor_id,
      valid_from: body.valid_from || new Date().toISOString().split('T')[0],
      valid_to: body.valid_to || null,
      assigned_by: req.userContext?.profile.id
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'ASSIGN_PROCTOR',
      resourceType: 'proctor_assignments',
      resourceId: pa.id,
      after: pa as any
    });

    res.status(201).json({ proctor_assignment: pa });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/proctor-assignments/bulk', async (req: Request, res: Response) => {
  try {
    const body = AssignProctorBulkRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    if (body.valid_to && body.valid_from && body.valid_to < body.valid_from) {
      return res.status(400).json({
        error: { code: 'INVALID_DATE_RANGE', message: 'valid_to date cannot be earlier than valid_from date' }
      });
    }

    // 1. Verify target proctor
    const proctor = await userRepo.getProfileById(body.proctor_id);
    if (!proctor) {
      return res.status(404).json({
        error: { code: 'PROCTOR_NOT_FOUND', message: 'Target proctor profile does not exist' }
      });
    }

    if (proctor.status !== 'active') {
      return res.status(403).json({
        error: { code: 'PROCTOR_INACTIVE', message: 'Target proctor profile is inactive' }
      });
    }

    const proctorRoles = await userRepo.getActiveRolesByUserId(body.proctor_id);
    if (!proctorRoles.includes('proctor')) {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE', message: 'Target user does not possess proctor role' }
      });
    }

    // 2. Fetch context
    const existingAssignments = await academicRepo.listProctorAssignments();
    const enrollments = await academicRepo.listEnrollments();
    const classes = await academicRepo.listClasses();

    // 3. Validate student profiles & roles
    const conflicts: Array<{ student_id: string; student_name: string; current_proctor_id: string; current_proctor_name: string }> = [];
    const queue: Array<{ studentId: string; classId: string; existingAssignment?: any }> = [];

    for (const studentId of body.student_ids) {
      const student = await userRepo.getProfileById(studentId);
      if (!student) {
        return res.status(404).json({
          error: { code: 'STUDENT_NOT_FOUND', message: `Student profile ${studentId} does not exist` }
        });
      }
      if (student.status !== 'active') {
        return res.status(403).json({
          error: { code: 'STUDENT_INACTIVE', message: `Student ${student.full_name} is inactive` }
        });
      }
      const roles = await userRepo.getActiveRolesByUserId(studentId);
      if (!roles.includes('student')) {
        return res.status(400).json({
          error: { code: 'INVALID_ROLE', message: `User ${student.full_name} does not possess student role` }
        });
      }

      // Resolve class
      let classId = body.class_id;
      if (!classId) {
        const studentEnrollment = enrollments.find(e => e.student_id === studentId);
        if (studentEnrollment) {
          classId = studentEnrollment.class_id;
        } else if (classes.length > 0) {
          classId = classes[0].id;
        }
      }
      if (!classId) {
        return res.status(400).json({
          error: { code: 'CLASS_REQUIRED', message: `Could not resolve academic class cohort for student ${student.full_name}` }
        });
      }

      const currentAssignment = existingAssignments.find(pa => pa.student_id === studentId);
      if (currentAssignment) {
        if (currentAssignment.proctor_id === body.proctor_id) {
          // Already assigned to this proctor: prevent duplicate
          continue;
        } else if (!body.allow_reassignment) {
          conflicts.push({
            student_id: studentId,
            student_name: student.full_name,
            current_proctor_id: currentAssignment.proctor_id,
            current_proctor_name: currentAssignment.proctor_name
          });
          continue;
        }
      }

      queue.push({ studentId, classId, existingAssignment: currentAssignment });
    }

    if (conflicts.length > 0 && !body.allow_reassignment) {
      return res.status(409).json({
        error: {
          code: 'PROCTOR_REASSIGNMENT_REQUIRED',
          message: `${conflicts.length} student(s) are already assigned to another proctor. Explicit confirmation is required to reassign them.`,
          conflicts
        }
      });
    }

    const results: any[] = [];
    const validFrom = body.valid_from || new Date().toISOString().split('T')[0];

    for (const item of queue) {
      if (item.existingAssignment) {
        const updated = await academicRepo.reassignProctor(item.existingAssignment.id, body.proctor_id);
        await logAuditEvent({
          actorId: req.userContext?.profile.id,
          action: 'REASSIGN_PROCTOR_ASSIGNMENT',
          resourceType: 'proctor_assignments',
          resourceId: item.existingAssignment.id,
          before: { proctor_id: item.existingAssignment.proctor_id, proctor_name: item.existingAssignment.proctor_name },
          after: { proctor_id: body.proctor_id, proctor_name: proctor.full_name }
        });
        results.push(updated);
      } else {
        const pa = await academicRepo.assignProctor({
          id: randomUUID(),
          class_id: item.classId,
          student_id: item.studentId,
          proctor_id: body.proctor_id,
          valid_from: validFrom,
          valid_to: body.valid_to || null,
          assigned_by: req.userContext?.profile.id
        });
        await logAuditEvent({
          actorId: req.userContext?.profile.id,
          action: 'ASSIGN_PROCTOR',
          resourceType: 'proctor_assignments',
          resourceId: pa.id,
          after: pa as any
        });
        results.push(pa);
      }
    }

    res.status(201).json({ success: true, count: results.length, assignments: results });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/proctor-assignments/reassign', async (req: Request, res: Response) => {
  try {
    const body = ReassignProctorRequestSchema.parse(req.body);
    const academicRepo = getAcademicRepository();
    const userRepo = getUserRepository();

    const targetProctor = await userRepo.getProfileById(body.target_proctor_id);
    if (!targetProctor) {
      return res.status(404).json({ error: { code: 'PROCTOR_NOT_FOUND', message: 'Target proctor does not exist' } });
    }
    if (targetProctor.status !== 'active') {
      return res.status(403).json({ error: { code: 'PROCTOR_INACTIVE', message: 'Target proctor is inactive' } });
    }
    const roles = await userRepo.getActiveRolesByUserId(body.target_proctor_id);
    if (!roles.includes('proctor')) {
      return res.status(400).json({ error: { code: 'INVALID_ROLE', message: 'Target user does not possess proctor role' } });
    }

    const assignments = await academicRepo.listProctorAssignments();
    const existing = assignments.find(pa => pa.id === body.assignment_id);
    if (!existing) {
      return res.status(404).json({ error: { code: 'ASSIGNMENT_NOT_FOUND', message: 'Proctor assignment not found' } });
    }

    if (existing.proctor_id === body.target_proctor_id) {
      return res.status(400).json({ error: { code: 'ALREADY_ASSIGNED', message: 'Student is already assigned to this proctor' } });
    }

    const updated = await academicRepo.reassignProctor(existing.id, body.target_proctor_id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'REASSIGN_PROCTOR_ASSIGNMENT',
      resourceType: 'proctor_assignments',
      resourceId: existing.id,
      before: { proctor_id: existing.proctor_id, proctor_name: existing.proctor_name },
      after: { proctor_id: body.target_proctor_id, proctor_name: targetProctor.full_name }
    });

    res.status(200).json({ success: true, assignment: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/proctor-assignments/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const academicRepo = getAcademicRepository();

    await academicRepo.removeProctorAssignment(id);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'REMOVE_PROCTOR_ASSIGNMENT',
      resourceType: 'proctor_assignments',
      resourceId: id,
      after: null
    });

    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * -----------------------------------------------------------------------------
 * User Directory & Roles
 * -----------------------------------------------------------------------------
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const userRepo = getUserRepository();
    const academicRepo = getAcademicRepository();
    const [usersWithRoles, rawAllocations, progs, specs] = await Promise.all([
      userRepo.listUsers(),
      academicRepo.listFacultyAllocations().catch(() => []),
      academicRepo.listProgrammes().catch(() => []),
      academicRepo.listSpecializations().catch(() => [])
    ]);
    const progMap = new Map(progs.map(p => [p.id, p]));
    const specMap = new Map(specs.map(s => [s.id, s]));
    const allocations = (rawAllocations || []).map(a => ({
      ...a,
      programme_code: progMap.get(a.programme_id)?.code || null,
      programme_name: progMap.get(a.programme_id)?.name || null,
      specialization_code: a.specialization_id ? specMap.get(a.specialization_id)?.code || null : null,
      specialization_name: a.specialization_id ? specMap.get(a.specialization_id)?.name || null : null
    }));
    res.status(200).json({ users: usersWithRoles, allocations });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/users/invite', async (req: Request, res: Response) => {
  try {
    const body = InviteUserRequestSchema.parse(req.body);
    const userRepo = getUserRepository();

    if (body.role === 'hod') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_PRIVILEGE_ESCALATION', message: 'HOD role cannot be granted via standard user invitation' }
      });
    }

    const isFaculty = body.account_type === 'faculty' || (body.role !== 'student' && !body.usn);
    const isStudent = body.account_type === 'student' || body.role === 'student';

    if (!isFaculty && !isStudent) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'User type must be either student or faculty' }
      });
    }

    // Strict boundary enforcement:
    // A faculty request must NEVER receive student role
    if (body.account_type === 'faculty' && body.role === 'student') {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE_FOR_ACCOUNT_TYPE', message: 'Faculty accounts cannot be assigned the student role' }
      });
    }

    // A student request must NEVER receive faculty roles
    if (body.account_type === 'student' && body.role !== 'student') {
      return res.status(400).json({
        error: { code: 'INVALID_ROLE_FOR_ACCOUNT_TYPE', message: 'Student accounts cannot be assigned faculty roles' }
      });
    }

    if (isStudent) {
      if (!body.usn || body.usn.trim() === '') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'USN is required for student accounts' }
        });
      }
      const finalUsn = body.usn.trim().toUpperCase();

      // Check duplicate USN
      const existingUsn = await userRepo.getProfileByUsn(finalUsn);
      if (existingUsn) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_USN', message: `A student with USN "${finalUsn}" already exists` }
        });
      }

      // Check duplicate email
      const existingEmail = await userRepo.getProfileByEmail(body.email.trim().toLowerCase());
      if (existingEmail) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_EMAIL', message: 'A user with this email address already exists' }
        });
      }

      const result = await userRepo.inviteUser({
        full_name: body.full_name.trim(),
        email: body.email.trim().toLowerCase(),
        usn: finalUsn,
        role: 'student',
        scope_id: body.scope_id || null,
        assigned_by: req.userContext?.profile.id
      });

      await logAuditEvent({
        actorId: req.userContext?.profile.id,
        action: 'INVITE_USER_WITH_ROLE',
        resourceType: 'profiles',
        resourceId: result.user.id,
        after: { profile: result.user, role: result.role, account_type: 'student' }
      });

      return res.status(201).json({ user: result.user, role: result.role });
    }

    if (isFaculty) {
      const allowedFacultyRoles: AppRole[] = ['subject_teacher', 'class_teacher', 'proctor'];
      const targetRoles: AppRole[] = [];

      if (body.roles && Array.isArray(body.roles) && body.roles.length > 0) {
        for (const r of body.roles) {
          if (allowedFacultyRoles.includes(r as AppRole) && !targetRoles.includes(r as AppRole)) {
            targetRoles.push(r as AppRole);
          }
        }
      }

      if (targetRoles.length === 0) {
        if (body.role && allowedFacultyRoles.includes(body.role as AppRole)) {
          targetRoles.push(body.role as AppRole);
        } else {
          targetRoles.push('subject_teacher');
        }
      }

      // Check duplicate email
      const existingEmail = await userRepo.getProfileByEmail(body.email.trim().toLowerCase());
      if (existingEmail) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_EMAIL', message: 'A user with this email address already exists' }
        });
      }

      const primaryRole = targetRoles[0];
      const result = await userRepo.inviteUser({
        full_name: body.full_name.trim(),
        email: body.email.trim().toLowerCase(),
        usn: null,
        role: primaryRole,
        scope_id: body.scope_id || null,
        assigned_by: req.userContext?.profile.id
      });

      // Assign any additional faculty roles
      for (let i = 1; i < targetRoles.length; i++) {
        try {
          await userRepo.assignRole({
            userId: result.user.id,
            role: targetRoles[i],
            assignedBy: req.userContext?.profile.id,
            active: true
          });
        } catch {}
      }

      await logAuditEvent({
        actorId: req.userContext?.profile.id,
        action: 'INVITE_USER_WITH_ROLE',
        resourceType: 'profiles',
        resourceId: result.user.id,
        after: { profile: result.user, roles: targetRoles, account_type: 'faculty' }
      });

      return res.status(201).json({ user: result.user, role: result.role, roles: targetRoles });
    }
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    if (err?.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ error: { code: 'DUPLICATE_EMAIL', message: err.message } });
    }
    if (err?.code === 'DUPLICATE_USN') {
      return res.status(409).json({ error: { code: 'DUPLICATE_USN', message: err.message } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/users/:id/assignments', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const userRepo = getUserRepository();
    const academicRepo = getAcademicRepository();

    const user = await userRepo.getProfileById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    const roles = await userRepo.getActiveRolesByUserId(targetUserId);
    const classSubjects = await academicRepo.listClassSubjectsByTeacher(targetUserId);
    const classTeacherClasses = await academicRepo.listClassesByTeacher(targetUserId);
    const proctorAssignments = await academicRepo.listProctorAssignmentsByProctor(targetUserId);
    const allocations = await academicRepo.listFacultyAllocations(targetUserId);

    // Enrich class_subjects and allocations with programme and specialization data where available
    const [allProgrammes, allSpecializations, allSubjects] = await Promise.all([
      academicRepo.listProgrammes().catch(() => []),
      academicRepo.listSpecializations().catch(() => []),
      academicRepo.listSubjects().catch(() => [])
    ]);

    const enrichedAllocations = allocations.map((a) => {
      const prog = allProgrammes.find((p) => p.id === a.programme_id);
      const spec = a.specialization_id ? allSpecializations.find((sp) => sp.id === a.specialization_id) : null;
      return {
        ...a,
        programme_code: prog?.code || 'MCA',
        programme_name: prog?.name || 'Master of Computer Applications',
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null
      };
    });

    const enrichedClassSubjects = classSubjects.map((cs) => {
      const sub = allSubjects.find((s) => s.id === cs.subject_id);
      const prog = sub?.programme_id ? allProgrammes.find((p) => p.id === sub.programme_id) : null;
      const spec = sub?.specialization_id ? allSpecializations.find((sp) => sp.id === sub.specialization_id) : null;
      return {
        ...cs,
        programme_id: sub?.programme_id || null,
        programme_code: prog?.code || 'MCA',
        programme_name: prog?.name || 'Master of Computer Applications',
        specialization_id: sub?.specialization_id || null,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        semester: sub?.semester || null
      };
    });

    res.status(200).json({
      user,
      roles,
      allocations: enrichedAllocations,
      class_subjects: enrichedClassSubjects,
      class_teacher_classes: classTeacherClasses,
      proctor_assignments: proctorAssignments
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

// Dedicated endpoint to fetch available unassigned subjects for a faculty allocation
router.get('/faculty/:id/available-subjects', async (req: Request, res: Response) => {
  try {
    const facultyId = req.params.id;
    const programmeId = req.query.programme_id as string;
    const specializationId = (req.query.specialization_id as string) || null;
    const semesterStr = req.query.semester as string;

    if (!programmeId) {
      return res.status(400).json({ error: { code: 'MISSING_PROGRAMME', message: 'programme_id is required' } });
    }
    if (!semesterStr) {
      return res.status(400).json({ error: { code: 'MISSING_SEMESTER', message: 'semester is required' } });
    }

    const semester = parseInt(semesterStr, 10);
    if (isNaN(semester) || semester <= 0) {
      return res.status(400).json({ error: { code: 'INVALID_SEMESTER', message: 'semester must be a positive integer' } });
    }

    const academicRepo = getAcademicRepository();
    const availableSubjects = await academicRepo.listAvailableSubjectsForFaculty({
      facultyId,
      programmeId,
      specializationId,
      semester
    });

    return res.status(200).json({
      success: true,
      count: availableSubjects.length,
      subjects: availableSubjects
    });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/faculty/:id/assign-subjects', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const rawBody = { ...req.body, faculty_id: targetUserId };
    if (rawBody.programme_id === '') rawBody.programme_id = undefined;
    if (rawBody.specialization_id === '') rawBody.specialization_id = undefined;
    if (rawBody.semester === '' || rawBody.semester === 0) rawBody.semester = undefined;
    if (rawBody.class_id === '') rawBody.class_id = undefined;

    const body = AssignFacultySubjectsRequestSchema.parse(rawBody);
    const userRepo = getUserRepository();
    const academicRepo = getAcademicRepository();

    const teacher = await userRepo.getProfileById(targetUserId);
    if (!teacher || teacher.status !== 'active') {
      return res.status(400).json({
        error: { code: 'INVALID_FACULTY', message: 'Target faculty profile does not exist or is inactive' }
      });
    }

    // 1. Validate programme exists
    const programme = await academicRepo.getProgrammeById(body.programme_id);
    if (!programme) {
      return res.status(400).json({
        error: { code: 'INVALID_PROGRAMME', message: `Programme not found: ${body.programme_id}` }
      });
    }

    // 2. Validate specialization if provided
    if (body.specialization_id) {
      const spec = await academicRepo.getSpecializationById(body.specialization_id);
      if (!spec || spec.programme_id !== body.programme_id) {
        return res.status(400).json({
          error: { code: 'INVALID_SPECIALIZATION', message: 'Specialization does not belong to the selected programme' }
        });
      }
    }

    // 3. Pre-validate all requested subjects BEFORE performing any database mutations
    const subjectsToAssign: Subject[] = [];
    if (body.subject_ids && body.subject_ids.length > 0) {
      for (const subjectId of body.subject_ids) {
        const subject = await academicRepo.getSubjectById(subjectId);
        if (!subject) {
          return res.status(400).json({
            error: {
              code: 'INVALID_SUBJECT',
              message: 'The selected subject could not be found. Please refresh the subject list and try again.'
            }
          });
        }

        // When live Supabase is connected in non-test mode, verify that the subject exists in PostgreSQL
        const isLive = isLiveSupabaseConfigured && Boolean(supabaseAdmin) && process.env.NODE_ENV !== 'test' && process.env.SMARTFA_TEST_MODE !== 'true';
        if (isLive) {
          try {
            const { data: remoteSub, error: remoteErr } = await supabaseAdmin!
              .from('subjects')
              .select('id')
              .eq('id', subjectId)
              .maybeSingle();
            if (remoteErr || !remoteSub) {
              return res.status(400).json({
                error: {
                  code: 'INVALID_SUBJECT',
                  message: 'The selected subject could not be found. Please refresh the subject list and try again.'
                }
              });
            }
          } catch {
            return res.status(400).json({
              error: {
                code: 'INVALID_SUBJECT',
                message: 'The selected subject could not be found. Please refresh the subject list and try again.'
              }
            });
          }
        }

        // Validate Programme compatibility
        if (body.programme_id && subject.programme_id && subject.programme_id !== body.programme_id) {
          return res.status(400).json({
            error: { code: 'INVALID_COMBINATION', message: `Subject ${subject.code} does not belong to the selected programme` }
          });
        }

        // Validate Specialization compatibility
        if (body.specialization_id && subject.specialization_id && subject.specialization_id !== body.specialization_id) {
          const linkedSpecs = await academicRepo.listSubjectsBySpecialization(body.specialization_id).catch(() => []);
          const isLinked = linkedSpecs.some(s => s.id === subject.id);
          if (!isLinked) {
            return res.status(400).json({
              error: { code: 'INVALID_COMBINATION', message: `Subject ${subject.code} does not belong to the selected specialization` }
            });
          }
        }
        if (!body.specialization_id && subject.specialization_id) {
          return res.status(400).json({
            error: { code: 'INVALID_COMBINATION', message: `Subject ${subject.code} is specialization-specific and cannot be assigned under Core / All Specialization` }
          });
        }

        // Validate Semester compatibility
        if (body.semester && subject.semester && subject.semester !== body.semester) {
          return res.status(400).json({
            error: { code: 'INVALID_COMBINATION', message: `Subject ${subject.code} (Sem ${subject.semester}) does not match the selected semester ${body.semester}` }
          });
        }

        // Conflict validation across active allocations for this programme and semester
        const allClassSubjects = await academicRepo.listClassSubjects();
        const conflict = allClassSubjects.find(cs => {
          if (!cs.active) return false;
          if (cs.subject_id !== subject.id) return false;
          if (cs.subject_teacher_id === targetUserId) return false; // same teacher is idempotent
          const semMatch = cs.semester === (body.semester || subject.semester);
          return semMatch;
        });

        if (conflict) {
          return res.status(409).json({
            error: {
              code: 'CLASS_SUBJECT_CONFLICT',
              message: `Subject ${subject.code} is already allocated to another faculty member (${conflict.teacher_name || 'Another Faculty'}) for Semester ${body.semester || subject.semester}`
            }
          });
        }

        subjectsToAssign.push(subject);
      }
    }

    // 4. Record the academic allocation (Programme, Specialization, Semester) independently
    const allocation = await academicRepo.createFacultyAllocation({
      id: randomUUID(),
      faculty_id: targetUserId,
      programme_id: body.programme_id,
      specialization_id: body.specialization_id || null,
      semester: body.semester || null,
      assigned_by: req.userContext?.profile.id || null
    });

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'ASSIGN_FACULTY_ALLOCATION',
      resourceType: 'faculty_allocations',
      resourceId: allocation.id,
      after: allocation as any
    });

    // If zero subjects are provided, return allocation directly without creating class subjects
    if (subjectsToAssign.length === 0) {
      return res.status(201).json({
        success: true,
        count: 0,
        assigned: [],
        allocation,
        message: 'Academic allocation saved successfully without subject assignments'
      });
    }

    // 5. Assign subjects to class cohort with rollback tracking on failure
    const assigned: any[] = [];
    const newlyAssignedCsIds: string[] = [];

    try {
      const allClasses = await academicRepo.listClasses();
      const allProgrammes = await academicRepo.listProgrammes().catch(() => []);
      const allSpecializations = await academicRepo.listSpecializations().catch(() => []);
      const isValidUuid = (val: string | null | undefined): boolean => {
        if (!val) return false;
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
      };

      for (const subject of subjectsToAssign) {
        const candidateProgId = subject.programme_id || body.programme_id;
        const prog = (candidateProgId && isValidUuid(candidateProgId))
          ? allProgrammes.find(p => p.id === candidateProgId)
          : null;
        const effectiveProgId = prog ? prog.id : (allProgrammes[0]?.id && isValidUuid(allProgrammes[0].id) ? allProgrammes[0].id : null);
        const progCode = prog?.code || allProgrammes.find(p => p.id === effectiveProgId)?.code || 'MCA';
        const effectiveSemester = subject.semester || body.semester || 1;

        const candidateSpecId = subject.specialization_id || body.specialization_id;
        const spec = (candidateSpecId && isValidUuid(candidateSpecId))
          ? allSpecializations.find(s => s.id === candidateSpecId)
          : null;
        const effectiveSpecId = spec ? spec.id : null;

        // Find matching class or auto-create canonical class for programme and semester
        let targetClassId = body.class_id;
        if (!targetClassId) {
          let matchingClass = allClasses.find((c) => {
            const semMatch = c.semester === effectiveSemester;
            const progMatch = (effectiveProgId && c.programme_id === effectiveProgId) ||
              c.programme.toUpperCase() === progCode.toUpperCase();
            return semMatch && progMatch;
          });

          if (!matchingClass) {
            try {
              const createdClass = await academicRepo.createClass({
                id: randomUUID(),
                programme: progCode,
                programme_id: effectiveProgId || null,
                specialization_id: effectiveSpecId || null,
                semester: effectiveSemester,
                section: 'A',
                class_teacher_id: null
              });
              const detailedClass: any = {
                ...createdClass,
                term_name: '',
                class_teacher_name: 'Unassigned'
              };
              allClasses.push(detailedClass);
              targetClassId = createdClass.id;
            } catch (createErr: any) {
              const freshClasses = await academicRepo.listClasses();
              const found = freshClasses.find((c) => {
                const semMatch = c.semester === effectiveSemester;
                const progMatch = (effectiveProgId && c.programme_id === effectiveProgId) ||
                  c.programme.toUpperCase() === progCode.toUpperCase();
                return semMatch && progMatch;
              });
              if (found) {
                targetClassId = found.id;
                allClasses.push(found);
              } else {
                throw createErr;
              }
            }
          } else {
            targetClassId = matchingClass.id;
          }
        }

        // Check conflict and duplicate allocations
        const existingMapping = await academicRepo.getClassSubjectByClassAndSubject(targetClassId, subject.id);
        if (existingMapping) {
          if (existingMapping.subject_teacher_id === targetUserId) {
            // Idempotent duplicate: already assigned to this faculty member
            continue;
          }
          const conflictErr: any = new Error(`Subject ${subject.code} is already allocated to another faculty member for ${progCode} Semester ${effectiveSemester}`);
          conflictErr.code = 'CLASS_SUBJECT_CONFLICT';
          conflictErr.status = 409;
          throw conflictErr;
        }

        const cs = await academicRepo.assignClassSubject({
          id: randomUUID(),
          class_id: targetClassId,
          subject_id: subject.id,
          subject_teacher_id: targetUserId,
          active: true
        });
        newlyAssignedCsIds.push(cs.id);
        assigned.push(cs);

        // Ensure faculty profile has subject_teacher role
        const currentRoles = await userRepo.getActiveRolesByUserId(targetUserId);
        if (!currentRoles.includes('subject_teacher') && !currentRoles.includes('hod')) {
          await userRepo.assignRole({
            userId: targetUserId,
            role: 'subject_teacher',
            assignedBy: req.userContext?.profile.id
          });
          invalidateUserContextCache(targetUserId);
        }

        await logAuditEvent({
          actorId: req.userContext?.profile.id,
          action: 'ASSIGN_CLASS_SUBJECT',
          resourceType: 'class_subjects',
          resourceId: cs.id,
          after: {
            faculty_id: targetUserId,
            subject_id: subject.id,
            class_id: targetClassId,
            programme_id: effectiveProgId,
            semester: effectiveSemester
          } as any
        });
      }

      return res.status(201).json({
        success: true,
        count: assigned.length,
        assigned,
        allocation
      });
    } catch (assignError: any) {
      // Rollback any newly assigned class_subjects in this batch to preserve database integrity
      for (const csId of newlyAssignedCsIds) {
        await academicRepo.unassignClassSubject(csId).catch(() => {});
      }

      if (
        assignError?.code === 'INVALID_SUBJECT' ||
        assignError?.status === 400 ||
        (assignError?.message && (
          assignError.message.includes('class_subjects_subject_id_fkey') ||
          assignError.message.includes('foreign key constraint') ||
          assignError.message.includes('subject could not be found')
        ))
      ) {
        return res.status(400).json({
          error: {
            code: 'INVALID_SUBJECT',
            message: 'The selected subject could not be found. Please refresh the subject list and try again.'
          }
        });
      }

      if (assignError?.status === 409 || assignError?.code === 'CLASS_SUBJECT_CONFLICT') {
        return res.status(409).json({
          error: {
            code: 'CLASS_SUBJECT_CONFLICT',
            message: assignError.message || 'Subject conflict detected'
          }
        });
      }

      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to assign class subjects. Please refresh and try again.'
        }
      });
    }
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/faculty/:id/allocations/:allocationId', async (req: Request, res: Response) => {
  try {
    const { id: targetUserId, allocationId } = req.params;
    const academicRepo = getAcademicRepository();
    await academicRepo.removeFacultyAllocation(allocationId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'REMOVE_FACULTY_ALLOCATION',
      resourceType: 'faculty_allocations',
      resourceId: allocationId,
      before: { faculty_id: targetUserId, allocation_id: allocationId },
      after: null
    });

    res.status(200).json({ success: true, removed_id: allocationId });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.get('/faculty-allocations', async (req: Request, res: Response) => {
  try {
    const facultyId = req.query.faculty_id as string | undefined;
    const academicRepo = getAcademicRepository();
    const allocations = await academicRepo.listFacultyAllocations(facultyId);
    const [progs, specs] = await Promise.all([
      academicRepo.listProgrammes().catch(() => []),
      academicRepo.listSpecializations().catch(() => [])
    ]);
    const progMap = new Map(progs.map(p => [p.id, p]));
    const specMap = new Map(specs.map(s => [s.id, s]));
    const enriched = allocations.map(a => ({
      ...a,
      programme_code: progMap.get(a.programme_id)?.code || null,
      programme_name: progMap.get(a.programme_id)?.name || null,
      specialization_code: a.specialization_id ? specMap.get(a.specialization_id)?.code || null : null,
      specialization_name: a.specialization_id ? specMap.get(a.specialization_id)?.name || null : null
    }));
    res.status(200).json({ allocations: enriched });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.delete('/users/:id/roles/:role', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const roleToRemove = req.params.role as AppRole;
    const userRepo = getUserRepository();

    // Invariant: HOD cannot revoke or alter their own HOD role (prevent self-demotion or self-lockout)
    if (targetUserId === req.userContext?.profile.id && roleToRemove === 'hod') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_SELF_MODIFICATION', message: 'HOD cannot revoke, alter, or remove their own HOD administrative role' }
      });
    }

    // Invariant: HOD role cannot be altered through regular role management
    if (roleToRemove === 'hod') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_PRIVILEGE_ESCALATION', message: 'HOD role cannot be revoked through regular role management' }
      });
    }

    const user = await userRepo.getProfileById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    const activeRoles = await userRepo.getActiveRolesByUserId(targetUserId);
    if (!activeRoles.includes(roleToRemove)) {
      return res.status(404).json({
        error: { code: 'ROLE_NOT_FOUND', message: 'Target user does not possess this active role' }
      });
    }

    await userRepo.removeRole(targetUserId, roleToRemove);
    invalidateUserContextCache(targetUserId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'REVOKE_USER_ROLE',
      resourceType: 'user_roles',
      resourceId: targetUserId,
      before: {
        role: roleToRemove,
        target_user_id: targetUserId,
        is_self_revocation: targetUserId === req.userContext?.profile.id
      },
      after: null
    });

    res.status(200).json({ success: true, removed_role: roleToRemove, message: `Role ${roleToRemove} removed successfully` });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.post('/users/:id/roles', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const body = AssignRoleRequestSchema.parse(req.body);
    const userRepo = getUserRepository();

    // Invariant: HOD cannot self-assign or grant HOD role (prevent privilege escalation or invalid self-regrant)
    if (body.role === 'hod') {
      const isSelf = targetUserId === req.userContext?.profile.id;
      return res.status(403).json({
        error: {
          code: isSelf ? 'FORBIDDEN_SELF_MODIFICATION' : 'FORBIDDEN_PRIVILEGE_ESCALATION',
          message: isSelf
            ? 'HOD cannot self-assign or alter own HOD role'
            : 'HOD role cannot be granted through regular role assignment'
        }
      });
    }

    const user = await userRepo.getProfileById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    if (user.status !== 'active') {
      return res.status(400).json({
        error: { code: 'ACCOUNT_INACTIVE', message: 'Cannot assign roles to an inactive account' }
      });
    }

    // Invariant: Faculty and HOD accounts cannot be assigned the student role
    const existingRoles = await userRepo.getActiveRolesByUserId(targetUserId);
    const facultyRoles: AppRole[] = ['hod', 'subject_teacher', 'class_teacher', 'proctor'];
    const isFacultyAccount = existingRoles.some(r => facultyRoles.includes(r));
    if (isFacultyAccount && body.role === 'student') {
      const isSelf = targetUserId === req.userContext?.profile.id;
      return res.status(403).json({
        error: {
          code: isSelf ? 'FORBIDDEN_SELF_MODIFICATION' : 'INVALID_ROLE_FOR_ACCOUNT_TYPE',
          message: isSelf
            ? 'HOD cannot self-assign student role'
            : 'Faculty accounts cannot be assigned the student role'
        }
      });
    }

    // Prevent duplicate active role assignment for same user and scope
    if (existingRoles.includes(body.role)) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_ROLE_ASSIGNMENT', message: 'User already possesses this active role and scope' }
      });
    }

    const roleRecord = await userRepo.assignRole({
      userId: targetUserId,
      role: body.role,
      scopeId: body.scope_id || null,
      assignedBy: req.userContext?.profile.id,
      active: body.active
    });
    invalidateUserContextCache(targetUserId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'ASSIGN_USER_ROLE',
      resourceType: 'user_roles',
      resourceId: roleRecord.id,
      after: {
        ...roleRecord,
        target_user_id: targetUserId,
        role: body.role,
        is_self_assignment: targetUserId === req.userContext?.profile.id
      }
    });

    res.status(201).json({ role: roleRecord });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    if (err?.code === 'DUPLICATE_ROLE_ASSIGNMENT') {
      return res.status(409).json({ error: { code: 'DUPLICATE_ROLE_ASSIGNMENT', message: err.message } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * Update Faculty Information (Profile Editing Endpoint)
 * Enforces:
 * 1. HOD authorization (requireRoles(['hod']))
 * 2. Field validation: Name cannot be empty; Email valid format; Phone format; Employee ID uniqueness
 * 3. HOD self-modification protection: HOD cannot alter their own administrative email
 * 4. Role separation: Does not modify user roles (roles are strictly managed independently)
 * 5. Full synchronization between Supabase Auth and public.profiles with rollback on error
 * 6. Append-only audit logging (before, after, actor, target, timestamp)
 */
const handleUpdateFacultyProfile = async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const body = UpdateFacultyProfileRequestSchema.parse(req.body);
    const userRepo = getUserRepository();

    const targetUser = await userRepo.getProfileById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    const activeRoles = await userRepo.getActiveRolesByUserId(targetUserId);
    const facultyRoles: AppRole[] = ['hod', 'subject_teacher', 'class_teacher', 'proctor'];
    const isFacultyAccount = activeRoles.some(r => facultyRoles.includes(r)) || (!targetUser.usn && !activeRoles.includes('student'));

    if (!isFacultyAccount) {
      return res.status(400).json({
        error: { code: 'INVALID_ACCOUNT_TYPE', message: 'Only faculty member profiles can be edited via this endpoint' }
      });
    }

    // Phone format validation (if provided)
    if (body.phone && body.phone.trim() !== '') {
      const phoneClean = body.phone.trim();
      const phoneRegex = /^[+]?[0-9\s\-()]{7,25}$/;
      if (!phoneRegex.test(phoneClean)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid phone number format. Please enter a valid telephone number (e.g. +91 98765 43210).'
          }
        });
      }
    }

    // Employee ID uniqueness check (if provided and non-empty)
    if (body.employee_id && body.employee_id.trim() !== '') {
      const cleanEmpId = body.employee_id.trim().toUpperCase();
      const allUsers = await userRepo.listUsers();
      const duplicateEmp = allUsers.find(
        u => u.id !== targetUserId && u.employee_id && u.employee_id.trim().toUpperCase() === cleanEmpId
      );
      if (duplicateEmp) {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE_EMPLOYEE_ID',
            message: `A faculty member with Employee ID '${body.employee_id}' already exists (${duplicateEmp.full_name}).`
          }
        });
      }
    }

    // Security invariant: HOD cannot alter their own administrative email address through profile editing
    const isSelf = targetUserId === req.userContext?.profile.id;
    if (isSelf && body.email.toLowerCase().trim() !== targetUser.email.toLowerCase()) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN_SELF_MODIFICATION',
          message: 'HOD cannot alter their own administrative email address through faculty profile editing'
        }
      });
    }

    // Email conflict check
    const normalizedEmail = body.email.toLowerCase().trim();
    if (normalizedEmail !== targetUser.email.toLowerCase()) {
      const existingEmailOwner = await userRepo.getProfileByEmail(normalizedEmail);
      if (existingEmailOwner && existingEmailOwner.id !== targetUserId) {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE_EMAIL',
            message: `A user with email address '${body.email}' already exists in the system.`
          }
        });
      }
    }

    const previousState = {
      full_name: targetUser.full_name,
      email: targetUser.email,
      phone: targetUser.phone || null,
      employee_id: targetUser.employee_id || null,
      designation: targetUser.designation || null
    };

    const updatedProfile = await userRepo.updateProfile(targetUserId, {
      full_name: body.full_name.trim(),
      email: normalizedEmail,
      phone: body.phone ? body.phone.trim() : null,
      employee_id: body.employee_id ? body.employee_id.trim() : null,
      designation: body.designation ? body.designation.trim() : null
    });

    invalidateUserContextCache(targetUserId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_FACULTY_PROFILE',
      resourceType: 'profiles',
      resourceId: targetUserId,
      before: previousState,
      after: {
        full_name: updatedProfile.full_name,
        email: updatedProfile.email,
        phone: updatedProfile.phone || null,
        employee_id: updatedProfile.employee_id || null,
        designation: updatedProfile.designation || null
      }
    });

    res.status(200).json({
      success: true,
      message: `Profile for ${updatedProfile.full_name} updated successfully`,
      user: {
        ...updatedProfile,
        roles: activeRoles
      }
    });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    if (err?.code === 'DUPLICATE_EMAIL') {
      return res.status(409).json({ error: { code: 'DUPLICATE_EMAIL', message: err.message } });
    }
    if (err?.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: err.message } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
};

router.patch('/users/:id/profile', handleUpdateFacultyProfile);
router.patch('/users/:id', handleUpdateFacultyProfile);

router.get('/users/:id/profile', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const userRepo = getUserRepository();
    const profile = await userRepo.getProfileById(targetUserId);
    if (!profile) {
      return res.status(404).json({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }
    const roles = await userRepo.getActiveRolesByUserId(targetUserId);
    res.status(200).json({ user: { ...profile, roles } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

router.patch('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const body = UpdateUserStatusRequestSchema.parse(req.body);
    const userRepo = getUserRepository();

    // Invariant: HOD cannot deactivate their own account
    if (targetUserId === req.userContext?.profile.id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_SELF_MODIFICATION', message: 'HOD cannot deactivate their own account' }
      });
    }

    const user = await userRepo.getProfileById(targetUserId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    const previousStatus = user.status;
    const updatedUser = await userRepo.updateUserStatus(targetUserId, body.status);
    invalidateUserContextCache(targetUserId);

    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'UPDATE_USER_STATUS',
      resourceType: 'profiles',
      resourceId: targetUserId,
      before: { status: previousStatus },
      after: { status: body.status }
    });

    res.status(200).json({ user: updatedUser });
  } catch (err: any) {
    if (err?.name === 'ZodError' || err?.issues) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues } });
    }
    res.status(500).json({ error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error' } });
  }
});

/**
 * Delete Inactive Student (Institutional Deletion Endpoint)
 * Enforces:
 * 1. HOD authorization
 * 2. Self-deletion protection
 * 3. Privilege protection (cannot delete faculty or HODs)
 * 4. Inactive account requirement
 * 5. Academic record retention check (submissions, evaluations)
 */
const handleDeleteStudent = async (req: Request, res: Response) => {
  try {
    const targetUserId = req.params.id;
    const userRepo = getUserRepository();

    // Invariant 1: HOD cannot delete own account
    if (targetUserId === req.userContext?.profile.id) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN_SELF_MODIFICATION', message: 'HOD cannot delete own account' }
      });
    }

    // Invariant 2: Target user must exist
    const targetUser = await userRepo.getProfileById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
      });
    }

    // Invariant 3: Verify target roles - must be student, cannot be faculty or HOD
    const activeRoles = await userRepo.getActiveRolesByUserId(targetUserId);
    const facultyRoles: AppRole[] = ['hod', 'subject_teacher', 'class_teacher', 'proctor'];
    const hasPrivilegedRole = activeRoles.some(r => facultyRoles.includes(r));
    if (hasPrivilegedRole) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN_PRIVILEGE_PROTECTION',
          message: 'Cannot delete faculty, proctor, or administrative accounts through student deletion endpoint'
        }
      });
    }

    const isStudent = activeRoles.includes('student') || Boolean(targetUser.usn);
    if (!isStudent) {
      return res.status(400).json({
        error: { code: 'INVALID_TARGET_ROLE', message: 'Target user is not a student account' }
      });
    }

    // Invariant 4: Require student account to be inactive in database
    if (targetUser.status !== 'inactive') {
      return res.status(400).json({
        error: {
          code: 'ACCOUNT_NOT_INACTIVE',
          message: 'Active student accounts cannot be deleted. Deactivate the student account first before attempting deletion.'
        }
      });
    }

    // Invariant 5: Inspect protected academic records (submissions, evaluations, grades)
    const academicCheck = await userRepo.hasProtectedAcademicRecords(targetUserId);
    if (academicCheck.hasRecords) {
      return res.status(409).json({
        error: {
          code: 'CANNOT_DELETE_STUDENT_WITH_ACADEMIC_RECORDS',
          message: `Cannot permanently delete student with existing academic records (${academicCheck.submissionCount} submission(s)). Institutional audit policy requires retaining all assessment submissions and evaluations. The student account has been deactivated to prevent access while preserving academic history.`
        }
      });
    }

    // Invariant 6: Execute deletion across relations, profile, and auth credentials
    await userRepo.deleteStudent(targetUserId);
    invalidateUserContextCache(targetUserId);

    // Invariant 7: Immutable audit event
    await logAuditEvent({
      actorId: req.userContext?.profile.id,
      action: 'DELETE_STUDENT',
      resourceType: 'profiles',
      resourceId: targetUserId,
      before: { profile: targetUser, roles: activeRoles },
      after: null
    });

    return res.status(200).json({
      success: true,
      deleted_student_id: targetUserId,
      message: `Student account for ${targetUser.full_name} (${targetUser.usn || targetUser.email}) successfully deleted`
    });
  } catch (err: any) {
    if (err?.code === 'PROTECTED_ACADEMIC_RECORDS') {
      return res.status(409).json({
        error: { code: 'CANNOT_DELETE_STUDENT_WITH_ACADEMIC_RECORDS', message: err.message }
      });
    }
    return res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error processing student deletion' }
    });
  }
};

router.delete('/users/:id', handleDeleteStudent);
router.delete('/students/:id', handleDeleteStudent);

/**
 * -----------------------------------------------------------------------------
 * Audit Records Timeline
 * -----------------------------------------------------------------------------
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    let limit: number | undefined;
    let offset: number | undefined;

    if (req.query.limit !== undefined) {
      const parsed = Number(req.query.limit);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter "limit" must be an integer between 1 and 200'
          }
        });
      }
      limit = parsed;
    }

    if (req.query.offset !== undefined) {
      const parsed = Number(req.query.offset);
      if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter "offset" must be a non-negative integer'
          }
        });
      }
      offset = parsed;
    }

    const events = await listAuditEvents({ limit, offset });
    res.status(200).json({ events });
  } catch (err: any) {
    if (err?.code === 'INVALID_PARAMETER') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.message }
      });
    }
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: err?.message || 'Database error retrieving audit records' }
    });
  }
});

/**
 * -----------------------------------------------------------------------------
 * Institutional Submission Report (HOD Institutional Oversight)
 * -----------------------------------------------------------------------------
 */
router.get('/institutional-submissions-report', async (req: Request, res: Response) => {
  try {
    const user = req.userContext!;
    const assessmentId = req.query.assessment_id as string | undefined;
    const academicRepo = getAcademicRepository();
    const assRepo = getAssessmentRepository();
    const subRepo = getSubmissionRepository();

    // 1. Fetch academic structure entities independently
    const [allProgrammes, allSpecializations, allClasses, allClassSubjects, allSubjects] = await Promise.all([
      academicRepo.listProgrammes().catch(() => []),
      academicRepo.listSpecializations().catch(() => []),
      academicRepo.listClasses().catch(() => []),
      academicRepo.listClassSubjects().catch(() => []),
      academicRepo.listSubjects().catch(() => [])
    ]);

    let subjectSpecializations: Array<{ subject_id: string; specialization_id: string }> = [];
    try {
      if (supabaseAdmin) {
        const { data } = await supabaseAdmin.from('subject_specializations').select('subject_id, specialization_id');
        if (data) subjectSpecializations = data;
      }
    } catch {}
    if (db.subject_specializations && db.subject_specializations.length > 0) {
      for (const ss of db.subject_specializations) {
        if (!subjectSpecializations.some(s => s.subject_id === ss.subject_id && s.specialization_id === ss.specialization_id)) {
          subjectSpecializations.push({ subject_id: ss.subject_id, specialization_id: ss.specialization_id });
        }
      }
    }

    // 2. Fetch active enrollments independently across the entire institution
    const allEnrollments = await academicRepo.listEnrollments().catch(() => []);
    const activeEnrollments = allEnrollments.filter(e => e.status === 'active');

    // 3. Fetch published assessments
    const allAssessments = await assRepo.listAssessments(user).catch(() => []);
    const publishedAssessments = allAssessments.filter(a => 
      a.status === 'published' || a.status === 'closed' || Boolean(a.published_at)
    );

    // 4. Fetch submission records (scoped to assessmentId if requested for Level 3 on-demand query)
    const allReports = await subRepo.getLateSubmissionsReport(user, assessmentId).catch(() => []);

    // If assessmentId is requested, return Level 3 student report for that specific assessment
    if (assessmentId) {
      const assessment = publishedAssessments.find(a => a.id === assessmentId) || allAssessments.find(a => a.id === assessmentId);
      if (!assessment) {
        return res.status(404).json({ error: { code: 'ASSESSMENT_NOT_FOUND', message: 'Assessment not found or not accessible' } });
      }

      const cs = allClassSubjects.find(c => c.id === assessment.class_subject_id || c.subject_id === assessment.class_subject_id);
      const cls = cs ? allClasses.find(c => c.id === cs.class_id) : undefined;
      const sub = cs ? allSubjects.find(s => s.id === cs.subject_id) : undefined;

      const rawSpecId = sub?.specialization_id || subjectSpecializations.find(ss => ss.subject_id === cs?.subject_id)?.specialization_id || cls?.specialization_id || null;
      const spec = rawSpecId ? allSpecializations.find(sp => sp.id === rawSpecId) : null;
      const prog = cls?.programme_id ? allProgrammes.find(p => p.id === cls.programme_id) : null;
      const progName = prog?.code || cls?.programme || 'MCA';

      // Eligible enrollments for this class & subject specialization
      const classEnrollments = cls ? activeEnrollments.filter(e => e.class_id === cls.id) : [];
      const eligibleEnrollments = rawSpecId
        ? classEnrollments.filter(e => e.specialization_id === rawSpecId || (spec?.code && e.specialization_code === spec.code))
        : classEnrollments;

      const assReports = allReports.filter(r => r.assessment_id === assessment.id);

      const studentRows = eligibleEnrollments.map(student => {
        const match = assReports.find(r => 
          r.student_id === student.student_id || (student.student_usn && r.student_usn === student.student_usn)
        );

        const isSubmitted = Boolean(match && match.is_submitted);
        const isLate = Boolean(match?.is_late || match?.timing_status === 'Late');
        const timingStatus: 'On Time' | 'Late' | '—' = isSubmitted ? (isLate ? 'Late' : 'On Time') : '—';
        const isEvaluated = match && (
          match.evaluation_status === 'completed' ||
          match.evaluation_status === 'published' ||
          (match.final_score !== null && match.final_score !== undefined)
        );
        const isPublished = match?.is_published || match?.evaluation_status === 'published';

        let evaluationLabel: 'Published' | 'Evaluated' | 'Pending Evaluation' | '—' = '—';
        if (isSubmitted) {
          if (isPublished) evaluationLabel = 'Published';
          else if (isEvaluated) evaluationLabel = 'Evaluated';
          else evaluationLabel = 'Pending Evaluation';
        }

        const score = (match?.published_score !== null && match?.published_score !== undefined)
          ? match.published_score
          : (isEvaluated && match?.final_score !== null && match?.final_score !== undefined ? match.final_score : null);

        const fallbackRow = match || {
          submission_id: null,
          assessment_id: assessment.id,
          assessment_title: assessment.title,
          class_id: cls?.id,
          class_name: cls ? formatClassName(cls) : 'Class',
          subject_name: sub ? `${sub.code} - ${sub.name}` : (cs?.subject_name || 'Subject'),
          student_id: student.student_id,
          student_name: student.student_name,
          student_email: student.student_email,
          student_usn: student.student_usn,
          is_submitted: false,
          submitted_at: null,
          is_late: false,
          timing_status: '—',
          evaluation_status: 'not_submitted',
          published_score: null,
          max_marks: assessment.max_marks || 50
        };

        return {
          id: student.student_id,
          student_id: student.student_id,
          name: student.student_name,
          usn: student.student_usn || 'N/A',
          email: student.student_email,
          programme: student.programme || progName,
          specialization_id: student.specialization_id || rawSpecId,
          specialization_code: student.specialization_code || spec?.code || null,
          specialization_name: student.specialization_name || spec?.name || null,
          semester: student.semester || cls?.semester || null,
          class_id: cls?.id,
          class_name: cls ? formatClassName(cls) : 'Class',
          is_submitted: isSubmitted,
          submission_status: isSubmitted ? 'Submitted' : 'Pending',
          submitted_at: match?.submitted_at || null,
          timing_status: timingStatus,
          evaluation_status: match?.evaluation_status || (isSubmitted ? 'pending' : 'not_submitted'),
          evaluation_status_label: evaluationLabel,
          score,
          max_marks: assessment.max_marks || 50,
          submission_id: match?.submission_id || null,
          feedback: match?.feedback || null,
          report_row: fallbackRow
        };
      });

      return res.status(200).json({
        assessment: {
          id: assessment.id,
          title: assessment.title,
          max_marks: assessment.max_marks || 50,
          deadline_at: assessment.deadline_at,
          subject_code: sub?.code || (cs?.subject_name?.split(' - ')[0]) || 'SUB',
          subject_name: sub?.name || cs?.subject_name || 'Subject',
          programme: progName,
          specialization_code: spec?.code || null,
          specialization_name: spec?.name || null,
          semester: cls?.semester || sub?.semester,
          class_name: cls ? formatClassName(cls) : 'Class',
          total_eligible_students: eligibleEnrollments.length,
          submitted_count: studentRows.filter(s => s.is_submitted).length,
          pending_count: studentRows.filter(s => !s.is_submitted).length
        },
        students: studentRows
      });
    }

    // Level 1 & Level 2 overview
    // Map each published assessment with its stats
    const assessmentItems = publishedAssessments.map(a => {
      const cs = allClassSubjects.find(c => c.id === a.class_subject_id || c.subject_id === a.class_subject_id);
      const cls = cs ? allClasses.find(c => c.id === cs.class_id) : undefined;
      const sub = cs ? allSubjects.find(s => s.id === cs.subject_id) : undefined;

      const rawSpecId = sub?.specialization_id || subjectSpecializations.find(ss => ss.subject_id === cs?.subject_id)?.specialization_id || cls?.specialization_id || null;
      const spec = rawSpecId ? allSpecializations.find(sp => sp.id === rawSpecId) : null;
      const prog = cls?.programme_id ? allProgrammes.find(p => p.id === cls.programme_id) : null;
      const progName = prog?.code || cls?.programme || 'MCA';

      const classEnrollments = cls ? activeEnrollments.filter(e => e.class_id === cls.id) : [];
      const eligibleEnrollments = rawSpecId
        ? classEnrollments.filter(e => e.specialization_id === rawSpecId || (spec?.code && e.specialization_code === spec.code))
        : classEnrollments;

      const totalEligible = eligibleEnrollments.length;
      const assReports = allReports.filter(r => r.assessment_id === a.id);
      const submittedCount = eligibleEnrollments.filter(e => assReports.some(r => r.student_id === e.student_id && r.is_submitted)).length;
      const pendingCount = Math.max(0, totalEligible - submittedCount);
      const evaluatedCount = eligibleEnrollments.filter(e => assReports.some(r => r.student_id === e.student_id && (r.evaluation_status === 'completed' || r.evaluation_status === 'published' || r.published_score !== null))).length;
      const progressPct = totalEligible > 0 ? Math.round((submittedCount / totalEligible) * 100) : 0;
      const evalProgressPct = submittedCount > 0 ? Math.round((evaluatedCount / submittedCount) * 100) : 0;

      return {
        id: a.id,
        assessment_id: a.id,
        title: a.title,
        instructions: a.instructions,
        max_marks: a.max_marks || 50,
        deadline_at: a.deadline_at,
        status: a.status,
        class_subject_id: a.class_subject_id,
        subject_id: sub?.id || cs?.subject_id || '',
        subject_code: sub?.code || (cs?.subject_name?.includes(' - ') ? cs.subject_name.split(' - ')[0].trim() : 'SUB'),
        subject_name: sub?.name || (cs?.subject_name?.includes(' - ') ? cs.subject_name.split(' - ').slice(1).join(' - ').trim() : 'Subject'),
        class_id: cls?.id || '',
        class_name: cls ? formatClassName(cls) : (a.class_details || 'Class'),
        programme: progName,
        programme_id: cls?.programme_id || sub?.programme_id || null,
        specialization_id: rawSpecId,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        semester: cls?.semester || sub?.semester || null,
        total_eligible_students: totalEligible,
        submission_count: submittedCount,
        pending_count: pendingCount,
        evaluated_count: evaluatedCount,
        progress_pct: progressPct,
        evaluation_progress_pct: evalProgressPct
      };
    });

    // Group into distinct Academic Subject Offerings across the institution (Level 1)
    const subjectOfferingsMap = new Map<string, any>();

    // Helper to generate distinct canonical offering key
    const getOfferingKey = (subCode: string, prog: string, sem: number | null, specId: string | null) => {
      const cleanCode = (subCode || 'SUB').trim().toUpperCase();
      const cleanProg = (prog || 'MCA').trim().toUpperCase();
      const cleanSem = sem !== null && sem !== undefined ? `Sem${sem}` : 'SemAll';
      const cleanSpec = (specId || 'core').trim().toLowerCase();
      return `${cleanCode}_${cleanProg}_${cleanSem}_${cleanSpec}`;
    };

    // 1. Seed from all active class-subject allocations across the institution
    const activeClassSubjects = allClassSubjects.filter(cs => cs.active);
    for (const cs of activeClassSubjects) {
      const cls = cs.class_id ? allClasses.find(c => c.id === cs.class_id) : undefined;
      const sub = cs.subject_id ? allSubjects.find(s => s.id === cs.subject_id) : undefined;

      const rawSpecId = sub?.specialization_id || subjectSpecializations.find(ss => ss.subject_id === cs.subject_id)?.specialization_id || cls?.specialization_id || null;
      const spec = rawSpecId ? allSpecializations.find(sp => sp.id === rawSpecId) : null;
      const prog = cls?.programme_id ? allProgrammes.find(p => p.id === cls.programme_id) : (sub?.programme_id ? allProgrammes.find(p => p.id === sub.programme_id) : null);
      const progName = prog?.code || cls?.programme || 'MCA';
      const progId = prog?.id || cls?.programme_id || sub?.programme_id || null;
      const semester = cls?.semester !== undefined && cls?.semester !== null ? cls.semester : (sub?.semester || null);
      const subCode = sub?.code || (cs.subject_name?.includes(' - ') ? cs.subject_name.split(' - ')[0].trim() : 'SUB');
      const subName = sub?.name || (cs.subject_name?.includes(' - ') ? cs.subject_name.split(' - ').slice(1).join(' - ').trim() : cs.subject_name);

      const key = getOfferingKey(subCode, progName, semester, rawSpecId);

      if (!subjectOfferingsMap.has(key)) {
        subjectOfferingsMap.set(key, {
          id: cs.subject_id || key,
          subject_id: cs.subject_id || key,
          subject_code: subCode,
          subject_name: subName,
          programme: progName,
          programme_id: progId,
          specialization_id: rawSpecId,
          specialization_code: spec?.code || sub?.specialization_code || null,
          specialization_name: spec?.name || sub?.specialization_name || null,
          semester,
          class_subject_ids: [cs.id],
          class_ids: cls ? [cls.id] : [],
          published_assessments_count: 0,
          total_eligible_students: 0,
          assessments: []
        });
      } else {
        const existing = subjectOfferingsMap.get(key);
        if (!existing.class_subject_ids.includes(cs.id)) {
          existing.class_subject_ids.push(cs.id);
        }
        if (cls && !existing.class_ids.includes(cls.id)) {
          existing.class_ids.push(cls.id);
        }
      }
    }

    // 2. Also incorporate any published assessments that might link to non-active or unmapped class subjects
    for (const item of assessmentItems) {
      const key = getOfferingKey(item.subject_code, item.programme, item.semester, item.specialization_id);
      if (!subjectOfferingsMap.has(key)) {
        subjectOfferingsMap.set(key, {
          id: item.subject_id || key,
          subject_id: item.subject_id || key,
          subject_code: item.subject_code,
          subject_name: item.subject_name,
          programme: item.programme,
          programme_id: item.programme_id,
          specialization_id: item.specialization_id,
          specialization_code: item.specialization_code,
          specialization_name: item.specialization_name,
          semester: item.semester,
          class_subject_ids: [item.class_subject_id],
          class_ids: item.class_id ? [item.class_id] : [],
          published_assessments_count: 0,
          total_eligible_students: 0,
          assessments: []
        });
      } else {
        const existing = subjectOfferingsMap.get(key);
        if (item.class_subject_id && !existing.class_subject_ids.includes(item.class_subject_id)) {
          existing.class_subject_ids.push(item.class_subject_id);
        }
        if (item.class_id && !existing.class_ids.includes(item.class_id)) {
          existing.class_ids.push(item.class_id);
        }
      }
    }

    // 3. Attach published assessments and compute eligible student counts for every subject offering
    for (const offering of subjectOfferingsMap.values()) {
      // Find all assessments matching this subject offering
      const matchingAssessments = assessmentItems.filter(a => {
        const matchesClassSubject = offering.class_subject_ids.includes(a.class_subject_id);
        const matchesSubject = (a.subject_id && a.subject_id === offering.subject_id) ||
          (a.subject_code === offering.subject_code && a.programme === offering.programme && a.semester === offering.semester);
        return matchesClassSubject || matchesSubject;
      });

      offering.assessments = matchingAssessments;
      offering.published_assessments_count = matchingAssessments.length;

      // Calculate unique eligible enrolled students across all classes taking this subject
      const uniqueStudentIds = new Set<string>();
      for (const classId of offering.class_ids) {
        const classEnrollments = activeEnrollments.filter(e => e.class_id === classId);
        const eligible = offering.specialization_id
          ? classEnrollments.filter(e => e.specialization_id === offering.specialization_id || (offering.specialization_code && e.specialization_code === offering.specialization_code))
          : classEnrollments;
        eligible.forEach(e => uniqueStudentIds.add(e.student_id));
      }
      offering.total_eligible_students = uniqueStudentIds.size;
    }

    const subjectsList = Array.from(subjectOfferingsMap.values());

    return res.status(200).json({
      subjects: subjectsList,
      total_subjects: subjectsList.length,
      total_assessments: assessmentItems.length,
      programmes: allProgrammes.map(p => ({ id: p.id, code: p.code, name: p.name })),
      specializations: allSpecializations.map(s => ({ id: s.id, code: s.code, name: s.name, programme_id: s.programme_id })),
      classes: allClasses.map(c => ({ id: c.id, name: formatClassName(c), programme: c.programme, semester: c.semester }))
    });
  } catch (err: any) {
    return res.status(500).json({
      error: { code: 'REPORT_FAILED', message: err.message || 'Failed to generate institutional submissions report' }
    });
  }
});

// Also provide convenience sub-route for assessment-specific student submission report
router.get('/institutional-submissions-report/assessment/:assessmentId', async (req: Request, res: Response) => {
  req.query.assessment_id = req.params.assessmentId;
  return (router as any).handle(req, res);
});

export default router;
