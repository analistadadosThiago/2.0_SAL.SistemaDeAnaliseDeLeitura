import { BigQuery } from '@google-cloud/bigquery';

export default async function handler(req, res) {
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
    const projectId = process.env.BIGQUERY_PROJECT_ID || 'leituradb';
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    const rawKey = process.env.BIGQUERY_PRIVATE_KEY_BASE64 || process.env.BIGQUERY_PRIVATE_KEY;

    if (!clientEmail || !rawKey) {
      return res.status(500).json({
        error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente da Vercel.'
      });
    }

    let privateKeyClean = rawKey.trim().replace(/^["']|["']$/g, '');

    // 1. Se estiver em Base64, decodifica primeiro
    if (!privateKeyClean.includes('BEGIN PRIVATE KEY') && privateKeyClean.length > 150) {
      try {
        const decoded = Buffer.from(privateKeyClean, 'base64').toString('utf8');
        if (decoded.includes('BEGIN PRIVATE KEY')) {
          privateKeyClean = decoded;
        }
      } catch (e) {}
    }

    // 2. Converte literais '\n' para quebras de linha reais
    privateKeyClean = privateKeyClean.replace(/\\n/g, '\n');

    // 3. Auto-reparação blindada: se a chave ficou numa linha única ou com espaços (comum na Vercel)
    if (privateKeyClean.includes('-----BEGIN PRIVATE KEY-----')) {
      const base64Body = privateKeyClean
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\s+/g, ''); // Remove todos os espaços, quebras e lixo gerados pelo painel

      const chunks = base64Body.match(/.{1,64}/g) || [base64Body];
      privateKeyClean = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
    }

    const bigquery = new BigQuery({
      projectId,
      location: 'US',
      credentials: {
        client_email: clientEmail,
        private_key: privateKeyClean,
      },
    });

    let rows = null;
    let queryError = null;
    const candidateDatasets = ['LeituraBD', 'dados_diarios'];

    for (const ds of candidateDatasets) {
      try {
        const query = `SELECT * FROM \`${projectId}.${ds}.dados_diarios\``;
        const [result] = await bigquery.query(query);
        rows = result;
        break;
      } catch (err) {
        queryError = err;
        if (err.message && (err.message.includes('Not found: Dataset') || err.message.includes('Not found'))) {
          continue;
        }
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
