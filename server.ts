import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface StoredPhoto {
  id: string;
  buffer: Buffer;
  playerName: string;
  score: number;
  coins: number;
  rank: number;
  createdAt: number;
}

const MAX_PHOTOS = 120;
const photoStore = new Map<string, StoredPhoto>();
const photoDir = path.join('/tmp', 'sky-rush-photos');

try {
  fs.mkdirSync(photoDir, { recursive: true });
} catch {
  // Fallback to in-memory storage only
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBaseUrl(req: Request): string {
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }
  const configured = process.env.APP_URL;
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  return `http://localhost:${PORT}`;
}

function getEmailProviderMode(): 'resend' | 'smtp' | 'none' {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0) {
    return 'resend';
  }
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return 'smtp';
  }
  return 'none';
}

function getPhotoById(id: string): StoredPhoto | null {
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return null;
  const cached = photoStore.get(cleanId);
  if (cached) return cached;

  const imgPath = path.join(photoDir, `${cleanId}.png`);
  const metaPath = path.join(photoDir, `${cleanId}.json`);
  if (fs.existsSync(imgPath)) {
    try {
      const buffer = fs.readFileSync(imgPath);
      const meta = fs.existsSync(metaPath)
        ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        : { playerName: 'PILOT', score: 0, coins: 0, rank: 0, createdAt: Date.now() };
      const restored: StoredPhoto = {
        id: cleanId,
        buffer,
        playerName: String(meta.playerName || 'PILOT'),
        score: Number(meta.score || 0),
        coins: Number(meta.coins || 0),
        rank: Number(meta.rank || 0),
        createdAt: Number(meta.createdAt || Date.now()),
      };
      photoStore.set(cleanId, restored);
      return restored;
    } catch {
      return null;
    }
  }
  return null;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/api/email-status', (_req: Request, res: Response) => {
    const mode = getEmailProviderMode();
    res.json({ configured: mode !== 'none', mode });
  });

  // Store rendered SKY RUSH · SIS CARNIVAL social card PNG & return shareable QR URL
  app.post('/api/photos', (req: Request, res: Response) => {
    const body = req.body as {
      imageDataUrl?: string;
      playerName?: string;
      score?: number;
      coins?: number;
      rank?: number;
    };

    const dataUrl = String(body.imageDataUrl || '');
    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      res.status(400).json({ error: 'Invalid image payload' });
      return;
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength > 8 * 1024 * 1024) {
      res.status(413).json({ error: 'Image too large' });
      return;
    }

    const id = crypto.randomBytes(5).toString('hex');
    const entry: StoredPhoto = {
      id,
      buffer,
      playerName: String(body.playerName || 'PILOT').slice(0, 20),
      score: Math.round(Number(body.score || 0)),
      coins: Math.round(Number(body.coins || 0)),
      rank: Math.round(Number(body.rank || 0)),
      createdAt: Date.now(),
    };

    if (photoStore.size >= MAX_PHOTOS) {
      const oldestKey = photoStore.keys().next().value;
      if (oldestKey) photoStore.delete(oldestKey);
    }
    photoStore.set(id, entry);

    try {
      fs.writeFileSync(path.join(photoDir, `${id}.png`), buffer);
      fs.writeFileSync(
        path.join(photoDir, `${id}.json`),
        JSON.stringify({
          playerName: entry.playerName,
          score: entry.score,
          coins: entry.coins,
          rank: entry.rank,
          createdAt: entry.createdAt,
        })
      );
    } catch {
      // Ignore disk write error; memory store remains active
    }

    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/photo/${id}`;
    const imageUrl = `${baseUrl}/api/photos/${id}/image`;

    res.json({ id, shareUrl, imageUrl });
  });

  // Stateless email endpoint (works identically on Express, Render, and Vercel)
  app.post('/api/send-email', async (req: Request, res: Response) => {
    const body = req.body as {
      toEmail?: string;
      imageDataUrl?: string;
      playerName?: string;
      score?: number;
      coins?: number;
      rank?: number;
      shareUrl?: string;
    };

    const toEmail = String(body.toEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      res.status(400).json({ sent: false, error: 'Please enter a valid email address.' });
      return;
    }

    const dataUrl = String(body.imageDataUrl || '');
    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      res.status(400).json({ sent: false, error: 'Photo card image is missing or invalid.' });
      return;
    }

    const buffer = Buffer.from(match[2], 'base64');
    const playerName = String(body.playerName || 'PILOT').slice(0, 20);
    const score = Math.round(Number(body.score || 0));
    const coins = Math.round(Number(body.coins || 0));
    const rank = Math.round(Number(body.rank || 0));
    const shareUrl = body.shareUrl ? String(body.shareUrl) : '';

    const safeName = escapeHtml(playerName);
    const rankText = rank > 0 ? `Rank #${rank} on the Top 10 Leaderboard` : 'Sky Pilot';
    const subject = `Your SKY RUSH SIS Carnival Photo Card - ${score.toLocaleString()} PTS!`;

    const shareBlock = shareUrl
      ? `<p style="font-size:14px;color:#cbd5e1;margin:0 0 14px;">Your photo card is attached to this email, or open it anytime here:</p>
         <a href="${escapeHtml(shareUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#facc15;color:#07152e;font-weight:800;text-decoration:none;">VIEW &amp; DOWNLOAD PHOTO</a>`
      : `<p style="font-size:14px;color:#cbd5e1;margin:0;">Your <strong>SKY RUSH · SIS CARNIVAL</strong> photo card PNG is attached below!</p>`;

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;background:#07152e;color:#ffffff;border-radius:16px;">
        <h1 style="color:#facc15;margin:0 0 8px;">SKY RUSH · SIS CARNIVAL</h1>
        <p style="color:#67e8f9;font-size:16px;margin:0 0 16px;">Thanks for flying with us, <strong>${safeName}</strong>!</p>
        <div style="background:#0c2147;padding:14px;border-radius:12px;margin-bottom:16px;">
          <div style="font-size:15px;margin-bottom:4px;"><strong>Score:</strong> ${score.toLocaleString()} pts</div>
          <div style="font-size:15px;margin-bottom:4px;"><strong>Gold Coins:</strong> ${coins}</div>
          <div style="font-size:15px;"><strong>Standing:</strong> ${rankText}</div>
        </div>
        ${shareBlock}
      </div>
    `.trim();

    const mode = getEmailProviderMode();

    if (mode === 'resend') {
      try {
        const rawFrom = (process.env.EMAIL_FROM || '').trim();
        const fromAddress = !rawFrom
          ? 'SKY RUSH SIS Carnival <onboarding@resend.dev>'
          : rawFrom.includes('@')
          ? rawFrom
          : `SKY RUSH SIS Carnival <photos@${rawFrom}>`;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [toEmail],
            subject,
            html: htmlBody,
            attachments: [
              {
                filename: 'sky-rush-sis-carnival.png',
                content: buffer.toString('base64'),
              },
            ],
          }),
        });

        if (!response.ok) {
          const rawErr = await response.text().catch(() => '');
          let cleanMessage = rawErr.slice(0, 220);
          try {
            const parsed = JSON.parse(rawErr) as { message?: string };
            if (parsed.message) cleanMessage = parsed.message;
          } catch {
            // Keep raw fallback
          }
          res.status(422).json({
            sent: false,
            error: `${cleanMessage} (Sender used: ${fromAddress})`,
          });
          return;
        }

        res.json({ sent: true, toEmail });
        return;
      } catch (err) {
        res.status(422).json({
          sent: false,
          error: err instanceof Error ? err.message : 'Email send error',
        });
        return;
      }
    }

    if (mode === 'smtp') {
      try {
        const port = Number(process.env.SMTP_PORT || 587);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: port === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from:
            process.env.SMTP_FROM ||
            `"SKY RUSH SIS Carnival" <${process.env.SMTP_USER}>`,
          to: toEmail,
          subject,
          html: htmlBody,
          attachments: [
            {
              filename: 'sky-rush-sis-carnival.png',
              content: buffer,
              contentType: 'image/png',
            },
          ],
        });

        res.json({ sent: true, toEmail });
        return;
      } catch (err) {
        res.status(422).json({
          sent: false,
          error: err instanceof Error ? err.message : 'SMTP delivery failed',
        });
        return;
      }
    }

    res.status(422).json({
      sent: false,
      notConfigured: true,
      shareUrl,
      error:
        'Server email sender is not configured yet (add RESEND_API_KEY or SMTP credentials in Environment Variables).',
    });
  });

  // Send player photo card via server-side SMTP or Resend (no Google login required for players)
  app.post('/api/photos/:id/email', async (req: Request, res: Response) => {
    const photo = getPhotoById(String(req.params.id || ''));
    if (!photo) {
      res.status(404).json({ error: 'Photo expired or not found.' });
      return;
    }

    const body = req.body as { toEmail?: string };
    const toEmail = String(body.toEmail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/photo/${photo.id}`;
    const safeName = escapeHtml(photo.playerName);
    const rankText =
      photo.rank > 0 ? `Rank #${photo.rank} on the Top 10 Leaderboard` : 'Sky Pilot';
    const subject = `Your SKY RUSH SIS Carnival Photo Card - ${photo.score.toLocaleString()} PTS!`;

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;background:#07152e;color:#ffffff;border-radius:16px;">
        <h1 style="color:#facc15;margin:0 0 8px;">SKY RUSH · SIS CARNIVAL</h1>
        <p style="color:#67e8f9;font-size:16px;margin:0 0 16px;">Thanks for flying with us, <strong>${safeName}</strong>!</p>
        <div style="background:#0c2147;padding:14px;border-radius:12px;margin-bottom:16px;">
          <div style="font-size:15px;margin-bottom:4px;"><strong>Score:</strong> ${photo.score.toLocaleString()} pts</div>
          <div style="font-size:15px;margin-bottom:4px;"><strong>Gold Coins:</strong> ${photo.coins}</div>
          <div style="font-size:15px;"><strong>Standing:</strong> ${rankText}</div>
        </div>
        <p style="font-size:14px;color:#cbd5e1;margin:0 0 14px;">Your photo card is attached to this email, or open it anytime here:</p>
        <a href="${shareUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#facc15;color:#07152e;font-weight:800;text-decoration:none;">VIEW &amp; DOWNLOAD PHOTO</a>
      </div>
    `.trim();

    const mode = getEmailProviderMode();

    if (mode === 'resend') {
      try {
        const rawFrom = (process.env.EMAIL_FROM || '').trim();
        const fromAddress = !rawFrom
          ? 'SKY RUSH SIS Carnival <onboarding@resend.dev>'
          : rawFrom.includes('@')
          ? rawFrom
          : `SKY RUSH SIS Carnival <photos@${rawFrom}>`;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [toEmail],
            subject,
            html: htmlBody,
            attachments: [
              {
                filename: 'sky-rush-sis-carnival.png',
                content: photo.buffer.toString('base64'),
              },
            ],
          }),
        });

        if (!response.ok) {
          const rawErr = await response.text().catch(() => '');
          let cleanMessage = rawErr.slice(0, 220);
          try {
            const parsed = JSON.parse(rawErr) as { message?: string };
            if (parsed.message) cleanMessage = parsed.message;
          } catch {
            // Keep raw text fallback
          }
          res.status(422).json({
            sent: false,
            error: `${cleanMessage} (Sender used: ${fromAddress})`,
          });
          return;
        }

        res.json({ sent: true, toEmail });
        return;
      } catch (err) {
        res.status(422).json({
          sent: false,
          error: err instanceof Error ? err.message : 'Email send error',
        });
        return;
      }
    }

    if (mode === 'smtp') {
      try {
        const port = Number(process.env.SMTP_PORT || 587);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure: port === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from:
            process.env.SMTP_FROM ||
            `"SKY RUSH SIS Carnival" <${process.env.SMTP_USER}>`,
          to: toEmail,
          subject,
          html: htmlBody,
          attachments: [
            {
              filename: 'sky-rush-sis-carnival.png',
              content: photo.buffer,
              contentType: 'image/png',
            },
          ],
        });

        res.json({ sent: true, toEmail });
        return;
      } catch (err) {
        res.status(422).json({
          sent: false,
          error: err instanceof Error ? err.message : 'SMTP delivery failed',
        });
        return;
      }
    }

    res.status(422).json({
      sent: false,
      notConfigured: true,
      shareUrl,
      error:
        'Server email sender is not configured yet (add RESEND_API_KEY or SMTP credentials in Secrets).',
    });
  });

  app.get('/api/photos/:id/image', (req: Request, res: Response) => {
    const photo = getPhotoById(String(req.params.id || ''));
    if (!photo) {
      res.status(404).send('Photo expired or not found');
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="sky-rush-${photo.id}.png"`
    );
    res.send(photo.buffer);
  });

  // Mobile-friendly QR landing page so scanning the QR opens & saves the photo cleanly
  app.get('/photo/:id', (req: Request, res: Response) => {
    const photo = getPhotoById(String(req.params.id || ''));
    if (!photo) {
      res
        .status(404)
        .send(
          '<!doctype html><html><body style="background:#07152e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;"><div><h1 style="color:#facc15;">Photo Expired</h1><p>This carnival photo is no longer available.</p></div></body></html>'
        );
      return;
    }

    const safeName = escapeHtml(photo.playerName);
    const safeId = escapeHtml(photo.id);
    const rankLine = photo.rank > 0 ? `TOP 10 • RANK #${photo.rank}` : 'SKY RUSH PILOT';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SKY RUSH · SIS CARNIVAL Photo — ${safeName}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #07152e 0%, #0b2b5e 100%);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
      }
      .card {
        width: 100%;
        max-width: 440px;
        background: #07152e;
        border: 3px solid #22d3ee;
        border-radius: 24px;
        padding: 20px;
        box-shadow: 0 0 32px rgba(34, 211, 238, 0.35);
        text-align: center;
      }
      .title {
        font-size: 32px;
        font-weight: 900;
        color: #facc15;
        margin: 0;
        letter-spacing: 1px;
      }
      .sub {
        display: inline-block;
        margin-top: 6px;
        padding: 4px 14px;
        border-radius: 999px;
        background: #22d3ee;
        color: #07152e;
        font-weight: 800;
        font-size: 13px;
      }
      .meta {
        margin: 12px 0 14px;
        font-size: 14px;
        color: #bae6fd;
        font-weight: 700;
      }
      img {
        width: 100%;
        border-radius: 16px;
        border: 3px solid #ffffff;
        display: block;
      }
      .btn {
        display: block;
        margin-top: 18px;
        padding: 16px 24px;
        border-radius: 999px;
        background: linear-gradient(180deg, #fde047 0%, #f59e0b 100%);
        color: #07152e;
        font-weight: 900;
        font-size: 20px;
        text-decoration: none;
        box-shadow: 0 4px 0 #b45309;
      }
      .hint {
        margin-top: 12px;
        font-size: 12px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">SKY RUSH</h1>
      <div class="sub">SIS CARNIVAL · ${rankLine}</div>
      <div class="meta">${safeName} · ${photo.score.toLocaleString()} PTS · ${photo.coins} GOLD COINS</div>
      <img src="/api/photos/${safeId}/image" alt="SKY RUSH SIS CARNIVAL Photo Card" />
      <a class="btn" href="/api/photos/${safeId}/image" download="sky-rush-${safeId}.png">
        DOWNLOAD PHOTO
      </a>
      <div class="hint">Tip: You can also press and hold the photo to save to your camera roll.</div>
    </div>
  </body>
</html>`);
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API route not found' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SKY RUSH server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
