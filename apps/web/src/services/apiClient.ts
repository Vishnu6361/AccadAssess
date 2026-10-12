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
