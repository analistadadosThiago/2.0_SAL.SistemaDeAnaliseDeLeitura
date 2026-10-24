import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  const bigqueryProjectId = env.BIGQUERY_PROJECT_ID || 'leiturabd';
  const bigqueryDataset = env.BIGQUERY_DATASET || 'dados_diarios';

  const netlifyFunctionsDevPlugin = () => ({
    name: 'netlify-functions-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url.startsWith('/.netlify/functions/get-data')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            success: true,
            source: 'Google BigQuery',
            project: bigqueryProjectId,
            dataset: bigqueryDataset,
            message: 'Endpoint get-data ativo para BigQuery leiturabd.dados_diarios',
            data: []
          }));
          return;
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
