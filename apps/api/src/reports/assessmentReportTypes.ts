export type ReportType = 'consolidated' | 'subject' | 'student' | 'rubric';

export interface ReportFilterOptions {
  programmes: Array<{ id: string; code: string; name: string }>;
  specializations: Array<{ id: string; code: string; name: string }>;
  semesters: number[];
  classes: Array<{ id: string; name: string; semester: number; section: string }>;
  subjects: Array<{ id: string; code: string; name: string; credits: number }>;
  assessments: Array<{ id: string; title: string; subject_id: string; max_marks: number }>;
  students: Array<{ id: string; usn: string; full_name: string }>;
}

export interface AssessmentColumn {
  assessment_id: string;
  title: string;
  short_label: string;
  max_marks: number;
  is_published: boolean;
  sequence_number?: number;
}

export interface SubjectColumnGroup {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  assessments: AssessmentColumn[];
}

export interface StudentMarkCell {
  value: number | string | null; // Numeric mark (e.g. 38), 0, 'Not Submitted', or null (blank before publication)
  status: 'published' | 'not_submitted' | 'pending_evaluation' | 'awaiting_publication' | 'not_applicable' | 'missing';
  raw_score?: number | null;
  max_marks?: number;
  submission_id?: string | null;
  evaluation_id?: string | null;
  subject_id?: string;
  assessment_id?: string;
}

export interface ConsolidatedStudentRow {
  sl_no: number;
  student_id: string;
  usn: string;
  full_name: string;
  email?: string;
  marks: Record<string, StudentMarkCell>; // Key is assessment_id
  subject_totals?: Record<string, { total_score: number | null; max_marks: number }>; // Key is subject_id
  total_score?: number | null;
}

export interface ConsolidatedReportData {
  report_type: 'consolidated';
  institution: string;
  department: string;
  stream: string;
  heading: string;
  academic_year: string;
  semester: number;
  section: string;
  generated_at: string;
  scope_label: string;
  generated_by: string;
  role_label: string;
  subjects: SubjectColumnGroup[];
  students: ConsolidatedStudentRow[];
}

export interface SubjectReportData {
  report_type: 'subject';
  institution: string;
  department: string;
  stream: string;
  heading: string;
  academic_year: string;
  semester: number;
  section: string;
  generated_at: string;
  scope_label: string;
  generated_by: string;
  role_label: string;
  subject: {
    id: string;
    code: string;
    name: string;
    teacher_name?: string;
  };
  assessments: AssessmentColumn[];
  students: ConsolidatedStudentRow[];
}

export interface StudentIndividualReportData {
  report_type: 'student';
  institution: string;
  department: string;
  stream: string;
  heading: string;
  academic_year: string;
  semester: number;
  section: string;
  generated_at: string;
  scope_label: string;
  generated_by: string;
  role_label: string;
  student: {
    id: string;
    usn: string;
    full_name: string;
    email?: string;
  };
  subjects: Array<{
    subject_code: string;
    subject_name: string;
    assessments: Array<{
      title: string;
      max_marks: number;
      awarded_marks: number | string | null;
      status: string;
    }>;
  }>;
}

export interface RubricCriterionRow {
  display_order: number;
  title: string;
  description: string;
  max_marks: number;
  awarded_marks: number | null;
  performance_level?: string;
  evaluator_feedback?: string | null;
}

export interface DetailedRubricReportData {
  report_type: 'rubric';
  institution: string;
  department: string;
  stream: string;
  heading: string;
  academic_year: string;
  semester: number;
  section: string;
  generated_at: string;
  scope_label: string;
  generated_by: string;
  role_label: string;
  student: {
    id: string;
    usn: string;
    full_name: string;
    email?: string;
  };
  subject: {
    id?: string;
    code: string;
    name: string;
  };
  assessment: {
    id: string;
    title: string;
    short_label?: string;
    max_marks: number;
    deadline?: string;
  };
  evaluation: {
    evaluator_name: string;
    evaluated_at: string;
    total_score: number | null;
    raw_score: number | null;
    percentage: number | null;
    general_feedback?: string | null;
    is_published: boolean;
  };
  criteria: RubricCriterionRow[];
}

export type AssessmentReportData =
  | ConsolidatedReportData
  | SubjectReportData
  | StudentIndividualReportData
  | DetailedRubricReportData;

