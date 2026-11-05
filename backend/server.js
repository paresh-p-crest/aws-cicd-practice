import os from 'node:os';
import cors from 'cors';
import express from 'express';

const app = express();
const port = process.env.PORT ?? 4000;

// The browser calls this API from a different origin (CloudFront), so CORS
// has to allow it. In production, set ALLOWED_ORIGIN to the site's URL.
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? '*' }));

// ECS calls this to decide whether a new container is healthy enough to
// receive traffic. If it fails, the old containers keep serving.
app.get('/api/health', (_request, response) => {
  response.json({
    status: 'healthy',
    version: process.env.APP_VERSION ?? 'dev',
    hostname: os.hostname(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/message', (_request, response) => {
  response.json({ message: 'Hello from the backend.' });
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
