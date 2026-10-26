import { BigQuery } from '@google-cloud/bigquery';

export const handler = async (event, context) => {
  try {
    const projectId = process.env.BIGQUERY_PROJECT_ID;
    const datasetId = process.env.BIGQUERY_DATASET || 'dados_diarios';
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    let privateKey = process.env.BIGQUERY_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente do Netlify.' })
      };
    }

    // Normalização rigorosa da chave privada para resolver erros do OpenSSL
    privateKey = privateKey.replace(/\\n/g, '\n');

    const bigquery = new BigQuery({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    const query = `SELECT * FROM \`${projectId}.${datasetId}.dados_diarios\``;
    const [rows] = await bigquery.query(query);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rows),
    };
  } catch (error) {
    console.error('Erro na função get-data do BigQuery:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
