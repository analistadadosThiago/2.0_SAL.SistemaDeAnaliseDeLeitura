import { LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  icon: LucideIcon;
  description: string;
}

export default function PlaceholderPage({ title, icon: Icon, description }: PlaceholderPageProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-zinc-200 border-dashed">
      <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center mb-4 text-zinc-400">
        <Icon className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
      <p className="text-zinc-500 max-w-md mt-2">
        {description}
      </p>
      <div className="mt-8 flex gap-3">
        <button className="px-6 py-2 bg-zinc-900 text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors">
          Adicionar Novo
        </button>
        <button className="px-6 py-2 border border-zinc-200 text-zinc-600 rounded-lg font-medium hover:bg-zinc-50 transition-colors">
          Exportar Relatório
        </button>
      </div>
    </div>
  );
}
