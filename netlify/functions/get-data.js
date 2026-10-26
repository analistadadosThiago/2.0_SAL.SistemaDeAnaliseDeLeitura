import { BigQuery } from '@google-cloud/bigquery';

export const handler = async (event, context) => {
  try {
    const projectId = process.env.BIGQUERY_PROJECT_ID;
    const rawDataset = process.env.BIGQUERY_DATASET;
    // O dataset real no BigQuery chama-se 'LeituraBD' e contém a tabela 'dados_diarios'
    const datasetId = (rawDataset && rawDataset !== 'dados_diarios') ? rawDataset : 'LeituraBD';
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    let privateKey = process.env.BIGQUERY_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente do Netlify.' }),
      };
    }

    // Normalização rigorosa da chave privada para resolver erros do OpenSSL
    privateKey = privateKey.replace(/\\n/g, '\n');

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
