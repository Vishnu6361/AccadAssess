import React from 'react';
import { AcadAssessLogo } from '../../components/AcadAssessLogo';
import { AcademicBackground } from '../../components/AcademicBackground';
import { 
  GraduationCap, 
  Users, 
  ArrowRight, 
  ShieldCheck,
  Building2
} from 'lucide-react';

interface PortalSelectionViewProps {
  onSelectPortal: (portal: 'student' | 'faculty' | 'admin') => void;
}

export const PortalSelectionView: React.FC<PortalSelectionViewProps> = ({ onSelectPortal }) => {
  return (
    <AcademicBackground>
      <div className="w-full flex-1 flex flex-col justify-center items-center px-4 sm:px-6 py-4 sm:py-6 my-auto max-w-full">
        <div className="w-full max-w-[880px] space-y-3.5 sm:space-y-4">
          
          {/* =========================================================================
              HEADER SECTION (Compact Institutional Branding)
             ========================================================================= */}
          <div className="text-center">
            <AcadAssessLogo variant="full" size="sm" />
          </div>

          {/* =========================================================================
              PORTAL SELECTION CARDS CONTAINER
             ========================================================================= */}
          <div className="bg-white border border-academic-border rounded-xl shadow-academicCard p-4 sm:p-5 space-y-3.5">
            <div className="text-center border-b border-academic-borderSubtle pb-2.5">
              <h1 className="text-sm sm:text-base font-bold text-academic-deepGreen">
                Select Your Academic Portal
              </h1>
              <p className="text-xs text-academic-muted mt-0.5">
                Please select your authorized portal to sign in with your verified institutional credentials.
              </p>
            </div>

            {/* Three Prominent Portal Cards (3 columns on desktop/tablet, equal height) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
              
              {/* Card 1: Student Portal */}
              <div className="flex flex-col justify-between h-full p-4 rounded-lg border border-academic-border bg-academic-surfaceAlt hover:border-academic-primaryGreen/60 hover:shadow-sm transition-all group">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-academic-lightGreen text-academic-primaryGreen group-hover:bg-academic-primaryGreen group-hover:text-white transition-colors flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-bold text-academic-deepGreen">
                      Student Portal
                    </h2>
                    <p className="text-xs text-academic-muted mt-0.5 leading-snug">
                      Access assessments, submit coursework, and view results.
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-academic-borderSubtle">
                  <button
                    type="button"
                    onClick={() => onSelectPortal('student')}
                    className="btn-primary w-full text-xs font-bold min-h-[42px] flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <span>Student Portal Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card 2: Faculty Portal */}
              <div className="flex flex-col justify-between h-full p-4 rounded-lg border border-academic-border bg-academic-surfaceAlt hover:border-academic-primaryGreen/60 hover:shadow-sm transition-all group">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-academic-lightGreen text-academic-primaryGreen group-hover:bg-academic-primaryGreen group-hover:text-white transition-colors flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-bold text-academic-deepGreen">
                      Faculty Portal
                    </h2>
                    <p className="text-xs text-academic-muted mt-0.5 leading-snug">
                      Create assessments, evaluate submissions, and grade rubrics.
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-academic-borderSubtle">
                  <button
                    type="button"
                    onClick={() => onSelectPortal('faculty')}
                    className="btn-primary w-full text-xs font-bold min-h-[42px] flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <span>Faculty Portal Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card 3: Admin Portal (HOD) */}
              <div className="flex flex-col justify-between h-full p-4 rounded-lg border border-academic-border bg-academic-surfaceAlt hover:border-academic-primaryGreen/60 hover:shadow-sm transition-all group">
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-academic-lightGreen text-academic-primaryGreen group-hover:bg-academic-primaryGreen group-hover:text-white transition-colors flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs sm:text-sm font-bold text-academic-deepGreen">
                      Admin Portal
                    </h2>
                    <p className="text-xs text-academic-muted mt-0.5 leading-snug">
                      Academic structure, user directory, and institutional oversight.
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-academic-borderSubtle">
                  <button
                    type="button"
                    onClick={() => onSelectPortal('admin')}
                    className="btn-primary w-full text-xs font-bold min-h-[42px] flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <span>Admin Portal Login</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

            </div>

            {/* Security Guarantee Note */}
            <div className="pt-2 border-t border-academic-borderSubtle text-[11px] text-academic-muted leading-normal flex items-center justify-center space-x-1.5 text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-academic-primaryGreen flex-shrink-0" />
              <span>
                Supabase Auth verified &bull; Database-backed role isolation &bull; Strict portal access governance
              </span>
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
