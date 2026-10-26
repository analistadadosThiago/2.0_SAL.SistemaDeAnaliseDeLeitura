import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Sincroniza variáveis de ambiente no processo Node para o get-data.js
  for (const [key, val] of Object.entries(env)) {
    if (!process.env[key] && val) {
      process.env[key] = val;
    }
  }

  // Prepara o formato PEM da chave privada no ambiente de desenvolvimento se houver formatação com espaços
  if (process.env.BIGQUERY_PRIVATE_KEY) {
    let key = process.env.BIGQUERY_PRIVATE_KEY.trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
      key = key.slice(1, -1).trim();
    }
    key = key.replace(/\\n/g, '\n');
    if (!key.includes('\n') && key.includes(' ')) {
      const words = key.split(/\s+/).filter(Boolean);
      const rawBody = words.slice(3, -3).join('');
      for (let i = rawBody.length - 1; i >= 0; i--) {
        const cand = rawBody.slice(0, i) + rawBody.slice(i + 1);
        if (cand.length % 4 === 0) {
          key = '-----BEGIN PRIVATE KEY-----\n' + (cand.match(/.{1,64}/g) || []).join('\n') + '\n-----END PRIVATE KEY-----\n';
          break;
        }
      }
    }
    process.env.BIGQUERY_PRIVATE_KEY = key;
  }

  if (!process.env.BIGQUERY_DATASET || process.env.BIGQUERY_DATASET === 'dados_diarios') {
    process.env.BIGQUERY_DATASET = 'LeituraBD';
  }

  const bigqueryProjectId = env.BIGQUERY_PROJECT_ID || process.env.BIGQUERY_PROJECT_ID || 'leiturabd';
  const bigqueryDataset = process.env.BIGQUERY_DATASET || 'LeituraBD';

  const netlifyFunctionsDevPlugin = () => ({
    name: 'netlify-functions-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url.startsWith('/.netlify/functions/get-data')) {
          try {
            const getDataModule: any = await import('./netlify/functions/get-data.js');
            const handler = getDataModule.handler || getDataModule.default;

            const urlObj = new URL(url, 'http://localhost:3000');
            const queryStringParameters = Object.fromEntries(urlObj.searchParams.entries());

            const event = {
              httpMethod: req.method || 'GET',
              queryStringParameters,
              headers: req.headers,
              path: urlObj.pathname,
            };

            const result = await handler(event, {});
            res.statusCode = result.statusCode || 200;
            if (result.headers) {
              for (const [k, v] of Object.entries(result.headers)) {
                res.setHeader(k, v as string);
              }
            }
            res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
            return;
          } catch (err: any) {
            console.error('[BigQuery Netlify Dev] Erro ao consultar BigQuery via get-data.js:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Erro ao consultar BigQuery' }));
            return;
          }
        }
        next();
      });
    }
  });

  return {
    plugins: [react(), tailwindcss(), netlifyFunctionsDevPlugin()],
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
