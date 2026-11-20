import React from 'react';

/**
 * AcademicBackground Component
 * Renders the subtle, warm-ivory institutional canvas with classical academic illustrations
 * matching the AcadAssess reference image:
 * - Left: Stacked academic books with a graduation mortarboard cap
 * - Right: Neoclassical university administration building with dome, portico, and columns
 * - Center: Gentle rolling sage green hills / ribbon contours
 */
export const AcademicBackground: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`relative min-h-screen w-full bg-academic-bg overflow-x-hidden overflow-y-auto ${className}`}>
      {/* Decorative SVG Vector Canvas (Fixed/Absolute Background) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="warmBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#F1F5F9" />
          </linearGradient>

          <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0A2B8E" stopOpacity="0.05" />
            <stop offset="50%" stopColor="#011B6A" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#0A2B8E" stopOpacity="0.06" />
          </linearGradient>

          <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFBF00" stopOpacity="0.04" />
            <stop offset="50%" stopColor="#0A2B8E" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#FFBF00" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Base Canvas */}
        <rect width="1440" height="900" fill="url(#warmBgGrad)" />

        {/* Ambient Subtle Wave Contours */}
        <path
          d="M -100 560 Q 250 480 600 580 T 1300 540 Q 1480 520 1560 560 L 1560 920 L -100 920 Z"
          fill="url(#waveGrad1)"
        />
        <path
          d="M -50 640 Q 300 690 720 620 T 1500 660 L 1500 920 L -50 920 Z"
          fill="url(#waveGrad2)"
        />
      </svg>

      {/* Foreground Content */}
      <div className="relative z-10 w-full min-h-[100svh] flex flex-col justify-center">
        {children}
      </div>
    </div>
  );
};
