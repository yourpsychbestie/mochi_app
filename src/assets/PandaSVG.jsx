import React from "react";

export default function PandaSVG({ size = 120, style = {} }) {
  const OL = "#3a2010";
  const GR = "#6a6a6a";
  const WH = "#ffffff";
  const PK = "#f4a898";
  return (
    <svg viewBox="-44 -55 88 160" width={size} style={{ display: "block", ...style }}>
      <g>
        <ellipse cx="0" cy="98" rx="28" ry="6" fill={OL} opacity="0.10"/>
        <rect x="-20" y="72" width="17" height="28" rx="8" fill={GR} stroke={OL} strokeWidth="1.8"/>
        <rect x="3" y="72" width="17" height="28" rx="8" fill={GR} stroke={OL} strokeWidth="1.8"/>
        <path d="M-18 96 Q-14 100 -10 96" fill="none" stroke={OL} strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M5 96 Q9 100 13 96" fill="none" stroke={OL} strokeWidth="1.2" strokeLinecap="round"/>
        <ellipse cx="0" cy="56" rx="30" ry="34" fill={WH} stroke={OL} strokeWidth="2"/>
        <path d="M-30 42 C-44 42 -46 58 -38 66 C-34 70 -28 68 -26 62" fill={GR} stroke={OL} strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M30 42 C44 42 46 58 38 66 C34 70 28 68 26 62" fill={GR} stroke={OL} strokeWidth="1.8" strokeLinejoin="round"/>
        <circle cx="0" cy="-4" r="36" fill={WH} stroke={OL} strokeWidth="2"/>
        <circle cx="-28" cy="-36" r="13" fill={GR} stroke={OL} strokeWidth="1.8"/>
        <circle cx="28" cy="-36" r="13" fill={GR} stroke={OL} strokeWidth="1.8"/>
        <ellipse cx="-12" cy="-6" rx="13" ry="12" fill={GR} stroke={OL} strokeWidth="1.2" transform="rotate(-10 -12 -6)"/>
        <ellipse cx="12" cy="-6" rx="13" ry="12" fill={GR} stroke={OL} strokeWidth="1.2" transform="rotate(10 12 -6)"/>
        <circle cx="-12" cy="-6" r="5.5" fill="#4a3a2a" stroke={OL} strokeWidth="0.6"/>
        <circle cx="12" cy="-6" r="5.5" fill="#4a3a2a" stroke={OL} strokeWidth="0.6"/>
        <circle cx="-10" cy="-8" r="2" fill={WH} opacity="0.8"/>
        <circle cx="14" cy="-8" r="2" fill={WH} opacity="0.8"/>
        <path d="M-4 4 Q0 7 4 4 Q2 9 0 9 Q-2 9 -4 4Z" fill={OL} opacity="0.85"/>
        <path d="M-6 13 Q0 18 6 13" fill="none" stroke={OL} strokeWidth="1.8" strokeLinecap="round"/>
        <ellipse cx="-22" cy="6" rx="10" ry="6" fill={PK} opacity="0.7"/>
        <ellipse cx="22" cy="6" rx="10" ry="6" fill={PK} opacity="0.7"/>
      </g>
    </svg>
  );
}
