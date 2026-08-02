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
 * POR QUE O MOTIVO É PÚBLICO, e não só o `true/false`
 *
 * A importação de candidatos (2026-08-02) precisa **dizer ao usuário o que corrigir na
 * planilha**, e as três recusas pedem providências diferentes: 10 dígitos é truncamento
 * ou letra no meio; sequência repetida é campo preenchido com lixo; verificador errado é
 * dígito trocado. Uma mensagem só para os três seria imprecisa, e num caso seria **falsa**
 * — `11111111111` **passa** na aritmética (ver a conta no topo deste arquivo) e é recusado
 * pela blacklist, não pelos verificadores.
 *
 * A alternativa era a importação reimplementar o `/^(\d)\1{10}$/` para escolher o texto,
 * e é exatamente assim que uma regra ganha uma segunda cópia que depois diverge.
 */
export type MotivoCpfInvalido =
  | "caractere-invalido"
  | "tamanho"
  | "sequencia-repetida"
  | "digito-verificador";

/**
 * Os caracteres que não são dígito **nem pontuação de máscara**, sem repetição e na ordem
 * em que aparecem. Vazio quando só há dígitos e máscara.
 *
 * ⚠️ A MÁSCARA NÃO É INTRUSA. `123.456.789-00` é escrita normal de CPF: ponto, hífen e
 * espaço são formatação, e acusá-los transformaria o caminho feliz em queixa. O que esta
 * função procura é o caractere que não tinha por que estar ali — a letra `O` no lugar do
 * zero, o caso real da inscrição 4256.
 */
export function caracteresIntrusos(valor: string): string[] {
  const intrusos = (valor ?? "").replace(/[\d.\-\s]/g, "");
  return [...new Set(intrusos)];
}

/**
 * O motivo da recusa, ou `null` quando o CPF é válido.
 *
 * A ORDEM DAS RECUSAS É A ORDEM DA CAUSA, não a da conveniência. `1O778817709` tem 11
 * caracteres e 10 dígitos: as duas coisas são verdade, mas **a letra é a causa e o
 * tamanho é a consequência**. Acusar o tamanho primeiro produzia a queixa que fez esta
 * mudança existir — *"não tem 11 dígitos"* sobre um campo em que se contam 11 caracteres,
 * verdadeira e inútil, porque não diz o que corrigir.
 */
export function motivoCpfInvalido(valor: string): MotivoCpfInvalido | null {
  const cpf = apenasDigitos(valor);

  if (caracteresIntrusos(valor).length > 0) return "caractere-invalido";
  if (cpf.length !== 11) return "tamanho";
  if (/^(\d)\1{10}$/.test(cpf)) return "sequencia-repetida";

  const dv1 = digitoVerificador(cpf.slice(0, 9), 10);
  const dv2 = digitoVerificador(cpf.slice(0, 10), 11);

  if (Number(cpf[9]) !== dv1 || Number(cpf[10]) !== dv2) return "digito-verificador";

  return null;
}

/**
 * `true` só quando o CPF tem 11 dígitos, não é uma sequência repetida, e os dois
 * dígitos verificadores conferem.
 */
export function cpfValido(valor: string): boolean {
  return motivoCpfInvalido(valor) === null;
}
