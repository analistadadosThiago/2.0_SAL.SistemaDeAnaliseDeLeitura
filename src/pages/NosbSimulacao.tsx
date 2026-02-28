import { useState, useEffect, useCallback, useMemo } from 'react';
import Chart from 'react-apexcharts';
import { 
  AlertCircle, 
  Download, 
  FileSpreadsheet,
  Loader2, 
  Database,
  Filter,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { NosbSimulacaoData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function NosbSimulacao() {
  const [loading, setLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter Options
  const [options, setOptions] = useState<{
    anos: string[];
    meses: string[];
    razoes: string[];
    matriculas: string[];
    motivos: string[];
  }>({
    anos: [],
    meses: [],
    razoes: [],
    matriculas: [],
    motivos: []
  });

  // Selected Filters
  const [ano, setAno] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [razao, setRazao] = useState<string | null>(null);
  const [matr, setMatr] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  // Data State
  const [results, setResults] = useState<NosbSimulacaoData[]>([]);
  const [activeTab, setActiveTab] = useState<'ul' | 'razao' | 'matr'>('ul');
  const [activeChartTab, setActiveChartTab] = useState<'razao' | 'matr'>('razao');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    try {
      const { data: filtersData, error: filtersError } = await supabase.rpc('get_filtros_nosb_simulacao');

      if (filtersError) {
        console.error('Erro ao buscar filtros de simulação:', filtersError);
        // Fallback or empty options
        setOptions({ anos: [], meses: [], razoes: [], matriculas: [], motivos: [] });
      } else {
        const anos = (filtersData || [])
          .filter((f: any) => f.coluna === 'ano')
          .map((f: any) => String(f.valor))
          .sort((a: string, b: string) => Number(b) - Number(a));
        
        const meses = (filtersData || [])
          .filter((f: any) => f.coluna === 'mes')
          .map((f: any) => String(f.valor));

        const razoes = (filtersData || [])
          .filter((f: any) => f.coluna === 'rz')
          .map((f: any) => String(f.valor))
          .sort((a: string, b: string) => Number(a) - Number(b));

        const matriculas = (filtersData || [])
          .filter((f: any) => f.coluna === 'matr')
          .map((f: any) => String(f.valor))
          .sort();

        const motivos = (filtersData || [])
          .filter((f: any) => f.coluna === 'motivo')
          .map((f: any) => String(f.valor))
          .filter((m: string) => m !== 'Faturada')
          .sort();

        setOptions({ anos, meses, razoes, matriculas, motivos });
        
        if (anos.length > 0) setAno(anos[0]);
        if (meses.length > 0) setMes(meses[0]);
      }
    } catch (e) {
      console.error('Erro ao buscar filtros:', e);
    } finally {
      setLoadingFilters(false);
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // 2. Handle Search
  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    setHasGenerated(false);
    setResults([]);
    setCurrentPage(1);
    setFetchProgress(0);

    try {
      let allData: any[] = [];
      let start = 0;
      let end = 999;
      let hasMore = true;

      while (hasMore) {
        const { data, error: rpcError } = await supabase
          .rpc('get_nosb_simulacao', {
            p_ano: String(ano || ""),
            p_mes: String(mes || ""),
            p_rz: String(razao || ""),
            p_matr: String(matr || ""),
            p_motivo: String(motivo || "")
          })
          .range(start, end);

        if (rpcError) throw rpcError;

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allData = [...allData, ...data];
          setFetchProgress(allData.length);
          
          if (data.length < 1000) {
            hasMore = false;
          } else {
            start += 1000;
            end += 1000;
          }
        }
      }

      if (allData.length === 0) {
        setError('Nenhum dado encontrado para os filtros informados.');
        return;
      }

      // Filter out "Faturada" and ensure strings with robust fallbacks
      const filteredData = allData
        .filter((r: any) => r.f_motivo !== 'Faturada')
        .map((r: any) => ({
          f_mes: String(r.f_mes || ""),
          f_ano: String(r.f_ano || ""),
          f_rz: String(r.f_rz || ""),
          f_ul: String(r.f_ul || ""),
          f_instalacao: String(r.f_instalacao || ""),
          f_medidor: String(r.f_medidor || ""),
          f_reg: String(r.f_reg || ""),
          f_tipo: String(r.f_tipo || ""),
          f_matr: String(r.f_matr || ""),
          f_nl: String(r.f_nl || ""),
          f_l_atual: String(r.f_l_atual || ""),
          f_motivo: String(r.f_motivo || "")
        }));

      if (filteredData.length === 0) {
        setError('Nenhum dado encontrado (excluindo Faturadas).');
        return;
      }

      setResults(filteredData);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Grouping Logic
  const groupedByRazao = useMemo(() => {
    const grouped: { [key: string]: { razao: string, motivo: string, quantidade: number } } = {};
    results.forEach(r => {
      const rz = r.f_rz;
      const mot = r.f_motivo;
      const key = `${rz}_${mot}`;
      if (!grouped[key]) {
        grouped[key] = { razao: rz, motivo: mot, quantidade: 0 };
      }
      grouped[key].quantidade += 1;
    });
    return Object.values(grouped).sort((a, b) => Number(a.razao) - Number(b.razao) || b.quantidade - a.quantidade);
  }, [results]);

  const groupedByMatricula = useMemo(() => {
    const grouped: { [key: string]: { matr: string, razao: string, quantidade: number } } = {};
    results.forEach(r => {
      const m = r.f_matr;
      const rz = r.f_rz;
      const key = `${m}_${rz}`;
      if (!grouped[key]) {
        grouped[key] = { matr: m, razao: rz, quantidade: 0 };
      }
      grouped[key].quantidade += 1;
    });
    return Object.values(grouped).sort((a, b) => (a.matr || "").localeCompare(b.matr || "") || b.quantidade - a.quantidade);
  }, [results]);

  // 4. Chart Logic
  const chartData = useMemo(() => {
    if (activeChartTab === 'razao') {
      const totals: { [key: string]: { total: number, motivos: { [m: string]: number } } } = {};
      results.forEach(r => {
        const rz = r.f_rz;
        const mot = r.f_motivo;
        if (!totals[rz]) totals[rz] = { total: 0, motivos: {} };
        totals[rz].total += 1;
        totals[rz].motivos[mot] = (totals[rz].motivos[mot] || 0) + 1;
      });

      const sorted = Object.entries(totals)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total);

      return {
        categories: sorted.map(i => i.name),
        series: [{ name: 'Total', data: sorted.map(i => i.total) }],
        motivos: sorted.map(i => i.motivos)
      };
    } else {
      const totals: { [key: string]: { total: number, motivos: { [m: string]: number } } } = {};
      results.forEach(r => {
        const m = r.f_matr;
        const mot = r.f_motivo;
        if (!totals[m]) totals[m] = { total: 0, motivos: {} };
        totals[m].total += 1;
        totals[m].motivos[mot] = (totals[m].motivos[mot] || 0) + 1;
      });

      const sorted = Object.entries(totals)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total);

      return {
        categories: sorted.map(i => i.name),
        series: [{ name: 'Total', data: sorted.map(i => i.total) }],
        motivos: sorted.map(i => i.motivos)
      };
    }
  }, [results, activeChartTab]);

  const chartOptions: ApexCharts.ApexOptions = {
    chart: { 
      type: 'bar', 
      toolbar: { show: false }, 
      fontFamily: 'Inter, sans-serif',
      animations: { enabled: false }
    },
    plotOptions: { 
      bar: { 
        columnWidth: '60%', 
        borderRadius: 0,
        distributed: true,
        dataLabels: { position: 'top' }
      } 
    },
    dataLabels: { 
      enabled: true,
      offsetY: -20,
      style: { colors: ['#3f3f46'], fontSize: '12px', fontWeight: 'bold' }
    },
    xaxis: { 
      categories: chartData.categories,
      axisBorder: { show: true, color: '#e5e7eb' },
      axisTicks: { show: false },
      labels: {
        style: {
          fontSize: '10px',
          fontWeight: 600
        }
      }
    },
    yaxis: { show: false },
    fill: { opacity: 1 },
    legend: { show: false },
    grid: { show: false },
    tooltip: {
      custom: ({ series, seriesIndex, dataPointIndex, w }) => {
        const motivos = chartData.motivos[dataPointIndex] as { [key: string]: number };
        const sortedMotivos = Object.entries(motivos).sort((a, b) => (b[1] as number) - (a[1] as number));
        const total = series[seriesIndex][dataPointIndex];
        
        return `
          <div class="p-3 bg-white border border-zinc-200 shadow-xl rounded-xl">
            <div class="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">${w.globals.labels[dataPointIndex]}</div>
            <div class="space-y-1.5">
              ${sortedMotivos.map(([name, val]) => `
                <div class="flex items-center justify-between gap-4">
                  <span class="text-xs font-bold text-zinc-600">${name}</span>
                  <span class="text-xs font-black text-blue-600">${val}</span>
                </div>
              `).join('')}
              <div class="pt-1.5 mt-1.5 border-t border-zinc-100 flex items-center justify-between gap-4">
                <span class="text-xs font-black text-zinc-900 uppercase">Total</span>
                <span class="text-xs font-black text-zinc-900">${total}</span>
              </div>
            </div>
          </div>
        `;
      }
    },
    colors: ['#3b82f6']
  };

  // 5. Pagination
  const currentResults = activeTab === 'ul' ? results : activeTab === 'razao' ? groupedByRazao : groupedByMatricula;
  const totalPages = Math.ceil(currentResults.length / pageSize);
  const paginatedResults = currentResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 6. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    let tableColumn: string[] = [];
    let tableRows: any[] = [];

    if (activeTab === 'ul') {
      tableColumn = ["MÊS", "ANO", "MEDIDOR", "REG", "TIPO", "MATRÍCULA", "UL", "INSTALAÇÃO", "COD", "LEITURA", "MOTIVO"];
      tableRows = results.map(r => [
        r.f_mes, r.f_ano, r.f_medidor, r.f_reg, r.f_tipo, r.f_matr, r.f_ul, r.f_instalacao, r.f_nl, r.f_l_atual, r.f_motivo
      ]);
    } else if (activeTab === 'razao') {
      tableColumn = ["RAZÃO", "MOTIVO", "QUANTIDADE"];
      tableRows = groupedByRazao.map(r => [r.razao, r.motivo, r.quantidade]);
    } else {
      tableColumn = ["MATRÍCULA", "RAZÃO", "QUANTIDADE"];
      tableRows = groupedByMatricula.map(r => [r.matr, r.razao, r.quantidade]);
    }

    doc.setFontSize(18);
    doc.text(`SAL - N’OSB - Simulação (${activeTab.toUpperCase()})`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`SAL_Nosb_Simulacao_${activeTab}_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const dataToExport = activeTab === 'ul' ? results : activeTab === 'razao' ? groupedByRazao : groupedByMatricula;
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, `SAL_Nosb_Simulacao_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">N’OSB - Simulação</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise de simulações de leitura e não impressão de faturas</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Ano</span>
            <select 
              value={ano || ''} 
              onChange={(e) => setAno(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
            >
              <option value="">Todos</option>
              {options.anos.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Mês</span>
            <select 
              value={mes || ''} 
              onChange={(e) => setMes(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
            >
              <option value="">Todos</option>
              {options.meses.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Razão</span>
            <select 
              value={razao || ''} 
              onChange={(e) => setRazao(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
            >
              <option value="">Todas</option>
              {options.razoes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Matrícula</span>
            <select 
              value={matr || ''} 
              onChange={(e) => setMatr(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 min-w-[140px] transition-all"
            >
              <option value="">Todas</option>
              {options.matriculas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Motivo</span>
            <select 
              value={motivo || ''} 
              onChange={(e) => setMotivo(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 min-w-[180px] transition-all"
            >
              <option value="">Todos</option>
              {options.motivos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={loading || loadingFilters}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50 disabled:shadow-none mt-auto h-[46px]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
            <span>Gerar</span>
          </button>
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </motion.div>
      )}

      {loading && (
        <div className="h-[40vh] flex flex-col items-center justify-center space-y-4 bg-white/50 backdrop-blur-sm rounded-[32px] border border-zinc-100 shadow-sm animate-pulse">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <div className="text-center">
            <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">Carregando registros...</p>
            <p className="text-blue-600 font-bold text-lg mt-2">{fetchProgress} encontrados</p>
          </div>
        </div>
      )}

      {!loading && hasGenerated && results.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* Table Section */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                    <Database className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Tabela de Dados</h3>
                </div>

                <div className="flex items-center px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                    Base Total: {results.length} registros
                  </span>
                </div>
                
                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {(['ul', 'razao', 'matr'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                        activeTab === tab 
                          ? "bg-white text-blue-600 shadow-sm" 
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {tab === 'ul' ? 'Por UL' : tab === 'razao' ? 'Por Razão' : 'Por Matrícula'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={exportToPDF} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors flex items-center gap-2" title="Exportar PDF">
                  <Download className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase">PDF</span>
                </button>
                <button onClick={exportToExcel} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors flex items-center gap-2" title="Exportar Excel">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase">Excel</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    {activeTab === 'ul' && (
                      <>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Medidor</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Reg</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Tipo</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Instalação</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Cod</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leitura</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Motivo</th>
                      </>
                    )}
                    {activeTab === 'razao' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Motivo</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Quantidade</th>
                      </>
                    )}
                    {activeTab === 'matr' && (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Quantidade</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r: any, i) => (
                    <tr key={i} className="hover:bg-zinc-50 transition-colors">
                      {activeTab === 'ul' && (
                        <>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_mes}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_ano}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_medidor}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_reg}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_tipo}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_matr}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_ul}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_instalacao}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_nl}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_l_atual}</td>
                          <td className="px-4 py-3 text-xs text-zinc-600 font-medium">{r.f_motivo}</td>
                        </>
                      )}
                      {activeTab === 'razao' && (
                        <>
                          <td className="px-6 py-4 text-sm text-zinc-700 font-bold">{r.razao}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.motivo}</td>
                          <td className="px-6 py-4 text-sm font-black text-blue-600">{r.quantidade}</td>
                        </>
                      )}
                      {activeTab === 'matr' && (
                        <>
                          <td className="px-6 py-4 text-sm text-zinc-700 font-bold">{r.matr}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.razao}</td>
                          <td className="px-6 py-4 text-sm font-black text-blue-600">{r.quantidade}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div className="p-4 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-600 disabled:opacity-30"
                >
                  Anterior
                </button>
                <span className="text-xs font-black text-zinc-400">Página {currentPage} de {totalPages}</span>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-600 disabled:opacity-30"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>

          {/* Chart Section */}
          <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Grafico de dados Nosb Simulação</h3>
                </div>

                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {(['razao', 'matr'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveChartTab(tab)}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider",
                        activeChartTab === tab 
                          ? "bg-white text-blue-600 shadow-sm" 
                          : "text-zinc-500 hover:text-zinc-700"
                      )}
                    >
                      {tab === 'razao' ? 'Por Razão' : 'Por Matrícula'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-[400px] w-full">
              <Chart 
                options={chartOptions}
                series={chartData.series}
                type="bar"
                height="100%"
              />
            </div>
          </div>
        </motion.div>
      )}

      {!loading && !hasGenerated && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[32px] border border-zinc-100 shadow-sm">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500 mb-2">
            <Filter className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Aguardando parâmetros de busca</h2>
          <p className="text-zinc-500 max-w-xs">Preencha os filtros acima e clique em Gerar para visualizar os dados de simulação.</p>
        </div>
      )}
    </div>
  );
}
