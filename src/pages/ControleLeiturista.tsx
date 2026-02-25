import { useState, useEffect, useCallback } from 'react';
import Chart from 'react-apexcharts';
import { 
  Users, 
  Search, 
  Loader2, 
  AlertCircle, 
  Download, 
  FileSpreadsheet,
  TrendingUp,
  Filter,
  BarChart3,
  Database
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ControleLeituristaData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function ControleLeiturista() {
  const [loading, setLoading] = useState(false);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter Options
  const [options, setOptions] = useState<{
    anos: number[];
    meses: string[];
    matriculas: string[];
  }>({
    anos: [],
    meses: [],
    matriculas: []
  });

  // Selected Filters
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [matr, setMatr] = useState<string | null>(null);
  const [ulDe, setUlDe] = useState('');
  const [ulPara, setUlPara] = useState('');

  // Data State
  const [results, setResults] = useState<ControleLeituristaData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async (retryCount = 0) => {
    setLoadingFilters(true);
    
    let anos: number[] = [];
    let meses: string[] = [];
    let matriculas: string[] = [];

    // Fetch Anos
    try {
      const { data, error } = await supabase.rpc('dashboard_getanos');
      if (error) throw error;
      anos = (data as any[] || []).map(item => typeof item === 'object' ? item.ano : item).sort((a, b) => b - a);
    } catch (e) {
      console.error('Erro ao buscar anos:', e);
    }

    // Fetch Meses
    try {
      const { data, error } = await supabase.rpc('dashboard_getmeses');
      if (error) throw error;
      meses = (data as any[] || []).map(item => typeof item === 'object' ? item.mes : item);
    } catch (e) {
      console.error('Erro ao buscar meses:', e);
    }

    // Fetch Matriculas from public."LeituraGeral"
    try {
      // Log Supabase config for debugging as requested
      console.log('SAL System - Supabase Config Check:', {
        url: import.meta.env.VITE_SUPABASE_URL ? 'Configurada' : 'MISSING',
        key: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Configurada' : 'MISSING'
      });

      // Try RPC first for performance
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_matriculas');
      
      if (!rpcErr && rpcData) {
        matriculas = (rpcData as any[]).map(item => typeof item === 'object' ? item.matr : item).sort();
      } else {
        // Fallback to table query with quoted name
        const { data, error } = await supabase
          .from('"LeituraGeral"')
          .select('matr')
          .not('matr', 'is', null);
        
        if (error) throw error;
        matriculas = Array.from(new Set((data || []).map(item => item.matr))).sort();
      }
    } catch (e) {
      console.error('Erro ao buscar matrículas:', e);
    }

    setOptions({ anos, meses, matriculas });

    if (anos.length > 0 && ano === null) setAno(Number(anos[0]));
    if (meses.length > 0 && mes === null) setMes(String(meses[0]));
    
    setLoadingFilters(false);
  }, [ano, mes]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // 2. Handle Search
  const handleGenerate = async () => {
    if (ano === null || mes === null) {
      setError('Por favor, selecione Ano e Mês.');
      return;
    }

    setError(null);
    setLoading(true);
    setHasGenerated(false);
    setResults([]);
    setCurrentPage(1);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_controle_leiturista', {
        p_ano: Number(ano),
        p_mes: String(mes),
        p_matr: matr || null,
        p_ul_de: ulDe ? Number(ulDe) : null,
        p_ul_para: ulPara ? Number(ulPara) : null
      });

      if (rpcError) {
        if (rpcError.code === '57014') {
          setError('A busca demorou muito. Por favor, tente filtrar por um dado mais específico.');
          return;
        }
        throw rpcError;
      }

      if (!data || data.length === 0) {
        setError('Nenhum dado encontrado para os filtros informados.');
        return;
      }

      setResults(data || []);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Totals
  const totals = results.reduce((acc, curr) => ({
    urb: acc.urb + (curr.leit_urb || 0),
    povoado: acc.povoado + (curr.leit_povoado || 0),
    rural: acc.rural + (curr.leit_rural || 0),
    impedimentos: acc.impedimentos + (curr.impedimentos || 0)
  }), { urb: 0, povoado: 0, rural: 0, impedimentos: 0 });

  // 4. Pagination
  const totalPages = Math.ceil(results.length / pageSize);
  const paginatedResults = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Export
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = [
      "ANO", "MES", "RAZAO", "UL.", "MATR", "Leit. Urb", 
      "Leit. Povoado", "Leit. Rural", "Leit. Total", "IMPEDIMENTOS", "INDICADOR"
    ];
    const tableRows = results.map(r => [
      r.ano, r.mes, r.razao, r.ul, r.matr, r.leit_urb,
      r.leit_povoado, r.leit_rural, r.leit_total, r.impedimentos, 
      `${(r.indicador * 100).toFixed(2).replace('.', ',')}%`
    ]);

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("SAL - Relatório de Controle de Leiturista", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
    });

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Copyright SAL: Sistema de Análise de Leitura © 2026 | Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    doc.save(`SAL_Controle_Leiturista_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(results.map(r => ({
      "ANO": r.ano,
      "MES": r.mes,
      "RAZAO": r.razao,
      "UL.": r.ul,
      "MATR": r.matr,
      "Leit. Urb": r.leit_urb,
      "Leit. Povoado": r.leit_povoado,
      "Leit. Rural": r.leit_rural,
      "Leit. Total": r.leit_total,
      "IMPEDIMENTOS": r.impedimentos,
      "INDICADOR": `${(r.indicador * 100).toFixed(2).replace('.', ',')}%`
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituristas");
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('pt-BR').replace(/:/g, '-');
    
    XLSX.writeFile(workbook, `SAL_Controle_Leiturista_${dateStr}_${timeStr}.xlsx`);
  };

  // 6. Chart Data
  // Group by Matrícula + Razão
  const chartData = results.reduce((acc: { [key: string]: number }, curr) => {
    const key = `${curr.matr} - RZ ${curr.razao}`;
    acc[key] = (acc[key] || 0) + (curr.impedimentos || 0);
    return acc;
  }, {});

  const sortedChartData = (Object.entries(chartData) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15); // Top 15 for readability

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif'
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '60%',
        distributed: true,
        dataLabels: { position: 'top' }
      }
    },
    dataLabels: {
      enabled: true,
      offsetY: -20,
      style: { fontSize: '10px', colors: ['#3f3f46'] }
    },
    xaxis: {
      categories: sortedChartData.map(d => d[0]),
      labels: { rotate: -45, style: { fontSize: '10px' } }
    },
    yaxis: { title: { text: 'Impedimentos' } },
    legend: { show: false },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  };

  const chartSeries = [{
    name: 'Impedimentos',
    data: sortedChartData.map(d => d[1])
  }];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Controle de Leiturista</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise de produtividade e impedimentos por profissional.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Ano</span>
            <select 
              value={ano || ''} 
              onChange={(e) => setAno(Number(e.target.value))}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
            >
              {options.anos.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Mês</span>
            <select 
              value={mes || ''} 
              onChange={(e) => setMes(e.target.value)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
            >
              {options.meses.map(m => <option key={m} value={m}>{m}</option>)}
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
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">UL DE</span>
            <input 
              type="text"
              value={ulDe}
              onChange={(e) => setUlDe(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="0"
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 w-24 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">UL PARA</span>
            <input 
              type="text"
              value={ulPara}
              onChange={(e) => setUlPara(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="99999999"
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 w-24 transition-all"
            />
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
          <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">Processando Dados...</p>
        </div>
      )}

      {!loading && hasGenerated && results.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard title="Somatório Leit. Urb" value={totals.urb.toLocaleString()} color="blue" />
            <SummaryCard title="Somatório Leit. Povoado" value={totals.povoado.toLocaleString()} color="emerald" />
            <SummaryCard title="Somatório Leit. Rural" value={totals.rural.toLocaleString()} color="amber" />
            <SummaryCard title="Somatório Impedimentos" value={totals.impedimentos.toLocaleString()} color="red" />
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Relação de Impedimentos
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={exportToPDF} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors" title="Exportar PDF">
                  <Download className="w-5 h-5" />
                </button>
                <button onClick={exportToExcel} className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors" title="Exportar Excel">
                  <FileSpreadsheet className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL.</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matr</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Urb</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Povoado</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Rural</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Total</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Impedimentos</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Indicador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.ano}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.mes}</td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.razao}</td>
                      <td className="px-4 py-3 text-xs font-bold text-blue-600">{r.ul}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.matr}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_urb}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_povoado}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_rural}</td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.leit_total}</td>
                      <td className="px-4 py-3 text-xs font-black text-red-600">{r.impedimentos}</td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-900">{(r.indicador * 100).toFixed(2).replace('.', ',')}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
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
            <div className="flex items-center gap-2 mb-8">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Impedimentos por Matrícula e Razão</h3>
            </div>
            <div className="h-[400px] w-full">
              <Chart 
                options={chartOptions}
                series={chartSeries}
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
            <Users className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Aguardando novos parâmetros de busca</h2>
          <p className="text-zinc-500 max-w-xs">Selecione os filtros acima e clique em Gerar para visualizar o controle de leituristas.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, color }: { title: string, value: string, color: 'blue' | 'emerald' | 'amber' | 'red' }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100"
  };

  return (
    <div className={cn("p-6 rounded-[28px] border shadow-sm flex flex-col gap-2 bg-white", colors[color])}>
      <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{title}</span>
      <span className="text-2xl font-black tracking-tight">{value}</span>
    </div>
  );
}
