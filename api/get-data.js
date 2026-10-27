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
    let rawKey = process.env.BIGQUERY_PRIVATE_KEY || '';

    if (!clientEmail || !rawKey) {
      return res.status(500).json({
        error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente.'
      });
    }

    // Limpeza rigorosa de aspas e formatações indesejadas do painel
    rawKey = rawKey.trim().replace(/^["']|["']$/g, '');

    // Reconstrói o formato correto do certificado RSA independentemente de como foi colado
    let formattedKey = rawKey;
    if (!formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // Se por acaso estiver em Base64 puro
      try {
        const decoded = Buffer.from(formattedKey, 'base64').toString('utf8');
        if (decoded.includes('BEGIN PRIVATE KEY')) {
          formattedKey = decoded;
        }
      } catch (e) {}
    }

    // Substitui literais \n por quebras de linha reais e garante o wrap correto de 64 caracteres
    formattedKey = formattedKey.replace(/\\n/g, '\n');
    
    if (formattedKey.includes('-----BEGIN PRIVATE KEY-----')) {
      const body = formattedKey
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
      
      const chunks = body.match(/.{1,64}/g) || [body];
      formattedKey = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;
    }

    const bigquery = new BigQuery({
      projectId,
      location: 'US',
      credentials: {
        client_email: clientEmail,
        private_key: formattedKey,
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
    console.error('Erro no BigQuery:', error);
    return res.status(500).json({ error: error.message });
  }
}
