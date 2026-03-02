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

export interface ConsultaLeitura {
  mes: string;
  ano: number;
  ul: string;
  instalacao_res: number;
  medidor_res: string;
  reg: string;
  matr: string;
  cod: string;
  leitura: number;
  consumo: number;
  dig: string;
  nosb_imp: string;
  nosb_sim: string;
  cna: string;
}

export interface ControleLeituristaData {
  ano: number;
  mes: string;
  razao: number;
  ul: string;
  matr: string;
  leit_urb: number;
  leit_povoado: number;
  leit_rural: number;
  leit_total: number;
  impedimentos: number;
  indicador: number;
  tipo?: string;
}

export interface ControleEvidenciasData {
  v_mes: string;
  v_ano: number;
  v_razao: number | string;
  v_ul: string;
  v_solicitadas: number;
  v_realizadas: number;
  v_nao_realizadas: number;
  v_matr: string;
  v_indicador?: number;
}

export interface NosbImpedimentoData {
  f_mes: string;
  f_ano: string;
  f_rz: string;
  f_ul: string;
  f_instalacao: string;
  f_medidor: string;
  f_reg: string;
  f_tipo: string;
  f_matr: string;
  f_nl: string;
  f_l_atual: string;
  f_motivo: string;
}

export interface NosbSimulacaoData {
  f_mes: string;
  f_ano: string;
  f_rz: string;
  f_ul: string;
  f_instalacao: string;
  f_medidor: string;
  f_reg: string;
  f_tipo: string;
  f_matr: string;
  f_nl: string;
  f_l_atual: string;
  f_motivo: string;
}

export interface ControleHorarioData {
  f_matricula: string;
  f_data: string;
  f_hora_inicial: string;
  f_hora_final: string;
  f_tempo_servico: string;
  f_tempo_servico_formatado: string;
  f_media_leitura_hora: string;
  f_media_leitura_hora_inteiro: number;
}
