import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Users,
  Calendar
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const data = [
  { name: 'Seg', concluido: 400, pendente: 240 },
  { name: 'Ter', concluido: 300, pendente: 139 },
  { name: 'Qua', concluido: 200, pendente: 980 },
  { name: 'Qui', concluido: 278, pendente: 390 },
  { name: 'Sex', concluido: 189, pendente: 480 },
  { name: 'Sab', concluido: 239, pendente: 380 },
  { name: 'Dom', concluido: 349, pendente: 430 },
];

const performanceData = [
  { name: 'João Silva', valor: 85 },
  { name: 'Maria Santos', valor: 92 },
  { name: 'Pedro Costa', valor: 78 },
  { name: 'Ana Oliveira', valor: 95 },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard de Operações</h1>
          <p className="text-zinc-500">Visão geral do desempenho e métricas de leitura.</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-600">
          <Calendar className="w-4 h-4" />
          <span>{new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Leituras Concluídas" 
          value="1,284" 
          change="+12%" 
          icon={CheckCircle2} 
          color="emerald" 
        />
        <StatCard 
          title="Leituras Pendentes" 
          value="432" 
          change="-5%" 
          icon={Clock} 
          color="amber" 
        />
        <StatCard 
          title="Erros de Leitura" 
          value="12" 
          change="+2" 
          icon={AlertCircle} 
          color="red" 
        />
        <StatCard 
          title="Eficiência Média" 
          value="94.2%" 
          change="+1.5%" 
          icon={TrendingUp} 
          color="blue" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Chart */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-900 mb-6">Volume de Leituras (Semanal)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f1f1" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="concluido" name="Concluído" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pendente" name="Pendente" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance Chart */}
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-900 mb-6">Desempenho por Leiturista (%)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f1f1" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} width={100} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="valor" name="Desempenho" radius={[0, 4, 4, 0]}>
                  {performanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table (Placeholder) */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">Atividades Recentes</h3>
          <button className="text-emerald-600 text-sm font-medium hover:underline">Ver tudo</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Leiturista</th>
                <th className="px-6 py-4 font-medium">Setor</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Horário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {[
                { name: 'João Silva', sector: 'Zona Norte', status: 'Em Rota', time: '08:30' },
                { name: 'Maria Santos', sector: 'Centro', status: 'Concluído', time: '10:15' },
                { name: 'Pedro Costa', sector: 'Zona Sul', status: 'Em Rota', time: '09:00' },
                { name: 'Ana Oliveira', sector: 'Zona Leste', status: 'Pausa', time: '11:00' },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-zinc-900">{row.name}</td>
                  <td className="px-6 py-4 text-zinc-500">{row.sector}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                      row.status === 'Concluído' ? "bg-emerald-100 text-emerald-700" :
                      row.status === 'Em Rota' ? "bg-blue-100 text-blue-700" :
                      "bg-amber-100 text-amber-700"
                    )}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, change, icon: Icon, color }: any) {
  const colorClasses: any = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn("p-2 rounded-lg", colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={cn(
          "text-xs font-bold px-2 py-1 rounded-full",
          change.startsWith('+') ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        )}>
          {change}
        </span>
      </div>
      <h4 className="text-zinc-500 text-sm font-medium">{title}</h4>
      <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
    </motion.div>
  );
}
