import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';

/**
 * Normaliza e formata a chave privada PEM para compatibilidade estrita com OpenSSL 3.0 / Node.js
 * Corrige o erro 'error:1E08010C:DECODER routines::unsupported'
 */
function formatPrivateKey(rawKey) {
  if (!rawKey) return '';
  let key = String(rawKey).trim();

  // 1. Remove aspas externas adicionadas por variáveis de ambiente ou arquivos .env
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // 2. Substitui quebras de linha literais pelas quebras reais (\n e \\n)
  key = key
    .replace(/\\r/g, '')
    .replace(/\r/g, '')
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n');

  // 3. Se a chave foi colada sem quebras de linha (espaços entre as palavras e linhas do PEM)
  if (!key.includes('\n') && key.includes(' ')) {
    const words = key.split(/\s+/).filter(Boolean);
    const beginIdx = words.findIndex((w, i) => w.includes('BEGIN') || (w.includes('PRIVATE') && words[i - 1]?.includes('BEGIN')));
    const endIdx = words.findIndex(w => w.includes('END'));

    if (beginIdx !== -1 && endIdx !== -1) {
      const header = words.slice(0, 3).join(' '); // "-----BEGIN PRIVATE KEY-----"
      const footer = words.slice(-3).join(' '); // "-----END PRIVATE KEY-----"
      const rawBody = words.slice(3, -3).join('');

      // Testa chave padrão
      const standardPem = `${header}\n${(rawBody.match(/.{1,64}/g) || []).join('\n')}\n${footer}\n`;
      try {
        crypto.createPrivateKey(standardPem);
        return standardPem;
      } catch (_) {}

      // Se houver caractere residual que quebra o alinhamento base64 (% 4 !== 0), encontra a chave válida
      for (let i = rawBody.length - 1; i >= 0; i--) {
        const candidate = rawBody.slice(0, i) + rawBody.slice(i + 1);
        if (candidate.length % 4 === 0) {
          try {
            const candPem = `${header}\n${(candidate.match(/.{1,64}/g) || []).join('\n')}\n${footer}\n`;
            crypto.createPrivateKey(candPem);
            return candPem;
          } catch (_) {}
        }
      }
    }
  }

  // 4. Reconstrói o bloco PEM padronizado (RFC 7468)
  const beginTag = '-----BEGIN PRIVATE KEY-----';
  const endTag = '-----END PRIVATE KEY-----';
  if (key.includes(beginTag) && key.includes(endTag)) {
    const beginIndex = key.indexOf(beginTag);
    const endIndex = key.indexOf(endTag);
    const rawBody = key.slice(beginIndex + beginTag.length, endIndex).trim().replace(/\s+/g, '');

    const pem = `${beginTag}\n${(rawBody.match(/.{1,64}/g) || []).join('\n')}\n${endTag}\n`;
    try {
      crypto.createPrivateKey(pem);
      return pem;
    } catch (_) {}

    for (let i = rawBody.length - 1; i >= 0; i--) {
      const candidate = rawBody.slice(0, i) + rawBody.slice(i + 1);
      if (candidate.length % 4 === 0) {
        try {
          const candPem = `${beginTag}\n${(candidate.match(/.{1,64}/g) || []).join('\n')}\n${endTag}\n`;
          crypto.createPrivateKey(candPem);
          return candPem;
        } catch (_) {}
      }
    }

    return pem;
  }

  return key;
}

export const handler = async (event, _context) => {
  // Tratamento de requisições preflight OPTIONS (CORS)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: ''
    };
  }

  try {
    let projectId = process.env.BIGQUERY_PROJECT_ID || 'leiturabd';
    let datasetId = process.env.BIGQUERY_DATASET || 'LeituraBD';
    let clientEmail = process.env.BIGQUERY_CLIENT_EMAIL;
    let rawPrivateKey = process.env.BIGQUERY_PRIVATE_KEY;

    // Suporte caso as credenciais estejam em JSON na variável BIGQUERY_CREDENTIALS
    if (process.env.BIGQUERY_CREDENTIALS) {
      try {
        const creds = JSON.parse(process.env.BIGQUERY_CREDENTIALS);
        if (creds.project_id) projectId = creds.project_id;
        if (creds.client_email) clientEmail = creds.client_email;
        if (creds.private_key) rawPrivateKey = creds.private_key;
      } catch (_) {}
    }

    const privateKey = formatPrivateKey(rawPrivateKey);

    if (!projectId || !clientEmail || !privateKey) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Credenciais do BigQuery ausentes nas variáveis de ambiente (BIGQUERY_PROJECT_ID, BIGQUERY_CLIENT_EMAIL, BIGQUERY_PRIVATE_KEY).'
        })
      };
    }

    const bigquery = new BigQuery({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    // Consulta direta à tabela de dados diários no BigQuery
    let rows = null;
    let lastError = null;

    const candidateDatasets = [datasetId, 'LeituraBD', 'dados_diarios', 'dadosdiarios'];
    for (const d of candidateDatasets) {
      try {
        const query = `SELECT * FROM \`${projectId}.${d}.dados_diarios\``;
        const [resultRows] = await bigquery.query(query);
        rows = resultRows;
        break;
      } catch (err) {
        lastError = err;
        if (!err.message?.includes('Not found')) {
          throw err;
        }
      }
    }

    if (!rows) {
      // Fallback para tabela DadosGerais caso a tabela tenha este identificador
      for (const d of candidateDatasets) {
        try {
          const query = `SELECT * FROM \`${projectId}.${d}.DadosGerais\``;
          const [resultRows] = await bigquery.query(query);
          rows = resultRows;
          break;
        } catch (err) {
          lastError = err;
          if (!err.message?.includes('Not found')) {
            throw err;
          }
        }
      }
    }

    if (!rows && lastError) {
      throw lastError;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(rows || []),
    };
  } catch (error) {
    console.error('Erro na função get-data do BigQuery:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
