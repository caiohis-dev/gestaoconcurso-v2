import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  apagarUltimaAtividade,
  faseDaSessao,
  lerUltimaAtividade,
  limiteDeInatividade,
  registrarAtividade,
} from "@/lib/inatividade";

/** O que conta como "a pessoa está aqui". */
const EVENTOS_DE_ATIVIDADE = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"] as const;

/** Escrever no localStorage a cada `mousemove` é desperdício: uma marca por segundo basta. */
const INTERVALO_MINIMO_ESCRITA_MS = 1000;

/**
 * Logout por inatividade para TODO usuário logado, em qualquer tela (montado uma vez no `App`).
 * A regra — tempos, marca compartilhada entre abas, fase — mora em `src/lib/inatividade.ts`.
 *
 * - Conta pela última atividade de QUALQUER aba (a sessão é uma só para todas).
 * - Um minuto antes, abre o aviso com contagem regressiva. Com ele aberto, mexer o mouse
 *   NÃO estende a sessão: só o botão — senão o aviso fecharia sozinho sem a pessoa ler.
 *   Atividade em OUTRA aba fecha o aviso, porque ela de fato está usando o sistema.
 * - Ao estourar, `signOut({ motivo: "inatividade" })`: sai só deste navegador e a tela de
 *   login diz o porquê.
 * - Sem sessão, apaga a marca: a próxima sessão, por qualquer caminho de entrada (senha,
 *   link de acesso), começa a contar do zero, e não de uma marca velha.
 */
export function ControleInatividade() {
  const { user, loading, rolesLoaded, isColaboradorSemGestao, signOut } = useAuth();
  const [restanteMs, setRestanteMs] = useState<number | null>(null);
  const avisoAberto = useRef(false);
  const saindo = useRef(false);

  const ativo = !!user && rolesLoaded;
  const limiteMs = limiteDeInatividade(isColaboradorSemGestao);

  useEffect(() => {
    if (!loading && !user) apagarUltimaAtividade();
  }, [loading, user]);

  useEffect(() => {
    if (!ativo) return;

    // Primeira sessão desde que este controle existe (ou storage limpo): conta de agora.
    if (lerUltimaAtividade() === null) registrarAtividade(Date.now());

    let ultimaEscrita = 0;
    const aoAgir = () => {
      if (avisoAberto.current) return;
      const agora = Date.now();
      if (agora - ultimaEscrita < INTERVALO_MINIMO_ESCRITA_MS) return;
      ultimaEscrita = agora;
      registrarAtividade(agora);
    };

    const conferir = () => {
      if (saindo.current) return;
      const fase = faseDaSessao(lerUltimaAtividade() ?? Date.now(), Date.now(), limiteMs);
      if (fase.fase === "expirada") {
        saindo.current = true;
        void signOut({ motivo: "inatividade" });
        return;
      }
      avisoAberto.current = fase.fase === "aviso";
      setRestanteMs(fase.fase === "aviso" ? fase.restanteMs : null);
    };

    // Ao abrir o site com sessão de ontem, a marca velha já dá "expirada" aqui mesmo.
    conferir();
    const intervalo = setInterval(conferir, 1000);
    // Aba em segundo plano tem o timer atrasado pelo navegador: confere ao voltar.
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") conferir();
    };
    EVENTOS_DE_ATIVIDADE.forEach((e) => document.addEventListener(e, aoAgir, { passive: true }));
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      clearInterval(intervalo);
      EVENTOS_DE_ATIVIDADE.forEach((e) => document.removeEventListener(e, aoAgir));
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      avisoAberto.current = false;
      setRestanteMs(null);
    };
  }, [ativo, limiteMs, signOut]);

  const continuar = () => {
    registrarAtividade(Date.now());
    avisoAberto.current = false;
    setRestanteMs(null);
  };

  const sair = () => {
    saindo.current = true;
    void signOut({ motivo: "inatividade" });
  };

  const segundos = restanteMs === null ? 0 : Math.ceil(restanteMs / 1000);

  return (
    <AlertDialog open={restanteMs !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você ainda está aí?</AlertDialogTitle>
          <AlertDialogDescription>
            Por inatividade, sua sessão será encerrada em <strong>{segundos} segundo(s)</strong>. Dados não salvos
            serão perdidos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={sair}>Sair</AlertDialogCancel>
          <AlertDialogAction onClick={continuar}>Continuar conectado</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
