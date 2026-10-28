/**
 * Função Serverless para Google Planilhas (Google Sheets)
 * Substitui integralmente a conexão anterior com o BigQuery.
 * 
 * Permite leitura nativa de planilhas públicas ou publicadas na Web,
 * convertendo os dados em JSON estruturado com os 22 campos do sistema:
 * MÊS, ANO, INSTALACAO, MEDIDOR, REG, RAZAO, RZ_UL_LV, UL, FOTO, TIPO,
 * MATR, NL, DATA, HORA, ENDERECO, LEITURA, CONSUMO, nosb_impedimento,
 * nosb_simulacao, digitacao, cna, consistencia.
 */

function formatGoogleSheetsExportUrl(rawUrlOrId) {
  if (!rawUrlOrId) return '';
  const trimmed = rawUrlOrId.trim();

  // Se já for link direto de CSV
  if (trimmed.includes('output=csv') || trimmed.includes('format=csv') || trimmed.includes('out:csv')) {
    return trimmed;
  }

  // Se for link publicado na Web
  if (trimmed.includes('/pubhtml') || trimmed.includes('/pub?')) {
    return trimmed.replace(/\/pubhtml.*/, '/pub?output=csv').replace(/\/pub\?.*/, '/pub?output=csv');
  }

  // Se for URL padrão do Google Drive / Spreadsheets
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const sheetId = match[1];
    const gidMatch = trimmed.match(/gid=([0-9]+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
  }

  // Se for apenas o ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return `https://docs.google.com/spreadsheets/d/${trimmed}/export?format=csv`;
  }

  return trimmed;
}

function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  const len = csvText.length;
  for (let i = 0; i < len; i++) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some(val => val !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(val => val !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function normalizeHeaderKey(rawHeader) {
  if (!rawHeader) return '';
  const clean = rawHeader.trim();
  const lower = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (lower === 'mes') return 'MÊS';
  if (lower === 'ano') return 'ANO';
  if (lower === 'instalacao') return 'INSTALACAO';
  if (lower === 'medidor') return 'MEDIDOR';
  if (lower === 'reg' || lower === 'regional') return 'REG';
  if (lower === 'razao' || lower === 'rota') return 'RAZAO';
  if (lower === 'rz_ul_lv' || lower === 'rzullv' || lower === 'livro') return 'RZ_UL_LV';
  if (lower === 'ul') return 'UL';
  if (lower === 'foto') return 'FOTO';
  if (lower === 'tipo' || lower === 'tipo_ligacao') return 'TIPO';
  if (lower === 'matr' || lower === 'matricula' || lower === 'leiturista') return 'MATR';
  if (lower === 'nl' || lower === 'anomalia') return 'NL';
  if (lower === 'data' || lower === 'data_leitura') return 'DATA';
  if (lower === 'hora') return 'HORA';
  if (lower === 'endereco') return 'ENDERECO';
  if (lower === 'leitura' || lower === 'leitura_atual') return 'LEITURA ';
  if (lower === 'consumo') return 'CONSUMO';
  if (lower === 'nosb_impedimento' || lower === 'impedimento') return 'nosb_impedimento';
  if (lower === 'nosb_simulacao' || lower === 'simulacao') return 'nosb_simulacao';
  if (lower === 'digitacao') return 'digitacao';
  if (lower === 'cna') return 'cna';
  if (lower === 'consistencia' || lower === 'status') return 'consistencia';

  return clean;
}

export default async function handler(req, res) {
  // Cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido. Utilize GET.' });
  }

  try {
    const queryUrl = (req.query && req.query.url) ? req.query.url : '';
    const rawUrl = queryUrl || process.env.GOOGLE_SHEET_URL || process.env.VITE_GOOGLE_SHEET_URL || '';

    if (!rawUrl || rawUrl.trim() === '') {
      return res.status(200).json([]);
    }

    const exportUrl = formatGoogleSheetsExportUrl(rawUrl);
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, application/csv, text/plain, */*'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Erro ao buscar planilha do Google (${response.status}): ${response.statusText}`
      });
    }

    const csvText = await response.text();
    if (csvText.includes('<!DOCTYPE html>') && (csvText.includes('accounts.google.com') || csvText.includes('ServiceLogin'))) {
      return res.status(403).json({
        error: 'A planilha informada requer permissão. Altere o compartilhamento para "Qualquer pessoa com o link pode ler" ou "Publicar na Web".'
      });
    }

    const matrix = parseCSV(csvText);
    if (!matrix || matrix.length < 2) {
      return res.status(200).json([]);
    }

    const headers = matrix[0].map(h => normalizeHeaderKey(h));
    const records = [];

    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

      const record = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (!key) continue;
        const val = row[c] !== undefined ? row[c] : '';

        if (['ANO', 'RAZAO', 'RZ_UL_LV', 'UL', 'NL', 'LEITURA ', 'CONSUMO', 'digitacao'].includes(key)) {
          const num = Number(val.replace(',', '.').replace(/\s/g, ''));
          record[key] = isNaN(num) ? val : num;
        } else {
          record[key] = val;
        }
      }
      records.push(record);
    }

    return res.status(200).json(records);
  } catch (error) {
    console.error('Erro na função get-data do Google Sheets:', error);
    return res.status(500).json({ error: error.message });
  }
}
