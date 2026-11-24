import { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { CameraStatus, LeaderboardEntry, LeanInputState } from '../types/game';

interface AttractOverlayProps {
  lean: LeanInputState;
  cameraStatus: CameraStatus;
  cameraError: string;
  leaderboard: LeaderboardEntry[];
  muted: boolean;
  isFullscreen: boolean;
  onAttachPreviewCanvas: (canvas: HTMLCanvasElement | null) => void;
  onStartFlight: () => void;
  onRecalibrate: () => void;
  onRetryCamera: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}

export function AttractOverlay({
  lean,
  cameraStatus,
  cameraError,
  leaderboard,
  muted,
  isFullscreen,
  onAttachPreviewCanvas,
  onStartFlight,
  onRecalibrate,
  onRetryCamera,
  onToggleMute,
  onToggleFullscreen,
}: AttractOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showBoard, setShowBoard] = useState(false);

  useEffect(() => {
    onAttachPreviewCanvas(canvasRef.current);
    return () => onAttachPreviewCanvas(null);
  }, [onAttachPreviewCanvas]);

  const slots = Array.from({ length: 10 }, (_, idx) => leaderboard[idx] ?? null);

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-between px-4 py-5 sm:py-7 pointer-events-none">
      {/* Top Bar: Leaderboard + Discreet Booth Operator Controls */}
      <div className="w-full flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowBoard(true)}
          className="pointer-events-auto min-h-11 px-4 py-2 rounded-xl bg-[#07152e]/90 hover:bg-[#0c2147] text-cyan-200 border border-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.22)] font-display font-bold text-base tracking-wide flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span>LEADERBOARD</span>
        </button>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onRecalibrate}
            className="min-h-11 px-3.5 py-2 rounded-xl bg-[#07152e]/90 hover:bg-[#0c2147] text-white border border-cyan-400/50 font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <span>Recalibrate Center</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="min-h-11 min-w-11 px-3 py-2 rounded-xl bg-[#07152e]/90 hover:bg-[#0c2147] text-white border border-cyan-400/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="min-h-11 min-w-11 px-3 py-2 rounded-xl bg-[#07152e]/90 hover:bg-[#0c2147] text-white border border-cyan-400/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Centered Stacked Arcade Title + Glowing Navy Webcam Box + CTA */}
      <div className="flex flex-col items-center justify-center my-auto w-full max-w-xl gap-3 sm:gap-4 pointer-events-auto">
        <div className="select-none text-center leading-[0.86] mb-1">
          <div
            className="font-display font-black uppercase text-white tracking-tight text-[64px] sm:text-[84px]"
            style={{
              textShadow:
                '0 4px 0 #0e7490, 0 7px 0 #083344, 0 12px 22px rgba(7,21,46,0.48)',
            }}
          >
            SKY
          </div>
          <div
            className="font-display font-black uppercase text-[#facc15] tracking-tight text-[68px] sm:text-[90px]"
            style={{
              textShadow:
                '0 4px 0 #b45309, 0 7px 0 #78350f, 0 12px 24px rgba(7,21,46,0.52)',
            }}
          >
            RUSH
          </div>
        </div>

        <div className="relative w-[290px] sm:w-[360px] aspect-[4/3] rounded-2xl bg-[#07152e] border-[3px] border-cyan-400 shadow-[0_0_32px_rgba(34,211,238,0.48)] overflow-hidden">
          <canvas
            ref={canvasRef}
            width={360}
            height={270}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 min-h-6 text-center">
          {cameraStatus === 'active' ? (
            <span className="font-display font-bold uppercase tracking-wider text-sm text-[#fef08a] drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
              {lean.personDetected
                ? `PILOT LOCKED · MOVE HEAD LEFT / CENTER / RIGHT${lean.peopleCount > 1 ? ' (CROWD FILTERED)' : ''}`
                : 'CAMERA READY · MOVE HEAD LEFT / CENTER / RIGHT'}
            </span>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-display font-bold uppercase tracking-wider text-xs sm:text-sm text-[#fef08a] drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
                {cameraError || 'NO CAMERA — USE TOUCH LANES'}
              </span>
              {cameraStatus !== 'initializing' && (
                <button
                  type="button"
                  onClick={onRetryCamera}
                  className="px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-[#07152e] font-display font-black text-xs uppercase cursor-pointer"
                >
                  Retry Camera
                </button>
              )}
            </div>
          )}
        </div>

        <h1
          className="font-display font-black uppercase text-center text-[#fffbeb] text-2xl sm:text-4xl tracking-wide px-2"
          style={{
            textShadow: '0 3px 0 #0f172a, 0 5px 14px rgba(0,0,0,0.45)',
          }}
        >
          PRESS START FLIGHT WHEN READY
        </h1>

        <button
          type="button"
          onClick={onStartFlight}
          className="min-h-14 px-10 py-3.5 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_6px_0_#b45309,0_12px_28px_rgba(7,21,46,0.45)] flex items-center justify-center gap-2.5 transition-all cursor-pointer"
        >
          <Play className="w-6 h-6 fill-[#07152e]" />
          <span>START FLIGHT</span>
        </button>
      </div>

      <div className="text-center text-xs font-semibold text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
        Head-controlled 3-lane hot air balloon runner · Dodge storms &amp; grab gold coins
      </div>

      {/* Optional Attract-Screen Top 10 Leaderboard Modal */}
      {showBoard && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#030b1a]/80 pointer-events-auto">
          <div className="w-full max-w-lg rounded-3xl bg-[#07152e] border-2 border-cyan-400 shadow-[0_0_32px_rgba(34,211,238,0.4)] p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-6 h-6 text-yellow-400" />
                <h2 className="font-display font-black text-2xl sm:text-3xl tracking-wide text-cyan-300 uppercase">
                  TOP 10 LEADERBOARD
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowBoard(false)}
                aria-label="Close Leaderboard"
                className="min-h-10 min-w-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {slots.map((entry, idx) => (
                <div
                  key={entry ? entry.id : `empty-${idx}`}
                  className={`flex items-center justify-between px-4 py-2 rounded-xl font-display font-bold text-lg ${
                    entry
                      ? idx === 0
                        ? 'bg-amber-400/18 border border-amber-400/50 text-white'
                        : 'bg-[#0c2147]/80 text-white'
                      : 'bg-[#0b1b38]/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-6 text-center text-slate-300">{idx + 1}</span>
                    <span className="truncate tracking-wide uppercase">
                      {entry ? entry.name : '---'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono-tabular text-base shrink-0">
                    {entry ? (
                      <>
                        <span className="text-xs text-yellow-300 font-bold">
                          {entry.coins}c
                        </span>
                        <span className="font-extrabold text-yellow-400 w-20 text-right">
                          {entry.score.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600">--</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowBoard(false)}
              className="mt-5 w-full min-h-12 rounded-full bg-gradient-to-b from-yellow-300 to-amber-500 text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#b45309] cursor-pointer"
            >
              BACK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
