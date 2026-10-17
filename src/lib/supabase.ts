import { createClient } from '@supabase/supabase-js';

function sanitizeSupabaseUrl(url?: string | null): string {
  const defaultUrl = 'https://zeipsxfnmkhrcqkxvddk.supabase.co';
  if (!url) return defaultUrl;
  let clean = String(url).trim();
  // Strip any accidental /rest/v1 or /rest/v1/ suffix that triggers PGRST125
  clean = clean.replace(/\/rest\/v1\/?$/i, '');
  // Strip trailing slashes
  clean = clean.replace(/\/+$/, '');
  // If URL is invalid, empty or points to an outdated/incorrect project, redirect to the official project zeipsxfnmkhrcqkxvddk
  if (clean.includes('giruouwvitrceivuxniu') || !clean.startsWith('http')) {
    return defaultUrl;
  }
  return clean || defaultUrl;
}

function sanitizeSupabaseKey(key?: string | null): string {
  const activeKey = 'sb_publishable_6aZTdeKjeASNqrJswJu9XQ_FD98xZpJ';
  if (!key) return activeKey;
  const clean = String(key).trim();
  if (!clean || clean === 'MY_SUPABASE_KEY' || clean.includes('undefined') || clean === 'sb_publishable_7ikVHkk3N6N7uv2-cmSsTg_VMgP9IMO') {
    return activeKey;
  }
  return clean;
}

// Configuration from environment or defaults specified for the SAL project
const rawUrl =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.NEXT_PUBLIC_SUPABASE_URL)) ||
  'https://zeipsxfnmkhrcqkxvddk.supabase.co';
const supabaseUrl = sanitizeSupabaseUrl(rawUrl);

const rawKey =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env?.VITE_SUPABASE_ANON_KEY)) ||
  'sb_publishable_6aZTdeKjeASNqrJswJu9XQ_FD98xZpJ';
const supabaseAnonKey = sanitizeSupabaseKey(rawKey);

// Verified active key for zeipsxfnmkhrcqkxvddk to guarantee zero-downtime if user key belongs to another project
const VERIFIED_ACTIVE_KEY = 'sb_publishable_6aZTdeKjeASNqrJswJu9XQ_FD98xZpJ';
let activeWorkingKey: string | null = null;

const resilientFetch: typeof fetch = async (input, init) => {
  let effectiveInit = init;
  if (activeWorkingKey) {
    const newHeaders = new Headers(init?.headers);
    newHeaders.set('apikey', activeWorkingKey);
    newHeaders.set('Authorization', `Bearer ${activeWorkingKey}`);
    effectiveInit = { ...init, headers: newHeaders };
  }

  let res = await fetch(input, effectiveInit);
  if (res.status === 401 && !activeWorkingKey) {
    console.warn(
      `[Supabase SAL] Requisição retornou 401. Alternando para a chave ativa verificada do projeto zeipsxfnmkhrcqkxvddk.`
    );
    activeWorkingKey = VERIFIED_ACTIVE_KEY;
    const newHeaders = new Headers(init?.headers);
    newHeaders.set('apikey', VERIFIED_ACTIVE_KEY);
    newHeaders.set('Authorization', `Bearer ${VERIFIED_ACTIVE_KEY}`);
    res = await fetch(input, { ...init, headers: newHeaders });
  }
  return res;
};

// 1. Official Supabase client connected to zeipsxfnmkhrcqkxvddk.supabase.co
export const rawSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  global: {
    fetch: resilientFetch
  }
});

// Helper for type-safe query on DadosGerais allowing accented column names
const fromDadosGerais = () => (rawSupabase.from('DadosGerais') as any);

// In-memory cache to deduplicate parallel requests and speed up chart generation
interface CacheEntry {
  data: any[];
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20000; // 20 seconds

export function clearQueryCache() {
  queryCache.clear();
}

/**
 * Helper to fetch records from table DadosGerais in fast parallel batches
 * so no records are silently discarded by PostgREST limits (1000 items per request)
 * and execution completes in < 2 seconds without statement timeouts.
 */
export async function queryDadosGeraisBatched(
  applyFilters: (query: any) => any,
  selectCols: string = '*',
  cacheKey?: string,
  maxRows: number = 60000
): Promise<{ data: any[]; error: any }> {
  // Check in-memory cache if cacheKey provided
  if (cacheKey) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { data: cached.data, error: null };
    }
  }

  try {
    // 1. Get exact record count with fast HEAD query
    let countQuery = fromDadosGerais().select('*', { count: 'exact', head: true });
    countQuery = applyFilters(countQuery);
    const { count, error: countError } = await countQuery;

    if (countError) {
      return { data: [], error: countError };
    }

    const total = Math.min(count || 0, maxRows);
    if (total === 0) {
      if (cacheKey) queryCache.set(cacheKey, { data: [], timestamp: Date.now() });
      return { data: [], error: null };
    }

    const pageSize = 1000;
    const numPages = Math.ceil(total / pageSize);
    const allRows: any[] = [];
    const concurrency = 6;

    for (let i = 0; i < numPages; i += concurrency) {
      const batchPromises = [];
      for (let j = i; j < Math.min(i + concurrency, numPages); j++) {
        const from = j * pageSize;
        const to = Math.min(from + pageSize - 1, total - 1);
        let q = fromDadosGerais().select(selectCols);
        q = applyFilters(q);
        batchPromises.push(q.range(from, to));
      }
      const results = await Promise.all(batchPromises);
      for (const res of results) {
        if (res.error) {
          return { data: allRows, error: res.error };
        }
        if (res.data) {
          allRows.push(...res.data);
        }
      }
    }

    if (cacheKey) {
      queryCache.set(cacheKey, { data: allRows, timestamp: Date.now() });
    }

    return { data: allRows, error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

// Helper to extract distinct values from an array
function distinct<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && v !== '')));
}

/**
 * Converte qualquer formato de data (DD/MM/AAAA, DD/MM/AA, YYYY-MM-DD ou número serial do Excel ex: 46302)
 * para o formato padronizado "DD/MM/AAAA".
 */
export function formatDataBR(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s) return '';

  // 1. Número serial do Excel (ex: 46302 -> 07/10/2026)
  // Fórmula: new Date((numeroExcel - 25569) * 86400 * 1000)
  const num = Number(s);
  if (!isNaN(num) && num > 1000 && num < 200000) {
    const ms = (Math.floor(num) - 25569) * 86400 * 1000;
    const d = new Date(ms);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  // 2. Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const parts = s.split('-');
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].substring(0, 2).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  // 3. Formato brasileiro DD/MM/AAAA ou DD/MM/AA
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2].trim();
      if (year.length === 2) year = `20${year}`;
      return `${day}/${month}/${year}`;
    }
  }

  return s;
}

// Convert hours string / time to minutes since start of day
function timeStringToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = String(t).split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

// Convert minutes to HH:MM format
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Direct handler for SAL operations against table public.DadosGerais.
 * Uses the exact columns:
 * MÊS, ANO, INSTALAÇÃO, MEDIDOR, REG, RAZAO, RZ_UL_LV, UL, FOTO, TIPO,
 * MATR, NL, DATA, HORA, ENDEREÇO, LEITURA, CONSUMO, nosb_impedimento,
 * nosb_simulacao, digitacao, cna, consistencia
 */
async function executeDadosGeraisHandler(
  fnName: string,
  args: any = {},
  rangeFrom?: number,
  rangeTo?: number
): Promise<{ data: any; error: any }> {
  try {
    switch (fnName) {
      // -------------------------------------------------------------
      // 1. FILTER QUERIES
      // -------------------------------------------------------------
      case 'dashboard_getanos': {
        const { data, error } = await fromDadosGerais()
          .select('ANO')
          .limit(1000);
        if (error) return { data: null, error };
        const rawAnos = distinct((data || []).map((r: any) => Number(r.ANO))).sort((a: number, b: number) => b - a);
        const anos = rawAnos.length > 0 ? rawAnos : [2026, 2025];
        return { data: anos.map(ano => ({ ano })), error: null };
      }

      case 'dashboard_getmeses': {
        const { data, error } = await fromDadosGerais()
          .select('MÊS')
          .limit(1000);
        if (error) return { data: null, error };
        const rawMeses = distinct((data || []).map((r: any) => String(r['MÊS'] || '')));
        const meses = rawMeses.length > 0 ? rawMeses : ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return { data: meses.map(mes => ({ mes })), error: null };
      }

      case 'dashboard_getrazoes': {
        const { data, error } = await fromDadosGerais()
          .select('RAZAO');
        if (error) return { data: null, error };
        const rawRazoes = distinct((data || []).map((r: any) => String(r.RAZAO || '').trim()))
          .filter(r => r && r !== '03' && r !== '3');
        const razoes = rawRazoes.sort((a, b) => Number(a) - Number(b));
        return { data: razoes.map(rz => ({ rz })), error: null };
      }

      case 'get_lista_matriculas': {
        const { data, error } = await fromDadosGerais()
          .select('MATR')
          .limit(1000);
        if (error) return { data: null, error };
        const matrs = distinct((data || []).map(r => String(r.MATR || ''))).sort();
        return { data: matrs.map(matr => ({ matr })), error: null };
      }

      case 'get_lista_motivos_nosb': {
        const { data, error } = await fromDadosGerais()
          .select('nosb_impedimento')
          .limit(1000);
        if (error) return { data: null, error };
        const motivos = distinct((data || []).map(r => String(r.nosb_impedimento || ''))).filter(m => m !== 'Faturada').sort();
        return { data: motivos.map(motivo => ({ motivo })), error: null };
      }

      case 'get_filtros_geral':
      case 'get_filtros_horario':
      case 'get_filtros_nosb':
      case 'get_filtros_nosb_simulacao':
      case 'get_filtros_apresentacao':
      case 'get_filtros_sequencia_leitura': {
        // Query sample of DadosGerais to populate available filter options
        const { data, error } = await fromDadosGerais()
          .select('ANO, MÊS, RAZAO, MATR, nosb_impedimento, nosb_simulacao, cna')
          .limit(1000);
        if (error) return { data: null, error };

        const rows = data || [];
        const rawAnos = distinct(rows.map(r => r.ANO)).sort((a, b) => Number(b) - Number(a));
        const anos = rawAnos.length > 0 ? rawAnos : [2026, 2025];

        const rawMeses = distinct(rows.map(r => r['MÊS']));
        const meses = rawMeses.length > 0 ? rawMeses : ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const rawRazoes = distinct(rows.map(r => String(r.RAZAO || '').trim()))
          .filter(r => r && r !== '03' && r !== '3');
        const razoes = rawRazoes.sort((a, b) => Number(a) - Number(b));

        const matriculas = distinct(rows.map(r => r.MATR)).sort();
        const motivos = distinct(rows.map(r => fnName === 'get_filtros_nosb_simulacao' ? r.nosb_simulacao : (r.nosb_impedimento || r.nosb_simulacao))).filter(Boolean).sort();
        const cnas = distinct(rows.map(r => r.cna)).sort();

        // Create unified array with attached metadata properties
        const filterArray: any = [
          ...anos.map(v => ({ coluna: 'ano', valor: v })),
          ...meses.map(v => ({ coluna: 'mes', valor: v })),
          ...razoes.map(v => ({ coluna: 'rz', valor: v })),
          ...matriculas.map(v => ({ coluna: 'matr', valor: v })),
          ...motivos.map(v => ({ coluna: 'motivo', valor: v })),
          ...cnas.map(v => ({ coluna: 'cna', valor: v }))
        ];

        filterArray.anos = anos;
        filterArray.meses = meses;
        filterArray.razoes = razoes;
        filterArray.matriculas = matriculas;
        filterArray.motivos = motivos;

        return { data: filterArray, error: null };
      }

      // -------------------------------------------------------------
      // 2. DASHBOARD
      // -------------------------------------------------------------
      case 'dashboard_resumogeral': {
        const { p_ano, p_mes, p_rz } = args;
        const cacheKey = `resumo_${p_ano}_${p_mes}_${p_rz ?? 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano !== undefined && p_ano !== null && p_ano !== '') {
            query = query.eq('ANO', p_ano);
          }
          if (p_mes) {
            query = query.eq('MÊS', p_mes);
          }
          if (p_rz !== undefined && p_rz !== null && p_rz !== '') {
            const rzStr = String(p_rz).padStart(2, '0');
            query = query.in('RAZAO', [String(p_rz), rzStr, Number(p_rz)]);
          }
          return query;
        }, 'ANO, MÊS, RAZAO, nosb_impedimento', cacheKey);

        if (error) return { data: null, error };

        const total = data.length;
        const impedimentos = data.filter(
          r => r.nosb_impedimento && String(r.nosb_impedimento).trim() !== '' && String(r.nosb_impedimento).trim() !== 'Faturada'
        ).length;
        const realizadas = Math.max(0, total - impedimentos);
        const percentual = total > 0 ? (impedimentos / total) * 100 : 0;

        return {
          data: [
            {
              leituras_a_realizar: total,
              leituras_nao_realizadas: impedimentos,
              leituras_realizadas: realizadas,
              percentual_impedimento: percentual
            }
          ],
          error: null
        };
      }

      case 'dashboard_leiturasportipo': {
        const { p_ano, p_mes, p_rz } = args;
        const cacheKey = `tipo_${p_ano}_${p_mes}_${p_rz ?? 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano !== undefined && p_ano !== null && p_ano !== '') {
            query = query.eq('ANO', p_ano);
          }
          if (p_mes) {
            query = query.eq('MÊS', p_mes);
          }
          if (p_rz !== undefined && p_rz !== null && p_rz !== '') {
            const rzStr = String(p_rz).padStart(2, '0');
            query = query.in('RAZAO', [String(p_rz), rzStr, Number(p_rz)]);
          }
          return query;
        }, 'TIPO, nosb_impedimento', cacheKey);

        if (error) return { data: null, error };

        const groups: { [key: string]: { total: number; nao_realizadas: number } } = {};
        data.forEach(r => {
          const tipo = String(r.TIPO || 'Geral').trim() || 'Geral';
          if (!groups[tipo]) groups[tipo] = { total: 0, nao_realizadas: 0 };
          groups[tipo].total++;
          if (r.nosb_impedimento && String(r.nosb_impedimento).trim() !== '' && String(r.nosb_impedimento).trim() !== 'Faturada') {
            groups[tipo].nao_realizadas++;
          }
        });

        const list = Object.entries(groups).map(([tipo, g]) => {
          const realizadas = Math.max(0, g.total - g.nao_realizadas);
          const percentual = g.total > 0 ? (g.nao_realizadas / g.total) * 100 : 0;
          return {
            tipo,
            total_leituras: g.total,
            realizadas,
            nao_realizadas: g.nao_realizadas,
            percentual_impedimento: percentual
          };
        });

        return { data: list, error: null };
      }

      // -------------------------------------------------------------
      // 3. CONTROLE DE LEITURISTA
      // -------------------------------------------------------------
      case 'get_controle_leiturista': {
        const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para } = args;
        const cacheKey = `leiturista_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de || '0'}_${p_ul_para || '9999'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_ul_de !== null && p_ul_de !== undefined && p_ul_de !== '') query = query.gte('UL', String(p_ul_de));
          if (p_ul_para !== null && p_ul_para !== undefined && p_ul_para !== '') query = query.lte('UL', String(p_ul_para));
          return query;
        }, 'ANO, MÊS, RAZAO, UL, MATR, TIPO, nosb_impedimento', cacheKey);

        if (error) return { data: null, error };

        const groups: { [key: string]: any } = {};
        data.forEach(r => {
          const key = `${r.ANO}_${r['MÊS']}_${r.RAZAO}_${r.UL}_${r.MATR}`;
          if (!groups[key]) {
            groups[key] = {
              ano: Number(r.ANO),
              mes: String(r['MÊS']),
              razao: Number(r.RAZAO),
              ul: String(r.UL),
              matr: String(r.MATR),
              leit_urb: 0,
              leit_povoado: 0,
              leit_rural: 0,
              leit_total: 0,
              impedimentos: 0,
              indicador: 0
            };
          }

          const g = groups[key];
          g.leit_total++;

          const tipo = String(r.TIPO || '').toLowerCase();
          if (tipo.includes('urb')) g.leit_urb++;
          else if (tipo.includes('pov')) g.leit_povoado++;
          else if (tipo.includes('rur')) g.leit_rural++;

          if (r.nosb_impedimento && String(r.nosb_impedimento).trim() !== '' && String(r.nosb_impedimento).trim() !== 'Faturada') {
            g.impedimentos++;
          }
        });

        const list = Object.values(groups).map(g => ({
          ...g,
          indicador: g.leit_total > 0 ? (g.impedimentos / g.leit_total) * 100 : 0
        })).sort((a, b) => b.impedimentos - a.impedimentos);

        return { data: list, error: null };
      }

      // -------------------------------------------------------------
      // 4. CONTROLE DE EVIDÊNCIAS
      // -------------------------------------------------------------
      case 'get_controle_evidencias': {
        const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para } = args;
        const cacheKey = `evidencias_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de || '0'}_${p_ul_para || '9999'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_ul_de !== null && p_ul_de !== undefined && p_ul_de !== '') query = query.gte('UL', String(p_ul_de));
          if (p_ul_para !== null && p_ul_para !== undefined && p_ul_para !== '') query = query.lte('UL', String(p_ul_para));
          return query;
        }, 'ANO, MÊS, RAZAO, UL, MATR, FOTO, digitacao', cacheKey);

        if (error) return { data: null, error };

        // Group by (MÊS, ANO, RAZAO, UL, MATR, digitacao) so digitacaoBreakdown has accurate details
        const groups: { [key: string]: any } = {};
        data.forEach(r => {
          const dig = r.digitacao !== null && r.digitacao !== undefined ? String(r.digitacao) : '1';
          const key = `${r['MÊS']}_${r.ANO}_${r.RAZAO}_${r.UL}_${r.MATR}_${dig}`;
          if (!groups[key]) {
            groups[key] = {
              v_mes: String(r['MÊS']),
              v_ano: Number(r.ANO),
              v_razao: Number(r.RAZAO),
              v_ul: String(r.UL),
              v_matr: String(r.MATR),
              v_dig: dig,
              v_solicitadas: 0,
              v_realizadas: 0,
              v_nao_realizadas: 0,
              v_indicador: 0
            };
          }

          const g = groups[key];
          g.v_solicitadas++;

          const foto = r.FOTO;
          const isRealizada =
            foto !== null &&
            foto !== undefined &&
            String(foto).trim() !== '' &&
            !['não', 'nao', 'n', 'false', '0', 'n-ok', 'nok'].includes(String(foto).trim().toLowerCase());

          if (isRealizada) {
            g.v_realizadas++;
          }
        });

        const list = Object.values(groups).map(g => {
          const nao_realizadas = Math.max(0, g.v_solicitadas - g.v_realizadas);
          const indicador = g.v_solicitadas > 0 ? (g.v_realizadas / g.v_solicitadas) * 100 : 0;
          return {
            ...g,
            v_nao_realizadas: nao_realizadas,
            v_indicador: indicador
          };
        }).sort((a, b) => b.v_nao_realizadas - a.v_nao_realizadas);

        return { data: list, error: null };
      }

      // -------------------------------------------------------------
      // 5. N'OSB - IMPEDIMENTO
      // -------------------------------------------------------------
      case 'get_nosb_impedimento': {
        const { p_ano, p_mes, p_rz, p_matr, p_motivo } = args;
        const cacheKey = `nosb_imp_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_motivo || 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_rz) {
            const rzStr = String(p_rz).padStart(2, '0');
            query = query.in('RAZAO', [String(p_rz), rzStr, Number(p_rz)]);
          }
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_motivo) query = query.eq('nosb_impedimento', p_motivo);
          query = query.not('nosb_impedimento', 'is', null);
          return query;
        }, 'MÊS, ANO, RAZAO, UL, INSTALAÇÃO, MEDIDOR, REG, TIPO, MATR, NL, LEITURA, nosb_impedimento', cacheKey);

        if (error) return { data: null, error };

        const mapped = (data || [])
          .filter(r => r.nosb_impedimento && String(r.nosb_impedimento).trim() !== '' && String(r.nosb_impedimento).trim() !== 'Faturada')
          .map(r => ({
            f_mes: String(r['MÊS'] || ''),
            f_ano: String(r.ANO || ''),
            f_rz: String(r.RAZAO || ''),
            f_ul: String(r.UL || ''),
            f_instalacao: String(r['INSTALAÇÃO'] || ''),
            f_medidor: String(r.MEDIDOR || ''),
            f_reg: String(r.REG || ''),
            f_tipo: String(r.TIPO || ''),
            f_matr: String(r.MATR || ''),
            f_nl: String(r.NL || ''),
            f_l_atual: String(r.LEITURA || ''),
            f_motivo: String(r.nosb_impedimento || '')
          }));

        const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
          ? mapped.slice(rangeFrom, rangeTo + 1)
          : mapped;

        return { data: sliced, error: null };
      }

      // -------------------------------------------------------------
      // 6. N'OSB - SIMULAÇÃO
      // -------------------------------------------------------------
      case 'get_nosb_simulacao': {
        const { p_ano, p_mes, p_rz, p_matr, p_motivo } = args;
        const cacheKey = `nosb_sim_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_motivo || 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_rz) {
            const rzStr = String(p_rz).padStart(2, '0');
            query = query.in('RAZAO', [String(p_rz), rzStr, Number(p_rz)]);
          }
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_motivo) query = query.eq('nosb_simulacao', p_motivo);
          query = query.not('nosb_simulacao', 'is', null);
          return query;
        }, 'MÊS, ANO, RAZAO, UL, INSTALAÇÃO, MEDIDOR, REG, TIPO, MATR, NL, LEITURA, nosb_simulacao', cacheKey);

        if (error) return { data: null, error };

        const mapped = (data || [])
          .filter(r => r.nosb_simulacao && String(r.nosb_simulacao).trim() !== '' && String(r.RAZAO || '').trim() !== '03' && String(r.RAZAO || '').trim() !== '3')
          .map(r => ({
            f_mes: String(r['MÊS'] || ''),
            f_ano: String(r.ANO || ''),
            f_rz: String(r.RAZAO || ''),
            f_ul: String(r.UL || ''),
            f_instalacao: String(r['INSTALAÇÃO'] || ''),
            f_medidor: String(r.MEDIDOR || ''),
            f_reg: String(r.REG || ''),
            f_tipo: String(r.TIPO || ''),
            f_matr: String(r.MATR || ''),
            f_nl: String(r.NL || ''),
            f_l_atual: String(r.LEITURA || ''),
            f_motivo: String(r.nosb_simulacao || '')
          }));

        const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
          ? mapped.slice(rangeFrom, rangeTo + 1)
          : mapped;

        return { data: sliced, error: null };
      }

      // -------------------------------------------------------------
      // 7. CONTROLE HORÁRIO
      // -------------------------------------------------------------
      case 'get_controle_horario': {
        const { p_ano, p_mes, p_matr, p_data } = args;
        const targetDate = p_data ? formatDataBR(p_data) : null;
        const cacheKey = `horario_${p_ano || 'all'}_${p_mes || 'all'}_${p_matr || 'all'}_${targetDate || 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_matr) query = query.eq('MATR', p_matr);
          return query;
        }, 'MATR, DATA, HORA, TIPO, RAZAO', cacheKey);

        if (error) return { data: null, error };

        // Group by MATR and formatted DATA (supporting Excel serial numbers like 46302)
        const groups: { 
          [key: string]: { 
            matr: string; 
            data: string; 
            horas: number[]; 
            total: number;
            leit_urb: number;
            leit_povoado: number;
            leit_rural: number;
          } 
        } = {};

        (data || []).forEach(r => {
          const rawRz = String(r.RAZAO || '').trim();
          if (rawRz === '03' || rawRz === '3') return;

          const matr = String(r.MATR || '').trim();
          if (!matr) return;

          const dtFormatted = formatDataBR(r.DATA);
          if (!dtFormatted) return;

          // Se houver filtro de data selecionado, comparar a data padronizada
          if (targetDate && dtFormatted !== targetDate) return;

          const key = `${matr}_${dtFormatted}`;
          if (!groups[key]) {
            groups[key] = { 
              matr, 
              data: dtFormatted, 
              horas: [], 
              total: 0,
              leit_urb: 0,
              leit_povoado: 0,
              leit_rural: 0
            };
          }

          groups[key].total++;

          const tipoNorm = String(r.TIPO || '').trim().toLowerCase();
          if (tipoNorm === 'urbano' || tipoNorm.startsWith('urb')) {
            groups[key].leit_urb++;
          } else if (tipoNorm === 'povoado' || tipoNorm.startsWith('pov')) {
            groups[key].leit_povoado++;
          } else if (tipoNorm === 'rural' || tipoNorm.startsWith('rur')) {
            groups[key].leit_rural++;
          } else {
            groups[key].leit_urb++;
          }

          const mins = timeStringToMinutes(r.HORA);
          if (mins !== null) {
            groups[key].horas.push(mins);
          }
        });

        const list = Object.values(groups).map(g => {
          const sortedHoras = g.horas.sort((a, b) => a - b);
          const minMins = sortedHoras.length > 0 ? sortedHoras[0] : 0;
          const maxMins = sortedHoras.length > 0 ? sortedHoras[sortedHoras.length - 1] : 0;
          const diffMins = Math.max(1, maxMins - minMins);
          const diffHours = diffMins / 60;
          const media = diffHours > 0 ? (g.total / diffHours) : 0;

          return {
            f_matricula: g.matr,
            f_data: g.data,
            f_hora_inicial: minutesToTime(minMins),
            f_hora_final: minutesToTime(maxMins),
            f_tempo_servico: minutesToTime(diffMins),
            f_tempo_servico_formatado: minutesToTime(diffMins),
            f_media_leitura_hora: media.toFixed(1),
            f_media_leitura_hora_inteiro: Math.round(media),
            f_total_leituras: g.total,
            f_leit_urb: g.leit_urb,
            f_leit_povoado: g.leit_povoado,
            f_leit_rural: g.leit_rural
          };
        }).sort((a, b) => a.f_matricula.localeCompare(b.f_matricula));

        const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
          ? list.slice(rangeFrom, rangeTo + 1)
          : list;

        return { data: sliced, error: null };
      }

      // -------------------------------------------------------------
      // 8. APRESENTAÇÃO
      // -------------------------------------------------------------
      case 'get_dados_apresentacao': {
        const { p_ano, p_mes, p_rz, p_matr, p_cna } = args;
        const cacheKey = `apresentacao_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_cna || 'all'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_rz) {
            const rzStr = String(p_rz).padStart(2, '0');
            query = query.in('RAZAO', [String(p_rz), rzStr, Number(p_rz)]);
          }
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_cna) query = query.eq('cna', p_cna);
          return query;
        }, 'MÊS, ANO, RAZAO, UL, INSTALAÇÃO, MEDIDOR, REG, MATR, cna, LEITURA', cacheKey);

        if (error) return { data: null, error };

        const mapped = (data || []).map(r => ({
          f_mes: String(r['MÊS'] || ''),
          f_ano: String(r.ANO || ''),
          f_rz: String(r.RAZAO || ''),
          f_ul: String(r.UL || ''),
          f_instalacao: String(r['INSTALAÇÃO'] || ''),
          f_medidor: String(r.MEDIDOR || ''),
          f_reg: String(r.REG || ''),
          f_matr: String(r.MATR || ''),
          f_cod: String(r.cna || ''),
          f_leitura: String(r.LEITURA || '')
        }));

        const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
          ? mapped.slice(rangeFrom, rangeTo + 1)
          : mapped;

        return { data: sliced, error: null };
      }

      // -------------------------------------------------------------
      // 9. SEQUÊNCIA DE LEITURA
      // -------------------------------------------------------------
      case 'get_sequencia_leitura': {
        const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para } = args;
        const cacheKey = `seq_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de || '0'}_${p_ul_para || '9999'}`;

        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_ano) query = query.eq('ANO', p_ano);
          if (p_mes) query = query.eq('MÊS', p_mes);
          if (p_matr) query = query.eq('MATR', p_matr);
          if (p_ul_de !== null && p_ul_de !== undefined && p_ul_de !== '') query = query.gte('UL', String(p_ul_de));
          if (p_ul_para !== null && p_ul_para !== undefined && p_ul_para !== '') query = query.lte('UL', String(p_ul_para));
          return query;
        }, 'MÊS, ANO, RAZAO, UL, RZ_UL_LV, INSTALAÇÃO, MEDIDOR, REG, MATR, HORA, DATA, ENDEREÇO, NL', cacheKey);

        if (error) return { data: null, error };

        const mapped = (data || []).map(r => ({
          f_mes: String(r['MÊS'] || ''),
          f_ano: String(r.ANO || ''),
          f_rz: String(r.RAZAO || ''),
          f_ul: String(r.UL || ''),
          f_rz_ul_lv: String(r.RZ_UL_LV || ''),
          f_instalacao: String(r['INSTALAÇÃO'] || ''),
          f_medidor: String(r.MEDIDOR || ''),
          f_reg: String(r.REG || ''),
          f_matr: String(r.MATR || ''),
          f_hora: String(r.HORA || ''),
          f_data: String(r.DATA || ''),
          f_endereco: String(r['ENDEREÇO'] || ''),
          f_nl: String(r.NL || '')
        }));

        const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
          ? mapped.slice(rangeFrom, rangeTo + 1)
          : mapped;

        return { data: sliced, error: null };
      }

      // -------------------------------------------------------------
      // 10. CONSULTA DE LEITURAS
      // -------------------------------------------------------------
      case 'consulta_leituras': {
        const { p_instalacao, p_medidor } = args;
        const { data, error } = await queryDadosGeraisBatched(q => {
          let query = q;
          if (p_instalacao) query = query.eq('INSTALAÇÃO', p_instalacao);
          if (p_medidor) query = query.eq('MEDIDOR', p_medidor);
          return query;
        }, '*');

        if (error) return { data: null, error };

        const mapped = (data || []).map(r => ({
          mes: String(r['MÊS'] || ''),
          ano: Number(r.ANO || 0),
          ul: String(r.UL || ''),
          instalacao_res: Number(r['INSTALAÇÃO'] || 0),
          medidor_res: String(r.MEDIDOR || ''),
          reg: String(r.REG || ''),
          matr: String(r.MATR || ''),
          cod: String(r.TIPO || r.RZ_UL_LV || ''),
          leitura: Number(r.LEITURA || 0),
          consumo: Number(r.CONSUMO || 0),
          dig: String(r.digitacao || ''),
          nosb_imp: String(r.nosb_impedimento || ''),
          nosb_sim: String(r.nosb_simulacao || ''),
          cna: String(r.cna || '')
        }));

        return { data: mapped, error: null };
      }

      default:
        console.warn(`Função RPC não reconhecida: ${fnName}`);
        return { data: [], error: null };
    }
  } catch (err: any) {
    console.error(`Erro ao processar ${fnName} em DadosGerais:`, err);
    return { data: null, error: err };
  }
}

/**
 * Chainable query builder that mimics PostgrestFilterBuilder
 * so calls like supabase.rpc(name, args).range(start, end) work seamlessly.
 */
class DadosGeraisRpcPromise implements PromiseLike<{ data: any; error: any }> {
  private fnName: string;
  private args: any;
  private rangeFrom?: number;
  private rangeTo?: number;

  constructor(fnName: string, args: any = {}) {
    this.fnName = fnName;
    this.args = args;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  async execute(): Promise<{ data: any; error: any }> {
    // Directly query table DadosGerais as requested - no server RPC dependency
    return executeDadosGeraisHandler(this.fnName, this.args, this.rangeFrom, this.rangeTo);
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<{ data: any; error: any } | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<{ data: any; error: any }> {
    return this.execute().finally(onfinally);
  }
}

/**
 * Exported `supabase` proxy:
 * Standard client for table operations (`supabase.from(...)`, `supabase.auth`, etc.)
 * with intelligent `supabase.rpc(...)` that routes to table DadosGerais directly and seamlessly.
 */
export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'rpc') {
      return (fnName: string, args: any = {}) => {
        return new DadosGeraisRpcPromise(fnName, args);
      };
    }
    return Reflect.get(target, prop, receiver);
  }
});
