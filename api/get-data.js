import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Cabeçalhos CORS para permitir requisições no ambiente Vercel e local
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido. Utilize GET.' });
  }

  try {
    let projectId = process.env.BIGQUERY_PROJECT_ID;
    const rawDataset = process.env.BIGQUERY_DATASET;
    // O dataset real no BigQuery chama-se 'LeituraBD' e contém a tabela 'dados_diarios'
    const datasetId = (rawDataset && rawDataset.trim() !== 'dados_diarios') ? rawDataset.trim() : 'LeituraBD';
    let clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    let privateKey = process.env.BIGQUERY_PRIVATE_KEY;

    // Suporte prioritário a GOOGLE_APPLICATION_CREDENTIALS e arquivo service-account.json
    const possibleSaPaths = [
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      path.resolve(process.cwd(), 'service-account.json'),
      path.resolve(process.cwd(), 'google-credentials.json'),
      path.resolve('/app/applet/service-account.json'),
    ].filter(Boolean);

    for (const p of possibleSaPaths) {
      if (fs.existsSync(p)) {
        try {
          const saData = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (saData.client_email && saData.private_key) {
            projectId = projectId || saData.project_id;
            clientEmail = saData.client_email;
            privateKey = saData.private_key;
            break;
          }
        } catch (_) {}
      }
    }

    projectId = projectId || 'leituradb';

    if (!clientEmail || !privateKey) {
      return res.status(500).json({
        error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente ou no arquivo da Service Account.'
      });
    }

    // Normalização rigorosa da chave privada para resolver erros do OpenSSL
    privateKey = privateKey ? privateKey.replace(/\\n/g, '\n') : '';

    // Suporte adicional para ambientes onde quebras de linha foram convertidas em espaços
    if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('\n')) {
      const parts = privateKey.split(' ');
      if (parts.length > 6) {
        const headerEnd = parts.findIndex((p, idx) => idx > 0 && p.includes('KEY-----'));
        const footerStart = parts.findIndex((p, idx) => idx > headerEnd && p.includes('-----END'));
        if (headerEnd !== -1 && footerStart !== -1) {
          const bodyParts = parts.slice(headerEnd + 1, footerStart);
          const cleanBodyParts = bodyParts.map(p => (p.length === 65 && p.startsWith('n')) ? p.substring(1) : p);
          const base64Body = cleanBodyParts.join('');
          privateKey = `-----BEGIN PRIVATE KEY-----\n${base64Body.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`;
        }
      }
    }

    const bigquery = new BigQuery({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    let rows = null;
    let queryError = null;
    const candidateDatasets = Array.from(new Set([datasetId, 'LeituraBD', 'dados_diarios'].filter(Boolean)));

    for (const ds of candidateDatasets) {
      try {
        const query = `SELECT * FROM \`${projectId}.${ds}.dados_diarios\``;
        const [result] = await bigquery.query(query);
        rows = result;
        break;
      } catch (err) {
        queryError = err;
        // Se o erro for dataset não encontrado, tenta o próximo candidato
        if (err.message && err.message.includes('Not found: Dataset')) {
          continue;
        }
        throw err;
      }
    }

    if (!rows && queryError) {
      throw queryError;
    }

    return res.status(200).json(rows || []);
  } catch (error) {
    console.error('Erro na função get-data do BigQuery (Vercel):', error);
    return res.status(500).json({ error: error.message });
  }
}
