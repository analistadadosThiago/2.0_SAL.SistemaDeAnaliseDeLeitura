import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';

/**
 * Normaliza a chave privada para garantir compatibilidade com o OpenSSL 3.0.
 * Resolve chaves com quebras de linha escapadas (\n), aspas envolventes,
 * ou linhas colapsadas em espaços.
 */
function normalizePrivateKey(raw) {
  if (!raw) return '';
  let str = String(raw).trim();

  // Remove aspas envolventes caso presentes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }

  // Substitui literais \n por quebras de linha reais
  str = str.replace(/\\n/g, '\n').replace(/\\r/g, '');

  // Se a chave estiver em uma linha só com espaços entre blocos base64,
  // reconstrói o formato PEM PKCS#8 canônico através do módulo crypto
  try {
    const beginHeader = '-----BEGIN PRIVATE KEY-----';
    const endFooter = '-----END PRIVATE KEY-----';
    if (str.includes(beginHeader) && str.includes(endFooter)) {
      const startIndex = str.indexOf(beginHeader) + beginHeader.length;
      const endIndex = str.indexOf(endFooter);
      const body = str.slice(startIndex, endIndex).replace(/\s+/g, '');
      const der = Buffer.from(body, 'base64');
      const pkey = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
      return pkey.export({ format: 'pem', type: 'pkcs8' }).toString();
    }
  } catch {
    // Se a reconstrução DER falhar, utiliza o resultado com as quebras de linha substituídas
  }

  return str;
}

export const handler = async (event, context) => {
  try {
    const projectId = process.env.BIGQUERY_PROJECT_ID || 'leiturabd';
    let datasetId = process.env.BIGQUERY_DATASET || 'LeituraBD';
    if (datasetId === 'dados_diarios') {
      datasetId = 'LeituraBD';
    }
    const clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    const rawPrivateKey = process.env.BIGQUERY_PRIVATE_KEY;

    if (!projectId || !clientEmail || !rawPrivateKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente do Netlify.' })
      };
    }

    const privateKey = normalizePrivateKey(rawPrivateKey);

    const bigquery = new BigQuery({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    let query = `SELECT * FROM \`${projectId}.${datasetId}.dados_diarios\``;
    let rows;
    try {
      [rows] = await bigquery.query(query);
    } catch (queryErr) {
      // Se o dataset configurado não for encontrado, tenta com o dataset 'LeituraBD'
      if (datasetId !== 'LeituraBD' && String(queryErr?.message || '').toLowerCase().includes('not found')) {
        datasetId = 'LeituraBD';
        query = `SELECT * FROM \`${projectId}.${datasetId}.dados_diarios\``;
        [rows] = await bigquery.query(query);
      } else {
        throw queryErr;
      }
    }

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
