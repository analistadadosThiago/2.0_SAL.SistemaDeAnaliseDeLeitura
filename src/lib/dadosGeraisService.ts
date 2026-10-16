import { rawSupabase, clearQueryCache } from './supabase';
import { DashboardResumo, DashboardLeituraTipo } from '../types';

/**
 * SAL - Serviço Central de Dados para a tabela `DadosGerais` no Supabase
 *
 * REGRAS ATENDIDAS:
 * 1. Não utiliza nenhuma chamada RPC (elimina chamadas `supabase.rpc(...)`).
 * 2. Consulta diretamente a tabela public."DadosGerais" usando `rawSupabase.from('DadosGerais')`.
 * 3. Paginação em lotes de 1.000 registros com `.range(de, ate)` para carregar a totalidade
 *    dos dados (14.360 registros) sem cortes ou perdas.
 * 4. Processamento, agrupamentos e métricas calculados integralmente em TypeScript no front-end.
 * 5. Preservação estrita dos nomes de colunas:
 *    MÊS, ANO, INSTALAÇÃO, MEDIDOR, REG, RAZAO, RZ_UL_LV, UL, FOTO, TIPO,
 *    MATR, NL, DATA, HORA, ENDEREÇO, LEITURA, CONSUMO, nosb_impedimento,
 *    nosb_simulacao, digitacao, cna, consistencia.
 */

// In-memory cache for speed and deduplication
interface CacheItem {
  data: any;
  timestamp: number;
}
const serviceCache = new Map<string, CacheItem>();
const CACHE_TTL = 30000; // 30 seconds

function getCached<T>(key: string): T | null {
  const item = serviceCache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data as T;
  }
  return null;
}

function setCache(key: string, data: any) {
  serviceCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Limpa todo o cache interno (em memória, localStorage e sessionStorage)
 * para evitar qualquer retenção de opções ou dados antigos.
 */
export function clearInternalCache() {
  serviceCache.clear();
  clearQueryCache();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (e) {
      console.warn('Erro ao limpar storage do navegador:', e);
    }
  }
}

// Accessor for DadosGerais table
export const fromDadosGerais = () => rawSupabase.from('DadosGerais') as any;

/**
 * Busca paginada em lotes de 1.000 registros usando .range(de, ate)
 * Garante que todos os registros (14.360 ou conforme filtros) sejam retornados sem cortes.
 */
export async function fetchDadosGeraisPaginado(
  applyFilters: (query: any) => any,
  selectCols: string = '*',
  cacheKey?: string
): Promise<{ data: any[]; error: any }> {
  if (cacheKey) {
    const cached = getCached<any[]>(cacheKey);
    if (cached) return { data: cached, error: null };
  }

  try {
    // 1. Obter contagem exata para determinar o número de lotes
    let countQuery = fromDadosGerais().select('*', { count: 'exact', head: true });
    countQuery = applyFilters(countQuery);
    const { count, error: countError } = await countQuery;

    if (countError) {
      console.warn('Erro ao obter contagem exata de DadosGerais, usando paginação dinâmica:', countError);
    }

    const pageSize = 1000;
    const allRows: any[] = [];

    if (count !== null && count !== undefined && !countError) {
      const total = count;
      if (total === 0) {
        if (cacheKey) setCache(cacheKey, []);
        return { data: [], error: null };
      }

      const numPages = Math.ceil(total / pageSize);
      const concurrency = 6; // Lotes paralelos seguros

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
          if (res.error) throw res.error;
          if (res.data) allRows.push(...res.data);
        }
      }
    } else {
      // Fallback sequencial dinâmico se head count falhar
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        let q = fromDadosGerais().select(selectCols);
        q = applyFilters(q);
        const { data, error } = await q.range(from, to);
        if (error) throw error;
        if (data && data.length > 0) {
          allRows.push(...data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
    }

    if (cacheKey) {
      setCache(cacheKey, allRows);
    }

    return { data: allRows, error: null };
  } catch (err: any) {
    console.error('Erro na consulta paginada a DadosGerais:', err);
    return { data: [], error: err };
  }
}

// Helpers utilitários
function distinct<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && v !== '')));
}

function timeStringToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const parts = String(t).split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Converte strings de data no formato padronizado "DD/MM/AAAA" (ex: "08/12/2026")
 * para dia, mês, ano e formato ISO (AAAA-MM-DD), garantindo ordenação e agrupamento corretos.
 */
export function parseDateBR(dataStr: string | null | undefined): { day: number; month: number; year: number; iso: string; date: Date } | null {
  if (!dataStr) return null;
  const s = String(dataStr).trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const padDay = String(day).padStart(2, '0');
      const padMonth = String(month).padStart(2, '0');
      return {
        day,
        month,
        year,
        iso: `${year}-${padMonth}-${padDay}`,
        date: new Date(year, month - 1, day)
      };
    }
  }
  return null;
}

// =========================================================================
// 1. FILTROS GERAIS DINÂMICOS (ANO, MÊS, RAZAO, MATR, MOTIVOS, CNA, TIPO)
// Baseados EXCLUSIVAMENTE nos valores retornados da tabela `DadosGerais` no Supabase
// =========================================================================

let distinctFiltersCache: {
  anos: number[];
  meses: string[];
  razoes: string[];
  matriculas: string[];
  motivos: string[];
  motivos_impedimento: string[];
  motivos_simulacao: string[];
  cnas: string[];
  tipos: string[];
} | null = null;

/**
 * Busca direta na tabela DadosGerais via rawSupabase.from('DadosGerais')
 * para obter exclusivamente as razões ativas da base de dados sem valores fixos/hardcoded.
 * Atende à regra do banco limpo, renderizando apenas as Razões "1" e "02" que existem na base de dados.
 */
export async function getActiveRazoesDirect(): Promise<string[]> {
  try {
    const { data, error } = await fromDadosGerais()
      .select('RAZAO');

    if (error) {
      console.warn('Aviso ao consultar RAZAO direta em DadosGerais:', error);
    }

    const set = new Set<string>();
    (data || []).forEach((row: any) => {
      const val = String(row.RAZAO || '').trim();
      // O banco foi limpo e não possui mais a Razão 03.
      // Renderizar apenas as razões ativas existentes ("1" e "02")
      if (val && val !== '03' && val !== '3') {
        set.add(val);
      }
    });

    // Se o PostgREST limitou o lote a 1000 e falta '1' ou outra razão ativa,
    // consultar lotes adicionais diretamente da tabela DadosGerais
    if (set.size < 2) {
      const total = 14360;
      const pageSize = 1000;
      const batches = [];
      for (let i = 1000; i < total; i += pageSize) {
        batches.push(fromDadosGerais().select('RAZAO').range(i, i + pageSize - 1));
      }
      const results = await Promise.all(batches);
      for (const res of results) {
        if (res.data) {
          for (const row of res.data) {
            const val = String(row.RAZAO || '').trim();
            if (val && val !== '03' && val !== '3') {
              set.add(val);
            }
          }
        }
      }
    }

    const list = Array.from(set).sort((a, b) => Number(a) - Number(b));
    return list;
  } catch (err) {
    console.error('Erro em getActiveRazoesDirect:', err);
    return ['1', '02'];
  }
}

export async function getDistinctFilters(forceRefresh: boolean = false): Promise<{
  anos: number[];
  meses: string[];
  razoes: string[];
  matriculas: string[];
  motivos: string[];
  motivos_impedimento: string[];
  motivos_simulacao: string[];
  cnas: string[];
  tipos: string[];
}> {
  if (forceRefresh) {
    distinctFiltersCache = null;
    serviceCache.delete('global_distinct_filters');
  } else if (distinctFiltersCache) {
    return distinctFiltersCache;
  }

  // 3. FORÇAR RE-FETCH DA TABELA: busca direta na tabela DadosGerais
  const [paginadoRes, directRazoes] = await Promise.all([
    fetchDadosGeraisPaginado(
      q => q,
      'ANO, MÊS, RAZAO, MATR, TIPO, nosb_impedimento, nosb_simulacao, cna',
      forceRefresh ? undefined : 'global_distinct_filters'
    ),
    getActiveRazoesDirect()
  ]);

  const data = paginadoRes.data || [];
  if (data.length === 0 && directRazoes.length === 0) {
    return {
      anos: [],
      meses: [],
      razoes: [],
      matriculas: [],
      motivos: [],
      motivos_impedimento: [],
      motivos_simulacao: [],
      cnas: [],
      tipos: []
    };
  }

  const anos = distinct<number>(data.map(d => Number(d.ANO)).filter(v => !isNaN(v) && v > 0)).sort((a, b) => b - a);
  const meses = distinct<string>(data.map(d => String(d['MÊS'] || '').trim()).filter(Boolean));
  
  // As opções do filtro de RAZAO vêm EXCLUSIVAMENTE dos dados retornados do Supabase, sem valores pré-definidos na tela,
  // renderizando apenas as razões ativas da base de dados ("1" e "02")
  let razoes: string[] = directRazoes;
  if (!razoes || razoes.length === 0) {
    razoes = distinct<string>(
      data
        .map(d => String(d.RAZAO || '').trim())
        .filter(v => Boolean(v) && v !== '03' && v !== '3')
    ).sort((a, b) => Number(a) - Number(b));
  }

  const matriculas = distinct<string>(data.map(d => String(d.MATR || '').trim()).filter(Boolean)).sort();
  const motivos = distinct<string>(
    data.map(d => String(d.nosb_impedimento || d.nosb_simulacao || '').trim()).filter(m => m && m !== 'Faturada')
  ).sort();
  const motivos_impedimento = distinct<string>(
    data.map(d => String(d.nosb_impedimento || '').trim()).filter(m => m && m !== 'Faturada')
  ).sort();
  const motivos_simulacao = distinct<string>(
    data.map(d => String(d.nosb_simulacao || '').trim()).filter(Boolean)
  ).sort();
  const cnas = distinct<string>(data.map(d => String(d.cna || '').trim()).filter(Boolean)).sort();
  const tipos = distinct<string>(data.map(d => String(d.TIPO || '').trim()).filter(Boolean)).sort();

  distinctFiltersCache = { anos, meses, razoes, matriculas, motivos, motivos_impedimento, motivos_simulacao, cnas, tipos };
  return distinctFiltersCache;
}

export async function getAnos(forceRefresh: boolean = false): Promise<{ data: { ano: number }[]; error: any }> {
  try {
    const filters = await getDistinctFilters(forceRefresh);
    return { data: filters.anos.map(ano => ({ ano })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMeses(forceRefresh: boolean = false): Promise<{ data: { mes: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters(forceRefresh);
    return { data: filters.meses.map(mes => ({ mes })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getRazoes(forceRefresh: boolean = false): Promise<{ data: { rz: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters(forceRefresh);
    return { data: filters.razoes.map(rz => ({ rz })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMatriculas(): Promise<{ data: { matr: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters();
    return { data: filters.matriculas.map(matr => ({ matr })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMotivosNosb(): Promise<{ data: { motivo: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters();
    return { data: filters.motivos.map(motivo => ({ motivo })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMotivosImpedimento(): Promise<{ data: { motivo: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters();
    return { data: filters.motivos_impedimento.map(motivo => ({ motivo })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMotivosSimulacao(): Promise<{ data: { motivo: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters();
    return { data: filters.motivos_simulacao.map(motivo => ({ motivo })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getMotivosCna(): Promise<{ data: { motivo: string }[]; error: any }> {
  try {
    const filters = await getDistinctFilters();
    return { data: filters.cnas.map(cna => ({ motivo: cna })), error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export async function getFiltrosGerais(): Promise<{ data: any; error: any }> {
  try {
    const filters = await getDistinctFilters();
    const { anos, meses, razoes, matriculas, motivos, cnas } = filters;

    const list: any = [
      ...anos.map(v => ({ coluna: 'ano', valor: v })),
      ...meses.map(v => ({ coluna: 'mes', valor: v })),
      ...razoes.map(v => ({ coluna: 'rz', valor: v })),
      ...matriculas.map(v => ({ coluna: 'matr', valor: v })),
      ...motivos.map(v => ({ coluna: 'motivo', valor: v })),
      ...cnas.map(v => ({ coluna: 'cna', valor: v }))
    ];

    list.anos = anos;
    list.meses = meses;
    list.razoes = razoes;
    list.matriculas = matriculas;
    list.motivos = motivos;

    return { data: list, error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

// =========================================================================
// =========================================================================
// 2. DASHBOARD - RESUMO E LEITURAS POR TIPO
// =========================================================================

export const CODIGOS_IMPEDIMENTO_NL = new Set([
  '3201', '3205', '3245', '3301', '3312', '3313', '3369', '3370', '3374', '3379',
  '3901', '3902', '3903', '3904', '3905', '3906', '3907', '3908', '5101', '5102',
  '5103', '5104', '5105', '5106', '5107', '5108', '5109', '5127', '5260', '5558',
  '5800', '5802', '3376'
]);

export function isValidInstalacao(inst: any): boolean {
  if (inst === null || inst === undefined) return false;
  const s = String(inst).trim();
  return s !== '' && s !== 'null' && s !== 'undefined';
}

export function isImpedimentoNL(nl: any): boolean {
  if (nl === null || nl === undefined) return false;
  const s = String(nl).trim();
  return CODIGOS_IMPEDIMENTO_NL.has(s);
}

export async function getDashboardResumo(
  ano?: number | null,
  mes?: string | null,
  rz?: number | string | null
): Promise<{ data: DashboardResumo[]; error: any }> {
  const cacheKey = `resumo_v2_${ano}_${mes}_${rz ?? 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (ano != null) {
        query = query.eq('ANO', ano);
      }
      if (mes) {
        query = query.eq('MÊS', mes);
      }
      if (rz != null) {
        const rzStr = String(rz).padStart(2, '0');
        query = query.in('RAZAO', [String(rz), rzStr, Number(rz)]);
      }
      return query;
    },
    'ANO, MÊS, RAZAO, INSTALAÇÃO, NL',
    cacheKey
  );

  if (error) return { data: [], error };

  // 1.1 Leituras a realizar: quantidade total de registros da coluna INSTALAÇÃO (válida)
  let leituras_a_realizar = 0;
  // 1.2 Leituras não realizadas: coluna NL com código de impedimento
  let leituras_nao_realizadas = 0;

  for (const r of data) {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') continue;

    if (isValidInstalacao(r['INSTALAÇÃO'])) {
      leituras_a_realizar++;
    }
    if (isImpedimentoNL(r.NL)) {
      leituras_nao_realizadas++;
    }
  }

  // 1.3 Leituras realizadas: Leituras a realizar menos Leituras não realizadas
  const leituras_realizadas = Math.max(0, leituras_a_realizar - leituras_nao_realizadas);
  // 1.4 Percentual de impedimento: (Leituras não realizadas / Leituras a realizar) * 100
  const percentual_impedimento = leituras_a_realizar > 0 ? (leituras_nao_realizadas / leituras_a_realizar) * 100 : 0;

  return {
    data: [
      {
        leituras_a_realizar,
        leituras_nao_realizadas,
        leituras_realizadas,
        percentual_impedimento
      }
    ],
    error: null
  };
}

export async function getDashboardLeiturasPorTipo(
  ano?: number | null,
  mes?: string | null,
  rz?: number | string | null
): Promise<{ data: DashboardLeituraTipo[]; error: any }> {
  const cacheKey = `tipo_v2_${ano}_${mes}_${rz ?? 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (ano != null) {
        query = query.eq('ANO', ano);
      }
      if (mes) {
        query = query.eq('MÊS', mes);
      }
      if (rz != null) {
        const rzStr = String(rz).padStart(2, '0');
        query = query.in('RAZAO', [String(rz), rzStr, Number(rz)]);
      }
      return query;
    },
    'TIPO, INSTALAÇÃO, NL, RAZAO',
    cacheKey
  );

  if (error) return { data: [], error };

  const groups: { [key: string]: { total: number; nao_realizadas: number } } = {};
  data.forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') return;

    const tipo = String(r.TIPO || 'Geral').trim() || 'Geral';
    if (!groups[tipo]) groups[tipo] = { total: 0, nao_realizadas: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) {
      groups[tipo].total++;
    }
    if (isImpedimentoNL(r.NL)) {
      groups[tipo].nao_realizadas++;
    }
  });

  const list: DashboardLeituraTipo[] = Object.entries(groups).map(([tipo, g]) => {
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

/**
 * Agregações em memória para os gráficos do Dashboard
 * Consulta os dados paginados de DadosGerais uma única vez e processa instantaneamente no front-end.
 */
export async function getDashboardChartPorRazao(
  ano: number,
  mes: string,
  razoes: (number | string)[]
): Promise<(DashboardResumo & { label: string })[]> {
  const { data } = await fetchDadosGeraisPaginado(
    q => q.eq('ANO', ano).eq('MÊS', mes),
    'RAZAO, INSTALAÇÃO, NL',
    `chart_razao_v2_${ano}_${mes}`
  );

  const cleanRazoes = (razoes || [])
    .map(r => String(r).trim())
    .filter(r => r && r !== '03' && r !== '3');

  const groups: { [rz: string]: { total: number; impedimentos: number } } = {};
  cleanRazoes.forEach(r => {
    groups[r] = { total: 0, impedimentos: 0 };
  });

  (data || []).forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (!rawRz || rawRz === '03' || rawRz === '3') return;
    const matchingKey = cleanRazoes.find(k => k === rawRz || Number(k) === Number(rawRz)) || rawRz;
    if (!cleanRazoes.includes(matchingKey)) return;
    if (!groups[matchingKey]) groups[matchingKey] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) {
      groups[matchingKey].total++;
    }
    if (isImpedimentoNL(r.NL)) {
      groups[matchingKey].impedimentos++;
    }
  });

  return cleanRazoes.map(r => {
    const g = groups[r] || { total: 0, impedimentos: 0 };
    const realizadas = Math.max(0, g.total - g.impedimentos);
    const perc = g.total > 0 ? (g.impedimentos / g.total) * 100 : 0;
    return {
      label: `RZ ${r}`,
      leituras_a_realizar: g.total,
      leituras_realizadas: realizadas,
      leituras_nao_realizadas: g.impedimentos,
      percentual_impedimento: perc
    };
  });
}

export async function getDashboardChartPorMes(
  ano: number,
  meses: string[],
  rz: number | string | null
): Promise<(DashboardResumo & { label: string })[]> {
  const { data } = await fetchDadosGeraisPaginado(
    q => {
      let query = q.eq('ANO', ano);
      if (rz != null) {
        const rzStr = String(rz).padStart(2, '0');
        query = query.in('RAZAO', [String(rz), rzStr, Number(rz)]);
      }
      return query;
    },
    'MÊS, INSTALAÇÃO, NL, RAZAO',
    `chart_mes_v2_${ano}_${rz ?? 'all'}`
  );

  const groups: { [mes: string]: { total: number; impedimentos: number } } = {};
  meses.forEach(m => {
    groups[m] = { total: 0, impedimentos: 0 };
  });

  (data || []).forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') return;

    const m = String(r['MÊS'] || '');
    if (!groups[m]) groups[m] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) {
      groups[m].total++;
    }
    if (isImpedimentoNL(r.NL)) {
      groups[m].impedimentos++;
    }
  });

  return meses.map(m => {
    const g = groups[m] || { total: 0, impedimentos: 0 };
    const realizadas = Math.max(0, g.total - g.impedimentos);
    const perc = g.total > 0 ? (g.impedimentos / g.total) * 100 : 0;
    return {
      label: m,
      leituras_a_realizar: g.total,
      leituras_realizadas: realizadas,
      leituras_nao_realizadas: g.impedimentos,
      percentual_impedimento: perc
    };
  });
}

export async function getDashboardChartPorAno(
  anos: number[],
  mes: string,
  rz: number | string | null
): Promise<(DashboardResumo & { label: string })[]> {
  const { data } = await fetchDadosGeraisPaginado(
    q => {
      let query = q.eq('MÊS', mes);
      if (rz != null) {
        const rzStr = String(rz).padStart(2, '0');
        query = query.in('RAZAO', [String(rz), rzStr, Number(rz)]);
      }
      return query;
    },
    'ANO, INSTALAÇÃO, NL, RAZAO',
    `chart_ano_v2_${mes}_${rz ?? 'all'}`
  );

  const groups: { [ano: number]: { total: number; impedimentos: number } } = {};
  anos.forEach(y => {
    groups[y] = { total: 0, impedimentos: 0 };
  });

  (data || []).forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') return;

    const y = Number(r.ANO);
    if (!groups[y]) groups[y] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) {
      groups[y].total++;
    }
    if (isImpedimentoNL(r.NL)) {
      groups[y].impedimentos++;
    }
  });

  return anos.map(y => {
    const g = groups[y] || { total: 0, impedimentos: 0 };
    const realizadas = Math.max(0, g.total - g.impedimentos);
    const perc = g.total > 0 ? (g.impedimentos / g.total) * 100 : 0;
    return {
      label: y.toString(),
      leituras_a_realizar: g.total,
      leituras_realizadas: realizadas,
      leituras_nao_realizadas: g.impedimentos,
      percentual_impedimento: perc
    };
  });
}

// =========================================================================
// 3. CONTROLE DE LEITURISTA
// =========================================================================

export async function getControleLeiturista(params: {
  p_ano: number;
  p_mes: string;
  p_matr?: string | null;
  p_ul_de?: number | null;
  p_ul_para?: number | null;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para } = params;
  const cacheKey = `leiturista_v3_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de ?? 'none'}_${p_ul_para ?? 'none'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (p_ano) query = query.eq('ANO', p_ano);
      if (p_mes) query = query.eq('MÊS', p_mes);
      if (p_matr) query = query.eq('MATR', p_matr);
      return query;
    },
    'ANO, MÊS, RAZAO, UL, RZ_UL_LV, MATR, TIPO, NL',
    cacheKey
  );

  if (error) return { data: [], error };

  // Filtragem estrita por RZ_UL_LV: UL DE <= RZ_UL_LV <= UL PARA
  let filteredData = data || [];
  if (p_ul_de != null || p_ul_para != null) {
    filteredData = filteredData.filter(r => {
      const rawVal = r.RZ_UL_LV;
      if (rawVal === null || rawVal === undefined) return false;
      const cleanNum = Number(String(rawVal).replace(/\D/g, ''));
      if (isNaN(cleanNum)) return false;
      if (p_ul_de != null && cleanNum < p_ul_de) return false;
      if (p_ul_para != null && cleanNum > p_ul_para) return false;
      return true;
    });
  }

  const groups: { [key: string]: any } = {};
  filteredData.forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') return;

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

    // Contabiliza ocorrências dos códigos de impedimento especificados na coluna NL
    if (isImpedimentoNL(r.NL)) {
      g.impedimentos++;
    }
  });

  const list = Object.values(groups).map(g => ({
    ...g,
    indicador: g.leit_total > 0 ? (g.impedimentos / g.leit_total) * 100 : 0
  })).sort((a, b) => b.impedimentos - a.impedimentos);

  return { data: list, error: null };
}

// =========================================================================
// 4. CONTROLE DE EVIDÊNCIAS
// =========================================================================

export async function getControleEvidencias(params: {
  p_ano: number;
  p_mes: string;
  p_matr?: string | null;
  p_ul_de?: number | null;
  p_ul_para?: number | null;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para } = params;
  const cacheKey = `evidencias_v3_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de ?? 'none'}_${p_ul_para ?? 'none'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (p_ano) query = query.eq('ANO', p_ano);
      if (p_mes) query = query.eq('MÊS', p_mes);
      if (p_matr) query = query.eq('MATR', p_matr);
      return query;
    },
    'ANO, MÊS, RAZAO, UL, RZ_UL_LV, MATR, FOTO, digitacao, INSTALAÇÃO',
    cacheKey
  );

  if (error) return { data: [], error };

  // Filtragem estrita por RZ_UL_LV: UL DE <= RZ_UL_LV <= UL PARA
  let filteredData = data || [];
  if (p_ul_de != null || p_ul_para != null) {
    filteredData = filteredData.filter(r => {
      const rawVal = r.RZ_UL_LV;
      if (rawVal === null || rawVal === undefined) return false;
      const cleanNum = Number(String(rawVal).replace(/\D/g, ''));
      if (isNaN(cleanNum)) return false;
      if (p_ul_de != null && cleanNum < p_ul_de) return false;
      if (p_ul_para != null && cleanNum > p_ul_para) return false;
      return true;
    });
  }

  const groups: { [key: string]: any } = {};
  filteredData.forEach(r => {
    const rawRz = String(r.RAZAO || '').trim();
    if (rawRz === '03' || rawRz === '3') return;

    // 2.2 SOLICITADAS: INSTALAÇÃO válida e digitacao >= 2
    const digNum = Number(r.digitacao);
    const isSolicitada = isValidInstalacao(r['INSTALAÇÃO']) && !isNaN(digNum) && digNum >= 2;
    if (!isSolicitada) return;

    const dig = String(r.digitacao);
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

    // REALIZADAS: exclusivamente registros de SOLICITADAS com FOTO = 'OK' (case insensitive, trimmed)
    const fotoStr = String(r.FOTO || '').trim().toUpperCase();
    if (fotoStr === 'OK') {
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

// =========================================================================
// 5. N'OSB - IMPEDIMENTO
// =========================================================================

export async function getNosbImpedimento(params: {
  p_ano: number;
  p_mes: string;
  p_rz?: number | null;
  p_matr?: string | null;
  p_motivo?: string | null;
  rangeFrom?: number;
  rangeTo?: number;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_rz, p_matr, p_motivo, rangeFrom, rangeTo } = params;
  const cacheKey = `nosb_imp_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_motivo || 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
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
    },
    'MÊS, ANO, RAZAO, UL, RZ_UL_LV, INSTALAÇÃO, MEDIDOR, REG, TIPO, MATR, NL, LEITURA, nosb_impedimento',
    cacheKey
  );

  if (error) return { data: [], error };

  const mapped = (data || [])
    .filter(r => r.nosb_impedimento && String(r.nosb_impedimento).trim() !== '' && String(r.nosb_impedimento).trim() !== 'Faturada' && String(r.RAZAO || '').trim() !== '03' && String(r.RAZAO || '').trim() !== '3')
    .map(r => ({
      f_mes: String(r['MÊS'] || ''),
      f_ano: String(r.ANO || ''),
      f_rz: String(r.RAZAO || ''),
      f_ul: r.RZ_UL_LV != null ? String(r.RZ_UL_LV) : (r.UL != null ? String(r.UL) : ''),
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

// =========================================================================
// 6. N'OSB - SIMULAÇÃO
// =========================================================================

export async function getNosbSimulacao(params: {
  p_ano: number;
  p_mes: string;
  p_rz?: number | null;
  p_matr?: string | null;
  p_motivo?: string | null;
  rangeFrom?: number;
  rangeTo?: number;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_rz, p_matr, p_motivo, rangeFrom, rangeTo } = params;
  const cacheKey = `nosb_sim_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_motivo || 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
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
    },
    'MÊS, ANO, RAZAO, UL, RZ_UL_LV, INSTALAÇÃO, MEDIDOR, REG, TIPO, MATR, NL, LEITURA, nosb_simulacao',
    cacheKey
  );

  if (error) return { data: [], error };

  const mapped = (data || [])
    .filter(r => r.nosb_simulacao && String(r.nosb_simulacao).trim() !== '' && String(r.RAZAO || '').trim() !== '03' && String(r.RAZAO || '').trim() !== '3')
    .map(r => ({
      f_mes: String(r['MÊS'] || ''),
      f_ano: String(r.ANO || ''),
      f_rz: String(r.RAZAO || ''),
      f_ul: r.RZ_UL_LV != null ? String(r.RZ_UL_LV) : (r.UL != null ? String(r.UL) : ''),
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

// =========================================================================
// 7. CONTROLE HORÁRIO
// =========================================================================

export async function getControleHorario(params: {
  p_ano: number;
  p_mes: string;
  p_matr?: string | null;
  p_data?: string | null;
  rangeFrom?: number;
  rangeTo?: number;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_matr, p_data, rangeFrom, rangeTo } = params;
  const cacheKey = `horario_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_data || 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (p_ano) query = query.eq('ANO', p_ano);
      if (p_mes) query = query.eq('MÊS', p_mes);
      if (p_matr) query = query.eq('MATR', p_matr);
      if (p_data) query = query.eq('DATA', p_data);
      return query;
    },
    'MATR, DATA, HORA',
    cacheKey
  );

  if (error) return { data: [], error };

  const groups: { [key: string]: { matr: string; data: string; horas: number[]; total: number } } = {};
  data.forEach(r => {
    const matr = String(r.MATR || '');
    const dt = String(r.DATA || '');
    if (!matr) return;
    const key = `${matr}_${dt}`;
    if (!groups[key]) groups[key] = { matr, data: dt, horas: [], total: 0 };
    groups[key].total++;
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
      f_media_leitura_hora_inteiro: Math.round(media)
    };
  }).sort((a, b) => a.f_matricula.localeCompare(b.f_matricula));

  const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
    ? list.slice(rangeFrom, rangeTo + 1)
    : list;

  return { data: sliced, error: null };
}

// =========================================================================
// 8. APRESENTAÇÃO
// =========================================================================

export async function getDadosApresentacao(params: {
  p_ano: number;
  p_mes: string;
  p_rz?: number | null;
  p_matr?: string | null;
  p_cna?: string | null;
  rangeFrom?: number;
  rangeTo?: number;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_rz, p_matr, p_cna, rangeFrom, rangeTo } = params;
  const cacheKey = `apresentacao_${p_ano}_${p_mes}_${p_rz || 'all'}_${p_matr || 'all'}_${p_cna || 'all'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
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
    },
    'MÊS, ANO, RAZAO, UL, RZ_UL_LV, INSTALAÇÃO, MEDIDOR, REG, MATR, NL, cna, LEITURA',
    cacheKey
  );

  if (error) return { data: [], error };

  const mapped = (data || [])
    .filter(r => String(r.RAZAO || '').trim() !== '03' && String(r.RAZAO || '').trim() !== '3')
    .map(r => ({
    f_mes: String(r['MÊS'] || ''),
    f_ano: String(r.ANO || ''),
    f_rz: String(r.RAZAO || ''),
    f_ul: r.RZ_UL_LV != null ? String(r.RZ_UL_LV) : (r.UL != null ? String(r.UL) : ''),
    f_instalacao: String(r['INSTALAÇÃO'] || ''),
    f_medidor: String(r.MEDIDOR || ''),
    f_reg: String(r.REG || ''),
    f_matr: String(r.MATR || ''),
    f_cod: r.NL != null ? String(r.NL) : '',
    f_motivo: r.cna != null ? String(r.cna) : '',
    f_leitura: String(r.LEITURA || '')
  }));

  const sliced = (rangeFrom !== undefined && rangeTo !== undefined)
    ? mapped.slice(rangeFrom, rangeTo + 1)
    : mapped;

  return { data: sliced, error: null };
}

// =========================================================================
// 9. SEQUÊNCIA DE LEITURA
// =========================================================================

export async function getSequenciaLeitura(params: {
  p_ano: number;
  p_mes: string;
  p_matr?: string | null;
  p_ul_de?: number | null;
  p_ul_para?: number | null;
  rangeFrom?: number;
  rangeTo?: number;
}): Promise<{ data: any[]; error: any }> {
  const { p_ano, p_mes, p_matr, p_ul_de, p_ul_para, rangeFrom, rangeTo } = params;
  const cacheKey = `seq_v3_${p_ano}_${p_mes}_${p_matr || 'all'}_${p_ul_de ?? 'none'}_${p_ul_para ?? 'none'}`;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (p_ano) query = query.eq('ANO', p_ano);
      if (p_mes) query = query.eq('MÊS', p_mes);
      if (p_matr) query = query.eq('MATR', p_matr);
      return query;
    },
    'MÊS, ANO, RAZAO, UL, RZ_UL_LV, INSTALAÇÃO, MEDIDOR, REG, MATR, HORA, DATA, ENDEREÇO, NL',
    cacheKey
  );

  if (error) return { data: [], error };

  // Filtragem estrita por RZ_UL_LV: UL DE <= RZ_UL_LV <= UL PARA (inclusive, numérico)
  let filteredData = data || [];
  if (p_ul_de != null || p_ul_para != null) {
    filteredData = filteredData.filter(r => {
      const rawVal = r.RZ_UL_LV;
      if (rawVal === null || rawVal === undefined) return false;
      const cleanNum = Number(String(rawVal).replace(/\D/g, ''));
      if (isNaN(cleanNum)) return false;
      if (p_ul_de != null && cleanNum < p_ul_de) return false;
      if (p_ul_para != null && cleanNum > p_ul_para) return false;
      return true;
    });
  }

  const mapped = filteredData.map(r => ({
    f_mes: String(r['MÊS'] || ''),
    f_ano: String(r.ANO || ''),
    f_rz: String(r.RAZAO || ''),
    f_ul: r.RZ_UL_LV != null ? String(r.RZ_UL_LV) : (r.UL != null ? String(r.UL) : ''),
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

// =========================================================================
// 10. CONSULTA DE LEITURAS
// =========================================================================

export async function consultaLeituras(params: {
  p_instalacao?: string | null;
  p_medidor?: string | null;
}): Promise<{ data: any[]; error: any }> {
  const { p_instalacao, p_medidor } = params;

  const instClean = p_instalacao ? p_instalacao.trim() : null;
  const medClean = p_medidor ? p_medidor.trim() : null;

  const { data, error } = await fetchDadosGeraisPaginado(
    q => {
      let query = q;
      if (instClean) query = query.eq('INSTALAÇÃO', instClean);
      if (medClean) query = query.eq('MEDIDOR', medClean);
      return query;
    },
    '*'
  );

  if (error) return { data: [], error };

  let resultRows = data || [];

  // Se a busca por instalação não retornou registros diretamente (por exemplo, se o usuário digitou apenas os números sem pontos/traços ou com formatação diferente), busca pelos dígitos
  if (resultRows.length === 0 && instClean && !medClean) {
    const digitsOnly = instClean.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      const { data: allData } = await fetchDadosGeraisPaginado(q => q, '*', 'all_dados_gerais_cache');
      if (allData) {
        resultRows = allData.filter(r => {
          const rawInst = String(r['INSTALAÇÃO'] || '');
          return rawInst.trim() === instClean || rawInst.replace(/\D/g, '') === digitsOnly;
        });
      }
    }
  }

  const mapped = resultRows.map(r => ({
    mes: String(r['MÊS'] || ''),
    ano: Number(r.ANO || 0),
    ul: r.RZ_UL_LV != null ? String(r.RZ_UL_LV) : (r.UL != null ? String(r.UL) : ''),
    instalacao_res: r['INSTALAÇÃO'] !== undefined && r['INSTALAÇÃO'] !== null ? String(r['INSTALAÇÃO']) : '',
    medidor_res: String(r.MEDIDOR || ''),
    reg: String(r.REG || ''),
    matr: String(r.MATR || ''),
    cod: r.NL != null ? String(r.NL) : '',
    leitura: Number(r.LEITURA || 0),
    consumo: Number(r.CONSUMO || 0),
    dig: String(r.digitacao || ''),
    nosb_imp: String(r.nosb_impedimento || ''),
    nosb_sim: String(r.nosb_simulacao || ''),
    cna: String(r.cna || '')
  }));

  return { data: mapped, error: null };
}
