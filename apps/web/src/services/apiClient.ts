import { 
  Department, 
  AcademicTerm, 
  Subject, 
  Profile, 
  AuditEvent,
  InviteUserRequest,
  CreateDepartmentRequest,
  CreateTermRequest,
  CreateClassRequest,
  CreateSubjectRequest
} from '@smartfa/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

// Synthetic fallback data for seamless offline development
const mockDepartments: Department[] = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    code: 'MCA',
    name: 'Department of Computer Applications',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const mockTerms: AcademicTerm[] = [
  {
    id: 't1000000-0000-0000-0000-000000000001',
    name: 'Autumn 2026',
    starts_on: '2026-08-01',
    ends_on: '2026-12-31',
    active: true,
    created_at: new Date().toISOString()
  }
];

const mockUsers: (Profile & { roles: string[] })[] = [
  {
    id: 'a1000000-0000-0000-0000-000000000001',
    full_name: 'Dr. Rajesh Sharma (HOD)',
    email: 'hod@smartfa.edu',
    status: 'active',
    roles: ['hod'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a2000000-0000-0000-0000-000000000001',
    full_name: 'Prof. Priya Menon',
    email: 'teacher1@smartfa.edu',
    status: 'active',
    roles: ['subject_teacher'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a2000000-0000-0000-0000-000000000002',
    full_name: 'Prof. Arvind Kumar',
    email: 'teacher2@smartfa.edu',
    status: 'active',
    roles: ['class_teacher', 'subject_teacher'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a3000000-0000-0000-0000-000000000001',
    full_name: 'Dr. Suma Rao',
    email: 'proctor@smartfa.edu',
    status: 'active',
    roles: ['proctor'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a4000000-0000-0000-0000-000000000001',
    full_name: 'Aarav Patel',
    email: 'student.a@smartfa.edu',
    usn: '1RV24MC001',
    status: 'active',
    roles: ['student'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a4000000-0000-0000-0000-000000000002',
    full_name: 'Bhavna Reddy',
    email: 'student.b@smartfa.edu',
    usn: '1RV24MC002',
    status: 'active',
    roles: ['student'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a9000000-0000-0000-0000-000000000001',
    full_name: 'Inactive Account',
    email: 'inactive@smartfa.edu',
    usn: '1RV24MC099',
    status: 'inactive',
    roles: ['student'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const mockClasses: any[] = [
  {
    id: 'c1000000-0000-0000-0000-000000000001',
    department_id: 'd1000000-0000-0000-0000-000000000001',
    term_id: 't1000000-0000-0000-0000-000000000001',
    programme: 'MCA',
    semester: 3,
    section: 'A',
    class_teacher_id: 'a2000000-0000-0000-0000-000000000002',
    department_name: 'Department of Computer Applications',
    term_name: 'Autumn 2026',
    class_teacher_name: 'Prof. Arvind Kumar',
    created_at: new Date().toISOString()
  }
];

const mockSubjects: Subject[] = [
  {
    id: 's1000000-0000-0000-0000-000000000001',
    department_id: 'd1000000-0000-0000-0000-000000000001',
    code: 'MCA301',
    name: 'Analysis and Design of Algorithms',
    credits: 4,
    created_at: new Date().toISOString()
  },
  {
    id: 's1000000-0000-0000-0000-000000000002',
    department_id: 'd1000000-0000-0000-0000-000000000001',
    code: 'MCA302',
    name: 'Cloud Computing & Distributed Systems',
    credits: 3,
    created_at: new Date().toISOString()
  }
];

const mockAuditEvents: AuditEvent[] = [
  {
    id: 'ae100000-0000-0000-0000-000000000001',
    actor_id: 'a1000000-0000-0000-0000-000000000001',
    action: 'SYSTEM_INITIALIZED',
    resource_type: 'system',
    resource_id: 'phase_2_baseline',
    before: null,
    after: { note: 'Initial academic baseline seeded' },
    correlation_id: 'c0000000-0000-0000-0000-000000000001',
    created_at: new Date(Date.now() - 3600000).toISOString()
  }
];

export const hodApi = {
  getDepartments: async (): Promise<Department[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/departments`);
      if (res.ok) {
        const data = await res.json();
        return data.departments;
      }
    } catch {}
    return mockDepartments;
  },

  createDepartment: async (payload: CreateDepartmentRequest): Promise<Department> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        return data.department;
      }
    } catch {}
    const newDept: Department = {
      id: `d-${Date.now()}`,
      code: payload.code,
      name: payload.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockDepartments.push(newDept);
    return newDept;
  },

  getTerms: async (): Promise<AcademicTerm[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/terms`);
      if (res.ok) {
        const data = await res.json();
        return data.terms;
      }
    } catch {}
    return mockTerms;
  },

  createTerm: async (payload: CreateTermRequest): Promise<AcademicTerm> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/terms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        return data.term;
      }
    } catch {}
    const newTerm: AcademicTerm = {
      id: `t-${Date.now()}`,
      name: payload.name,
      starts_on: payload.starts_on,
      ends_on: payload.ends_on,
      active: payload.active,
      created_at: new Date().toISOString()
    };
    mockTerms.push(newTerm);
    return newTerm;
  },

  getClasses: async (): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/classes`);
      if (res.ok) {
        const data = await res.json();
        return data.classes;
      }
    } catch {}
    return mockClasses;
  },

  createClass: async (payload: CreateClassRequest): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        return data.class;
      }
    } catch {}
    const newCls = {
      id: `c-${Date.now()}`,
      ...payload,
      department_name: 'Department of Computer Applications',
      term_name: 'Autumn 2026',
      class_teacher_name: 'Assigned Staff',
      created_at: new Date().toISOString()
    };
    mockClasses.push(newCls);
    return newCls;
  },

  getSubjects: async (): Promise<Subject[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/subjects`);
      if (res.ok) {
        const data = await res.json();
        return data.subjects;
      }
    } catch {}
    return mockSubjects;
  },

  createSubject: async (payload: CreateSubjectRequest): Promise<Subject> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        return data.subject;
      }
    } catch {}
    const newSub: Subject = {
      id: `s-${Date.now()}`,
      department_id: payload.department_id,
      code: payload.code,
      name: payload.name,
      credits: payload.credits,
      created_at: new Date().toISOString()
    };
    mockSubjects.push(newSub);
    return newSub;
  },

  getUsers: async (): Promise<(Profile & { roles: string[] })[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/users`);
      if (res.ok) {
        const data = await res.json();
        return data.users;
      }
    } catch {}
    return mockUsers;
  },

  inviteUser: async (payload: InviteUserRequest): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        return data.user;
      }
    } catch {}
    const newUser = {
      id: `u-${Date.now()}`,
      full_name: payload.full_name,
      email: payload.email,
      usn: payload.usn || null,
      status: 'active' as const,
      roles: [payload.role],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockUsers.push(newUser);
    return newUser;
  },

  updateUserStatus: async (userId: string, status: 'active' | 'inactive'): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const data = await res.json();
        return data.user;
      }
    } catch {}
    const target = mockUsers.find(u => u.id === userId);
    if (target) {
      target.status = status;
    }
    return target;
  },

  getAuditEvents: async (): Promise<AuditEvent[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hod/audit`);
      if (res.ok) {
        const data = await res.json();
        return data.events;
      }
    } catch {}
    return mockAuditEvents;
  }
};

/**
 * ==============================================================================
 * Assessment & Rubric Management API
 * ==============================================================================
 */

export interface AssessmentDTO {
  id: string;
  class_subject_id: string;
  title: string;
  instructions: string;
  deadline_at: string;
  status: 'draft' | 'published' | 'closed' | 'archived';
  created_by: string;
  published_at?: string | null;
  version: number;
  class_details?: string;
  subject_details?: string;
  questions?: any[];
}

const mockAssessments: AssessmentDTO[] = [
  {
    id: 'as100000-0000-0000-0000-000000000001',
    class_subject_id: 'c5100000-0000-0000-0000-000000000001',
    title: 'Formative Assessment 1: Algorithm Analysis',
    instructions: 'Handwrite answers on plain paper, scan as PDF, and submit before deadline. 5 MB limit per question.',
    deadline_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    status: 'draft',
    created_by: 'a2000000-0000-0000-0000-000000000001',
    published_at: null,
    version: 1,
    class_details: 'MCA Sem 3-A',
    subject_details: 'MCA301 - Analysis and Design of Algorithms',
    questions: [
      {
        id: 'q1000000-0000-0000-0000-000000000001',
        assessment_id: 'as100000-0000-0000-0000-000000000001',
        display_order: 1,
        prompt: 'Explain Time Complexity of QuickSort in Best, Average, and Worst Case scenarios with recurrence trees.',
        max_marks: 10,
        rubric: {
          id: 'rv100000-0000-0000-0000-000000000001',
          version: 1,
          title: 'QuickSort Complexity Rubric',
          frozen_at: null,
          criteria: [
            {
              id: 'rc100000-0000-0000-0000-000000000001',
              display_order: 1,
              title: 'Recurrence Formulation',
              description: 'Clear formulation of T(n) relations',
              max_marks: 6,
              levels: [
                { id: 'rl1', display_order: 1, label: 'Excellent', description: 'Accurate mathematical formulation' },
                { id: 'rl2', display_order: 2, label: 'Developing', description: 'Partial formulation' }
              ]
            },
            {
              id: 'rc100000-0000-0000-0000-000000000002',
              display_order: 2,
              title: 'Partitioning & Worst Case Analysis',
              description: 'Demonstration of worst case behavior',
              max_marks: 4,
              levels: [
                { id: 'rl3', display_order: 1, label: 'Excellent', description: 'Clear pivot analysis' },
                { id: 'rl4', display_order: 2, label: 'Insufficient', description: 'Missing pivot reasoning' }
              ]
            }
          ]
        }
      }
    ]
  }
];

export interface GetAssessmentsResult {
  assessments: AssessmentDTO[];
  isOfflineFallback: boolean;
}

export const assessmentApi = {
  getAssessments: async (): Promise<GetAssessmentsResult> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments`);
      if (res.ok) {
        const data = await res.json();
        return { assessments: data.assessments, isOfflineFallback: false };
      }
    } catch {}
    return { assessments: mockAssessments, isOfflineFallback: true };
  },

  getAssessment: async (id: string): Promise<AssessmentDTO | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/${id}`);
      if (res.ok) {
        const data = await res.json();
        return data.assessment;
      }
    } catch {}
    return mockAssessments.find(a => a.id === id) || null;
  },

  createAssessment: async (payload: {
    class_subject_id: string;
    title: string;
    instructions: string;
    deadline_at: string;
  }): Promise<AssessmentDTO> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Server error (${res.status}): Failed to create assessment`);
      }
      return data.assessment;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error('API server is offline (http://localhost:4000). Cannot persist assessment to server.');
      }
      throw err;
    }
  },

  addQuestion: async (assessmentId: string, payload: {
    display_order: number;
    prompt: string;
    max_marks: number;
  }): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Server error (${res.status}): Failed to add question`);
      }
      return data.question;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error('API server is offline (http://localhost:4000). Cannot add question.');
      }
      throw err;
    }
  },

  saveRubric: async (assessmentId: string, questionId: string, payload: {
    title: string;
    criteria: any[];
  }): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/questions/${questionId}/rubric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Server error (${res.status}): Failed to save rubric`);
      }
      return data.rubric;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error('API server is offline (http://localhost:4000). Cannot persist rubric.');
      }
      throw err;
    }
  },

  publishAssessment: async (assessmentId: string): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/assessments/${assessmentId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Publication failed (${res.status})`);
      }
      return data.assessment;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error('API server is offline (http://localhost:4000). Cannot publish assessment.');
      }
      throw err;
    }
  }
};

/**
 * ==============================================================================
 * Phase 4: Student Submissions and Private PDF Storage API
 * ==============================================================================
 */

export interface SubmissionDTO {
  id: string;
  assessment_id: string;
  question_id: string;
  student_id: string;
  student_name?: string;
  student_email?: string;
  student_usn?: string | null;
  active_version_id?: string | null;
  status: string;
  first_submitted_at: string;
  updated_at: string;
  active_version?: any;
  versions?: any[];
}

export const submissionApi = {
  uploadSubmission: async (payload: {
    assessment_id: string;
    question_id: string;
    file_name: string;
    file_base64: string;
  }): Promise<any> => {
    try {
      const res = await fetch(`${API_BASE_URL}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Submission failed (${res.status})`);
      }
      return data.receipt;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error('API server is offline (http://localhost:4000). Cannot submit PDF answer.');
      }
      throw err;
    }
  },

  getSubmissionsForAssessment: async (assessmentId: string): Promise<SubmissionDTO[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/submissions/assessment/${assessmentId}`);
      if (res.ok) {
        const data = await res.json();
        return data.submissions;
      }
    } catch {}
    return [];
  },

  downloadPdfUrl: (submissionId: string, versionId: string): string => {
    return `${API_BASE_URL}/submissions/${submissionId}/versions/${versionId}/download`;
  }
};
