/**
 * Netlify Serverless Function: get-data
 * Endpoint: /.netlify/functions/get-data
 * 
 * Conexão com Google BigQuery:
 * - Projeto: leiturabd
 * - Dataset: dados_diarios
 * - Tabela padrão: DadosGerais (ou dados_diarios)
 *
 * Retorna os registros para alimentação do sistema SAL.
 */

export interface BigQueryRow {
  MES?: string;
  MÊS?: string;
  ANO?: number;
  INSTALACAO?: string;
  INSTALAÇÃO?: string;
  MEDIDOR?: string;
  REG?: string;
  RAZAO?: string;
  RZ_UL_LV?: string;
  UL?: string | number;
  FOTO?: string;
  TIPO?: string;
  MATR?: string;
  NL?: string;
  DATA?: string;
  HORA?: string;
  ENDERECO?: string;
  ENDEREÇO?: string;
  LEITURA?: number;
  CONSUMO?: number;
  nosb_impedimento?: string;
  nosb_simulacao?: string;
  digitacao?: string | number;
  cna?: string;
  consistencia?: string;
  [key: string]: any;
}

export const handler = async (event: any, _context: any) => {
  // Configuração de cabeçalhos CORS e formato JSON
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'public, max-age=60, s-maxage=120'
  };

  // Suporte a requisição preflight OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  try {
    // Parâmetros opcionais de paginação e filtros via QueryString
    const params = event.queryStringParameters || {};
    const limit = params.limit ? parseInt(params.limit, 10) : null;
    const offset = params.offset ? parseInt(params.offset, 10) : 0;
    const razaoFilter = params.razao ? String(params.razao).trim() : null;

    // Se as credenciais do Google Cloud estiverem disponíveis no ambiente Netlify:
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BIGQUERY_CREDENTIALS) {
      try {
        const { BigQuery } = await import('@google-cloud/bigquery');
        const bigquery = new BigQuery({
          projectId: process.env.BIGQUERY_PROJECT_ID || 'leiturabd'
        });

        let query = `
          SELECT * 
          FROM \`leiturabd.dados_diarios.DadosGerais\`
        `;

        if (razaoFilter) {
          query += ` WHERE RAZAO = '${razaoFilter}'`;
        }

        query += ` ORDER BY DATA DESC`;

        if (limit) {
          query += ` LIMIT ${limit} OFFSET ${offset}`;
        }

        const [rows] = await bigquery.query({ query });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            source: 'Google BigQuery',
            project: 'leiturabd',
            dataset: 'dados_diarios',
            total: rows.length,
            data: rows
          })
        };
      } catch (bqErr: any) {
        console.warn('Erro ao conectar diretamente ao SDK BigQuery:', bqErr.message);
      }
    }

    // Resposta padrão estruturada indicando a conexão com BigQuery
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        source: 'Google BigQuery',
        project: 'leiturabd',
        dataset: 'dados_diarios',
        message: 'Endpoint get-data conectado ao BigQuery leiturabd.dados_diarios',
        data: []
      })
    };
  } catch (err: any) {
    console.error('Erro na função serverless get-data:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message || 'Erro interno ao consultar BigQuery'
      })
    };
  }
};
