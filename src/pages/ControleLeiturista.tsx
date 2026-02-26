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
  const [activeTab, setActiveTab] = useState<'ul' | 'razao' | 'matricula'>('ul');
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

    // Fetch Matriculas using RPC
    try {
      const { data, error } = await supabase.rpc('get_lista_matriculas');
      if (error) throw error;
      matriculas = (data as any[] || []).map(item => typeof item === 'object' ? item.matr : item).sort();
    } catch (e) {
      console.error('Erro ao buscar matrículas via RPC:', e);
      // Fallback: If RPC fails (e.g. PGRST202), try a limited fetch from table
      try {
        const { data: fallbackData } = await supabase
          .from('"LeituraGeral"')
          .select('matr')
          .limit(10000);
        if (fallbackData) {
          matriculas = [...new Set(fallbackData.map(item => item.matr))].sort();
        }
      } catch (fallbackErr) {
        console.error('Fallback de matrículas falhou:', fallbackErr);
      }
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

      // Use RPC fields directly as requested
      const processedData = (data || []).map((item: any) => ({
        ...item,
        indicador: Number(item.indicador || 0)
      }));
      
      setResults(processedData);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Grouping Logic
  const groupedResults = (() => {
    if (activeTab === 'ul') {
      return [...results].sort((a, b) => b.indicador - a.indicador);
    }

    const grouped: { [key: string]: ControleLeituristaData } = {};

    results.forEach(r => {
      const key = activeTab === 'razao' ? `${r.razao}` : `${r.razao}-${r.matr}`;
      if (!grouped[key]) {
        grouped[key] = {
          ...r,
          ul: activeTab === 'razao' ? '-' : r.ul,
          matr: activeTab === 'razao' ? '-' : r.matr,
          leit_urb: 0,
          leit_povoado: 0,
          leit_rural: 0,
          leit_total: 0,
          impedimentos: 0,
          indicador: 0
        };
      }
      grouped[key].leit_urb += Number(r.leit_urb || 0);
      grouped[key].leit_povoado += Number(r.leit_povoado || 0);
      grouped[key].leit_rural += Number(r.leit_rural || 0);
      grouped[key].leit_total += Number(r.leit_total || 0);
      grouped[key].impedimentos += Number(r.impedimentos || 0);
    });

    return Object.values(grouped).map(g => ({
      ...g,
      indicador: g.leit_total > 0 ? (g.impedimentos / g.leit_total) * 100 : 0
    })).sort((a, b) => b.indicador - a.indicador);
  })();

  // 4. Totals
  const totals = results.reduce((acc, curr) => {
    const urb = Number(curr.leit_urb || 0);
    const povoado = Number(curr.leit_povoado || 0);
    const rural = Number(curr.leit_rural || 0);
    const impedimentos = Number(curr.impedimentos || 0);
    const total = Number(curr.leit_total || 0);

    return {
      urb: acc.urb + urb,
      povoado: acc.povoado + povoado,
      rural: acc.rural + rural,
      impedimentos: acc.impedimentos + impedimentos,
      total: acc.total + total
    };
  }, { urb: 0, povoado: 0, rural: 0, impedimentos: 0, total: 0 });

  const totalIndicador = totals.total > 0 ? (totals.impedimentos / totals.total) * 100 : 0;

  // Grouped Totals for Cards
  const urbImpedimentos = results.reduce((sum, r) => {
    const isUrb = String(r.tipo || '').toLowerCase() === 'urbano' || (Number(r.leit_urb || 0) > 0 && Number(r.leit_povoado || 0) === 0 && Number(r.leit_rural || 0) === 0);
    return sum + (isUrb ? Number(r.impedimentos || 0) : 0);
  }, 0);
  
  const povoadoImpedimentos = results.reduce((sum, r) => {
    const isPov = String(r.tipo || '').toLowerCase() === 'povoado' || (Number(r.leit_povoado || 0) > 0 && Number(r.leit_urb || 0) === 0 && Number(r.leit_rural || 0) === 0);
    return sum + (isPov ? Number(r.impedimentos || 0) : 0);
  }, 0);
  
  const ruralImpedimentos = results.reduce((sum, r) => {
    const isRur = String(r.tipo || '').toLowerCase() === 'rural' || (Number(r.leit_rural || 0) > 0 && Number(r.leit_urb || 0) === 0 && Number(r.leit_povoado || 0) === 0);
    return sum + (isRur ? Number(r.impedimentos || 0) : 0);
  }, 0);

  const urbIndicador = totals.urb > 0 ? (urbImpedimentos / totals.urb) * 100 : 0;
  const povoadoIndicador = totals.povoado > 0 ? (povoadoImpedimentos / totals.povoado) * 100 : 0;
  const ruralIndicador = totals.rural > 0 ? (ruralImpedimentos / totals.rural) * 100 : 0;

  // 5. Pagination
  const totalPages = Math.ceil(groupedResults.length / pageSize);
  const paginatedResults = groupedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 6. Export
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = [
      "ANO", "MES", "RAZAO", "UL.", "MATR", "Leit. Urb", 
      "Leit. Povoado", "Leit. Rural", "Leit. Total", "IMPEDIMENTOS", "INDICADOR"
    ];
    const tableRows = [
      ...groupedResults.map(r => [
        r.ano, r.mes, r.razao, r.ul, r.matr, r.leit_urb,
        r.leit_povoado, r.leit_rural, r.leit_total, r.impedimentos, 
        `${(r.indicador).toFixed(2).replace('.', ',')}%`
      ]),
      [
        "TOTAL", "", "", "", "", totals.urb,
        totals.povoado, totals.rural, totals.total, totals.impedimentos,
        `${totalIndicador.toFixed(2).replace('.', ',')}%`
      ]
    ];

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
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 10) {
          const val = parseFloat(data.cell.text[0].replace(',', '.'));
          if (val > 0.51) {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'italic';
          }
        }
      }
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

    doc.save(`SAL_Controle_Leiturista_${activeTab}_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const exportData = [
      ...groupedResults.map(r => ({
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
        "INDICADOR": `${(r.indicador).toFixed(2).replace('.', ',')}%`
      })),
      {
        "ANO": "TOTAL",
        "MES": "",
        "RAZAO": "",
        "UL.": "",
        "MATR": "",
        "Leit. Urb": totals.urb,
        "Leit. Povoado": totals.povoado,
        "Leit. Rural": totals.rural,
        "Leit. Total": totals.total,
        "IMPEDIMENTOS": totals.impedimentos,
        "INDICADOR": `${totalIndicador.toFixed(2).replace('.', ',')}%`
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituristas");
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('pt-BR').replace(/:/g, '-');
    
    XLSX.writeFile(workbook, `SAL_Controle_Leiturista_${activeTab}_${dateStr}_${timeStr}.xlsx`);
  };

  // 7. Chart Data (Always grouped by Matrícula + Razão for the chart)
  const chartResults = (() => {
    const grouped: { [key: string]: ControleLeituristaData } = {};
    results.forEach(r => {
      const key = `${r.razao}-${r.matr}`;
      if (!grouped[key]) {
        grouped[key] = {
          ...r,
          leit_urb: 0,
          leit_povoado: 0,
          leit_rural: 0,
          leit_total: 0,
          impedimentos: 0,
          indicador: 0
        };
      }
      grouped[key].leit_urb += Number(r.leit_urb || 0);
      grouped[key].leit_povoado += Number(r.leit_povoado || 0);
      grouped[key].leit_rural += Number(r.leit_rural || 0);
      grouped[key].leit_total += Number(r.leit_total || 0);
      grouped[key].impedimentos += Number(r.impedimentos || 0);
    });

    return Object.values(grouped)
      .sort((a, b) => b.impedimentos - a.impedimentos)
      .slice(0, 15);
  })();

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif'
    },
    grid: {
      show: false // Remove background grid lines
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
      categories: chartResults.map(d => d.matr),
      labels: { rotate: -45, style: { fontSize: '10px' } }
    },
    yaxis: { title: { text: 'Impedimentos' } },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: (val, { seriesIndex, dataPointIndex, w }) => {
          const item = chartResults[dataPointIndex];
          return `Razão: ${item.razao}<br/>Qtd Impedimentos: ${val}<br/>Qtd Leitura Urb: ${item.leit_urb}<br/>Qtd Leitura Povoado: ${item.leit_povoado}<br/>Qtd Leitura Rural: ${item.leit_rural}`;
        }
      }
    },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  };

  const chartSeries = [{
    name: 'Impedimentos',
    data: chartResults.map(d => d.impedimentos)
  }];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Controle de Leiturista</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise de produtividade e impedimentos.</p>
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
          {/* Summary Cards - Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <SummaryCard 
              title="Leit. Urb" 
              readings={totals.urb} 
              impediments={urbImpedimentos} 
              indicator={urbIndicador} 
              color="blue" 
            />
            <SummaryCard 
              title="Leit. Povoado" 
              readings={totals.povoado} 
              impediments={povoadoImpedimentos} 
              indicator={povoadoIndicador} 
              color="emerald" 
            />
            <SummaryCard 
              title="Leit. Rural" 
              readings={totals.rural} 
              impediments={ruralImpedimentos} 
              indicator={ruralIndicador} 
              color="amber" 
            />
            <SummaryCard 
              title="Impedimentos Geral" 
              readings={totals.total} 
              impediments={totals.impedimentos} 
              indicator={totalIndicador} 
              color="red" 
            />
          </div>

          {/* Summary Cards - Row 2 */}
          <div className="grid grid-cols-1 gap-6">
            <SummaryCard 
              title="Leituras Geral" 
              readings={totals.total} 
              impediments={totals.impedimentos} 
              indicator={totalIndicador} 
              color="zinc" 
              isWide
            />
          </div>

          {/* Table Section */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-500" />
                  Relação Quantitativa de Impedimentos
                </h3>
                <div className="flex items-center gap-4 mt-2">
                  <button 
                    onClick={() => { setActiveTab('ul'); setCurrentPage(1); }}
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                      activeTab === 'ul' ? "bg-blue-50 text-blue-600" : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    Por UL
                  </button>
                  <button 
                    onClick={() => { setActiveTab('razao'); setCurrentPage(1); }}
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                      activeTab === 'razao' ? "bg-blue-50 text-blue-600" : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    Por Razão
                  </button>
                  <button 
                    onClick={() => { setActiveTab('matricula'); setCurrentPage(1); }}
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                      activeTab === 'matricula' ? "bg-blue-50 text-blue-600" : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    Matrícula
                  </button>
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
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                    {activeTab !== 'razao' && activeTab !== 'matricula' && (
                      <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL.</th>
                    )}
                    {activeTab !== 'razao' && (
                      <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matr</th>
                    )}
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Urb</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Povoado</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Rural</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leit. Total</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Impedimentos</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Indicador (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r, i) => {
                    const isHighlighted = r.indicador > 0.51;
                    return (
                      <tr 
                        key={i} 
                        className={cn(
                          "hover:bg-zinc-50/50 transition-colors",
                          isHighlighted && "bg-red-50 italic"
                        )}
                      >
                        <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.ano}</td>
                        <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.mes}</td>
                        <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.razao}</td>
                        {activeTab !== 'razao' && activeTab !== 'matricula' && (
                          <td className="px-4 py-3 text-xs font-bold text-blue-600">{r.ul}</td>
                        )}
                        {activeTab !== 'razao' && (
                          <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.matr}</td>
                        )}
                        <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_urb}</td>
                        <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_povoado}</td>
                        <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.leit_rural}</td>
                        <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.leit_total}</td>
                        <td className="px-4 py-3 text-xs font-black text-red-600">{r.impedimentos}</td>
                        <td className="px-4 py-3 text-xs font-bold text-zinc-900">{(r.indicador).toFixed(2).replace('.', ',')}%</td>
                      </tr>
                    );
                  })}
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
              <h3 className="text-lg font-bold text-zinc-900">
                Relação Gráfica de Impedimentos {activeTab === 'ul' ? '(Por UL)' : activeTab === 'razao' ? '(Por Razão)' : '(Por Matrícula)'}
              </h3>
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

          {/* Footer Identity */}
          <div className="flex flex-col items-center justify-center py-8 border-t border-zinc-100 gap-2">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Copyright SAL: Sistema de Análise de Leitura © 2026</p>
            <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{new Date().toLocaleString('pt-BR')}</p>
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

function SummaryCard({ 
  title, 
  readings, 
  impediments, 
  indicator, 
  color, 
  isWide = false 
}: { 
  title: string, 
  readings: number, 
  impediments: number, 
  indicator: number, 
  color: 'blue' | 'emerald' | 'amber' | 'red' | 'zinc',
  isWide?: boolean
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    zinc: "bg-zinc-50 text-zinc-600 border-zinc-100"
  };

  return (
    <div className={cn(
      "p-6 rounded-[28px] border shadow-sm flex flex-col gap-4 bg-white transition-all hover:shadow-md", 
      colors[color],
      isWide && "md:col-span-2 lg:col-span-4 p-8"
    )}>
      <div className="flex items-center justify-between">
        <span className={cn(
          "font-black uppercase tracking-[0.2em] opacity-60",
          isWide ? "text-xs" : "text-[10px]"
        )}>{title}</span>
        <div className={cn(
          "px-3 py-1 rounded-full font-black",
          isWide ? "text-sm px-4 py-2" : "text-[10px]",
          indicator > 0.51 ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600"
        )}>
          {indicator.toFixed(2).replace('.', ',')}%
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className={cn(
            "font-bold uppercase opacity-40",
            isWide ? "text-xs" : "text-[10px]"
          )}>Leituras</span>
          <span className={cn(
            "font-black tracking-tight",
            isWide ? "text-3xl" : "text-xl"
          )}>{readings.toLocaleString()}</span>
        </div>
        <div className="flex flex-col">
          <span className={cn(
            "font-bold uppercase opacity-40",
            isWide ? "text-xs" : "text-[10px]"
          )}>Impedimentos</span>
          <span className={cn(
            "font-black tracking-tight",
            isWide ? "text-3xl" : "text-xl"
          )}>{impediments.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
