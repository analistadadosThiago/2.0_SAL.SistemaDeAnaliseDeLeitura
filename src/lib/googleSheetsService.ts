import { formatGoogleSheetsExportUrl, DEFAULT_GOOGLE_SHEET_URL } from '../config/sheetConfig';

/**
 * SAL - Serviço de Integração Direta com Google Planilhas (Google Sheets)
 * Substitui integralmente a conexão anterior com o BigQuery.
 * 
 * Assegura a extração e o preenchimento exato dos 22 campos do sistema:
 * MÊS, ANO, INSTALACAO, MEDIDOR, REG, RAZAO, RZ_UL_LV, UL, FOTO, TIPO,
 * MATR, NL, DATA, HORA, ENDERECO, LEITURA, CONSUMO, nosb_impedimento,
 * nosb_simulacao, digitacao, cna, consistencia.
 */

/**
 * Parser de CSV robusto em conformidade com RFC-4180 (suporta aspas, vírgulas internas e quebras de linha)
 */
export function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  const len = csvText.length;
  for (let i = 0; i < len; i++) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // pula aspas escapadas ("")
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // pula \n em CRLF
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

/**
 * Normaliza o cabeçalho da planilha para as 22 colunas padrão do sistema
 */
export function normalizeHeaderKey(rawHeader: string): string {
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

/**
 * Converte linhas de matriz CSV em objetos mapeados para os 22 campos
 */
export function transformCsvRowsToRecords(rows: string[][]): any[] {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map(h => normalizeHeaderKey(h));
  const records: any[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

    const record: Record<string, any> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      const rawVal = row[c] !== undefined ? row[c] : '';

      // Conversão inteligente de tipos numéricos
      if (['ANO', 'RAZAO', 'RZ_UL_LV', 'UL', 'NL', 'LEITURA ', 'CONSUMO', 'digitacao'].includes(key)) {
        const num = Number(rawVal.replace(',', '.').replace(/\s/g, ''));
        record[key] = isNaN(num) ? rawVal : num;
      } else {
        record[key] = rawVal;
      }
    }

    records.push(record);
  }

  return records;
}

/**
 * Busca dados da Google Planilha através de URL pública ou endpoint proxy
 */
export async function fetchGoogleSheetData(sheetUrlOrId?: string): Promise<any[] | null> {
  const targetUrl = sheetUrlOrId || DEFAULT_GOOGLE_SHEET_URL;
  if (!targetUrl) {
    return null;
  }

  const exportUrl = formatGoogleSheetsExportUrl(targetUrl);
  if (!exportUrl) {
    return null;
  }

  try {
    const res = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv, application/csv, text/plain, */*'
      }
    });

    if (!res.ok) {
      console.warn(`[Google Sheets] Erro ao carregar planilha (${res.status}): ${res.statusText}`);
      return null;
    }

    const csvText = await res.text();
    if (!csvText || csvText.trim().length === 0) {
      return null;
    }

    // Se o Google redirecionar para a página de login do Google, significa que a planilha não está com acesso público de leitor
    if (csvText.includes('<!DOCTYPE html>') && (csvText.includes('accounts.google.com') || csvText.includes('ServiceLogin'))) {
      console.warn('[Google Sheets] A planilha requer autorização. Certifique-se de que o link está definido como "Qualquer pessoa com o link pode ler" ou "Publicar na Web".');
      return null;
    }

    const parsedMatrix = parseCSV(csvText);
    const records = transformCsvRowsToRecords(parsedMatrix);

    if (records.length > 0) {
      console.log(`[Google Sheets] ${records.length} registros obtidos com sucesso da planilha.`);
      return records;
    }

    return null;
  } catch (err: any) {
    console.error('[Google Sheets] Falha na requisição da planilha:', err?.message || err);
    return null;
  }
}
