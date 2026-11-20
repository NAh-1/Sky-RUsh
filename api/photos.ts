import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface VercelReq {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

const photoDir = path.join('/tmp', 'sky-rush-photos');

function getBaseUrl(req: VercelReq): string {
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return `${isLocal ? 'http' : 'https'}://${host}`;
  }
  return '';
}

export default function handler(req: VercelReq, res: VercelRes): void {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as {
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
  try {
    fs.mkdirSync(photoDir, { recursive: true });
    fs.writeFileSync(path.join(photoDir, `${id}.png`), buffer);
    fs.writeFileSync(
      path.join(photoDir, `${id}.json`),
      JSON.stringify({
        playerName: String(body.playerName || 'PILOT').slice(0, 20),
        score: Math.round(Number(body.score || 0)),
        coins: Math.round(Number(body.coins || 0)),
        rank: Math.round(Number(body.rank || 0)),
        createdAt: Date.now(),
      })
    );
  } catch (err) {
    res.status(422).json({
      error: err instanceof Error ? err.message : 'Could not store temporary photo.',
    });
    return;
  }

  const baseUrl = getBaseUrl(req);
  res.status(200).json({
    id,
    shareUrl: `${baseUrl}/photo/${id}`,
    imageUrl: `${baseUrl}/api/photos/${id}/image`,
  });
}
