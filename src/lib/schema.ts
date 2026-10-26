/**
 * Schema e Metadados do Google BigQuery para o SAL - Sistema de Acompanhamento de Leitura
 * 
 * Projeto BigQuery: leiturabd
 * Dataset: dados_diarios
 * Tabela Principal: DadosGerais
 *
 * Colunas Oficiais:
 * - MÊS: Mês de referência (ex: 'Outubro', 'Setembro')
 * - ANO: Ano numérico de referência (ex: 2026)
 * - INSTALAÇÃO: Número identificador da instalação do cliente
 * - MEDIDOR: Número/código de série do medidor
 * - REG: Regional / Setor
 * - RAZAO: Razão da leitura ('01' a '10')
 * - RZ_UL_LV: Código composto Razão + UL + Livro
 * - UL: Unidade de Leitura
 * - FOTO: Status da evidência fotográfica ('OK', 'FALHA')
 * - TIPO: Tipo do setor ('Urbano', 'Rural', 'Povoado')
 * - MATR: Matrícula do leiturista
 * - NL: Código de impedimento / Não Leitura (ex: '3201', '3301', '00')
 * - DATA: Data da leitura (DD/MM/AAAA ou ISO)
 * - HORA: Hora da leitura (HH:MM:SS)
 * - ENDEREÇO: Endereço da instalação
 * - LEITURA: Valor numérico da medição
 * - CONSUMO: Consumo apurado no período
 * - nosb_impedimento: Motivo descritivo do impedimento de leitura
 * - nosb_simulacao: Motivo de simulação de leitura
 * - digitacao: Indicador numérico de digitação (1, 2, 3...)
 * - cna: Motivo de Consumo Não Autorizado
 * - consistencia: Status de consistência da leitura
 */

export const BIGQUERY_CONFIG = {
  projectId: 'leiturabd',
  dataset: 'dados_diarios',
  table: 'DadosGerais',
  endpoint: '/api/get-data'
};

export const SCHEMA_INFO = "Schema oficial do Google BigQuery (leiturabd.dados_diarios.DadosGerais).";
