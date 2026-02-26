import { useState, useEffect, useCallback } from 'react';
import Chart from 'react-apexcharts';
import { 
  Camera, 
  Search, 
  Loader2, 
  AlertCircle, 
  Download, 
  FileSpreadsheet,
  TrendingUp,
  Database,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ControleEvidenciasData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function ControleEvidencias() {
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
  const [results, setResults] = useState<ControleEvidenciasData[]>([]);
  const [activeTab, setActiveTab] = useState<'ul' | 'razao' | 'matr'>('ul');
  const [activeChartTab, setActiveChartTab] = useState<'mes' | 'ano' | 'matricula'>('mes');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    
    let anos: number[] = [];
    let meses: string[] = [];
    let matriculas: string[] = [];

    try {
      // Fetch Anos
      const { data: anosData } = await supabase.rpc('dashboard_getanos');
      anos = (anosData as any[] || []).map(item => typeof item === 'object' ? item.ano : item).sort((a, b) => b - a);

      // Fetch Meses
      const { data: mesesData } = await supabase.rpc('dashboard_getmeses');
      meses = (mesesData as any[] || []).map(item => typeof item === 'object' ? item.mes : item);

      // Fetch Matriculas
      const { data: matrData, error: matrError } = await supabase.rpc('get_lista_matriculas');
      if (matrError) {
        // Fallback
        const { data: fallbackData } = await supabase.from('"LeituraGeral"').select('matr').limit(10000);
        if (fallbackData) {
          matriculas = [...new Set(fallbackData.map(item => item.matr))].sort();
        }
      } else {
        matriculas = (matrData as any[] || []).map(item => typeof item === 'object' ? item.matr : item).sort();
      }
    } catch (e) {
      console.error('Erro ao buscar filtros:', e);
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
      const { data, error: rpcError } = await supabase.rpc('get_controle_evidencias', {
        p_ano: Number(ano),
        p_mes: String(mes),
        p_matr: matr || null,
        p_ul_de: ulDe ? Number(ulDe) : null,
        p_ul_para: ulPara ? Number(ulPara) : null
      });

      if (rpcError) throw rpcError;

      console.log('RPC Data:', data);

      if (!data || data.length === 0) {
        setError('Nenhum dado encontrado para os filtros informados.');
        return;
      }

      // 1. MAPEAMENTO DIRETO DA RPC
      const processedData = (data || []).map((item: any) => {
        const solicitadas = Number(item.v_solicitadas || 0);
        const realizadas = Number(item.v_realizadas || 0);
        // N-Realizadas: NÃO BUSQUE DO BANCO, faça a conta: Solicitadas - Realizadas.
        const nao_realizadas = solicitadas - realizadas;
        
        return {
          ...item,
          mes: item.v_mes || item.mes,
          ano: item.v_ano || item.ano,
          razao: item.v_razao || item.razao,
          ul: item.v_ul || item.ul,
          matr: item.v_matr || item.matr,
          solicitadas,
          realizadas,
          nao_realizadas,
          indicador: solicitadas > 0 ? (nao_realizadas / solicitadas) * 100 : 0
        };
      });
      
      setResults(processedData);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Grouping Logic for Tabs
  const groupedResults = (() => {
    const grouped: { [key: string]: ControleEvidenciasData } = {};

    results.forEach(r => {
      let key = '';
      if (activeTab === 'ul') key = `${r.ul}`;
      else if (activeTab === 'razao') key = `${r.razao}`;
      else key = `${r.matr}`; // Agrupando e somando pelo leiturista

      if (!grouped[key]) {
        grouped[key] = {
          ...r,
          ul: activeTab === 'ul' ? r.ul : '-',
          matr: activeTab === 'matr' ? r.matr : '-',
          razao: activeTab === 'ul' ? '-' : r.razao,
          solicitadas: 0,
          realizadas: 0,
          nao_realizadas: 0,
          indicador: 0
        };
      }
      grouped[key].solicitadas += Number(r.solicitadas || 0);
      grouped[key].realizadas += Number(r.realizadas || 0);
    });

    return Object.values(grouped).map(g => {
      // Subtrair para achar a N-Realizada
      const nao_realizadas = g.solicitadas - g.realizadas;
      return {
        ...g,
        nao_realizadas,
        indicador: g.solicitadas > 0 ? (nao_realizadas / g.solicitadas) * 100 : 0
      };
    }).sort((a, b) => b.indicador - a.indicador); // Ordenação: Decrescente pelo Indicador (%)
  })();

  // 4. Pagination
  const totalPages = Math.ceil(groupedResults.length / pageSize);
  const paginatedResults = groupedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Conditional Formatting Helper
  const getRowStyle = (indicador: number) => {
    if (indicador >= 0.50) return "bg-[#14532d] text-white font-bold"; // Acima de 0,50% (Verde Escuro + Negrito)
    if (indicador >= 0.41) return "bg-[#a16207] text-black"; // 0,41% a 0,49% (Amarelo Escuro)
    return "bg-[#7f1d1d] text-white"; // 0,00% a 0,40% (Vermelho Escuro)
  };

  // 6. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = ["MES", "ANO"];
    if (activeTab !== 'ul') tableColumn.push("RAZÃO");
    if (activeTab === 'ul') tableColumn.push("UL");
    if (activeTab === 'matr') tableColumn.push("MATRÍCULA");
    tableColumn.push("SOLICITADAS", "REALIZADAS", "N-REALIZADAS", "INDICADOR");
    
    const tableRows = groupedResults.map(r => {
      const row = [r.mes, r.ano];
      if (activeTab !== 'ul') row.push(r.razao);
      if (activeTab === 'ul') row.push(r.ul);
      if (activeTab === 'matr') row.push(r.matr);
      row.push(r.solicitadas, r.realizadas, r.nao_realizadas);
      row.push(`${(r.indicador).toFixed(2).replace('.', ',')}%`);
      return row;
    });

    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text("SAL - Controle de Evidências", 14, 15);
    
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
        if (data.section === 'body') {
          const row = groupedResults[data.row.index];
          const ind = row.indicador;
          if (ind >= 0.50) {
            data.cell.styles.fillColor = [20, 83, 45]; // Verde Escuro
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'bold';
          } else if (ind >= 0.41) {
            data.cell.styles.fillColor = [161, 98, 7]; // Amarelo Escuro
            data.cell.styles.textColor = [0, 0, 0];
          } else {
            data.cell.styles.fillColor = [127, 29, 29]; // Vermelho Escuro
            data.cell.styles.textColor = [255, 255, 255];
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
        `SAL: Sistema de Análise de Leitura © 2026 | Página ${i} de ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    doc.save(`SAL_Controle_Evidencias_${activeTab}_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const exportData = groupedResults.map(r => {
      const row: any = {
        "MES": r.mes,
        "ANO": r.ano,
      };
      if (activeTab !== 'ul') row["RAZÃO"] = r.razao;
      if (activeTab === 'ul') row["UL"] = r.ul;
      if (activeTab === 'matr') row["MATRÍCULA"] = r.matr;
      row["SOLICITADAS"] = r.solicitadas;
      row["REALIZADAS"] = r.realizadas;
      row["N-REALIZADAS"] = r.nao_realizadas;
      row["INDICADOR"] = `${(r.indicador).toFixed(2).replace('.', ',')}%`;
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evidencias");
    XLSX.writeFile(workbook, `SAL_Controle_Evidencias_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  // 7. Chart Logic
  const getChartData = () => {
    const grouped: { [key: string]: { 
      n_realizadas: number, 
      solicitadas: number, 
      realizadas: number, 
      razao: string | number,
      matr: string
    } } = {};
    
    results.forEach(r => {
      let key = '';
      if (activeChartTab === 'mes') key = r.mes;
      else if (activeChartTab === 'ano') key = String(r.ano);
      else if (activeChartTab === 'matricula') key = r.matr;

      if (!grouped[key]) {
        grouped[key] = { 
          n_realizadas: 0, 
          solicitadas: 0, 
          realizadas: 0, 
          razao: r.razao,
          matr: r.matr
        };
      }
      grouped[key].solicitadas += Number(r.solicitadas || 0);
      grouped[key].realizadas += Number(r.realizadas || 0);
    });

    const categories = Object.keys(grouped)
      .sort((a, b) => (grouped[b].solicitadas - grouped[b].realizadas) - (grouped[a].solicitadas - grouped[a].realizadas));
    
    const data = categories.map(cat => grouped[cat].solicitadas - grouped[cat].realizadas);
    const meta = categories.map(cat => {
      const n_realizadas = grouped[cat].solicitadas - grouped[cat].realizadas;
      return {
        ...grouped[cat],
        n_realizadas
      };
    });

    return { categories, data, meta };
  };

  const chartData = getChartData();

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif'
    },
    grid: { 
      show: false,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: false } }
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
      formatter: (val: number) => `${val}`,
      offsetY: -20,
      style: { fontSize: '10px', colors: ['#3f3f46'] }
    },
    xaxis: {
      categories: chartData.categories,
      labels: { rotate: -45, style: { fontSize: '10px' } }
    },
    yaxis: { 
      title: { text: 'N-Realizadas' }
    },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: (val, { seriesIndex, dataPointIndex, w }) => {
          const item = chartData.meta[dataPointIndex];
          const ind = item.solicitadas > 0 ? (item.n_realizadas / item.solicitadas) * 100 : 0;
          return `Razão: ${item.razao}<br/>Solicitadas: ${item.solicitadas}<br/>Realizadas: ${item.realizadas}<br/>N-Realizadas: ${item.n_realizadas}<br/>Indicador: ${ind.toFixed(2).replace('.', ',')}%`;
        }
      }
    },
    colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  };

  const chartSeries = [{
    name: 'N-Realizadas',
    data: chartData.data
  }];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Controle de Evidências</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise de Quantidade de evidências</p>
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
          {/* Table Section */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-500" />
                  Relação Quantitativa de Evidências
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
                    onClick={() => { setActiveTab('matr'); setCurrentPage(1); }}
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all",
                      activeTab === 'matr' ? "bg-blue-50 text-blue-600" : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    Por Matr
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
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                    {activeTab !== 'ul' && <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>}
                    {activeTab === 'ul' && <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL</th>}
                    {activeTab === 'matr' && <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>}
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Solicitadas</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Realizadas</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">N-Realizadas</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Indicador (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r, i) => (
                    <tr key={i} className={cn("hover:opacity-90 transition-all", getRowStyle(r.indicador))}>
                      <td className="px-4 py-3 text-xs">{r.mes}</td>
                      <td className="px-4 py-3 text-xs">{r.ano}</td>
                      {activeTab !== 'ul' && <td className="px-4 py-3 text-xs">{r.razao}</td>}
                      {activeTab === 'ul' && <td className="px-4 py-3 text-xs">{r.ul}</td>}
                      {activeTab === 'matr' && <td className="px-4 py-3 text-xs font-medium">{r.matr}</td>}
                      <td className="px-4 py-3 text-xs">{r.solicitadas}</td>
                      <td className="px-4 py-3 text-xs">{r.realizadas}</td>
                      <td className="px-4 py-3 text-xs">{r.nao_realizadas}</td>
                      <td className="px-4 py-3 text-xs">{(r.indicador).toFixed(2).replace('.', ',')}%</td>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Relação Gráfica de Quantitativo de Evidências</h3>
              </div>
              <div className="flex items-center gap-2 bg-zinc-50 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveChartTab('mes')}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    activeChartTab === 'mes' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Mês
                </button>
                <button 
                  onClick={() => setActiveChartTab('ano')}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    activeChartTab === 'ano' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Ano
                </button>
                <button 
                  onClick={() => setActiveChartTab('matricula')}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    activeChartTab === 'matricula' ? "bg-white text-blue-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Matrícula
                </button>
              </div>
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
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">SAL: Sistema de Análise de Leitura © 2026</p>
            <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{new Date().toLocaleString('pt-BR')}</p>
          </div>
        </motion.div>
      )}

      {!loading && !hasGenerated && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[32px] border border-zinc-100 shadow-sm">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500 mb-2">
            <Camera className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Aguardando novos parâmetros de busca</h2>
          <p className="text-zinc-500 max-w-xs">Selecione os filtros acima e clique em Gerar para visualizar o controle de evidências.</p>
        </div>
      )}
    </div>
  );
}
