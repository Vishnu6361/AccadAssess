import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AcadAssessLogo } from '../../components/AcadAssessLogo';
import { AcademicBackground } from '../../components/AcademicBackground';
import { 
  Lock, 
  Mail, 
  AlertCircle, 
  ShieldCheck, 
  Loader2, 
  ArrowLeft, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  GraduationCap, 
  Users, 
  Building2,
  ArrowRight 
} from 'lucide-react';

export type AuthViewMode = 'login' | 'forgot_password' | 'reset_password';

export interface LoginViewProps {
  portal: 'student' | 'faculty' | 'admin';
  initialMode?: AuthViewMode;
  onNavigatePortal?: (portal: 'student' | 'faculty' | 'admin') => void;
  onBackToSelection?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ 
  portal, 
  initialMode, 
  onNavigatePortal, 
  onBackToSelection 
}) => {
  const { 
    user,
    session,
    login, 
    error, 
    clearError, 
    isLoading, 
    isPasswordRecovery, 
    recoveryError, 
    clearRecovery, 
    requestPasswordReset, 
    updatePassword 
  } = useAuth();

  const [mode, setMode] = useState<AuthViewMode>(
    initialMode || (isPasswordRecovery ? 'reset_password' : 'login')
  );

  // Form states - Strictly initialized empty as mandated
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status feedback
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [portalMismatch, setPortalMismatch] = useState<{
    denied: boolean;
    message: string;
    targetPortal: 'student' | 'faculty' | 'admin';
  } | null>(null);

  // Auto-switch to reset_password if password recovery is active in session
  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('reset_password');
      setLocalError(null);
      setLocalSuccess(null);
    }
  }, [isPasswordRecovery]);

  // Handle Sign In submission with authoritative portal verification
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    setPortalMismatch(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your institutional email address.');
      return;
    }

    if (!password) {
      setLocalError('Please enter your account password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password, portal);
    } catch (err: any) {
      if (err.code === 'PORTAL_ACCESS_DENIED' || err.message?.includes('PORTAL_ACCESS_DENIED') || err.message?.includes('Access denied:')) {
        const target: 'student' | 'faculty' | 'admin' = err.recommendedPortal || (portal === 'student' ? 'faculty' : (portal === 'faculty' ? 'admin' : 'faculty'));
        setPortalMismatch({
          denied: true,
          message: err.message,
          targetPortal: target
        });
      } else {
        setLocalError(err.message || 'Authentication failed. Please verify your institutional credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Forgot Password submission
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    clearError();

    if (!email.trim()) {
      setLocalError('Please enter your institutional email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(email, portal);
      setLocalSuccess(res.message);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to submit password reset request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Set New Password submission
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);
    clearError();

    if (!newPassword) {
      setLocalError('Please enter a new password.');
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setLocalError('Password must contain both letters and numbers.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updatePassword(newPassword);
      setLocalSuccess(res.message || 'Your password has been successfully updated.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to update password. Please request a new link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || (mode === 'login' ? error : null) || (mode === 'reset_password' ? recoveryError : null);

  // Password validation badges for reset mode
  const isLenValid = newPassword.length >= 8;
  const isAlphanumeric = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const isMatchValid = newPassword.length > 0 && newPassword === confirmPassword;

  // Portal-specific configuration
  const isStudentPortal = portal === 'student';
  const isAdminPortal = portal === 'admin';
  const portalHeading = isStudentPortal 
    ? 'AcadAssess Student Portal' 
    : isAdminPortal 
    ? 'AcadAssess Admin Portal' 
    : 'AcadAssess Faculty Portal';
  const portalDescription = isStudentPortal 
    ? 'Sign in to view assessments, submit assignments, track submission history, and review published results.'
    : isAdminPortal
    ? 'Sign in as Head of Department (HOD) to manage academic structure, programmes, classes, user directory, and institutional oversight.'
    : 'Sign in to create assessments, configure rubrics, evaluate submissions, and manage authorized academic activities.';
  const signInButtonLabel = isStudentPortal 
    ? 'Student Sign In' 
    : isAdminPortal
    ? 'Admin Sign In'
    : 'Faculty Sign In';
  const emailPlaceholder = isStudentPortal 
    ? 'e.g. adm25mca9718@sjbit.edu.in' 
    : isAdminPortal
    ? 'e.g. hod@sjbit.edu.in'
    : 'e.g. faculty@sjbit.edu.in';

  return (
    <AcademicBackground>
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-4 sm:py-6 my-auto w-full">
        <div className="w-full max-w-[500px] space-y-3.5 sm:space-y-4">
          
          {/* =========================================================================
              HEADER SECTION (Distinct Portal Identity)
             ========================================================================= */}
          <div className="text-center space-y-1.5">
            {/* Top Navigation Bar: Back to Portal Selection */}
            {onBackToSelection && (
              <div className="flex justify-center pb-0.5">
                <button
                  type="button"
                  onClick={onBackToSelection}
                  className="inline-flex items-center text-xs font-semibold text-academic-muted hover:text-academic-deepGreen transition-colors focus:outline-none"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  <span>Back to Portal Selection</span>
                </button>
              </div>
            )}

            <AcadAssessLogo variant="full" size="md" />

            {/* Portal Page Heading */}
            <h1 className="text-lg sm:text-xl font-bold text-academic-deepGreen tracking-tight">
              {portalHeading}
            </h1>

            {/* Portal Operational Description */}
            <p className="text-xs text-academic-muted font-normal max-w-sm mx-auto leading-relaxed">
              {portalDescription}
            </p>
          </div>

          {/* =========================================================================
              CENTRAL AUTH CARD CONTAINER
             ========================================================================= */}
          <div className="bg-white border border-academic-border rounded-xl shadow-academicCard p-5 sm:p-6 space-y-4">
            
            {/* -----------------------------------------------------------------------
                MODE 1: SIGN IN VIEW
               ----------------------------------------------------------------------- */}
            {mode === 'login' && (
              <>
                <div className="border-b border-academic-borderSubtle pb-2.5 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-academic-deepGreen flex items-center space-x-2">
                      {isStudentPortal ? (
                        <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-academic-primaryGreen" />
                      ) : isAdminPortal ? (
                        <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-academic-primaryGreen" />
                      ) : (
                        <Users className="w-4 h-4 sm:w-5 sm:h-5 text-academic-primaryGreen" />
                      )}
                      <span>{signInButtonLabel}</span>
                    </h2>
                    <p className="text-xs text-academic-muted mt-0.5">
                      Enter your verified institutional credentials to access your {isStudentPortal ? 'student' : isAdminPortal ? 'HOD administrative' : 'faculty'} workspace.
                    </p>
                  </div>
                </div>

                {/* Portal Access Denied Alert (Wrong Portal Mismatch) */}
                {portalMismatch && (
                  <div 
                    role="alert" 
                    className="p-3.5 rounded-lg bg-[#FFF8F0] border border-[#F5D5B8] text-[#8C3A00] text-xs space-y-2.5 animate-in fade-in"
                  >
                    <div className="flex items-start space-x-2.5">
                      <AlertCircle className="w-4 h-4 mt-0.5 text-[#B84D00] flex-shrink-0" />
                      <div className="flex-1 font-semibold leading-relaxed">
                        {portalMismatch.message}
                      </div>
                    </div>
                    {onNavigatePortal && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => onNavigatePortal(portalMismatch.targetPortal)}
                          className="w-full py-2 px-3 rounded-lg bg-[#8C3A00] hover:bg-[#6E2E00] text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors min-h-[38px]"
                        >
                          <span>Go to {portalMismatch.targetPortal === 'student' ? 'Student Portal' : portalMismatch.targetPortal === 'admin' ? 'Admin Portal' : 'Faculty Portal'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Standard Error Banner */}
                {displayError && !portalMismatch && (
                  <div 
                    role="alert" 
                    className="p-3 rounded-lg bg-[#FFF5F2] border border-[#F2C4B3] text-[#A63214] text-xs flex items-start space-x-2.5 animate-in fade-in"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 font-medium leading-relaxed">
                      {displayError}
                    </div>
                  </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-3.5" noValidate>
                  {/* Institutional Email */}
                  <div>
                    <label 
                      htmlFor="auth-email" 
                      className="block text-xs font-semibold text-academic-deepGreen mb-1"
                    >
                      Institutional Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="auth-email"
                        type="email"
                        autoComplete="email"
                        required
                        disabled={isSubmitting || isLoading}
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (displayError) clearError();
                          if (portalMismatch) setPortalMismatch(null);
                        }}
                        placeholder={emailPlaceholder}
                        className="input-academic pl-10"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label 
                      htmlFor="auth-password" 
                      className="block text-xs font-semibold text-academic-deepGreen mb-1"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        disabled={isSubmitting || isLoading}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (displayError) clearError();
                          if (portalMismatch) setPortalMismatch(null);
                        }}
                        placeholder="••••••••••••"
                        className="input-academic pl-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-academic-muted hover:text-academic-deepGreen focus:outline-none"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Forgot Password Link */}
                  <div className="flex justify-end items-center pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot_password');
                        setLocalError(null);
                        setLocalSuccess(null);
                        setPortalMismatch(null);
                        clearError();
                      }}
                      className="text-xs font-semibold text-academic-primaryGreen hover:underline transition-colors focus:outline-none"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* Primary Sign In Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || isLoading}
                    className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                  >
                    {isSubmitting || isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying {isStudentPortal ? 'Student' : isAdminPortal ? 'Admin' : 'Faculty'} Credentials...</span>
                      </>
                    ) : (
                      <span>{signInButtonLabel}</span>
                    )}
                  </button>

                  {/* Cross-Portal Switch Links */}
                  {onNavigatePortal && (
                    <div className="pt-2.5 border-t border-academic-borderSubtle text-center space-y-1.5">
                      {isStudentPortal && (
                        <div className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-academic-muted">
                          <span>Faculty or Academic Head?</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('faculty')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Faculty Portal &rarr;
                          </button>
                          <span>&bull;</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('admin')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Admin Portal &rarr;
                          </button>
                        </div>
                      )}
                      {portal === 'faculty' && (
                        <div className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-academic-muted">
                          <span>Student or Academic Head?</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('student')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Student Portal &rarr;
                          </button>
                          <span>&bull;</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('admin')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Admin Portal &rarr;
                          </button>
                        </div>
                      )}
                      {isAdminPortal && (
                        <div className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-academic-muted">
                          <span>Faculty or Student?</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('faculty')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Faculty Portal &rarr;
                          </button>
                          <span>&bull;</span>
                          <button
                            type="button"
                            onClick={() => onNavigatePortal('student')}
                            className="font-bold text-academic-primaryGreen hover:underline focus:outline-none"
                          >
                            Student Portal &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              </>
            )}

            {/* -----------------------------------------------------------------------
                MODE 2: FORGOT PASSWORD REQUEST VIEW
               ----------------------------------------------------------------------- */}
            {mode === 'forgot_password' && (
              <>
                <div className="border-b border-academic-borderSubtle pb-2.5">
                  <h2 className="text-sm sm:text-base font-bold text-academic-deepGreen">
                    Reset Account Password
                  </h2>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Enter your verified institutional email address to receive password-recovery instructions for your {isStudentPortal ? 'student' : isAdminPortal ? 'HOD administrative' : 'faculty'} account.
                  </p>
                </div>

                {/* Error Banner */}
                {displayError && (
                  <div 
                    role="alert" 
                    className="p-3 rounded-lg bg-[#FFF5F2] border border-[#F2C4B3] text-[#A63214] text-xs flex items-start space-x-2.5 animate-in fade-in"
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 font-medium leading-relaxed">
                      {displayError}
                    </div>
                  </div>
                )}

                {/* Success Notification */}
                {localSuccess ? (
                  <div className="space-y-3.5">
                    <div 
                      role="status" 
                      className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-xs flex items-start space-x-2.5"
                    >
                      <CheckCircle2 className="w-5 h-5 text-[#166534] flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold leading-relaxed">
                          {localSuccess}
                        </p>
                        <p className="text-[11px] text-[#166534]/90 leading-relaxed">
                          If your account is registered, a secure recovery email has been sent. Please open the link in your email to choose a new password. Check your spam folder if you do not see it within a few minutes.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setLocalSuccess(null);
                        setLocalError(null);
                      }}
                      className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Return to {isStudentPortal ? 'Student' : isAdminPortal ? 'Admin' : 'Faculty'} Sign In</span>
                    </button>
                  </div>
                ) : (
                  /* Forgot Password Request Form */
                  <form onSubmit={handleForgotSubmit} className="space-y-3.5" noValidate>
                    <div>
                      <label 
                        htmlFor="reset-email" 
                        className="block text-xs font-semibold text-academic-deepGreen mb-1"
                      >
                        Institutional Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="reset-email"
                          type="email"
                          autoComplete="email"
                          required
                          disabled={isSubmitting}
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (localError) setLocalError(null);
                          }}
                          placeholder={emailPlaceholder}
                          className="input-academic pl-10"
                        />
                      </div>
                      <p className="text-[11px] text-academic-muted mt-1">
                        Instructions will be securely delivered to your registered institutional inbox.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending Instructions...</span>
                        </>
                      ) : (
                        <span>Send Password Reset Instructions</span>
                      )}
                    </button>

                    <div className="pt-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setLocalError(null);
                          clearError();
                        }}
                        className="inline-flex items-center text-xs font-semibold text-academic-muted hover:text-academic-deepGreen transition-colors focus:outline-none"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                        <span>Cancel and Return to Sign In</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* -----------------------------------------------------------------------
                MODE 3: RESET PASSWORD (NEW PASSWORD INPUT)
               ----------------------------------------------------------------------- */}
            {mode === 'reset_password' && (
              <>
                <div className="border-b border-academic-borderSubtle pb-2.5">
                  <h2 className="text-sm sm:text-base font-bold text-academic-deepGreen">
                    Set New Password
                  </h2>
                  <p className="text-xs text-academic-muted mt-0.5">
                    Choose a strong, alphanumeric institutional password with at least 8 characters.
                  </p>
                </div>

                {/* Scenario 1: Password successfully updated */}
                {localSuccess ? (
                  <div className="space-y-3.5 pt-1">
                    <div 
                      role="status" 
                      className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-xs flex items-start space-x-2.5"
                    >
                      <CheckCircle2 className="w-5 h-5 text-[#166534] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-xs sm:text-sm leading-relaxed">{localSuccess}</p>
                        <p className="text-[11px] text-[#166534]/90 mt-1">
                          Your credentials have been securely updated. You may now sign in to your institutional portal with your new password.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        clearRecovery(portal);
                        setMode('login');
                        setLocalSuccess(null);
                        setLocalError(null);
                        if (onNavigatePortal) {
                          onNavigatePortal(portal);
                        }
                      }}
                      className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Proceed to {isStudentPortal ? 'Student' : 'Faculty'} Sign In</span>
                    </button>
                  </div>
                ) : (!session || recoveryError) ? (
                  /* Scenario 2: Recovery session missing or expired - NEVER render password form */
                  <div className="space-y-3.5 pt-1">
                    <div 
                      role="alert" 
                      className="p-3.5 rounded-lg bg-[#FFF5F2] border border-[#F2C4B3] text-[#A63214] text-xs flex items-start space-x-2.5"
                    >
                      <AlertCircle className="w-5 h-5 text-[#A63214] flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-xs sm:text-sm">Password Reset Link Invalid or Expired</p>
                        <p className="text-xs leading-relaxed text-[#80220A]">
                          {recoveryError || 'No active password recovery session was found. Your password reset link may have expired, already been used, or the session was interrupted.'}
                        </p>
                        <p className="text-[11px] text-[#A63214]/80 mt-1">
                          For security, passwords can only be changed with a valid, active institutional recovery link.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot_password');
                          setLocalError(null);
                          clearError();
                        }}
                        className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                      >
                        <Mail className="w-4 h-4" />
                        <span>Request New Password Reset Link</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          clearRecovery(portal);
                          setMode('login');
                          setLocalError(null);
                          clearError();
                          if (onNavigatePortal) {
                            onNavigatePortal(portal);
                          }
                        }}
                        className="btn-secondary w-full text-xs font-semibold min-h-[40px] flex items-center justify-center space-x-2"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Return to {isStudentPortal ? 'Student' : isAdminPortal ? 'Admin' : 'Faculty'} Sign In</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Scenario 3: Valid recovery session verified - render form */
                  <>
                    <div className="p-2.5 bg-academic-surfaceAlt border border-academic-border rounded-lg text-xs flex items-center space-x-2 text-academic-deepGreen">
                      <ShieldCheck className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                      <span className="truncate">
                        Resetting password for: <strong className="font-semibold">{session.user?.email || user?.email}</strong>
                      </span>
                    </div>

                    {localError && (
                      <div 
                        role="alert" 
                        className="p-3 rounded-lg bg-[#FFF5F2] border border-[#F2C4B3] text-[#A63214] text-xs flex items-start space-x-2.5 animate-in fade-in"
                      >
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 font-medium leading-relaxed">
                          {localError}
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleResetSubmit} className="space-y-3.5" noValidate>
                      {/* New Password */}
                      <div>
                        <label 
                          htmlFor="reset-new-password" 
                          className="block text-xs font-semibold text-academic-deepGreen mb-1"
                        >
                          New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            id="reset-new-password"
                            type={showNewPassword ? 'text' : 'password'}
                            required
                            disabled={isSubmitting}
                            value={newPassword}
                            onChange={(e) => {
                              setNewPassword(e.target.value);
                              if (localError) setLocalError(null);
                            }}
                            placeholder="••••••••••••"
                            className="input-academic pl-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-academic-muted hover:text-academic-deepGreen focus:outline-none"
                            tabIndex={-1}
                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm Password */}
                      <div>
                        <label 
                          htmlFor="reset-confirm-password" 
                          className="block text-xs font-semibold text-academic-deepGreen mb-1"
                        >
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            id="reset-confirm-password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            disabled={isSubmitting}
                            value={confirmPassword}
                            onChange={(e) => {
                              setConfirmPassword(e.target.value);
                              if (localError) setLocalError(null);
                            }}
                            placeholder="••••••••••••"
                            className="input-academic pl-10 pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-academic-muted hover:text-academic-deepGreen focus:outline-none"
                            tabIndex={-1}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Password Strength Checklist */}
                      <div className="p-2.5 bg-academic-surfaceAlt rounded-lg border border-academic-border text-[11px] space-y-1">
                        <p className="font-semibold text-academic-deepGreen mb-1">Password Requirements:</p>
                        <div className="flex items-center space-x-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isLenValid ? 'bg-academic-primaryGreen' : 'bg-[#C9C0AF]'}`} />
                          <span className={isLenValid ? 'text-academic-primaryGreen font-semibold' : 'text-academic-muted'}>
                            At least 8 characters
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isAlphanumeric ? 'bg-academic-primaryGreen' : 'bg-[#C9C0AF]'}`} />
                          <span className={isAlphanumeric ? 'text-academic-primaryGreen font-semibold' : 'text-academic-muted'}>
                            Contains letters and numbers
                          </span>
                        </div>
                        {confirmPassword.length > 0 && (
                          <div className="flex items-center space-x-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isMatchValid ? 'bg-academic-primaryGreen' : 'bg-[#A63214]'}`} />
                            <span className={isMatchValid ? 'text-academic-primaryGreen font-semibold' : 'text-[#A63214] font-semibold'}>
                              {isMatchValid ? 'Passwords match' : 'Passwords do not match'}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting || !isLenValid || !isAlphanumeric || !isMatchValid}
                        className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Updating Password...</span>
                          </>
                        ) : (
                          <span>Save and Confirm New Password</span>
                        )}
                      </button>

                      <div className="pt-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            clearRecovery(portal);
                            setMode('login');
                            setLocalError(null);
                            clearError();
                            if (onNavigatePortal) {
                              onNavigatePortal(portal);
                            }
                          }}
                          className="inline-flex items-center text-xs font-semibold text-academic-muted hover:text-academic-deepGreen transition-colors focus:outline-none"
                        >
                          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                          <span>Cancel and Return to Sign In</span>
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </>
            )}

            {/* -----------------------------------------------------------------------
                SECURITY GUARANTEE NOTICE
               ----------------------------------------------------------------------- */}
            <div className="pt-2.5 border-t border-academic-borderSubtle text-[11px] text-academic-muted leading-relaxed flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-academic-primaryGreen flex-shrink-0 mt-0.5" />
              <p>
                Secure institutional login. Access is restricted to authorized faculty, students, and administration. Role permissions are centrally managed.
              </p>
            </div>
          </div>

          {/* Institutional Footer */}
          <p className="text-center text-[11px] text-academic-muted">
            AcadAssess &bull; Verified Institutional Authentication
          </p>
        </div>
      </div>
    </AcademicBackground>
  );
};
