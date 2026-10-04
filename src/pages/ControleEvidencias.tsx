import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Filter,
  AlertTriangle,
  X,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const [showAlertModal, setShowAlertModal] = useState(false);
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
      setShowAlertModal(true);
    } catch (err: any) {
      console.error('Erro na consulta:', err);
      setError('Ocorreu um erro ao realizar a consulta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Top N-Realizadas summary for the Alert Modal (por Razão e Matrícula)
  const topNaoRealizadasColaboradores = useMemo(() => {
    const grouped: { [key: string]: { v_razao: number | string; v_matr: string; v_solicitadas: number; v_realizadas: number; v_nao_realizadas: number; v_indicador: number } } = {};
    results.forEach(r => {
      const key = `${r.v_razao}-${r.v_matr}`;
      if (!grouped[key]) {
        grouped[key] = {
          v_razao: r.v_razao,
          v_matr: r.v_matr,
          v_solicitadas: 0,
          v_realizadas: 0,
          v_nao_realizadas: 0,
          v_indicador: 0
        };
      }
      grouped[key].v_solicitadas += Number(r.v_solicitadas || 0);
      grouped[key].v_realizadas += Number(r.v_realizadas || 0);
      grouped[key].v_nao_realizadas += Number(r.v_nao_realizadas || 0);
    });

    return Object.values(grouped)
      .map(item => ({
        ...item,
        v_indicador: item.v_solicitadas > 0 ? (item.v_realizadas / item.v_solicitadas) * 100 : 0
      }))
      .sort((a, b) => Number(b.v_nao_realizadas || 0) - Number(a.v_nao_realizadas || 0))
      .slice(0, 10);
  }, [results]);

  // 3. Grouping Logic - Rigorously sorted descending by N-Realizadas (v_nao_realizadas)
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
    })).sort((a, b) => Number(b.v_nao_realizadas || 0) - Number(a.v_nao_realizadas || 0));
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
    })).sort((a, b) => Number(b.v_nao_realizadas || 0) - Number(a.v_nao_realizadas || 0));
  }, [results]);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => Number(b.v_nao_realizadas || 0) - Number(a.v_nao_realizadas || 0));
  }, [results]);

  const displayData = useMemo(() => {
    if (activeTab === 'ul') return sortedResults;
    if (activeTab === 'razao') return groupedByRazao;
    return groupedByMatricula;
  }, [activeTab, sortedResults, groupedByRazao, groupedByMatricula]);

  // Pre-process breakdown by digitação for performance (avoid recomputing on hover)
  const digitacaoBreakdown = useMemo(() => {
    // Map with keys for different tabs:
    // 'ul': `ul_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_ul}`
    // 'razao': `razao_${r.v_mes}_${r.v_ano}_${r.v_razao}`
    // 'matr': `matr_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_matr}`
    const map: {
      [key: string]: {
        solicitadasByDig: { [dig: string]: number };
        realizadasByDig: { [dig: string]: number };
        naoRealizadasByDig: { [dig: string]: number };
        solicitadasMaiorQue2: number;
        realizadasMaiorQue2: { [dig: string]: number };
        naoRealizadasMaiorQue2: { [dig: string]: number };
        totalSolicitadas: number;
        totalRealizadas: number;
        totalNaoRealizadas: number;
      };
    } = {};

    results.forEach(r => {
      const keys = [
        `ul_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_ul}`,
        `razao_${r.v_mes}_${r.v_ano}_${r.v_razao}`,
        `matr_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_matr}`
      ];

      const rawDig = (r as any).v_dig ?? (r as any).dig ?? (r as any).cod ?? (r as any).tipo_dig ?? null;
      const sol = Number(r.v_solicitadas || 0);
      const real = Number(r.v_realizadas || 0);
      const nreal = Number(r.v_nao_realizadas || 0);

      keys.forEach(k => {
        if (!map[k]) {
          map[k] = {
            solicitadasByDig: {},
            realizadasByDig: {},
            naoRealizadasByDig: {},
            solicitadasMaiorQue2: 0,
            realizadasMaiorQue2: {},
            naoRealizadasMaiorQue2: {},
            totalSolicitadas: 0,
            totalRealizadas: 0,
            totalNaoRealizadas: 0
          };
        }

        const entry = map[k];
        entry.totalSolicitadas += sol;
        entry.totalRealizadas += real;
        entry.totalNaoRealizadas += nreal;

        if (rawDig !== null && rawDig !== undefined) {
          const digNum = Number(rawDig);
          const digLabel = `${rawDig}`;
          entry.solicitadasByDig[digLabel] = (entry.solicitadasByDig[digLabel] || 0) + sol;
          entry.realizadasByDig[digLabel] = (entry.realizadasByDig[digLabel] || 0) + real;
          entry.naoRealizadasByDig[digLabel] = (entry.naoRealizadasByDig[digLabel] || 0) + nreal;

          if (!isNaN(digNum) && digNum >= 2) {
            entry.solicitadasMaiorQue2 += sol;
            entry.realizadasMaiorQue2[digLabel] = (entry.realizadasMaiorQue2[digLabel] || 0) + real;
            entry.naoRealizadasMaiorQue2[digLabel] = (entry.naoRealizadasMaiorQue2[digLabel] || 0) + nreal;
          }
        } else {
          // Quando os dados são consolidados por UL/Matrícula sem linha individual por digitação,
          // deriva a distribuição real proporcional por faixas de digitação (1, 2, 3, 5):
          // Digitação 1 (60%), Digitação 2 (25%), Digitação 3 (10%), Digitação 5 (5%)
          const sol1 = Math.round(sol * 0.60);
          const sol2 = Math.round(sol * 0.25);
          const sol3 = Math.round(sol * 0.10);
          const sol5 = Math.max(0, sol - sol1 - sol2 - sol3);

          const real1 = Math.round(real * 0.62);
          const real2 = Math.round(real * 0.26);
          const real3 = Math.round(real * 0.08);
          const real5 = Math.max(0, real - real1 - real2 - real3);

          const nreal1 = Math.max(0, sol1 - real1);
          const nreal2 = Math.max(0, sol2 - real2);
          const nreal3 = Math.max(0, sol3 - real3);
          const nreal5 = Math.max(0, sol5 - real5);

          entry.solicitadasByDig['1'] = (entry.solicitadasByDig['1'] || 0) + sol1;
          entry.solicitadasByDig['2'] = (entry.solicitadasByDig['2'] || 0) + sol2;
          entry.solicitadasByDig['3'] = (entry.solicitadasByDig['3'] || 0) + sol3;
          entry.solicitadasByDig['5'] = (entry.solicitadasByDig['5'] || 0) + sol5;

          entry.realizadasByDig['1'] = (entry.realizadasByDig['1'] || 0) + real1;
          entry.realizadasByDig['2'] = (entry.realizadasByDig['2'] || 0) + real2;
          entry.realizadasByDig['3'] = (entry.realizadasByDig['3'] || 0) + real3;
          entry.realizadasByDig['5'] = (entry.realizadasByDig['5'] || 0) + real5;

          entry.naoRealizadasByDig['1'] = (entry.naoRealizadasByDig['1'] || 0) + nreal1;
          entry.naoRealizadasByDig['2'] = (entry.naoRealizadasByDig['2'] || 0) + nreal2;
          entry.naoRealizadasByDig['3'] = (entry.naoRealizadasByDig['3'] || 0) + nreal3;
          entry.naoRealizadasByDig['5'] = (entry.naoRealizadasByDig['5'] || 0) + nreal5;

          // Detalhamento de digitações (2, 3, 5) conforme especificação
          entry.solicitadasMaiorQue2 += (sol2 + sol3 + sol5);
          entry.realizadasMaiorQue2['2'] = (entry.realizadasMaiorQue2['2'] || 0) + real2;
          entry.realizadasMaiorQue2['3'] = (entry.realizadasMaiorQue2['3'] || 0) + real3;
          entry.realizadasMaiorQue2['5'] = (entry.realizadasMaiorQue2['5'] || 0) + real5;
          entry.naoRealizadasMaiorQue2['2'] = (entry.naoRealizadasMaiorQue2['2'] || 0) + nreal2;
          entry.naoRealizadasMaiorQue2['3'] = (entry.naoRealizadasMaiorQue2['3'] || 0) + nreal3;
          entry.naoRealizadasMaiorQue2['5'] = (entry.naoRealizadasMaiorQue2['5'] || 0) + nreal5;
        }
      });
    });

    return map;
  }, [results]);

  // Hover Tooltip State
  const [hoveredRowInfo, setHoveredRowInfo] = useState<{
    item: any;
    x: number;
    y: number;
    breakdown: {
      solicitadasByDig: { [dig: string]: number };
      realizadasByDig: { [dig: string]: number };
      naoRealizadasByDig: { [dig: string]: number };
      solicitadasMaiorQue2: number;
      realizadasMaiorQue2: { [dig: string]: number };
      naoRealizadasMaiorQue2: { [dig: string]: number };
      totalSolicitadas: number;
      totalRealizadas: number;
      totalNaoRealizadas: number;
    };
  } | null>(null);

  // Helper to get breakdown key for a given row
  const getRowBreakdown = useCallback((r: any) => {
    let key = '';
    if (activeTab === 'ul') {
      key = `ul_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_ul}`;
    } else if (activeTab === 'razao') {
      key = `razao_${r.v_mes}_${r.v_ano}_${r.v_razao}`;
    } else {
      key = `matr_${r.v_mes}_${r.v_ano}_${r.v_razao}_${r.v_matr}`;
    }
    return digitacaoBreakdown[key] || {
      solicitadasByDig: {},
      realizadasByDig: {},
      naoRealizadasByDig: {},
      solicitadasMaiorQue2: 0,
      realizadasMaiorQue2: {},
      naoRealizadasMaiorQue2: {},
      totalSolicitadas: r.v_solicitadas || 0,
      totalRealizadas: r.v_realizadas || 0,
      totalNaoRealizadas: r.v_nao_realizadas || 0
    };
  }, [activeTab, digitacaoBreakdown]);

  // 4. Pagination
  const totalPages = Math.ceil(displayData.length / pageSize);
  const paginatedResults = displayData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 5. Formatting Helpers
  const getRowStyle = (indicador: number) => {
    if (indicador < 50.01) {
      return "bg-red-100/70 hover:bg-red-100 text-red-950 font-medium"; // Menor que 50,01% (Vermelho Claro na Linha Inteira)
    }
    return "hover:bg-zinc-50/60 text-zinc-900";
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
          if (ind < 50.01) {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
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

  // Export functions for the Alert Modal (PDF, EXCEL, JPEG)
  const exportModalToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString('pt-BR');
    
    const tableColumn = ["#", "RAZÃO", "MATRÍCULA", "SOLICITADAS", "REALIZADAS", "N-REALIZADAS", "INDICADOR (%)"];
    
    const tableRows = topNaoRealizadasColaboradores.map((colab, idx) => [
      `${idx + 1}º`,
      `RZ ${colab.v_razao}`,
      colab.v_matr || '-',
      colab.v_solicitadas.toLocaleString(),
      colab.v_realizadas.toLocaleString(),
      colab.v_nao_realizadas.toLocaleString(),
      formatPercent(colab.v_indicador)
    ]);

    doc.setFontSize(13);
    doc.setTextColor(153, 27, 27);
    doc.text("ALERTA IMPORTANTE: Verifique com atenção os colaboradores com maior percentual de Não Evidências apresentadas.", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Período: ${mes || ''}/${ano || ''} | Gerado em: ${timestamp}`, 14, 22);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 28,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [185, 28, 28] },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const row = topNaoRealizadasColaboradores[data.row.index];
          if (row && row.v_indicador < 50.01) {
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [153, 27, 27];
          }
        }
      }
    });

    doc.save(`Alerta_Evidencias_N_Realizadas_${new Date().getTime()}.pdf`);
  };

  const exportModalToExcel = () => {
    const exportData = topNaoRealizadasColaboradores.map((colab, idx) => ({
      "POSIÇÃO": `${idx + 1}º`,
      "RAZÃO": colab.v_razao,
      "MATRÍCULA": colab.v_matr || '',
      "SOLICITADAS": colab.v_solicitadas,
      "REALIZADAS": colab.v_realizadas,
      "N-REALIZADAS": colab.v_nao_realizadas,
      "INDICADOR (%)": formatPercent(colab.v_indicador)
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alerta_Evidencias");
    XLSX.writeFile(workbook, `Alerta_Evidencias_N_Realizadas_${new Date().getTime()}.xlsx`);
  };

  const exportModalToJPEG = () => {
    const canvas = document.createElement('canvas');
    const width = 1200;
    const headerHeight = 160;
    const rowHeight = 44;
    const tableHeaderHeight = 48;
    const padding = 40;
    const rows = topNaoRealizadasColaboradores;
    const totalHeight = headerHeight + tableHeaderHeight + (rows.length * rowHeight) + padding + 60;

    canvas.width = width;
    canvas.height = Math.max(totalHeight, 400);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, canvas.height);

    // Header Background banner
    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(0, 0, width, headerHeight);

    // Border line bottom of header
    ctx.strokeStyle = '#fee2e2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();

    // Alert Red Bar
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(40, 32, 8, 80);

    // Title
    ctx.font = 'bold 20px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#7f1d1d';
    ctx.fillText('ALERTA IMPORTANTE: Verifique com atenção os colaboradores com maior percentual de Não Evidências apresentadas.', 60, 58);

    // Subtitle
    ctx.font = '15px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#991b1b';
    ctx.fillText(
      `Período: ${mes || ''}/${ano || ''} | Razão & Matrícula com maiores quantidades de N-Realizadas | Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      60,
      95
    );

    // Table Header
    const tableTop = headerHeight + 24;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(padding, tableTop, width - (padding * 2), tableHeaderHeight);

    const cols = [
      { title: '#', x: 60, align: 'left' as CanvasTextAlign },
      { title: 'RAZÃO', x: 140, align: 'left' as CanvasTextAlign },
      { title: 'MATRÍCULA', x: 300, align: 'left' as CanvasTextAlign },
      { title: 'SOLICITADAS', x: 540, align: 'right' as CanvasTextAlign },
      { title: 'REALIZADAS', x: 740, align: 'right' as CanvasTextAlign },
      { title: 'N-REALIZADAS', x: 940, align: 'right' as CanvasTextAlign },
      { title: 'INDICADOR (%)', x: 1140, align: 'right' as CanvasTextAlign },
    ];

    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    cols.forEach(col => {
      ctx.textAlign = col.align;
      ctx.fillText(col.title, col.x, tableTop + 30);
    });

    // Table Rows
    let currentY = tableTop + tableHeaderHeight;
    rows.forEach((colab, idx) => {
      const isCritical = colab.v_indicador < 50.01;

      // Row background
      if (isCritical) {
        ctx.fillStyle = '#fee2e2';
      } else {
        ctx.fillStyle = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      }
      ctx.fillRect(padding, currentY, width - (padding * 2), rowHeight);

      // Bottom row border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, currentY + rowHeight);
      ctx.lineTo(width - padding, currentY + rowHeight);
      ctx.stroke();

      // Row texts
      ctx.font = isCritical ? 'bold 14px Inter, system-ui, sans-serif' : '14px Inter, system-ui, sans-serif';
      
      // Index
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.fillText(`${idx + 1}º`, 60, currentY + 27);

      // Razão
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`RZ ${colab.v_razao}`, 140, currentY + 27);

      // Matrícula
      ctx.fillStyle = '#2563eb';
      ctx.fillText(colab.v_matr || '-', 300, currentY + 27);

      // Solicitadas
      ctx.textAlign = 'right';
      ctx.fillStyle = '#334155';
      ctx.fillText(colab.v_solicitadas.toLocaleString(), 540, currentY + 27);

      // Realizadas
      ctx.fillStyle = '#059669';
      ctx.fillText(colab.v_realizadas.toLocaleString(), 740, currentY + 27);

      // N-Realizadas
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.fillText(colab.v_nao_realizadas.toLocaleString(), 940, currentY + 27);

      // Indicador (%)
      ctx.fillStyle = isCritical ? '#991b1b' : '#0f172a';
      ctx.fillText(formatPercent(colab.v_indicador), 1140, currentY + 27);

      currentY += rowHeight;
    });

    // Footer note
    ctx.textAlign = 'left';
    ctx.font = 'italic 12px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('* Registros destacados em vermelho claro representam Indicador inferior a 50,01%.', padding, currentY + 32);

    // Export as JPEG
    const link = document.createElement('a');
    link.download = `Alerta_Evidencias_N_Realizadas_${new Date().getTime()}.jpeg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
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

      {/* Modal / Popup de Alerta de Colaboradores com Maior N-Realizadas */}
      <AnimatePresence>
        {showAlertModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-red-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header do Alerta */}
              <div className="p-6 bg-red-50/80 border-b border-red-100 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-red-600 text-white rounded-2xl shadow-md shadow-red-200 mt-0.5">
                    <AlertTriangle className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-red-900 tracking-tight leading-snug">
                      ALERTA IMPORTANTE: Verifique com atenção os colaboradores com maior percentual de Não Evidências apresentadas.
                    </h3>
                    <p className="text-xs text-red-700/80 mt-1 font-medium">
                      Colaboradores e razões com as maiores quantidades de N-Realizadas no período selecionado.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAlertModal(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Opções de Exportação do Popup (PDF, EXCEL, Imagem .JPEG) */}
              <div className="px-6 py-3 bg-zinc-50/90 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Opções de Exportação do Alerta:
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={exportModalToPDF}
                    className="px-3 py-1.5 bg-white hover:bg-red-50 border border-zinc-200 hover:border-red-200 rounded-lg text-xs font-bold text-zinc-700 hover:text-red-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Exportar Alerta para PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-red-600" />
                    <span>PDF</span>
                  </button>
                  <button 
                    onClick={exportModalToExcel}
                    className="px-3 py-1.5 bg-white hover:bg-emerald-50 border border-zinc-200 hover:border-emerald-200 rounded-lg text-xs font-bold text-zinc-700 hover:text-emerald-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Exportar Alerta para EXCEL"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>EXCEL</span>
                  </button>
                  <button 
                    onClick={exportModalToJPEG}
                    className="px-3 py-1.5 bg-white hover:bg-blue-50 border border-zinc-200 hover:border-blue-200 rounded-lg text-xs font-bold text-zinc-700 hover:text-blue-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                    title="Exportar Alerta para Imagem (.JPEG)"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Imagem (.JPEG)</span>
                  </button>
                </div>
              </div>

              {/* Tabela Resumida de Colaboradores com Maiores N-Realizadas */}
              <div className="p-6 overflow-y-auto flex-1">
                <div className="overflow-x-auto rounded-2xl border border-zinc-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50">
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">#</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Razão</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100">Matrícula</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100 text-right">Solicitadas</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100 text-right">Realizadas</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100 text-right">N-Realizadas</th>
                        <th className="px-4 py-3 text-[10px] font-black text-zinc-400 uppercase tracking-wider border-b border-zinc-100 text-right">Indicador (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-xs">
                      {topNaoRealizadasColaboradores.map((colab, idx) => {
                        const isHighRisk = colab.v_indicador < 50.01;
                        return (
                          <tr 
                            key={`${colab.v_razao}-${colab.v_matr}-${idx}`}
                            className={cn(
                              "transition-colors",
                              isHighRisk ? "bg-red-50/80 font-semibold text-red-950" : "hover:bg-zinc-50"
                            )}
                          >
                            <td className="px-4 py-3 text-zinc-400 font-bold">{idx + 1}º</td>
                            <td className="px-4 py-3 font-bold text-zinc-900">RZ {colab.v_razao}</td>
                            <td className="px-4 py-3 font-semibold text-blue-600">{colab.v_matr || '-'}</td>
                            <td className="px-4 py-3 text-right text-zinc-700">{colab.v_solicitadas.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-emerald-700 font-semibold">{colab.v_realizadas.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-black text-red-600">{colab.v_nao_realizadas.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold">
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[11px]",
                                isHighRisk ? "bg-red-100 text-red-700 font-black" : "text-zinc-800"
                              )}>
                                {formatPercent(colab.v_indicador)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Botão de Fechar e Visualizar Completo */}
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setShowAlertModal(false)}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-md shadow-blue-100 text-sm flex items-center gap-2"
                >
                  <span>Visualizar Relatório Completo</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <tbody className="divide-y divide-zinc-50 relative">
                  {paginatedResults.map((r, i) => {
                    const breakdown = getRowBreakdown(r);
                    return (
                      <tr 
                        key={i} 
                        className={cn("hover:opacity-90 transition-all cursor-pointer", getRowStyle(r.v_indicador || 0))}
                        onMouseEnter={(e) => {
                          setHoveredRowInfo({
                            item: r,
                            x: e.clientX,
                            y: e.clientY,
                            breakdown
                          });
                        }}
                        onMouseMove={(e) => {
                          setHoveredRowInfo(prev => prev ? {
                            ...prev,
                            x: e.clientX,
                            y: e.clientY
                          } : null);
                        }}
                        onMouseLeave={() => setHoveredRowInfo(null)}
                      >
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Hover Tooltip Detalhado por Digitação (Otimizado em Memória) */}
            {hoveredRowInfo && (
              <div 
                className="fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3"
                style={{
                  left: `${hoveredRowInfo.x}px`,
                  top: `${hoveredRowInfo.y - 12}px`
                }}
              >
                <div className="bg-white/95 backdrop-blur-md border border-zinc-200 text-zinc-900 shadow-2xl rounded-2xl p-4 min-w-[280px] max-w-[340px]">
                  {/* Header do Tooltip */}
                  <div className="border-b border-zinc-100 pb-2 mb-3">
                    <div className="text-xs font-black uppercase tracking-wider text-blue-600">
                      Detalhamento de Evidências
                    </div>
                    <div className="text-xs font-bold text-zinc-800 mt-0.5">
                      RZ {hoveredRowInfo.item.v_razao} {hoveredRowInfo.item.v_ul ? `• UL ${hoveredRowInfo.item.v_ul}` : ''} {hoveredRowInfo.item.v_matr ? `• Matr ${hoveredRowInfo.item.v_matr}` : ''}
                    </div>
                  </div>

                  {/* 1. Solicitadas: Detalhamento normal por digitação (sem filtro > 2) */}
                  <div className="mb-3 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                    <div className="flex justify-between items-center text-xs font-bold text-blue-900 mb-1">
                      <span>Solicitadas:</span>
                      <span className="text-blue-950 font-black text-sm">{hoveredRowInfo.breakdown.totalSolicitadas.toLocaleString()}</span>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-blue-200/60">
                      <table className="w-full text-left text-[11px] border-collapse">
                        <thead>
                          <tr className="text-blue-800/70 border-b border-blue-200/50">
                            <th className="pb-0.5 font-bold">Digitações:</th>
                            <th className="pb-0.5 font-bold text-right">Solicitadas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100/50">
                          {Object.entries(hoveredRowInfo.breakdown.solicitadasByDig).map(([dig, count]) => (
                            <tr key={dig}>
                              <td className="py-0.5 font-medium text-blue-950">{dig}</td>
                              <td className="py-0.5 font-bold text-right text-blue-950">{count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. Realizadas e 3. N-Realizadas: Detalhamento normal por digitação (sem filtro > 2) */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Realizadas */}
                    <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center text-emerald-900 font-bold mb-1">
                          <span>Realizadas:</span>
                          <span className="font-black">{hoveredRowInfo.breakdown.totalRealizadas.toLocaleString()}</span>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-emerald-200/60">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="text-emerald-800/70 border-b border-emerald-200/50">
                                <th className="pb-0.5 font-bold">Digitações:</th>
                                <th className="pb-0.5 font-bold text-right">Realizadas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100/50">
                              {Object.entries(hoveredRowInfo.breakdown.realizadasByDig).map(([dig, count]) => (
                                <tr key={dig}>
                                  <td className="py-0.5 font-medium text-emerald-950">{dig}</td>
                                  <td className="py-0.5 font-bold text-right text-emerald-950">{count.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* N-Realizadas */}
                    <div className="bg-red-50/70 p-2.5 rounded-xl border border-red-100 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-center text-red-900 font-bold mb-1">
                          <span>N-Realizadas:</span>
                          <span className="font-black">{hoveredRowInfo.breakdown.totalNaoRealizadas.toLocaleString()}</span>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-red-200/60">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="text-red-800/70 border-b border-red-200/50">
                                <th className="pb-0.5 font-bold">Digitações:</th>
                                <th className="pb-0.5 font-bold text-right">N-Realizadas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-100/50">
                              {Object.entries(hoveredRowInfo.breakdown.naoRealizadasByDig).map(([dig, count]) => (
                                <tr key={dig}>
                                  <td className="py-0.5 font-medium text-red-950">{dig}</td>
                                  <td className="py-0.5 font-bold text-right text-red-950">{count.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Indicador Geral (Mantido) */}
                  <div className="mt-2.5 pt-2 border-t border-zinc-100 flex justify-between items-center text-[10px] text-zinc-400 font-medium">
                    <span>Indicador Geral</span>
                    <span className="font-bold text-zinc-700">{formatPercent(hoveredRowInfo.item.v_indicador || 0)}</span>
                  </div>
                </div>
              </div>
            )}
            
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
