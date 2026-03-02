import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  AlertCircle, 
  Download, 
  FileSpreadsheet,
  Loader2, 
  Database,
  Filter,
  TrendingUp,
  ListOrdered,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  XCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { SequenciaLeituraData } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function SequenciaLeitura() {
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
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [matr, setMatr] = useState<string | null>(null);
  const [ulDe, setUlDe] = useState<string>('');
  const [ulPara, setUlPara] = useState<string>('');

  // Data State
  const [results, setResults] = useState<SequenciaLeituraData[]>([]);
  const [filteredResults, setFilteredResults] = useState<SequenciaLeituraData[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const pageSize = 25;

  // 1. Fetch Filter Options
  const fetchFilterOptions = useCallback(async () => {
    setLoadingFilters(true);
    try {
      // Assuming a similar RPC exists or using a generic one if possible
      // If get_filtros_sequencia_leitura doesn't exist, we might need to handle it
      const { data: filtersData, error: filtersError } = await supabase.rpc('get_filtros_sequencia_leitura');

      if (filtersError) {
        console.error('Erro ao buscar filtros de sequência:', filtersError);
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
    if (!ano || !mesSel) {
      setError('Por favor, preencha os filtros obrigatórios (Ano e Mês).');
      return;
    }

    setError(null);
    setLoading(true);
    setHasGenerated(false);
    setResults([]);
    setCurrentPage(1);
    setFetchProgress(0);
    setHighlightedIndex(null);

    try {
      let allData: any[] = [];
      let start = 0;
      let end = 999;
      let hasMore = true;

      while (hasMore) {
        const { data, error: rpcError } = await supabase
          .rpc('get_sequencia_leitura', {
            p_ano: String(ano || ""),
            p_mes: String(mesSel || ""), // Changed to single month
            p_matr: String(matr || ""),
            p_ul_de: ulDe ? Number(ulDe) : null,
            p_ul_para: ulPara ? Number(ulPara) : null
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

      // Map and sort ascending by Data and Hora
      const mappedData: SequenciaLeituraData[] = allData.map((r: any) => ({
        f_mes: String(r.f_mes || ""),
        f_ano: String(r.f_ano || ""),
        f_rz: String(r.f_rz || ""),
        f_ul: String(r.f_ul || ""),
        f_instalacao: String(r.f_instalacao || ""),
        f_medidor: String(r.f_medidor || ""),
        f_reg: String(r.f_reg || ""),
        f_matr: String(r.f_matr || ""),
        f_data: String(r.f_data || ""),
        f_hora: String(r.f_hora || ""),
        f_endereco: String(r.f_endereco || ""),
        f_rz_ul_lv: String(r.f_rz_ul_lv || "") // Keep this at the end if not used in table
      })).sort((a, b) => {
        // Sort ascending by Data and Hora
        const dateA = a.f_data.split('/').reverse().join('-') + ' ' + a.f_hora;
        const dateB = b.f_data.split('/').reverse().join('-') + ' ' + b.f_hora;
        return dateA.localeCompare(dateB);
      });

      setResults(mappedData);
      setFilteredResults(null);
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
    setMesSel(null);
    setMatr(null);
    setUlDe('');
    setUlPara('');
    setResults([]);
    setFilteredResults(null);
    setHasGenerated(false);
    setError(null);
    setCurrentPage(1);
    setSearchTerm('');
  };

  // 3. Internal Search Logic
  const handleInternalSearch = () => {
    if (!searchTerm) {
      setFilteredResults(null);
      return;
    }
    
    const index = results.findIndex(r => 
      r.f_instalacao.toLowerCase().includes(searchTerm.toLowerCase()) || 
      r.f_medidor.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (index !== -1) {
      // Rule: Show found + 6 before + 6 after
      const start = Math.max(0, index - 6);
      const end = Math.min(results.length, index + 7);
      const context = results.slice(start, end);
      
      setFilteredResults(context);
      setCurrentPage(1);
      
      // Find the new index in the context for highlighting
      const newIndex = index - start;
      setHighlightedIndex(newIndex);
      
      setTimeout(() => setHighlightedIndex(null), 5000);
    } else {
      alert('Registro não encontrado na sequência atual.');
    }
  };

  const clearInternalSearch = () => {
    setSearchTerm('');
    setFilteredResults(null);
    setCurrentPage(1);
  };

  // 4. Pagination
  const activeData = filteredResults || results;
  const totalPages = Math.ceil(activeData.length / pageSize);
  const paginatedResults = activeData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Export Functions
  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const dataToExport = filteredResults || results;
    const tableColumn = ["MÊS", "ANO", "RAZÃO", "UL", "INSTALAÇÃO", "MEDIDOR", "REGISTRO", "MATR", "DATA", "HORA", "ENDEREÇO"];
    const tableRows = dataToExport.map(r => [
      r.f_mes, r.f_ano, r.f_rz, r.f_ul, r.f_instalacao, r.f_medidor, r.f_reg, r.f_matr, r.f_data, r.f_hora, r.f_endereco
    ]);

    doc.setFontSize(18);
    doc.text(`SAL - Sequência de Leitura`, 14, 15);
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

    doc.save(`SAL_Sequencia_Leitura_${new Date().getTime()}.pdf`);
  };

  const exportToExcel = () => {
    const dataToExport = filteredResults || results;
    const excelData = dataToExport.map(r => ({
      "MÊS": r.f_mes,
      "ANO": r.f_ano,
      "RAZÃO": r.f_rz,
      "UL": r.f_ul,
      "INSTALAÇÃO": r.f_instalacao,
      "MEDIDOR": r.f_medidor,
      "REGISTRO": r.f_reg,
      "MATR": r.f_matr,
      "DATA": r.f_data,
      "HORA": r.f_hora,
      "ENDEREÇO": r.f_endereco
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, `SAL_Sequencia_Leitura_${new Date().getTime()}.xlsx`);
  };

  const toggleMes = (m: string) => {
    setMesSel(prev => prev === m ? null : m);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Sequência de Leitura</h1>
          <p className="text-zinc-500 text-sm mt-1">Análise da ordem cronológica e geográfica das leituras realizadas</p>
        </div>

        <div className="flex flex-wrap items-end gap-4 bg-white p-6 rounded-[32px] border border-zinc-200 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Ano</span>
            <select 
              value={ano || ''} 
              onChange={(e) => setAno(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 transition-all min-w-[100px]"
            >
              <option value="">Selecione</option>
              {options.anos.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Mês</span>
            <select 
              value={mesSel || ''} 
              onChange={(e) => setMesSel(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 transition-all min-w-[120px]"
            >
              <option value="">Selecione</option>
              {options.meses.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">Matrícula</span>
            <select 
              value={matr || ''} 
              onChange={(e) => setMatr(e.target.value || null)}
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 min-w-[140px] transition-all"
            >
              <option value="">Selecione</option>
              {options.matriculas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">UL DE</span>
            <input 
              type="number"
              maxLength={8}
              value={ulDe}
              onChange={(e) => setUlDe(e.target.value.slice(0, 8))}
              placeholder="0"
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 w-24 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider ml-1">UL PARA</span>
            <input 
              type="number"
              maxLength={8}
              value={ulPara}
              onChange={(e) => setUlPara(e.target.value.slice(0, 8))}
              placeholder="99999999"
              className="text-sm border-zinc-200 focus:ring-blue-500 focus:border-blue-500 bg-zinc-50 rounded-xl px-4 py-2.5 font-bold text-zinc-700 w-24 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          <button 
            onClick={handleGenerate}
            disabled={loading || loadingFilters || !ano || !mesSel}
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
            <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">Carregando sequência...</p>
            <p className="text-blue-600 font-bold text-lg mt-2">{fetchProgress} registros encontrados</p>
          </div>
        </div>
      )}

      {!loading && hasGenerated && results.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                    <ListOrdered className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Sequência de Leitura</h3>
                </div>

                <div className="flex items-center px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                    {filteredResults ? `Mostrando contexto: ${filteredResults.length} registros` : `Base Total: ${results.length} registros`}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative group">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
                  <input 
                    type="text"
                    placeholder="Buscar Instalação ou Medidor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInternalSearch()}
                    className="pl-10 pr-10 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64 font-medium"
                  />
                  {searchTerm && (
                    <button 
                      onClick={clearInternalSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="h-8 w-px bg-zinc-100 mx-2 hidden md:block" />

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
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Registro</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matr</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Data</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Hora</th>
                    <th className="px-4 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Endereço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {paginatedResults.map((r, i) => {
                    const isHighlighted = highlightedIndex === i;
                    
                    return (
                      <tr 
                        key={i} 
                        className={cn(
                          "transition-all duration-500",
                          isHighlighted ? "bg-yellow-400 ring-2 ring-yellow-600 ring-inset" : "hover:bg-zinc-50/80"
                        )}
                      >
                        <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_mes}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_ano}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_rz}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_ul}</td>
                        <td className="px-4 py-3.5 text-xs text-blue-600 font-black">{r.f_instalacao}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-700 font-bold">{r.f_medidor}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_reg}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium">{r.f_matr}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-900 font-black">{r.f_data}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-900 font-black">{r.f_hora}</td>
                        <td className="px-4 py-3.5 text-xs text-zinc-600 font-medium max-w-[200px] truncate" title={r.f_endereco}>{r.f_endereco}</td>
                      </tr>
                    );
                  })}
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
        </motion.div>
      )}

      {!loading && !hasGenerated && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[48px] border border-zinc-100 shadow-sm">
          <div className="w-24 h-24 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-500 mb-2">
            <Filter className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Aguardando Parâmetros</h2>
          <p className="text-zinc-500 max-w-sm font-medium">Preencha os filtros obrigatórios e clique em <span className="text-blue-600 font-bold">Gerar</span> para visualizar a sequência de leitura.</p>
        </div>
      )}
    </div>
  );
}
