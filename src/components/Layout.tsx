import React from 'react';
import { 
  LayoutDashboard, 
  Search, 
  Users, 
  Camera, 
  Printer, 
  Clock, 
  ListOrdered, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard / Consulta', path: '/' },
  { icon: Users, label: 'Controle de Leiturista', path: '/leituristas' },
  { icon: Camera, label: 'Controle de Evidências', path: '/evidencias' },
  { icon: Printer, label: 'Controle de Impressão', path: '/impressao' },
  { icon: Clock, label: 'Controle de Horário', path: '/horario' },
  { icon: ListOrdered, label: 'Sequência de Leitura', path: '/sequencia' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white border-r border-zinc-200 transition-all duration-300 flex flex-col z-50",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-zinc-100">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-xs">SAL</span>
          </div>
          {isSidebarOpen && <span className="font-bold text-zinc-900 truncate">Sistema SAL</span>}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-6 py-3 transition-colors group relative",
                location.pathname === item.path 
                  ? "text-emerald-600 bg-emerald-50" 
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
              )}
            >
              <item.icon className={cn("w-5 h-5 flex-shrink-0", location.pathname === item.path ? "text-emerald-600" : "group-hover:text-zinc-900")} />
              {isSidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              {location.pathname === item.path && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-600" />
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 px-4 py-2 w-full rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors",
              !isSidebarOpen && "justify-center"
            )}
          >
            <LogOut className="w-5 h-5" />
            {isSidebarOpen && <span className="text-sm font-medium">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-6 sticky top-0 z-40">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-zinc-900">Administrador</p>
              <p className="text-xs text-zinc-500">Gestor de Operações</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 font-bold">
              AD
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
