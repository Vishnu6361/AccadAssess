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
  ArrowRight 
} from 'lucide-react';

export interface ResetPasswordViewProps {
  portal?: 'student' | 'faculty';
  onSuccessRedirect?: () => void;
  onNavigatePortal?: (portal: 'student' | 'faculty') => void;
  onBackToSelection?: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({
  portal = 'faculty',
  onSuccessRedirect,
  onNavigatePortal,
  onBackToSelection
}) => {
  const { 
    user, 
    session, 
    isPasswordRecovery, 
    recoveryError, 
    updatePassword, 
    clearRecovery 
  } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);
  const [localSuccess, setLocalSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Real-time validation checks
  const isLenValid = newPassword.length >= 8;
  const isAlphanumeric = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const isMatchValid = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = !isSubmitting && isLenValid && isAlphanumeric && isMatchValid;

  // Handle password submission
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalSuccess(null);

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
      setCountdown(3);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to update password. Please request a new link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-redirect to faculty login after successful password update
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      clearRecovery(portal);
      if (onSuccessRedirect) {
        onSuccessRedirect();
      } else if (onNavigatePortal) {
        onNavigatePortal(portal);
      } else if (typeof window !== 'undefined') {
        window.location.href = portal === 'student' ? '/student/login' : '/faculty/login';
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, clearRecovery, onSuccessRedirect, onNavigatePortal, portal]);

  const handleImmediateProceed = () => {
    clearRecovery(portal);
    if (onSuccessRedirect) {
      onSuccessRedirect();
    } else if (onNavigatePortal) {
      onNavigatePortal(portal);
    } else if (typeof window !== 'undefined') {
      window.location.href = portal === 'student' ? '/student/login' : '/faculty/login';
    }
  };

  const hasActiveSession = Boolean(session || isPasswordRecovery);
  const displayEmail = session?.user?.email || user?.email;

  return (
    <AcademicBackground>
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-6 sm:py-8 my-auto w-full">
        <div className="w-full max-w-[500px] space-y-4">
          
          {/* Header Section */}
          <div className="text-center space-y-1.5">
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

            <h1 className="text-lg sm:text-xl font-bold text-academic-deepGreen tracking-tight">
              AcadAssess Security &bull; Set New Password
            </h1>
            <p className="text-xs text-academic-muted font-normal max-w-sm mx-auto leading-relaxed">
              Configure a new, strong password to regain access to your institutional workspace.
            </p>
          </div>

          {/* Central Card */}
          <div className="bg-white border border-academic-border rounded-xl shadow-academicCard p-5 sm:p-6 space-y-4">
            
            {/* Header Title */}
            <div className="border-b border-academic-borderSubtle pb-2.5">
              <h2 className="text-sm sm:text-base font-bold text-academic-deepGreen flex items-center space-x-2">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-academic-primaryGreen" />
                <span>Reset Account Password</span>
              </h2>
              <p className="text-xs text-academic-muted mt-0.5">
                Choose an alphanumeric institutional password with at least 8 characters.
              </p>
            </div>

            {/* SCENARIO 1: SUCCESS */}
            {localSuccess ? (
              <div className="space-y-4 pt-1">
                <div 
                  role="status" 
                  className="p-3.5 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-xs flex items-start space-x-2.5"
                >
                  <CheckCircle2 className="w-5 h-5 text-[#166534] flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-xs sm:text-sm leading-relaxed">{localSuccess}</p>
                    <p className="text-[11px] text-[#166534]/90">
                      Your credentials have been securely updated. You can now sign in with your new password.
                    </p>
                    {countdown !== null && (
                      <p className="text-[11px] font-semibold text-[#166534] pt-0.5">
                        Redirecting to Faculty Sign In in {countdown} second{countdown === 1 ? '' : 's'}...
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleImmediateProceed}
                  className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                >
                  <span>Proceed to Faculty Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (!hasActiveSession || recoveryError) ? (
              /* SCENARIO 2: INVALID OR EXPIRED RECOVERY LINK */
              <div className="space-y-4 pt-1">
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
                      For institutional security, passwords can only be changed using an active, verified recovery link.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      clearRecovery('faculty');
                      if (onNavigatePortal) {
                        onNavigatePortal('faculty');
                      } else if (typeof window !== 'undefined') {
                        window.location.href = '/faculty/login';
                      }
                    }}
                    className="btn-primary w-full text-xs sm:text-sm font-bold min-h-[42px] flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Request New Password Reset Link</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImmediateProceed}
                    className="btn-secondary w-full text-xs font-semibold min-h-[40px] flex items-center justify-center space-x-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Faculty Sign In</span>
                  </button>
                </div>
              </div>
            ) : (
              /* SCENARIO 3: ACTIVE RECOVERY SESSION - ENTER NEW PASSWORD */
              <div className="space-y-4">
                {displayEmail && (
                  <div className="p-2.5 bg-academic-surfaceAlt border border-academic-border rounded-lg text-xs flex items-center space-x-2 text-academic-deepGreen">
                    <ShieldCheck className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                    <span className="truncate">
                      Resetting password for: <strong className="font-semibold">{displayEmail}</strong>
                    </span>
                  </div>
                )}

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
                      htmlFor="pwd-new" 
                      className="block text-xs font-semibold text-academic-deepGreen mb-1"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="pwd-new"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
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
                      htmlFor="pwd-confirm" 
                      className="block text-xs font-semibold text-academic-deepGreen mb-1"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-academic-muted">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        id="pwd-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
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

                  {/* Password Requirements Checklist */}
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

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={!canSubmit}
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

                  {/* Cancel Button */}
                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={handleImmediateProceed}
                      className="inline-flex items-center text-xs font-semibold text-academic-muted hover:text-academic-deepGreen transition-colors focus:outline-none"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                      <span>Cancel and Return to Faculty Sign In</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Security Guarantee Notice */}
            <div className="pt-2.5 border-t border-academic-borderSubtle text-[11px] text-academic-muted leading-relaxed flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-academic-primaryGreen flex-shrink-0 mt-0.5" />
              <p>
                Supabase Auth securely validates password changes. Your new password will take effect immediately across all institutional services.
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-academic-muted">
            AcadAssess &bull; Verified Institutional Authentication
          </p>
        </div>
      </div>
    </AcademicBackground>
  );
};
