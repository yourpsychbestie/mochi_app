import React from "react";

// Panda2: Panda dormido (referencia: parte superior central)
export default function Panda2({ size = 180 }) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 256 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Cuerpo */}
      <ellipse cx="128" cy="140" rx="80" ry="38" fill="#FFF6E9" />
      {/* Pierna trasera */}
      <ellipse cx="200" cy="160" rx="28" ry="14" fill="#3B2C25" />
      {/* Pierna delantera */}
      <ellipse cx="70" cy="160" rx="28" ry="14" fill="#3B2C25" />
      {/* Cabeza */}
      <ellipse cx="100" cy="70" rx="60" ry="50" fill="#FFF6E9" />
      {/* Oreja izquierda */}
      <ellipse cx="50" cy="30" rx="18" ry="18" fill="#3B2C25" />
      {/* Oreja derecha */}
      <ellipse cx="130" cy="20" rx="18" ry="18" fill="#3B2C25" />
      {/* Ojo izquierdo (cerrado) */}
      <path d="M75 70 Q80 75 85 70" stroke="#3B2C25" strokeWidth="4" strokeLinecap="round" />
      {/* Ojo derecho (cerrado) */}
      <path d="M110 70 Q115 75 120 70" stroke="#3B2C25" strokeWidth="4" strokeLinecap="round" />
      {/* Mejilla izquierda */}
      <ellipse cx="70" cy="90" rx="10" ry="7" fill="#FFD1C1" />
      {/* Mejilla derecha */}
      <ellipse cx="130" cy="90" rx="10" ry="7" fill="#FFD1C1" />
      {/* Nariz */}
      <ellipse cx="100" cy="85" rx="7" ry="4" fill="#222" />
      {/* Boca (relajada) */}
      <path d="M90 100 Q100 110 110 100" stroke="#3B2C25" strokeWidth="3" fill="none" />
      {/* Zzz */}
      <text x="170" y="30" fontSize="24" fill="#3B2C25" fontFamily="Arial">Z</text>
      <text x="185" y="18" fontSize="18" fill="#3B2C25" fontFamily="Arial">Z</text>
      <text x="195" y="8" fontSize="14" fill="#3B2C25" fontFamily="Arial">Z</text>
    </svg>
  );
}
