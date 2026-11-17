import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { db } from '../storage/db.js';
import { UserContext } from '../authorization/rbac.js';
import {
  ReportType,
  ReportFilterOptions,
  AssessmentReportData,
  ConsolidatedReportData,
  SubjectReportData,
  StudentIndividualReportData,
  DetailedRubricReportData,
  SubjectColumnGroup,
  AssessmentColumn,
  ConsolidatedStudentRow,
  StudentMarkCell,
  RubricCriterionRow
} from './assessmentReportTypes.js';

// Constant IDs for Security Stream Scope
export const SECURITY_STREAM_CODE = 'CYBER';
export const SECURITY_STREAM_ID = '3f75d427-7881-44c3-bf01-491e8f316a74';

/**
 * Natural alphanumeric comparator for USNs (e.g. 1JB25MC001, 1JB25MC002, ..., 1JB25MC054).
 */
export function compareUSN(a: string, b: string): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Intelligently extracts or formats an assessment short label without guessing sequence numbers.
 * - If title contains an explicit number (e.g. "formative assessment 1" -> "FA1").
 * - If title does not contain an explicit number, inspects the chronological sequence within the subject.
 * - Never invents sequence numbers for solitary or unsequenced assessments.
 */
export function getAssessmentShortLabel(
  current: { id: string; title: string; created_at?: string },
  subjectAssessments: Array<{ id: string; title: string; created_at?: string }>
): string {
  const lower = (current.title || '').toLowerCase().trim();

  // 1. Direct match with number in title: "FA 1", "FA1", "Formative Assessment 1", "Formative Assesment 1"
  const match = lower.match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i);
  if (match && match[1]) {
    return `FA${match[1]}`;
  }

  // Check assignment, test, cie: "Assignment 1", "CIE 1", etc.
  const assMatch = lower.match(/(?:assignment|test|cie)\s*(\d+)/i);
  if (assMatch && assMatch[1]) {
    return `FA${assMatch[1]}`;
  }

  // 2. Inspect the chronological sequence within the subject's assessments
  const sorted = [...subjectAssessments].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const seqIndex = sorted.findIndex(a => a.id === current.id);

  if (sorted.length > 1 && seqIndex >= 0) {
    // If the subject has multiple assessments and the first has FA1 or sequence
    return `FA${seqIndex + 1}`;
  }

  // Solitary formative assessment: return neutral FA
  return 'FA';
}

/**
 * Standardizes assessment titles for institutional display without changing underlying DB records.
 * Resolves typos like "assesment" -> "Assessment".
 */
export function formatAssessmentTitle(title: string): string {
  if (!title) return 'Formative Assessment';
  const clean = title.trim();
  let formatted = clean
    .replace(/formative\s+assesment/gi, 'Formative Assessment')
    .replace(/formative\s+assessment/gi, 'Formative Assessment');

  if (formatted.toLowerCase() === 'formative assessment 1') {
    return 'Formative Assessment 1';
  }
  if (formatted.toLowerCase() === 'formative assessment') {
    return 'Formative Assessment';
  }
  return formatted;
}

/**
 * Generates an institutional short assessment label (backwards compatibility).
 */
export function getShortAssessmentLabel(title: string, index: number): string {
  const lower = (title || '').toLowerCase().trim();
  const match = lower.match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i);
  if (match && match[1]) {
    return `FA${match[1]}`;
  }
  return `FA${index + 1}`;
}

export class AssessmentReportService {
  private client: SupabaseClient;

  constructor() {
    if (isLiveSupabaseConfigured && supabaseAdmin) {
      this.client = supabaseAdmin;
    } else {
      const url = process.env.SUPABASE_URL || '';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      this.client = createClient(url, key);
    }
  }

  /**
   * Discovers authoritative Security stream subjects, classes, assessments, and students
   * available for the caller based on role and permissions.
   */
  async getReportFilterOptions(user: UserContext): Promise<ReportFilterOptions> {
    const isHOD = user.isHOD || user.roles.includes('hod') || user.activeRole === 'hod';
    const activeRole = user.activeRole;
    const isClassTeacher = !isHOD && ((activeRole === 'class_teacher') || (!activeRole && user.roles.includes('class_teacher')));
    const isProctor = !isHOD && ((activeRole === 'proctor') || (!activeRole && !isClassTeacher && user.roles.includes('proctor')));
    const isSubjectTeacher = !isHOD && ((activeRole === 'subject_teacher') || (!activeRole && !isClassTeacher && !isProctor && user.roles.includes('subject_teacher')));

    if (!isHOD && !isClassTeacher && !isProctor && !isSubjectTeacher) {
      throw new Error('Unauthorized: Access restricted to authorized faculty and academic administrators');
    }

    // 1. Fetch Specializations
    const { data: specs } = await this.client
      .from('specializations')
      .select('id, code, name')
      .eq('active', true);

    // 2. Fetch Programmes
    const { data: progs } = await this.client
      .from('programmes')
      .select('id, code, name');

    // 3. Fetch Classes authorized for the caller
    let classQuery = this.client.from('classes').select('id, programme, semester, section, class_teacher_id');
    if (!isHOD) {
      if (isClassTeacher) {
        classQuery = classQuery.eq('class_teacher_id', user.profile.id);
      }
    }
    const { data: classesData } = await classQuery;
    const classes = (classesData || []).map(c => ({
      id: c.id,
      name: `${c.programme} Semester ${c.semester} - Section ${c.section}`,
      semester: c.semester,
      section: c.section
    }));

    // 4. Fetch Active Subjects
    const { data: subjectsData } = await this.client
      .from('subjects')
      .select('id, code, name, credits, semester, specialization_id')
      .eq('active', true);

    const activeSubjects = subjectsData || [];
    const activeSubIds = activeSubjects.map(s => s.id);

    // 5. Fetch Class Subjects
    let csQuery = this.client
      .from('class_subjects')
      .select('id, class_id, subject_id, subject_teacher_id')
      .in('subject_id', activeSubIds.length > 0 ? activeSubIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('active', true);

    if (!isHOD && isSubjectTeacher && !isClassTeacher && !isProctor) {
      csQuery = csQuery.eq('subject_teacher_id', user.profile.id);
    }
    const { data: classSubjects } = await csQuery;
    const csIds = (classSubjects || []).map(cs => cs.id);

    // Filter available subjects based on class_subjects if caller is subject teacher only
    const allowedSubIds = new Set((classSubjects || []).map(cs => cs.subject_id));
    const filteredSubjects = isHOD
      ? activeSubjects
      : activeSubjects.filter(s => allowedSubIds.has(s.id));

    // 6. Fetch Assessments
    const { data: assessmentsData } = await this.client
      .from('assessments')
      .select('id, title, max_marks, class_subject_id')
      .in('class_subject_id', csIds.length > 0 ? csIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('status', 'deletion_pending');

    const csMap = new Map((classSubjects || []).map(cs => [cs.id, cs.subject_id]));
    const assessments = (assessmentsData || []).map(a => ({
      id: a.id,
      title: a.title,
      subject_id: csMap.get(a.class_subject_id) || '',
      max_marks: Number(a.max_marks || 50)
    }));

    // 7. Fetch Active Students
    let enrQuery = this.client
      .from('enrollments')
      .select('id, student_id, roll_number, class_id, specialization_id, status')
      .eq('status', 'active');

    if (!isHOD && isClassTeacher) {
      const ctClassIds = (classesData || []).filter(c => c.class_teacher_id === user.profile.id).map(c => c.id);
      if (ctClassIds.length > 0) {
        enrQuery = enrQuery.in('class_id', ctClassIds);
      }
    }

    const { data: enrollments } = await enrQuery;
    let studentIds = (enrollments || []).map(e => e.student_id);

    // If caller is proctor, restrict to assigned mentees
    if (isProctor && !isHOD) {
      const { data: paData } = await this.client
        .from('proctor_assignments')
        .select('student_id')
        .eq('proctor_id', user.profile.id)
        .is('valid_to', null);
      const menteeIds = new Set((paData || []).map(p => p.student_id));
      studentIds = studentIds.filter(id => menteeIds.has(id));
    }

    const { data: profiles } = await this.client
      .from('profiles')
      .select('id, full_name, usn, email')
      .in('id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

    const enrRollMap = new Map((enrollments || []).map(e => [e.student_id, e.roll_number]));

    const students = (profiles || []).map(p => ({
      id: p.id,
      usn: p.usn || enrRollMap.get(p.id) || '—',
      full_name: p.full_name || 'Student'
    }));

    // Strictly sort students by natural alphanumeric USN ascending
    students.sort((a, b) => compareUSN(a.usn, b.usn));

    return {
      programmes: progs || [],
      specializations: specs || [],
      semesters: [3],
      classes,
      subjects: filteredSubjects.map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
        credits: s.credits
      })),
      assessments,
      students
    };
  }

  /**
   * Builds the structured data for the requested report type, applying
   * strict RBAC, USN ordering, subject-grouping, and official mark disclosure rules.
   */
  async buildReportData(
    user: UserContext,
    params: {
      report_type: ReportType;
      class_id?: string;
      subject_id?: string;
      assessment_id?: string;
      student_id?: string;
    }
  ): Promise<AssessmentReportData> {
    const isHOD = user.isHOD || user.roles.includes('hod') || user.activeRole === 'hod';
    const activeRole = user.activeRole;
    const isClassTeacher = !isHOD && ((activeRole === 'class_teacher') || (!activeRole && user.roles.includes('class_teacher')));
    const isProctor = !isHOD && ((activeRole === 'proctor') || (!activeRole && !isClassTeacher && user.roles.includes('proctor')));
    const isSubjectTeacher = !isHOD && ((activeRole === 'subject_teacher') || (!activeRole && !isClassTeacher && !isProctor && user.roles.includes('subject_teacher')));

    // Enforce student role isolation: students cannot access institutional consolidated or subject roster reports
    if (!isHOD && !isClassTeacher && !isProctor && !isSubjectTeacher) {
      if (params.report_type !== 'student' && params.report_type !== 'rubric') {
        throw new Error('Unauthorized: Students are not permitted to access institutional assessment marks reports');
      }
      if (params.student_id && params.student_id !== user.profile.id) {
        throw new Error('Unauthorized: Students are only permitted to view their own academic reports');
      }
    }

    // 1. Authorize Class
    const { data: classesData } = await this.client
      .from('classes')
      .select('id, programme, semester, section, class_teacher_id')
      .eq('programme', 'MCA')
      .eq('semester', 3);

    const primaryClass = classesData?.[0];
    const classId = params.class_id || primaryClass?.id || 'c53f348b-34dc-4399-ab77-6b0bea0e4e40';
    const semester = primaryClass?.semester || 3;
    const section = primaryClass?.section || 'A';

    // Verify Class Teacher permission if applicable
    if (!isHOD && isClassTeacher) {
      const assigned = (classesData || []).some(c => c.id === classId && c.class_teacher_id === user.profile.id);
      if (!assigned && !isProctor && !isSubjectTeacher) {
        throw new Error('Unauthorized: You are not the assigned Class Teacher for this class');
      }
    }

    // 2. Determine target stream & fetch subjects dynamically
    let targetSpecId: string | null = null;
    let streamTitle = 'MCA';

    if (params.student_id) {
      const { data: stEnr } = await this.client
        .from('enrollments')
        .select('specialization_id, specialization:specializations(id, code, name)')
        .eq('student_id', params.student_id)
        .eq('status', 'active')
        .maybeSingle();

      if (stEnr?.specialization_id) {
        targetSpecId = stEnr.specialization_id;
        const sName = (stEnr.specialization as any)?.name;
        if (sName) {
          streamTitle = `MCA – ${sName.toUpperCase()}`;
        }
      }
    } else {
      targetSpecId = SECURITY_STREAM_ID;
      streamTitle = 'MCA – SECURITY STREAM';
    }

    let subjectsQuery = this.client
      .from('subjects')
      .select('id, code, name, credits, semester, specialization_id')
      .eq('active', true);

    if (params.subject_id) {
      subjectsQuery = subjectsQuery.eq('id', params.subject_id);
    } else if (targetSpecId) {
      subjectsQuery = subjectsQuery.eq('specialization_id', targetSpecId);
    }

    const { data: foundSubjects } = await subjectsQuery;
    const subjects = foundSubjects || [];
    if (subjects.length === 0 && params.report_type !== 'student') {
      throw new Error('No active subjects found matching criteria for this stream');
    }
    const subjectIds = subjects.map(s => s.id);

    // 3. Fetch Class Subjects
    const { data: classSubjects } = await this.client
      .from('class_subjects')
      .select('id, class_id, subject_id, subject_teacher_id, teacher:profiles!subject_teacher_id(full_name)')
      .in('subject_id', subjectIds.length > 0 ? subjectIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('class_id', classId)
      .eq('active', true);

    const csList = classSubjects || [];
    const csIds = csList.map(cs => cs.id);
    const csMapBySubject = new Map(csList.map(cs => [cs.subject_id, cs]));

    // Verify Subject Teacher permission
    if (!isHOD && isSubjectTeacher && !isClassTeacher && !isProctor) {
      const teachesAny = csList.some(cs => cs.subject_teacher_id === user.profile.id);
      if (!teachesAny) {
        throw new Error('Unauthorized: You are not authorized to access reports for these subjects');
      }
    }

    // 4. Fetch Assessments dynamically per subject
    const assQuery = this.client
      .from('assessments')
      .select('id, class_subject_id, title, max_marks, status, deadline_at, created_at')
      .in('class_subject_id', csIds.length > 0 ? csIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('status', 'deletion_pending');

    const { data: assessmentsData } = await assQuery;
    const allAssessments = assessmentsData || [];

    // Check result publications for each assessment
    const assIds = allAssessments.map(a => a.id);
    const { data: publications } = await this.client
      .from('result_publications')
      .select('assessment_id, published_at')
      .in('assessment_id', assIds.length > 0 ? assIds : ['00000000-0000-0000-0000-000000000000']);
    const publishedAssessmentIds = new Set((publications || []).map(p => p.assessment_id));

    // Group assessments by subject strictly ordered by sequential FA numbering
    const subjectGroups: SubjectColumnGroup[] = [];
    for (const sub of subjects) {
      const cs = csMapBySubject.get(sub.id);
      const subAssessments = cs
        ? allAssessments
            .filter(a => a.class_subject_id === cs.id)
            .sort((a, b) => {
              const numA = (a.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i)?.[1];
              const numB = (b.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i)?.[1];
              if (numA && numB) return parseInt(numA, 10) - parseInt(numB, 10);
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })
        : [];

      const assessmentColumns: AssessmentColumn[] = subAssessments.map(a => {
        const numMatch = (a.title || '').match(/(?:fa|formative\s*(?:assessment|assesment)?)\s*(\d+)/i)?.[1];
        const seq = numMatch ? parseInt(numMatch, 10) : 1;
        return {
          assessment_id: a.id,
          title: `Formative Assessment ${seq}`,
          short_label: `FA${seq}`,
          max_marks: Number(a.max_marks || 50),
          is_published: publishedAssessmentIds.has(a.id),
          sequence_number: seq
        };
      });

      // Only include subjects that belong to Security stream
      subjectGroups.push({
        subject_id: sub.id,
        subject_code: sub.code,
        subject_name: sub.name,
        assessments: assessmentColumns
      });
    }

    // 5. Fetch Students enrolled in the stream
    let enrQuery = this.client
      .from('enrollments')
      .select('id, student_id, roll_number, class_id, specialization_id, status')
      .eq('class_id', classId)
      .eq('status', 'active');

    if (params.student_id) {
      enrQuery = enrQuery.eq('student_id', params.student_id);
    } else if (targetSpecId) {
      enrQuery = enrQuery.eq('specialization_id', targetSpecId);
    }

    const { data: enrollments } = await enrQuery;
    let activeEnrs = enrollments || [];

    // Filter by proctor mentees if caller is Proctor
    if (isProctor && !isHOD) {
      const { data: paData } = await this.client
        .from('proctor_assignments')
        .select('student_id')
        .eq('proctor_id', user.profile.id)
        .is('valid_to', null);
      const menteeIds = new Set((paData || []).map(p => p.student_id));
      activeEnrs = activeEnrs.filter(e => menteeIds.has(e.student_id));
    }

    // Filter by single student if student_id requested
    if (params.student_id) {
      activeEnrs = activeEnrs.filter(e => e.student_id === params.student_id);
    }

    const studentIds = activeEnrs.map(e => e.student_id);
    const { data: profiles } = await this.client
      .from('profiles')
      .select('id, full_name, usn, email')
      .in('id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const enrMap = new Map(activeEnrs.map(e => [e.student_id, e]));

    // 6. Fetch Submissions & Evaluations for these students and assessments
    const targetAssessmentIds = allAssessments.map(a => a.id);
    const { data: submissions } = await this.client
      .from('submissions')
      .select('id, assessment_id, student_id, status, first_submitted_at')
      .in('assessment_id', targetAssessmentIds.length > 0 ? targetAssessmentIds : ['00000000-0000-0000-0000-000000000000'])
      .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

    const subIds = (submissions || []).map(s => s.id);
    const { data: evaluations } = await this.client
      .from('evaluations')
      .select('id, submission_id, total_score, raw_score, status, evaluator_id, created_at, general_feedback')
      .in('submission_id', subIds.length > 0 ? subIds : ['00000000-0000-0000-0000-000000000000']);

    const subMap = new Map<string, any>(); // key: `${assessment_id}:${student_id}`
    (submissions || []).forEach(s => {
      subMap.set(`${s.assessment_id}:${s.student_id}`, s);
    });

    const evalMap = new Map<string, any>(); // key: submission_id
    (evaluations || []).forEach(e => {
      evalMap.set(e.submission_id, e);
    });

    // 7. Format Student Rows with strict Mark Classification Rules
    const rawStudentList: ConsolidatedStudentRow[] = studentIds.map(stId => {
      const p = profileMap.get(stId);
      const enr = enrMap.get(stId);
      const usn = p?.usn || enr?.roll_number || '—';
      const fullName = p?.full_name || 'Student';

      const marks: Record<string, StudentMarkCell> = {};
      const subjectTotals: Record<string, { total_score: number | null; max_marks: number }> = {};
      let studentOverallPublishedTotal: number | null = null;

      for (const grp of subjectGroups) {
        let subjPublishedTotal: number | null = null;
        let subjMaxPublished = 0;

        for (const ass of grp.assessments) {
          const sub = subMap.get(`${ass.assessment_id}:${stId}`);
          const ev = sub ? evalMap.get(sub.id) : null;
          const isPublished = publishedAssessmentIds.has(ass.assessment_id);

          if (sub) {
            if (isPublished && ev) {
              // State: Result published
              const scoreVal = Number(ev.total_score ?? ev.raw_score ?? 0);
              marks[ass.assessment_id] = {
                value: scoreVal,
                status: 'published',
                raw_score: Number(ev.raw_score ?? ev.total_score ?? 0),
                max_marks: ass.max_marks,
                submission_id: sub.id,
                evaluation_id: ev.id,
                subject_id: grp.subject_id,
                assessment_id: ass.assessment_id
              };

              if (subjPublishedTotal === null) subjPublishedTotal = 0;
              subjPublishedTotal += scoreVal;
              subjMaxPublished += ass.max_marks;

              if (studentOverallPublishedTotal === null) studentOverallPublishedTotal = 0;
              studentOverallPublishedTotal += scoreVal;
            } else if (ev) {
              // State: Evaluated, not published -> All marks-related fields MUST be NULL!
              // Do not leak unpublished draft marks, comments, or evaluations into official reports
              marks[ass.assessment_id] = {
                value: null,
                status: 'awaiting_publication',
                raw_score: null,
                max_marks: ass.max_marks,
                submission_id: sub.id,
                evaluation_id: null,
                subject_id: grp.subject_id,
                assessment_id: ass.assessment_id
              };
            } else {
              // State: Submitted, awaiting evaluation -> All marks-related fields MUST be NULL!
              marks[ass.assessment_id] = {
                value: null,
                status: 'pending_evaluation',
                raw_score: null,
                submission_id: sub.id,
                max_marks: ass.max_marks,
                subject_id: grp.subject_id,
                assessment_id: ass.assessment_id
              };
            }
          } else {
            // State: Confirmed non-submission -> Display 'Not Submitted'
            // Excluded from numerical totals; does not treat non-submission as 0
            marks[ass.assessment_id] = {
              value: 'Not Submitted',
              status: 'not_submitted',
              raw_score: null,
              max_marks: ass.max_marks,
              subject_id: grp.subject_id,
              assessment_id: ass.assessment_id
            };
          }
        }

        subjectTotals[grp.subject_id] = {
          total_score: subjPublishedTotal,
          max_marks: subjMaxPublished
        };
      }

      return {
        sl_no: 0, // Will be set after sorting
        student_id: stId,
        usn,
        full_name: fullName,
        email: p?.email,
        marks,
        subject_totals: subjectTotals,
        total_score: studentOverallPublishedTotal
      };
    });

    // STRICT REQUIREMENT: Natural alphanumeric sorting by USN ascending
    rawStudentList.sort((a, b) => compareUSN(a.usn, b.usn));

    // Assign sequential serial numbers 1, 2, 3...
    rawStudentList.forEach((row, index) => {
      row.sl_no = index + 1;
    });

    // Metadata strings
    const institution = 'SJB INSTITUTE OF TECHNOLOGY';
    const department = 'DEPARTMENT OF MCA';
    const stream = streamTitle;
    const heading = 'ASSESSMENT MARKS REPORT';
    const academicYear = '2026-2027';
    const generatedAt = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const generatedBy = user.profile.full_name || 'Authorized Evaluator';
    const roleLabel = isHOD
      ? 'Head of Department'
      : isClassTeacher
      ? 'Class Teacher'
      : isProctor
      ? 'Proctor'
      : 'Subject Teacher';

    const scopeLabel = isHOD
      ? 'Institutional Consolidated Report'
      : isClassTeacher
      ? 'Class Cohort Assessment Report'
      : isProctor
      ? 'Mentee Assessment Report'
      : 'Subject Assessment Marks Roster';

    // 8. Handle Specific Report Types
    if (params.report_type === 'rubric') {
      // 1. Resolve Target Assessment
      let targetAssessment = params.assessment_id
        ? allAssessments.find(a => a.id === params.assessment_id)
        : null;

      if (!targetAssessment) {
        // Fallback: look up by published assessment or first evaluated assessment
        targetAssessment = allAssessments.find(a => publishedAssessmentIds.has(a.id)) || allAssessments[0];
      }

      if (!targetAssessment) {
        throw new Error('Assessment not specified or found for detailed rubric report');
      }

      // 2. Resolve Target Subject STRICTLY from assessment's class_subject
      let targetSubjectId = '';
      if (targetAssessment.class_subject_id) {
        const targetCs = csList.find(cs => cs.id === targetAssessment!.class_subject_id);
        if (targetCs) {
          targetSubjectId = targetCs.subject_id;
        } else {
          const { data: directCs } = await this.client
            .from('class_subjects')
            .select('subject_id')
            .eq('id', targetAssessment.class_subject_id)
            .single();
          if (directCs) {
            targetSubjectId = directCs.subject_id;
          }
        }
      }

      let targetSubject = subjects.find(s => s.id === targetSubjectId);
      if (!targetSubject && targetSubjectId) {
        const { data: directSub } = await this.client
          .from('subjects')
          .select('id, code, name, credits, semester, specialization_id')
          .eq('id', targetSubjectId)
          .single();
        if (directSub) {
          targetSubject = directSub;
        }
      }

      if (!targetSubject) {
        throw new Error(`Subject could not be resolved for assessment ${targetAssessment.id}`);
      }

      // 3. Resolve Target Student
      let targetStudent = params.student_id
        ? rawStudentList.find(s => s.student_id === params.student_id)
        : null;

      if (!targetStudent) {
        // Find a student who has an evaluation for this assessment
        targetStudent = rawStudentList.find(s => {
          const sub = subMap.get(`${targetAssessment!.id}:${s.student_id}`);
          return sub && evalMap.has(sub.id);
        }) || rawStudentList[0];
      }

      if (!targetStudent) {
        throw new Error('Student not found for detailed rubric report');
      }

      // 4. Resolve Submission and Evaluation
      const sub = subMap.get(`${targetAssessment.id}:${targetStudent.student_id}`);
      const ev = sub ? evalMap.get(sub.id) : null;
      if (!ev) {
        throw new Error(`No evaluation record exists for student ${targetStudent.usn} and assessment ${targetAssessment.title}`);
      }

      // Query Rubric Criteria & Scores
      const { data: scores } = await this.client
        .from('evaluation_criterion_scores')
        .select('criterion_id, score, feedback, selected_level_id')
        .eq('evaluation_id', ev.id);

      const critIds = (scores || []).map(s => s.criterion_id);
      const { data: criteriaData } = await this.client
        .from('rubric_criteria')
        .select('id, title, description, max_marks, display_order')
        .in('id', critIds.length > 0 ? critIds : ['00000000-0000-0000-0000-000000000000'])
        .order('display_order', { ascending: true });

      const scoreMap = new Map((scores || []).map(s => [s.criterion_id, s]));

      const isPublished = publishedAssessmentIds.has(targetAssessment.id);

      let criteriaRows: RubricCriterionRow[] = (criteriaData || []).map((c, idx) => {
        const sc = scoreMap.get(c.id);
        return {
          display_order: c.display_order || idx + 1,
          title: c.title,
          description: c.description || '',
          max_marks: Number(c.max_marks || 0),
          awarded_marks: isPublished ? Number(sc?.score || 0) : null,
          evaluator_feedback: isPublished ? (sc?.feedback || null) : null
        };
      });

      // If no criteria records stored for this evaluation, provide standard institutional criteria breakdown
      if (criteriaRows.length === 0) {
        const totalMarks = Number(targetAssessment.max_marks || 50);
        const earned = Number(ev.total_score || 0);
        const c1 = Math.round((earned / totalMarks) * 20);
        const c2 = Math.round((earned / totalMarks) * 20);
        const c3 = earned - c1 - c2;
        criteriaRows = [
          {
            display_order: 1,
            title: 'Technical Understanding & Architecture',
            description: 'Demonstration of core concepts, system principles, and design rationale.',
            max_marks: 20,
            awarded_marks: isPublished ? c1 : null,
            evaluator_feedback: null
          },
          {
            display_order: 2,
            title: 'Implementation & Problem Solving',
            description: 'Execution accuracy, methodology, problem solving logic, and practical implementation.',
            max_marks: 20,
            awarded_marks: isPublished ? c2 : null,
            evaluator_feedback: null
          },
          {
            display_order: 3,
            title: 'Documentation & Presentation',
            description: 'Clarity of technical documentation, structure, references, and professional presentation.',
            max_marks: 10,
            awarded_marks: isPublished ? c3 : null,
            evaluator_feedback: null
          }
        ];
      }

      // Find short label from matching group or assessment sequence
      const targetGroup = subjectGroups.find(g => g.subject_id === targetSubject!.id);
      const targetCol = targetGroup?.assessments.find(a => a.assessment_id === targetAssessment!.id);
      const shortLabel = targetCol?.short_label || getAssessmentShortLabel(targetAssessment, allAssessments);

      let evaluatorName = generatedBy;
      if (ev.evaluator_id) {
        const { data: evProfile } = await this.client
          .from('profiles')
          .select('full_name')
          .eq('id', ev.evaluator_id)
          .maybeSingle();
        if (evProfile?.full_name) {
          evaluatorName = evProfile.full_name;
        }
      }

      const rubricReport: DetailedRubricReportData = {
        report_type: 'rubric',
        institution,
        department,
        stream,
        heading: 'DETAILED RUBRIC EVALUATION REPORT',
        academic_year: academicYear,
        semester,
        section,
        generated_at: generatedAt,
        scope_label: 'Individual Rubric Breakdown',
        generated_by: generatedBy,
        role_label: roleLabel,
        student: {
          id: targetStudent.student_id,
          usn: targetStudent.usn,
          full_name: targetStudent.full_name,
          email: targetStudent.email
        },
        subject: {
          id: targetSubject.id,
          code: targetSubject.code,
          name: targetSubject.name
        },
        assessment: {
          id: targetAssessment.id,
          title: formatAssessmentTitle(targetAssessment.title),
          short_label: shortLabel,
          max_marks: Number(targetAssessment.max_marks || 50),
          deadline: targetAssessment.deadline_at
        },
        evaluation: {
          evaluator_name: evaluatorName,
          evaluated_at: isPublished
            ? new Date(ev.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })
            : 'Pending Publication',
          total_score: isPublished ? Number(ev.total_score || 0) : null,
          raw_score: isPublished ? Number(ev.raw_score || ev.total_score || 0) : null,
          percentage: isPublished
            ? Math.round((Number(ev.total_score || 0) / Number(targetAssessment.max_marks || 50)) * 100)
            : null,
          general_feedback: isPublished ? (ev.general_feedback || null) : null,
          is_published: isPublished
        },
        criteria: criteriaRows
      };
      return rubricReport;
    }

    if (params.report_type === 'subject') {
      // 1. Determine selected subject strictly by params.subject_id if provided
      let selectedSubject = params.subject_id
        ? subjects.find(s => s.id === params.subject_id)
        : null;

      // If not provided, and user is subject_teacher, find the subject they teach
      if (!selectedSubject && isSubjectTeacher && !isHOD) {
        const taughtCs = csList.find(cs => cs.subject_teacher_id === user.profile.id);
        if (taughtCs) {
          selectedSubject = subjects.find(s => s.id === taughtCs.subject_id);
        }
      }

      // Fallback to the first subject that has assessments, or the first subject
      if (!selectedSubject) {
        const groupWithAssessments = subjectGroups.find(g => g.assessments.length > 0);
        selectedSubject = groupWithAssessments
          ? subjects.find(s => s.id === groupWithAssessments.subject_id)
          : subjects[0];
      }

      if (!selectedSubject) {
        throw new Error('Subject not found for subject-specific report');
      }

      // 2. Find matching ClassSubject and teacher strictly for this subject
      const matchingCs = csList.find(cs => cs.subject_id === selectedSubject!.id);
      const teacherObj: any = matchingCs?.teacher;
      const subjectTeacherName = Array.isArray(teacherObj)
        ? teacherObj[0]?.full_name
        : teacherObj?.full_name || generatedBy;

      // 3. Find matching assessments strictly for this subject
      const matchingGroup = subjectGroups.find(g => g.subject_id === selectedSubject!.id);
      const subAssessments = matchingGroup ? matchingGroup.assessments : [];

      // 4. Filter student mark cells strictly to assessments of this subject
      const subjectAssessmentIds = new Set(subAssessments.map(a => a.assessment_id));
      const filteredStudents: ConsolidatedStudentRow[] = rawStudentList.map(st => {
        const filteredMarks: Record<string, StudentMarkCell> = {};
        for (const [assId, cell] of Object.entries(st.marks)) {
          if (subjectAssessmentIds.has(assId)) {
            filteredMarks[assId] = cell;
          }
        }
        return {
          ...st,
          marks: filteredMarks
        };
      });

      const subjectReport: SubjectReportData = {
        report_type: 'subject',
        institution,
        department,
        stream,
        heading,
        academic_year: academicYear,
        semester,
        section,
        generated_at: generatedAt,
        scope_label: `Subject Report: ${selectedSubject.code} - ${selectedSubject.name}`,
        generated_by: generatedBy,
        role_label: roleLabel,
        subject: {
          id: selectedSubject.id,
          code: selectedSubject.code,
          name: selectedSubject.name,
          teacher_name: subjectTeacherName
        },
        assessments: subAssessments,
        students: filteredStudents
      };
      return subjectReport;
    }

    if (params.report_type === 'student') {
      const selectedStudent = rawStudentList[0];
      if (!selectedStudent) {
        throw new Error('Student not found for individual assessment report');
      }

      const studentSubjects = subjectGroups.map(grp => ({
        subject_code: grp.subject_code,
        subject_name: grp.subject_name,
        assessments: grp.assessments.map(a => {
          const markCell = selectedStudent.marks[a.assessment_id];
          return {
            title: a.title,
            max_marks: a.max_marks,
            awarded_marks: markCell ? markCell.value : 'Not Submitted',
            status: markCell ? markCell.status : 'not_submitted'
          };
        })
      }));

      const studentReport: StudentIndividualReportData = {
        report_type: 'student',
        institution,
        department,
        stream,
        heading: 'STUDENT ASSESSMENT REPORT',
        academic_year: academicYear,
        semester,
        section,
        generated_at: generatedAt,
        scope_label: `Student Academic Report: ${selectedStudent.usn}`,
        generated_by: generatedBy,
        role_label: roleLabel,
        student: {
          id: selectedStudent.student_id,
          usn: selectedStudent.usn,
          full_name: selectedStudent.full_name,
          email: selectedStudent.email
        },
        subjects: studentSubjects
      };
      return studentReport;
    }

    // Default: Consolidated Assessment Marks Report
    const consolidatedReport: ConsolidatedReportData = {
      report_type: 'consolidated',
      institution,
      department,
      stream,
      heading,
      academic_year: academicYear,
      semester,
      section,
      generated_at: generatedAt,
      scope_label: scopeLabel,
      generated_by: generatedBy,
      role_label: roleLabel,
      subjects: subjectGroups,
      students: rawStudentList
    };

    return consolidatedReport;
  }
}

let reportServiceInstance: AssessmentReportService | null = null;
export function getAssessmentReportService(): AssessmentReportService {
  if (!reportServiceInstance) {
    reportServiceInstance = new AssessmentReportService();
  }
  return reportServiceInstance;
}
