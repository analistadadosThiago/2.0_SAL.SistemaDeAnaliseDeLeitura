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
  Clock,
  RotateCcw,
  BarChart3
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ControleHorarioData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function ControleHorario() {
  const [loading, setLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter Options
  const [options, setOptions] = useState<{
    anos: string[];
    meses: string[];
    matriculas: string[];
  }>({
    anos: [],
    meses: [],
    matriculas: []
  });

  // Selected Filters
  const [ano, setAno] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [matr, setMatr] = useState<string | null>(null);
  const [dataSel, setDataSel] = useState<string>('');

  // Data State
  const [results, setResults] = useState<ControleHorarioData[]>([]);
  const [activeTab, setActiveTab] = useState<'matricula' | 'mes'>('matricula');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Helper functions for time
  const timeToMinutes = (time: string) => {
    if (!time || !time.includes(':')) return 0;
    const [h, m] = time.split(':').map(Number);
    return (h * 60) + (m || 0);
  };

  const minutesToTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    try {
      const { data: filtersData, error: filtersError } = await supabase.rpc('get_filtros_horario');

      if (filtersError) {
        console.error('Erro ao buscar filtros de horário:', filtersError);
        setOptions({ anos: [], meses: [], matriculas: [] });
      } else {
        const anos = (filtersData || [])
          .filter((f: any) => f.coluna === 'ano')
          .map((f: any) => String(f.valor))
          .sort((a: string, b: string) => Number(b) - Number(a));
        
        const meses = (filtersData || [])
          .filter((f: any) => f.coluna === 'mes')
          .map((f: any) => String(f.valor));

        const matriculas = (filtersData || [])
          .filter((f: any) => f.coluna === 'matr')
          .map((f: any) => String(f.valor))
          .sort();

        setOptions({ anos, meses, matriculas });
        
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
          .rpc('get_controle_horario', {
            p_ano: String(ano || ""),
            p_mes: String(mes || ""),
            p_matr: String(matr || ""),
            p_data: String(dataSel || "")
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

      // Ensure strings with robust fallbacks
      const mappedData = allData.map((r: any) => {
        const horaInicial = String(r.f_hora_inicial || "");
        const horaFinal = String(r.f_hora_final || "");
        
        // Use RPC fields if available, otherwise fallback
        let tempoServicoFormatado = String(r.f_tempo_servico_formatado || "");
        if (tempoServicoFormatado === "" && r.f_tempo_servico) {
          tempoServicoFormatado = String(r.f_tempo_servico);
        }

        // Visual logic for single reading
        if (horaInicial === horaFinal && horaInicial !== "" && horaInicial !== "00:00") {
          tempoServicoFormatado = "Leitura Única";
        } else if (tempoServicoFormatado === "" || tempoServicoFormatado === "0") {
          tempoServicoFormatado = "00:00";
        }

        return {
          f_matricula: String(r.f_matricula || ""),
          f_data: String(r.f_data || ""),
          f_hora_inicial: horaInicial,
          f_hora_final: horaFinal,
          f_tempo_servico: String(r.f_tempo_servico || ""),
          f_tempo_servico_formatado: tempoServicoFormatado,
          f_media_leitura_hora: String(r.f_media_leitura_hora || "0"),
          f_media_leitura_hora_inteiro: Number(r.f_media_leitura_hora_inteiro || Math.round(Number(r.f_media_leitura_hora || 0)))
        };
      });

      setResults(mappedData);
      setHasGenerated(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAno(options.anos[0] || null);
    setMes(options.meses[0] || null);
    setMatr(null);
    setDataSel('');
    setResults([]);
    setHasGenerated(false);
    setError(null);
    setCurrentPage(1);
  };

  // 3. Grouping Logic
  const groupedByMes = useMemo(() => {
    const grouped: { [key: string]: { matricula: string, mes: string, tempoServicoMin: number, atividade: number } } = {};
    results.forEach(r => {
      // Extract month from f_data (assuming format DD/MM/YYYY or YYYY-MM-DD)
      // If f_data is DD/MM/YYYY
      const parts = r.f_data.split('/');
      const month = parts.length === 3 ? `${parts[1]}/${parts[2]}` : r.f_data;
      
      const key = `${r.f_matricula}_${month}`;
      if (!grouped[key]) {
        grouped[key] = { matricula: r.f_matricula, mes: month, tempoServicoMin: 0, atividade: 0 };
      }
      
      // Only sum if it's not "Leitura Única"
      if (r.f_tempo_servico_formatado !== "Leitura Única") {
        grouped[key].tempoServicoMin += timeToMinutes(r.f_tempo_servico_formatado);
      }
      grouped[key].atividade += r.f_media_leitura_hora_inteiro;
    });
    return Object.values(grouped).sort((a, b) => a.matricula.localeCompare(b.matricula) || a.mes.localeCompare(b.mes));
  }, [results]);

  // 4. Totals for Footer
  const totals = useMemo(() => {
    let totalMin = 0;
    let totalAtividade = 0;
    results.forEach(r => {
      if (r.f_tempo_servico_formatado !== "Leitura Única") {
        totalMin += timeToMinutes(r.f_tempo_servico_formatado);
      }
      totalAtividade += r.f_media_leitura_hora_inteiro;
    });
    return {
      tempoServico: `${minutesToTime(totalMin)}h`,
      atividade: totalAtividade
    };
  }, [results]);

  // 5. Chart Logic
  const chartData = useMemo(() => {
    const totalsByMatr: { [key: string]: number } = {};
    results.forEach(r => {
      totalsByMatr[r.f_matricula] = (totalsByMatr[r.f_matricula] || 0) + r.f_media_leitura_hora_inteiro;
    });

    const sorted = Object.entries(totalsByMatr)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      categories: sorted.map(i => i.name),
      series: [{ name: 'Tempo Atividade / Leitura', data: sorted.map(i => i.total) }]
    };
  }, [results]);

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
        const matr = w.globals.labels[dataPointIndex];
        // Find the first record for this matricula to show in tooltip as example or summary
        const firstRecord = results.find(r => r.f_matricula === matr);
        
        return `
          <div class="p-3 bg-white border border-zinc-200 shadow-xl rounded-xl">
            <div class="text-xs font-black text-zinc-400 uppercase tracking-wider mb-2">${matr}</div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-4">
                <span class="text-xs font-bold text-zinc-600">Total Atividade</span>
                <span class="text-xs font-black text-blue-600">${series[seriesIndex][dataPointIndex]}</span>
              </div>
              ${firstRecord ? `
                <div class="pt-1.5 mt-1.5 border-t border-zinc-100 space-y-1">
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-xs font-medium text-zinc-500">Hora Inicial</span>
                    <span class="text-xs font-bold text-zinc-700">${firstRecord.f_hora_inicial}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-xs font-medium text-zinc-500">Hora Final</span>
                    <span class="text-xs font-bold text-zinc-700">${firstRecord.f_hora_final}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-xs font-medium text-zinc-500">Tempo Serviço</span>
                    <span class="text-xs font-bold text-zinc-700">${firstRecord.f_tempo_servico_formatado}</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
    },
    colors: ['#3b82f6']
  };

  // 6. Pagination
  const currentResults = activeTab === 'matricula' ? results : groupedByMes;
  const totalPages = Math.ceil(currentResults.length / pageSize);
  const paginatedResults = currentResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 7. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    let tableColumn: string[] = [];
    let tableRows: any[] = [];

    if (activeTab === 'matricula') {
      tableColumn = ["MATRÍCULA", "DATA", "HORA INICIAL", "HORA FINAL", "TEMPO DE SERVIÇO", "TEMPO ATIVIDADE / LEITURA"];
      tableRows = results.map(r => [
        r.f_matricula, r.f_data, r.f_hora_inicial, r.f_hora_final, r.f_tempo_servico_formatado, r.f_media_leitura_hora_inteiro
      ]);
    } else {
      tableColumn = ["MATRÍCULA", "MÊS", "TEMPO DE SERVIÇO (SOMA)", "TEMPO ATIVIDADE / LEITURA (SOMA)"];
      tableRows = groupedByMes.map(r => [
        r.matricula, r.mes, minutesToTime(r.tempoServicoMin), r.atividade
      ]);
    }

    doc.setFontSize(18);
    doc.text(`SAL - Relatório de Horário`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`SAL_Relatorio_Horario_${activeTab}_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const dataToExport = activeTab === 'matricula' ? results : groupedByMes.map(r => ({
      Matricula: r.matricula,
      Mes: r.mes,
      TempoServico: minutesToTime(r.tempoServicoMin),
      Atividade: r.atividade
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, `SAL_Relatorio_Horario_${activeTab}_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Relatório de Horário</h1>
          <p className="text-zinc-500 text-sm mt-1">Monitoramento de jornada e produtividade dos leituristas</p>
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
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Data</span>
            <input 
              type="date"
              value={dataSel}
              onChange={(e) => setDataSel(e.target.value)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 transition-all"
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

          <button 
            onClick={handleReset}
            disabled={loading}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 mt-auto h-[46px]"
          >
            <RotateCcw className="w-5 h-5" />
            <span>Nova Pesquisa</span>
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
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Relatório de Horário</h3>
                </div>

                <div className="flex items-center px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                    Base Total: {results.length} registros
                  </span>
                </div>

                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  {(['matricula', 'mes'] as const).map((tab) => (
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
                      {tab === 'matricula' ? 'Por Matrícula' : 'Por Mês'}
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
                    {activeTab === 'matricula' ? (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Data</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Hora Inicial</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Hora Final</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Tempo de Serviço</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Tempo Atividade / Leitura</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Tempo de Serviço (Soma)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Tempo Atividade / Leitura (Soma)</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r: any, i) => (
                    <tr key={i} className="hover:bg-zinc-50 transition-colors">
                      {activeTab === 'matricula' ? (
                        <>
                          <td className="px-6 py-4 text-sm text-zinc-700 font-bold">{r.f_matricula}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.f_data}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.f_hora_inicial}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.f_hora_final}</td>
                          <td className="px-6 py-4 text-sm font-black text-blue-600">{r.f_tempo_servico_formatado}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.f_media_leitura_hora_inteiro}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-zinc-700 font-bold">{r.matricula}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.mes}</td>
                          <td className="px-6 py-4 text-sm font-black text-blue-600">{minutesToTime(r.tempoServicoMin)}</td>
                          <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{r.atividade}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {activeTab === 'matricula' && (
                  <tfoot className="bg-zinc-50/80 font-bold">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-right text-xs text-zinc-500 uppercase tracking-wider">Totais Acumulados:</td>
                      <td className="px-6 py-4 text-sm text-blue-700 font-black">{totals.tempoServico}</td>
                      <td className="px-6 py-4 text-sm text-zinc-900 font-black">{totals.atividade}</td>
                    </tr>
                  </tfoot>
                )}
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
            <div className="flex items-center gap-2 mb-8">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Análise de Atividade por Matrícula</h3>
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
          <p className="text-zinc-500 max-w-xs">Preencha os filtros acima e clique em Gerar para visualizar os dados de controle de horário.</p>
        </div>
      )}
    </div>
  );
}
