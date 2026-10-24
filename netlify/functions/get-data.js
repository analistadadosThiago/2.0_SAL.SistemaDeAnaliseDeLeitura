const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  projectId: process.env.BIGQUERY_PROJECT_ID,
  credentials: {
    client_email: process.env.BIGQUERY_CLIENT_EMAIL,
    private_key: process.env.BIGQUERY_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
});

exports.handler = async function (event, context) {
  try {
    // IMPORTANTE: Substitua 'seu_dataset.sua_tabela' pelos nomes reais no seu BigQuery
    const query = `SELECT * FROM \`leiturabd.seu_dataset.sua_tabela\` LIMIT 1000`;

    const [rows] = await bigquery.query({
      query: query,
      location: 'US', // Ajuste a localização se necessário (ex: 'southamerica-east1')
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
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
