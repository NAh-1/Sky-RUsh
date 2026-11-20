import type { LeanInputState } from '../types/game';

interface LeanGaugeProps {
  lean: LeanInputState;
  compact?: boolean;
}

/**
 * Live 3-Lane Head Position Gauge showing real-time horizontal head offset
 * and which Sky Lane (LEFT / CENTER / RIGHT) is currently locked.
 */
export function LeanGauge({ lean, compact = false }: LeanGaugeProps) {
  const width = compact ? 136 : 188;
  const height = compact ? 60 : 72;
  const padX = 16;
  const travel = width / 2 - padX;
  const dotX = width / 2 + lean.x * travel;
  const trackY = height * 0.46;

  const laneLabel =
    lean.targetLane === -1
      ? 'LEFT LANE'
      : lean.targetLane === 1
      ? 'RIGHT LANE'
      : 'CENTER LANE';

  const accentColor = lean.targetLane === 0 ? '#34d399' : '#facc15';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative rounded-2xl bg-[#07152e] border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.2)] flex items-center justify-center"
        style={{ width, height }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Head Lane Gauge">
          {/* 3 Lane Segments */}
          {[-1, 0, 1].map((lane) => {
            const idx = lane + 1;
            const segW = (width - 16) / 3;
            const rx = 8 + idx * segW;
            const active = lean.targetLane === lane;
            return (
              <rect
                key={lane}
                x={rx + 1.5}
                y={7}
                width={segW - 3}
                height={height - 14}
                rx={8}
                fill={
                  active
                    ? lane === 0
                      ? 'rgba(52, 211, 153, 0.2)'
                      : 'rgba(250, 204, 21, 0.2)'
                    : 'rgba(255, 255, 255, 0.04)'
                }
                stroke={active ? accentColor : 'rgba(103, 232, 249, 0.16)'}
                strokeWidth={active ? 1.5 : 1}
              />
            );
          })}

          {/* Horizontal head track bar */}
          <line
            x1={padX}
            y1={trackY}
            x2={width - padX}
            y2={trackY}
            stroke="rgba(165, 243, 252, 0.28)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Lane labels */}
          <text
            x={8 + (width - 16) * 0.167}
            y={height - 10}
            textAnchor="middle"
            fill={lean.targetLane === -1 ? '#facc15' : 'rgba(255,255,255,0.45)'}
            fontSize="9"
            fontWeight="800"
          >
            L
          </text>
          <text
            x={width / 2}
            y={height - 10}
            textAnchor="middle"
            fill={lean.targetLane === 0 ? '#34d399' : 'rgba(255,255,255,0.45)'}
            fontSize="9"
            fontWeight="800"
          >
            C
          </text>
          <text
            x={8 + (width - 16) * 0.833}
            y={height - 10}
            textAnchor="middle"
            fill={lean.targetLane === 1 ? '#facc15' : 'rgba(255,255,255,0.45)'}
            fontSize="9"
            fontWeight="800"
          >
            R
          </text>

          {/* Live head position dot */}
          <circle cx={dotX} cy={trackY} r={compact ? 7 : 8.5} fill={accentColor} />
          <circle cx={dotX} cy={trackY} r={compact ? 3 : 3.5} fill="#ffffff" />
        </svg>
      </div>
      <div
        className="text-[11px] font-mono-tabular font-bold tracking-wider uppercase"
        style={{ color: accentColor }}
      >
        {lean.personDetected ? laneLabel : 'HEAD / TOUCH'}
      </div>
    </div>
  );
}
