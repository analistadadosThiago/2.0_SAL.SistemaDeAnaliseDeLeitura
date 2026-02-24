/*
  SQL Schema for SAL - Sistema de Análise de Leitura
  Run this in your Supabase SQL Editor to set up the tables.

  -- 1. Leituristas
  CREATE TABLE leituristas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    matricula TEXT UNIQUE NOT NULL,
    setor TEXT,
    status TEXT DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 2. Leituras
  CREATE TABLE leituras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    medidor TEXT NOT NULL,
    valor NUMERIC,
    status TEXT DEFAULT 'Pendente' CHECK (status IN ('Concluída', 'Pendente', 'Erro')),
    leiturista_id UUID REFERENCES leituristas(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 3. Evidências
  CREATE TABLE evidencias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leitura_id UUID REFERENCES leituras(id),
    foto_url TEXT,
    comentarios TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 4. Impressões
  CREATE TABLE impressoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    relatorio_nome TEXT,
    usuario_id UUID,
    data_impressao TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 5. Horários
  CREATE TABLE horarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leiturista_id UUID REFERENCES leituristas(id),
    entrada TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    saida TIMESTAMP WITH TIME ZONE,
    horas_trabalhadas NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  -- 6. Sequência de Leitura
  CREATE TABLE sequencia_leitura (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rota_nome TEXT,
    ordem INTEGER,
    endereco TEXT,
    status TEXT DEFAULT 'Aguardando',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
*/

export const SCHEMA_INFO = "Schema documentation is in the comments of this file.";
