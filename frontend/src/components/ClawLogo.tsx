"use client";

export function ClawLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left claw arm — angular, geometric */}
      <path
        d="M8 12 L20 8 L26 20 L18 32 L8 28 Z"
        fill="#f5a623"
        opacity="0.9"
      />
      <path
        d="M18 32 L26 20 L30 28 L24 40 L14 38 Z"
        fill="#d4891a"
        opacity="0.85"
      />
      {/* Right claw arm — mirror angular */}
      <path
        d="M56 12 L44 8 L38 20 L46 32 L56 28 Z"
        fill="#f5a623"
        opacity="0.9"
      />
      <path
        d="M46 32 L38 20 L34 28 L40 40 L50 38 Z"
        fill="#d4891a"
        opacity="0.85"
      />
      {/* Center body — geometric diamond */}
      <path
        d="M32 16 L40 28 L32 52 L24 28 Z"
        fill="#f5a623"
      />
      {/* Inner detail — angular cut */}
      <path
        d="M32 22 L37 30 L32 46 L27 30 Z"
        fill="#1a1a1a"
        opacity="0.3"
      />
    </svg>
  );
}
