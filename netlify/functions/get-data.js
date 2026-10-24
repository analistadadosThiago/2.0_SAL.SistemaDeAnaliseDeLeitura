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
    // Permite receber um parâmetro de filtro (ex: por chave/ID) se enviado pelo front-end
    const keyFilter = event.queryStringParameters && event.queryStringParameters.key;

    let query = `SELECT * FROM \`leiturabd.dados_diarios.sua_tabela\` `;
    const options = {
      query: '',
      location: 'US',
    };

    if (keyFilter) {
      query += `WHERE sua_coluna_chave = @keyValue LIMIT 1000`;
      options.query = query;
      options.params = { keyValue: keyFilter };
    } else {
      query += `LIMIT 1000`;
      options.query = query;
    }

    const [rows] = await bigquery.query(options);

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
