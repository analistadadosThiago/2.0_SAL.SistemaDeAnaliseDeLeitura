import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';

/**
 * Normaliza e valida a chave privada PEM para total compatibilidade com OpenSSL 3.0 / Node.js
 * Resolve o erro 'error:1E08010C:DECODER routines::unsupported' mesmo com quebras de linha em espaços
 * ou caracteres residuais de digitação.
 */
function formatPrivateKey(key) {
  if (!key) return '';
  let formatted = String(key).trim();

  // 1. Remove aspas externas adicionadas por variáveis de ambiente ou arquivos .env
  if ((formatted.startsWith('"') && formatted.endsWith('"')) ||
      (formatted.startsWith("'") && formatted.endsWith("'"))) {
    formatted = formatted.slice(1, -1).trim();
  }

  // 2. Converte quebras de linha literais '\n', '\\n' e limpa retornos de carro '\r'
  formatted = formatted
    .replace(/\\r/g, '')
    .replace(/\r/g, '')
    .replace(/\\\\n/g, '\n')
    .replace(/\\n/g, '\n');

  // 3. Se as quebras de linha foram convertidas em espaços pelo painel/formulário
  if (!formatted.includes('\n') && formatted.includes(' ')) {
    const words = formatted.split(/\s+/).filter(Boolean);
    const startIndex = words.findIndex((w, i) => w.includes('BEGIN') || (w.includes('PRIVATE') && words[i - 1]?.includes('BEGIN')));
    const endIndex = words.findIndex(w => w.includes('END'));
    
    // Se encontrar cabeçalho e rodapé
    if (startIndex !== -1 && endIndex !== -1) {
      // Reconstrói as linhas entre o BEGIN e o END
      const headerWords = words.slice(0, 3).join(' '); // "-----BEGIN PRIVATE KEY-----"
      const footerWords = words.slice(-3).join(' '); // "-----END PRIVATE KEY-----"
      const bodyLines = words.slice(3, -3);
      const rawBody = bodyLines.join('');

      // Testa a chave padrão
      const standardPem = `${headerWords}\n${(rawBody.match(/.{1,64}/g) || []).join('\n')}\n${footerWords}\n`;
      try {
        crypto.createPrivateKey(standardPem);
        return standardPem;
      } catch (_) {}

      // Se houver caractere residual que quebra o alinhamento base64 (% 4 !== 0), encontra a chave válida
      for (let i = rawBody.length - 1; i >= 0; i--) {
        const candidate = rawBody.slice(0, i) + rawBody.slice(i + 1);
        if (candidate.length % 4 === 0) {
          try {
            const candPem = `${headerWords}\n${(candidate.match(/.{1,64}/g) || []).join('\n')}\n${footerWords}\n`;
            crypto.createPrivateKey(candPem);
            return candPem;
          } catch (_) {}
        }
      }
    }
  }

  // 4. Reconstrói bloco PEM padrão (RFC 7468)
  const beginTag = '-----BEGIN PRIVATE KEY-----';
  const endTag = '-----END PRIVATE KEY-----';
  if (formatted.includes(beginTag) && formatted.includes(endTag)) {
    const beginIndex = formatted.indexOf(beginTag);
    const endIndex = formatted.indexOf(endTag);
    const rawBody = formatted.slice(beginIndex + beginTag.length, endIndex).trim().replace(/\s+/g, '');
    
    const pem = `${beginTag}\n${(rawBody.match(/.{1,64}/g) || []).join('\n')}\n${endTag}\n`;
    try {
      crypto.createPrivateKey(pem);
      return pem;
    } catch (_) {}

    // Auto-recuperação caso contenha caractere excedente
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

  return formatted;
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
    let tableId = process.env.BIGQUERY_TABLE || 'dados_diarios';

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

    // Possíveis combinações de dataset e tabela
    const candidateDatasets = [datasetId, 'LeituraBD', 'dados_diarios', 'dadosdiarios'];
    const candidateTables = [tableId, 'dados_diarios', 'DadosGerais'];

    let rows = null;
    let lastError = null;

    // Tenta encontrar a tabela existente nas combinações possíveis
    for (const d of candidateDatasets) {
      for (const t of candidateTables) {
        try {
          const query = `SELECT * FROM \`${projectId}.${d}.${t}\``;
          const [resultRows] = await bigquery.query({
            query,
            location: process.env.BIGQUERY_LOCATION || undefined,
          });
          rows = resultRows;
          console.log(`[BigQuery Netlify] Consulta executada com sucesso na tabela ${projectId}.${d}.${t}: ${rows.length} registros`);
          break;
        } catch (err) {
          lastError = err;
          // Se o erro não for de "Not found", para e reporta o erro
          if (!err.message?.includes('Not found')) {
            throw err;
          }
        }
      }
      if (rows) break;
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
      body: JSON.stringify({
        error: error.message || 'Erro ao consultar dados no BigQuery'
      }),
    };
  }
};
