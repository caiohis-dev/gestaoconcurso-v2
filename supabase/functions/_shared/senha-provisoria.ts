// Senha provisória do "Resetar senha" do superadmin (resetar-senha-colaborador).
//
// Gerada NO SERVIDOR, nunca digitada pelo superadmin: senha escolhida por gestor tende
// a ser a mesma para todo mundo ("Mudar123"), e então quem conhece uma conhece todas.
//
// O alfabeto tira os caracteres que se confundem ao DITAR ou COPIAR À MÃO — é assim que
// a senha chega à pessoa (telefone, papel). Fora: 0 O o, 1 l I, e símbolos.
//   56 símbolos ^ 12 ≈ 2^69 — folga ampla para uma senha que deve ser trocada logo.
//
// ⚠️ Sorteio sem viés de módulo: `getRandomValues` dá bytes de 0..255, e 256 não é
// múltiplo de 56 — `byte % 56` favoreceria os 32 primeiros caracteres. Os bytes a
// partir do maior múltiplo (224) são descartados.

export const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const TAMANHO_SENHA = 12;

export function gerarSenhaProvisoria(tamanho: number = TAMANHO_SENHA): string {
  const n = ALFABETO_SENHA.length;
  const limite = 256 - (256 % n);
  let senha = '';
  while (senha.length < tamanho) {
    const bytes = crypto.getRandomValues(new Uint8Array(tamanho * 2));
    for (const b of bytes) {
      if (b >= limite) continue;
      senha += ALFABETO_SENHA[b % n];
      if (senha.length === tamanho) break;
    }
  }
  return senha;
}
