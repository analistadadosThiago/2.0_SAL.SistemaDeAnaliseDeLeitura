import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertCircle, 
  Download, 
  FileSpreadsheet,
  Loader2, 
  Printer,
  Filter,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BarChart3,
  Table as TableIcon
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ApresentacaoData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface QuantitativeSummary {
  razao: string;
  motivo: string;
  quantidade: number;
}

export default function ControleApresentacao() {
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
  const [results, setResults] = useState<ApresentacaoData[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    try {
      const { data: filtersData, error: filtersError } = await supabase.rpc('get_filtros_apresentacao');

      if (filtersError) {
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
          .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));

        const matriculas = (filtersData || [])
          .filter((f: any) => f.coluna === 'matr')
          .map((f: any) => String(f.valor))
          .sort();

        const motivos = (filtersData || [])
          .filter((f: any) => f.coluna === 'cna')
          .map((f: any) => String(f.valor))
          .sort();

        setOptions({ anos, meses, razoes, matriculas, motivos });
        
        if (anos.length > 0) setAno(anos[0]);
      }
    } catch (e) {
      // Error handled silently as per optimization request
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
          .rpc('get_dados_apresentacao', {
            p_ano: String(ano || ''),
            p_mes: String(mes || ''),
            p_rz: String(razao || ''),
            p_matr: String(matr || ''),
            p_cna: String(motivo || '')
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

      setResults(allData);
      setHasGenerated(true);
    } catch (err: any) {
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setAno(options.anos[0] || null);
    setMes(null);
    setRazao(null);
    setMatr(null);
    setMotivo(null);
    setResults([]);
    setHasGenerated(false);
    setError(null);
    setCurrentPage(1);
  };

  // 3. Quantitative Summary Logic
  const quantitativeSummary = useMemo(() => {
    const summary: Record<string, QuantitativeSummary> = {};
    
    results.forEach(r => {
      const key = `${r.f_rz}-${r.f_motivo}`;
      if (!summary[key]) {
        summary[key] = {
          razao: r.f_rz,
          motivo: r.f_motivo,
          quantidade: 0
        };
      }
      summary[key].quantidade++;
    });

    return Object.values(summary).sort((a, b) => {
      if (a.razao !== b.razao) return a.razao.localeCompare(b.razao, undefined, { numeric: true });
      return a.motivo.localeCompare(b.motivo);
    });
  }, [results]);

  // 4. Pagination
  const totalPages = Math.ceil(results.length / pageSize);
  const paginatedResults = results.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    // Table 1
    const table1Column = ["MÊS", "ANO", "RAZÃO", "UL", "INSTALAÇÃO", "MEDIDOR", "REG", "MATR", "COD", "LEITURA", "MOTIVO"];
    const table1Rows = results.map(r => [
      r.f_mes, r.f_ano, r.f_rz, r.f_ul, r.f_instalacao, r.f_medidor, r.f_reg, r.f_matr, r.f_cod, r.f_leitura, r.f_motivo
    ]);

    doc.setFontSize(18);
    doc.text(`SAL - Controle de Apresentação`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [table1Column],
      body: table1Rows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    // Table 2
    const table2Column = ["RAZÃO", "NÃO IMPRESSÃO (MOTIVO)", "QUANTIDADE"];
    const table2Rows = quantitativeSummary.map(s => [s.razao, s.motivo, s.quantidade]);

    autoTable(doc, {
      head: [table2Column],
      body: table2Rows,
      startY: (doc as any).lastAutoTable.finalY + 15,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`SAL_Controle_Apresentacao_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    // Sheet 1: Detailed Data
    const detailedData = results.map(r => ({
      "MÊS": r.f_mes,
      "ANO": r.f_ano,
      "RAZÃO": r.f_rz,
      "UL": r.f_ul,
      "INSTALAÇÃO": r.f_instalacao,
      "MEDIDOR": r.f_medidor,
      "REG": r.f_reg,
      "MATR": r.f_matr,
      "COD": r.f_cod,
      "LEITURA": r.f_leitura,
      "MOTIVO": r.f_motivo
    }));
    const worksheet1 = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(workbook, worksheet1, "Dados Detalhados");

    // Sheet 2: Quantitative Summary
    const summaryData = quantitativeSummary.map(s => ({
      "RAZÃO": s.razao,
      "NÃO IMPRESSÃO (MOTIVO)": s.motivo,
      "QUANTIDADE": s.quantidade
    }));
    const worksheet2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, worksheet2, "Resumo Quantitativo");

    XLSX.writeFile(workbook, `SAL_Controle_Apresentacao_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Controle de Apresentação</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise de motivos de não impressão e apresentação de dados</p>
        </div>

        <div className="flex flex-wrap items-end gap-4 bg-white p-6 rounded-[32px] border border-zinc-200 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Ano</span>
            <select 
              value={ano || ''} 
              onChange={(e) => setAno(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 transition-all min-w-[100px]"
            >
              <option value="">Todos</option>
              {options.anos.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Mês</span>
            <select 
              value={mes || ''} 
              onChange={(e) => setMes(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 transition-all min-w-[120px]"
            >
              <option value="">Todos</option>
              {options.meses.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Razão</span>
            <select 
              value={razao || ''} 
              onChange={(e) => setRazao(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 min-w-[120px] transition-all"
            >
              <option value="">Todas</option>
              {options.razoes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Matrícula</span>
            <select 
              value={matr || ''} 
              onChange={(e) => setMatr(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 min-w-[140px] transition-all"
            >
              <option value="">Todas</option>
              {options.matriculas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Motivo</span>
            <select 
              value={motivo || ''} 
              onChange={(e) => setMotivo(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 min-w-[140px] transition-all"
            >
              <option value="">Todos</option>
              {options.motivos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={loading || loadingFilters}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50 disabled:shadow-none h-[46px] uppercase text-xs tracking-widest"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            <span>Gerar</span>
          </button>

          <button 
            onClick={handleReset}
            disabled={loading}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-black px-6 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 h-[46px] uppercase text-xs tracking-widest"
          >
            <RotateCcw className="w-4 h-4" />
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
            <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">Carregando dados...</p>
            <p className="text-blue-600 font-bold text-lg mt-2">{fetchProgress} registros encontrados</p>
          </div>
        </div>
      )}

      {!loading && hasGenerated && results.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* Table 1: Detailed Data */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                    <TableIcon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Relação de Dados Selecionados</h3>
                </div>

                <div className="flex items-center px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                    Total: {results.length} registros
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={exportToPDF} className="p-2.5 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors flex items-center gap-2 border border-transparent hover:border-zinc-200" title="Exportar PDF">
                  <Download className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">PDF</span>
                </button>
                <button onClick={exportToExcel} className="p-2.5 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors flex items-center gap-2 border border-transparent hover:border-zinc-200" title="Exportar Excel">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Excel</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Instalação</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Medidor</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Reg</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matr</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Cod</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leitura</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_mes}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_ano}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_rz}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_ul}</td>
                      <td className="px-4 py-3.5 text-xs text-blue-600 font-black">{r.f_instalacao}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_medidor}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_reg}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_matr}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_cod}</td>
                      <td className="px-4 py-3.5 text-xs text-zinc-900 font-black">{r.f_leitura}</td>
                      <td className="px-4 py-3.5 text-xs text-red-600 font-bold">{r.f_motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-6 bg-zinc-50/50 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Página {currentPage} de {totalPages}
              </span>
              
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:hover:border-zinc-200 disabled:hover:text-zinc-500 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = currentPage - 2 + i;
                    if (currentPage <= 2) pageNum = i + 1;
                    if (currentPage >= totalPages - 1) pageNum = totalPages - 4 + i;
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          "w-10 h-10 rounded-xl text-xs font-black transition-all",
                          currentPage === pageNum 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                            : "bg-white text-zinc-500 border border-zinc-200 hover:border-blue-200 hover:text-blue-600"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:hover:border-zinc-200 disabled:hover:text-zinc-500 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Table 2: Quantitative Summary */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex items-center gap-2">
              <div className="p-2 bg-emerald-50 rounded-xl text-emerald-500">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Relação Quantitativa</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Não Impressão (Motivo)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100 text-right">Quantidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {quantitativeSummary.map((s, i) => (
                    <tr key={i} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="px-6 py-4 text-sm text-zinc-900 font-bold">{s.razao}</td>
                      <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{s.motivo}</td>
                      <td className="px-6 py-4 text-sm text-blue-600 font-black text-right">{s.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50/80 font-black">
                    <td colSpan={2} className="px-6 py-4 text-sm text-zinc-900 uppercase tracking-wider">Total Geral</td>
                    <td className="px-6 py-4 text-sm text-blue-600 text-right">{results.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {!loading && !hasGenerated && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[48px] border border-zinc-100 shadow-sm">
          <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-500 mb-2">
            <Filter className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Aguardando Parâmetros</h2>
          <p className="text-zinc-500 max-w-sm font-medium">Preencha os filtros e clique em <span className="text-blue-600 font-bold">Gerar</span> para visualizar o controle de apresentação.</p>
        </div>
      )}
    </div>
  );
}
