import { useEffect, useState } from 'react';

// Vite replaces these at BUILD time, not at run time. The pipeline writes a
// production .env before building, which is why a local build and a deployed
// build never produce the same files.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const ENV = import.meta.env.VITE_ENV ?? 'local';

// Change this line and commit to watch a deploy land on the live site.
const BANNER = 'Deploy test 1';

export default function App() {
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setHealth({ state: 'ok', data }))
      .catch((error) => setHealth({ state: 'error', message: error.message }));
  }, []);

  return (
    <main className="page">
      <h1>AWS CI/CD Practice</h1>
      <p className="banner">{BANNER}</p>

      <section className="card">
        <h2>Frontend</h2>
        <dl>
          <dt>Environment</dt>
          <dd>{ENV}</dd>
          <dt>API URL</dt>
          <dd>{API_URL}</dd>
          <dt>Built at</dt>
          <dd>{__BUILD_TIME__}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Backend</h2>
        {health.state === 'loading' && <p className="muted">Checking…</p>}
        {health.state === 'error' && (
          <p className="bad">Not reachable — {health.message}</p>
        )}
        {health.state === 'ok' && (
          <dl>
            <dt>Status</dt>
            <dd className="good">{health.data.status}</dd>
            <dt>Version</dt>
            <dd>{health.data.version}</dd>
            <dt>Hostname</dt>
            <dd>{health.data.hostname}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
