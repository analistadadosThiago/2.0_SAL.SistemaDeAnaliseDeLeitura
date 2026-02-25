import { useState } from 'react';
import { LayoutDashboard, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './Dashboard';
import Consulta from './Consulta';
import { cn } from '../lib/utils';

export default function MainView() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'consulta'>('dashboard');

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex p-1 bg-zinc-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'dashboard' 
              ? "bg-white text-emerald-600 shadow-sm" 
              : "text-zinc-500 hover:text-zinc-900"
          )}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('consulta')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
            activeTab === 'consulta' 
              ? "bg-white text-emerald-600 shadow-sm" 
              : "text-zinc-500 hover:text-zinc-900"
          )}
        >
          <Search className="w-4 h-4" />
          Consulta
        </button>
      </div>

      {/* Content Area */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Dashboard />
            </motion.div>
          ) : (
            <motion.div
              key="consulta"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Consulta />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
