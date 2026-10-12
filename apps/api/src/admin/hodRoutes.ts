import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { 
  CreateDepartmentRequestSchema,
  CreateTermRequestSchema,
  CreateClassRequestSchema,
  CreateSubjectRequestSchema,
  AssignClassSubjectRequestSchema,
  InviteUserRequestSchema,
  AssignRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  Department,
  AcademicTerm,
  Class,
  Subject,
  ClassSubject,
  Profile,
  UserRole
} from '@smartfa/contracts';
import { db } from '../storage/db.js';
import { logAuditEvent } from '../audit/auditService.js';
import { authenticateJWT } from '../auth/jwt.js';
import { loadUserContext, requireRoles } from '../authorization/rbac.js';

const router = Router();

// Secure all HOD endpoints with JWT + DB-verified 'hod' role check
router.use(authenticateJWT);
router.use(loadUserContext);
router.use(requireRoles(['hod']));

/**
 * -----------------------------------------------------------------------------
 * Departments
 * -----------------------------------------------------------------------------
 */
router.get('/departments', (req: Request, res: Response) => {
  res.status(200).json({ departments: db.departments });
});

router.post('/departments', (req: Request, res: Response) => {
  const body = CreateDepartmentRequestSchema.parse(req.body);
  
  if (db.departments.some(d => d.code === body.code)) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_CODE', message: `Department code ${body.code} already exists` }
    });
  }

  const dept: Department = {
    id: randomUUID(),
    code: body.code,
    name: body.name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.departments.push(dept);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'CREATE_DEPARTMENT',
    resourceType: 'departments',
    resourceId: dept.id,
    after: dept as any
  });

  res.status(201).json({ department: dept });
});

/**
 * -----------------------------------------------------------------------------
 * Academic Terms
 * -----------------------------------------------------------------------------
 */
router.get('/terms', (req: Request, res: Response) => {
  res.status(200).json({ terms: db.terms });
});

router.post('/terms', (req: Request, res: Response) => {
  const body = CreateTermRequestSchema.parse(req.body);

  const term: AcademicTerm = {
    id: randomUUID(),
    name: body.name,
    starts_on: body.starts_on,
    ends_on: body.ends_on,
    active: body.active,
    created_at: new Date().toISOString()
  };

  db.terms.push(term);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'CREATE_ACADEMIC_TERM',
    resourceType: 'academic_terms',
    resourceId: term.id,
    after: term as any
  });

  res.status(201).json({ term });
});

/**
 * -----------------------------------------------------------------------------
 * Classes
 * -----------------------------------------------------------------------------
 */
router.get('/classes', (req: Request, res: Response) => {
  const classesWithDetails = db.classes.map(c => {
    const dept = db.departments.find(d => d.id === c.department_id);
    const term = db.terms.find(t => t.id === c.term_id);
    const teacher = db.profiles.find(p => p.id === c.class_teacher_id);
    return {
      ...c,
      department_name: dept?.name || 'Unknown',
      term_name: term?.name || 'Unknown',
      class_teacher_name: teacher?.full_name || 'Unassigned'
    };
  });
  res.status(200).json({ classes: classesWithDetails });
});

router.post('/classes', (req: Request, res: Response) => {
  const body = CreateClassRequestSchema.parse(req.body);

  const newClass: Class = {
    id: randomUUID(),
    department_id: body.department_id,
    term_id: body.term_id,
    programme: body.programme,
    semester: body.semester,
    section: body.section,
    class_teacher_id: body.class_teacher_id || null,
    created_at: new Date().toISOString()
  };

  db.classes.push(newClass);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'CREATE_CLASS',
    resourceType: 'classes',
    resourceId: newClass.id,
    after: newClass as any
  });

  res.status(201).json({ class: newClass });
});

/**
 * -----------------------------------------------------------------------------
 * Subjects & Class Subjects
 * -----------------------------------------------------------------------------
 */
router.get('/subjects', (req: Request, res: Response) => {
  res.status(200).json({ subjects: db.subjects });
});

router.post('/subjects', (req: Request, res: Response) => {
  const body = CreateSubjectRequestSchema.parse(req.body);

  const subject: Subject = {
    id: randomUUID(),
    department_id: body.department_id,
    code: body.code,
    name: body.name,
    credits: body.credits,
    created_at: new Date().toISOString()
  };

  db.subjects.push(subject);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'CREATE_SUBJECT',
    resourceType: 'subjects',
    resourceId: subject.id,
    after: subject as any
  });

  res.status(201).json({ subject });
});

router.get('/class-subjects', (req: Request, res: Response) => {
  const list = db.classSubjects.map(cs => {
    const cls = db.classes.find(c => c.id === cs.class_id);
    const sub = db.subjects.find(s => s.id === cs.subject_id);
    const teacher = db.profiles.find(p => p.id === cs.subject_teacher_id);
    return {
      ...cs,
      class_name: cls ? `${cls.programme} Sem ${cls.semester}-${cls.section}` : 'Unknown Class',
      subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
      teacher_name: teacher?.full_name || 'Unassigned'
    };
  });
  res.status(200).json({ class_subjects: list });
});

router.post('/class-subjects', (req: Request, res: Response) => {
  const body = AssignClassSubjectRequestSchema.parse(req.body);

  const cs: ClassSubject = {
    id: randomUUID(),
    class_id: body.class_id,
    subject_id: body.subject_id,
    subject_teacher_id: body.subject_teacher_id,
    active: true,
    created_at: new Date().toISOString()
  };

  db.classSubjects.push(cs);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'ASSIGN_CLASS_SUBJECT',
    resourceType: 'class_subjects',
    resourceId: cs.id,
    after: cs as any
  });

  res.status(201).json({ class_subject: cs });
});

/**
 * -----------------------------------------------------------------------------
 * User Directory & Roles
 * -----------------------------------------------------------------------------
 */
router.get('/users', (req: Request, res: Response) => {
  const usersWithRoles = db.profiles.map(p => {
    const roles = db.roles.filter(r => r.user_id === p.id && r.active);
    return {
      ...p,
      roles: roles.map(r => r.role)
    };
  });
  res.status(200).json({ users: usersWithRoles });
});

router.post('/users/invite', (req: Request, res: Response) => {
  const body = InviteUserRequestSchema.parse(req.body);

  if (db.profiles.some(p => p.email.toLowerCase() === body.email.toLowerCase())) {
    return res.status(409).json({
      error: { code: 'DUPLICATE_EMAIL', message: 'A user with this email address already exists' }
    });
  }

  const userId = randomUUID();
  const profile: Profile = {
    id: userId,
    full_name: body.full_name,
    email: body.email.toLowerCase(),
    usn: body.usn || null,
    status: 'active', // activated by HOD invitation
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const role: UserRole = {
    id: randomUUID(),
    user_id: userId,
    role: body.role,
    scope_id: body.scope_id || null,
    assigned_by: req.userContext?.profile.id,
    active: true,
    created_at: new Date().toISOString()
  };

  db.profiles.push(profile);
  db.roles.push(role);

  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'INVITE_USER_WITH_ROLE',
    resourceType: 'profiles',
    resourceId: userId,
    after: { profile, role }
  });

  res.status(201).json({ user: profile, role });
});

router.post('/users/:id/roles', (req: Request, res: Response) => {
  const targetUserId = req.params.id;
  const body = AssignRoleRequestSchema.parse(req.body);

  // Invariant: HOD cannot alter own roles (prevent self-escalation)
  if (targetUserId === req.userContext?.profile.id) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN_SELF_MODIFICATION', message: 'HOD cannot self-assign or alter own roles' }
    });
  }

  const user = db.profiles.find(p => p.id === targetUserId);
  if (!user) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
    });
  }

  const roleRecord: UserRole = {
    id: randomUUID(),
    user_id: targetUserId,
    role: body.role,
    scope_id: body.scope_id || null,
    assigned_by: req.userContext?.profile.id,
    active: body.active,
    created_at: new Date().toISOString()
  };

  db.roles.push(roleRecord);
  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'ASSIGN_USER_ROLE',
    resourceType: 'user_roles',
    resourceId: roleRecord.id,
    after: roleRecord as any
  });

  res.status(201).json({ role: roleRecord });
});

router.patch('/users/:id/status', (req: Request, res: Response) => {
  const targetUserId = req.params.id;
  const body = UpdateUserStatusRequestSchema.parse(req.body);

  // Invariant: HOD cannot deactivate their own account
  if (targetUserId === req.userContext?.profile.id) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN_SELF_MODIFICATION', message: 'HOD cannot deactivate their own account' }
    });
  }

  const user = db.profiles.find(p => p.id === targetUserId);
  if (!user) {
    return res.status(404).json({
      error: { code: 'USER_NOT_FOUND', message: 'Target user does not exist' }
    });
  }

  const previousStatus = user.status;
  user.status = body.status;
  user.updated_at = new Date().toISOString();

  logAuditEvent({
    actorId: req.userContext?.profile.id,
    action: 'UPDATE_USER_STATUS',
    resourceType: 'profiles',
    resourceId: targetUserId,
    before: { status: previousStatus },
    after: { status: body.status }
  });

  res.status(200).json({ user });
});

/**
 * -----------------------------------------------------------------------------
 * Audit Records Timeline
 * -----------------------------------------------------------------------------
 */
router.get('/audit', (req: Request, res: Response) => {
  res.status(200).json({ events: db.auditEvents });
});

export default router;
