import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import getDataHandler from './api/get-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Rota da API do BigQuery (utiliza a sua lógica existente)
app.get('/api/get-data', async (req, res) => {
  return getDataHandler(req, res);
});

// Servir os ficheiros estáticos do frontend construídos pelo Vite
app.use(express.static(path.join(__dirname, 'dist')));

// Rota coringa para o React Router funcionar corretamente
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
