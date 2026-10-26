import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { getAllDadosGerais, setupRealtimeSubscription } from './lib/dadosGeraisService';

// Limpa qualquer estado armazenado no localStorage ou sessionStorage para evitar retenção de dados antigos
try {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
  }
} catch (e) {
  console.warn('Erro ao limpar storage do navegador:', e);
}

// Inicia carregamento assíncrono da base global (Google BigQuery via Vercel Functions)
setupRealtimeSubscription();
getAllDadosGerais().catch(err => {
  console.error('Inicialização da base global DadosGerais (BigQuery):', err);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
