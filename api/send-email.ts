import nodemailer from 'nodemailer';

interface VercelReq {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getEmailProviderMode(): 'resend' | 'smtp' | 'none' {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0) {
    return 'resend';
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return 'smtp';
  }
  return 'none';
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ sent: false, error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as {
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

  const pngBase64 = match[2];
  const playerName = String(body.playerName || 'PILOT').slice(0, 20);
  const score = Math.round(Number(body.score || 0));
  const coins = Math.round(Number(body.coins || 0));
  const rank = Math.round(Number(body.rank || 0));
  const shareUrl = body.shareUrl ? String(body.shareUrl) : '';

  const safeName = escapeHtml(playerName);
  const rankText = rank > 0 ? `Rank #${rank} on the Top 10 Leaderboard` : 'Sky Pilot';
  const subject = `Your SKY RUSH SIS Carnival Photo Card - ${score.toLocaleString()} PTS!`;

  const shareBlock = shareUrl
    ? `<p style="font-size:14px;color:#cbd5e1;margin:0 0 14px;">Your photo card is attached to this email, or view it online:</p>
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
              content: pngBase64,
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
          // Keep fallback
        }
        res.status(422).json({
          sent: false,
          error: `${cleanMessage} (Sender used: ${fromAddress})`,
        });
        return;
      }

      res.status(200).json({ sent: true, toEmail });
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
            content: Buffer.from(pngBase64, 'base64'),
            contentType: 'image/png',
          },
        ],
      });

      res.status(200).json({ sent: true, toEmail });
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
    error:
      'Server email sender is not configured yet (add RESEND_API_KEY + EMAIL_FROM or SMTP credentials in Environment Variables).',
  });
}
