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
  ChevronDown
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

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
  const [currentTime, setCurrentTime] = useState(new Date());
  const location = useLocation();

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
          
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-zinc-100 rounded-full">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sistema Ativo</span>
            </div>
          </div>
        </header>

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
