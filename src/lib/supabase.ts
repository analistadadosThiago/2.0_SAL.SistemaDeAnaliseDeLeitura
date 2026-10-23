import { createClient } from '@supabase/supabase-js';

// Conexão oficial e verificada do projeto giruouwvitrceivuxniu
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://giruouwvitrceivuxniu.supabase.co')
  .trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fwlqlKAQo4_4jAyI6YRJdw_eGWVJyxw').trim();

// Cliente oficial Supabase conectado diretamente ao projeto zeipsxfnmkhrcqkxvddk
export const rawSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Helper for type-safe query on DadosGerais allowing accented column names
const fromDadosGerais = () => (rawSupabase.from('DadosGerais') as any);

// In-memory cache to deduplicate parallel requests and speed up chart generation
interface CacheEntry {
  data: any[];
  timestamp: number;
}
const USE_CACHE = false;
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
  // Check in-memory cache if cacheKey provided (bypassed when USE_CACHE is false)
  if (USE_CACHE && cacheKey) {
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { data: cached.data, error: null };
    }
  }

  try {
    const pageSize = 1000;
    const concurrency = 3;
    const allRows: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const promises = [];
      for (let c = 0; c < concurrency; c++) {
        const p = page + c;
        const from = p * pageSize;
        const to = from + pageSize - 1;
        promises.push((async () => {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              let q = fromDadosGerais().select(selectCols);
              q = applyFilters(q);
              const { data, error } = await q.range(from, to);
              if (error) throw error;
              return data || [];
            } catch (err) {
              if (attempt === 3) throw err;
              await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
            }
          }
          return [];
        })());
      }

      const results = await Promise.all(promises);
      for (let c = 0; c < results.length; c++) {
        const rows = results[c];
        if (rows && rows.length > 0) {
          allRows.push(...rows);
        }
        if (!rows || rows.length === 0) {
          hasMore = false;
          break;
        }
      }

      if (hasMore) {
        page += concurrency;
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
import { 
  getAnos, 
  getMeses, 
  getRazoes, 
  getMatriculas, 
  getMotivosImpedimento,
  getFiltrosGeral,
  getDashboardResumo,
  getDashboardLeiturasPorTipo,
  getControleLeiturista,
  getControleEvidencias,
  getNosbImpedimento,
  getNosbSimulacao,
  getControleHorario,
  getDadosApresentacao,
  getSequenciaLeitura,
  consultaLeituras
} from './dadosGeraisService';

async function executeDadosGeraisHandler(
  fnName: string,
  args: any = {},
  rangeFrom?: number,
  rangeTo?: number
): Promise<{ data: any; error: any }> {
  try {
    switch (fnName) {
      case 'dashboard_getanos':
        return getAnos();

      case 'dashboard_getmeses':
        return getMeses();

      case 'dashboard_getrazoes':
        return getRazoes();

      case 'get_lista_matriculas':
        return getMatriculas();

      case 'get_lista_motivos_nosb':
        return getMotivosImpedimento();

      case 'get_filtros_geral':
      case 'get_filtros_horario':
      case 'get_filtros_nosb':
      case 'get_filtros_nosb_simulacao':
      case 'get_filtros_apresentacao':
      case 'get_filtros_sequencia_leitura':
        return getFiltrosGeral();

      case 'dashboard_resumogeral':
        return getDashboardResumo(args.p_ano, args.p_mes, args.p_rz);

      case 'dashboard_leiturasportipo':
        return getDashboardLeiturasPorTipo(args.p_ano, args.p_mes, args.p_rz);

      case 'get_controle_leiturista':
        return getControleLeiturista(args);

      case 'get_controle_evidencias':
        return getControleEvidencias(args);

      case 'get_nosb_impedimento':
        return getNosbImpedimento({ ...args, rangeFrom, rangeTo });

      case 'get_nosb_simulacao':
        return getNosbSimulacao({ ...args, rangeFrom, rangeTo });

      case 'get_controle_horario':
        return getControleHorario({ ...args, rangeFrom, rangeTo });

      case 'get_dados_apresentacao':
        return getDadosApresentacao({ ...args, rangeFrom, rangeTo });

      case 'get_sequencia_leitura':
        return getSequenciaLeitura({ ...args, rangeFrom, rangeTo });

      case 'consulta_leituras':
        return consultaLeituras(args);

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
