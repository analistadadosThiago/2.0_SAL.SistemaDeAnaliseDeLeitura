import { BigQuery } from '@google-cloud/bigquery';

export default async function handler(req, res) {
  // Cabeçalhos CORS
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
    let privateKey = process.env.BIGQUERY_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      return res.status(500).json({
        error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente da Vercel.'
      });
    }

    // Normalização da chave privada para resolver quebras de linha
    privateKey = privateKey.replace(/\\n/g, '\n');

    // Inicialização do BigQuery fixando a região padrão ('US') para evitar o erro CloudRegion
    const bigquery = new BigQuery({
      projectId,
      location: 'US',
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    let rows = null;
    let queryError = null;
    
    // Lista de datasets para tentar a consulta sem falhas de nome
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
