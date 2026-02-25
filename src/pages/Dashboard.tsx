import { useEffect, useState, useCallback, useMemo } from 'react';
import Chart from 'react-apexcharts';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Calendar,
  Filter,
  Loader2,
  RefreshCw,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { DashboardResumo, DashboardLeituraTipo, DashboardFiltros } from '../types';

const MONTHS_LIST = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  // Filter Options
  const [options, setOptions] = useState<{
    anos: number[];
    meses: string[];
    razoes: number[];
  }>({
    anos: [],
    meses: [],
    razoes: []
  });

  // Selected Filters
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [rz, setRz] = useState<number | null>(null);
  
  // Data State
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [leiturasPorTipo, setLeiturasPorTipo] = useState<DashboardLeituraTipo[]>([]);
  
  // Chart Tabs State
  const [activeTab, setActiveTab] = useState<'razao' | 'mes' | 'ano'>('razao');
  const [chartData, setChartData] = useState<{
    razao: { x: string, y: number }[];
    mes: { x: string, y: number }[];
    ano: { x: string, y: number }[];
  }>({
    razao: [],
    mes: [],
    ano: []
  });
  const [loadingChart, setLoadingChart] = useState(false);

  // 1. Fetch Filter Options with Sequential Loading, Caching, and Retry Logic
  const fetchFilterOptions = useCallback(async (retryCount = 0) => {
    // Try to load from cache first
    const cachedFilters = localStorage.getItem('sal_dashboard_filters');
    if (cachedFilters && !retryCount) {
      try {
        const parsed = JSON.parse(cachedFilters);
        setOptions(parsed);
        if (parsed.anos.length > 0 && ano === null) setAno(Number(parsed.anos[0]));
        if (parsed.meses.length > 0 && mes === null) setMes(String(parsed.meses[0]));
        setLoadingFilters(false);
      } catch (e) {
        console.error('Erro ao carregar cache de filtros:', e);
      }
    }

    setLoadingFilters(true);
    try {
      // Sequential loading to avoid timeouts
      const anosRes = await supabase.rpc('dashboard_getanos');
      if (anosRes.error) throw anosRes.error;
      
      const mesesRes = await supabase.rpc('dashboard_getmeses');
      if (mesesRes.error) throw mesesRes.error;
      
      const razoesRes = await supabase.rpc('dashboard_getrazoes');
      if (razoesRes.error) throw razoesRes.error;

      const anos = (anosRes.data as any[] || []).map(item => typeof item === 'object' ? item.ano : item).sort((a, b) => b - a);
      const meses = (mesesRes.data as any[] || []).map(item => typeof item === 'object' ? item.mes : item);
      const razoes = (razoesRes.data as any[] || []).map(item => typeof item === 'object' ? item.rz : item).sort((a, b) => a - b);

      const newOptions = { anos, meses, razoes };
      setOptions(newOptions);
      
      // Save to cache
      localStorage.setItem('sal_dashboard_filters', JSON.stringify(newOptions));

      if (anos.length > 0 && ano === null) setAno(Number(anos[0]));
      if (meses.length > 0 && mes === null) setMes(String(meses[0]));
    } catch (error: any) {
      // Silent retry for timeouts (57014) or fetch errors
      const isTimeout = error.code === '57014' || error.message?.includes('Failed to fetch');
      if (isTimeout && retryCount < 2) {
        setTimeout(() => fetchFilterOptions(retryCount + 1), 2000);
        return;
      }
      console.error('Erro ao buscar opções de filtros:', error);
      
      // If everything fails and no cache, set some defaults to prevent crash
      if (!localStorage.getItem('sal_dashboard_filters')) {
        const currentYear = new Date().getFullYear();
        setOptions(prev => ({ ...prev, anos: [currentYear] }));
        setAno(currentYear);
      }
    } finally {
      setLoadingFilters(false);
    }
  }, [ano, mes]);

  // 2. Fetch Dashboard Data (Triggered by Button)
  const handleGenerateReport = async () => {
    if (ano === null || mes === null) return;
    
    setLoading(true);
    setLoadingChart(true);
    setResumo(null); // Reset previous data
    setLeiturasPorTipo([]); // Reset previous data
    
    try {
      const params = {
        p_ano: Number(ano),
        p_mes: String(mes),
        p_rz: rz !== null ? Number(rz) : null
      };

      const [resumoRes, tipoRes] = await Promise.all([
        supabase.rpc('dashboard_resumogeral', params),
        supabase.rpc('dashboard_leiturasportipo', params)
      ]);

      if (resumoRes.error) throw resumoRes.error;
      if (tipoRes.error) throw tipoRes.error;

      setResumo(resumoRes.data?.[0] || null);
      setLeiturasPorTipo(tipoRes.data || []);
      setHasGenerated(true);

      // Fetch Chart Data based on active tab
      await updateChartData(activeTab, Number(ano), String(mes), rz);
      
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
    } finally {
      setLoading(false);
      setLoadingChart(false);
    }
  };

  const updateChartData = async (tab: 'razao' | 'mes' | 'ano', currentAno: number, currentMes: string, currentRz: number | null) => {
    setLoadingChart(true);
    try {
      let results: (DashboardResumo & { label: string })[] = [];

      if (tab === 'razao') {
        const rawResults = await Promise.all(
          options.razoes.map(async (r) => {
            const { data } = await supabase.rpc('dashboard_resumogeral', {
              p_ano: currentAno,
              p_mes: currentMes,
              p_rz: r
            });
            const res = data?.[0] || { leituras_nao_realizadas: 0, leituras_realizadas: 0, percentual_impedimento: 0, leituras_a_realizar: 0 };
            return { ...res, label: `RZ ${r}` };
          })
        );
        results = rawResults;
      } else if (tab === 'mes') {
        // Aba Mês: Histórico de Janeiro até o mês selecionado
        const selectedMonthIndex = MONTHS_LIST.indexOf(currentMes);
        const monthsToFetch = selectedMonthIndex !== -1 ? MONTHS_LIST.slice(0, selectedMonthIndex + 1) : [currentMes];
        
        const rawResults = await Promise.all(
          monthsToFetch.map(async (m) => {
            const { data } = await supabase.rpc('dashboard_resumogeral', {
              p_ano: currentAno,
              p_mes: m,
              p_rz: currentRz
            });
            const res = data?.[0] || { leituras_nao_realizadas: 0, leituras_realizadas: 0, percentual_impedimento: 0, leituras_a_realizar: 0 };
            return { ...res, label: m };
          })
        );
        results = rawResults;
      } else if (tab === 'ano') {
        const rawResults = await Promise.all(
          options.anos.map(async (y) => {
            const { data } = await supabase.rpc('dashboard_resumogeral', {
              p_ano: y,
              p_mes: currentMes,
              p_rz: currentRz
            });
            const res = data?.[0] || { leituras_nao_realizadas: 0, leituras_realizadas: 0, percentual_impedimento: 0, leituras_a_realizar: 0 };
            return { ...res, label: y.toString() };
          })
        );
        results = rawResults.reverse();
      }

      // Sort descending by impediments (leituras_nao_realizadas)
      const sortedResults = [...results].sort((a, b) => (b.leituras_nao_realizadas || 0) - (a.leituras_nao_realizadas || 0));
      setChartData(prev => ({ ...prev, [tab]: sortedResults }));
    } catch (error) {
      console.error('Erro ao atualizar dados do gráfico:', error);
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // Update chart when tab changes (if already generated)
  useEffect(() => {
    if (hasGenerated && ano && mes) {
      updateChartData(activeTab, ano, mes, rz);
    }
  }, [activeTab]);

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif',
      animations: { enabled: true, speed: 800 }
    },
    plotOptions: {
      bar: {
        borderRadius: 8,
        columnWidth: '50%',
        distributed: true,
        dataLabels: { position: 'top' }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (val) => val.toString(),
      offsetY: -25,
      style: {
        fontSize: '12px',
        fontWeight: 'bold',
        colors: ['#3f3f46']
      }
    },
    colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'],
    xaxis: {
      categories: chartData[activeTab].map(d => d.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#71717a', fontWeight: 500 } }
    },
    yaxis: {
      show: false, // Hide Y axis as requested (equivalent to scales.y.display = false)
      labels: { show: false }
    },
    grid: {
      show: false, // Remove background grid lines
    },
    legend: { show: false },
    tooltip: {
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const raw = chartData[activeTab][dataPointIndex];
        return `
          <div class="p-4 bg-white border border-zinc-100 shadow-2xl rounded-2xl min-w-[180px]">
            <div class="font-black text-zinc-900 mb-3 border-b border-zinc-50 pb-2 uppercase tracking-wider text-[10px]">${raw.label}</div>
            <div class="space-y-2">
              <div class="flex justify-between items-center gap-4">
                <span class="text-[10px] font-bold text-zinc-400 uppercase">Realizadas</span>
                <span class="text-sm font-black text-emerald-600">${(raw.leituras_realizadas ?? 0).toLocaleString()}</span>
              </div>
              <div class="flex justify-between items-center gap-4 pt-2 border-t border-zinc-50">
                <span class="text-[10px] font-bold text-zinc-400 uppercase">% Impedimento</span>
                <span class="text-sm font-black text-red-600">${(raw.percentual_impedimento ?? 0).toFixed(2).replace('.', ',')}%</span>
              </div>
            </div>
          </div>
        `;
      }
    }
  };

  const chartSeries = [{
    name: 'Impedimentos',
    data: chartData[activeTab].map(d => d.leituras_nao_realizadas)
  }];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Resultado Geral de performance e análise</p>
        </div>
        
        {/* Filters Section */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 px-2">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Filtros</span>
          </div>
          
          {loadingFilters && options.anos.length === 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1">
                <div className="h-3 w-8 bg-zinc-100 animate-pulse rounded ml-1" />
                <div className="h-9 w-24 bg-zinc-100 animate-pulse rounded-xl" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-3 w-8 bg-zinc-100 animate-pulse rounded ml-1" />
                <div className="h-9 w-32 bg-zinc-100 animate-pulse rounded-xl" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-3 w-8 bg-zinc-100 animate-pulse rounded ml-1" />
                <div className="h-9 w-40 bg-zinc-100 animate-pulse rounded-xl" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Ano</span>
                <select 
                  value={ano || ''} 
                  onChange={(e) => setAno(Number(e.target.value))}
                  className="text-sm border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
                >
                  {options.anos.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Mês</span>
                <select 
                  value={mes || ''} 
                  onChange={(e) => setMes(e.target.value)}
                  className="text-sm border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
                >
                  {options.meses.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Razão</span>
                <select 
                  value={rz || ''} 
                  onChange={(e) => setRz(e.target.value ? Number(e.target.value) : null)}
                  className="text-sm border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 min-w-[140px] transition-all"
                >
                  <option value="">Todas Razões</option>
                  {options.razoes.map(r => <option key={r} value={r}>RZ {r}</option>)}
                </select>
              </div>
            </>
          )}

          <button 
            onClick={handleGenerateReport}
            disabled={loading || loadingFilters}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50 disabled:shadow-none mt-auto h-[46px]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            <span>Gerar Relatório</span>
          </button>
        </div>
      </div>

      {!hasGenerated ? (
        <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[32px] border border-zinc-100 shadow-sm">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-500 mb-2">
            <BarChart3 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">Pronto para Analisar?</h2>
          <p className="text-zinc-500 max-w-md">Selecione os filtros acima e clique em <span className="font-bold text-emerald-600">Gerar Relatório</span> para carregar os dados de medição.</p>
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Main Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="A Realizar" 
              value={resumo?.leituras_a_realizar?.toLocaleString() ?? '0'} 
              icon={Calendar} 
              color="blue" 
              loading={loading}
            />
            <StatCard 
              title="Realizadas" 
              value={resumo?.leituras_realizadas?.toLocaleString() ?? '0'} 
              icon={CheckCircle2} 
              color="emerald" 
              loading={loading}
            />
            <StatCard 
              title="Não Realizadas" 
              value={resumo?.leituras_nao_realizadas?.toLocaleString() ?? '0'} 
              icon={Clock} 
              color="amber" 
              loading={loading}
            />
            <StatCard 
              title="Impedimento" 
              value={resumo?.percentual_impedimento !== undefined ? `${resumo.percentual_impedimento.toFixed(2).replace('.', ',')}%` : '0,00%'} 
              icon={AlertCircle} 
              color="red" 
              loading={loading}
              highlight
            />
          </div>

          {/* Type Breakdown Cards */}
          {leiturasPorTipo.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xl font-bold text-zinc-900">Resumo por Tipo</h3>
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Resultado por Tipo de Leitura</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {leiturasPorTipo.map((item, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white p-6 rounded-[28px] border border-zinc-100 shadow-sm hover:shadow-xl transition-all group"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <h4 className="font-black text-zinc-900 text-lg group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{item?.tipo ?? 'N/A'}</h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Categoria de Medição</p>
                      </div>
                      <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-xs font-black border border-red-100 shadow-sm">
                        {(item?.percentual_impedimento ?? 0).toFixed(2).replace('.', ',')}% Imp.
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-zinc-50 p-3 rounded-2xl text-center border border-zinc-100/50">
                        <p className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Total</p>
                        <p className="text-sm font-black text-zinc-900">{(item?.total_leituras ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-2xl text-center border border-emerald-100/50">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Realizadas</p>
                        <p className="text-sm font-black text-emerald-700">{(item?.realizadas ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-2xl text-center border border-amber-100/50">
                        <p className="text-[9px] font-bold text-amber-600 uppercase mb-1">Não Real.</p>
                        <p className="text-sm font-black text-amber-700">{(item?.nao_realizadas ?? 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-zinc-400">Eficiência Operacional</span>
                        <span className="text-emerald-600">{(item?.realizadas !== undefined && item?.total_leituras) ? ((item.realizadas / item.total_leituras) * 100).toFixed(1) : '0.0'}%</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(item?.realizadas !== undefined && item?.total_leituras) ? (item.realizadas / item.total_leituras) * 100 : 0}%` }}
                          className="bg-emerald-500 h-full rounded-full shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Impediments Chart Section */}
          <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-zinc-900">Análise de Impedimentos</h3>
                <p className="text-zinc-500 text-sm">Distribuição ordenada de leituras não realizadas.</p>
              </div>

              {/* Tabs */}
              <div className="flex p-1.5 bg-zinc-100 rounded-2xl self-start">
                {(['razao', 'mes', 'ano'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      activeTab === tab 
                        ? "bg-white text-zinc-900 shadow-lg" 
                        : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    {tab === 'razao' ? 'Por Razão' : tab === 'mes' ? 'Por Mês' : 'Por Ano'}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[450px] w-full relative">
              {loadingChart ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10 rounded-2xl">
                  <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                  <p className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">Sincronizando Histórico...</p>
                </div>
              ) : chartData[activeTab].length > 0 ? (
                <Chart 
                  options={chartOptions}
                  series={chartSeries}
                  type="bar"
                  height="100%"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                  <AlertCircle className="w-12 h-12 mb-2 opacity-20" />
                  <p className="font-medium">Dados insuficientes para gerar este gráfico.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, loading, highlight }: any) {
  const colorClasses: any = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className={cn(
        "bg-white p-8 rounded-[32px] border shadow-sm transition-all relative overflow-hidden group",
        highlight ? "ring-2 ring-red-500/10" : "border-zinc-100"
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <div className={cn("p-3 rounded-2xl bg-white shadow-md group-hover:scale-110 transition-transform", colorClasses[color])}>
          <Icon className="w-6 h-6" />
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin opacity-20" />}
      </div>
      <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-widest">{title}</h4>
      {loading ? (
        <div className="h-10 w-32 bg-zinc-100 animate-pulse rounded-xl mt-2" />
      ) : (
        <p className={cn(
          "text-3xl font-black mt-2 tracking-tight",
          highlight ? "text-red-600" : "text-zinc-900"
        )}>
          {value}
        </p>
      )}
      
      {/* Decorative background icon */}
      <Icon className="absolute -right-4 -bottom-4 w-24 h-24 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity" />
    </motion.div>
  );
}
