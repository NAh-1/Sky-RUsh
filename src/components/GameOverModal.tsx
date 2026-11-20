import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Check,
  Coins,
  Delete,
  ExternalLink,
  Mail,
  QrCode,
  RotateCcw,
  Send,
  X,
} from 'lucide-react';
import {
  previewPotentialRank,
  type LeaderboardEntry,
  type RunSummary,
} from '../types/game';

interface GameOverModalProps {
  summary: RunSummary;
  leaderboard: LeaderboardEntry[];
  getCameraVideo: () => HTMLVideoElement | null;
  onSaveScore: (playerName: string) => { entries: LeaderboardEntry[]; rank: number; savedId: string };
  onPlayAgain: () => void;
  onReturnToAttract: () => void;
  onKeyTapSound: () => void;
  onCountdownSound: (count: number) => void;
  onShutterSound: () => void;
}

type ModalStage = 'enter' | 'photo_prompt' | 'photo_booth' | 'leaderboard';

const NAME_KEY_ROWS = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
];

const EMAIL_KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '-'],
];

const MAX_NAME_LEN = 12;

/**
 * Renders the full branded SKY RUSH · SIS CARNIVAL social media card (900x1140)
 * into a PNG data URL suitable for local download, QR hosting, and email attachment.
 */
async function renderSocialCardPng(params: {
  snapshotUrl: string;
  playerName: string;
  score: number;
  coins: number;
  rank: number;
}): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Snapshot decode failed'));
    el.src = params.snapshotUrl;
  });

  const W = 900;
  const H = 1140;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a3a82');
  grad.addColorStop(0.55, '#0d6ec9');
  grad.addColorStop(1, '#0ea5e9');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const circles = [
    { x: 110, y: 150, r: 95, a: 0.08 },
    { x: 785, y: 195, r: 120, a: 0.09 },
    { x: 155, y: 920, r: 135, a: 0.09 },
    { x: 760, y: 940, r: 90, a: 0.08 },
  ];
  circles.forEach((c) => {
    ctx.fillStyle = `rgba(255,255,255,${c.a})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.textAlign = 'center';
  ctx.font = '900 104px "Barlow Condensed", Impact, sans-serif';
  ctx.fillStyle = '#78350f';
  ctx.fillText('SKY RUSH', W / 2, 128);
  ctx.fillStyle = '#facc15';
  ctx.fillText('SKY RUSH', W / 2, 122);

  const pillW = 360;
  const pillH = 54;
  const pillX = (W - pillW) / 2;
  const pillY = 148;
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 27);
  ctx.fill();
  ctx.fillStyle = '#07152e';
  ctx.font = '900 32px "Barlow Condensed", sans-serif';
  ctx.fillText('SIS CARNIVAL', W / 2, pillY + 38);

  const frameX = 78;
  const frameY = 236;
  const frameW = W - 156;
  const frameH = 556;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(frameX - 10, frameY - 10, frameW + 20, frameH + 20, 28);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(frameX, frameY, frameW, frameH, 20);
  ctx.clip();
  ctx.drawImage(img, frameX, frameY, frameW, frameH);
  ctx.restore();

  const badgeText = params.rank > 0 ? `TOP 10 • #${params.rank}` : 'HIGH SCORE CARD';
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.roundRect(frameX + 22, frameY + frameH - 76, 260, 52, 26);
  ctx.fill();
  ctx.fillStyle = '#07152e';
  ctx.font = '900 30px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, frameX + 22 + 130, frameY + frameH - 40);

  ctx.textAlign = 'center';
  ctx.font = '900 72px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#07152e';
  ctx.fillText(params.playerName, W / 2, 886);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(params.playerName, W / 2, 881);

  ctx.fillStyle = '#bae6fd';
  ctx.font = '800 30px "Barlow Condensed", sans-serif';
  ctx.fillText('HIGH SCORE & GOLD COINS', W / 2, 932);

  ctx.font = '900 74px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#78350f';
  const metricText = `${params.score.toLocaleString()} PTS  •  ${params.coins} COINS`;
  ctx.fillText(metricText, W / 2, 1018);
  ctx.fillStyle = '#facc15';
  ctx.fillText(metricText, W / 2, 1013);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('#SkyRush   #SISCarnival', W / 2, 1086);

  return canvas.toDataURL('image/png');
}

export function GameOverModal({
  summary,
  leaderboard,
  getCameraVideo,
  onSaveScore,
  onPlayAgain,
  onReturnToAttract,
  onKeyTapSound,
  onCountdownSound,
  onShutterSound,
}: GameOverModalProps) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState<ModalStage>('enter');
  const [savedEntries, setSavedEntries] = useState<LeaderboardEntry[]>(leaderboard);
  const [savedRank, setSavedRank] = useState<number>(0);
  const [savedId, setSavedId] = useState<string>('');
  const [savedName, setSavedName] = useState<string>('PILOT');

  // Photo Booth state
  const livePhotoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [renderedCardUrl, setRenderedCardUrl] = useState<string | null>(null);
  const [photoSavedBanner, setPhotoSavedBanner] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);

  // QR share state
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrShareUrl, setQrShareUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  // Zero-login Email delivery state
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [showMailtoFallback, setShowMailtoFallback] = useState(false);

  const potentialRank = previewPotentialRank(summary.score);

  const handleChar = (ch: string) => {
    onKeyTapSound();
    setName((prev) => (prev.length < MAX_NAME_LEN ? prev + ch : prev));
  };

  const handleBackspace = () => {
    onKeyTapSound();
    setName((prev) => prev.slice(0, -1));
  };

  const commitNameAndAdvance = useCallback(() => {
    onKeyTapSound();
    const clean = name.trim().toUpperCase().slice(0, MAX_NAME_LEN) || 'PILOT';
    const res = onSaveScore(clean);
    setSavedEntries(res.entries);
    setSavedRank(res.rank);
    setSavedId(res.savedId);
    setSavedName(clean);
    setStage('photo_prompt');
  }, [name, onKeyTapSound, onSaveScore]);

  // Physical keyboard support for Stage 1 (name entry)
  useEffect(() => {
    if (stage !== 'enter') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        setName((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        commitNameAndAdvance();
      } else if (/^[a-zA-Z0-9 ]$/.test(e.key)) {
        const up = e.key.toUpperCase();
        setName((prev) => (prev.length < MAX_NAME_LEN ? prev + up : prev));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, commitNameAndAdvance]);

  // Physical keyboard support when typing Email in Stage 3 (after capture)
  useEffect(() => {
    if (stage !== 'photo_booth' || !capturedPhotoUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        setEmail((prev) => prev.slice(0, -1));
        setEmailError('');
      } else if (/^[a-zA-Z0-9@._+\-]$/.test(e.key)) {
        setEmail((prev) => (prev.length < 64 ? prev + e.key : prev));
        setEmailError('');
        setEmailSentTo(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, capturedPhotoUrl]);

  const getCameraVideoRef = useRef(getCameraVideo);
  getCameraVideoRef.current = getCameraVideo;

  const onCountdownSoundRef = useRef(onCountdownSound);
  onCountdownSoundRef.current = onCountdownSound;

  const captureSnapRef = useRef<() => Promise<void>>(async () => {});

  // Live mirrored camera preview inside Photo Booth before capture
  useEffect(() => {
    if (stage !== 'photo_booth' || capturedPhotoUrl) return;
    let rafId = 0;

    const renderFrame = () => {
      const canvas = livePhotoCanvasRef.current;
      const video = getCameraVideoRef.current();
      if (canvas && video && video.readyState >= 2) {
        setCameraAvailable(true);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();
        }
      } else if (canvas) {
        setCameraAvailable(false);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#07152e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#67e8f9';
          ctx.font = '700 18px "Barlow Condensed", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('CAMERA UNAVAILABLE', canvas.width / 2, canvas.height / 2);
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [stage, capturedPhotoUrl]);

  const uploadForQrCode = useCallback(
    async (cardUrl: string): Promise<string | null> => {
      setQrLoading(true);
      setQrError('');
      try {
        const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageDataUrl: cardUrl,
            playerName: savedName,
            score: summary.score,
            coins: summary.coins,
            rank: savedRank,
          }),
        });
        const raw = await res.text();
        let data: { id?: string; shareUrl?: string; error?: string } = {};
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error('Photo share service is restarting — tap Retry.');
        }
        if (!res.ok || !data.id || !data.shareUrl) {
          throw new Error(data.error || 'Could not generate share link');
        }
        const qr = await QRCode.toDataURL(data.shareUrl, {
          width: 240,
          margin: 1,
          color: {
            dark: '#07152e',
            light: '#ffffff',
          },
        });
        setPhotoId(data.id);
        setQrShareUrl(data.shareUrl);
        setQrDataUrl(qr);
        return data.id;
      } catch (err) {
        setQrError(
          err instanceof Error ? err.message : 'QR upload unavailable. Use Save Photo.'
        );
        return null;
      } finally {
        setQrLoading(false);
      }
    },
    [savedName, savedRank, summary.coins, summary.score]
  );

  const captureSnapAndRender = useCallback(async () => {
    const video = getCameraVideoRef.current();
    if (!video || video.readyState < 2) return;

    onShutterSound();
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 180);

    const snap = document.createElement('canvas');
    snap.width = 640;
    snap.height = 480;
    const ctx = snap.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.translate(snap.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, snap.width, snap.height);
    ctx.restore();

    const snapshotUrl = snap.toDataURL('image/jpeg', 0.92);
    setCapturedPhotoUrl(snapshotUrl);
    setPhotoSavedBanner(false);
    setEmailSentTo(null);
    setEmailError('');
    setShowMailtoFallback(false);

    try {
      const cardPng = await renderSocialCardPng({
        snapshotUrl,
        playerName: savedName,
        score: summary.score,
        coins: summary.coins,
        rank: savedRank,
      });
      setRenderedCardUrl(cardPng);
      void uploadForQrCode(cardPng);
    } catch {
      // Fallback gracefully
    }
  }, [
    onShutterSound,
    savedName,
    savedRank,
    summary.coins,
    summary.score,
    uploadForQrCode,
  ]);

  captureSnapRef.current = captureSnapAndRender;

  // 3-2-1 Countdown timer loop (depends solely on countdown so it never resets mid-tick)
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      void captureSnapRef.current();
      return;
    }
    onCountdownSoundRef.current(countdown);
    const timer = window.setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const handleStartCountdown = () => {
    if (countdown !== null) return;
    onKeyTapSound();
    setCountdown(3);
  };

  const handleRetakePhoto = () => {
    onKeyTapSound();
    setCountdown(null);
    setCapturedPhotoUrl(null);
    setRenderedCardUrl(null);
    setPhotoSavedBanner(false);
    setPhotoId(null);
    setQrDataUrl(null);
    setQrShareUrl(null);
    setQrError('');
    setEmailSentTo(null);
    setEmailError('');
    setShowMailtoFallback(false);
  };

  const handleDownloadCard = () => {
    onKeyTapSound();
    if (!renderedCardUrl) return;
    const link = document.createElement('a');
    link.download = `sky-rush-${savedName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pilot'}.png`;
    link.href = renderedCardUrl;
    link.click();
    setPhotoSavedBanner(true);
  };

  const handleEmailKey = (token: string) => {
    onKeyTapSound();
    setEmailError('');
    setEmailSentTo(null);
    setShowMailtoFallback(false);
    setEmail((prev) => (prev.length + token.length <= 64 ? prev + token : prev));
  };

  const handleEmailBackspace = () => {
    onKeyTapSound();
    setEmailError('');
    setShowMailtoFallback(false);
    setEmail((prev) => prev.slice(0, -1));
  };

  const handleSendPhotoEmail = async () => {
    onKeyTapSound();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!renderedCardUrl) {
      setEmailError('Photo card is still preparing.');
      return;
    }

    setSendingEmail(true);
    setEmailError('');
    setEmailSentTo(null);
    setShowMailtoFallback(false);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: trimmed,
          imageDataUrl: renderedCardUrl,
          playerName: savedName,
          score: summary.score,
          coins: summary.coins,
          rank: savedRank,
          shareUrl: qrShareUrl || '',
        }),
      });

      const raw = await res.text();
      let data: { sent?: boolean; notConfigured?: boolean; error?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          'Email service unavailable right now. Please tap Send again.'
        );
      }

      if (!res.ok || !data.sent) {
        if (data.notConfigured) {
          setShowMailtoFallback(true);
        }
        throw new Error(data.error || 'Could not send email right now.');
      }

      setEmailSentTo(trimmed);
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : 'Could not send email right now.'
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const mailtoHref = (() => {
    const recipient = encodeURIComponent(email.trim());
    const subj = encodeURIComponent(
      `My SKY RUSH SIS Carnival Photo Card (${summary.score.toLocaleString()} PTS!)`
    );
    const bodyText = qrShareUrl
      ? `Hey ${savedName}!\n\nHere is my SKY RUSH · SIS CARNIVAL flight score: ${summary.score.toLocaleString()} PTS and ${summary.coins} Gold Coins!\n\nDownload the photo card here:\n${qrShareUrl}\n\n#SkyRush #SISCarnival`
      : `Hey ${savedName}!\n\nHere is my SKY RUSH · SIS CARNIVAL flight score: ${summary.score.toLocaleString()} PTS and ${summary.coins} Gold Coins!`;
    return `mailto:${recipient}?subject=${subj}&body=${encodeURIComponent(bodyText)}`;
  })();

  // =========================================================================
  // STAGE 2: "TAKE A PHOTO?" PROMPT
  // =========================================================================
  if (stage === 'photo_prompt') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#030b1a]/72">
        <div className="w-full max-w-lg rounded-3xl bg-[#07152e]/96 border-[3px] border-cyan-400 shadow-[0_0_36px_rgba(34,211,238,0.45)] px-6 py-7 text-center text-white">
          <h2 className="font-display font-black text-4xl sm:text-5xl text-yellow-400 tracking-wide uppercase">
            TAKE A PHOTO?
          </h2>
          <p className="font-display font-bold text-xl sm:text-2xl text-cyan-300 mt-1.5 tracking-wide">
            Share your score on social media!
          </p>

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                onKeyTapSound();
                handleRetakePhoto();
                setStage('photo_booth');
              }}
              className="min-h-14 px-8 py-3 rounded-2xl bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_4px_0_#b45309] cursor-pointer"
            >
              YES!
            </button>
            <button
              type="button"
              onClick={() => {
                onKeyTapSound();
                setStage('leaderboard');
              }}
              className="min-h-14 px-8 py-3 rounded-2xl bg-gradient-to-b from-white to-slate-300 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_4px_0_#64748b] cursor-pointer"
            >
              NO THANKS
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 3: SOCIAL MEDIA PHOTO BOOTH (3-2-1 Countdown + Zero-Login QR & Email)
  // =========================================================================
  if (stage === 'photo_booth') {
    const isPrivatePreviewUrl = Boolean(qrShareUrl && qrShareUrl.includes('ais-dev-'));

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-[#030b1a]/84 overflow-y-auto">
        <div
          className={`w-full ${
            capturedPhotoUrl ? 'max-w-5xl' : 'max-w-lg'
          } rounded-3xl bg-[#07152e]/96 border-[3px] border-cyan-400 shadow-[0_0_36px_rgba(34,211,238,0.45)] p-4 sm:p-6 text-white transition-all`}
        >
          <div
            className={`grid grid-cols-1 ${
              capturedPhotoUrl ? 'lg:grid-cols-12 gap-5 items-start' : ''
            }`}
          >
            {/* Left / Center Column: Branded Social Media Card */}
            <div
              className={`${
                capturedPhotoUrl ? 'lg:col-span-5' : ''
              } flex flex-col items-center`}
            >
              <div className="w-full max-w-[330px] rounded-2xl bg-gradient-to-b from-[#0b3f8c] via-[#0e6dc7] to-[#0ea5e9] p-3.5 shadow-2xl relative overflow-hidden flex flex-col items-center">
                <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
                <div className="absolute top-12 -right-8 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
                <div className="absolute -bottom-8 left-4 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />

                <div className="font-display font-black text-4xl text-yellow-400 tracking-wide drop-shadow-[0_3px_0_#78350f] leading-none">
                  SKY RUSH
                </div>
                <div className="mt-1 px-4 py-0.5 rounded-full bg-cyan-400 text-[#07152e] font-display font-black text-sm tracking-wider uppercase shadow">
                  SIS CARNIVAL
                </div>

                {/* Photo Window with 3-2-1 Countdown Overlay & Shutter Flash */}
                <div className="relative mt-2.5 w-full aspect-[4/3] rounded-xl border-4 border-white bg-[#030b1a] overflow-hidden shadow-lg">
                  {capturedPhotoUrl ? (
                    <img
                      src={capturedPhotoUrl}
                      alt="Player carnival photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <canvas
                      ref={livePhotoCanvasRef}
                      width={480}
                      height={360}
                      className="w-full h-full object-cover"
                    />
                  )}

                  {countdown !== null && countdown > 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#030b1a]/45">
                      <div
                        className="font-display font-black text-[110px] leading-none text-yellow-400 select-none"
                        style={{
                          textShadow:
                            '0 6px 0 #b45309, 0 10px 24px rgba(0,0,0,0.65)',
                        }}
                      >
                        {countdown}
                      </div>
                      <span className="font-display font-black text-xl tracking-widest text-white uppercase mt-1">
                        SMILE!
                      </span>
                    </div>
                  )}

                  {flashActive && (
                    <div className="absolute inset-0 bg-white pointer-events-none" />
                  )}

                  <div className="absolute bottom-2 left-2 px-3 py-0.5 rounded-full bg-yellow-400 text-[#07152e] font-display font-black text-xs tracking-wide shadow-md">
                    {savedRank > 0 ? `TOP 10 • #${savedRank}` : 'HIGH SCORE'}
                  </div>
                </div>

                <div className="mt-2 text-center leading-tight">
                  <div
                    className="font-display font-black text-2xl text-white uppercase tracking-wide"
                    style={{ textShadow: '0 2px 0 #07152e' }}
                  >
                    {savedName}
                  </div>
                  <div className="font-display font-bold text-[11px] text-cyan-200 uppercase tracking-widest mt-0.5">
                    SCORE &amp; GOLD COINS
                  </div>
                  <div
                    className="font-display font-black text-xl text-yellow-400 tracking-wide"
                    style={{ textShadow: '0 2px 0 #78350f' }}
                  >
                    {summary.score.toLocaleString()} PTS · {summary.coins} COINS
                  </div>
                  <div className="text-[11px] font-semibold text-white/95 mt-0.5">
                    #SkyRush #SISCarnival
                  </div>
                </div>
              </div>

              {photoSavedBanner && (
                <div className="mt-2.5 px-4 py-1 rounded-full bg-emerald-400 text-[#07152e] font-display font-black text-sm tracking-wide uppercase flex items-center gap-1.5">
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>PHOTO SAVED!</span>
                </div>
              )}

              {/* Primary Capture / Card Actions */}
              {!capturedPhotoUrl ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleStartCountdown}
                    disabled={!cameraAvailable || countdown !== null}
                    className="min-h-13 px-7 py-2.5 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 disabled:opacity-50 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_4px_0_#b45309] flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    <span>
                      {countdown !== null ? `TAKING IN ${countdown}...` : 'TAKE PHOTO'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onKeyTapSound();
                      setCountdown(null);
                      setStage('leaderboard');
                    }}
                    className="min-h-13 px-7 py-2.5 rounded-full bg-gradient-to-b from-white to-slate-300 hover:brightness-105 text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_4px_0_#64748b] cursor-pointer"
                  >
                    DONE
                  </button>
                </div>
              ) : (
                <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={handleDownloadCard}
                    disabled={!renderedCardUrl}
                    className="min-h-12 px-5 py-2 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#b45309] cursor-pointer"
                  >
                    SAVE PHOTO
                  </button>
                  <button
                    type="button"
                    onClick={handleRetakePhoto}
                    className="min-h-12 px-5 py-2 rounded-full bg-gradient-to-b from-white to-slate-300 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#64748b] cursor-pointer"
                  >
                    RETAKE
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onKeyTapSound();
                      setStage('leaderboard');
                    }}
                    className="min-h-12 px-5 py-2 rounded-full bg-cyan-400 hover:bg-cyan-300 text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#0e7490] cursor-pointer"
                  >
                    DONE
                  </button>
                </div>
              )}
            </div>

            {/* Right Column (shown after capture): QR Code + Zero-Login Email Delivery */}
            {capturedPhotoUrl && (
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* 1. Scan QR Code Section */}
                <div className="rounded-2xl bg-[#0b1f44] border-2 border-cyan-400/70 p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-36 h-36 rounded-xl bg-white p-2 flex items-center justify-center shrink-0 shadow-lg">
                    {qrLoading ? (
                      <span className="text-xs font-bold text-slate-600 text-center">
                        Generating QR...
                      </span>
                    ) : qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Scan QR code to download your carnival photo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <QrCode className="w-16 h-16 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2 text-yellow-400 font-display font-black text-2xl uppercase tracking-wide">
                      <QrCode className="w-5 h-5" />
                      <span>SCAN QR CODE TO GET PHOTO</span>
                    </div>
                    <p className="text-xs sm:text-sm text-cyan-100 mt-1 leading-snug">
                      Point your phone camera at the QR code to open and save your{' '}
                      <span className="font-bold text-white">SKY RUSH</span> photo card.
                    </p>
                    {isPrivatePreviewUrl && (
                      <div className="mt-1.5 text-[11px] font-semibold text-amber-300 leading-snug">
                        Note: Preview links (`ais-dev`) require your Google account on phones. Deploy/Share the app publicly so any guest can scan without signing in!
                      </div>
                    )}
                    {qrShareUrl && (
                      <div className="mt-1.5 text-[11px] font-mono-tabular text-cyan-300 truncate max-w-xs">
                        {qrShareUrl}
                      </div>
                    )}
                    {qrError && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                        <span>{qrError}</span>
                        {renderedCardUrl && (
                          <button
                            type="button"
                            onClick={() => void uploadForQrCode(renderedCardUrl)}
                            className="px-2 py-1 rounded bg-cyan-400 text-[#07152e] font-bold cursor-pointer"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Email Photo Now Section (Zero Google Sign-In Required) */}
                <div className="rounded-2xl bg-[#0b1f44] border-2 border-cyan-400/70 p-4">
                  <div className="flex items-center gap-2 text-cyan-300 font-display font-black text-xl uppercase tracking-wide mb-2">
                    <Mail className="w-5 h-5 text-yellow-400" />
                    <span>OR EMAIL PHOTO NOW</span>
                  </div>

                  <div className="h-12 rounded-xl bg-[#030b1a] border-2 border-cyan-400 px-3 flex items-center justify-between gap-2 mb-2.5">
                    <span className="font-mono-tabular text-sm sm:text-base text-white truncate">
                      {email || (
                        <span className="text-slate-500">
                          Tap keys below to enter your email...
                        </span>
                      )}
                      {email && (
                        <span className="inline-block w-0.5 h-4 bg-cyan-300 align-middle ml-0.5" />
                      )}
                    </span>
                    {email.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          onKeyTapSound();
                          setEmail('');
                          setEmailError('');
                          setEmailSentTo(null);
                          setShowMailtoFallback(false);
                        }}
                        aria-label="Clear Email"
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 select-none">
                    {EMAIL_KEY_ROWS.map((row, rIdx) => (
                      <div key={rIdx} className="grid grid-cols-10 gap-1">
                        {row.map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => handleEmailKey(ch)}
                            className="min-h-9 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-yellow-400 active:text-[#07152e] font-mono-tabular font-bold text-sm text-white shadow-[0_2px_0_#1e3a8a] transition-colors cursor-pointer"
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    ))}
                    <div className="grid grid-cols-12 gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleEmailKey('@gmail.com')}
                        className="col-span-5 min-h-9 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-yellow-400 active:text-[#07152e] font-mono-tabular font-bold text-xs text-white shadow-[0_2px_0_#155e75] cursor-pointer"
                      >
                        @gmail.com
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEmailKey('.com')}
                        className="col-span-3 min-h-9 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-yellow-400 active:text-[#07152e] font-mono-tabular font-bold text-xs text-white shadow-[0_2px_0_#155e75] cursor-pointer"
                      >
                        .com
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEmailKey('.edu')}
                        className="col-span-2 min-h-9 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-yellow-400 active:text-[#07152e] font-mono-tabular font-bold text-xs text-white shadow-[0_2px_0_#155e75] cursor-pointer"
                      >
                        .edu
                      </button>
                      <button
                        type="button"
                        onClick={handleEmailBackspace}
                        aria-label="Delete Character"
                        className="col-span-2 min-h-9 rounded-lg bg-rose-700 hover:bg-rose-600 text-white shadow-[0_2px_0_#881337] flex items-center justify-center cursor-pointer"
                      >
                        <Delete className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {emailError && (
                    <div className="mt-2.5 text-xs font-semibold text-amber-200 bg-amber-500/15 border border-amber-400/40 rounded-lg px-3 py-2 flex flex-col gap-2">
                      <span>{emailError}</span>
                      {showMailtoFallback && (
                        <a
                          href={mailtoHref}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-[#07152e] font-display font-black text-sm uppercase w-fit"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>OPEN MAIL APP WITH PHOTO LINK</span>
                        </a>
                      )}
                    </div>
                  )}

                  {emailSentTo && (
                    <div className="mt-2.5 text-sm font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 rounded-lg px-3 py-2 flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Photo card emailed to {emailSentTo}!</span>
                    </div>
                  )}

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleSendPhotoEmail()}
                      disabled={!email.trim() || !renderedCardUrl || sendingEmail}
                      className="w-full min-h-12 rounded-xl bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 disabled:opacity-45 hover:brightness-105 text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#b45309] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>{sendingEmail ? 'SENDING PHOTO...' : 'SEND PHOTO TO EMAIL'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 4: FULL TOP 10 LEADERBOARD
  // =========================================================================
  if (stage === 'leaderboard') {
    const slots = Array.from({ length: 10 }, (_, idx) => savedEntries[idx] ?? null);

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-[#030b1a]/80 overflow-y-auto">
        <div className="w-full max-w-lg rounded-3xl bg-[#07152e]/96 border-[3px] border-cyan-400 shadow-[0_0_36px_rgba(34,211,238,0.45)] px-5 py-5 sm:px-7 sm:py-6 text-white">
          <div className="text-center">
            <div className="font-display font-bold text-base text-cyan-300 tracking-wider uppercase">
              SCORE &amp; GOLD COINS
            </div>
            <div className="font-display font-black text-4xl sm:text-5xl text-yellow-400 leading-none mt-0.5">
              {summary.score.toLocaleString()}
              <span className="text-2xl sm:text-3xl text-amber-300 ml-3">
                · {summary.coins} COINS
              </span>
            </div>
            <div className="font-display font-black text-xl text-white uppercase tracking-wide mt-1">
              {savedRank > 0 ? `RANK #${savedRank}` : 'NEW FLIGHT RECORDED'}
            </div>
            <h2 className="font-display font-black text-2xl sm:text-3xl text-cyan-300 uppercase tracking-wide mt-2 mb-2.5">
              TOP 10 LEADERBOARD
            </h2>
          </div>

          <div className="space-y-1.5">
            {slots.map((entry, idx) => {
              const isNew = Boolean(entry && entry.id === savedId);
              return (
                <div
                  key={entry ? entry.id : `empty-${idx}`}
                  className={`flex items-center justify-between px-3.5 py-1.5 rounded-xl font-display font-bold text-lg transition-colors ${
                    isNew
                      ? 'bg-yellow-400 text-[#07152e] font-black shadow-md'
                      : entry
                      ? 'bg-[#0e264d] text-white'
                      : 'bg-[#0b1b38]/65 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`w-5 text-center ${
                        isNew ? 'text-[#07152e]' : entry ? 'text-cyan-200' : 'text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="truncate uppercase tracking-wide">
                      {entry ? entry.name : '---'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 font-mono-tabular text-base shrink-0">
                    {entry ? (
                      <>
                        <span
                          className={`text-xs font-bold flex items-center gap-1 ${
                            isNew ? 'text-[#07152e]' : 'text-yellow-300'
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          {entry.coins}
                        </span>
                        <span
                          className={`font-extrabold w-20 text-right ${
                            isNew ? 'text-[#07152e]' : 'text-white'
                          }`}
                        >
                          {entry.score.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500 w-20 text-right">--</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                onKeyTapSound();
                onPlayAgain();
              }}
              className="min-h-14 px-10 py-3 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-2xl tracking-wide shadow-[0_5px_0_#b45309] flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.6]" />
              <span>PLAY AGAIN</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onKeyTapSound();
                onReturnToAttract();
              }}
              className="min-h-14 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-display font-bold text-xl tracking-wide cursor-pointer"
            >
              MAIN MENU
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 1: NAME ENTRY + 9x3 A-Z ROYAL-BLUE KEYBOARD
  // =========================================================================
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-[#030b1a]/78 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#07152e]/96 border-[3px] border-cyan-400 shadow-[0_0_36px_rgba(34,211,238,0.45)] px-5 py-5 sm:px-7 sm:py-6 text-white text-center">
        <div className="font-display font-bold text-base text-cyan-300 uppercase tracking-wider">
          SCORE &amp; GOLD COINS
        </div>

        <div className="mt-1 flex items-baseline justify-center gap-4">
          <span className="font-display font-black text-5xl sm:text-6xl text-yellow-400 leading-none">
            {summary.score.toLocaleString()}
          </span>
          <span className="font-display font-black text-2xl sm:text-3xl text-amber-300 flex items-center gap-1.5">
            <Coins className="w-6 h-6 text-yellow-400" />
            <span>{summary.coins}</span>
          </span>
        </div>

        <div className="font-display font-black text-xl text-white uppercase tracking-wide mt-1">
          {potentialRank > 0 ? `RANK #${potentialRank}` : summary.reason}
        </div>
        <div className="font-display font-black text-2xl sm:text-3xl text-white uppercase tracking-wide mt-0.5">
          {potentialRank > 0 ? 'NEW TOP 10 RECORD!' : 'FLIGHT COMPLETE!'}
        </div>

        <div className="font-display font-extrabold text-xl text-cyan-300 uppercase tracking-wide mt-3 mb-2">
          ENTER YOUR NAME
        </div>

        <div className="h-14 rounded-2xl bg-[#030b1a] border-2 border-cyan-400 px-4 flex items-center justify-center mb-3.5">
          <span className="font-display font-black text-3xl tracking-[0.16em] text-white uppercase">
            {name}
            <span className="inline-block w-0.5 h-7 bg-cyan-300 align-middle ml-1" />
          </span>
        </div>

        <div className="space-y-2 select-none">
          {NAME_KEY_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="grid grid-cols-9 gap-1.5">
              {row.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => handleChar(letter)}
                  className="min-h-11 sm:min-h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-yellow-400 active:text-[#07152e] font-display font-black text-xl text-white shadow-[0_3px_0_#1e3a8a] transition-colors cursor-pointer"
                >
                  {letter}
                </button>
              ))}
              {rIdx === 2 && (
                <button
                  type="button"
                  onClick={handleBackspace}
                  aria-label="Backspace"
                  className="min-h-11 sm:min-h-12 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-yellow-400 active:text-[#07152e] font-display font-black text-white shadow-[0_3px_0_#1e3a8a] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={commitNameAndAdvance}
            className="min-h-14 px-12 py-3 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 hover:brightness-105 active:scale-[0.98] text-[#07152e] font-display font-black text-3xl tracking-wide shadow-[0_5px_0_#b45309] cursor-pointer"
          >
            SUBMIT
          </button>
          <button
            type="button"
            onClick={() => {
              onKeyTapSound();
              onPlayAgain();
            }}
            className="text-xs font-semibold text-cyan-200/75 hover:text-cyan-200 py-1 cursor-pointer"
          >
            Skip &amp; Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
