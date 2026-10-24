const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: (process.env.BIGQUERY_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
});

exports.handler = async function (event, context) {
  try {
    const dataset = process.env.BIGQUERY_DATASET || 'dados_diarios';
    const projectId = process.env.BIGQUERY_PROJECT_ID || 'leiturabd';
    
    // Substitua 'DadosGerais' caso o nome da sua tabela no BigQuery seja diferente
    const query = `SELECT * FROM \`${projectId}.${dataset}.DadosGerais\` LIMIT 10000`;

    const [rows] = await bigquery.query({
      query: query,
      location: 'US', // Se criou a tabela no Brasil, altere para 'southamerica-east1'
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(rows),
    };
  } catch (error) {
    console.error('Erro ao consultar o BigQuery:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
