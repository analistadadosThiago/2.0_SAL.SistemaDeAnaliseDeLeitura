import { useEffect, useState, useCallback } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Calendar,
  Filter,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { DashboardResumo, DashboardLeituraTipo } from '../types';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const YEARS = [2023, 2024, 2025, 2026];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState<number>(new Date().getFullYear());
  const [mes, setMes] = useState<string>(MONTHS[new Date().getMonth()]);
  const [rz, setRz] = useState<number | null>(null);
  
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [leiturasPorTipo, setLeiturasPorTipo] = useState<DashboardLeituraTipo[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        p_ano: ano,
        p_mes: mes,
        p_rz: rz
      };

      const [resumoRes, tipoRes] = await Promise.all([
        supabase.rpc('Dashboard_ResumoGeral', params),
        supabase.rpc('Dashboard_LeiturasPorTipo', params)
      ]);

      if (resumoRes.error) throw resumoRes.error;
      if (tipoRes.error) throw tipoRes.error;

      setResumo(resumoRes.data?.[0] || null);
      setLeiturasPorTipo(tipoRes.data || []);
    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [ano, mes, rz]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard de Medições</h1>
          <p className="text-zinc-500 text-sm">Acompanhamento de desempenho integrado ao Supabase.</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mr-2">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Filtros</span>
          </div>
          
          <select 
            value={ano} 
            onChange={(e) => setAno(Number(e.target.value))}
            className="text-sm border-none focus:ring-0 bg-zinc-50 rounded-lg px-3 py-1.5 font-medium text-zinc-700"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select 
            value={mes} 
            onChange={(e) => setMes(e.target.value)}
            className="text-sm border-none focus:ring-0 bg-zinc-50 rounded-lg px-3 py-1.5 font-medium text-zinc-700"
          >
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <input 
            type="number" 
            placeholder="Razão (RZ)"
            value={rz || ''}
            onChange={(e) => setRz(e.target.value ? Number(e.target.value) : null)}
            className="text-sm border-none focus:ring-0 bg-zinc-50 rounded-lg px-3 py-1.5 font-medium text-zinc-700 w-28"
          />

          <button 
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Leituras a Realizar" 
          value={resumo?.leituras_a_realizar?.toLocaleString() || '0'} 
          icon={Calendar} 
          color="blue" 
        />
        <StatCard 
          title="Leituras Realizadas" 
          value={resumo?.leituras_realizadas?.toLocaleString() || '0'} 
          icon={CheckCircle2} 
          color="emerald" 
        />
        <StatCard 
          title="Não Realizadas" 
          value={resumo?.leituras_nao_realizadas?.toLocaleString() || '0'} 
          icon={Clock} 
          color="amber" 
        />
        <StatCard 
          title="Impedimento (%)" 
          value={resumo?.percentual_impedimento ? `${resumo.percentual_impedimento.toFixed(2).replace('.', ',')}%` : '0,00%'} 
          icon={AlertCircle} 
          color="red" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart by Type */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Leituras por Tipo
          </h3>
          <div className="h-[350px] w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
              </div>
            ) : leiturasPorTipo.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leiturasPorTipo}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                  <XAxis dataKey="tipo" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [value.toLocaleString(), 'Total']}
                  />
                  <Bar dataKey="leituras_realizadas" name="Realizadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="leituras_nao_realizadas" name="Não Realizadas" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                <Filter className="w-12 h-12 mb-2 opacity-20" />
                <p>Nenhum dado encontrado para este período.</p>
              </div>
            )}
          </div>
        </div>

        {/* Breakdown List */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold text-zinc-900 mb-6">Resumo por Tipo</h3>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {leiturasPorTipo.map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-zinc-900">{item.tipo}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {item.percentual_impedimento.toFixed(2).replace('.', ',')}% Imp.
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-zinc-500">Realizadas: <span className="text-zinc-900 font-medium">{item.leituras_realizadas}</span></div>
                  <div className="text-zinc-500">Não Realizadas: <span className="text-zinc-900 font-medium">{item.leituras_nao_realizadas}</span></div>
                </div>
                <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className="bg-emerald-500 h-full" 
                    style={{ width: `${(item.leituras_realizadas / (item.leituras_a_realizar || 1)) * 100}%` }} 
                  />
                </div>
              </div>
            ))}
            {!loading && leiturasPorTipo.length === 0 && (
              <p className="text-center text-zinc-400 text-sm py-12">Sem dados para exibir.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  const colorClasses: any = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
  };

  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className={cn("bg-white p-6 rounded-2xl border shadow-sm transition-all", colorClasses[color])}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg bg-white shadow-sm")}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <h4 className="text-zinc-500 text-sm font-medium">{title}</h4>
      <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
    </motion.div>
  );
}
