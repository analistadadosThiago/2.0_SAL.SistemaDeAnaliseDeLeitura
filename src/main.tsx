import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getAllDadosGerais } from './lib/dadosGeraisService';

// Limpa qualquer estado armazenado no localStorage ou sessionStorage para evitar retenção de dados antigos
try {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
} catch (e) {
  console.warn('Erro ao limpar storage do navegador:', e);
}

// Inicia imediatamente o carregamento assíncrono paginado da base global de 40.222+ registros
getAllDadosGerais().catch(err => {
  console.error('Inicialização da base global DadosGerais:', err);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
