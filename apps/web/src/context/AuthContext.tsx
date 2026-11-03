import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { authApi, UserAuthContext, clearAuthHeaderCache, setActiveWorkspaceRole } from '../services/apiClient';
import { userDirectoryStore } from '../features/hod/userDirectoryStore';
import { proctorReportStore } from '../features/proctor/proctorReportStore';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  userContext: UserAuthContext | null;
  activeRole: string | null;
  availableRoles: string[];
  isLoading: boolean;
  error: string | null;
  accountStatus: 'ok' | 'inactive' | 'no_profile' | 'no_roles' | null;
  accountStatusMessage: string | null;
  isPasswordRecovery: boolean;
  recoveryError: string | null;
  login: (email: string, password: string, portal?: 'student' | 'faculty') => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: string) => void;
  clearError: () => void;
  refreshContext: () => Promise<void>;
  clearRecovery: (portal?: 'student' | 'faculty') => void;
  requestPasswordReset: (email: string, portal?: 'student' | 'faculty') => Promise<{ success: boolean; message: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userContext, setUserContext] = useState<UserAuthContext | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<'ok' | 'inactive' | 'no_profile' | 'no_roles' | null>(null);
  const [accountStatusMessage, setAccountStatusMessage] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const loadContextPromiseRef = React.useRef<Promise<void> | null>(null);
  const lastLoadedUserIdRef = React.useRef<string | null>(null);

  const determineDefaultRole = (roles: string[]): string | null => {
    if (!roles || roles.length === 0) return null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem('smartfa_active_workspace');
      if (saved && roles.includes(saved)) {
        return saved;
      }
    }
    if (roles.includes('hod')) return 'hod';
    if (roles.includes('subject_teacher')) return 'subject_teacher';
    if (roles.includes('class_teacher')) return 'class_teacher';
    if (roles.includes('proctor')) return 'proctor';
    return roles[0];
  };

  const loadBackendContext = async (currentUser: User, currentSession: Session, force = false): Promise<void> => {
    // Avoid duplicate fetching if already established for this exact user
    if (!force && lastLoadedUserIdRef.current === currentUser.id && userContext) {
      return;
    }
    // Return existing in-flight promise to prevent concurrent identical requests
    if (loadContextPromiseRef.current) {
      return loadContextPromiseRef.current;
    }

    const task = (async () => {
      try {
        const ctx = await authApi.getMe();
        lastLoadedUserIdRef.current = currentUser.id;
        setUser(currentUser);
        setSession(currentSession);
        setUserContext(ctx);

        if (ctx.profile.status !== 'active') {
          setAccountStatus('inactive');
          setAccountStatusMessage('Your institutional account is inactive or pending approval. Contact the Academic HOD.');
          setActiveRole(null);
          return;
        }

        if (!ctx.roles || ctx.roles.length === 0) {
          setAccountStatus('no_roles');
          setAccountStatusMessage('Your institutional account has no active assigned roles. Contact the Academic HOD for role provisioning.');
          setActiveRole(null);
          return;
        }

        setAccountStatus('ok');
        setAccountStatusMessage(null);
        setActiveRole(prevRole => {
          let resolved = (prevRole && ctx.roles.includes(prevRole)) 
            ? prevRole 
            : determineDefaultRole(ctx.roles);
          if (resolved) {
            setActiveWorkspaceRole(resolved);
            if (typeof window !== 'undefined' && window.sessionStorage) {
              window.sessionStorage.setItem('smartfa_active_workspace', resolved);
            }
          }
          return resolved;
        });
      } catch (err: any) {
        if (err.code === 'ACCOUNT_INACTIVE' || err.status === 403) {
          setAccountStatus('inactive');
          setAccountStatusMessage(err.message || 'Account is inactive. Contact the Academic HOD.');
          setActiveRole(null);
        } else if (err.code === 'PROFILE_NOT_FOUND') {
          setAccountStatus('no_profile');
          setAccountStatusMessage('No institutional profile found for your authenticated account. Contact the Academic HOD.');
          setActiveRole(null);
        } else if (err.status === 401 || err.code === 'INVALID_TOKEN' || err.code === 'TOKEN_PROJECT_MISMATCH' || err.code === 'UNAUTHORIZED') {
          console.warn('[SmartFA Auth] Session rejected by backend (invalid or expired token):', err.message);
          clearAuthHeaderCache();
          localStorage.removeItem('smartfa_dev_token');
          if (supabase) {
            await supabase.auth.signOut().catch(() => {});
          }
          lastLoadedUserIdRef.current = null;
          setUser(null);
          setSession(null);
          setUserContext(null);
          setActiveRole(null);
          setAccountStatus(null);
          setAccountStatusMessage(null);
          setError(err.message || 'Your session has expired or is invalid. Please sign in again.');
          throw err;
        } else {
          setError(err.message || 'Failed to verify institutional role context with server.');
          setActiveRole(null);
          throw err;
        }
      } finally {
        loadContextPromiseRef.current = null;
      }
    })();

    loadContextPromiseRef.current = task;
    return task;
  };

  // Restore session on mount and listen to auth state changes
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      let isRecoveryRoute = false;

      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        const pathname = window.location.pathname || '';

        // Check for error parameters in hash or search
        const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
        const searchParams = new URLSearchParams(search.startsWith('?') ? search.substring(1) : search);

        const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
        const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
        const errorMsg = hashParams.get('error') || searchParams.get('error');

        if (errorCode === 'otp_expired' || errorMsg === 'access_denied' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
          setIsPasswordRecovery(true);
          setRecoveryError('Your password-recovery link has expired or is invalid. Please request a new password-reset link.');
          setIsLoading(false);
          return;
        }

        // Sanitize legacy dual-hash format if present (e.g. #reset-password#access_token=...)
        if (hash.includes('#access_token=') && hash.indexOf('#access_token=') > 0) {
          const cleanHash = hash.substring(hash.indexOf('#access_token='));
          window.history.replaceState(null, '', `/reset-password${cleanHash}`);
        }

        // Detect recovery route or intent
        if (
          pathname === '/reset-password' ||
          hash.includes('type=recovery') ||
          hash.includes('reset-password') ||
          searchParams.has('code')
        ) {
          isRecoveryRoute = true;
          setIsPasswordRecovery(true);
        }
      }

      // 1. Check for active local development session token
      const devToken = localStorage.getItem('smartfa_dev_token');
      if (devToken && !isRecoveryRoute) {
        try {
          const ctx = await authApi.getMe();
          if (isMounted) {
            setUser({ id: ctx.user.id, email: ctx.user.email } as any);
            setSession({ access_token: devToken, user: { id: ctx.user.id, email: ctx.user.email } } as any);
            setUserContext(ctx);
            setAccountStatus(ctx.profile.status === 'active' ? 'ok' : 'inactive');
            setActiveRole(determineDefaultRole(ctx.roles));
            setIsLoading(false);
          }
          return;
        } catch {
          localStorage.removeItem('smartfa_dev_token');
        }
      }

      if (!supabase) {
        if (isMounted) {
          if (isRecoveryRoute) {
            setIsPasswordRecovery(true);
          }
          setIsLoading(false);
        }
        return;
      }

      try {
        // If PKCE code is present in query parameters, exchange it for session
        if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get('code');
          if (code) {
            try {
              const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
              if (!codeErr && codeData.session) {
                if (isMounted) {
                  setUser(codeData.session.user);
                  setSession(codeData.session);
                  setIsPasswordRecovery(true);
                  setRecoveryError(null);
                  setIsLoading(false);
                }
                return;
              }
            } catch (exchangeErr) {
              console.warn('[SmartFA Auth] PKCE exchange error:', exchangeErr);
            }
          }
        }

        // If access_token is present in URL hash, explicitly establish session
        if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
          const tokenPart = window.location.hash.substring(window.location.hash.indexOf('access_token='));
          const hashParamsForToken = new URLSearchParams(tokenPart);
          const accessToken = hashParamsForToken.get('access_token');
          const refreshToken = hashParamsForToken.get('refresh_token');
          const tokenType = hashParamsForToken.get('type');

          if (accessToken) {
            if (tokenType === 'recovery' || window.location.pathname === '/reset-password' || window.location.hash.includes('recovery')) {
              isRecoveryRoute = true;
              setIsPasswordRecovery(true);
            }
            try {
              const { data: setSessionData, error: setSessionErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || ''
              });
              if (!setSessionErr && setSessionData.session) {
                if (isMounted) {
                  setUser(setSessionData.session.user);
                  setSession(setSessionData.session);
                  if (isRecoveryRoute) {
                    setIsPasswordRecovery(true);
                    setRecoveryError(null);
                  }
                  setIsLoading(false);
                }
                return;
              }
            } catch (tokenErr) {
              console.warn('[SmartFA Auth] Error setting session from hash tokens:', tokenErr);
            }
          }
        }

        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.warn('[SmartFA Auth] Session restoration error:', sessionError.message);
          if (isMounted) {
            setUser(null);
            setSession(null);
            setUserContext(null);
            setActiveRole(null);
            if (isRecoveryRoute) {
              setIsPasswordRecovery(true);
              setRecoveryError('Your password-recovery session could not be established. Please request a new password-reset link.');
            }
            setIsLoading(false);
          }
          return;
        }

        if (existingSession && existingSession.user) {
          if (isMounted) {
            setUser(existingSession.user);
            setSession(existingSession);

            if (isRecoveryRoute) {
              setIsPasswordRecovery(true);
              setRecoveryError(null);
            } else {
              try {
                await loadBackendContext(existingSession.user, existingSession);
              } catch (restoreErr: any) {
                console.warn('[SmartFA Auth] Session restore context verification failed:', restoreErr?.message);
                if (isMounted) {
                  setUser(null);
                  setSession(null);
                  setUserContext(null);
                  setActiveRole(null);
                }
              }
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            setSession(null);
            setUserContext(null);
            setActiveRole(null);
            if (isRecoveryRoute) {
              setIsPasswordRecovery(true);
              setRecoveryError('No active password-recovery session found. Your recovery link may be expired, invalid, or already used. Please request a new password-reset link.');
            }
          }
        }
      } catch (err: any) {
        console.warn('[SmartFA Auth] Unexpected session restore error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    if (!supabase) {
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setUser(newSession?.user || null);
        setSession(newSession || null);
        setRecoveryError(null);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT' || !newSession) {
        userDirectoryStore.clear();
        proctorReportStore.clear();
        setUser(null);
        setSession(null);
        setUserContext(null);
        setActiveRole(null);
        setAccountStatus(null);
        setAccountStatusMessage(null);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setUser(newSession.user);
        setSession(newSession);

        // If currently in recovery mode (e.g. on /reset-password), keep recovery state
        if (isPasswordRecovery || (typeof window !== 'undefined' && window.location.pathname === '/reset-password')) {
          setRecoveryError(null);
          setIsLoading(false);
          return;
        }

        try {
          await loadBackendContext(newSession.user, newSession);
        } catch (authChangeErr: any) {
          console.warn('[SmartFA Auth] Auth state change context verification failed:', authChangeErr?.message);
        }
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, portal?: 'student' | 'faculty'): Promise<void> => {
    setError(null);
    setIsLoading(true);

    try {
      // 1. Authenticate with Supabase Auth when configured
      if (supabase && isSupabaseConfigured) {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (signInError) {
          throw new Error(signInError.message || 'Invalid institutional login credentials.');
        }

        if (data.session && data.user) {
          setUser(data.user);
          setSession(data.session);
          try {
            await loadBackendContext(data.user, data.session);
          } catch (loadErr: any) {
            if (supabase) {
              await supabase.auth.signOut().catch(() => {});
            }
            setUser(null);
            setSession(null);
            setUserContext(null);
            setActiveRole(null);
            throw loadErr;
          }

          // If portal is specified, verify authoritative role access with backend
          if (portal) {
            try {
              await authApi.verifyPortal(portal);
            } catch (portalErr: any) {
              // Sign out immediately so unauthorized role is not retained
              if (supabase) {
                await supabase.auth.signOut().catch(() => {});
              }
              setUser(null);
              setSession(null);
              setUserContext(null);
              setActiveRole(null);
              throw portalErr;
            }
          }

          setIsLoading(false);
          return;
        }
      }

      // 2. Offline development fallback (only when Supabase is not configured)
      const demoRes = await authApi.demoLogin(email.trim());
      const userRoles = demoRes.roles || [];

      // Enforce portal separation in fallback
      if (portal === 'student' && !userRoles.includes('student')) {
        localStorage.removeItem('smartfa_dev_token');
        throw new Error('Access denied: This portal is restricted to students. Your account has faculty/staff credentials. Please sign in through the Faculty Portal.');
      }

      const staffRoles = ['subject_teacher', 'class_teacher', 'proctor', 'hod'];
      if (portal === 'faculty' && !userRoles.some((r: string) => staffRoles.includes(r))) {
        localStorage.removeItem('smartfa_dev_token');
        throw new Error('Access denied: This portal is restricted to faculty, instructors, and academic administrators. Please sign in through the Student Portal.');
      }

      setUser({ id: demoRes.user.id, email: demoRes.user.email } as any);
      setSession({ access_token: demoRes.token, user: { id: demoRes.user.id, email: demoRes.user.email } } as any);
      setUserContext({
        user: demoRes.user,
        profile: demoRes.profile,
        roles: demoRes.roles,
        isHOD: demoRes.isHOD
      });
      setAccountStatus(demoRes.profile.status === 'active' ? 'ok' : 'inactive');
      setActiveRole(determineDefaultRole(demoRes.roles));
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
      setIsLoading(false);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    localStorage.removeItem('smartfa_dev_token');
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem('smartfa_active_workspace');
    }
    setActiveWorkspaceRole(null);
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('[SmartFA Auth] SignOut error:', err);
    } finally {
      lastLoadedUserIdRef.current = null;
      clearAuthHeaderCache();
      userDirectoryStore.clear();
      proctorReportStore.clear();
      setUser(null);
      setSession(null);
      setUserContext(null);
      setActiveRole(null);
      setAccountStatus(null);
      setAccountStatusMessage(null);
      setError(null);
      setIsLoading(false);
    }
  };

  const switchRole = (newRole: string): void => {
    if (!userContext || !userContext.roles.includes(newRole)) {
      console.warn(`[SmartFA Security] Attempted unauthorized role switch to "${newRole}". Only backend-verified roles permitted:`, userContext?.roles);
      return;
    }
    setActiveWorkspaceRole(newRole);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('smartfa_active_workspace', newRole);
    }
    userDirectoryStore.clear();
    proctorReportStore.clear();
    setActiveRole(newRole);
  };

  const refreshContext = async (): Promise<void> => {
    if (user && session) {
      await loadBackendContext(user, session, true);
    }
  };

  const clearError = () => setError(null);

  const clearRecovery = (portal?: 'student' | 'faculty') => {
    setIsPasswordRecovery(false);
    setRecoveryError(null);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const searchParams = new URLSearchParams(window.location.search);
      const queryPortal = searchParams.get('portal') as 'student' | 'faculty' | null;
      const target = portal 
        ? `/${portal}/login` 
        : queryPortal
        ? `/${queryPortal}/login`
        : window.location.pathname.includes('faculty') 
        ? '/faculty/login' 
        : '/student/login';
      window.history.replaceState(null, '', target);
    }
  };

  const requestPasswordReset = async (email: string, portal?: 'student' | 'faculty'): Promise<{ success: boolean; message: string }> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      throw new Error('Please enter your institutional email address.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error('Please enter a valid institutional email format.');
    }

    if (!supabase || !isSupabaseConfigured) {
      return {
        success: true,
        message: 'If an account exists for this email, password-reset instructions will be sent.'
      };
    }

    // Clean dedicated path without hash collisions
    const redirectTo = portal
      ? `${window.location.origin}/reset-password?portal=${portal}`
      : `${window.location.origin}/reset-password`;

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo
      });

      if (resetError) {
        if (resetError.status === 429 || resetError.message.toLowerCase().includes('rate limit')) {
          throw new Error('Too many requests. Please wait a few minutes before trying again.');
        }
        console.warn('[SmartFA Auth] Password reset notice:', resetError.message);
      }

      return {
        success: true,
        message: 'If an account exists for this email, password-reset instructions will be sent.'
      };
    } catch (err: any) {
      if (err.message && err.message.includes('Too many requests')) {
        throw err;
      }
      return {
        success: true,
        message: 'If an account exists for this email, password-reset instructions will be sent.'
      };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      throw new Error('Password must contain both letters and numbers.');
    }

    if (!supabase || !isSupabaseConfigured) {
      setIsPasswordRecovery(false);
      return { success: true, message: 'Password updated successfully in local mock mode.' };
    }

    // Verify that a valid recovery session exists before attempting updateUser
    const { data: { session: activeSession } } = await supabase.auth.getSession();
    if (!activeSession) {
      throw new Error('No active password-recovery session found. Your recovery link may be expired, invalid, or already used. Please request a new password-reset link.');
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update password.');
    }

    // After updating password, sign out the recovery session so user signs in freshly with new credentials
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);

    // Clean URL hash and search tokens so reload does not re-trigger recovery mode
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const searchParams = new URLSearchParams(window.location.search);
      const queryPortal = searchParams.get('portal') as 'student' | 'faculty' | null;
      const targetPortal = queryPortal ? `/${queryPortal}/login` : (window.location.pathname.includes('faculty') ? '/faculty/login' : '/student/login');
      window.history.replaceState(null, '', targetPortal);
    }

    return { success: true, message: 'Your password has been successfully updated.' };
  };

  const availableRoles = userContext?.roles || [];

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userContext,
        activeRole,
        availableRoles,
        isLoading,
        error,
        accountStatus,
        accountStatusMessage,
        isPasswordRecovery,
        recoveryError,
        login,
        logout,
        switchRole,
        clearError,
        refreshContext,
        clearRecovery,
        requestPasswordReset,
        updatePassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
