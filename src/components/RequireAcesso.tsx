import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Guarda única das páginas de gestão.
 *
 * O QUE ELA CENTRALIZA — e por que é isto, e não os papéis
 * Cada página escrevia o próprio guard à mão, e o erro sempre foi de MECÂNICA, nunca de
 * política: `Colaboradores` e `FuncoesColaboradores` mandavam o deslogado para `/auth` e
 * paravam por aí, sem checar papel; `/perfil` não tinha guard nenhum; `Dashboard` usava
 * `role !== null` como proxy de `rolesLoaded` e prendia o colaborador puro numa tela
 * branca. Três omissões diferentes, todas na mesma engrenagem.
 *
 * Então é a engrenagem que mora aqui: esperar `rolesLoaded`, respeitar `isLoggingOut`,
 * mandar deslogado para `/auth` e papel insuficiente para o hub. Os PAPÉIS continuam
 * declarados rota a rota no `App.tsx`, onde dá para ler a política inteira de uma vez.
 *
 * ⚠️ POR QUE NÃO LER OS PAPÉIS DO REGISTRO DE MÓDULOS, como o backlog propunha
 * O registro conhece papel por MÓDULO, e as rotas são mais finas que o módulo:
 * `aplicacao-provas` admite `coordenador`, mas `/dashboard`, `/unidades-prova`,
 * `/salas-prova`, `/gerenciar-salas-distribuidas`, `/funcoes-colaboradores`,
 * `/documentos-impressao` e `/painel-dados-colaboradores` são **só admin**. Um wrapper
 * lendo o registro daria a essas sete um acesso que elas nunca tiveram — afrouxamento,
 * não refatoração. E `modulos.ts` diz no cabeçalho, em letra grande, que segurança não
 * mora lá: ele é UX (o que mostrar e esconder).
 *
 * E o de sempre: isto é UX/roteamento. Quem barra de verdade é a RLS e as checagens das
 * Edge Functions. Guard furado é porta aberta na tela, não vazamento de dado.
 */

/** Papéis que uma rota pode exigir. `admin` já inclui superadmin (ver `useAuth`). */
export type PapelExigido = "superadmin" | "admin" | "coordenador" | "colaborador";

interface RequireAcessoProps {
  /** Basta ter UM destes. */
  papeis: PapelExigido[];
  children: ReactNode;
}

export function RequireAcesso({ papeis, children }: RequireAcessoProps) {
  const { user, loading, rolesLoaded, isAdmin, isSuperAdmin, isCoordenador, isColaborador, isLoggingOut } =
    useAuth();

  // O `signOut` limpa o usuário e só depois navega. Sem isto, o guard dispararia o
  // próprio redirecionamento no meio do caminho.
  if (isLoggingOut) return null;

  // Esperar `rolesLoaded`, não só `loading`: cada `applySession` (todo refresh de token)
  // reabre a janela em que o usuário já existe e os papéis ainda não. Decidir ali é
  // decidir sobre um conjunto vazio — e foi o que prendeu o colaborador puro numa tela
  // branca no Dashboard, que usava `role !== null` como proxy disto.
  if (loading || !rolesLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const temAcesso = papeis.some((papel) => {
    if (papel === "superadmin") return isSuperAdmin;
    if (papel === "admin") return isAdmin; // inclui superadmin
    if (papel === "coordenador") return isCoordenador;
    return isColaborador;
  });

  // Sem o papel, volta ao hub — que é quem sabe para onde cada um vai (o colaborador
  // puro, por exemplo, segue de lá para o próprio cadastro). Mandar direto para
  // `/perfil-colaborador` daqui duplicaria aquela decisão em dois lugares.
  if (!temAcesso) return <Navigate to="/" replace />;

  return <>{children}</>;
}
