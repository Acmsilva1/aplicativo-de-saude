import './lib/env.js';
import express from 'express';
import authHandler from './api/auth.js';
import saudeHandler from './api/saude.js';
import { applySecurityHeaders } from './lib/securityHeaders.js';
import { observeApp } from './lib/observability.js';
import { assertProductionSupabase, useMockData } from './lib/env.js';

assertProductionSupabase();

const app = express();
const port = Number(process.env.PORT) || 5199;
const apiPort = Number(process.env.API_PORT) || 5198;
const mockMode = useMockData();

app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || 1);
app.disable('x-powered-by');
app.use(applySecurityHeaders);
app.use(observeApp);
app.use(express.json({ limit: '256kb' }));
app.all('/api/auth', authHandler);
app.all('/api/saude', saudeHandler);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static('dist'));
  app.get('*', (_req, res) => res.sendFile('index.html', { root: 'dist' }));
  app.listen(port, '0.0.0.0', () => {
    console.log(`Ritmo Saúde disponível na porta ${port}. Dados: Supabase.`);
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const apiServer = app.listen(apiPort, '127.0.0.1', () => {
    console.log(`API disponível em http://127.0.0.1:${apiPort} (${mockMode ? 'mock' : 'supabase'})`);
  });
  const vite = await createViteServer({
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${apiPort}` },
    },
    appType: 'spa',
  });
  try {
    await vite.listen();
    console.log(`Ritmo Saúde (Vite) disponível em http://localhost:${port}`);
  } catch (error) {
    apiServer.close();
    throw error;
  }
}
