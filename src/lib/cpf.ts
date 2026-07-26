/**
 * Validação de CPF pelos dígitos verificadores (módulo 11).
 *
 * POR QUE ISTO EXISTE
 * Até 2026-07-26 o sistema conferia **tamanho**, não validade. Pior: o
 * `ColaboradorDialog` montava o payload com `onlyDigits(...).padStart(11, '0')`
 * **antes** do `parse`, então todo CPF chegava ao Zod já com 11 caracteres — a
 * checagem `.length(11)` nunca falhava. Digitar 6 dígitos gravava `00000123456`, um
 * CPF de outra pessoa; deixar em branco gravava `00000000000`.
 *
 * O banco também não segurava: o CHECK criado no tema das constraints exige 11
 * DÍGITOS, e zeros são dígitos.
 *
 * ⚠️ A BLACKLIST NÃO É ZELO EXTRA, É PARTE DO ALGORITMO
 * Sequências de dígitos repetidos **passam na aritmética do módulo 11**. Confira:
 *   11111111111 → S₁ = 1×(10+9+…+2) = 54; 54 mod 11 = 10; DV₁ = 11−10 = 1 ✓
 *                 S₂ = 1×(11+10+…+2) = 65; 65 mod 11 = 10; DV₂ = 11−10 = 1 ✓
 *   00000000000 → somas zero; resto 0 < 2; DV₁ = DV₂ = 0 ✓
 * Sem a rejeição sumária, os dois entrariam — e o segundo é exatamente o que o
 * defeito do `padStart` produzia.
 *
 * ⚠️ O RAMO `resto < 2` é onde implementação ingênua erra: restos 0 e 1 dão DV **0**,
 * não `11 - resto` (que daria 11 e 10, impossíveis num dígito).
 *
 * FORA DE ESCOPO: unicidade (é do banco) e formato/máscara (é do input).
 */

/** Só os dígitos — aceita CPF com ou sem máscara. */
function apenasDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Um dígito verificador, dado o trecho e o peso inicial (10 para o 1º, 11 para o 2º). */
function digitoVerificador(digitos: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * `true` só quando o CPF tem 11 dígitos, não é uma sequência repetida, e os dois
 * dígitos verificadores conferem.
 */
export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitos(valor);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const dv1 = digitoVerificador(cpf.slice(0, 9), 10);
  const dv2 = digitoVerificador(cpf.slice(0, 10), 11);

  return Number(cpf[9]) === dv1 && Number(cpf[10]) === dv2;
}
