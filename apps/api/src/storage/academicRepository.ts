import { 
  AcademicTerm, 
  Class, 
  Subject, 
  ClassSubject, 
  Programme,
  Specialization,
  SubjectSpecialization,
  Enrollment, 
  ProctorAssignment,
  SubjectDependencies,
  FacultyAllocation,
  formatClassName
} from '@smartfa/contracts';
import { randomUUID } from 'crypto';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { db, InMemoryDatabase } from './db.js';

export interface ClassWithDetails extends Class {
  term_name?: string;
  class_teacher_name: string;
}

export interface ClassSubjectWithDetails extends ClassSubject {
  class_name: string;
  subject_name: string;
  teacher_name: string;
  programme_code?: string;
  programme_name?: string;
  specialization_code?: string;
  specialization_name?: string;
  semester?: number | null;
}

export interface EnrollmentWithDetails extends Enrollment {
  student_name: string;
  student_email: string;
  student_usn?: string | null;
  class_name: string;
  programme?: string;
  programme_id?: string | null;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  section?: string | null;
}

export interface ProctorAssignmentWithDetails extends ProctorAssignment {
  student_name: string;
  student_email?: string | null;
  student_usn?: string | null;
  proctor_name: string;
  proctor_email?: string | null;
  class_name: string;
  programme?: string | null;
  semester?: number | null;
  specialization_id?: string | null;
  specialization_name?: string | null;
}

export interface IAcademicRepository {
  // Programmes
  listProgrammes(): Promise<Programme[]>;
  getProgrammeById(id: string): Promise<Programme | null>;
  getProgrammeByCode(code: string): Promise<Programme | null>;
  createProgramme(prog: Omit<Programme, 'created_at' | 'updated_at'>): Promise<Programme>;
  updateProgramme(id: string, updates: Partial<Programme>): Promise<Programme>;

  // Specializations
  listSpecializations(programmeId?: string): Promise<Specialization[]>;
  getSpecializationById(id: string): Promise<Specialization | null>;
  getSpecializationByCode(programmeId: string, code: string): Promise<Specialization | null>;
  createSpecialization(spec: Omit<Specialization, 'created_at' | 'updated_at'>): Promise<Specialization>;
  updateSpecialization(id: string, updates: Partial<Specialization>): Promise<Specialization>;

  // Academic Terms
  listTerms(): Promise<AcademicTerm[]>;
  getTermById(id: string): Promise<AcademicTerm | null>;
  createTerm(term: Omit<AcademicTerm, 'created_at'>): Promise<AcademicTerm>;

  // Classes
  listClasses(): Promise<ClassWithDetails[]>;
  getClassById(id: string): Promise<Class | null>;
  createClass(cls: Omit<Class, 'created_at'>): Promise<Class>;
  updateClassTeacher(classId: string, teacherId: string | null): Promise<Class>;
  listClassesByTeacher(teacherId: string): Promise<ClassWithDetails[]>;

  // Subjects
  listSubjects(programmeId?: string): Promise<Subject[]>;
  getSubjectById(id: string): Promise<Subject | null>;
  getSubjectByCode(code: string): Promise<Subject | null>;
  createSubject(subject: Omit<Subject, 'created_at'>): Promise<Subject>;
  updateSubject(id: string, updates: Partial<Subject>): Promise<Subject>;
  deleteSubject(id: string): Promise<boolean>;
  getSubjectDependencies(id: string): Promise<SubjectDependencies>;
  listSubjectsBySpecialization(specializationId: string, semester?: number): Promise<Subject[]>;
  listSubjectsByProgramme(programmeId: string, semester?: number): Promise<Subject[]>;
  listAvailableSubjectsForFaculty(params: {
    facultyId?: string;
    programmeId: string;
    specializationId?: string | null;
    semester: number;
  }): Promise<Subject[]>;
  linkSubjectSpecialization(subjectId: string, specializationId: string, semester?: number): Promise<SubjectSpecialization>;
  unlinkSubjectSpecialization(subjectId: string, specializationId: string): Promise<boolean>;

  // Class Subjects
  listClassSubjects(): Promise<ClassSubjectWithDetails[]>;
  getClassSubjectById(id: string): Promise<ClassSubject | null>;
  getClassSubjectByClassAndSubject(classId: string, subjectId: string): Promise<ClassSubject | null>;
  assignClassSubject(cs: Omit<ClassSubject, 'created_at'>): Promise<ClassSubject>;
  unassignClassSubject(id: string): Promise<boolean>;
  unassignSubjectAllocations(subjectId: string): Promise<number>;
  listClassSubjectsByTeacher(teacherId: string): Promise<ClassSubjectWithDetails[]>;

  // Enrollments
  listEnrollments(classId?: string, specializationId?: string): Promise<EnrollmentWithDetails[]>;
  getEnrollment(classId: string, studentId: string): Promise<Enrollment | null>;
  enrollStudent(enrollment: Omit<Enrollment, 'created_at'>): Promise<Enrollment>;
  deleteEnrollment(id: string): Promise<boolean>;
  updateEnrollmentClass(id: string, newClassId: string): Promise<Enrollment>;
  updateEnrollmentSpecialization(id: string, specializationId: string | null): Promise<Enrollment>;

  // Proctor Assignments
  listProctorAssignments(classId?: string): Promise<ProctorAssignmentWithDetails[]>;
  getProctorAssignment(classId: string, studentId: string, proctorId: string): Promise<ProctorAssignment | null>;
  getProctorAssignmentByStudent(studentId: string): Promise<ProctorAssignmentWithDetails | null>;
  assignProctor(pa: Omit<ProctorAssignment, 'created_at'>): Promise<ProctorAssignment>;
  removeProctorAssignment(id: string): Promise<boolean>;
  reassignProctor(id: string, newProctorId: string): Promise<ProctorAssignment>;
  listProctorAssignmentsByProctor(proctorId: string): Promise<ProctorAssignmentWithDetails[]>;

  // Faculty Academic Allocations (Programme, Specialization, Semester decoupled from subjects)
  listFacultyAllocations(facultyId?: string): Promise<FacultyAllocation[]>;
  createFacultyAllocation(allocation: Omit<FacultyAllocation, 'created_at'>): Promise<FacultyAllocation>;
  removeFacultyAllocation(id: string): Promise<boolean>;

  // Telemetry
  isPersistent(): boolean;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

/**
 * In-memory fallback implementation for local development and offline unit tests.
 */
export class InMemoryAcademicRepository implements IAcademicRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async listProgrammes(): Promise<Programme[]> {
    return [...this.inMemoryDb.programmes];
  }

  async getProgrammeById(id: string): Promise<Programme | null> {
    const found = this.inMemoryDb.programmes.find(p => p.id === id);
    return found || null;
  }

  async getProgrammeByCode(code: string): Promise<Programme | null> {
    const found = this.inMemoryDb.programmes.find(p => p.code.toUpperCase() === code.toUpperCase());
    return found || null;
  }

  async createProgramme(prog: Omit<Programme, 'created_at' | 'updated_at'>): Promise<Programme> {
    const record: Programme = {
      ...prog,
      code: prog.code.toUpperCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.inMemoryDb.programmes.push(record);
    return record;
  }

  async updateProgramme(id: string, updates: Partial<Programme>): Promise<Programme> {
    const idx = this.inMemoryDb.programmes.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Programme not found');
    this.inMemoryDb.programmes[idx] = {
      ...this.inMemoryDb.programmes[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return this.inMemoryDb.programmes[idx];
  }

  async listSpecializations(programmeId?: string): Promise<Specialization[]> {
    const list = programmeId
      ? this.inMemoryDb.specializations.filter(s => s.programme_id === programmeId)
      : [...this.inMemoryDb.specializations];
    return list.map(s => ({
      ...s,
      semesters: s.semesters || s.applicable_semesters || [3, 4],
      applicable_semesters: s.applicable_semesters || s.semesters || [3, 4]
    }));
  }

  async getSpecializationById(id: string): Promise<Specialization | null> {
    const found = this.inMemoryDb.specializations.find(s => s.id === id);
    if (!found) return null;
    return {
      ...found,
      semesters: found.semesters || found.applicable_semesters || [3, 4],
      applicable_semesters: found.applicable_semesters || found.semesters || [3, 4]
    };
  }

  async getSpecializationByCode(programmeId: string, code: string): Promise<Specialization | null> {
    const found = this.inMemoryDb.specializations.find(
      s => s.programme_id === programmeId && s.code.toUpperCase() === code.toUpperCase()
    );
    if (!found) return null;
    return {
      ...found,
      semesters: found.semesters || found.applicable_semesters || [3, 4],
      applicable_semesters: found.applicable_semesters || found.semesters || [3, 4]
    };
  }

  async createSpecialization(spec: Omit<Specialization, 'created_at' | 'updated_at'>): Promise<Specialization> {
    const record: Specialization = {
      ...spec,
      code: spec.code.toUpperCase(),
      applicable_semesters: spec.applicable_semesters || (spec as any).semesters || [3, 4],
      semesters: (spec as any).semesters || spec.applicable_semesters || [3, 4],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    this.inMemoryDb.specializations.push(record);
    return record;
  }

  async updateSpecialization(id: string, updates: Partial<Specialization>): Promise<Specialization> {
    const idx = this.inMemoryDb.specializations.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Specialization not found');
    const cleanUpdates = { ...updates };
    if (cleanUpdates.semesters && !cleanUpdates.applicable_semesters) {
      cleanUpdates.applicable_semesters = cleanUpdates.semesters;
    } else if (cleanUpdates.applicable_semesters && !cleanUpdates.semesters) {
      cleanUpdates.semesters = cleanUpdates.applicable_semesters;
    }
    this.inMemoryDb.specializations[idx] = {
      ...this.inMemoryDb.specializations[idx],
      ...cleanUpdates,
      updated_at: new Date().toISOString()
    };
    return this.inMemoryDb.specializations[idx];
  }

  async listTerms(): Promise<AcademicTerm[]> {
    return [...this.inMemoryDb.terms];
  }

  async getTermById(id: string): Promise<AcademicTerm | null> {
    const found = this.inMemoryDb.terms.find(t => t.id === id);
    return found || null;
  }

  async createTerm(term: Omit<AcademicTerm, 'created_at'>): Promise<AcademicTerm> {
    const record: AcademicTerm = {
      ...term,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.terms.push(record);
    return record;
  }

  async listClasses(): Promise<ClassWithDetails[]> {
    return this.inMemoryDb.classes.map(c => {
      const teacher = this.inMemoryDb.profiles.find(p => p.id === c.class_teacher_id);
      return {
        ...c,
        term_name: '',
        class_teacher_name: teacher?.full_name || 'Unassigned'
      };
    });
  }

  async getClassById(id: string): Promise<Class | null> {
    const found = this.inMemoryDb.classes.find(c => c.id === id);
    return found || null;
  }

  async createClass(cls: Omit<Class, 'created_at'>): Promise<Class> {
    const record: Class = {
      ...cls,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.classes.push(record);
    return record;
  }

  async updateClassTeacher(classId: string, teacherId: string | null): Promise<Class> {
    const cls = this.inMemoryDb.classes.find(c => c.id === classId);
    if (!cls) {
      throw new Error('Class not found');
    }
    cls.class_teacher_id = teacherId;
    return cls;
  }

  async listClassesByTeacher(teacherId: string): Promise<ClassWithDetails[]> {
    const direct = this.inMemoryDb.classes
      .filter(c => c.class_teacher_id === teacherId)
      .map(c => {
        const term = this.inMemoryDb.terms.find(t => t.id === c.term_id);
        const teacher = this.inMemoryDb.profiles.find(p => p.id === c.class_teacher_id);
        return {
          ...c,
          term_name: term?.name || 'Unknown',
          class_teacher_name: teacher?.full_name || 'Unassigned'
        };
      });

    if (direct.length > 0) return direct;

    const allocations = this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === teacherId);
    if (allocations.length > 0) {
      const matched = this.inMemoryDb.classes
        .filter(c =>
          allocations.some(a =>
            (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
            (!a.semester || a.semester === c.semester)
          )
        )
        .map(c => {
          const term = this.inMemoryDb.terms.find(t => t.id === c.term_id);
          const assignedTeacher = c.class_teacher_id ? this.inMemoryDb.profiles.find(p => p.id === c.class_teacher_id) : null;
          return {
            ...c,
            class_teacher_id: c.class_teacher_id || null,
            term_name: term?.name || 'Unknown',
            class_teacher_name: assignedTeacher?.full_name || 'Unassigned'
          };
        });
      return matched;
    }

    return [];
  }

  async listSubjects(programmeId?: string): Promise<Subject[]> {
    const list = programmeId
      ? this.inMemoryDb.subjects.filter(s => s.programme_id === programmeId)
      : [...this.inMemoryDb.subjects];
    return list.map(s => {
      const prog = s.programme_id ? this.inMemoryDb.programmes.find(p => p.id === s.programme_id) : undefined;
      const spec = s.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === s.specialization_id) : undefined;
      return {
        ...s,
        programme_code: prog?.code || s.programme_code,
        programme_name: prog?.name || s.programme_name,
        specialization_code: spec?.code || s.specialization_code,
        specialization_name: spec?.name || s.specialization_name
      };
    });
  }

  async getSubjectById(id: string): Promise<Subject | null> {
    const found = this.inMemoryDb.subjects.find(s => s.id === id);
    if (!found) return null;
    const prog = found.programme_id ? this.inMemoryDb.programmes.find(p => p.id === found.programme_id) : undefined;
    const spec = found.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === found.specialization_id) : undefined;
    return {
      ...found,
      programme_code: prog?.code || found.programme_code,
      programme_name: prog?.name || found.programme_name,
      specialization_code: spec?.code || found.specialization_code,
      specialization_name: spec?.name || found.specialization_name
    };
  }

  async getSubjectByCode(code: string): Promise<Subject | null> {
    const found = this.inMemoryDb.subjects.find(
      s => s.code.toUpperCase() === code.toUpperCase()
    );
    return found || null;
  }

  async createSubject(subject: Omit<Subject, 'created_at'>): Promise<Subject> {
    const record: Subject = {
      ...subject,
      code: subject.code.toUpperCase(),
      active: subject.active !== undefined ? subject.active : true,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.subjects.push(record);
    if (subject.specialization_id) {
      await this.linkSubjectSpecialization(subject.id, subject.specialization_id, subject.semester || undefined);
    }
    return record;
  }

  async updateSubject(id: string, updates: Partial<Subject>): Promise<Subject> {
    const idx = this.inMemoryDb.subjects.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Subject not found');
    const existing = this.inMemoryDb.subjects[idx];
    const updated: Subject = {
      ...existing,
      ...updates,
      code: updates.code ? updates.code.toUpperCase() : existing.code
    };
    this.inMemoryDb.subjects[idx] = updated;

    if (updates.specialization_id !== undefined || updates.semester !== undefined) {
      const targetSpecId = updates.specialization_id !== undefined ? updates.specialization_id : existing.specialization_id;
      const targetSem = updates.semester !== undefined ? updates.semester : existing.semester;
      if (targetSpecId) {
        await this.linkSubjectSpecialization(id, targetSpecId, targetSem || undefined);
      }
    }
    return updated;
  }

  async getSubjectDependencies(id: string): Promise<SubjectDependencies> {
    const classSubjects = this.inMemoryDb.classSubjects.filter(cs => cs.subject_id === id);
    const classesList: Array<{ id: string; programme: string; semester: number; section?: string | null }> = [];
    const allocationsList: Array<{ id: string; class_id: string; class_name: string; teacher_name?: string }> = [];
    for (const cs of classSubjects) {
      const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
      const teacher = this.inMemoryDb.profiles.find((u: any) => u.id === cs.subject_teacher_id);
      const className = cls ? formatClassName(cls) : 'Class';
      allocationsList.push({
        id: cs.id,
        class_id: cs.class_id,
        class_name: className,
        teacher_name: teacher?.full_name || 'Unassigned'
      });
      if (cls && !classesList.some(c => c.id === cls.id)) {
        classesList.push({
          id: cls.id,
          programme: cls.programme,
          semester: cls.semester,
          section: cls.section
        });
      }
    }

    const hasDeps = classSubjects.length > 0;
    const details: string[] = [];
    if (classSubjects.length > 0) {
      const names = classesList.map(c => formatClassName(c)).join(', ');
      details.push(`Subject is allocated to ${classSubjects.length} class cohort(s)${names ? ` (${names})` : ''}`);
    }

    return {
      subject_id: id,
      has_dependencies: hasDeps,
      class_subjects_count: classSubjects.length,
      assessments_count: 0,
      submissions_count: 0,
      classes: classesList,
      allocations: allocationsList,
      details
    };
  }

  async deleteSubject(id: string): Promise<boolean> {
    const deps = await this.getSubjectDependencies(id);
    if (deps.has_dependencies) {
      throw new Error(`Cannot delete subject: it has active dependencies (${deps.details?.join('; ')})`);
    }

    this.inMemoryDb.subjects = this.inMemoryDb.subjects.filter(s => s.id !== id);
    this.inMemoryDb.subject_specializations = this.inMemoryDb.subject_specializations.filter(ss => ss.subject_id !== id);
    return true;
  }

  async listSubjectsBySpecialization(specializationId: string, semester?: number): Promise<Subject[]> {
    const linkedIds = new Set(
      this.inMemoryDb.subject_specializations
        .filter(ss => ss.specialization_id === specializationId && (!semester || ss.semester === semester))
        .map(ss => ss.subject_id)
    );

    return this.inMemoryDb.subjects.filter(s => {
      const matchesSpec = s.specialization_id === specializationId || linkedIds.has(s.id);
      const matchesSem = !semester || s.semester === semester;
      return matchesSpec && matchesSem;
    });
  }

  async listSubjectsByProgramme(programmeId: string, semester?: number): Promise<Subject[]> {
    return this.inMemoryDb.subjects.filter(s => {
      const matchesProg = s.programme_id === programmeId;
      const matchesSem = !semester || s.semester === semester;
      return matchesProg && matchesSem;
    });
  }

  async listAvailableSubjectsForFaculty(params: {
    facultyId?: string;
    programmeId: string;
    specializationId?: string | null;
    semester: number;
  }): Promise<Subject[]> {
    const prog = this.inMemoryDb.programmes.find(p => p.id === params.programmeId);
    const progCode = prog?.code || 'MCA';

    // 1. Candidate subjects matching programme and semester
    const candidateSubjects = this.inMemoryDb.subjects.filter(s => {
      if (s.active === false) return false;
      const semMatch = s.semester === params.semester;
      const progMatch = s.programme_id === params.programmeId || (!s.programme_id && progCode === 'MCA');
      if (!semMatch || !progMatch) return false;

      // Specialization Filtering:
      if (!params.specializationId) {
        // Core / All Specialization: Core / Common subjects ONLY
        return !s.specialization_id;
      } else {
        // Specific Specialization
        const linkedSpecs = (this.inMemoryDb.subject_specializations || [])
          .filter(ss => ss.specialization_id === params.specializationId && (!ss.semester || ss.semester === params.semester))
          .map(ss => ss.subject_id);
        const matchesSpec = s.specialization_id === params.specializationId || linkedSpecs.includes(s.id);
        const isOtherSpec = Boolean(s.specialization_id && s.specialization_id !== params.specializationId);
        if (isOtherSpec) return false;
        return matchesSpec || !s.specialization_id;
      }
    });

    // 2. Identify subjects actively assigned in this programme and semester
    const occupiedSubjectIds = new Set<string>();
    for (const cs of this.inMemoryDb.classSubjects) {
      if (!cs.active) continue;

      const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
      const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);

      const semMatch = (cls && cls.semester === params.semester) || (sub && sub.semester === params.semester);
      const progMatch = (cls && (cls.programme_id === params.programmeId || cls.programme?.toUpperCase() === progCode.toUpperCase())) ||
                        (sub && sub.programme_id === params.programmeId);

      if (!semMatch || !progMatch) continue;

      occupiedSubjectIds.add(cs.subject_id);
    }

    return candidateSubjects.filter(s => !occupiedSubjectIds.has(s.id));
  }

  async linkSubjectSpecialization(subjectId: string, specializationId: string, semester?: number): Promise<SubjectSpecialization> {
    const existing = this.inMemoryDb.subject_specializations.find(
      ss => ss.subject_id === subjectId && ss.specialization_id === specializationId
    );
    if (existing) return existing;

    const record: SubjectSpecialization = {
      id: randomUUID(),
      subject_id: subjectId,
      specialization_id: specializationId,
      semester: semester || null,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.subject_specializations.push(record);
    return record;
  }

  async unlinkSubjectSpecialization(subjectId: string, specializationId: string): Promise<boolean> {
    this.inMemoryDb.subject_specializations = this.inMemoryDb.subject_specializations.filter(
      ss => !(ss.subject_id === subjectId && ss.specialization_id === specializationId)
    );
    return true;
  }

  async listClassSubjects(): Promise<ClassSubjectWithDetails[]> {
    return this.inMemoryDb.classSubjects.map(cs => {
      const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
      const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
      const teacher = this.inMemoryDb.profiles.find(p => p.id === cs.subject_teacher_id);
      const prog = cls?.programme_id ? this.inMemoryDb.programmes.find(p => p.id === cls.programme_id) : (sub?.programme_id ? this.inMemoryDb.programmes.find(p => p.id === sub.programme_id) : undefined);
      const spec = cls?.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === cls.specialization_id) : (sub?.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === sub.specialization_id) : undefined);
      return {
        ...cs,
        class_name: cls ? formatClassName(cls) : 'Unknown Class',
        subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
        teacher_name: teacher?.full_name || 'Unassigned',
        programme_code: prog?.code || cls?.programme,
        programme_name: prog?.name,
        specialization_code: spec?.code,
        specialization_name: spec?.name,
        semester: cls?.semester || sub?.semester
      };
    });
  }

  async getClassSubjectById(id: string): Promise<ClassSubject | null> {
    const found = this.inMemoryDb.classSubjects.find(cs => cs.id === id);
    return found || null;
  }

  async getClassSubjectByClassAndSubject(classId: string, subjectId: string): Promise<ClassSubject | null> {
    const found = this.inMemoryDb.classSubjects.find(cs => cs.class_id === classId && cs.subject_id === subjectId);
    return found || null;
  }

  async assignClassSubject(cs: Omit<ClassSubject, 'created_at'>): Promise<ClassSubject> {
    const record: ClassSubject = {
      ...cs,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.classSubjects.push(record);
    return record;
  }

  async unassignClassSubject(id: string): Promise<boolean> {
    const idx = this.inMemoryDb.classSubjects.findIndex(cs => cs.id === id);
    if (idx >= 0) {
      this.inMemoryDb.classSubjects.splice(idx, 1);
      return true;
    }
    return false;
  }

  async unassignSubjectAllocations(subjectId: string): Promise<number> {
    const before = this.inMemoryDb.classSubjects.length;
    this.inMemoryDb.classSubjects = this.inMemoryDb.classSubjects.filter(cs => cs.subject_id !== subjectId);
    return before - this.inMemoryDb.classSubjects.length;
  }

  async listClassSubjectsByTeacher(teacherId: string): Promise<ClassSubjectWithDetails[]> {
    return this.inMemoryDb.classSubjects
      .filter(cs => cs.subject_teacher_id === teacherId)
      .map(cs => {
        const cls = this.inMemoryDb.classes.find(c => c.id === cs.class_id);
        const sub = this.inMemoryDb.subjects.find(s => s.id === cs.subject_id);
        const teacher = this.inMemoryDb.profiles.find(p => p.id === cs.subject_teacher_id);
        const prog = cls?.programme_id ? this.inMemoryDb.programmes.find(p => p.id === cls.programme_id) : (sub?.programme_id ? this.inMemoryDb.programmes.find(p => p.id === sub.programme_id) : undefined);
        const spec = cls?.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === cls.specialization_id) : (sub?.specialization_id ? this.inMemoryDb.specializations.find(sp => sp.id === sub.specialization_id) : undefined);
        return {
          ...cs,
          class_name: cls ? formatClassName(cls) : 'Unknown Class',
          subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
          teacher_name: teacher?.full_name || 'Unassigned',
          programme_code: prog?.code || cls?.programme,
          programme_name: prog?.name,
          specialization_code: spec?.code,
          specialization_name: spec?.name,
          semester: cls?.semester || sub?.semester
        };
      });
  }

  async listEnrollments(classId?: string, specializationId?: string): Promise<EnrollmentWithDetails[]> {
    const filtered = classId 
      ? this.inMemoryDb.enrollments.filter(e => e.class_id === classId)
      : this.inMemoryDb.enrollments;

    const mapped = filtered.map(e => {
      const student = this.inMemoryDb.profiles.find(p => p.id === e.student_id);
      const cls = this.inMemoryDb.classes.find(c => c.id === e.class_id);
      const specId = e.specialization_id || cls?.specialization_id || null;
      const spec = specId 
        ? this.inMemoryDb.specializations.find(s => s.id === specId) 
        : null;
      return {
        ...e,
        student_name: student?.full_name || 'Unknown Student',
        student_email: student?.email || 'unknown@smartfa.edu',
        student_usn: student?.usn || null,
        class_name: cls ? formatClassName(cls) : 'Unknown Class',
        programme: cls?.programme || 'MCA',
        programme_id: cls?.programme_id || null,
        specialization_id: specId,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        semester: cls?.semester ?? null,
        section: cls?.section ?? null
      };
    });

    if (specializationId) {
      return mapped.filter(e => e.specialization_id === specializationId);
    }
    return mapped;
  }

  async getEnrollment(classId: string, studentId: string): Promise<Enrollment | null> {
    const found = this.inMemoryDb.enrollments.find(e => e.class_id === classId && e.student_id === studentId);
    return found || null;
  }

  async enrollStudent(enrollment: Omit<Enrollment, 'created_at'>): Promise<Enrollment> {
    const record: Enrollment = {
      ...enrollment,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.enrollments.push(record);
    return record;
  }

  async deleteEnrollment(id: string): Promise<boolean> {
    const idx = this.inMemoryDb.enrollments.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.inMemoryDb.enrollments.splice(idx, 1);
      return true;
    }
    return false;
  }

  async updateEnrollmentClass(id: string, newClassId: string): Promise<Enrollment> {
    const enrollment = this.inMemoryDb.enrollments.find(e => e.id === id);
    if (!enrollment) {
      throw new Error(`Enrollment ${id} not found`);
    }
    enrollment.class_id = newClassId;
    return enrollment;
  }

  async updateEnrollmentSpecialization(id: string, specializationId: string | null): Promise<Enrollment> {
    const enrollment = this.inMemoryDb.enrollments.find(e => e.id === id);
    if (!enrollment) {
      throw new Error(`Enrollment ${id} not found`);
    }
    enrollment.specialization_id = specializationId;
    return enrollment;
  }

  async listProctorAssignments(classId?: string): Promise<ProctorAssignmentWithDetails[]> {
    const filtered = classId
      ? this.inMemoryDb.proctorAssignments.filter(pa => pa.class_id === classId)
      : this.inMemoryDb.proctorAssignments;

    return filtered.map(pa => {
      const student = this.inMemoryDb.profiles.find(p => p.id === pa.student_id);
      const proctor = this.inMemoryDb.profiles.find(p => p.id === pa.proctor_id);
      const cls = this.inMemoryDb.classes.find(c => c.id === pa.class_id);
      const enrollment = this.inMemoryDb.enrollments.find(e => e.student_id === pa.student_id);
      const spec = enrollment?.specialization_id 
        ? this.inMemoryDb.specializations.find(s => s.id === enrollment.specialization_id) 
        : null;
      return {
        ...pa,
        student_name: student?.full_name || 'Unknown Student',
        student_email: student?.email || null,
        student_usn: student?.usn || null,
        proctor_name: proctor?.full_name || 'Unknown Proctor',
        proctor_email: proctor?.email || null,
        class_name: cls ? formatClassName(cls) : 'Unknown Class',
        programme: cls?.programme || null,
        semester: cls?.semester ?? null,
        specialization_id: spec?.id || null,
        specialization_name: spec?.name || null
      };
    });
  }

  async getProctorAssignment(classId: string, studentId: string, proctorId: string): Promise<ProctorAssignment | null> {
    const found = this.inMemoryDb.proctorAssignments.find(
      pa => pa.class_id === classId && pa.student_id === studentId && pa.proctor_id === proctorId
    );
    return found || null;
  }

  async getProctorAssignmentByStudent(studentId: string): Promise<ProctorAssignmentWithDetails | null> {
    const found = this.inMemoryDb.proctorAssignments.find(pa => pa.student_id === studentId);
    if (!found) return null;
    const student = this.inMemoryDb.profiles.find(p => p.id === found.student_id);
    const proctor = this.inMemoryDb.profiles.find(p => p.id === found.proctor_id);
    const cls = this.inMemoryDb.classes.find(c => c.id === found.class_id);
    return {
      ...found,
      student_name: student?.full_name || 'Unknown Student',
      student_email: student?.email || null,
      student_usn: student?.usn || null,
      proctor_name: proctor?.full_name || 'Unknown Proctor',
      proctor_email: proctor?.email || null,
      class_name: cls ? formatClassName(cls) : 'Unknown Class',
      programme: cls?.programme || null,
      semester: cls?.semester ?? null
    };
  }

  async assignProctor(pa: Omit<ProctorAssignment, 'created_at'>): Promise<ProctorAssignment> {
    const record: ProctorAssignment = {
      ...pa,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.proctorAssignments.push(record);
    return record;
  }

  async removeProctorAssignment(id: string): Promise<boolean> {
    const idx = this.inMemoryDb.proctorAssignments.findIndex(pa => pa.id === id);
    if (idx >= 0) {
      this.inMemoryDb.proctorAssignments.splice(idx, 1);
      return true;
    }
    return false;
  }

  async reassignProctor(id: string, newProctorId: string): Promise<ProctorAssignment> {
    const pa = this.inMemoryDb.proctorAssignments.find(p => p.id === id);
    if (!pa) throw new Error(`Proctor assignment ${id} not found`);
    pa.proctor_id = newProctorId;
    return pa;
  }

  async listProctorAssignmentsByProctor(proctorId: string): Promise<ProctorAssignmentWithDetails[]> {
    return this.inMemoryDb.proctorAssignments
      .filter(pa => pa.proctor_id === proctorId)
      .map(pa => {
        const student = this.inMemoryDb.profiles.find(p => p.id === pa.student_id);
        const proctor = this.inMemoryDb.profiles.find(p => p.id === pa.proctor_id);
        const cls = this.inMemoryDb.classes.find(c => c.id === pa.class_id);
        const enrollment = this.inMemoryDb.enrollments.find(e => e.student_id === pa.student_id);
        const spec = enrollment?.specialization_id 
          ? this.inMemoryDb.specializations.find(s => s.id === enrollment.specialization_id) 
          : null;
        return {
          ...pa,
          student_name: student?.full_name || 'Unknown Student',
          student_email: student?.email || null,
          student_usn: student?.usn || null,
          proctor_name: proctor?.full_name || 'Unknown Proctor',
          proctor_email: proctor?.email || null,
          class_name: cls ? formatClassName(cls) : 'Unknown Class',
          programme: cls?.programme || null,
          semester: cls?.semester ?? null,
          specialization_id: spec?.id || null,
          specialization_name: spec?.name || null
        };
      });
  }

  async listFacultyAllocations(facultyId?: string): Promise<FacultyAllocation[]> {
    if (facultyId) {
      return this.inMemoryDb.faculty_allocations.filter(a => a.faculty_id === facultyId);
    }
    return [...this.inMemoryDb.faculty_allocations];
  }

  async createFacultyAllocation(allocation: Omit<FacultyAllocation, 'created_at'>): Promise<FacultyAllocation> {
    const existing = this.inMemoryDb.faculty_allocations.find(
      a => a.faculty_id === allocation.faculty_id &&
           a.programme_id === allocation.programme_id &&
           (a.specialization_id || null) === (allocation.specialization_id || null) &&
           (a.semester || null) === (allocation.semester || null)
    );
    if (existing) {
      return existing;
    }

    const record: FacultyAllocation = {
      ...allocation,
      created_at: new Date().toISOString()
    };
    this.inMemoryDb.faculty_allocations.push(record);
    return record;
  }

  async removeFacultyAllocation(id: string): Promise<boolean> {
    this.inMemoryDb.faculty_allocations = this.inMemoryDb.faculty_allocations.filter(a => a.id !== id);
    return true;
  }

  isPersistent(): boolean {
    return false;
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'in_memory_mock';
  }
}

/**
 * Live Supabase PostgreSQL implementation using service_role connection.
 */
export class SupabaseAcademicRepository implements IAcademicRepository {
  private programmesCache: { data: Programme[]; expiresAt: number } | null = null;
  private specializationsCache = new Map<string, { data: Specialization[]; expiresAt: number }>();
  private readonly CATALOG_CACHE_TTL_MS = 30000; // 30-second TTL for static academic metadata

  constructor(private client: NonNullable<typeof supabaseAdmin>) {}

  async listProgrammes(): Promise<Programme[]> {
    if (this.programmesCache && Date.now() < this.programmesCache.expiresAt) {
      return this.programmesCache.data;
    }

    try {
      const { data, error } = await this.client.from('programmes').select('*').order('code');
      if (error) {
        return db.programmes;
      }
      const result = data || [];
      this.programmesCache = { data: result, expiresAt: Date.now() + this.CATALOG_CACHE_TTL_MS };
      return result;
    } catch {
      return db.programmes;
    }
  }

  async getProgrammeById(id: string): Promise<Programme | null> {
    try {
      const { data, error } = await this.client
        .from('programmes')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data;
      return db.programmes.find(p => p.id === id) || null;
    } catch {
      return db.programmes.find(p => p.id === id) || null;
    }
  }

  async getProgrammeByCode(code: string): Promise<Programme | null> {
    try {
      const { data, error } = await this.client
        .from('programmes')
        .select('*')
        .ilike('code', code)
        .maybeSingle();
      if (!error && data) return data;
      return db.programmes.find(p => p.code.toUpperCase() === code.toUpperCase()) || null;
    } catch {
      return db.programmes.find(p => p.code.toUpperCase() === code.toUpperCase()) || null;
    }
  }

  async createProgramme(prog: Omit<Programme, 'created_at' | 'updated_at'>): Promise<Programme> {
    this.programmesCache = null;
    try {
      const { data, error } = await this.client
        .from('programmes')
        .insert({
          id: prog.id,
          code: prog.code.toUpperCase(),
          name: prog.name,
          duration_years: prog.duration_years,
          total_semesters: prog.total_semesters,
          status: prog.status || 'active'
        })
        .select()
        .single();
      if (!error && data) return data;
    } catch {}

    const record: Programme = {
      ...prog,
      code: prog.code.toUpperCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.programmes.push(record);
    return record;
  }

  async updateProgramme(id: string, updates: Partial<Programme>): Promise<Programme> {
    this.programmesCache = null;
    try {
      const { data, error } = await this.client
        .from('programmes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data;
    } catch {}

    const idx = db.programmes.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Programme not found');
    db.programmes[idx] = {
      ...db.programmes[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return db.programmes[idx];
  }

  async listSpecializations(programmeId?: string): Promise<Specialization[]> {
    const cacheKey = programmeId || '__all__';
    const cached = this.specializationsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    let result: Specialization[];
    try {
      let query = this.client.from('specializations').select('*').order('code');
      if (programmeId) query = query.eq('programme_id', programmeId);
      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        result = db.specializations
          .filter(s => !programmeId || s.programme_id === programmeId)
          .map(s => ({
            ...s,
            semesters: s.semesters || s.applicable_semesters || [3, 4],
            applicable_semesters: s.applicable_semesters || s.semesters || [3, 4]
          }));
      } else {
        result = data.map((s: any) => ({
          ...s,
          semesters: s.semesters || s.applicable_semesters || [3, 4],
          applicable_semesters: s.applicable_semesters || s.semesters || [3, 4]
        }));
      }
    } catch {
      result = db.specializations
        .filter(s => !programmeId || s.programme_id === programmeId)
        .map(s => ({
          ...s,
          semesters: s.semesters || s.applicable_semesters || [3, 4],
          applicable_semesters: s.applicable_semesters || s.semesters || [3, 4]
        }));
    }

    this.specializationsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.CATALOG_CACHE_TTL_MS
    });
    return result;
  }

  async getSpecializationById(id: string): Promise<Specialization | null> {
    try {
      const { data, error } = await this.client
        .from('specializations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) {
        return {
          ...data,
          semesters: data.semesters || data.applicable_semesters || [3, 4],
          applicable_semesters: data.applicable_semesters || data.semesters || [3, 4]
        };
      }
      const mem = db.specializations.find(s => s.id === id);
      if (mem) {
        return {
          ...mem,
          semesters: mem.semesters || mem.applicable_semesters || [3, 4],
          applicable_semesters: mem.applicable_semesters || mem.semesters || [3, 4]
        };
      }
      return null;
    } catch {
      const mem = db.specializations.find(s => s.id === id);
      if (mem) {
        return {
          ...mem,
          semesters: mem.semesters || mem.applicable_semesters || [3, 4],
          applicable_semesters: mem.applicable_semesters || mem.semesters || [3, 4]
        };
      }
      return null;
    }
  }

  async getSpecializationByCode(programmeId: string, code: string): Promise<Specialization | null> {
    try {
      const { data, error } = await this.client
        .from('specializations')
        .select('*')
        .eq('programme_id', programmeId)
        .ilike('code', code)
        .maybeSingle();
      if (!error && data) {
        return {
          ...data,
          semesters: data.semesters || data.applicable_semesters || [3, 4],
          applicable_semesters: data.applicable_semesters || data.semesters || [3, 4]
        };
      }
      const mem = db.specializations.find(s => s.programme_id === programmeId && s.code.toUpperCase() === code.toUpperCase());
      if (mem) {
        return {
          ...mem,
          semesters: mem.semesters || mem.applicable_semesters || [3, 4],
          applicable_semesters: mem.applicable_semesters || mem.semesters || [3, 4]
        };
      }
      return null;
    } catch {
      const mem = db.specializations.find(s => s.programme_id === programmeId && s.code.toUpperCase() === code.toUpperCase());
      if (mem) {
        return {
          ...mem,
          semesters: mem.semesters || mem.applicable_semesters || [3, 4],
          applicable_semesters: mem.applicable_semesters || mem.semesters || [3, 4]
        };
      }
      return null;
    }
  }

  async createSpecialization(spec: Omit<Specialization, 'created_at' | 'updated_at'>): Promise<Specialization> {
    this.specializationsCache.clear();
    try {
      const { data, error } = await this.client
        .from('specializations')
        .insert({
          id: spec.id,
          programme_id: spec.programme_id,
          code: spec.code.toUpperCase(),
          name: spec.name,
          applicable_semesters: spec.applicable_semesters || (spec as any).semesters || [3, 4],
          active: spec.active !== undefined ? spec.active : true
        })
        .select()
        .single();
      if (!error && data) {
        return {
          ...data,
          semesters: data.semesters || data.applicable_semesters || [3, 4],
          applicable_semesters: data.applicable_semesters || data.semesters || [3, 4]
        };
      }
    } catch {}

    const record: Specialization = {
      ...spec,
      code: spec.code.toUpperCase(),
      applicable_semesters: spec.applicable_semesters || (spec as any).semesters || [3, 4],
      semesters: (spec as any).semesters || spec.applicable_semesters || [3, 4],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    db.specializations.push(record);
    return record;
  }

  async updateSpecialization(id: string, updates: Partial<Specialization>): Promise<Specialization> {
    this.specializationsCache.clear();
    const cleanUpdates = { ...updates };
    if (cleanUpdates.semesters && !cleanUpdates.applicable_semesters) {
      cleanUpdates.applicable_semesters = cleanUpdates.semesters;
    } else if (cleanUpdates.applicable_semesters && !cleanUpdates.semesters) {
      cleanUpdates.semesters = cleanUpdates.applicable_semesters;
    }

    try {
      const { data, error } = await this.client
        .from('specializations')
        .update({
          ...cleanUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        return {
          ...data,
          semesters: data.semesters || data.applicable_semesters || [3, 4],
          applicable_semesters: data.applicable_semesters || data.semesters || [3, 4]
        };
      }
    } catch {}

    const idx = db.specializations.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Specialization not found');
    db.specializations[idx] = {
      ...db.specializations[idx],
      ...cleanUpdates,
      updated_at: new Date().toISOString()
    };
    return db.specializations[idx];
  }

  async listTerms(): Promise<AcademicTerm[]> {
    const { data, error } = await this.client
      .from('academic_terms')
      .select('*')
      .order('starts_on', { ascending: false });
    if (error) throw new Error(`Database error querying terms: ${error.message}`);
    return data || [];
  }

  async getTermById(id: string): Promise<AcademicTerm | null> {
    const { data, error } = await this.client
      .from('academic_terms')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Database error querying term: ${error.message}`);
    return data || null;
  }

  async createTerm(term: Omit<AcademicTerm, 'created_at'>): Promise<AcademicTerm> {
    const { data, error } = await this.client
      .from('academic_terms')
      .insert({
        id: term.id,
        name: term.name,
        starts_on: term.starts_on,
        ends_on: term.ends_on,
        active: term.active
      })
      .select()
      .single();
    if (error) throw new Error(`Database error creating academic term: ${error.message}`);
    return data;
  }

  async listClasses(): Promise<ClassWithDetails[]> {
    const { data, error } = await this.client
      .from('classes')
      .select('*, class_teacher:profiles(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Database error querying classes: ${error.message}`);

    return (data || []).map((c: any) => ({
      id: c.id,
      programme_id: c.programme_id || null,
      specialization_id: c.specialization_id || null,
      term_id: c.term_id,
      programme: c.programme,
      semester: c.semester,
      section: c.section,
      class_teacher_id: c.class_teacher_id,
      created_at: c.created_at,
      term_name: '',
      class_teacher_name: c.class_teacher?.full_name || 'Unassigned'
    }));
  }

  async getClassById(id: string): Promise<Class | null> {
    const { data, error } = await this.client
      .from('classes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Database error querying class: ${error.message}`);
    return data || null;
  }

  async createClass(cls: Omit<Class, 'created_at'>): Promise<Class> {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    let effectiveTermId = cls.term_id;
    if (!effectiveTermId || !uuidRegex.test(effectiveTermId)) {
      // In case Postgres table still has NOT NULL constraint on term_id, retrieve existing internal term ID as transparent default
      const { data: termRows } = await this.client.from('academic_terms').select('id').limit(1);
      if (termRows && termRows.length > 0) {
        effectiveTermId = termRows[0].id;
      }
    }

    const insertPayload: any = {
      id: cls.id,
      programme: cls.programme,
      programme_id: cls.programme_id || null,
      specialization_id: cls.specialization_id || null,
      semester: cls.semester,
      section: cls.section,
      class_teacher_id: cls.class_teacher_id || null
    };
    if (effectiveTermId && uuidRegex.test(effectiveTermId)) {
      insertPayload.term_id = effectiveTermId;
    }

    const { data, error } = await this.client
      .from('classes')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new Error(`Database error creating class: ${error.message}`);
    return data;
  }

  async updateClassTeacher(classId: string, teacherId: string | null): Promise<Class> {
    const { data, error } = await this.client
      .from('classes')
      .update({ class_teacher_id: teacherId })
      .eq('id', classId)
      .select()
      .single();
    if (error) throw new Error(`Database error updating class teacher: ${error.message}`);
    return data;
  }

  async listClassesByTeacher(teacherId: string): Promise<ClassWithDetails[]> {
    const { data, error } = await this.client
      .from('classes')
      .select('*, term:academic_terms(name), class_teacher:profiles(full_name)')
      .eq('class_teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Database error querying classes by teacher: ${error.message}`);

    if (data && data.length > 0) {
      return data.map((c: any) => ({
        id: c.id,
        term_id: c.term_id,
        programme: c.programme,
        semester: c.semester,
        section: c.section,
        class_teacher_id: c.class_teacher_id,
        created_at: c.created_at,
        term_name: c.term?.name || 'Unknown',
        class_teacher_name: c.class_teacher?.full_name || 'Unassigned'
      }));
    }

    // Allocation fallback
    const allocations = await this.listFacultyAllocations(teacherId);
    if (allocations.length > 0) {
      const allClasses = await this.listClasses();
      const matched = allClasses.filter(c =>
        allocations.some(a =>
          (!a.programme_id || a.programme_id === c.programme_id || (c.programme && c.programme === 'MCA')) &&
          (!a.semester || a.semester === c.semester)
        )
      );

      if (matched.length > 0) {
        return matched.map(c => ({
          ...c,
          class_teacher_id: c.class_teacher_id || null,
          class_teacher_name: c.class_teacher_name !== 'Unassigned'
            ? c.class_teacher_name
            : 'Unassigned'
        }));
      }
    }

    return [];
  }

  async listSubjects(programmeId?: string): Promise<Subject[]> {
    let supabaseSubjects: Subject[] = [];
    let querySuccess = false;
    try {
      let query = this.client
        .from('subjects')
        .select('*')
        .order('code');
      if (programmeId) query = query.eq('programme_id', programmeId);

      const { data, error } = await query;
      if (!error && data) {
        supabaseSubjects = data;
        querySuccess = true;
      }
    } catch {}

    const subjectList = querySuccess
      ? supabaseSubjects
      : db.subjects.filter(s => !programmeId || s.programme_id === programmeId);

    const [progs, specs] = await Promise.all([
      this.listProgrammes(),
      this.listSpecializations()
    ]);
    const progsMap = new Map(progs.map(p => [p.id, p]));
    const specsMap = new Map(specs.map(sp => [sp.id, sp]));

    return subjectList.map(s => {
      const prog = s.programme_id ? progsMap.get(s.programme_id) : undefined;
      const spec = s.specialization_id ? specsMap.get(s.specialization_id) : undefined;
      return {
        ...s,
        programme_code: prog?.code || s.programme_code,
        programme_name: prog?.name || s.programme_name,
        specialization_code: spec?.code || s.specialization_code,
        specialization_name: spec?.name || s.specialization_name
      };
    });
  }

  async getSubjectById(id: string): Promise<Subject | null> {
    let sub: Subject | null = null;
    let querySuccess = false;
    try {
      const { data, error } = await this.client
        .from('subjects')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error) {
        sub = data;
        querySuccess = true;
      }
    } catch {}
    if (!querySuccess) {
      sub = db.subjects.find(s => s.id === id) || null;
    }
    if (sub) {
      const [progs, specs] = await Promise.all([
        this.listProgrammes(),
        this.listSpecializations()
      ]);
      const prog = sub.programme_id ? progs.find(p => p.id === sub!.programme_id) : undefined;
      const spec = sub.specialization_id ? specs.find(sp => sp.id === sub!.specialization_id) : undefined;
      return {
        ...sub,
        programme_code: prog?.code || sub.programme_code,
        programme_name: prog?.name || sub.programme_name,
        specialization_code: spec?.code || sub.specialization_code,
        specialization_name: spec?.name || sub.specialization_name
      };
    }
    return null;
  }

  async getSubjectByCode(code: string): Promise<Subject | null> {
    try {
      const { data, error } = await this.client
        .from('subjects')
        .select('*')
        .ilike('code', code)
        .maybeSingle();
      if (!error && data) {
        return data;
      }
      if (!error && !data) {
        return null;
      }
    } catch {}
    const mem = db.subjects.find(
      s => s.code.toUpperCase() === code.toUpperCase()
    );
    return mem || null;
  }

  async createSubject(subject: Omit<Subject, 'created_at'>): Promise<Subject> {
    const memoryRecord: Subject = {
      ...subject,
      code: subject.code.toUpperCase(),
      active: subject.active !== undefined ? subject.active : true,
      created_at: new Date().toISOString()
    };

    try {
      const payload: any = {
        id: subject.id,
        code: subject.code.toUpperCase(),
        name: subject.name,
        credits: subject.credits
      };
      if (subject.programme_id) payload.programme_id = subject.programme_id;
      if (subject.specialization_id) payload.specialization_id = subject.specialization_id;
      if (subject.semester) payload.semester = subject.semester;
      if (subject.active !== undefined) payload.active = subject.active;

      const { data, error } = await this.client
        .from('subjects')
        .insert(payload)
        .select()
        .single();
      if (!error && data) {
        const enrichedRecord: Subject = {
          ...memoryRecord,
          ...data
        };
        const idx = db.subjects.findIndex(s => s.id === enrichedRecord.id);
        if (idx >= 0) db.subjects[idx] = enrichedRecord;
        else db.subjects.push(enrichedRecord);

        if (subject.specialization_id) {
          await this.linkSubjectSpecialization(subject.id, subject.specialization_id, subject.semester || undefined).catch(() => {});
        }
        return enrichedRecord;
      }

      // If insert failed due to missing migration 8 columns on live Supabase, try base columns
      if (error) {
        const basePayload: any = {
          id: subject.id,
          code: subject.code.toUpperCase(),
          name: subject.name,
          credits: subject.credits
        };
        const { data: baseData } = await this.client
          .from('subjects')
          .insert(basePayload)
          .select()
          .single();
        if (baseData) {
          memoryRecord.created_at = baseData.created_at || memoryRecord.created_at;
        }
      }
    } catch {}

    const idx = db.subjects.findIndex(s => s.id === memoryRecord.id);
    if (idx >= 0) db.subjects[idx] = memoryRecord;
    else db.subjects.push(memoryRecord);

    if (subject.specialization_id) {
      await this.linkSubjectSpecialization(subject.id, subject.specialization_id, subject.semester || undefined).catch(() => {});
    }
    return memoryRecord;
  }

  async listSubjectsBySpecialization(specializationId: string, semester?: number): Promise<Subject[]> {
    try {
      let query = this.client
        .from('subjects')
        .select('*')
        .eq('specialization_id', specializationId)
        .order('code');
      if (semester) query = query.eq('semester', semester);
      const { data, error } = await query;
      if (!error && data) return data;
    } catch {}

    const linkedIds = new Set(
      db.subject_specializations
        .filter(ss => ss.specialization_id === specializationId && (!semester || ss.semester === semester))
        .map(ss => ss.subject_id)
    );

    return db.subjects.filter(s => {
      const matchesSpec = s.specialization_id === specializationId || linkedIds.has(s.id);
      const matchesSem = !semester || s.semester === semester;
      return matchesSpec && matchesSem;
    });
  }

  async listSubjectsByProgramme(programmeId: string, semester?: number): Promise<Subject[]> {
    try {
      let query = this.client
        .from('subjects')
        .select('*')
        .eq('programme_id', programmeId)
        .order('code');
      if (semester) query = query.eq('semester', semester);
      const { data, error } = await query;
      if (!error && data) return data;
    } catch {}

    return db.subjects.filter(s => {
      const matchesProg = s.programme_id === programmeId;
      const matchesSem = !semester || s.semester === semester;
      return matchesProg && matchesSem;
    });
  }

  async listAvailableSubjectsForFaculty(params: {
    facultyId?: string;
    programmeId: string;
    specializationId?: string | null;
    semester: number;
  }): Promise<Subject[]> {
    const [allProgrammes, allSubjects, allClassSubjects] = await Promise.all([
      this.listProgrammes().catch(() => []),
      this.listSubjects().catch(() => []),
      this.listClassSubjects().catch(() => [])
    ]);

    const prog = allProgrammes.find(p => p.id === params.programmeId);
    const progCode = prog?.code || 'MCA';

    let subjectSpecs: any[] = [];
    try {
      const { data } = await this.client.from('subject_specializations').select('*');
      if (data) subjectSpecs = data;
    } catch {}
    if (db.subject_specializations) {
      subjectSpecs = [...subjectSpecs, ...db.subject_specializations];
    }

    // 1. Candidate subjects
    const candidateSubjects = allSubjects.filter(s => {
      if (s.active === false) return false;
      const semMatch = s.semester === params.semester;
      const progMatch = s.programme_id === params.programmeId || (!s.programme_id && progCode === 'MCA');
      if (!semMatch || !progMatch) return false;

      if (!params.specializationId) {
        // Core / All Specialization: Only core subjects
        return !s.specialization_id;
      } else {
        // Specific specialization
        const isLinked = subjectSpecs.some(
          (ss: any) => ss.subject_id === s.id && ss.specialization_id === params.specializationId && (!ss.semester || ss.semester === params.semester)
        );
        const matchesSpec = s.specialization_id === params.specializationId || isLinked;
        const isOtherSpec = Boolean(s.specialization_id && s.specialization_id !== params.specializationId);
        if (isOtherSpec) return false;
        return matchesSpec || !s.specialization_id;
      }
    });

    // 2. Identify subjects actively assigned in this programme and semester
    const occupiedSubjectIds = new Set<string>();
    for (const cs of allClassSubjects) {
      if (!cs.active) continue;

      const semMatch = cs.semester === params.semester;
      const progMatch = cs.programme_code?.toUpperCase() === progCode.toUpperCase() ||
                        cs.programme_name?.toLowerCase() === prog?.name?.toLowerCase();

      if (!semMatch || !progMatch) continue;

      occupiedSubjectIds.add(cs.subject_id);
    }

    return candidateSubjects.filter(s => !occupiedSubjectIds.has(s.id));
  }

  async linkSubjectSpecialization(subjectId: string, specializationId: string, semester?: number): Promise<SubjectSpecialization> {
    try {
      const { data, error } = await this.client
        .from('subject_specializations')
        .insert({
          id: randomUUID(),
          subject_id: subjectId,
          specialization_id: specializationId,
          semester: semester || null
        })
        .select()
        .single();
      if (!error && data) return data;
    } catch {}

    const existing = db.subject_specializations.find(
      ss => ss.subject_id === subjectId && ss.specialization_id === specializationId
    );
    if (existing) return existing;

    const record: SubjectSpecialization = {
      id: randomUUID(),
      subject_id: subjectId,
      specialization_id: specializationId,
      semester: semester || null,
      created_at: new Date().toISOString()
    };
    db.subject_specializations.push(record);
    return record;
  }

  async unlinkSubjectSpecialization(subjectId: string, specializationId: string): Promise<boolean> {
    try {
      await this.client
        .from('subject_specializations')
        .delete()
        .eq('subject_id', subjectId)
        .eq('specialization_id', specializationId);
    } catch {}

    db.subject_specializations = db.subject_specializations.filter(
      ss => !(ss.subject_id === subjectId && ss.specialization_id === specializationId)
    );
    return true;
  }

  async updateSubject(id: string, updates: Partial<Subject>): Promise<Subject> {
    const existingMemIdx = db.subjects.findIndex(s => s.id === id);
    const existing = existingMemIdx >= 0 ? db.subjects[existingMemIdx] : null;

    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.code) cleanUpdates.code = cleanUpdates.code.toUpperCase();

    try {
      const { data, error } = await this.client
        .from('subjects')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) {
        const enriched: Subject = {
          ...(existing || {}),
          ...data,
          ...cleanUpdates
        };
        if (existingMemIdx >= 0) db.subjects[existingMemIdx] = enriched;
        else db.subjects.push(enriched);

        if (cleanUpdates.specialization_id) {
          await this.linkSubjectSpecialization(id, cleanUpdates.specialization_id, cleanUpdates.semester || undefined).catch(() => {});
        }
        return enriched;
      }

      if (error) {
        const baseUpdates: any = {};
        if (cleanUpdates.code) baseUpdates.code = cleanUpdates.code;
        if (cleanUpdates.name) baseUpdates.name = cleanUpdates.name;
        if (cleanUpdates.credits !== undefined) baseUpdates.credits = cleanUpdates.credits;
        if (cleanUpdates.active !== undefined) baseUpdates.active = cleanUpdates.active;

        if (Object.keys(baseUpdates).length > 0) {
          await this.client.from('subjects').update(baseUpdates).eq('id', id);
        }
      }
    } catch {}

    const updated: Subject = {
      ...(existing || { id, code: '', name: '', credits: 3, active: true, created_at: new Date().toISOString() }),
      ...cleanUpdates
    };
    if (existingMemIdx >= 0) db.subjects[existingMemIdx] = updated;
    else db.subjects.push(updated);

    if (cleanUpdates.specialization_id) {
      await this.linkSubjectSpecialization(id, cleanUpdates.specialization_id, cleanUpdates.semester || undefined).catch(() => {});
    }

    return updated;
  }

  async getSubjectDependencies(id: string): Promise<SubjectDependencies> {
    let classSubjectsCount = 0;
    let assessmentsCount = 0;
    let submissionsCount = 0;
    const classesList: Array<{ id: string; programme: string; semester: number; section?: string | null }> = [];
    const allocationsList: Array<{ id: string; class_id: string; class_name: string; teacher_name?: string }> = [];
    const details: string[] = [];

    // 1. Check Supabase class_subjects
    try {
      const { data: csData } = await this.client
        .from('class_subjects')
        .select('*, class:classes(id, programme, semester, section), teacher:profiles(full_name)')
        .eq('subject_id', id);
      if (csData && csData.length > 0) {
        for (const cs of csData) {
          const className = cs.class ? formatClassName(cs.class) : 'Class';
          allocationsList.push({
            id: cs.id,
            class_id: cs.class_id,
            class_name: className,
            teacher_name: cs.teacher?.full_name || 'Unassigned'
          });
          if (cs.class && !classesList.some(c => c.id === cs.class.id)) {
            classesList.push({
              id: cs.class.id,
              programme: cs.class.programme,
              semester: cs.class.semester,
              section: cs.class.section
            });
          }
        }
      }
    } catch {}

    // 2. Also check in-memory classSubjects
    const memCS = db.classSubjects.filter(cs => cs.subject_id === id);
    for (const cs of memCS) {
      if (!allocationsList.some(a => a.id === cs.id)) {
        const c = db.classes.find(cl => cl.id === cs.class_id);
        const t = db.profiles.find(u => u.id === cs.subject_teacher_id);
        const className = c ? formatClassName(c) : 'Class';
        allocationsList.push({
          id: cs.id,
          class_id: cs.class_id,
          class_name: className,
          teacher_name: t?.full_name || 'Unassigned'
        });
        if (c && !classesList.some(cl => cl.id === c.id)) {
          classesList.push({
            id: c.id,
            programme: c.programme,
            semester: c.semester,
            section: c.section
          });
        }
      }
    }
    classSubjectsCount = allocationsList.length;

    // 3. Check assessments table
    try {
      const { data: assData } = await this.client
        .from('assessments')
        .select('id, title')
        .eq('subject_id', id);
      if (assData && assData.length > 0) {
        assessmentsCount = assData.length;
      }
    } catch {}

    const hasDeps = classSubjectsCount > 0 || assessmentsCount > 0 || submissionsCount > 0;
    if (classSubjectsCount > 0) {
      const classNames = classesList.map(c => formatClassName(c)).join(', ');
      details.push(`Subject is allocated to ${classSubjectsCount} class cohort(s)${classNames ? ` (${classNames})` : ''}`);
    }
    if (assessmentsCount > 0) {
      details.push(`Subject is referenced by ${assessmentsCount} assessment(s)`);
    }

    return {
      subject_id: id,
      has_dependencies: hasDeps,
      class_subjects_count: classSubjectsCount,
      assessments_count: assessmentsCount,
      submissions_count: submissionsCount,
      classes: classesList,
      allocations: allocationsList,
      details
    };
  }

  async deleteSubject(id: string): Promise<boolean> {
    const deps = await this.getSubjectDependencies(id);
    if (deps.has_dependencies) {
      throw new Error(`Cannot delete subject: it has active dependencies (${deps.details?.join('; ')})`);
    }

    // 1. Delete from Supabase
    try {
      await this.client.from('subject_specializations').delete().eq('subject_id', id);
      await this.client.from('subjects').delete().eq('id', id);
    } catch {}

    // 2. Delete from in-memory cache
    db.subjects = db.subjects.filter(s => s.id !== id);
    db.subject_specializations = db.subject_specializations.filter(ss => ss.subject_id !== id);
    return true;
  }

  async listClassSubjects(): Promise<ClassSubjectWithDetails[]> {
    try {
      const { data, error } = await this.client
        .from('class_subjects')
        .select('*, class:classes(programme, semester, section, programme_id, specialization_id), subject:subjects(code, name, programme_id, specialization_id, semester), teacher:profiles(full_name)')
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data.map((cs: any) => ({
          id: cs.id,
          class_id: cs.class_id,
          subject_id: cs.subject_id,
          subject_teacher_id: cs.subject_teacher_id,
          active: cs.active,
          created_at: cs.created_at,
          class_name: cs.class ? formatClassName(cs.class) : 'Unknown Class',
          subject_name: cs.subject ? `${cs.subject.code} - ${cs.subject.name}` : 'Unknown Subject',
          teacher_name: cs.teacher?.full_name || 'Unassigned',
          programme_code: cs.class?.programme,
          semester: cs.class?.semester ?? cs.subject?.semester
        }));
      }
    } catch {}

    return db.classSubjects.map(mem => {
      const cl = db.classes.find(c => c.id === mem.class_id);
      const sub = db.subjects.find(s => s.id === mem.subject_id);
      const teacher = db.profiles.find(u => u.id === mem.subject_teacher_id);
      return {
        id: mem.id,
        class_id: mem.class_id,
        subject_id: mem.subject_id,
        subject_teacher_id: mem.subject_teacher_id,
        active: mem.active,
        created_at: (mem as any).created_at || new Date().toISOString(),
        class_name: cl ? formatClassName(cl) : 'Unknown Class',
        subject_name: sub ? `${sub.code} - ${sub.name}` : 'Unknown Subject',
        teacher_name: teacher ? teacher.full_name : 'Unassigned',
        programme_code: cl?.programme,
        semester: cl?.semester ?? sub?.semester
      };
    });
  }

  async getClassSubjectById(id: string): Promise<ClassSubject | null> {
    try {
      const { data, error } = await this.client
        .from('class_subjects')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data;
    } catch {}
    const mem = db.classSubjects.find(cs => cs.id === id);
    return mem || null;
  }

  async getClassSubjectByClassAndSubject(classId: string, subjectId: string): Promise<ClassSubject | null> {
    try {
      const { data, error } = await this.client
        .from('class_subjects')
        .select('*')
        .eq('class_id', classId)
        .eq('subject_id', subjectId)
        .maybeSingle();
      if (!error && data) return data;
    } catch {}
    const mem = db.classSubjects.find(cs => cs.class_id === classId && cs.subject_id === subjectId);
    return mem || null;
  }

  async assignClassSubject(cs: Omit<ClassSubject, 'created_at'>): Promise<ClassSubject> {
    const { data, error } = await this.client
      .from('class_subjects')
      .insert({
        id: cs.id,
        class_id: cs.class_id,
        subject_id: cs.subject_id,
        subject_teacher_id: cs.subject_teacher_id,
        active: cs.active
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23503' && (error.message.includes('class_subjects_subject_id_fkey') || error.message.includes('subject_id'))) {
        const customErr: any = new Error('The selected subject could not be found. Please refresh the subject list and try again.');
        customErr.code = 'INVALID_SUBJECT';
        customErr.status = 400;
        throw customErr;
      }
      throw new Error(`Database error assigning class subject: ${error.message}`);
    }

    const record: ClassSubject = data;
    const idx = db.classSubjects.findIndex(item => item.id === record.id);
    if (idx >= 0) {
      db.classSubjects[idx] = record;
    } else {
      db.classSubjects.push(record);
    }
    return record;
  }

  async unassignClassSubject(id: string): Promise<boolean> {
    const { error } = await this.client
      .from('class_subjects')
      .delete()
      .eq('id', id);
    if (error) {
      throw new Error(`Database error removing class subject assignment: ${error.message}`);
    }
    db.classSubjects = db.classSubjects.filter(cs => cs.id !== id);
    return true;
  }

  async unassignSubjectAllocations(subjectId: string): Promise<number> {
    let count = 0;
    try {
      const { data } = await this.client
        .from('class_subjects')
        .delete()
        .eq('subject_id', subjectId)
        .select('id');
      if (data) count = data.length;
    } catch {}
    const memBefore = db.classSubjects.length;
    db.classSubjects = db.classSubjects.filter(cs => cs.subject_id !== subjectId);
    return Math.max(count, memBefore - db.classSubjects.length);
  }

  async listClassSubjectsByTeacher(teacherId: string): Promise<ClassSubjectWithDetails[]> {
    const { data, error } = await this.client
      .from('class_subjects')
      .select('*, class:classes(programme, semester, section), subject:subjects(code, name), teacher:profiles(full_name)')
      .eq('subject_teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Database error querying class subjects by teacher: ${error.message}`);

    return (data || []).map((cs: any) => ({
      id: cs.id,
      class_id: cs.class_id,
      subject_id: cs.subject_id,
      subject_teacher_id: cs.subject_teacher_id,
      active: cs.active,
      created_at: cs.created_at,
      class_name: cs.class ? formatClassName(cs.class) : 'Unknown Class',
      subject_name: cs.subject ? `${cs.subject.code} - ${cs.subject.name}` : 'Unknown Subject',
      teacher_name: cs.teacher?.full_name || 'Unassigned'
    }));
  }

  async listEnrollments(classId?: string, specializationId?: string): Promise<EnrollmentWithDetails[]> {
    let query = this.client
      .from('enrollments')
      .select('*, student:profiles(full_name, email, usn), class:classes(programme, programme_id, specialization_id, semester, section)')
      .order('created_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);

    const { data, error } = await query;
    if (error) throw new Error(`Database error querying enrollments: ${error.message}`);

    const specializations = await this.listSpecializations();
    const specMap = new Map(specializations.map(s => [s.id, s]));

    const mapped: EnrollmentWithDetails[] = (data || []).map((e: any) => {
      const cls = e.class;
      const specId = e.specialization_id || cls?.specialization_id || null;
      const spec = specId ? specMap.get(specId) : null;
      return {
        id: e.id,
        class_id: e.class_id,
        student_id: e.student_id,
        roll_number: e.roll_number,
        status: e.status,
        created_at: e.created_at,
        student_name: e.student?.full_name || 'Unknown Student',
        student_email: e.student?.email || 'unknown@smartfa.edu',
        student_usn: e.student?.usn || null,
        class_name: cls ? formatClassName(cls) : 'Unknown Class',
        programme: cls?.programme || 'MCA',
        programme_id: cls?.programme_id || null,
        specialization_id: specId,
        specialization_code: spec?.code || null,
        specialization_name: spec?.name || null,
        semester: cls?.semester ?? null,
        section: cls?.section ?? null
      };
    });

    if (specializationId) {
      return mapped.filter(e => e.specialization_id === specializationId);
    }
    return mapped;
  }

  async getEnrollment(classId: string, studentId: string): Promise<Enrollment | null> {
    const { data, error } = await this.client
      .from('enrollments')
      .select('*')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw new Error(`Database error querying enrollment: ${error.message}`);
    return data || null;
  }

  async enrollStudent(enrollment: Omit<Enrollment, 'created_at'>): Promise<Enrollment> {
    const { data, error } = await this.client
      .from('enrollments')
      .insert({
        id: enrollment.id,
        class_id: enrollment.class_id,
        student_id: enrollment.student_id,
        specialization_id: enrollment.specialization_id || null,
        roll_number: enrollment.roll_number || null,
        status: enrollment.status || 'active'
      })
      .select()
      .single();
    if (error) throw new Error(`Database error enrolling student: ${error.message}`);
    return data;
  }

  async deleteEnrollment(id: string): Promise<boolean> {
    const { error } = await this.client
      .from('enrollments')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Database error deleting enrollment: ${error.message}`);
    return true;
  }

  async updateEnrollmentClass(id: string, newClassId: string): Promise<Enrollment> {
    const { data, error } = await this.client
      .from('enrollments')
      .update({ class_id: newClassId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Database error updating enrollment class: ${error.message}`);
    return data;
  }

  async updateEnrollmentSpecialization(id: string, specializationId: string | null): Promise<Enrollment> {
    const { data, error } = await this.client
      .from('enrollments')
      .update({ specialization_id: specializationId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Database error updating enrollment specialization: ${error.message}`);
    return data;
  }

  async listProctorAssignments(classId?: string): Promise<ProctorAssignmentWithDetails[]> {
    let query = this.client
      .from('proctor_assignments')
      .select('*, student:profiles!student_id(full_name, email, usn), proctor:profiles!proctor_id(full_name, email), class:classes(programme, semester, section)')
      .order('created_at', { ascending: false });
    if (classId) query = query.eq('class_id', classId);

    const { data, error } = await query;
    if (error) throw new Error(`Database error querying proctor assignments: ${error.message}`);

    const enrollments = await this.listEnrollments().catch(() => []);
    const enrMap = new Map(enrollments.map(e => [e.student_id, e]));

    return (data || []).map((pa: any) => {
      const enr = enrMap.get(pa.student_id);
      return {
        id: pa.id,
        class_id: pa.class_id,
        student_id: pa.student_id,
        proctor_id: pa.proctor_id,
        valid_from: pa.valid_from,
        valid_to: pa.valid_to,
        assigned_by: pa.assigned_by,
        created_at: pa.created_at,
        student_name: pa.student?.full_name || 'Unknown Student',
        student_email: pa.student?.email || null,
        student_usn: pa.student?.usn || null,
        proctor_name: pa.proctor?.full_name || 'Unknown Proctor',
        proctor_email: pa.proctor?.email || null,
        class_name: pa.class ? formatClassName(pa.class) : 'Unknown Class',
        programme: pa.class?.programme || enr?.programme || null,
        semester: pa.class?.semester ?? enr?.semester ?? null,
        specialization_id: enr?.specialization_id || null,
        specialization_name: enr?.specialization_name || null
      };
    });
  }

  async getProctorAssignment(classId: string, studentId: string, proctorId: string): Promise<ProctorAssignment | null> {
    const { data, error } = await this.client
      .from('proctor_assignments')
      .select('*')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .eq('proctor_id', proctorId)
      .maybeSingle();
    if (error) throw new Error(`Database error querying proctor assignment: ${error.message}`);
    return data || null;
  }

  async getProctorAssignmentByStudent(studentId: string): Promise<ProctorAssignmentWithDetails | null> {
    const { data, error } = await this.client
      .from('proctor_assignments')
      .select('*, student:profiles!student_id(full_name, email, usn), proctor:profiles!proctor_id(full_name, email), class:classes(programme, semester, section)')
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw new Error(`Database error querying proctor assignment by student: ${error.message}`);
    if (!data) return null;

    const enrollments = await this.listEnrollments().catch(() => []);
    const enr = enrollments.find(e => e.student_id === studentId);

    return {
      id: data.id,
      class_id: data.class_id,
      student_id: data.student_id,
      proctor_id: data.proctor_id,
      valid_from: data.valid_from,
      valid_to: data.valid_to,
      assigned_by: data.assigned_by,
      created_at: data.created_at,
      student_name: data.student?.full_name || 'Unknown Student',
      student_email: data.student?.email || null,
      student_usn: data.student?.usn || null,
      proctor_name: data.proctor?.full_name || 'Unknown Proctor',
      proctor_email: data.proctor?.email || null,
      class_name: data.class ? formatClassName(data.class) : 'Unknown Class',
      programme: data.class?.programme || enr?.programme || null,
      semester: data.class?.semester ?? enr?.semester ?? null,
      specialization_id: enr?.specialization_id || null,
      specialization_name: enr?.specialization_name || null
    };
  }

  async assignProctor(pa: Omit<ProctorAssignment, 'created_at'>): Promise<ProctorAssignment> {
    const { data, error } = await this.client
      .from('proctor_assignments')
      .insert({
        id: pa.id,
        class_id: pa.class_id,
        student_id: pa.student_id,
        proctor_id: pa.proctor_id,
        valid_from: pa.valid_from || new Date().toISOString().split('T')[0],
        valid_to: pa.valid_to || null,
        assigned_by: pa.assigned_by || null
      })
      .select()
      .single();
    if (error) throw new Error(`Database error assigning proctor: ${error.message}`);
    return data;
  }

  async removeProctorAssignment(id: string): Promise<boolean> {
    const { error } = await this.client
      .from('proctor_assignments')
      .delete()
      .eq('id', id);
    if (error) throw new Error(`Database error removing proctor assignment: ${error.message}`);
    return true;
  }

  async reassignProctor(id: string, newProctorId: string): Promise<ProctorAssignment> {
    const { data, error } = await this.client
      .from('proctor_assignments')
      .update({ proctor_id: newProctorId })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Database error reassigning proctor: ${error.message}`);
    return data;
  }

  async listProctorAssignmentsByProctor(proctorId: string): Promise<ProctorAssignmentWithDetails[]> {
    const { data, error } = await this.client
      .from('proctor_assignments')
      .select('*, student:profiles!student_id(full_name, email, usn), proctor:profiles!proctor_id(full_name, email), class:classes(programme, semester, section)')
      .eq('proctor_id', proctorId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Database error querying proctor assignments by proctor: ${error.message}`);

    const enrollments = await this.listEnrollments().catch(() => []);
    const enrMap = new Map(enrollments.map(e => [e.student_id, e]));

    return (data || []).map((pa: any) => {
      const enr = enrMap.get(pa.student_id);
      return {
        id: pa.id,
        class_id: pa.class_id,
        student_id: pa.student_id,
        proctor_id: pa.proctor_id,
        valid_from: pa.valid_from,
        valid_to: pa.valid_to,
        assigned_by: pa.assigned_by,
        created_at: pa.created_at,
        student_name: pa.student?.full_name || 'Unknown Student',
        student_email: pa.student?.email || null,
        student_usn: pa.student?.usn || null,
        proctor_name: pa.proctor?.full_name || 'Unknown Proctor',
        proctor_email: pa.proctor?.email || null,
        class_name: pa.class ? formatClassName(pa.class) : 'Unknown Class',
        programme: pa.class?.programme || enr?.programme || null,
        semester: pa.class?.semester ?? enr?.semester ?? null,
        specialization_id: enr?.specialization_id || null,
        specialization_name: enr?.specialization_name || null
      };
    });
  }

  async listFacultyAllocations(facultyId?: string): Promise<FacultyAllocation[]> {
    try {
      let query = this.client
        .from('faculty_allocations')
        .select('*')
        .order('created_at', { ascending: false });
      if (facultyId) {
        query = query.eq('faculty_id', facultyId);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data.map((a: any) => ({
          id: a.id,
          faculty_id: a.faculty_id,
          programme_id: a.programme_id,
          specialization_id: a.specialization_id || null,
          semester: a.semester || null,
          assigned_by: a.assigned_by || null,
          created_at: a.created_at
        }));
      }
    } catch {}

    // Fallback to in-memory db
    if (facultyId) {
      return db.faculty_allocations.filter(a => a.faculty_id === facultyId);
    }
    return [...db.faculty_allocations];
  }

  async createFacultyAllocation(allocation: Omit<FacultyAllocation, 'created_at'>): Promise<FacultyAllocation> {
    const memRecord: FacultyAllocation = {
      ...allocation,
      created_at: new Date().toISOString()
    };

    try {
      // First check if an identical allocation exists to remain idempotent and avoid unique key collision
      let existingQuery = this.client
        .from('faculty_allocations')
        .select('*')
        .eq('faculty_id', allocation.faculty_id)
        .eq('programme_id', allocation.programme_id);

      if (allocation.specialization_id) {
        existingQuery = existingQuery.eq('specialization_id', allocation.specialization_id);
      } else {
        existingQuery = existingQuery.is('specialization_id', null);
      }

      if (allocation.semester) {
        existingQuery = existingQuery.eq('semester', allocation.semester);
      } else {
        existingQuery = existingQuery.is('semester', null);
      }

      const { data: existingData } = await existingQuery.maybeSingle();
      if (existingData) {
        const idx = db.faculty_allocations.findIndex(a => a.id === existingData.id);
        if (idx >= 0) db.faculty_allocations[idx] = existingData;
        else db.faculty_allocations.push(existingData);
        return existingData;
      }

      const { data, error } = await this.client
        .from('faculty_allocations')
        .insert({
          id: allocation.id,
          faculty_id: allocation.faculty_id,
          programme_id: allocation.programme_id,
          specialization_id: allocation.specialization_id || null,
          semester: allocation.semester || null,
          assigned_by: allocation.assigned_by || null
        })
        .select()
        .single();
      if (!error && data) {
        const record: FacultyAllocation = {
          id: data.id,
          faculty_id: data.faculty_id,
          programme_id: data.programme_id,
          specialization_id: data.specialization_id || null,
          semester: data.semester || null,
          assigned_by: data.assigned_by || null,
          created_at: data.created_at
        };
        const idx = db.faculty_allocations.findIndex(a => a.id === record.id);
        if (idx >= 0) db.faculty_allocations[idx] = record;
        else db.faculty_allocations.push(record);
        return record;
      }
    } catch {}

    // In-memory fallback
    const idx = db.faculty_allocations.findIndex(a => a.id === memRecord.id);
    if (idx >= 0) db.faculty_allocations[idx] = memRecord;
    else db.faculty_allocations.push(memRecord);
    return memRecord;
  }

  async removeFacultyAllocation(id: string): Promise<boolean> {
    try {
      await this.client
        .from('faculty_allocations')
        .delete()
        .eq('id', id);
    } catch {}
    db.faculty_allocations = db.faculty_allocations.filter(a => a.id !== id);
    return true;
  }

  isPersistent(): boolean {
    return true;
  }

  getMode(): 'supabase_postgresql' | 'in_memory_mock' {
    return 'supabase_postgresql';
  }
}

// Configurable singleton with optional test override hook
let activeAcademicRepoOverride: IAcademicRepository | null = null;
let cachedSupabaseAcademicRepo: SupabaseAcademicRepository | null = null;
let cachedInMemoryAcademicRepo: InMemoryAcademicRepository | null = null;

export const setAcademicRepositoryForTesting = (repo: IAcademicRepository | null): void => {
  activeAcademicRepoOverride = repo;
};

/**
 * Factory to retrieve the active academic repository.
 * Enforces security invariant: Never silently falls back to in-memory mock in production.
 */
export const getAcademicRepository = (): IAcademicRepository => {
  if (activeAcademicRepoOverride) {
    return activeAcademicRepoOverride;
  }

  if (process.env.NODE_ENV === 'production') {
    const hasProdCreds = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY && 
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
    );
    if (!hasProdCreds || !supabaseAdmin) {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: Production mode requires active Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Offline mock storage is strictly prohibited in production.'
      );
    }
    if (!cachedSupabaseAcademicRepo) cachedSupabaseAcademicRepo = new SupabaseAcademicRepository(supabaseAdmin);
    return cachedSupabaseAcademicRepo;
  }

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    if (!cachedInMemoryAcademicRepo) cachedInMemoryAcademicRepo = new InMemoryAcademicRepository(db);
    return cachedInMemoryAcademicRepo;
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    if (!cachedSupabaseAcademicRepo) cachedSupabaseAcademicRepo = new SupabaseAcademicRepository(supabaseAdmin);
    return cachedSupabaseAcademicRepo;
  }

  if (!cachedInMemoryAcademicRepo) cachedInMemoryAcademicRepo = new InMemoryAcademicRepository(db);
  return cachedInMemoryAcademicRepo;
};
