/**
 * Configuração da Fonte de Dados: Google Planilhas (Google Sheets)
 * 
 * Insira abaixo a URL pública da sua Google Planilha ou o seu ID.
 * Exemplo de links suportados:
 *  - URL padrão com permissão de leitura: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing"
 *  - URL publicada na Web (CSV): "https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv"
 *  - Apenas o ID da planilha: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
 */
export const DEFAULT_GOOGLE_SHEET_URL: string = 
  (typeof process !== 'undefined' && process.env?.GOOGLE_SHEET_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GOOGLE_SHEET_URL) ||
  '';

/**
 * Converte qualquer formato de URL do Google Sheets na URL de exportação direta CSV
 */
export function formatGoogleSheetsExportUrl(rawUrlOrId: string): string {
  if (!rawUrlOrId) return '';
  const trimmed = rawUrlOrId.trim();

  // Já é uma URL direta de exportação CSV
  if (trimmed.includes('output=csv') || trimmed.includes('format=csv') || trimmed.includes('out:csv')) {
    return trimmed;
  }

  // URL publicada na web (/pubhtml ou /pub)
  if (trimmed.includes('/pubhtml') || trimmed.includes('/pub?')) {
    return trimmed.replace(/\/pubhtml.*/, '/pub?output=csv').replace(/\/pub\?.*/, '/pub?output=csv');
  }

  // URL padrão /spreadsheets/d/{ID}
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const sheetId = match[1];
    const gidMatch = trimmed.match(/gid=([0-9]+)/);
    const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
  }

  // Se foi fornecido apenas o ID alfanumérico longo
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return `https://docs.google.com/spreadsheets/d/${trimmed}/export?format=csv`;
  }

  return trimmed;
}
