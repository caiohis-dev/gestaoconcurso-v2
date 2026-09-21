// Normalização de CPF, num lugar só — para as Edge Functions que precisam
// resolver "esses dígitos são um CPF de 11 posições, ou não?" antes de consultar
// ou gravar `colaboradores.colab_cpf`.
//
// 🔴 POR QUE ISTO EXISTE (2026-09-21)
// `check-cpf-colaborador` corrigiu este defeito em 2026-08-02: fazia
// `.padStart(11, '0')` ANTES de checar `length !== 11`, então entrada CURTA nunca
// falhava — 9 dígitos viravam `00` + os 9, o CPF de OUTRA PESSOA. O conserto só
// tocou aquele arquivo. `reivindicar-acesso` e `incluir-email-cadastro`
// reimplementavam a mesma lógica com o MESMO defeito, e sobreviveram 7 semanas:
//   - `reivindicar-acesso`: entrada curta encontra o cadastro de um estranho e
//     REVELA o e-mail mascarado dele, ou dispara um INVITE para a caixa dele.
//   - `incluir-email-cadastro`: pior — o Zod ali (`min(11).max(14)`) conta
//     CARACTERES da string, não dígitos, então uma entrada com pontuação e menos
//     dígitos reais também passava. É a porta que GRAVA `colab_email` sem prova de
//     posse (dívida já aceita em `dividas-auth-colaborador.md` §5) — a barra para
//     atingir um estranho ficava mais baixa do que aquela decisão assumiu.
// `public-create-colaborador` tinha a mesma reimplementação, sem checagem de
// tamanho nenhuma depois do pad (era INSERT, não busca — risco de qualidade de
// dado, contido pelo índice único, não de vazamento entre pessoas).
//
// MEDIDO antes de escrever: 275 dos 821 colaboradores (33%) têm CPF começando em
// zero — a colisão não é hipotética. Na população-alvo de `incluir-email-cadastro`
// (sem e-mail, não vinculado), são 88 dos 243 (36%).
//
// ⚠️ NÃO valida dígito verificador — só formato (11 dígitos). O módulo 11
// completo (`cpfValido`) vive só no frontend, `src/lib/cpf.ts`. Duplicá-lo aqui é
// decisão maior e fora de escopo deste conserto — ver `colaboradores.md`, que já
// registra a ausência dessa checagem no servidor como dívida separada e aceita.
//
// Verificação: cpf.test.ts (Deno, puro, sem rede — o teste que faltava).

/**
 * Só os dígitos, e SÓ se forem exatamente 11 — nunca preenche com zero.
 * Devolve `null` para qualquer coisa que não seja um CPF de 11 dígitos: curto,
 * longo, vazio, ou string com poucos dígitos reais escondida atrás de pontuação.
 */
export function normalizarCpfOuNull(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '');
  return digitos.length === 11 ? digitos : null;
}
