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

export default function handler(req: VercelReq, res: VercelRes): void {
  const rawId = req.query?.id;
  const id = String(Array.isArray(rawId) ? rawId[0] : rawId || '').replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );

  if (!id) {
    res.status(404).send('Not found');
    return;
  }

  const imgPath = path.join(photoDir, `${id}.png`);
  if (!fs.existsSync(imgPath)) {
    res.status(404).send('Photo expired or not found');
    return;
  }

  const buffer = fs.readFileSync(imgPath);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Disposition', `inline; filename="sky-rush-${id}.png"`);
  res.status(200).send(buffer);
}
