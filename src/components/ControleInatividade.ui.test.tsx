/**
 * Logout por inatividade (2026-11-03). O `useAuth` é mockado: o objeto do teste é o controle
 * ("dado este usuário e este tempo parado, o que acontece?"), não o provider — o `signOut`
 * com escopo local tem teste próprio em `useAuth.test.tsx`.
 *
 * Armadilha 4 de testes.md: timers falsos com `shouldAdvanceTime: true`, senão a RTL trava.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CHAVE_ULTIMA_ATIVIDADE } from "@/lib/inatividade";

const auth = vi.hoisted(() => ({
  user: { id: "u-1" } as { id: string } | null,
  loading: false,
  rolesLoaded: true,
  isColaboradorSemGestao: false,
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import { ControleInatividade } from "./ControleInatividade";

const MIN = 60 * 1000;
const INICIO = new Date("2026-11-03T12:00:00Z").getTime();

function passar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("ControleInatividade", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(INICIO);
    localStorage.clear();
    auth.user = { id: "u-1" };
    auth.loading = false;
    auth.rolesLoaded = true;
    auth.isColaboradorSemGestao = false;
    auth.signOut = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("⭐ CONTROLE POSITIVO: gestão parada 28 min — sem aviso e sem sair", () => {
    render(<ControleInatividade />);
    passar(28 * MIN);
    expect(screen.queryByText("Você ainda está aí?")).not.toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("🔴 gestão: avisa no último minuto e sai aos 30, só deste navegador", () => {
    render(<ControleInatividade />);
    passar(29 * MIN + 1000);
    expect(screen.getByText("Você ainda está aí?")).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();

    passar(MIN);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ motivo: "inatividade" });
  });

  it("🔴 colaborador sem gestão: sai aos 5 minutos", () => {
    auth.isColaboradorSemGestao = true;
    render(<ControleInatividade />);
    passar(4 * MIN + 1000);
    expect(screen.getByText("Você ainda está aí?")).toBeInTheDocument();
    passar(MIN);
    expect(auth.signOut).toHaveBeenCalledWith({ motivo: "inatividade" });
  });

  it("atividade recomeça a contagem", () => {
    render(<ControleInatividade />);
    passar(20 * MIN);
    fireEvent.keyDown(document);
    passar(20 * MIN); // 40 min desde o início, 20 desde a tecla
    expect(screen.queryByText("Você ainda está aí?")).not.toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("com o aviso aberto, mexer o mouse NÃO estende — só o botão", () => {
    render(<ControleInatividade />);
    passar(29 * MIN + 1000);
    fireEvent.mouseMove(document);
    passar(MIN);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("\"Continuar conectado\" fecha o aviso e recomeça a contagem", () => {
    render(<ControleInatividade />);
    passar(29 * MIN + 1000);
    fireEvent.click(screen.getByRole("button", { name: "Continuar conectado" }));
    expect(screen.queryByText("Você ainda está aí?")).not.toBeInTheDocument();
    passar(20 * MIN);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("🔴 atividade em OUTRA aba fecha o aviso e mantém a sessão", () => {
    render(<ControleInatividade />);
    passar(29 * MIN + 1000);
    expect(screen.getByText("Você ainda está aí?")).toBeInTheDocument();

    // A outra aba grava a marca compartilhada; esta só lê.
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(Date.now()));
    passar(2000);
    expect(screen.queryByText("Você ainda está aí?")).not.toBeInTheDocument();
    passar(MIN);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("🔴 sessão de ontem ao abrir o site: sai na hora", () => {
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(INICIO - 24 * 60 * MIN));
    render(<ControleInatividade />);
    expect(auth.signOut).toHaveBeenCalledWith({ motivo: "inatividade" });
  });

  it("sem sessão: não conta nada e apaga a marca velha", () => {
    auth.user = null;
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(INICIO - 24 * 60 * MIN));
    render(<ControleInatividade />);
    passar(60 * MIN);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE)).toBeNull();
  });

  it("⭐ CONTROLE POSITIVO: enquanto o Auth carrega, a marca NÃO é apagada", () => {
    auth.user = null;
    auth.loading = true;
    localStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(INICIO - MIN));
    render(<ControleInatividade />);
    expect(localStorage.getItem(CHAVE_ULTIMA_ATIVIDADE)).toBe(String(INICIO - MIN));
  });
});
