export interface Leiturista {
  id: string;
  nome: string;
  matricula: string;
  setor: string;
  status: 'Ativo' | 'Inativo';
  created_at: string;
}

export interface Leitura {
  id: string;
  data: string;
  medidor: string;
  valor: number;
  evidencia_url?: string;
  leiturista_id: string;
  status: 'Concluída' | 'Pendente' | 'Erro';
  created_at: string;
}

export interface Horario {
  id: string;
  leiturista_id: string;
  entrada: string;
  saida?: string;
  horas_trabalhadas?: number;
}

export interface DashboardResumo {
  leituras_a_realizar: number;
  leituras_nao_realizadas: number;
  leituras_realizadas: number;
  percentual_impedimento: number;
}

export interface DashboardLeituraTipo {
  tipo: string;
  total_leituras: number;
  realizadas: number;
  nao_realizadas: number;
  percentual_impedimento: number;
}

export interface DashboardFiltros {
  ano: number;
  mes: string;
  rz: number;
}
