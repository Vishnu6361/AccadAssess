import { AppRole, Profile, UserRole, AccountStatus, Submission } from '@smartfa/contracts';
import { supabaseAdmin, isLiveSupabaseConfigured } from '../auth/jwt.js';
import { db, InMemoryDatabase } from './db.js';
import crypto from 'crypto';

export interface InviteUserParams {
  full_name: string;
  email: string;
  usn?: string | null;
  role: AppRole;
  scope_id?: string | null;
  assigned_by?: string | null;
}

export interface AssignRoleParams {
  userId: string;
  role: AppRole;
  scopeId?: string | null;
  assignedBy?: string | null;
  active?: boolean;
}

export interface UpdateProfileParams {
  full_name?: string;
  email?: string;
  phone?: string | null;
  employee_id?: string | null;
  designation?: string | null;
}

export interface IUserRepository {
  getProfileById(userId: string): Promise<Profile | null>;
  getProfileByEmail(email: string): Promise<Profile | null>;
  getProfileByUsn(usn: string): Promise<Profile | null>;
  getActiveRolesByUserId(userId: string): Promise<AppRole[]>;
  listUsers(): Promise<(Profile & { roles: AppRole[] })[]>;
  inviteUser(params: InviteUserParams): Promise<{ user: Profile; role: UserRole }>;
  updateProfile(userId: string, params: UpdateProfileParams): Promise<Profile>;
  assignRole(params: AssignRoleParams): Promise<UserRole>;
  removeRole(userId: string, role: AppRole): Promise<boolean>;
  updateUserStatus(userId: string, status: AccountStatus): Promise<Profile>;
  hasProtectedAcademicRecords(userId: string): Promise<{ hasRecords: boolean; submissionCount: number; details?: string }>;
  deleteStudent(userId: string): Promise<boolean>;
  isPersistent(): boolean;
  getMode(): 'supabase_postgresql' | 'in_memory_mock';
}

/**
 * In-memory fallback implementation for local development and offline unit tests.
 */
export class InMemoryUserRepository implements IUserRepository {
  constructor(private inMemoryDb: InMemoryDatabase = db) {}

  async getProfileById(userId: string): Promise<Profile | null> {
    const profile = this.inMemoryDb.profiles.find((p: Profile) => p.id === userId);
    return profile || null;
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const profile = this.inMemoryDb.profiles.find(
      (p: Profile) => p.email.toLowerCase() === email.toLowerCase()
    );
    return profile || null;
  }

  async getProfileByUsn(usn: string): Promise<Profile | null> {
    const profile = this.inMemoryDb.profiles.find(
      (p: Profile) => p.usn && p.usn.toUpperCase() === usn.toUpperCase()
    );
    return profile || null;
  }

  async getActiveRolesByUserId(userId: string): Promise<AppRole[]> {
    return this.inMemoryDb.roles
      .filter((r: UserRole) => r.user_id === userId && r.active)
      .map((r: UserRole) => r.role);
  }

  async listUsers(): Promise<(Profile & { roles: AppRole[] })[]> {
    return this.inMemoryDb.profiles.map(p => {
      const roles = this.inMemoryDb.roles
        .filter(r => r.user_id === p.id && r.active)
        .map(r => r.role);
      return {
        ...p,
        roles
      };
    });
  }

  async inviteUser(params: InviteUserParams): Promise<{ user: Profile; role: UserRole }> {
    const existing = await this.getProfileByEmail(params.email);
    if (existing) {
      const err: any = new Error('A user with this email address already exists');
      err.code = 'DUPLICATE_EMAIL';
      throw err;
    }

    if (params.usn) {
      const existingUsn = await this.getProfileByUsn(params.usn);
      if (existingUsn) {
        const err: any = new Error('A student with this USN already exists');
        err.code = 'DUPLICATE_USN';
        throw err;
      }
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const profile: Profile = {
      id: userId,
      full_name: params.full_name,
      email: params.email.toLowerCase(),
      usn: params.usn || null,
      status: 'active',
      created_at: now,
      updated_at: now
    };

    const role: UserRole = {
      id: crypto.randomUUID(),
      user_id: userId,
      role: params.role,
      scope_id: params.scope_id || null,
      assigned_by: params.assigned_by || null,
      active: true,
      created_at: now
    };

    this.inMemoryDb.profiles.push(profile);
    this.inMemoryDb.roles.push(role);

    return { user: profile, role };
  }

  async assignRole(params: AssignRoleParams): Promise<UserRole> {
    const existingRoles = await this.getActiveRolesByUserId(params.userId);
    if (existingRoles.includes(params.role)) {
      const err: any = new Error('User already possesses this active role and scope');
      err.code = 'DUPLICATE_ROLE_ASSIGNMENT';
      throw err;
    }

    const roleRecord: UserRole = {
      id: crypto.randomUUID(),
      user_id: params.userId,
      role: params.role,
      scope_id: params.scopeId || null,
      assigned_by: params.assignedBy || null,
      active: params.active ?? true,
      created_at: new Date().toISOString()
    };

    this.inMemoryDb.roles.push(roleRecord);
    return roleRecord;
  }

  async removeRole(userId: string, role: AppRole): Promise<boolean> {
    const idx = this.inMemoryDb.roles.findIndex(
      (r: UserRole) => r.user_id === userId && r.role === role
    );
    if (idx >= 0) {
      this.inMemoryDb.roles.splice(idx, 1);
      return true;
    }
    return false;
  }

  async updateUserStatus(userId: string, status: AccountStatus): Promise<Profile> {
    const profile = await this.getProfileById(userId);
    if (!profile) {
      const err: any = new Error('Target user does not exist');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    profile.status = status;
    profile.updated_at = new Date().toISOString();
    return profile;
  }

  async updateProfile(userId: string, params: UpdateProfileParams): Promise<Profile> {
    const profile = await this.getProfileById(userId);
    if (!profile) {
      const err: any = new Error('Target user does not exist');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    if (params.email) {
      const normalizedEmail = params.email.toLowerCase().trim();
      const existing = this.inMemoryDb.profiles.find(
        (p: Profile) => p.email.toLowerCase() === normalizedEmail && p.id !== userId
      );
      if (existing) {
        const err: any = new Error('A user with this email address already exists');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
      }
      profile.email = normalizedEmail;
    }

    if (params.full_name) {
      profile.full_name = params.full_name.trim();
    }

    if (params.phone !== undefined) {
      profile.phone = params.phone || undefined;
    }
    if (params.employee_id !== undefined) {
      profile.employee_id = params.employee_id || undefined;
    }
    if (params.designation !== undefined) {
      profile.designation = params.designation || undefined;
    }

    profile.updated_at = new Date().toISOString();
    return profile;
  }

  async hasProtectedAcademicRecords(userId: string): Promise<{ hasRecords: boolean; submissionCount: number; details?: string }> {
    const submissions = this.inMemoryDb.submissions.filter((s: Submission) => s.student_id === userId);
    const subCount = submissions.length;

    const subIds = new Set(submissions.map(s => s.id));
    const evaluations = this.inMemoryDb.evaluations.filter(e => subIds.has(e.submission_id));

    if (subCount > 0 || evaluations.length > 0) {
      return {
        hasRecords: true,
        submissionCount: subCount,
        details: `Student has ${subCount} submission(s) and ${evaluations.length} evaluation record(s).`
      };
    }

    return { hasRecords: false, submissionCount: 0 };
  }

  async deleteStudent(userId: string): Promise<boolean> {
    const check = await this.hasProtectedAcademicRecords(userId);
    if (check.hasRecords) {
      const err: any = new Error(
        `Cannot permanently delete student with existing academic records. ${check.details || ''} Academic history must be retained.`
      );
      err.code = 'PROTECTED_ACADEMIC_RECORDS';
      throw err;
    }

    // Clean up dependent non-academic records
    this.inMemoryDb.enrollments = this.inMemoryDb.enrollments.filter(e => e.student_id !== userId);
    this.inMemoryDb.proctorAssignments = this.inMemoryDb.proctorAssignments.filter(pa => pa.student_id !== userId);
    this.inMemoryDb.roles = this.inMemoryDb.roles.filter(r => r.user_id !== userId);
    const profIdx = this.inMemoryDb.profiles.findIndex(p => p.id === userId);
    if (profIdx >= 0) {
      this.inMemoryDb.profiles.splice(profIdx, 1);
    }
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
 * Live Supabase PostgreSQL repository querying public.profiles and public.user_roles.
 * Communicates using the server-side Supabase client with service-role permissions.
 */
export class SupabaseUserRepository implements IUserRepository {
  constructor(private client: NonNullable<typeof supabaseAdmin>) {}

  async getProfileById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, institution_id, full_name, email, usn, status, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Database error retrieving profile: ${error.message}`);
    }

    if (!data) {
      if (process.env.NODE_ENV !== 'production') {
        const localProf = db.profiles.find((p: Profile) => p.id === userId);
        if (localProf) return localProf;
      }
      return null;
    }

    return {
      id: data.id,
      institution_id: data.institution_id || undefined,
      full_name: data.full_name,
      email: data.email,
      usn: data.usn || undefined,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, institution_id, full_name, email, usn, status, created_at, updated_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) {
      throw new Error(`Database error retrieving profile by email: ${error.message}`);
    }

    if (!data) {
      if (process.env.NODE_ENV !== 'production') {
        const localProf = db.profiles.find((p: Profile) => p.email.toLowerCase() === email.toLowerCase());
        if (localProf) return localProf;
      }
      return null;
    }

    return {
      id: data.id,
      institution_id: data.institution_id || undefined,
      full_name: data.full_name,
      email: data.email,
      usn: data.usn || undefined,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  async getProfileByUsn(usn: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .ilike('usn', usn.toUpperCase())
      .maybeSingle();

    if (error) {
      throw new Error(`Database error retrieving profile by USN: ${error.message}`);
    }

    if (!data) {
      if (process.env.NODE_ENV !== 'production') {
        const localProf = db.profiles.find((p: Profile) => p.usn && p.usn.toUpperCase() === usn.toUpperCase());
        if (localProf) return localProf;
      }
      return null;
    }

    return {
      id: data.id,
      institution_id: data.institution_id || undefined,
      full_name: data.full_name,
      email: data.email,
      usn: data.usn || undefined,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  async getActiveRolesByUserId(userId: string): Promise<AppRole[]> {
    const { data, error } = await this.client
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('active', true);

    if (error) {
      throw new Error(`Database error retrieving user roles: ${error.message}`);
    }

    const roles = (data || []).map(r => r.role as AppRole);
    if (roles.length === 0 && process.env.NODE_ENV !== 'production') {
      const localRoles = db.roles.filter((r: UserRole) => r.user_id === userId && r.active).map((r: UserRole) => r.role);
      if (localRoles.length > 0) return localRoles;
    }
    return roles;
  }

  async listUsers(): Promise<(Profile & { roles: AppRole[] })[]> {
    const { data: profiles, error: profErr } = await this.client
      .from('profiles')
      .select('id, institution_id, full_name, email, usn, status, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (profErr) {
      throw new Error(`Database error listing profiles: ${profErr.message}`);
    }

    const { data: roles, error: rolesErr } = await this.client
      .from('user_roles')
      .select('user_id, role')
      .eq('active', true);

    if (rolesErr) {
      throw new Error(`Database error listing user roles: ${rolesErr.message}`);
    }

    const rolesByUserId = new Map<string, AppRole[]>();
    for (const r of roles || []) {
      const userRoles = rolesByUserId.get(r.user_id) || [];
      userRoles.push(r.role as AppRole);
      rolesByUserId.set(r.user_id, userRoles);
    }

    // Retrieve user metadata from Supabase auth admin if permitted
    const authMetaMap = new Map<string, any>();
    try {
      const { data: authData } = await this.client.auth.admin.listUsers({ perPage: 1000 });
      if (authData?.users) {
        for (const u of authData.users) {
          authMetaMap.set(u.id, u);
        }
      }
    } catch {
      // Graceful degradation when auth admin is restricted
    }

    return (profiles || []).map(p => {
      const authUser = authMetaMap.get(p.id);
      return {
        id: p.id,
        institution_id: p.institution_id || undefined,
        full_name: p.full_name,
        email: p.email,
        usn: p.usn || undefined,
        phone: (authUser?.user_metadata?.phone || authUser?.phone) || undefined,
        employee_id: authUser?.user_metadata?.employee_id || undefined,
        designation: authUser?.user_metadata?.designation || undefined,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        roles: rolesByUserId.get(p.id) || []
      };
    });
  }

  async inviteUser(params: InviteUserParams): Promise<{ user: Profile; role: UserRole }> {
    const existing = await this.getProfileByEmail(params.email);
    if (existing) {
      const err: any = new Error('A user with this email address already exists');
      err.code = 'DUPLICATE_EMAIL';
      throw err;
    }

    if (params.usn) {
      const existingUsn = await this.getProfileByUsn(params.usn);
      if (existingUsn) {
        const err: any = new Error('A student with this USN already exists');
        err.code = 'DUPLICATE_USN';
        throw err;
      }
    }

    let createdAuthUserId: string | null = null;
    try {
      // 1. Provision Supabase Auth User (Admin API)
      const initialPassword = `InitPass!_${crypto.randomUUID().slice(0, 8)}_${Date.now()}`;
      const { data: authData, error: authErr } = await this.client.auth.admin.createUser({
        email: params.email.toLowerCase(),
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: params.full_name }
      });

      if (authErr || !authData.user) {
        throw new Error(`Supabase Auth creation failed: ${authErr?.message || 'Unknown auth error'}`);
      }
      createdAuthUserId = authData.user.id;

      // 2. Insert public.profiles row
      const { data: profData, error: profErr } = await this.client
        .from('profiles')
        .insert({
          id: createdAuthUserId,
          full_name: params.full_name,
          email: params.email.toLowerCase(),
          usn: params.usn || null,
          status: 'active'
        })
        .select()
        .single();

      if (profErr || !profData) {
        throw new Error(`Database error creating profile: ${profErr?.message || 'No profile data returned'}`);
      }

      // 3. Insert public.user_roles row
      const roleId = crypto.randomUUID();
      const { data: roleData, error: roleErr } = await this.client
        .from('user_roles')
        .insert({
          id: roleId,
          user_id: createdAuthUserId,
          role: params.role,
          scope_id: params.scope_id || null,
          assigned_by: params.assigned_by || null,
          active: true
        })
        .select()
        .single();

      if (roleErr || !roleData) {
        throw new Error(`Database error creating user role: ${roleErr?.message || 'No role data returned'}`);
      }

      return {
        user: {
          id: profData.id,
          institution_id: profData.institution_id || undefined,
          full_name: profData.full_name,
          email: profData.email,
          usn: profData.usn || undefined,
          status: profData.status,
          created_at: profData.created_at,
          updated_at: profData.updated_at
        },
        role: {
          id: roleData.id,
          user_id: roleData.user_id,
          role: roleData.role,
          scope_id: roleData.scope_id || null,
          assigned_by: roleData.assigned_by || null,
          active: roleData.active,
          created_at: roleData.created_at
        }
      };
    } catch (err: any) {
      // Rollback: Clean up orphaned Auth user to prevent orphaned identities
      if (createdAuthUserId) {
        try {
          await this.client.auth.admin.deleteUser(createdAuthUserId);
        } catch (cleanupErr: any) {
          console.error(`[ROLLBACK WARNING] Failed to delete orphaned Auth user ${createdAuthUserId}:`, cleanupErr.message);
        }
      }
      throw err;
    }
  }

  async assignRole(params: AssignRoleParams): Promise<UserRole> {
    const roleId = crypto.randomUUID();
    let assignedBy = params.assignedBy || null;

    if (assignedBy) {
      try {
        const { data: profileCheck } = await this.client
          .from('profiles')
          .select('id')
          .eq('id', assignedBy)
          .maybeSingle();
        if (!profileCheck) {
          assignedBy = null;
        }
      } catch {
        assignedBy = null;
      }
    }

    const { data, error } = await this.client
      .from('user_roles')
      .insert({
        id: roleId,
        user_id: params.userId,
        role: params.role,
        scope_id: params.scopeId || null,
        assigned_by: assignedBy,
        active: params.active ?? true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('uq_user_role')) {
        const err: any = new Error('User already possesses this active role and scope');
        err.code = 'DUPLICATE_ROLE_ASSIGNMENT';
        throw err;
      }
      throw new Error(`Database error assigning role: ${error.message}`);
    }

    return {
      id: data.id,
      user_id: data.user_id,
      role: data.role,
      scope_id: data.scope_id || null,
      assigned_by: data.assigned_by || null,
      active: data.active,
      created_at: data.created_at
    };
  }

  async removeRole(userId: string, role: AppRole): Promise<boolean> {
    const { error } = await this.client
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role);

    if (error) {
      throw new Error(`Database error removing role: ${error.message}`);
    }
    return true;
  }

  async updateUserStatus(userId: string, status: AccountStatus): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error updating user status: ${error.message}`);
    }

    if (!data) {
      const err: any = new Error('Target user does not exist');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    return {
      id: data.id,
      institution_id: data.institution_id || undefined,
      full_name: data.full_name,
      email: data.email,
      usn: data.usn || undefined,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at
    };
  }

  async updateProfile(userId: string, params: UpdateProfileParams): Promise<Profile> {
    const existing = await this.getProfileById(userId);
    if (!existing) {
      const err: any = new Error('Target user does not exist');
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const targetEmail = params.email ? params.email.toLowerCase().trim() : undefined;
    const emailChanged = targetEmail && targetEmail !== existing.email.toLowerCase();

    if (emailChanged) {
      const conflict = await this.getProfileByEmail(targetEmail);
      if (conflict && conflict.id !== userId) {
        const err: any = new Error('A user with this email address already exists');
        err.code = 'DUPLICATE_EMAIL';
        throw err;
      }
    }

    // 1. Update Supabase Auth user record (Admin API) to keep authentication synchronized
    let authUserMeta: any = {};
    try {
      const { data: authUserRes } = await this.client.auth.admin.getUserById(userId);
      authUserMeta = authUserRes?.user?.user_metadata || {};

      const authUpdatePayload: any = {
        user_metadata: {
          ...authUserMeta,
          ...(params.full_name ? { full_name: params.full_name.trim() } : {}),
          ...(params.phone !== undefined ? { phone: params.phone || '' } : {}),
          ...(params.employee_id !== undefined ? { employee_id: params.employee_id || '' } : {}),
          ...(params.designation !== undefined ? { designation: params.designation || '' } : {})
        }
      };

      if (emailChanged) {
        authUpdatePayload.email = targetEmail;
        authUpdatePayload.email_confirm = true; // Confirmed so user can immediately sign in with new email
      }

      if (params.phone !== undefined && params.phone !== null && params.phone !== '') {
        authUpdatePayload.phone = params.phone;
      }

      const { error: authUpdateErr } = await this.client.auth.admin.updateUserById(userId, authUpdatePayload);
      if (authUpdateErr) {
        if (authUpdateErr.message?.includes('already been registered') || authUpdateErr.message?.includes('unique')) {
          const err: any = new Error('A user with this email address already exists');
          err.code = 'DUPLICATE_EMAIL';
          throw err;
        }
        const err: any = new Error(`Failed to update authentication credentials: ${authUpdateErr.message}`);
        err.code = 'AUTH_UPDATE_FAILED';
        throw err;
      }
    } catch (authErr: any) {
      if (authErr.code === 'DUPLICATE_EMAIL') throw authErr;
      // In local testing or offline mode, continue if auth admin is unavailable
      if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
        // Ignored in mock tests
      } else {
        throw authErr;
      }
    }

    // 2. Update public.profiles row
    const profileUpdates: any = {
      updated_at: new Date().toISOString()
    };
    if (params.full_name) profileUpdates.full_name = params.full_name.trim();
    if (emailChanged) profileUpdates.email = targetEmail;

    const { data: updatedData, error: profErr } = await this.client
      .from('profiles')
      .update(profileUpdates)
      .eq('id', userId)
      .select('id, institution_id, full_name, email, usn, status, created_at, updated_at')
      .single();

    if (profErr || !updatedData) {
      // Rollback Supabase auth user changes to prevent split-brain
      if (emailChanged) {
        await this.client.auth.admin.updateUserById(userId, {
          email: existing.email,
          email_confirm: true,
          user_metadata: authUserMeta
        }).catch(() => {});
      }
      throw new Error(`Database error updating profile: ${profErr?.message || 'Profile update failed'}`);
    }

    return {
      id: updatedData.id,
      institution_id: updatedData.institution_id || undefined,
      full_name: updatedData.full_name,
      email: updatedData.email,
      usn: updatedData.usn || undefined,
      phone: params.phone !== undefined ? (params.phone || undefined) : undefined,
      employee_id: params.employee_id !== undefined ? (params.employee_id || undefined) : undefined,
      designation: params.designation !== undefined ? (params.designation || undefined) : undefined,
      status: updatedData.status,
      created_at: updatedData.created_at,
      updated_at: updatedData.updated_at
    };
  }

  async hasProtectedAcademicRecords(userId: string): Promise<{ hasRecords: boolean; submissionCount: number; details?: string }> {
    const { count, error } = await this.client
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', userId);

    if (error) {
      throw new Error(`Database error verifying student academic records: ${error.message}`);
    }

    const subCount = count || 0;
    if (subCount > 0) {
      return {
        hasRecords: true,
        submissionCount: subCount,
        details: `Student has ${subCount} formal academic submission record(s) on file.`
      };
    }

    return { hasRecords: false, submissionCount: 0 };
  }

  async deleteStudent(userId: string): Promise<boolean> {
    const check = await this.hasProtectedAcademicRecords(userId);
    if (check.hasRecords) {
      const err: any = new Error(
        `Cannot permanently delete student with existing academic records. ${check.details || ''} Submissions and grading history must be retained.`
      );
      err.code = 'PROTECTED_ACADEMIC_RECORDS';
      throw err;
    }

    // Clean up non-academic relations first
    await this.client.from('proctor_assignments').delete().eq('student_id', userId);
    await this.client.from('enrollments').delete().eq('student_id', userId);
    await this.client.from('user_roles').delete().eq('user_id', userId);
    
    // Delete profile
    const { error: profErr } = await this.client
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profErr) {
      throw new Error(`Database error deleting profile: ${profErr.message}`);
    }

    // Delete Supabase Auth User
    try {
      await this.client.auth.admin.deleteUser(userId);
    } catch (authErr: any) {
      console.warn(`[SUPABASE AUTH NOTICE] Admin deleteUser for ${userId}: ${authErr.message}`);
    }

    // Synchronize local development fallback database if present
    if (process.env.NODE_ENV !== 'production') {
      db.enrollments = db.enrollments.filter(e => e.student_id !== userId);
      db.proctorAssignments = db.proctorAssignments.filter(pa => pa.student_id !== userId);
      db.roles = db.roles.filter(r => r.user_id !== userId);
      db.profiles = db.profiles.filter(p => p.id !== userId);
    }

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
let activeRepositoryOverride: IUserRepository | null = null;

export const setUserRepositoryForTesting = (repo: IUserRepository | null): void => {
  activeRepositoryOverride = repo;
};

/**
 * Factory to retrieve the active user repository.
 * Enforces security invariant: Never silently falls back to in-memory mock in production.
 */
export const getUserRepository = (): IUserRepository => {
  if (activeRepositoryOverride) {
    return activeRepositoryOverride;
  }

  if (process.env.NODE_ENV === 'production') {
    const hasProdCreds = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL));
    if (!hasProdCreds || !isLiveSupabaseConfigured || !supabaseAdmin) {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: Production mode requires active Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). Offline mock storage is strictly prohibited in production.'
      );
    }
    return new SupabaseUserRepository(supabaseAdmin);
  }

  if (process.env.NODE_ENV === 'test' || process.env.SMARTFA_TEST_MODE === 'true') {
    return new InMemoryUserRepository(db);
  }

  if (isLiveSupabaseConfigured && supabaseAdmin) {
    return new SupabaseUserRepository(supabaseAdmin);
  }

  return new InMemoryUserRepository(db);
};
