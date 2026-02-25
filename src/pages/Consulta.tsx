import { useState } from 'react';
import Chart from 'react-apexcharts';
import { 
  Search, 
  Loader2, 
  AlertCircle, 
  FileText, 
  BarChart3,
  Database,
  Info,
  TrendingUp,
  RefreshCcw,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { ConsultaLeitura } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Consulta() {
  const [loading, setLoading] = useState(false);
  const [instalacao, setInstalacao] = useState('');
  const [medidor, setMedidor] = useState('');
  const [results, setResults] = useState<ConsultaLeitura[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!instalacao.trim() && !medidor.trim()) {
      setError('Por favor, preencha ao menos um filtro (Instalação ou Medidor).');
      return;
    }

    setError(null);
    setLoading(true);
    setResults([]); // Clear previous results
    
    try {
      const { data, error: rpcError } = await supabase.rpc('consulta_leituras', {
        p_instalacao: instalacao.trim() ? Number(instalacao) : null,
        p_medidor: medidor.trim() || null
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
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setInstalacao('');
    setMedidor('');
    setResults([]);
    setError(null);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = [
      "Mês", "Ano", "UL", "Instalação", "Medidor", "Reg", 
      "Matr", "Cod", "Leitura", "Consumo", "Dig", "NOSB.IMP", "NOSB.SIM", "CNA"
    ];
    const tableRows = results.map(r => [
      r.mes, r.ano, r.ul, r.instalacao_res, r.medidor_res, r.reg,
      r.matr, r.cod, r.leitura, r.consumo, r.dig, r.nosb_imp, r.nosb_sim, r.cna
    ]);

    // Header
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text("SAL - Relatório de Consulta", 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { 
        fillColor: [30, 41, 59], // slate-800
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        7: { fontStyle: 'bold', textColor: [220, 38, 38] }, // COD column
        9: { fontStyle: 'bold', textColor: [37, 99, 235] }  // Consumo column
      }
    });

    // Footer
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

    doc.save(`SAL_Consulta_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(results.map(r => ({
      "Mês": r.mes,
      "Ano": r.ano,
      "UL": r.ul,
      "Instalação": r.instalacao_res,
      "Medidor": r.medidor_res,
      "Reg": r.reg,
      "Matr": r.matr,
      "Cod": r.cod,
      "Leitura": r.leitura,
      "Consumo": r.consumo,
      "Dig": r.dig,
      "NOSB.IMP": r.nosb_imp,
      "NOSB.SIM": r.nosb_sim,
      "CNA": r.cna
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituras");
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('pt-BR').replace(/:/g, '-');
    
    XLSX.writeFile(workbook, `SAL_Consulta_${dateStr}_${timeStr}.xlsx`);
  };

  // Calculate COD History
  const codHistory = results.reduce((acc: { [key: string]: number }, curr) => {
    const cod = curr.cod || 'N/A';
    acc[cod] = (acc[cod] || 0) + 1;
    return acc;
  }, {});

  const sortedCodHistory = (Object.entries(codHistory) as [string, number][])
    .sort((a, b) => b[1] - a[1]);

  // Chart Data
  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: 'line',
      toolbar: { show: false },
      fontFamily: 'Inter, sans-serif',
      zoom: { enabled: false },
      animations: { enabled: true }
    },
    stroke: {
      curve: 'smooth',
      width: 3,
      colors: ['#10b981']
    },
    colors: ['#10b981'],
    xaxis: {
      categories: results.map(r => `${r.mes}/${r.ano}`),
      labels: { style: { colors: '#71717a', fontSize: '10px' } }
    },
    yaxis: {
      labels: { 
        style: { colors: '#71717a' },
        formatter: (val) => val.toLocaleString()
      }
    },
    grid: {
      borderColor: '#f1f1f1',
      strokeDashArray: 4,
    },
    markers: {
      size: 4,
      colors: ['#10b981'],
      strokeColors: '#fff',
      strokeWidth: 2,
    },
    tooltip: {
      y: {
        formatter: (val) => `${val.toLocaleString()} unidades`
      }
    }
  };

  const chartSeries = [{
    name: 'Consumo',
    data: results.map(r => {
      const val = typeof r.consumo === 'string' 
        ? Number(r.consumo.replace(',', '.')) 
        : Number(r.consumo || 0);
      return isNaN(val) ? 0 : val;
    })
  }];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Consulta</h1>
          <p className="text-zinc-500 text-sm mt-1">Pesquisa detalhada de instalações e medidores.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Por Instalação</span>
            <input 
              type="text"
              value={instalacao}
              onChange={(e) => setInstalacao(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Ex: 123456"
              className="text-sm border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 w-40 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Por Medidor</span>
            <input 
              type="text"
              value={medidor}
              onChange={(e) => setMedidor(e.target.value)}
              placeholder="Ex: ABC12345"
              className="text-sm border-zinc-200 focus:ring-emerald-500 focus:border-emerald-500 bg-zinc-50 rounded-xl px-4 py-2 font-semibold text-zinc-700 w-48 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 mt-auto">
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50 disabled:shadow-none h-[46px]"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              <span>Pesquisar</span>
            </button>
            <button 
              onClick={handleReset}
              disabled={loading}
              className="bg-zinc-500 hover:bg-zinc-600 text-white font-bold px-4 py-3 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-zinc-100 active:scale-95 disabled:opacity-50 disabled:shadow-none h-[46px]"
            >
              <RefreshCcw className="w-5 h-5" />
              <span>Nova Consulta</span>
            </button>
          </div>
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
          <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
          <p className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">Carregando...</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* Export Buttons */}
          <div className="flex items-center gap-4">
            <button 
              onClick={exportToPDF}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Exportar PDF</span>
            </button>
            <button 
              onClick={exportToExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-[32px] border border-zinc-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-500" />
                Resultados da Pesquisa
              </h3>
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{results.length} registros encontrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50/50">
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Mês</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Ano</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">UL</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Instalação</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Medidor</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Reg</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matr</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Cod</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Leitura</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Consumo</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Dig</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">NOSB.IMP</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">NOSB.SIM</th>
                    <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">CNA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.mes}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.ano}</td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.ul}</td>
                      <td className="px-4 py-3 text-xs font-bold text-emerald-600">{r.instalacao_res}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.medidor_res}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.reg}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.matr}</td>
                      <td className="px-4 py-3 text-xs font-black text-red-600">{r.cod}</td>
                      <td className="px-4 py-3 text-xs font-bold text-zinc-900">{r.leitura?.toLocaleString() ?? '0'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-blue-600">{r.consumo?.toLocaleString() ?? '0'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.dig}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.nosb_imp}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.nosb_sim}</td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600">{r.cna}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary and Chart Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* COD History Table */}
            <div className="bg-white p-6 rounded-[32px] border border-zinc-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-red-50 rounded-xl text-red-500">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Histórico de COD</h3>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50">
                      <th className="px-4 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-wider">COD</th>
                      <th className="px-4 py-2 text-[10px] font-black text-zinc-400 uppercase tracking-wider text-right">QTD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {sortedCodHistory.map(([cod, qtd]) => (
                      <tr key={cod} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 py-2 text-xs font-black text-red-600">{cod}</td>
                        <td className="px-4 py-2 text-xs font-bold text-zinc-900 text-right">{qtd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Consumption Progression Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-[32px] border border-zinc-100 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-500">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Progressão de Consumo</h3>
              </div>
              <div className="h-[300px] w-full">
                <Chart 
                  options={chartOptions}
                  series={chartSeries}
                  type="line"
                  height="100%"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="h-[50vh] flex flex-col items-center justify-center text-center space-y-4 bg-white rounded-[32px] border border-zinc-100 shadow-sm">
          <div className="w-20 h-20 bg-zinc-50 rounded-3xl flex items-center justify-center text-zinc-300 mb-2">
            <Search className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Aguardando novos parâmetros de busca</h2>
          <p className="text-zinc-500 max-w-xs">Utilize os filtros acima para pesquisar por uma instalação ou medidor específico.</p>
        </div>
      )}
    </div>
  );
}
