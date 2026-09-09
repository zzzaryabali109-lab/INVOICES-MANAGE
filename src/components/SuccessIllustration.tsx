import React from 'react';

interface SuccessIllustrationProps {
  size?: number;
  className?: string;
}

export function SuccessIllustration({ size = 180, className = '' }: SuccessIllustrationProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative mx-auto flex items-center justify-center select-none ${className}`}
    >
      <svg
        viewBox="0 0 220 200"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        {/* Soft pastel-yellow/peach horizontal grounding rounded capsules behind the badge */}
        <rect x="36" y="120" width="148" height="9" rx="4.5" fill="#fef0cd" opacity="0.9" />
        <rect x="62" y="133" width="96" height="8" rx="4" fill="#fef0cd" opacity="0.65" />
        <rect x="85" y="145" width="50" height="7" rx="3.5" fill="#fef0cd" opacity="0.45" />

        {/* --- Confetti & Particles exactly as in reference image --- */}

        {/* Coral hollow circles */}
        <circle cx="38" cy="74" r="4.5" stroke="#ff3b68" strokeWidth="2" fill="none" />
        <circle cx="178" cy="62" r="4.5" stroke="#ff3b68" strokeWidth="2" fill="none" />
        <circle cx="186" cy="120" r="3.5" stroke="#ff3b68" strokeWidth="1.8" fill="none" />

        {/* Tiny coral solid dots */}
        <circle cx="146" cy="40" r="2.5" fill="#ff3b68" />
        <circle cx="56" cy="128" r="2" fill="#ff3b68" />

        {/* Golden / yellow sparkles and dots */}
        <circle cx="52" cy="52" r="3" fill="#fec024" />
        <circle cx="166" cy="42" r="2.5" fill="#fec024" />
        <circle cx="30" cy="138" r="2.5" fill="#fec024" />
        <circle cx="192" cy="94" r="2.5" fill="#fec024" />
        <circle cx="150" cy="94" r="2" fill="#fde047" />

        {/* 4-point golden sparkle clusters (tiny starburst dots from image) */}
        <path d="M182 82L183.5 84.5L186 86L183.5 87.5L182 90L180.5 87.5L178 86L180.5 84.5Z" fill="#fec024" />
        <path d="M50 82L51 83.5L52.5 84.5L51 85.5L50 87L49 85.5L47.5 84.5L49 83.5Z" fill="#fec024" />

        {/* Golden plus signs '+' matching reference positions */}
        {/* Left side plus */}
        <path d="M44 98H52M48 94V102" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" />
        {/* Top-right plus */}
        <path d="M152 64H158M155 61V67" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        {/* Top-center plus */}
        <path d="M96 46H100M98 44V48" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />

        {/* Segmented coral outer arc ring with breaks (exact visual feature of reference) */}
        <path
          d="M86 52 C94 48, 103 46, 110 46 C140 46, 164 70, 164 100 C164 116, 157 131, 146 142"
          stroke="#ff3b68"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeDasharray="64 14"
        />
        <path
          d="M66 84 C60 94, 60 106, 64 118"
          stroke="#ff3b68"
          strokeWidth="3.8"
          strokeLinecap="round"
        />

        {/* Main Central Badge: Sunny Yellow Circle with Coral-Red Outline */}
        <circle
          cx="110"
          cy="100"
          r="42"
          fill="#ffd84d"
          stroke="#ff3b68"
          strokeWidth="4.8"
        />

        {/* Checkmark: Coral-Red stroke with rounded line ends */}
        <path
          d="M96 102 L106 112 L127 88"
          stroke="#ff3b68"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
