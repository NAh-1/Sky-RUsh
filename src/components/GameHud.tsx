import { useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Flame,
  Gamepad2,
  Magnet,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CameraStatus, HudSnapshot, LeanInputState, SkyLane } from '../types/game';
import { LeanGauge } from './LeanGauge';

interface GameHudProps {
  hud: HudSnapshot;
  lean: LeanInputState;
  cameraStatus: CameraStatus;
  showTouchPad: boolean;
  muted: boolean;
  isFullscreen: boolean;
  onAttachPreviewCanvas: (canvas: HTMLCanvasElement | null) => void;
  onRestart: () => void;
  onRecalibrate: () => void;
  onToggleTouchPad: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onSelectVirtualLane: (lane: SkyLane | null) => void;
}

export function GameHud({
  hud,
  lean,
  cameraStatus,
  showTouchPad,
  muted,
  isFullscreen,
  onAttachPreviewCanvas,
  onRestart,
  onRecalibrate,
  onToggleTouchPad,
  onToggleMute,
  onToggleFullscreen,
  onSelectVirtualLane,
}: GameHudProps) {
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    onAttachPreviewCanvas(miniCanvasRef.current);
    return () => onAttachPreviewCanvas(null);
  }, [onAttachPreviewCanvas]);

  const bannerColorMap = {
    gold: 'bg-amber-400 text-slate-950 border-yellow-200',
    cyan: 'bg-cyan-400 text-slate-950 border-cyan-200',
    amber: 'bg-orange-400 text-slate-950 border-orange-200',
    rose: 'bg-rose-500 text-white border-rose-300',
  };

  const touchPadActive = showTouchPad || cameraStatus !== 'active';

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
      {/* Top Perimeter HUD */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Telemetry Cluster */}
        <div className="rounded-2xl bg-[#07152e]/92 border-2 border-cyan-400/75 shadow-[0_0_20px_rgba(34,211,238,0.28)] px-4 py-3 min-w-[215px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-display text-sm font-extrabold text-cyan-300 uppercase tracking-wider">
              SCORE
            </span>
            {hud.combo > 1 && (
              <span className="font-mono-tabular text-xs font-extrabold text-amber-300">
                {hud.combo}x COMBO
              </span>
            )}
          </div>
          <div className="font-display font-black text-4xl text-yellow-400 leading-none mt-0.5 drop-shadow-[0_2px_0_rgba(0,0,0,0.65)]">
            {hud.score.toLocaleString()}
          </div>
          <div className="mt-2 pt-2 border-t border-cyan-400/20 flex items-center gap-3 text-xs font-mono-tabular text-cyan-100">
            <span className="flex items-center gap-1 text-yellow-300 font-bold">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              {hud.coins} COINS
            </span>
            <span aria-hidden="true">·</span>
            <span>{hud.speedKmh} km/h</span>
          </div>
        </div>

        {/* Top-Center Event / Hazard Warning Banner */}
        <div className="flex flex-col items-center gap-2 pt-1">
          {hud.nearHazard && (
            <div className="px-4 py-1.5 rounded-xl bg-rose-600/95 border-2 border-rose-300 text-white font-display font-extrabold text-base tracking-wide shadow-lg uppercase">
              HAZARD IN LANE — SHIFT HEAD!
            </div>
          )}
          {hud.eventBanner && (
            <div
              className={`px-4 py-1.5 rounded-xl border-2 font-display font-extrabold text-base tracking-wide shadow-lg uppercase ${
                bannerColorMap[hud.eventTone]
              }`}
            >
              {hud.eventBanner}
            </div>
          )}
        </div>

        {/* Top-Right: Active Power-Ups + Mini Pose Cam + Live 3-Lane Head Gauge */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1.5 items-end">
            {hud.shieldActive && (
              <div className="px-3 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-display font-bold text-xs flex items-center gap-1.5 shadow">
                <Shield className="w-3.5 h-3.5" />
                <span>SHIELD READY</span>
              </div>
            )}
            {hud.magnetTimer > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-rose-500 text-white font-mono-tabular font-bold text-xs flex items-center gap-1.5 shadow">
                <Magnet className="w-3.5 h-3.5" />
                <span>{hud.magnetTimer.toFixed(1)}s</span>
              </div>
            )}
            {hud.thermalTimer > 0 && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-mono-tabular font-bold text-xs flex items-center gap-1.5 shadow">
                <Flame className="w-3.5 h-3.5" />
                <span>{hud.thermalTimer.toFixed(1)}s</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl bg-[#07152e]/92 border-2 border-cyan-400/75 shadow-[0_0_20px_rgba(34,211,238,0.28)] p-2.5">
            {cameraStatus === 'active' && (
              <div className="hidden sm:block w-28 h-[84px] rounded-xl overflow-hidden bg-[#030b1a] border border-cyan-400/40">
                <canvas
                  ref={miniCanvasRef}
                  width={160}
                  height={120}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <LeanGauge lean={lean} compact />
          </div>
        </div>
      </div>

      {/* Bottom Row: Touch 3-Lane Selector + Discreet Kiosk Operator Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {touchPadActive && (
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-[#07152e]/92 border-2 border-cyan-400/70 p-2 shadow-2xl">
              <button
                type="button"
                onClick={() => onSelectVirtualLane(-1)}
                className={`min-h-14 px-5 py-2.5 rounded-xl font-display font-extrabold text-base flex items-center gap-1 transition-colors cursor-pointer ${
                  lean.targetLane === -1
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-blue-600/80 hover:bg-blue-500 text-white'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>LEFT</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectVirtualLane(0)}
                className={`min-h-14 px-5 py-2.5 rounded-xl font-display font-extrabold text-base transition-colors cursor-pointer ${
                  lean.targetLane === 0
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-blue-600/80 hover:bg-blue-500 text-white'
                }`}
              >
                CENTER
              </button>
              <button
                type="button"
                onClick={() => onSelectVirtualLane(1)}
                className={`min-h-14 px-5 py-2.5 rounded-xl font-display font-extrabold text-base flex items-center gap-1 transition-colors cursor-pointer ${
                  lean.targetLane === 1
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-blue-600/80 hover:bg-blue-500 text-white'
                }`}
              >
                <span>RIGHT</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              {cameraStatus === 'active' && (
                <button
                  type="button"
                  onClick={() => onSelectVirtualLane(null)}
                  className="min-h-14 px-3 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-200 font-semibold text-xs cursor-pointer"
                >
                  Use Head
                </button>
              )}
            </div>
          )}
        </div>

        {/* Discreet Operator Bar */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-[#07152e]/90 border border-cyan-400/50 p-2 shadow-xl">
          <button
            type="button"
            onClick={onRestart}
            className="min-h-11 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>Restart</span>
          </button>
          <button
            type="button"
            onClick={onRecalibrate}
            className="min-h-11 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <span>Recalibrate</span>
          </button>
          <button
            type="button"
            onClick={onToggleTouchPad}
            className={`min-h-11 px-3.5 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              touchPadActive
                ? 'bg-amber-400 text-slate-950'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Touch Lanes</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="min-h-11 min-w-11 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="min-h-11 min-w-11 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
