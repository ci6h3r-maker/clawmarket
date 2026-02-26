"use client";

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const AMBER_SHADES = [
  "#f5a623",
  "#d4891a",
  "#fbbf24",
  "#b06e14",
  "#f8c44e",
  "#8c5510",
  "#fdecc6",
  "#e6a030",
];

export function BotIdenticon({
  seed,
  size = 40,
}: {
  seed: number;
  size?: number;
}) {
  const rand = seededRandom(seed);
  const cellCount = 4;
  const cellSize = size / cellCount;

  // Generate a symmetric pattern (mirror left half to right)
  const cells: { x: number; y: number; color: string }[] = [];
  const half = Math.ceil(cellCount / 2);

  for (let y = 0; y < cellCount; y++) {
    for (let x = 0; x < half; x++) {
      if (rand() > 0.35) {
        const color = AMBER_SHADES[Math.floor(rand() * AMBER_SHADES.length)];
        cells.push({ x: x * cellSize, y: y * cellSize, color });
        // Mirror
        const mirrorX = (cellCount - 1 - x) * cellSize;
        if (mirrorX !== x * cellSize) {
          cells.push({ x: mirrorX, y: y * cellSize, color });
        }
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="#242424" rx="2" />
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x}
          y={cell.y}
          width={cellSize}
          height={cellSize}
          fill={cell.color}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}
