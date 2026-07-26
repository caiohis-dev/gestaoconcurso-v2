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
import NotFound from "./pages/NotFound";
import { RequireAcesso } from "@/components/RequireAcesso";

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
              <Route path="/colaboradores" element={<RequireAcesso papeis={["admin", "coordenador"]}><Colaboradores /></RequireAcesso>} />
              <Route path="/dashboard" element={<RequireAcesso papeis={["admin"]}><Dashboard /></RequireAcesso>} />
              {/* Porta única desde a etapa 2A: colaborador e gestor entram pelo mesmo
                  lugar. /auth-admin sobrevive só como atalho para links antigos. */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth-admin" element={<Navigate to="/auth" replace />} />
              <Route path="/redefinir-senha" element={<RedefinirSenha />} />
              <Route path="/cadastro" element={<RequireAcesso papeis={["admin", "coordenador"]}><Cadastro /></RequireAcesso>} />
              <Route path="/cadastro-publico" element={<CadastroPublico />} />
              <Route path="/cadastro-lote" element={<RequireAcesso papeis={["admin", "coordenador"]}><CadastroLote /></RequireAcesso>} />
              <Route path="/perfil" element={<Perfil />} />
              
              <Route path="/perfil-colaborador" element={<PerfilColaborador />} />
              <Route path="/unidades-prova" element={<RequireAcesso papeis={["admin"]}><UnidadesProva /></RequireAcesso>} />
              <Route path="/salas-prova/:unidadeId" element={<RequireAcesso papeis={["admin"]}><SalasProva /></RequireAcesso>} />
              <Route path="/provas" element={<RequireAcesso papeis={["admin", "coordenador"]}><Provas /></RequireAcesso>} />
              <Route path="/editais" element={<RequireAcesso papeis={["admin"]}><Editais /></RequireAcesso>} />
              <Route path="/gerenciar-prova/:provaId" element={<RequireAcesso papeis={["admin", "coordenador"]}><GerenciarProva /></RequireAcesso>} />
              <Route path="/gerenciar-salas-distribuidas/:provaId/:unidadeId" element={<RequireAcesso papeis={["admin"]}><GerenciarSalasDistribuidas /></RequireAcesso>} />
              <Route path="/gerenciar-colaboradores-prova/:provaUnidadeId" element={<RequireAcesso papeis={["admin", "coordenador"]}><GerenciarColaboradoresProva /></RequireAcesso>} />
              <Route path="/ocorrencias-prova/:provaId" element={<RequireAcesso papeis={["admin", "coordenador"]}><OcorrenciasProva /></RequireAcesso>} />
              <Route path="/funcoes-colaboradores" element={<RequireAcesso papeis={["admin"]}><FuncoesColaboradores /></RequireAcesso>} />
              <Route path="/documentos-impressao/:provaId" element={<RequireAcesso papeis={["admin"]}><DocumentosImpressao /></RequireAcesso>} />
              <Route path="/painel-dados-colaboradores/:provaId" element={<RequireAcesso papeis={["admin"]}><PainelDadosColaboradores /></RequireAcesso>} />
              <Route path="/gerenciar-usuarios" element={<RequireAcesso papeis={["superadmin"]}><GerenciarUsuarios /></RequireAcesso>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;