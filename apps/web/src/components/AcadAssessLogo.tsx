import React from 'react';

export interface AcadAssessLogoProps {
  variant?: 'full' | 'emblem' | 'compact' | 'wordmark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
  withBackground?: boolean;
}

/**
 * AcadAssess Official Institutional Brand Logo
 * 
 * Official SJB Institute of Technology (SJBIT) Institutional Identity:
 * - Emblem: Official SJBIT Crest (transparent high-res vector/raster emblem)
 * - Typography: "AcadAssess" alongside "SJB Institute of Technology"
 * - Colors: SJBIT Royal Blue (#0A2B8E), Deep Navy (#011B6A), and Amber Gold (#FFBF00)
 * - Proportions: Strictly preserved aspect ratio, zero stretching or distortion
 */

export const AcadAssessLogo: React.FC<AcadAssessLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  showSubtitle = true,
  withBackground = false
}) => {
  // Sizing definitions ensuring responsive scaling and proper proportions
  const sizeConfig = {
    sm: {
      emblem: 'w-8 h-8 max-w-[32px] max-h-[32px]',
      fullEmblem: 'w-14 h-14 max-w-[56px] max-h-[56px]',
      titleText: 'text-xl',
      instText: 'text-[10px]',
      subText: 'text-[11px]',
      gap: 'gap-1.5'
    },
    md: {
      emblem: 'w-9 h-9 sm:w-10 sm:h-10 max-w-[40px] max-h-[40px]',
      fullEmblem: 'w-16 h-16 sm:w-20 sm:h-20 max-w-[80px] max-h-[80px]',
      titleText: 'text-2xl sm:text-3xl',
      instText: 'text-xs',
      subText: 'text-xs',
      gap: 'gap-2'
    },
    lg: {
      emblem: 'w-12 h-12 max-w-[48px] max-h-[48px]',
      fullEmblem: 'w-24 h-24 max-w-[96px] max-h-[96px]',
      titleText: 'text-3xl sm:text-4xl',
      instText: 'text-sm',
      subText: 'text-sm',
      gap: 'gap-2.5'
    },
    xl: {
      emblem: 'w-16 h-16 max-w-[64px] max-h-[64px]',
      fullEmblem: 'w-28 h-28 sm:w-32 sm:h-32 max-w-[128px] max-h-[128px]',
      titleText: 'text-4xl sm:text-5xl',
      instText: 'text-base',
      subText: 'text-base',
      gap: 'gap-3'
    }
  }[size];

  // ---------------------------------------------------------------------------
  // 1. EMBLEM IMAGE (Official SJBIT Crest)
  // ---------------------------------------------------------------------------
  const EmblemImage: React.FC<{ imgClass?: string }> = ({ imgClass = '' }) => (
    <img
      src="/sjbit-emblem.png"
      alt="SJB Institute of Technology Emblem"
      className={`${imgClass} object-contain flex-shrink-0 drop-shadow-xs`}
      loading="eager"
      decoding="async"
    />
  );

  // ---------------------------------------------------------------------------
  // 2. WORDMARK COMPONENT
  // ---------------------------------------------------------------------------
  const Wordmark: React.FC<{ textClass?: string }> = ({ textClass = '' }) => (
    <span
      className={`font-black tracking-tight select-none inline-flex items-baseline ${textClass}`}
      style={{
        fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        letterSpacing: '-0.035em'
      }}
    >
      <span className="text-[#011B6A]">Acad</span>
      <span className="text-[#0A2B8E]">Assess</span>
    </span>
  );

  // ---------------------------------------------------------------------------
  // VARIANT 1: EMBLEM ONLY (Used for icon, favicon, mobile splash)
  // ---------------------------------------------------------------------------
  if (variant === 'emblem') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <EmblemImage imgClass={sizeConfig.fullEmblem} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VARIANT 2: WORDMARK ONLY
  // ---------------------------------------------------------------------------
  if (variant === 'wordmark') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <Wordmark textClass={sizeConfig.titleText} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VARIANT 3: COMPACT HORIZONTAL (Used for Sidebar header and Top Navbar)
  // ---------------------------------------------------------------------------
  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        <div className="flex-shrink-0 flex items-center justify-center">
          <EmblemImage imgClass={sizeConfig.emblem} />
        </div>
        <div className="flex flex-col leading-none">
          <Wordmark textClass="text-lg sm:text-xl" />
          <span className="text-[10px] text-academic-muted font-medium mt-0.5 tracking-tight truncate max-w-[170px] sm:max-w-[220px]">
            SJB Institute of Technology
          </span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VARIANT 4: FULL VERTICAL/CENTRAL LOGO (Portal Selection & Login Screens)
  // Displays the official SJBIT Crest with institution name and AcadAssess branding
  // ---------------------------------------------------------------------------
  const backgroundWrapperClasses = withBackground
    ? 'bg-white border border-academic-border rounded-2xl shadow-academicCard p-6'
    : '';

  return (
    <div className={`flex flex-col items-center text-center ${sizeConfig.gap} ${backgroundWrapperClasses} ${className}`}>
      {/* Official SJBIT Emblem Crest */}
      <div className="flex items-center justify-center mb-1">
        <EmblemImage imgClass={sizeConfig.fullEmblem} />
      </div>

      {/* Institutional Affiliation Header */}
      <div className="flex flex-col items-center">
        <span className={`font-semibold tracking-wider uppercase text-academic-deepGreen ${sizeConfig.instText}`}>
          SJB Institute of Technology
        </span>
        <div className="w-12 h-0.5 bg-[#FFBF00] rounded-full my-1" />
      </div>

      {/* Main AcadAssess Brand Wordmark */}
      <Wordmark textClass={sizeConfig.titleText} />

      {/* Academic Assessment Management Portal Subtitle */}
      {showSubtitle && (
        <p className={`text-academic-muted font-medium tracking-tight ${sizeConfig.subText}`}>
          Academic Assessment Management Portal
        </p>
      )}
    </div>
  );
};
