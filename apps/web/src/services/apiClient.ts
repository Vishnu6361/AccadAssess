import { supabase, isSupabaseConfigured } from './supabase';
import {
  Subject,
  Profile,
  AuditEvent,
  ClassSubject,
  Enrollment,
  ProctorAssignment,
  InviteUserRequest,
  UpdateFacultyProfileRequest,
  CreateClassRequest,
  CreateSubjectRequest,
  UpdateSubjectRequest,
  SubjectDependencies,
  AssignClassSubjectRequest,
  EnrollStudentRequest,
  EnrollSpecializationStudentsRequest,
  TransferEnrollmentRequest,
  AssignProctorRequest,
  AssignProctorBulkRequest,
  ReassignProctorRequest,
  ProctorAssignmentWithDetails,
  Programme,
  Specialization,
  CreateProgrammeRequest,
  UpdateProgrammeRequest,
  CreateSpecializationRequest,
  UpdateSpecializationRequest,
  AssignFacultySubjectsRequest,
  MenteeHierarchyItem,
  MenteeSubjectItem,
  MenteeAssessmentItem,
  ProctorSubjectHierarchyItem,
  ProctorSubjectAssessmentItem,
  ProctorAssessmentStudentItem
} from '@smartfa/contracts';

export type { 
  MenteeHierarchyItem, 
  MenteeSubjectItem, 
  MenteeAssessmentItem,
  ProctorSubjectHierarchyItem,
  ProctorSubjectAssessmentItem,
  ProctorAssessmentStudentItem
};

export const PRODUCTION_API_URL = 'https://acadassess-api.onrender.com/api/v1';

function resolveApiBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : undefined) ||
    (typeof process !== 'undefined' && process.env ? process.env.VITE_API_BASE_URL : undefined);

  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    // If running in a browser on a non-localhost domain, prevent accidental localhost fallback
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
      if (!isLocalHost && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
        console.warn(`[apiClient] Overriding localhost API URL (${envUrl}) in production browser (${hostname}) with ${PRODUCTION_API_URL}`);
        return PRODUCTION_API_URL;
      }
    }
    return envUrl.trim().replace(/\/+$/, '');
  }

  // If no env variable is provided:
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (!isLocalHost) {
      return PRODUCTION_API_URL;
    }
  }

  return 'http://localhost:4000/api/v1';
}

const API_BASE_URL = resolveApiBaseUrl();
export const getApiBaseUrl = (): string => API_BASE_URL;

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

/**
 * Fetch wrapper with strict timeout support using AbortController.
 * Prevents requests from hanging indefinitely (e.g. Render free-tier cold starts).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  if (init?.signal) {
    init.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const rawFetch = (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : globalThis.fetch;
    const res = await rawFetch(input, {
      ...init,
      signal: controller.signal
    });
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      const timeoutErr: any = new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. The backend server may be waking up from sleep. Please retry.`
      );
      timeoutErr.code = 'TIMEOUT';
      timeoutErr.status = 504;
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let cachedAuthHeaderValue: string | null = null;
let cachedAuthHeaderExpiresAt = 0;
let activeWorkspaceRole: string | null = null;

let cachedUserContext: { ctx: UserAuthContext; expiresAt: number; token: string } | null = null;
const USER_CONTEXT_STORAGE_KEY = 'smartfa_cached_user_context';

export const getCachedUserContext = (): UserAuthContext | null => {
  if (cachedUserContext && Date.now() < cachedUserContext.expiresAt) {
    return cachedUserContext.ctx;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const raw = window.sessionStorage.getItem(USER_CONTEXT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.expiresAt && Date.now() < parsed.expiresAt && parsed.ctx) {
          cachedUserContext = parsed;
          return parsed.ctx;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
};

export const setCachedUserContext = (ctx: UserAuthContext, token: string, ttlMs = 60000) => {
  const entry = {
    ctx,
    expiresAt: Date.now() + ttlMs,
    token
  };
  cachedUserContext = entry;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(USER_CONTEXT_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // ignore
    }
  }
};

export const clearUserContextCache = () => {
  cachedUserContext = null;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(USER_CONTEXT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
};

export const setActiveWorkspaceRole = (role: string | null) => {
  activeWorkspaceRole = role;
};

export const getActiveWorkspaceRole = (): string | null => {
  if (activeWorkspaceRole) return activeWorkspaceRole;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage.getItem('smartfa_active_workspace');
  }
  return null;
};

export const clearAuthHeaderCache = () => {
  cachedAuthHeaderValue = null;
  cachedAuthHeaderExpiresAt = 0;
  clearUserContextCache();
};

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const currentRole = getActiveWorkspaceRole();
  if (currentRole) {
    headers['x-active-role'] = currentRole;
  }

  if (cachedAuthHeaderValue && Date.now() < cachedAuthHeaderExpiresAt) {
    headers['Authorization'] = cachedAuthHeaderValue;
    return headers;
  }

  try {
    // 1. Prioritize active Supabase authenticated session
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        cachedAuthHeaderValue = `Bearer ${session.access_token}`;
        cachedAuthHeaderExpiresAt = Date.now() + 30000;
        headers['Authorization'] = cachedAuthHeaderValue;
        return headers;
      }
    }

    // 2. Fall back to local development mock token only if no active Supabase session
    const devToken = localStorage.getItem('smartfa_dev_token');
    if (devToken) {
      cachedAuthHeaderValue = `Bearer ${devToken}`;
      cachedAuthHeaderExpiresAt = Date.now() + 30000;
      headers['Authorization'] = cachedAuthHeaderValue;
      return headers;
    }
  } catch {
    // ignore
  }
  return headers;
};

export interface UserAuthContext {
  user: {
    id: string;
    email: string;
  };
  profile: {
    id: string;
    email: string;
    full_name: string;
    status: string;
  };
  roles: string[];
  isHOD: boolean;
}

export const authApi = {
  getMe: async (force = false): Promise<UserAuthContext> => {
    const authHeaders = await getAuthHeaders();
    const token = authHeaders['Authorization'];
    if (!token) {
      const err: any = new Error('No authentication session found.');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }

    if (!force) {
      const cached = getCachedUserContext();
      if (cached && cachedUserContext?.token === token) {
        return cached;
      }
    }

    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: authHeaders
    }, 8000);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      clearAuthHeaderCache();
      const message = data.error?.message || data.message || `Authentication failed (${res.status})`;
      const code = data.error?.code || 'AUTH_ERROR';
      const error: any = new Error(message);
      error.code = code;
      error.status = res.status;
      throw error;
    }
    const userCtx = data as UserAuthContext;
    setCachedUserContext(userCtx, token);
    return userCtx;
  },

  verifyPortal: async (portal: 'student' | 'faculty' | 'admin'): Promise<{ authorized: boolean; portal: string; profile: any; roles: string[]; isHOD?: boolean; activeRole?: string }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/verify-portal`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ portal })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        clearAuthHeaderCache();
      }
      const message = data.error?.message || `Portal verification failed (${res.status})`;
      const err: any = new Error(message);
      err.code = data.error?.code || 'PORTAL_ACCESS_DENIED';
      err.recommendedPortal = data.error?.recommendedPortal;
      err.status = res.status;
      throw err;
    }
    return data;
  },

  confirmPassword: async (password: string, assessmentId?: string): Promise<{ confirmed: boolean; reauth_token: string; expires_in: number }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/confirm-password`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, assessment_id: assessmentId, purpose: 'assignment_deletion' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error?.message || `Password confirmation failed (${res.status})`;
      const err: any = new Error(message);
      err.code = data.error?.code || 'AUTH_ERROR';
      err.status = res.status;
      throw err;
    }
    return data;
  },

  demoLogin: async (email: string): Promise<{ token: string; user: any; profile: any; roles: string[]; isHOD: boolean }> => {
    const res = await fetchWithTimeout(`${API_BASE_URL}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Demo login failed');
    }
    localStorage.setItem('smartfa_dev_token', data.token);
    return data;
  },

  logout: async (): Promise<void> => {
    try {
      const authHeaders = await getAuthHeaders();
      if (authHeaders['Authorization']) {
        await fetchWithTimeout(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: authHeaders
        }, 3000);
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      clearAuthHeaderCache();
      clearUserContextCache();
    }
  }
};


const mockProgrammes: Programme[] = [
  {
    id: 'b1000000-0000-4000-8000-000000000001',
    code: 'MCA',
    name: 'Master of Computer Applications',
    duration_years: 2,
    total_semesters: 4,
    status: 'active',
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const mockSpecializations: Specialization[] = [
  {
    id: 'c1000000-0000-4000-8000-000000000001',
    programme_id: 'b1000000-0000-4000-8000-000000000001',
    code: 'CYBER',
    name: 'Cyber Security & Forensics',
    applicable_semesters: [3, 4],
    semesters: [3, 4],
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    programme_id: 'b1000000-0000-4000-8000-000000000001',
    code: 'AIDS',
    name: 'Artificial Intelligence & Data Science',
    applicable_semesters: [3, 4],
    semesters: [3, 4],
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
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
    id: '03000000-0000-4000-8000-000000000001',
    programme: 'MCA',
    semester: 3,
    section: 'A',
    class_teacher_id: 'a2000000-0000-0000-0000-000000000002',
    class_teacher_name: 'Prof. Arvind Kumar',
    created_at: new Date().toISOString()
  }
];

const mockSubjects: Subject[] = [
  {
    id: '02000000-0000-4000-8000-000000000001',
    code: 'MCA301',
    name: 'Analysis and Design of Algorithms',
    credits: 4,
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: '02000000-0000-4000-8000-000000000002',
    code: 'MCA302',
    name: 'Cloud Computing & Distributed Systems',
    credits: 3,
    active: true,
    created_at: new Date().toISOString()
  }
];

const mockEnrollments: any[] = [
  {
    id: '04000000-0000-4000-8000-000000000001',
    class_id: '03000000-0000-4000-8000-000000000001',
    student_id: 'a4000000-0000-0000-0000-000000000001',
    student_name: 'Aarav Patel',
    student_email: 'student.a@smartfa.edu',
    student_usn: '1RV24MC001',
    roll_number: '1RV24MC001',
    status: 'active',
    created_at: new Date().toISOString()
  }
];

const mockProctorAssignments: any[] = [
  {
    id: '05000000-0000-4000-8000-000000000001',
    class_id: '03000000-0000-4000-8000-000000000001',
    student_id: 'a4000000-0000-0000-0000-000000000001',
    student_name: 'Aarav Patel',
    student_usn: '1RV24MC001',
    proctor_id: 'a3000000-0000-0000-0000-000000000001',
    proctor_name: 'Dr. Suma Rao',
    valid_from: '2026-08-01',
    valid_to: null,
    created_at: new Date().toISOString()
  }
];

const mockAuditEvents: AuditEvent[] = [
  {
    id: '06000000-0000-4000-8000-000000000001',
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

interface CatalogCacheEntry<T> {
  data: T;
  expiresAt: number;
}

const clientCatalogCache = new Map<string, CatalogCacheEntry<any>>();
const inFlightGetRequests = new Map<string, Promise<any>>();
const CATALOG_PATHS = new Set([
  '/admin/hod/programmes',
  '/admin/hod/specializations',
  '/admin/hod/terms',
  '/admin/hod/classes'
]);

export const invalidateClientCatalogCache = (prefix?: string) => {
  if (prefix) {
    for (const key of clientCatalogCache.keys()) {
      if (key.startsWith(prefix)) {
        clientCatalogCache.delete(key);
      }
    }
  } else {
    clientCatalogCache.clear();
  }
};

const executeApiRequest = async <T>(
  path: string,
  options: RequestInit = {},
  fallback: () => T
): Promise<T> => {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const basePath = path.split('?')[0];

  // 1. Check client catalog cache for GET requests
  if (isGet && CATALOG_PATHS.has(basePath)) {
    const cached = clientCatalogCache.get(path);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
  }

  // 2. In-flight request deduplication for concurrent identical GET requests
  if (isGet) {
    const inFlight = inFlightGetRequests.get(path);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const requestPromise = (async () => {
    const authHeaders = await getAuthHeaders();
    const headers = {
      ...authHeaders,
      ...(options.headers || {})
    };

    let res: Response;
    try {
      res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
        ...options,
        headers
      });
    } catch (err: any) {
      const isProd = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PROD : process.env.NODE_ENV === 'production';
      if (isProd || isSupabaseConfigured) {
        throw new Error(`API server is unreachable (${API_BASE_URL}): ${err.message || 'Network error'}`);
      }
      // In dev mode when offline and Supabase is not configured, use fallback with warning
      console.warn(`[SmartFA apiClient] API unreachable at ${path}. Using dev fallback.`);
      return fallback();
    }

    if (!res.ok) {
      let errorMsg = `Server error (${res.status}): ${res.statusText}`;
      try {
        const data = await res.json();
        if (data.error) {
          errorMsg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
        } else if (data.message) {
          errorMsg = data.message;
        }
      } catch { }
      throw new Error(errorMsg);
    }

    const json = await res.json();

    // Cache catalog GET responses for 30 seconds
    if (isGet && CATALOG_PATHS.has(basePath)) {
      clientCatalogCache.set(path, {
        data: json,
        expiresAt: Date.now() + 30000
      });
    }

    return json as T;
  })();

  if (isGet) {
    inFlightGetRequests.set(path, requestPromise);
    requestPromise.finally(() => {
      inFlightGetRequests.delete(path);
    });
  }

  return requestPromise;
};

export const hodApi = {
  getProgrammes: async (): Promise<Programme[]> => {
    const data = await executeApiRequest<{ programmes: Programme[] }>(
      '/admin/hod/programmes',
      { method: 'GET' },
      () => ({ programmes: mockProgrammes })
    );
    return data.programmes;
  },

  getProgramme: async (id: string): Promise<Programme> => {
    const data = await executeApiRequest<{ programme: Programme }>(
      `/admin/hod/programmes/${id}`,
      { method: 'GET' },
      () => {
        const p = mockProgrammes.find(item => item.id === id) || mockProgrammes[0];
        return { programme: p };
      }
    );
    return data.programme;
  },

  createProgramme: async (payload: CreateProgrammeRequest): Promise<Programme> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/programmes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to create programme (${res.status})`);
    }
    return data.programme;
  },

  updateProgramme: async (id: string, payload: UpdateProgrammeRequest): Promise<Programme> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/programmes/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to update programme (${res.status})`);
    }
    return data.programme;
  },

  getSpecializations: async (programmeId?: string): Promise<Specialization[]> => {
    const query = programmeId ? `?programme_id=${encodeURIComponent(programmeId)}` : '';
    const data = await executeApiRequest<{ specializations: Specialization[] }>(
      `/admin/hod/specializations${query}`,
      { method: 'GET' },
      () => ({
        specializations: programmeId
          ? mockSpecializations.filter(s => s.programme_id === programmeId)
          : mockSpecializations
      })
    );
    return data.specializations;
  },

  getSpecialization: async (id: string): Promise<Specialization> => {
    const data = await executeApiRequest<{ specialization: Specialization }>(
      `/admin/hod/specializations/${id}`,
      { method: 'GET' },
      () => {
        const s = mockSpecializations.find(item => item.id === id) || mockSpecializations[0];
        return { specialization: s };
      }
    );
    return data.specialization;
  },

  createSpecialization: async (payload: CreateSpecializationRequest): Promise<Specialization> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/specializations`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to create specialization (${res.status})`);
    }
    return data.specialization;
  },

  updateSpecialization: async (id: string, payload: UpdateSpecializationRequest): Promise<Specialization> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/specializations/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to update specialization (${res.status})`);
    }
    return data.specialization;
  },

  getSpecializationSubjects: async (id: string, semester?: number): Promise<Subject[]> => {
    const query = semester ? `?semester=${encodeURIComponent(semester)}` : '';
    const data = await executeApiRequest<{ subjects: Subject[] }>(
      `/admin/hod/specializations/${id}/subjects${query}`,
      { method: 'GET' },
      () => ({ subjects: [] })
    );
    return data.subjects;
  },

  addSubjectToSpecialization: async (specializationId: string, payload: { subject_id: string; semester?: number }): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/specializations/${specializationId}/subjects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to add subject to specialization (${res.status})`);
    }
    return data;
  },

  getAvailableSubjectsForFaculty: async (params: {
    facultyId: string;
    programmeId: string;
    specializationId?: string | null;
    semester: number;
  }): Promise<Subject[]> => {
    const authHeaders = await getAuthHeaders();
    const query = new URLSearchParams({
      programme_id: params.programmeId,
      specialization_id: params.specializationId || '',
      semester: String(params.semester)
    });
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/faculty/${params.facultyId}/available-subjects?${query.toString()}`, {
      method: 'GET',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to fetch available subjects (${res.status})`);
    }
    return data.subjects || [];
  },

  assignFacultySubjects: async (facultyId: string, payload: AssignFacultySubjectsRequest): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/faculty/${facultyId}/assign-subjects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to assign faculty subjects (${res.status})`);
    }
    return data;
  },

  removeFacultyAllocation: async (facultyId: string, allocationId: string): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/faculty/${facultyId}/allocations/${allocationId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to remove faculty allocation (${res.status})`);
    }
    return data;
  },

  getFacultyAllocations: async (facultyId?: string): Promise<any[]> => {
    const query = facultyId ? `?faculty_id=${encodeURIComponent(facultyId)}` : '';
    const data = await executeApiRequest<{ allocations: any[] }>(
      `/admin/hod/faculty-allocations${query}`,
      { method: 'GET' },
      () => ({ allocations: [] })
    );
    return data.allocations;
  },

  getTerms: async (): Promise<any[]> => {
    return [];
  },


  getClasses: async (): Promise<any[]> => {
    const data = await executeApiRequest<{ classes: any[] }>(
      '/admin/hod/classes',
      { method: 'GET' },
      () => ({ classes: mockClasses })
    );
    return data.classes;
  },

  createClass: async (payload: CreateClassRequest): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/classes`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to create class batch (${res.status})`);
    }
    return data.class;
  },

  getSubjects: async (params?: { programme_id?: string; specialization_id?: string; semester?: number; status?: string; search?: string }): Promise<Subject[]> => {
    const q = new URLSearchParams();
    if (params?.programme_id) q.set('programme_id', params.programme_id);
    if (params?.specialization_id) q.set('specialization_id', params.specialization_id);
    if (params?.semester) q.set('semester', params.semester.toString());
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const query = q.toString() ? `?${q.toString()}` : '';
    const data = await executeApiRequest<{ subjects: Subject[] }>(
      `/admin/hod/subjects${query}`,
      { method: 'GET' },
      () => ({ subjects: mockSubjects })
    );
    return data.subjects;
  },

  getSubject: async (id: string): Promise<Subject> => {
    const data = await executeApiRequest<{ subject: Subject }>(
      `/admin/hod/subjects/${id}`,
      { method: 'GET' },
      () => {
        const s = mockSubjects.find(item => item.id === id) || mockSubjects[0];
        return { subject: s };
      }
    );
    return data.subject;
  },

  getSubjectDependencies: async (id: string): Promise<SubjectDependencies> => {
    const data = await executeApiRequest<{ dependencies: SubjectDependencies }>(
      `/admin/hod/subjects/${id}/dependencies`,
      { method: 'GET' },
      () => ({
        dependencies: {
          subject_id: id,
          has_dependencies: false,
          class_subjects_count: 0,
          assessments_count: 0,
          submissions_count: 0,
          details: []
        }
      })
    );
    return data.dependencies;
  },

  createSubject: async (payload: CreateSubjectRequest): Promise<Subject> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/subjects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to create subject (${res.status})`);
    }
    return data.subject;
  },

  updateSubject: async (id: string, payload: UpdateSubjectRequest): Promise<Subject> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/subjects/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to update subject (${res.status})`);
      err.code = data.error?.code;
      err.dependencies = data.dependencies || data.error?.dependencies;
      throw err;
    }
    return data.subject;
  },

  deleteSubject: async (id: string, unassignAllocations?: boolean): Promise<{ success: boolean; message: string }> => {
    const authHeaders = await getAuthHeaders();
    const query = unassignAllocations ? '?unassign_allocations=true' : '';
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/subjects/${id}${query}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to delete subject (${res.status})`);
      err.code = data.error?.code;
      err.dependencies = data.dependencies || data.error?.dependencies;
      throw err;
    }
    return data;
  },

  unassignSubjectAllocations: async (subjectId: string): Promise<{ success: boolean; count: number; message: string }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/subjects/${subjectId}/allocations`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to unassign allocations (${res.status})`);
      err.code = data.error?.code;
      err.dependencies = data.dependencies || data.error?.dependencies;
      throw err;
    }
    return data;
  },

  getClassSubjects: async (classId?: string): Promise<any[]> => {
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    const data = await executeApiRequest<{ class_subjects: any[] }>(
      `/admin/hod/class-subjects${query}`,
      { method: 'GET' },
      () => ({ class_subjects: [] })
    );
    return data.class_subjects;
  },

  assignClassSubject: async (payload: AssignClassSubjectRequest): Promise<ClassSubject> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/class-subjects`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to assign teacher to subject (${res.status})`);
    }
    return data.class_subject;
  },

  getEnrollments: async (classId?: string, specializationId?: string): Promise<any[]> => {
    const params = new URLSearchParams();
    if (classId) params.set('class_id', classId);
    if (specializationId) params.set('specialization_id', specializationId);
    const query = params.toString() ? `?${params.toString()}` : '';
    const data = await executeApiRequest<{ enrollments: any[] }>(
      `/admin/hod/enrollments${query}`,
      { method: 'GET' },
      () => ({ enrollments: mockEnrollments })
    );
    return data.enrollments;
  },

  enrollStudent: async (payload: EnrollStudentRequest): Promise<Enrollment> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/enrollments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to enroll student (${res.status})`);
    }
    return data.enrollment;
  },

  enrollSpecializationStudents: async (payload: EnrollSpecializationStudentsRequest): Promise<{ success: boolean; count: number; enrollments: any[] }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/enrollments/specialization`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to enroll students (${res.status})`);
      err.code = data.error?.code;
      err.conflicts = data.error?.conflicts;
      err.duplicate_students = data.error?.duplicate_students;
      throw err;
    }
    return data;
  },

  transferEnrollment: async (payload: TransferEnrollmentRequest): Promise<{ success: boolean; enrollment: any }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/enrollments/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to transfer student enrollment (${res.status})`);
    }
    return data;
  },

  deleteEnrollment: async (id: string): Promise<boolean> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/enrollments/${id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to delete enrollment (${res.status})`);
    }
    return true;
  },

  getProctorAssignments: async (classId?: string): Promise<ProctorAssignmentWithDetails[]> => {
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    const data = await executeApiRequest<{ proctor_assignments: ProctorAssignmentWithDetails[] }>(
      `/admin/hod/proctor-assignments${query}`,
      { method: 'GET' },
      () => ({ proctor_assignments: mockProctorAssignments })
    );
    return data.proctor_assignments;
  },

  assignProctor: async (payload: AssignProctorRequest): Promise<ProctorAssignment> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/proctor-assignments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to assign proctor (${res.status})`);
    }
    return data.proctor_assignment;
  },

  assignProctorBulk: async (payload: AssignProctorBulkRequest): Promise<{ count: number; assignments: any[] }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/proctor-assignments/bulk`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to bulk assign proctors (${res.status})`);
      err.code = data.error?.code;
      err.conflicts = data.error?.conflicts;
      throw err;
    }
    return data;
  },

  reassignProctor: async (payload: ReassignProctorRequest): Promise<{ assignment: any }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/proctor-assignments/reassign`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to reassign proctor (${res.status})`);
    }
    return data;
  },

  getUsers: async (): Promise<(Profile & { roles: string[] })[]> => {
    const data = await executeApiRequest<{ users: (Profile & { roles: string[] })[] }>(
      '/admin/hod/users',
      { method: 'GET' },
      () => ({ users: mockUsers })
    );
    return data.users;
  },

  inviteUser: async (payload: InviteUserRequest): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/invite`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to invite user (${res.status})`);
      err.code = data.error?.code;
      throw err;
    }
    return data.user;
  },

  updateUserStatus: async (userId: string, status: 'active' | 'inactive'): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/${userId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to update user status (${res.status})`);
    }
    return data.user;
  },

  updateFacultyProfile: async (userId: string, payload: UpdateFacultyProfileRequest): Promise<{ success: boolean; message: string; user: any }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/${userId}/profile`, {
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error?.message || data.message || `Failed to update faculty profile (${res.status})`;
      const err: any = new Error(message);
      err.code = data.error?.code;
      err.status = res.status;
      throw err;
    }

    // Keep local mock in sync if present
    const idx = mockUsers.findIndex(u => u.id === userId);
    if (idx >= 0 && data.user) {
      mockUsers[idx] = { ...mockUsers[idx], ...data.user };
    }

    return data;
  },

  deleteStudent: async (studentId: string): Promise<{ success: boolean; deleted_student_id: string; message: string }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/${studentId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data.error?.message || data.error || `Failed to delete student (${res.status})`);
      err.code = data.error?.code;
      err.status = res.status;
      throw err;
    }
    const idx = mockUsers.findIndex(u => u.id === studentId);
    if (idx >= 0) {
      mockUsers.splice(idx, 1);
    }
    return data;
  },

  getUserAssignments: async (userId: string): Promise<{
    user: Profile;
    roles: string[];
    class_subjects: any[];
    class_teacher_classes: any[];
    proctor_assignments: any[];
    allocations?: any[];
  }> => {
    const data = await executeApiRequest<{
      user: Profile;
      roles: string[];
      class_subjects: any[];
      class_teacher_classes: any[];
      proctor_assignments: any[];
      allocations?: any[];
    }>(
      `/admin/hod/users/${userId}/assignments`,
      { method: 'GET' },
      () => {
        const u = mockUsers.find(mu => mu.id === userId) || mockUsers[0];
        return {
          user: u,
          roles: u.roles || [],
          class_subjects: [],
          class_teacher_classes: mockClasses.filter(c => c.class_teacher_id === userId),
          proctor_assignments: mockProctorAssignments.filter(pa => pa.proctor_id === userId),
          allocations: []
        };
      }
    );
    return data;
  },

  assignUserRole: async (userId: string, role: string, scopeId?: string | null): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/${userId}/roles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ role, scope_id: scopeId || null, active: true })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to assign role (${res.status})`);
    }
    return data.role;
  },

  removeUserRole: async (userId: string, role: string): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/users/${userId}/roles/${role}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to remove role (${res.status})`);
    }
    return data;
  },

  unassignClassSubject: async (classSubjectId: string): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/class-subjects/${classSubjectId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to unassign subject (${res.status})`);
    }
    return data;
  },

  updateClassTeacher: async (classId: string, teacherId: string | null): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/classes/${classId}/class-teacher`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ class_teacher_id: teacherId })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to update class teacher (${res.status})`);
    }
    return data.class;
  },

  removeProctorAssignment: async (assignmentId: string): Promise<any> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/admin/hod/proctor-assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.error || `Failed to remove proctor assignment (${res.status})`);
    }
    return data;
  },

  getAuditEvents: async (params?: { limit?: number; offset?: number }): Promise<AuditEvent[]> => {
    const queryParams = new URLSearchParams();
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) queryParams.set('offset', params.offset.toString());
    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const data = await executeApiRequest<{ events: AuditEvent[] }>(
      `/admin/hod/audit${query}`,
      { method: 'GET' },
      () => ({ events: mockAuditEvents })
    );
    return data.events;
  },

  getInstitutionalSubmissionsReport: async (assessmentId?: string): Promise<any> => {
    const query = assessmentId ? `?assessment_id=${encodeURIComponent(assessmentId)}` : '';
    return executeApiRequest<any>(
      `/admin/hod/institutional-submissions-report${query}`,
      { method: 'GET' },
      () => ({ subjects: [], total_subjects: 0, total_assessments: 0 })
    );
  }
};

export interface InstitutionalSubjectReportItem {
  id?: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  programme: string;
  programme_id?: string | null;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  published_assessments_count: number;
  total_eligible_students: number;
  assessments: InstitutionalAssessmentReportItem[];
}

export interface InstitutionalAssessmentReportItem {
  id: string;
  assessment_id: string;
  title: string;
  instructions?: string;
  max_marks: number;
  deadline_at: string;
  status: string;
  class_subject_id: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  class_id: string;
  class_name: string;
  programme: string;
  programme_id?: string | null;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  total_eligible_students: number;
  submission_count: number;
  pending_count: number;
  evaluated_count: number;
  progress_pct: number;
  evaluation_progress_pct: number;
}

export interface InstitutionalStudentReportItem {
  id: string;
  student_id: string;
  name: string;
  usn: string | null;
  email: string;
  programme: string;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  semester?: number | null;
  class_id?: string;
  class_name?: string;
  is_submitted: boolean;
  submission_status: 'Submitted' | 'Pending';
  submitted_at: string | null;
  timing_status: 'On Time' | 'Late' | '—';
  evaluation_status: string;
  evaluation_status_label: 'Published' | 'Evaluated' | 'Pending Evaluation' | '—';
  score: number | null;
  max_marks: number;
  submission_id?: string | null;
  feedback?: string | null;
  report_row: any;
}

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
  rubric?: any;
  document_storage_key?: string | null;
  document_filename?: string | null;
  document_size_bytes?: number | null;
  document_mime_type?: string | null;
  max_files?: number;
  allow_late?: boolean;
  extension_deadline_at?: string | null;
  late_penalty_mode?: 'none' | 'fixed';
  late_penalty_marks?: number;
  max_marks?: number;
  idempotency_key?: string | null;
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
    class_details: 'MCA Semester 3',
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
  getBaseUrl: (): string => API_BASE_URL,
  getClassSubjectsForTeacher: async (): Promise<any[]> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/teacher/class-subjects`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.class_subjects || [];
      }
    } catch { }
    return [];
  },

  getAssessments: async (): Promise<GetAssessmentsResult> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return { assessments: data.assessments, isOfflineFallback: false };
      }
    } catch { }
    return { assessments: mockAssessments, isOfflineFallback: true };
  },

  getAssessment: async (id: string): Promise<AssessmentDTO | null> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${id}`, {
        headers: authHeaders
      }, 30000);
      if (res.ok) {
        const data = await res.json();
        return data.assessment;
      }
      if (res.status === 404) {
        return null;
      }
      const errData = await res.json().catch(() => null);
      const error: any = new Error(errData?.error?.message || `Failed to fetch assessment (HTTP ${res.status})`);
      error.status = res.status;
      error.code = errData?.error?.code;
      throw error;
    } catch (err: any) {
      if (err.status === 404) return null;
      const fallback = mockAssessments.find(a => a.id === id);
      if (fallback) return fallback;
      throw err;
    }
  },

  downloadDocumentUrl: (assessmentId: string): string => {
    return `${API_BASE_URL}/assessments/${assessmentId}/document`;
  },

  getAuthenticatedDocumentUrl: async (assessmentId: string): Promise<string> => {
    let token = '';
    const devToken = localStorage.getItem('smartfa_dev_token');
    if (devToken) {
      token = devToken;
    } else if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token || '';
    }
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/assessments/${assessmentId}/document${tokenQuery}`;
  },

  fetchDocumentBlob: async (assessmentId: string): Promise<Blob> => {
    const authHeaders = await getAuthHeaders();
    delete authHeaders['Content-Type'];
    const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/document`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        Accept: 'application/pdf'
      }
    }, 35000);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      let userMsg = err?.error?.message;
      if (res.status === 404) {
        userMsg = userMsg || 'Assignment PDF file not found in institutional storage.';
      } else if (res.status === 403 || res.status === 401) {
        userMsg = userMsg || 'Access denied. You are not authorized to view this document.';
      } else {
        userMsg = userMsg || `Failed to fetch document (HTTP ${res.status})`;
      }
      const error: any = new Error(userMsg);
      error.status = res.status;
      error.code = err?.error?.code;
      throw error;
    }
    return res.blob();
  },

  getDocumentUrl: async (assessmentId: string): Promise<{
    storage_key: string;
    filename: string;
    size_bytes: number;
    mime_type: string;
    signed_url: string | null;
    download_url: string;
  } | null> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/document-url`, {
        method: 'GET',
        headers: authHeaders
      }, 30000);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const error: any = new Error(err?.error?.message || `Failed to fetch document metadata (HTTP ${res.status})`);
        error.status = res.status;
        error.code = err?.error?.code;
        throw error;
      }
      const data = await res.json();
      return data.document || null;
    } catch (err: any) {
      console.warn('getDocumentUrl failed:', err.message);
      return null;
    }
  },

  downloadDocument: async (assessmentId: string, filename?: string): Promise<void> => {
    const blob = await assessmentApi.fetchDocumentBlob(assessmentId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'Assignment-Document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  },

  createAssessment: async (payload: {
    class_subject_id: string;
    title: string;
    instructions: string;
    deadline_at: string;
    idempotency_key?: string;
    document_base64?: string;
    document_filename?: string;
    max_files?: number;
    allow_late?: boolean;
    extension_deadline_at?: string | null;
    late_penalty_mode?: 'none' | 'fixed';
    late_penalty_marks?: number;
    max_marks?: number;
    questions?: any[];
    rubric?: any;
  }): Promise<AssessmentDTO> => {
    try {
      const authHeaders = await getAuthHeaders();
      const headers: Record<string, string> = {
        ...authHeaders,
        'Content-Type': 'application/json'
      };
      if (payload.idempotency_key) {
        headers['Idempotency-Key'] = payload.idempotency_key;
      }
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error?.details && Array.isArray(data.error.details) && data.error.details.length > 0
          ? `${data.error.message || 'Validation error'}: ${data.error.details.map((d: any) => `${d.path?.join('.') || 'field'}: ${d.message}`).join('; ')}`
          : (data.error?.message || `Server error (${res.status}): Failed to create assessment`);
        throw new Error(errorMsg);
      }
      return data.assessment;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot persist assessment to server.`);
      }
      throw err;
    }
  },

  addQuestion: async (assessmentId: string, payload: {
    display_order: number;
    prompt: string;
    max_marks?: number;
  }): Promise<any> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/questions`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Server error (${res.status}): Failed to add question`);
      }
      return data.question;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot add question.`);
      }
      throw err;
    }
  },

  saveRubric: async (assessmentId: string, questionId: string, payload: {
    title: string;
    criteria: any[];
  }): Promise<any> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/questions/${questionId}/rubric`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Server error (${res.status}): Failed to save rubric`);
      }
      return data.rubric;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot persist rubric.`);
      }
      throw err;
    }
  },

  publishAssessment: async (assessmentId: string): Promise<any> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/publish`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Publication failed (${res.status})`);
      }
      return data.assessment;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot publish assessment.`);
      }
      throw err;
    }
  },

  updateAssessment: async (assessmentId: string, payload: {
    title?: string;
    instructions?: string;
    deadline_at?: string;
    document_base64?: string;
    document_filename?: string;
    max_files?: number;
    allow_late?: boolean;
    extension_deadline_at?: string | null;
    late_penalty_mode?: 'none' | 'fixed';
    late_penalty_marks?: number;
    max_marks?: number;
    questions?: any[];
    rubric?: any;
  }): Promise<{ assessment: AssessmentDTO; warning?: string | null }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}`, {
        method: 'PUT',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error?.details && Array.isArray(data.error.details) && data.error.details.length > 0
          ? `${data.error.message || 'Validation error'}: ${data.error.details.map((d: any) => `${d.path?.join('.') || 'field'}: ${d.message}`).join('; ')}`
          : (data.error?.message || `Update failed (${res.status})`);
        throw new Error(errorMsg);
      }
      return data;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot update assessment.`);
      }
      throw err;
    }
  },

  checkAssessmentDeletion: async (assessmentId: string): Promise<{
    can_delete: boolean;
    summary?: {
      can_delete: boolean;
      assessment_id: string;
      title: string;
      status: string;
      counts: {
        submissions: number;
        submission_versions: number;
        evaluations: number;
        evaluation_criterion_scores: number;
        questions: number;
        rubric_versions: number;
        rubric_criteria: number;
        result_publications: number;
        storage_files: number;
      };
      storage_keys: string[];
    };
    counts?: {
      submissions: number;
      submission_versions: number;
      evaluations: number;
      evaluation_criterion_scores: number;
      questions: number;
      rubric_versions: number;
      rubric_criteria: number;
      result_publications: number;
      storage_files: number;
    };
    submissions_count: number;
    evaluations_count: number;
    is_published: boolean;
    reason?: string | null;
  }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}/deletion-check`, {
        headers: authHeaders
      });
      if (res.ok) {
        return await res.json();
      }
      const data = await res.json();
      throw new Error(data.error?.message || `Check failed (${res.status})`);
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot check deletion status.`);
      }
      throw err;
    }
  },

  deleteAssessment: async (assessmentId: string, reauthToken?: string): Promise<{ success: boolean; message: string; deleted_counts?: any }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const headers: Record<string, string> = { ...authHeaders };
      if (reauthToken) {
        headers['X-Reauth-Token'] = reauthToken;
      }
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/${assessmentId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Deletion failed (${res.status})`);
      }
      return data;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot delete assessment.`);
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

export interface SubmittedFileDTO {
  id: string;
  storage_key: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  sha256?: string;
  uploaded_at: string;
}

export interface StudentSubmissionDTO {
  id: string;
  assessment_id: string;
  assessment_title: string;
  assessment_instructions?: string;
  max_marks: number;
  deadline_at?: string;
  class_details?: string | null;
  subject_details?: string | null;
  status: string;
  late_status: 'on_time' | 'late';
  first_submitted_at: string;
  updated_at: string;
  version_number: number;
  active_version_id?: string | null;
  files_count: number;
  total_size_bytes: number;
  files: SubmittedFileDTO[];
  evaluation?: {
    id: string;
    status: 'under_evaluation' | 'published';
    total_score?: number;
    raw_score?: number;
    late_penalty_deducted?: number;
    general_feedback?: string | null;
    criterion_scores?: any[];
    updated_at: string;
  } | null;
}

export interface SubmissionDTO {
  id: string;
  assessment_id: string;
  question_id?: string | null;
  student_id: string;
  student_name?: string;
  student_email?: string;
  student_usn?: string | null;
  active_version_id?: string | null;
  status: string;
  late_status?: 'on_time' | 'late';
  first_submitted_at: string;
  updated_at: string;
  active_version?: any;
  versions?: any[];
}

export const submissionApi = {
  uploadSubmission: async (payload: {
    assessment_id: string;
    question_id?: string;
    file_name?: string;
    file_base64?: string;
    files?: Array<{ file_name: string; file_base64: string }>;
  }): Promise<any> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || `Submission failed (${res.status})`);
      }
      return data.receipt;
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        throw new Error(`API server is unreachable (${API_BASE_URL}). Cannot submit answer files.`);
      }
      throw err;
    }
  },

  getSubmissionsForAssessment: async (assessmentId: string): Promise<SubmissionDTO[]> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/assessment/${assessmentId}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.submissions;
      }
    } catch { }
    return [];
  },

  getStudentSubmissionStatus: async (assessmentId: string): Promise<{
    state: 'submitted' | 'not_submitted' | 'error';
    submissions?: SubmissionDTO[];
    error?: string;
  }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/assessment/${assessmentId}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        const subs = data.submissions || [];
        return {
          state: subs.length > 0 ? 'submitted' : 'not_submitted',
          submissions: subs
        };
      }
      return { state: 'error', error: `Server returned status ${res.status}` };
    } catch (err: any) {
      return { state: 'error', error: err.message || 'Network error' };
    }
  },

  downloadPdfUrl: (submissionId: string, versionId: string): string => {
    return `${API_BASE_URL}/submissions/${submissionId}/versions/${versionId}/download`;
  },

  downloadFileUrl: (submissionId: string, versionId: string, fileId: string): string => {
    return `${API_BASE_URL}/submissions/${submissionId}/versions/${versionId}/files/${fileId}/download`;
  },

  getMySubmissions: async (): Promise<StudentSubmissionDTO[]> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/student/my-submissions`, {
      headers: authHeaders
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch submissions (${res.status})`);
    }
    const data = await res.json();
    return data.submissions || [];
  },

  fetchSubmissionFileBlob: async (submissionId: string, versionId: string, fileId: string): Promise<Blob> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/${submissionId}/versions/${versionId}/files/${fileId}/blob`, {
      headers: authHeaders
    });
    if (!res.ok) {
      throw new Error(`Failed to load file preview (${res.status})`);
    }
    return res.blob();
  },

  downloadSubmissionFile: async (submissionId: string, versionId: string, fileId: string, filename?: string): Promise<void> => {
    const blob = await submissionApi.fetchSubmissionFileBlob(submissionId, versionId, fileId);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'submitted_file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  getSubmissionFileUrl: async (submissionId: string, versionId: string, fileId: string): Promise<{
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    signed_url: string | null;
    download_url: string;
  } | null> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/${submissionId}/versions/${versionId}/files/${fileId}/url`, {
        headers: authHeaders
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.file || null;
    } catch {
      return null;
    }
  },

  getSubmissionById: async (submissionId: string): Promise<any> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/${submissionId}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.submission || null;
      }
    } catch { }
    return null;
  },

  getLateSubmissionsReport: async (assessmentId?: string): Promise<any[]> => {
    try {
      const authHeaders = await getAuthHeaders();
      const query = assessmentId ? `?assessment_id=${assessmentId}` : '';
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/reports/late-submissions${query}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.reports || [];
      }
    } catch { }
    return [];
  },

  getMenteeSubmissionsReport: async (): Promise<{ subjects: ProctorSubjectHierarchyItem[]; mentees: MenteeHierarchyItem[]; reports: any[] }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/submissions/reports/late-submissions`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return {
          subjects: data.subjects || [],
          mentees: data.mentees || [],
          reports: data.reports || []
        };
      }
    } catch { }
    return { subjects: [], mentees: [], reports: [] };
  }
};

/**
 * ==============================================================================
 * Class Teacher Workspace API: Authorized Cohort & Monitoring Overview
 * ==============================================================================
 */

export interface ClassTeacherCohortStudentDTO {
  id: string;
  name: string;
  email: string;
  usn: string | null;
  status: string;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
}

export interface ClassTeacherCohortSubjectDTO {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  name?: string;
  specialization_id?: string | null;
  specialization_code?: string | null;
  specialization_name?: string | null;
  subject_teacher_id?: string;
  teacher_name?: string;
}

export interface ClassTeacherCohortDTO {
  id: string;
  name: string;
  programme: string;
  semester: number;
  section: string;
  class_teacher_id: string;
  class_teacher_name: string;
  students_count: number;
  students: ClassTeacherCohortStudentDTO[];
  subjects: ClassTeacherCohortSubjectDTO[];
}

export const classTeacherApi = {
  getCohortOverview: async (classId?: string): Promise<{ classes: ClassTeacherCohortDTO[] }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
      const res = await fetchWithTimeout(`${API_BASE_URL}/assessments/class-teacher/cohort${query}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return { classes: data.classes || [] };
      }
      if (res.status === 403) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error?.message || 'Access to this class cohort is forbidden.');
      }
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error?.message || `Failed to load class cohort (HTTP ${res.status})`);
    } catch (err: any) {
      if (err.message && err.message.includes('forbidden')) {
        throw err;
      }
      console.warn('Class teacher cohort overview fetch error:', err.message);
      return { classes: [] };
    }
  }
};

/**
 * ==============================================================================
 * Phase 5: Teacher Evaluation & Results Publication API
 * ==============================================================================
 */

export interface CriterionScoreDTO {
  id?: string;
  criterion_id: string;
  criterion_title?: string;
  criterion_max_marks?: number;
  selected_level_id?: string | null;
  selected_level?: {
    id: string;
    label: string;
    description: string;
  } | null;
  score: number;
  feedback?: string | null;
}

export interface TeacherAssignmentOverviewDTO {
  id: string;
  title: string;
  max_marks: number;
  deadline_at: string;
  extension_deadline_at?: string | null;
  allow_late: boolean;
  class_details?: string | null;
  subject_details?: string | null;
  class_subject_id: string;
  summary: {
    total_enrolled: number;
    submitted_count: number;
    evaluated_count: number;
    awaiting_count: number;
    is_published: boolean;
    published_count: number;
  };
}

export interface StudentLedgerRowDTO {
  student_id: string;
  student_name: string;
  student_email: string;
  student_usn: string;
  is_submitted: boolean;
  submission_status: 'Submitted' | 'Not Submitted';
  timing_status: 'On Time' | 'Late' | '—';
  is_late: boolean;
  submitted_at: string | null;
  version_number: number;
  files_count: number;
  files: SubmittedFileDTO[];
  evaluation_status: 'not_submitted' | 'pending' | 'draft' | 'completed' | 'published';
  evaluation: {
    id: string;
    status: 'draft' | 'completed' | 'published';
    raw_score?: number;
    late_penalty_deducted?: number;
    total_score?: number;
    general_feedback?: string | null;
    criterion_scores?: Array<{
      criterion_id: string;
      selected_level_id?: string | null;
      score: number;
      feedback?: string | null;
    }>;
    updated_at: string;
  } | null;
  submission: {
    id: string;
    active_version_id?: string | null;
    status: string;
    late_status?: 'on_time' | 'late';
  } | null;
}

export interface AssessmentLedgerResponseDTO {
  assessment: any;
  ledger: StudentLedgerRowDTO[];
  summary: {
    total_enrolled: number;
    submitted_count: number;
    evaluated_count: number;
    awaiting_count: number;
    is_published: boolean;
  };
}

export interface EvaluationDTO {
  id: string;
  submission_id: string;
  submission_version_id: string;
  evaluator_id: string;
  evaluator_name?: string;
  student_name?: string;
  student_email?: string;
  student_usn?: string | null;
  question_prompt?: string;
  question_max_marks?: number;
  max_marks?: number;
  assessment_title?: string;
  status: 'draft' | 'completed' | 'published' | 'revised';
  raw_score?: number;
  late_penalty_deducted?: number;
  total_score: number;
  final_score?: number;
  late_status?: 'on_time' | 'late';
  submitted_at?: string;
  general_feedback?: string | null;
  criterion_scores: CriterionScoreDTO[];
  created_at: string;
  updated_at: string;
}

export const evaluationApi = {
  getTeacherAssignmentsOverview: async (): Promise<TeacherAssignmentOverviewDTO[]> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/teacher/assignments-overview`, {
      headers: authHeaders
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch assignments overview (${res.status})`);
    }
    const data = await res.json();
    return data.assignments || [];
  },

  getAssessmentLedger: async (assessmentId: string): Promise<AssessmentLedgerResponseDTO> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/assessment/${assessmentId}/ledger`, {
      headers: authHeaders
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch assessment ledger (${res.status})`);
    }
    return await res.json();
  },
  getEvaluationsForAssessment: async (assessmentId: string): Promise<{
    assessment_id: string;
    is_published: boolean;
    publication: any;
    evaluations: EvaluationDTO[];
  }> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/assessment/${assessmentId}`, {
        headers: authHeaders
      });
      if (res.ok) {
        return await res.json();
      }
    } catch { }
    return { assessment_id: assessmentId, is_published: false, publication: null, evaluations: [] };
  },

  getEvaluationForSubmission: async (submissionId: string): Promise<EvaluationDTO | null> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/submission/${submissionId}`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.evaluation;
      }
    } catch { }
    return null;
  },

  saveEvaluation: async (payload: {
    submission_id: string;
    status: 'draft' | 'completed';
    raw_score?: number;
    general_feedback?: string | null;
    criterion_scores?: {
      criterion_id: string;
      selected_level_id?: string | null;
      score: number;
      feedback?: string | null;
    }[];
  }): Promise<EvaluationDTO> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to save evaluation (${res.status})`);
    }
    return data.evaluation;
  },

  publishResults: async (assessmentId: string, remarks?: string): Promise<{
    message: string;
    publication: any;
    published_count: number;
  }> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/assessment/${assessmentId}/publish`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ remarks })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to publish results (${res.status})`);
    }
    return data;
  },

  getMyResults: async (): Promise<EvaluationDTO[]> => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetchWithTimeout(`${API_BASE_URL}/evaluations/student/my-results`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        return data.results;
      }
    } catch { }
    return [];
  }
};

