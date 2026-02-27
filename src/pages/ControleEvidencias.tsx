import { useState, useEffect, useCallback, useMemo } from 'react';
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
  BarChart3,
  Filter
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
  const pageSize = 10;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    try {
      // Using a general filter RPC if available, or fallback to distinct selects
      const { data: filtersData, error: filtersError } = await supabase.rpc('get_filtros_geral');
      
      if (filtersError) {
        // Fallback to individual calls if get_filtros_geral doesn't exist
        const { data: anosData } = await supabase.rpc('dashboard_getanos');
        const { data: mesesData } = await supabase.rpc('dashboard_getmeses');
        const { data: matrData } = await supabase.rpc('get_lista_matriculas');

        const anos = (anosData || []).map((item: any) => typeof item === 'object' ? item.ano : item).sort((a: number, b: number) => b - a);
        const meses = (mesesData || []).map((item: any) => typeof item === 'object' ? item.mes : item);
        const matriculas = (matrData || []).map((item: any) => typeof item === 'object' ? item.matr : item).sort();

        setOptions({ anos, meses, matriculas });
        if (anos.length > 0) setAno(Number(anos[0]));
        if (meses.length > 0) setMes(String(meses[0]));
      } else {
        const anos = (filtersData?.anos || []).map((item: any) => typeof item === 'object' ? item.ano : item).sort((a: number, b: number) => b - a);
        const meses = (filtersData?.meses || []).map((item: any) => typeof item === 'object' ? item.mes : item);
        const matriculas = (filtersData?.matriculas || []).map((item: any) => typeof item === 'object' ? item.matr : item).sort();

        setOptions({ anos, meses, matriculas });
        if (anos.length > 0) setAno(Number(anos[0]));
        if (meses.length > 0) setMes(String(meses[0]));
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
        p_matr: matr || '',
        p_ul_de: ulDe ? Number(ulDe) : null,
        p_ul_para: ulPara ? Number(ulPara) : null
      });

      if (rpcError) throw rpcError;

      if (!data || data.length === 0) {
        setError('Nenhum dado encontrado para os filtros informados.');
        return;
      }

      // Process data to ensure rule: N-Realizadas = Solicitadas - Realizadas
      const processedData = (data || []).map((item: any) => {
        const solicitadas = Number(item.v_solicitadas || 0);
        const realizadas = Number(item.v_realizadas || 0);
        const nao_realizadas = solicitadas - realizadas;
        const indicador = solicitadas > 0 ? (realizadas / solicitadas) * 100 : 0;

        return {
          ...item,
          v_solicitadas: solicitadas,
          v_realizadas: realizadas,
          v_nao_realizadas: nao_realizadas,
          v_indicador: indicador
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

  // 3. Grouping Logic
  const groupedByRazao = useMemo(() => {
    const grouped: { [key: string]: any } = {};

    results.forEach(r => {
      const key = String(r.v_razao);
      if (!grouped[key]) {
        grouped[key] = {
          v_mes: r.v_mes,
          v_ano: r.v_ano,
          v_razao: r.v_razao,
          v_solicitadas: 0,
          v_realizadas: 0,
          v_nao_realizadas: 0,
          v_indicador: 0
        };
      }
      grouped[key].v_solicitadas += r.v_solicitadas;
      grouped[key].v_realizadas += r.v_realizadas;
      grouped[key].v_nao_realizadas += r.v_nao_realizadas;
    });

    return Object.values(grouped).map(g => ({
      ...g,
      v_indicador: g.v_solicitadas > 0 ? (g.v_realizadas / g.v_solicitadas) * 100 : 0
    })).sort((a, b) => b.v_indicador - a.v_indicador);
  }, [results]);

  const groupedByMatricula = useMemo(() => {
    const grouped: { [key: string]: any } = {};

    results.forEach(r => {
      const key = `${r.v_matr}_${r.v_razao}`;
      if (!grouped[key]) {
        grouped[key] = {
          v_mes: r.v_mes,
          v_ano: r.v_ano,
          v_razao: r.v_razao,
          v_matr: r.v_matr,
          v_solicitadas: 0,
          v_realizadas: 0,
          v_nao_realizadas: 0,
          v_indicador: 0
        };
      }
      grouped[key].v_solicitadas += r.v_solicitadas;
      grouped[key].v_realizadas += r.v_realizadas;
      grouped[key].v_nao_realizadas += r.v_nao_realizadas;
    });

    return Object.values(grouped).map(g => ({
      ...g,
      v_indicador: g.v_solicitadas > 0 ? (g.v_realizadas / g.v_solicitadas) * 100 : 0
    })).sort((a, b) => b.v_indicador - a.v_indicador);
  }, [results]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => (b.v_indicador || 0) - (a.v_indicador || 0));
  }, [results]);

  const displayData = useMemo(() => {
    if (activeTab === 'ul') return sortedResults;
    if (activeTab === 'razao') return groupedByRazao;
    return groupedByMatricula;
  }, [activeTab, sortedResults, groupedByRazao, groupedByMatricula]);

  // 4. Pagination
  const totalPages = Math.ceil(displayData.length / pageSize);
  const paginatedResults = displayData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Formatting Helpers
  const getRowStyle = (indicador: number) => {
    if (indicador >= 50.00) return "bg-[#14532d] text-white font-bold"; // 50,00% ou mais (Verde Escuro + Negrito)
    if (indicador >= 41.00) return "bg-[#a16207] text-white"; // 41,00% a 49,99% (Amarelo Escuro)
    return "bg-[#7f1d1d] text-white"; // 0,00% a 40,99% (Vermelho)
  };

  const formatPercent = (val: number) => {
    return val.toFixed(2).replace('.', ',') + '%';
  };

  // 6. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = ["MÊS", "ANO", "RAZÃO"];
    if (activeTab === 'ul') tableColumn.push("UL");
    if (activeTab === 'matr') tableColumn.push("MATRÍCULA");
    tableColumn.push("SOLICITADAS", "REALIZADAS", "N-REALIZADAS", "INDICADOR (%)");
    
    const tableRows = displayData.map(r => {
      const row = [r.v_mes, r.v_ano, r.v_razao];
      if (activeTab === 'ul') row.push(r.v_ul);
      if (activeTab === 'matr') row.push(r.v_matr);
      row.push(r.v_solicitadas, r.v_realizadas, r.v_nao_realizadas, formatPercent(r.v_indicador || 0));
      return row;
    });

    doc.setFontSize(18);
    doc.text("SAL - Relatório Quantitativo de Evidências", 14, 15);
    doc.setFontSize(10);
    doc.text(`Relatório: Por ${activeTab.toUpperCase()} | Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const row = displayData[data.row.index];
          const ind = row.v_indicador || 0;
          if (ind >= 50.00) {
            data.cell.styles.fillColor = [20, 83, 45];
            data.cell.styles.textColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'bold';
          } else if (ind >= 41.00) {
            data.cell.styles.fillColor = [161, 98, 7];
            data.cell.styles.textColor = [255, 255, 255];
          } else {
            data.cell.styles.fillColor = [127, 29, 29];
            data.cell.styles.textColor = [255, 255, 255];
          }
        }
      }
    });

    doc.save(`SAL_Evidencias_${activeTab}_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const exportData = displayData.map(r => {
      const row: any = {
        "MÊS": r.v_mes,
        "ANO": r.v_ano,
        "RAZÃO": r.v_razao,
      };
      if (activeTab === 'ul') row["UL"] = r.v_ul;
      if (activeTab === 'matr') row["MATRÍCULA"] = r.v_matr;
      row["SOLICITADAS"] = r.v_solicitadas;
      row["REALIZADAS"] = r.v_realizadas;
      row["N-REALIZADAS"] = r.v_nao_realizadas;
      row["INDICADOR (%)"] = formatPercent(r.v_indicador || 0);
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Evidencias");
    XLSX.writeFile(workbook, `SAL_Evidencias_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  // 7. Chart Data
  const chartData = useMemo(() => {
    const grouped: { [key: string]: { sol: number, real: number, nreal: number, ind: number } } = {};
    
    results.forEach(r => {
      let key = '';
      if (activeChartTab === 'mes') key = r.v_mes;
      else if (activeChartTab === 'ano') key = String(r.v_ano);
      else if (activeChartTab === 'matricula') key = r.v_matr;

      if (!grouped[key]) grouped[key] = { sol: 0, real: 0, nreal: 0, ind: 0 };
      grouped[key].sol += r.v_solicitadas;
      grouped[key].real += r.v_realizadas;
      grouped[key].nreal += r.v_nao_realizadas;
    });

    const categories = Object.keys(grouped).sort((a, b) => grouped[b].nreal - grouped[a].nreal);
    const nrealData = categories.map(c => {
      const item = grouped[c];
      const ind = item.sol > 0 ? (item.real / item.sol) * 100 : 0;
      
      let color = '#7f1d1d'; // Vermelho
      if (ind >= 50.00) color = '#14532d'; // Verde
      else if (ind >= 41.00) color = '#a16207'; // Amarelo

      return {
        x: c,
        y: item.nreal,
        fillColor: color,
        goals: [
          { name: 'Solicitadas', value: item.sol, strokeColor: '#3b82f6' },
          { name: 'Realizadas', value: item.real, strokeColor: '#10b981' },
          { name: 'Indicador', value: ind }
        ]
      };
    });

    return { categories, nrealData };
  }, [results, activeChartTab]);

  const chartOptions: ApexCharts.ApexOptions = {
    chart: { 
      type: 'bar', 
      toolbar: { show: false }, 
      fontFamily: 'Inter, sans-serif',
      animations: { enabled: false },
      sparkline: { enabled: false }
    },
    grid: { show: false },
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
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
      axisTicks: { show: false }
    },
    yaxis: { show: false },
    fill: { opacity: 1, type: 'solid' },
    tooltip: { 
      custom: ({ series, seriesIndex, dataPointIndex, w }) => {
        const item = w.config.series[seriesIndex].data[dataPointIndex];
        const goals = item.goals;
        const sol = goals.find((g: any) => g.name === 'Solicitadas').value;
        const real = goals.find((g: any) => g.name === 'Realizadas').value;
        const ind = goals.find((g: any) => g.name === 'Indicador').value;
        const nreal = item.y;
        
        return `
          <div class="bg-white border border-zinc-200 shadow-xl rounded-lg p-3">
            <div class="font-bold text-zinc-900 border-b border-zinc-100 pb-1 mb-2">${item.x}</div>
            <div class="space-y-1">
              <div class="flex justify-between gap-4 text-xs">
                <span class="text-zinc-500">Solicitadas:</span>
                <span class="font-bold text-zinc-900">${sol}</span>
              </div>
              <div class="flex justify-between gap-4 text-xs">
                <span class="text-zinc-500">Realizadas:</span>
                <span class="font-bold text-zinc-900">${real}</span>
              </div>
              <div class="flex justify-between gap-4 text-xs">
                <span class="text-zinc-500">Indicador:</span>
                <span class="font-bold text-blue-600">${formatPercent(ind)}</span>
              </div>
            </div>
          </div>
        `;
      }
    },
    legend: { show: false }
  };

  const chartSeries = [
    { name: 'N-Realizadas', data: chartData.nrealData }
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Controle de Evidências</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise detalhada de solicitações e realizações de evidências</p>
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
                  Relatório Quantitativo de Evidências
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
                    Por Matrícula
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
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
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
                    <tr key={i} className={cn("hover:opacity-90 transition-all", getRowStyle(r.v_indicador || 0))}>
                      <td className="px-4 py-3 text-xs">{r.v_mes}</td>
                      <td className="px-4 py-3 text-xs">{r.v_ano}</td>
                      <td className="px-4 py-3 text-xs">{r.v_razao}</td>
                      {activeTab === 'ul' && <td className="px-4 py-3 text-xs">{r.v_ul}</td>}
                      {activeTab === 'matr' && <td className="px-4 py-3 text-xs">{r.v_matr}</td>}
                      <td className="px-4 py-3 text-xs">{r.v_solicitadas}</td>
                      <td className="px-4 py-3 text-xs">{r.v_realizadas}</td>
                      <td className="px-4 py-3 text-xs">{r.v_nao_realizadas}</td>
                      <td className="px-4 py-3 text-xs">{formatPercent(r.v_indicador || 0)}</td>
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
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Gráfico Analítico de Evidências</h3>
              </div>
              <div className="flex items-center gap-2 bg-zinc-50 p-1 rounded-xl">
                {['mes', 'ano', 'matricula'].map((tab) => (
                  <button 
                    key={tab}
                    onClick={() => setActiveChartTab(tab as any)}
                    className={cn(
                      "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                      activeChartTab === tab ? "bg-white text-blue-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                    )}
                  >
                    {tab === 'mes' ? 'Mês' : tab === 'ano' ? 'Ano' : 'Matrícula'}
                  </button>
                ))}
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
        </motion.div>
      )}

      {!loading && !hasGenerated && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[32px] border border-zinc-100 shadow-sm">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500 mb-2">
            <Camera className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Aguardando parâmetros de busca</h2>
          <p className="text-zinc-500 max-w-xs">Preencha os filtros acima e clique em Gerar para visualizar os dados.</p>
        </div>
      )}
    </div>
  );
}
