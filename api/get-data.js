import { BigQuery } from '@google-cloud/bigquery';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const projectId = process.env.BIGQUERY_PROJECT_ID || 'leituradb';
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    let privateKey = process.env.BIGQUERY_PRIVATE_KEY || '';

    if (!clientEmail || !privateKey) {
      return res.status(500).json({ 
        error: 'Credenciais ausentes nas variáveis de ambiente do Netlify.' 
      });
    }

    // Normalização correta das quebras de linha da chave privada
    privateKey = privateKey.replace(/\\n/g, '\n');

    const bigquery = new BigQuery({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const query = `SELECT * \`leituradb.LeituraBD.dados_diarios\``; // Ajuste se necessário para o nome exato da sua tabela
    
    // Tentativa segura de busca nos datasets mais prováveis
    let rows = null;
    const datasets = ['LeituraBD', 'dados_diarios'];

    for (const ds of datasets) {
      try {
        const [result] = await bigquery.query(`SELECT * FROM \`${projectId}.${ds}.dados_diarios\` LIMIT 500`);
        rows = result;
        break;
      } catch (e) {
        // Tenta o próximo dataset se o atual falhar
      }
    }

    if (!rows) {
      return res.status(500).json({ error: 'Não foi possível encontrar a tabela de dados no BigQuery.' });
    }

    return res.status(200).json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
