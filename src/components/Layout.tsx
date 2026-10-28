import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Search, 
  Activity,
  Users,
  Camera,
  Printer,
  Menu,
  X,
  Filter,
  TrendingUp,
  Clock,
  ListOrdered,
  Sliders,
  FileText,
  ChevronDown,
  FileSpreadsheet,
  Loader2
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { DEFAULT_GOOGLE_SHEET_URL } from '../config/sheetConfig';
import { setGoogleSheetUrlAndReload } from '../lib/dadosGeraisService';

const menuGroups = [
  { 
    label: 'Principal',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
      { icon: Search, label: 'Consulta', path: '/consulta' },
    ]
  },
  {
    label: 'Controles',
    icon: Sliders,
    items: [
      { icon: Users, label: 'Controle de Leiturista', path: '/leiturista' },
      { icon: Camera, label: 'Controle de Evidências', path: '/evidencias' },
    ]
  },
  {
    label: 'Impressões',
    icon: Printer,
    items: [
      { icon: Printer, label: 'Controle de Apresentação', path: '/apresentacao' },
    ]
  },
  {
    label: 'Relatórios',
    icon: FileText,
    items: [
      { icon: Filter, label: 'N’OSB - Impedimento', path: '/nosb' },
      { icon: TrendingUp, label: 'N’OSB - Simulação', path: '/nosb-simulacao' },
      { icon: Clock, label: 'Relatório de Horário', path: '/horario' },
      { icon: ListOrdered, label: 'Sequência de Leitura', path: '/sequencia' },
    ]
  }
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Controles': true,
    'Impressões': true,
    'Relatórios': true,
  });
  const location = useLocation();

  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetInput, setSheetInput] = useState('');
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  const [sheetStatusMsg, setSheetStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [hasConnectedSheet, setHasConnectedSheet] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('SAL_GOOGLE_SHEET_URL') || DEFAULT_GOOGLE_SHEET_URL || '';
    setSheetInput(saved);
    setHasConnectedSheet(Boolean(saved && saved.trim().length > 0));
  }, []);

  const handleSaveSheet = async () => {
    setIsSavingSheet(true);
    setSheetStatusMsg(null);
    try {
      const rows = await setGoogleSheetUrlAndReload(sheetInput.trim());
      setHasConnectedSheet(Boolean(sheetInput.trim().length > 0));
      if (rows && rows.length > 0) {
        setSheetStatusMsg({ text: `Conectado com sucesso! ${rows.length} registros carregados.`, isError: false });
        setTimeout(() => setIsSheetModalOpen(false), 1200);
      } else {
        setSheetStatusMsg({ text: 'Planilha salva. Se os dados não carregarem, certifique-se de que o link está como "Qualquer pessoa com o link pode ler".', isError: false });
        setTimeout(() => setIsSheetModalOpen(false), 2000);
      }
    } catch (err: any) {
      setSheetStatusMsg({ text: err.message || 'Erro ao carregar dados da planilha', isError: true });
    } finally {
      setIsSavingSheet(false);
    }
  };

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col z-50 fixed inset-y-0 left-0 lg:relative",
          isSidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Activity className="text-white w-5 h-5" />
            </div>
          </div>
          {isSidebarOpen && (
            <div className="flex flex-col min-w-0 justify-center">
              <span className="font-black text-white text-xl tracking-tighter leading-none">SAL</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider truncate mt-1">Sistema de Acompanhamento de Leitura</span>
            </div>
          )}
        </div>

        <nav className="flex-1 py-6 overflow-y-auto custom-scrollbar">
          {menuGroups.map((group) => {
            const hasSubitems = group.label !== 'Principal';
            const isOpen = openGroups[group.label];
            const GroupIcon = group.icon;

            if (!hasSubitems) {
              return group.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-6 py-3.5 transition-all group relative",
                    location.pathname === item.path 
                      ? "text-white bg-blue-600/10" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  )}
                >
                  <item.icon className={cn("w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110", location.pathname === item.path ? "text-blue-500" : "group-hover:text-white")} />
                  {isSidebarOpen && <span className={cn("text-sm tracking-tight", location.pathname === item.path ? "font-black" : "font-bold")}>{item.label}</span>}
                  {location.pathname === item.path && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                  )}
                </Link>
              ));
            }

            return (
              <div key={group.label} className="mb-2">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    "w-full flex items-center justify-between px-6 py-3 text-slate-400 hover:text-white hover:bg-slate-800/30 transition-all group",
                    !isSidebarOpen && "justify-center"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {GroupIcon && <GroupIcon className="w-5 h-5 flex-shrink-0 group-hover:text-blue-400 transition-colors" />}
                    {isSidebarOpen && <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 group-hover:text-slate-300">{group.label}</span>}
                  </div>
                  {isSidebarOpen && (
                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-300", isOpen ? "rotate-180" : "rotate-0")} />
                  )}
                </button>

                {isOpen && isSidebarOpen && (
                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-3 pl-12 pr-6 py-2.5 transition-all group relative",
                          location.pathname === item.path 
                            ? "text-white bg-blue-600/5" 
                            : "text-slate-500 hover:text-white hover:bg-slate-800/20"
                        )}
                      >
                        <item.icon className={cn("w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110", location.pathname === item.path ? "text-blue-500" : "group-hover:text-white")} />
                        <span className={cn(
                          "text-[13px] tracking-tight transition-colors",
                          location.pathname === item.path ? "font-black text-blue-400" : "font-semibold"
                        )}>
                          {item.label}
                        </span>
                        {location.pathname === item.path && (
                          <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500/50" />
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center gap-3">
            {/* Botão de Conexão com Google Planilha */}
            <button
              onClick={() => setIsSheetModalOpen(true)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-xs cursor-pointer",
                hasConnectedSheet
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              )}
              title="Configurar Planilha Google"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{hasConnectedSheet ? "Planilha Conectada" : "Conectar Planilha"}</span>
              {hasConnectedSheet && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
            </button>

            <div className="px-3 py-1 bg-zinc-100 rounded-full">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sistema Ativo</span>
            </div>
          </div>
        </header>

        {/* Modal de Conexão com Google Planilha */}
        {isSheetModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-zinc-900 leading-tight">Google Planilha (Sheets)</h3>
                    <p className="text-[11px] text-zinc-500 font-medium">Fonte de dados exclusiva do SAL</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSheetModalOpen(false)}
                  className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 leading-relaxed">
                Cole abaixo a <strong>URL pública</strong> da sua planilha Google ou apenas o <strong>ID da planilha</strong>.
                <div className="text-[11px] text-blue-600 mt-1">
                  ✓ Certifique-se de que o acesso no Google Drive está como <em>"Qualquer pessoa com o link pode ler"</em>.
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Link ou ID da Google Planilha</label>
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/SEU_ID/edit?usp=sharing"
                  className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {sheetStatusMsg && (
                <div className={cn("p-2.5 rounded-lg text-xs font-semibold", sheetStatusMsg.isError ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>
                  {sheetStatusMsg.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsSheetModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={handleSaveSheet}
                  disabled={isSavingSheet}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSavingSheet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Salvar e Carregar Dados</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto min-h-[calc(100vh-180px)]">
            {children}
          </div>
          
          {/* Footer */}
          <footer className="mt-12 py-8 border-t border-zinc-200 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-500">
              Copyright SAL: Sistema de Acompanhamento de Leitura © 2026 | Criado por <span className="text-zinc-900 font-bold">Thiago Marques Lopes</span>
            </p>
            <div className="flex items-center justify-center gap-3 text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              <span className="bg-zinc-100 px-2 py-0.5 rounded">{formatDate(currentTime)} - {formatTime(currentTime)}</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
