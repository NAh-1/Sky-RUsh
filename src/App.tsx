import { useCallback, useEffect, useRef, useState } from 'react';
import { SoundEngine } from './audio/soundEngine';
import { AttractOverlay } from './components/AttractOverlay';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { SkyRushEngine } from './game/skyRushEngine';
import {
  loadLeaderboard,
  saveLeaderboardEntry,
  type CameraStatus,
  type GamePhase,
  type HudSnapshot,
  type LeaderboardEntry,
  type LeanInputState,
  type RunSummary,
  type SkyLane,
} from './types/game';
import { PoseController } from './vision/poseController';

const INITIAL_LEAN: LeanInputState = {
  x: 0,
  y: 0,
  targetLane: 0,
  burnerOn: false,
  venting: false,
  personDetected: false,
  calibrated: true,
  readyProgress: 0,
  trackedSpan: 0,
  peopleCount: 0,
};

const INITIAL_HUD: HudSnapshot = {
  score: 0,
  altitude: 120,
  speedKmh: 68,
  coins: 0,
  combo: 1,
  comboTimer: 0,
  shieldActive: false,
  magnetTimer: 0,
  thermalTimer: 0,
  nearHazard: false,
  eventBanner: null,
  eventTone: 'gold',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const poseRef = useRef<PoseController | null>(null);
  const engineRef = useRef<SkyRushEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('attract');
  const phaseRef = useRef<GamePhase>('attract');

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('initializing');
  const [cameraError, setCameraError] = useState('');
  const [lean, setLean] = useState<LeanInputState>(INITIAL_LEAN);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTouchPad, setShowTouchPad] = useState(false);

  const startFlight = useCallback(() => {
    soundRef.current?.unlock();
    poseRef.current?.setVirtualLane(null);
    phaseRef.current = 'playing';
    setPhase('playing');
    setSummary(null);
    engineRef.current?.setPhase('playing');
  }, []);

  const returnToAttract = useCallback(() => {
    soundRef.current?.unlock();
    phaseRef.current = 'attract';
    setPhase('attract');
    setSummary(null);
    engineRef.current?.setPhase('attract');
  }, []);

  const handleGameOver = useCallback((runSummary: RunSummary) => {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    setSummary(runSummary);
  }, []);

  const handleSaveScore = useCallback(
    (playerName: string) => {
      if (!summary) {
        return { entries: leaderboard, rank: 0, savedId: '' };
      }
      const res = saveLeaderboardEntry(playerName, summary);
      setLeaderboard(res.entries);
      return res;
    },
    [summary, leaderboard]
  );

  // Initialize Sound, PoseController, and Three.js Engine once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const sound = new SoundEngine();
    soundRef.current = sound;

    const pose = new PoseController((status, msg) => {
      setCameraStatus(status);
      setCameraError(msg);
    });
    poseRef.current = pose;
    void pose.init();

    let lastUiSync = 0;

    const engine = new SkyRushEngine({
      container,
      sound,
      getInputState: (isAttract) => {
        const nextLean = pose.update(isAttract);
        const now = performance.now();
        if (phaseRef.current !== 'gameover' && now - lastUiSync > 50) {
          lastUiSync = now;
          setLean({ ...nextLean });
        }
        return nextLean;
      },
      onHudUpdate: (nextHud) => setHud(nextHud),
      onGameOver: handleGameOver,
    });
    engineRef.current = engine;

    const onBlur = () => pose.setVirtualLane(null);
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      engine.dispose();
      pose.dispose();
      sound.dispose();
    };
  }, [handleGameOver, startFlight]);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleAttachPreviewCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    previewCanvasRef.current = canvas;
    poseRef.current?.attachPreviewCanvas(canvas);
  }, []);

  const handleRecalibrate = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playTap();
    poseRef.current?.recalibrate();
  }, []);

  const handleRetryCamera = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playTap();
    poseRef.current?.dispose();
    const pose = new PoseController((status, msg) => {
      setCameraStatus(status);
      setCameraError(msg);
    });
    pose.attachPreviewCanvas(previewCanvasRef.current);
    poseRef.current = pose;
    void pose.init();
  }, []);

  const handleToggleMute = useCallback(() => {
    soundRef.current?.unlock();
    setMuted((prev) => {
      const next = !prev;
      soundRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playTap();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        // Ignore if iframe blocks fullscreen
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const handleSelectVirtualLane = useCallback((lane: SkyLane | null) => {
    soundRef.current?.unlock();
    soundRef.current?.playTap();
    poseRef.current?.setVirtualLane(lane);
  }, []);

  const getCameraVideo = useCallback(
    () => poseRef.current?.getVideoElement() ?? null,
    []
  );

  const handleKeyTapSound = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playTap();
  }, []);

  const handleCountdownSound = useCallback((count: number) => {
    soundRef.current?.unlock();
    soundRef.current?.playCountdownTick(count);
  }, []);

  const handleShutterSound = useCallback(() => {
    soundRef.current?.unlock();
    soundRef.current?.playShutter();
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {phase === 'attract' && (
        <AttractOverlay
          lean={lean}
          cameraStatus={cameraStatus}
          cameraError={cameraError}
          leaderboard={leaderboard}
          muted={muted}
          isFullscreen={isFullscreen}
          onAttachPreviewCanvas={handleAttachPreviewCanvas}
          onStartFlight={startFlight}
          onRecalibrate={handleRecalibrate}
          onRetryCamera={handleRetryCamera}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
        />
      )}

      {phase === 'playing' && (
        <GameHud
          hud={hud}
          lean={lean}
          cameraStatus={cameraStatus}
          showTouchPad={showTouchPad}
          muted={muted}
          isFullscreen={isFullscreen}
          onAttachPreviewCanvas={handleAttachPreviewCanvas}
          onRestart={startFlight}
          onRecalibrate={handleRecalibrate}
          onToggleTouchPad={() => {
            soundRef.current?.unlock();
            soundRef.current?.playTap();
            setShowTouchPad((v) => !v);
          }}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onSelectVirtualLane={handleSelectVirtualLane}
        />
      )}

      {phase === 'gameover' && summary && (
        <GameOverModal
          summary={summary}
          leaderboard={leaderboard}
          getCameraVideo={getCameraVideo}
          onSaveScore={handleSaveScore}
          onPlayAgain={startFlight}
          onReturnToAttract={returnToAttract}
          onKeyTapSound={handleKeyTapSound}
          onCountdownSound={handleCountdownSound}
          onShutterSound={handleShutterSound}
        />
      )}
    </main>
  );
}
