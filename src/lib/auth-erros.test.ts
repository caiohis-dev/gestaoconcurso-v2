import { describe, it, expect } from "vitest";
import { mensagemDeErroDeLogin } from "./auth-erros";

/**
 * O tradutor dos erros de login. Os códigos abaixo foram MEDIDOS contra o GoTrue local em
 * 2026-09-19 (não deduzidos): ver o comentário de `auth-erros.ts`.
 */
describe("mensagemDeErroDeLogin", () => {
  it("🔴 'Email not confirmed' deixa de chegar em inglês — e diz a providência", () => {
    // É o estado em que a `corrigir-email-acesso` deixa a conta DE PROPÓSITO. Antes de
    // 2026-09-19 a pessoa via a frase do GoTrue e não tinha como adivinhar que a saída é
    // abrir o link no endereço NOVO. Medido: 6 contas não confirmadas, 5 com cadastro.
    const msg = mensagemDeErroDeLogin({ code: "email_not_confirmed", message: "Email not confirmed" });
    expect(msg).toMatch(/não foi confirmada/i);
    expect(msg).toMatch(/Estou sem minha senha/);
    expect(msg).not.toMatch(/Email not confirmed/);
  });

  it("casa pelo CÓDIGO mesmo sem a mensagem", () => {
    // A forma do erro do supabase-js já mudou entre versões; depender só do texto é
    // depender de algo que não é contrato.
    expect(mensagemDeErroDeLogin({ code: "email_not_confirmed" })).toMatch(/não foi confirmada/i);
  });

  it("casa pelo TEXTO mesmo sem o código", () => {
    expect(mensagemDeErroDeLogin({ message: "Email not confirmed" })).toMatch(/não foi confirmada/i);
  });

  it("senha errada, conta inexistente e e-mail malformado dão a MESMA frase", () => {
    // Medido: os três devolvem `invalid_credentials`. Distinguir seria transformar a tela
    // de login num oráculo de quem tem cadastro — a mesma regra que a `recuperar-senha`
    // sustenta do outro lado.
    const esperado = "E-mail ou senha incorretos.";
    expect(mensagemDeErroDeLogin({ code: "invalid_credentials" })).toBe(esperado);
    expect(mensagemDeErroDeLogin({ message: "Invalid login credentials" })).toBe(esperado);
  });

  it("teto da plataforma vira instrução de esperar", () => {
    expect(mensagemDeErroDeLogin({ code: "over_request_rate_limit" })).toMatch(/aguarde/i);
  });

  it("🟢 CONTROLE POSITIVO: erro desconhecido NUNCA volta vazio nem em inglês", () => {
    // Sem isto, um erro novo do GoTrue deixaria o toast sem descrição — e a falha some da
    // tela, que é exatamente o defeito que esta função existe para impedir.
    const msg = mensagemDeErroDeLogin({ code: "algo_novo_do_gotrue", message: "Something went wrong" });
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).not.toMatch(/Something went wrong/);
    expect(mensagemDeErroDeLogin(null).length).toBeGreaterThan(10);
  });
});
