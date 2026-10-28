import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Sincroniza variáveis de ambiente no processo Node para o get-data.js
  for (const [key, val] of Object.entries(env)) {
    if (val) {
      process.env[key] = val;
    }
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/app/credentials.json';
  }

  const bigqueryProjectId = env.BIGQUERY_PROJECT_ID || process.env.BIGQUERY_PROJECT_ID || 'leiturabd';
  const bigqueryDataset = env.BIGQUERY_DATASET || process.env.BIGQUERY_DATASET || 'LeituraBD';

  const vercelApiDevPlugin = () => ({
    name: 'vercel-api-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url.startsWith('/api/get-data') || url.startsWith('/.netlify/functions/get-data')) {
          try {
            if (!res.status) {
              res.status = function (code: number) {
                res.statusCode = code;
                return this;
              };
            }
            if (!res.json) {
              res.json = function (data: any) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return this;
              };
            }

            const apiModule: any = await import('./api/get-data.js');
            const handler = apiModule.default || apiModule.handler;

            await handler(req, res);
            return;
          } catch (err: any) {
            console.error('[BigQuery Vercel Dev] Erro ao consultar BigQuery via api/get-data.js:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Erro ao consultar BigQuery' }));
            return;
          }
        }
        next();
      });
    },
  });

  return {
    plugins: [react(), tailwindcss(), vercelApiDevPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.BIGQUERY_PROJECT_ID': JSON.stringify(bigqueryProjectId),
      'process.env.BIGQUERY_DATASET': JSON.stringify(bigqueryDataset),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
