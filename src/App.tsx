import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Inicio from "./pages/Inicio";
import Colaboradores from "./pages/Colaboradores";
import Auth from "./pages/Auth";
import RedefinirSenha from "./pages/RedefinirSenha";
import Cadastro from "./pages/Cadastro";
import CadastroPublico from "./pages/CadastroPublico";
import CadastroLote from "./pages/CadastroLote";
import Perfil from "./pages/Perfil";

import PerfilColaborador from "./pages/PerfilColaborador";
import UnidadesProva from "./pages/UnidadesProva";
import SalasProva from "./pages/SalasProva";
import Provas from "./pages/Provas";
import Editais from "./pages/Editais";
import GerenciarProva from "./pages/GerenciarProva";
import GerenciarSalasDistribuidas from "./pages/GerenciarSalasDistribuidas";
import GerenciarColaboradoresProva from "./pages/GerenciarColaboradoresProva";
import OcorrenciasProva from "./pages/OcorrenciasProva";
import FuncoesColaboradores from "./pages/FuncoesColaboradores";
import DocumentosImpressao from "./pages/DocumentosImpressao";
import PainelDadosColaboradores from "./pages/PainelDadosColaboradores";
import Dashboard from "./pages/Dashboard";
import GerenciarUsuarios from "./pages/GerenciarUsuarios";
import Treinamento from "./pages/Treinamento";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Inicio />} />
              <Route path="/colaboradores" element={<Colaboradores />} />
              <Route path="/dashboard" element={<Dashboard />} />
              {/* Porta única desde a etapa 2A: colaborador e gestor entram pelo mesmo
                  lugar. /auth-admin sobrevive só como atalho para links antigos. */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth-admin" element={<Navigate to="/auth" replace />} />
              <Route path="/redefinir-senha" element={<RedefinirSenha />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/cadastro-publico" element={<CadastroPublico />} />
              <Route path="/cadastro-lote" element={<CadastroLote />} />
              <Route path="/perfil" element={<Perfil />} />
              
              <Route path="/perfil-colaborador" element={<PerfilColaborador />} />
              <Route path="/unidades-prova" element={<UnidadesProva />} />
              <Route path="/salas-prova/:unidadeId" element={<SalasProva />} />
              <Route path="/provas" element={<Provas />} />
              <Route path="/editais" element={<Editais />} />
              <Route path="/gerenciar-prova/:provaId" element={<GerenciarProva />} />
              <Route path="/gerenciar-salas-distribuidas/:provaId/:unidadeId" element={<GerenciarSalasDistribuidas />} />
              <Route path="/gerenciar-colaboradores-prova/:provaUnidadeId" element={<GerenciarColaboradoresProva />} />
              <Route path="/ocorrencias-prova/:provaId" element={<OcorrenciasProva />} />
              <Route path="/funcoes-colaboradores" element={<FuncoesColaboradores />} />
              <Route path="/documentos-impressao/:provaId" element={<DocumentosImpressao />} />
              <Route path="/painel-dados-colaboradores/:provaId" element={<PainelDadosColaboradores />} />
              <Route path="/gerenciar-usuarios" element={<GerenciarUsuarios />} />
              <Route path="/treinamento" element={<Treinamento />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;