import fs from 'fs';
import path from 'path';

interface VercelReq {
  query?: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  send: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

const photoDir = path.join('/tmp', 'sky-rush-photos');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function handler(req: VercelReq, res: VercelRes): void {
  const rawId = req.query?.id;
  const id = String(Array.isArray(rawId) ? rawId[0] : rawId || '').replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );

  const imgPath = id ? path.join(photoDir, `${id}.png`) : '';
  const metaPath = id ? path.join(photoDir, `${id}.json`) : '';

  if (!id || !fs.existsSync(imgPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res
      .status(404)
      .send(
        '<!doctype html><html><body style="background:#07152e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px;"><div><h1 style="color:#facc15;">Photo Unavailable</h1><p>Use the Email option or Save Photo directly on the booth screen.</p></div></body></html>'
      );
    return;
  }

  let meta = { playerName: 'PILOT', score: 0, coins: 0, rank: 0 };
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      // Fallback
    }
  }

  const safeName = escapeHtml(String(meta.playerName || 'PILOT'));
  const rank = Number(meta.rank || 0);
  const score = Number(meta.score || 0);
  const coins = Number(meta.coins || 0);
  const rankLine = rank > 0 ? `TOP 10 • RANK #${rank}` : 'SKY RUSH PILOT';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
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
      .title { font-size: 32px; font-weight: 900; color: #facc15; margin: 0; }
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
      .meta { margin: 12px 0 14px; font-size: 14px; color: #bae6fd; font-weight: 700; }
      img { width: 100%; border-radius: 16px; border: 3px solid #ffffff; display: block; }
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
      .hint { margin-top: 12px; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">SKY RUSH</h1>
      <div class="sub">SIS CARNIVAL · ${rankLine}</div>
      <div class="meta">${safeName} · ${score.toLocaleString()} PTS · ${coins} GOLD COINS</div>
      <img src="/api/photos/${id}/image" alt="SKY RUSH SIS CARNIVAL Photo Card" />
      <a class="btn" href="/api/photos/${id}/image" download="sky-rush-${id}.png">DOWNLOAD PHOTO</a>
      <div class="hint">Tip: You can also press and hold the photo to save to your camera roll.</div>
    </div>
  </body>
</html>`);
}
