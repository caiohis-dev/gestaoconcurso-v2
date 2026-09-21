import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizarCpfOuNull } from "./cpf.ts";

// Testes puros, sem rede — a camada que faltava. `reivindicar-acesso` e
// `incluir-email-cadastro` tiveram o defeito do padStart-antes-do-length por sete
// semanas depois do conserto em `check-cpf-colaborador` (02/08) sem NENHUM teste
// guardando a regra, porque nenhuma das duas tinha arquivo de teste.

Deno.test("normalizarCpfOuNull: 11 dígitos, sem formatação → passa", () => {
  assertEquals(normalizarCpfOuNull("12345678900"), "12345678900");
});

Deno.test("normalizarCpfOuNull: 11 dígitos, COM pontuação → normaliza e passa", () => {
  assertEquals(normalizarCpfOuNull("123.456.789-00"), "12345678900");
});

Deno.test("normalizarCpfOuNull: CPF legítimo que começa com zero, digitado INTEIRO → passa", () => {
  // O controle positivo que a versão ingênua ("nunca aceitar zero à esquerda")
  // quebraria: 33% dos colaboradores têm CPF assim, e é o caso comum, não a exceção.
  assertEquals(normalizarCpfOuNull("00262605732"), "00262605732");
});

Deno.test("🔴 FALSIFICAÇÃO: 9 dígitos NÃO viram o CPF de outra pessoa", () => {
  // É o caso exato do defeito: antes do conserto, `padStart(11,'0')` transformava
  // isto em "00262605732" — o CPF real de um colaborador (medido no banco local).
  // Devolver esse valor aqui seria reintroduzir o defeito.
  const resultado = normalizarCpfOuNull("262605732");
  assertEquals(resultado, null);
  // A prova mais direta: o resultado nunca pode ser a string de 11 dígitos que o
  // padStart teria produzido.
  if (resultado !== null) {
    throw new Error(`normalizarCpfOuNull não deveria preencher com zero: devolveu ${resultado}`);
  }
});

Deno.test("normalizarCpfOuNull: string com pontuação que ESCONDE poucos dígitos reais → null", () => {
  // O caso mais fraco de todos: 11+ CARACTERES, mas poucos dígitos. É exatamente o
  // que passava no Zod de `incluir-email-cadastro` (`min(11).max(14)` conta
  // caracteres da string, não dígitos).
  assertEquals(normalizarCpfOuNull("AB1234567-8"), null); // 11 chars, 8 dígitos
});

Deno.test("normalizarCpfOuNull: vazio → null", () => {
  assertEquals(normalizarCpfOuNull(""), null);
});

Deno.test("normalizarCpfOuNull: mais de 11 dígitos → null (nunca trunca)", () => {
  assertEquals(normalizarCpfOuNull("123456789001234"), null);
});

Deno.test("normalizarCpfOuNull: só zeros, 11 dígitos → passa (a blacklist de repetidos é do cpfValido, não daqui)", () => {
  // Esta função só confere FORMATO. `00000000000` tem 11 dígitos e passa aqui —
  // quem barra dígito repetido é `cpfValido` (módulo 11, só no frontend). Este
  // teste documenta o limite: não é regressão, é escopo.
  assertEquals(normalizarCpfOuNull("00000000000"), "00000000000");
});
