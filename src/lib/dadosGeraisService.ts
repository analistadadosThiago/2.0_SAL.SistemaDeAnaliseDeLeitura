import { DashboardResumo, DashboardLeituraTipo } from '../types';

/**
 * SAL - Serviço Central de Dados para a tabela `dados_diarios` no Google BigQuery
 */

let masterDadosGerais: any[] | null = null;
let inFlightMasterPromise: Promise<any[]> | null = null;
let distinctFiltersCache: DistinctFiltersResult | null = null;

type DatabaseListener = (data: any[]) => void;
const dbListeners: Set<DatabaseListener> = new Set();

export function onDatabaseUpdated(cb: DatabaseListener): () => void {
  dbListeners.add(cb);
  return () => {
    dbListeners.delete(cb);
  };
}

export async function checkDatabaseGrowth(): Promise<boolean> {
  return false;
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    checkDatabaseGrowth().catch(() => {});
  }, 20000);
}

export interface DistinctFiltersResult {
  anos: number[];
  meses: string[];
  razoes: string[];
  matriculas: string[];
  motivos: string[];
  motivos_impedimento: string[];
  motivos_simulacao: string[];
  cnas: string[];
  tipos: string[];
}

function notifyListeners() {
  if (!masterDadosGerais) return;
  dbListeners.forEach(cb => {
    try { cb(masterDadosGerais!); } catch (e) { console.error('Erro no listener:', e); }
  });
}

export async function getAllDadosGerais(forceRefresh: boolean = false): Promise<any[]> {
  if (!forceRefresh && masterDadosGerais && masterDadosGerais.length > 0) {
    return masterDadosGerais;
  }

  if (inFlightMasterPromise) {
    return inFlightMasterPromise;
  }

  inFlightMasterPromise = (async () => {
    try {
      const response = await fetch('/.netlify/functions/get-data');
      if (!response.ok) {
        throw new Error(`Erro ao carregar dados do BigQuery: ${response.statusText}`);
      }

      const rawData = await response.json();
      let todosOsDados = Array.isArray(rawData) ? rawData : [];

      for (let i = 0; i < todosOsDados.length; i++) {
        const row = todosOsDados[i];
        if (row) {
          row.RAZAO = normalizeRazao(row.RAZAO);
          row.ANO = Number(row.ANO);
          if (row['MÊS']) row['MÊS'] = String(row['MÊS']).trim();
        }
      }

      masterDadosGerais = todosOsDados;
      distinctFiltersCache = null;
      notifyListeners();

      return masterDadosGerais;
    } catch (err: any) {
      console.error('Erro ao carregar base total do BigQuery:', err);
      return masterDadosGerais || [];
    } finally {
      inFlightMasterPromise = null;
    }
  })();

  return inFlightMasterPromise;
}

export async function fetchDadosGeraisPaginado(
  _applyFilters?: any,
  _selectCols: string = '*',
  _cacheKey?: string,
  forceRefresh: boolean = false
): Promise<{ data: any[]; error: any }> {
  try {
    const data = await getAllDadosGerais(forceRefresh);
    return { data, error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

export function clearInternalCache() {
  masterDadosGerais = null;
  inFlightMasterPromise = null;
  distinctFiltersCache = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch (e) {
      console.warn('Erro ao limpar storage do navegador:', e);
    }
  }
}

export function normalizeRazao(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'todas' || s.toLowerCase() === 'todos') return '';
  const num = Number(s);
  if (!isNaN(num) && num >= 0 && num <= 99) {
    return String(num).padStart(2, '0');
  }
  return s;
}

export function distinct<T>(arr: T[]): T[] {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && v !== '')));
}

export function matchRazao(rowRazao: any, filterRazao: any): boolean {
  if (filterRazao == null) return true;
  const filterStr = String(filterRazao).trim();
  if (!filterStr || filterStr.toLowerCase() === 'todas' || filterStr.toLowerCase() === 'todos') return true;
  const normFilter = normalizeRazao(filterStr);
  const normRow = normalizeRazao(rowRazao);
  if (!normRow) return false;
  return normRow === normFilter || normRow === filterStr || String(rowRazao).trim() === filterStr;
}

export function formatDataBR(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  const s = String(val).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
  }
  return s;
}

export function matchAno(rowAno: any, filterAno: number | string | null | undefined): boolean {
  if (filterAno == null || String(filterAno).trim() === '' || String(filterAno).toLowerCase() === 'todos') return true;
  return Number(rowAno) === Number(filterAno) || String(rowAno).trim() === String(filterAno).trim();
}

export function matchMes(rowMes: any, filterMes: string | null | undefined): boolean {
  if (!filterMes || filterMes.toLowerCase() === 'todos' || filterMes.trim() === '') return true;
  return String(rowMes || '').trim().toLowerCase() === filterMes.trim().toLowerCase();
}

export function matchMatr(rowMatr: any, filterMatr: string | null | undefined): boolean {
  if (!filterMatr || filterMatr.toLowerCase() === 'todas' || filterMatr.toLowerCase() === 'todos' || filterMatr.trim() === '') return true;
  return String(rowMatr || '').trim().toLowerCase() === filterMatr.trim().toLowerCase();
}

export async function getDistinctFilters(forceRefresh: boolean = false): Promise<DistinctFiltersResult> {
  if (!forceRefresh && distinctFiltersCache) {
    return distinctFiltersCache;
  }

  const data = await getAllDadosGerais(forceRefresh);

  if (!data || data.length === 0) {
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
  const razoes = Array.from(new Set(data.map(item => normalizeRazao(item.RAZAO)).filter(Boolean))).sort();
  const matriculas = distinct<string>(data.map(d => String(d.MATR || '').trim()).filter(Boolean)).sort();
  const motivos = distinct<string>(data.map(d => String(d.nosb_impedimento || d.nosb_simulacao || '').trim()).filter(Boolean)).sort();
  const motivos_impedimento = distinct<string>(data.map(d => String(d.nosb_impedimento || '').trim()).filter(Boolean)).sort();
  const motivos_simulacao = distinct<string>(data.map(d => String(d.nosb_simulacao || '').trim()).filter(Boolean)).sort();
  const cnas = distinct<string>(data.map(d => String(d.cna || '').trim()).filter(Boolean)).sort();
  const tipos = distinct<string>(data.map(d => String(d.TIPO || '').trim()).filter(Boolean)).sort();

  distinctFiltersCache = { anos, meses, razoes, matriculas, motivos, motivos_impedimento, motivos_simulacao, cnas, tipos };
  return distinctFiltersCache;
}

export async function getAnos(forceRefresh: boolean = false) {
  const f = await getDistinctFilters(forceRefresh);
  return { data: f.anos.map(ano => ({ ano })), error: null };
}

export async function getMeses(forceRefresh: boolean = false) {
  const f = await getDistinctFilters(forceRefresh);
  return { data: f.meses.map(mes => ({ mes })), error: null };
}

export async function getRazoes(forceRefresh: boolean = false) {
  const f = await getDistinctFilters(forceRefresh);
  return { data: f.razoes.map(rz => ({ rz })), error: null };
}

export async function getMatriculas(forceRefresh: boolean = false) {
  const f = await getDistinctFilters(forceRefresh);
  return { data: f.matriculas.map(matr => ({ matr })), error: null };
}

export async function getFiltrosGerais(forceRefresh: boolean = false) {
  const f = await getDistinctFilters(forceRefresh);
  return { data: f, error: null };
}

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
  return CODIGOS_IMPEDIMENTO_NL.has(String(nl).trim());
}

export async function getDashboardResumo(ano?: number | null, mes?: string | null, rz?: number | string | null): Promise<{ data: DashboardResumo[]; error: any }> {
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchAno(r.ANO, ano) && matchMes(r['MÊS'], mes) && matchRazao(r.RAZAO, rz));

  let leituras_a_realizar = 0;
  let leituras_nao_realizadas = 0;

  for (const r of filtered) {
    if (isValidInstalacao(r['INSTALAÇÃO'])) leituras_a_realizar++;
    if (isImpedimentoNL(r.NL)) leituras_nao_realizadas++;
  }

  const leituras_realizadas = Math.max(0, leituras_a_realizar - leituras_nao_realizadas);
  const percentual_impedimento = leituras_a_realizar > 0 ? (leituras_nao_realizadas / leituras_a_realizar) * 100 : 0;

  return { data: [{ leituras_a_realizar, leituras_nao_realizadas, leituras_realizadas, percentual_impedimento }], error: null };
}

export async function getDashboardLeiturasPorTipo(ano?: number | null, mes?: string | null, rz?: number | string | null): Promise<{ data: DashboardLeituraTipo[]; error: any }> {
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchAno(r.ANO, ano) && matchMes(r['MÊS'], mes) && matchRazao(r.RAZAO, rz));

  const groups: { [key: string]: { total: number; nao_realizadas: number } } = {};
  filtered.forEach(r => {
    const tipo = String(r.TIPO || 'Geral').trim() || 'Geral';
    if (!groups[tipo]) groups[tipo] = { total: 0, nao_realizadas: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) groups[tipo].total++;
    if (isImpedimentoNL(r.NL)) groups[tipo].nao_realizadas++;
  });

  const list = Object.entries(groups).map(([tipo, g]) => {
    const realizadas = Math.max(0, g.total - g.nao_realizadas);
    const percentual = g.total > 0 ? (g.nao_realizadas / g.total) * 100 : 0;
    return {
      tipo,
      total_leituras: g.total,
      realizadas,
      nao_realizadas: g.nao_realizadas,
      leituras_a_realizar: g.total,
      leituras_realizadas: realizadas,
      leituras_nao_realizadas: g.nao_realizadas,
      percentual_impedimento: percentual
    };
  });

  return { data: list, error: null };
}

export async function getDashboardChartPorRazao(
  ano: number,
  mes: string,
  razoes: (number | string)[]
): Promise<(DashboardResumo & { label: string })[]> {
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchAno(r.ANO, ano) && matchMes(r['MÊS'], mes));

  const cleanRazoes = (razoes || []).map(r => normalizeRazao(r)).filter(Boolean);
  const groups: { [rz: string]: { total: number; impedimentos: number } } = {};
  cleanRazoes.forEach(r => {
    groups[r] = { total: 0, impedimentos: 0 };
  });

  filtered.forEach(r => {
    const rawRz = normalizeRazao(r.RAZAO);
    if (!rawRz) return;
    const matchingKey = cleanRazoes.find(k => matchRazao(rawRz, k)) || rawRz;
    if (!cleanRazoes.includes(matchingKey)) return;
    if (!groups[matchingKey]) groups[matchingKey] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) groups[matchingKey].total++;
    if (isImpedimentoNL(r.NL)) groups[matchingKey].impedimentos++;
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
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchAno(r.ANO, ano) && matchRazao(r.RAZAO, rz));

  const groups: { [mes: string]: { total: number; impedimentos: number } } = {};
  meses.forEach(m => {
    groups[m] = { total: 0, impedimentos: 0 };
  });

  filtered.forEach(r => {
    const m = String(r['MÊS'] || '');
    if (!groups[m]) groups[m] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) groups[m].total++;
    if (isImpedimentoNL(r.NL)) groups[m].impedimentos++;
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
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchMes(r['MÊS'], mes) && matchRazao(r.RAZAO, rz));

  const groups: { [ano: number]: { total: number; impedimentos: number } } = {};
  anos.forEach(y => {
    groups[y] = { total: 0, impedimentos: 0 };
  });

  filtered.forEach(r => {
    const y = Number(r.ANO);
    if (!groups[y]) groups[y] = { total: 0, impedimentos: 0 };
    if (isValidInstalacao(r['INSTALAÇÃO'])) groups[y].total++;
    if (isImpedimentoNL(r.NL)) groups[y].impedimentos++;
  });

  return anos.map(y => {
    const g = groups[y] || { total: 0, impedimentos: 0 };
    const realizadas = Math.max(0, g.total - g.impedimentos);
    const perc = g.total > 0 ? (g.impedimentos / g.total) * 100 : 0;
    return {
      label: String(y),
      leituras_a_realizar: g.total,
      leituras_realizadas: realizadas,
      leituras_nao_realizadas: g.impedimentos,
      percentual_impedimento: perc
    };
  });
}

export async function getControleLeiturista(params: { p_ano: number; p_mes: string; p_rz?: any; p_matr?: any }) {
  const { p_ano, p_mes, p_rz, p_matr } = params;
  const allData = await getAllDadosGerais();
  const filtered = allData.filter(r => matchAno(r.ANO, p_ano) && matchMes(r['MÊS'], p_mes) && matchRazao(r.RAZAO, p_rz) && matchMatr(r.MATR, p_matr));

  const groups: { [key: string]: any } = {};
  filtered.forEach(r => {
    const rzNorm = normalizeRazao(r.RAZAO);
    const key = `${r.ANO}_${r['MÊS']}_${rzNorm}_${r.UL}_${r.MATR}`;
    if (!groups[key]) {
      groups[key] = { ano: Number(r.ANO), mes: String(r['MÊS']), razao: rzNorm, ul: String(r.UL), matr: String(r.MATR), leit_total: 0, impedimentos: 0 };
    }
    groups[key].leit_total++;
    if (isImpedimentoNL(r.NL)) groups[key].impedimentos++;
  });

  const list = Object.values(groups).map(g => ({
    ...g,
    indicador: g.leit_total > 0 ? (g.impedimentos / g.leit_total) * 100 : 0
  })).sort((a, b) => b.impedimentos - a.impedimentos);

  return { data: list, error: null };
}

export async function getControleEvidencias(params: { p_ano: number; p_mes: string; p_rz?: any; p_matr?: any }) {
  return getControleLeiturista(params);
}
