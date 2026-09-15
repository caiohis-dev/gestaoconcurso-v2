/**
 * Conversão de data vinda de PLANILHA para `YYYY-MM-DD`.
 *
 * Extraída de `CadastroLote.tsx` em 2026-09-15, junto com a correção do bug da base do
 * serial do Excel. **Ela morava dentro do componente e por isso não tinha como ser
 * testada** — era a dívida que `testes.md` descreve ("a mesma classe de lógica vive
 * dentro de um componente de 1.100 linhas e não tem como ser exercitada").
 *
 * 🔴 O BUG QUE ISTO CORRIGE, e a conta que o prova
 * O código usava `new Date(1899, 11, 20)` — base **20/12/1899** — com o comentário
 * "conforme especificado". A base do serial do Excel (sistema 1900) é **30/12/1899**,
 * que é o que `src/lib/candidatos-import.ts` sempre usou. Dez dias de diferença:
 *
 *     serial 23906  →  base 20/12/1899 = 1965-06-03   ← o que ficou gravado
 *                   →  base 30/12/1899 = 1965-06-13   ← a data verdadeira
 *
 * Medido em produção pelo arquivo de correção de 15/09: das 94 datas de nascimento
 * erradas, **89 estavam exatamente 10 dias antes da verdade**. Não eram 89 erros de
 * digitação — era esta linha.
 *
 * ⚠️ Corrigir aqui NÃO corrige quem já entrou. Os cadastros importados antes de 15/09
 * seguem 10 dias atrás, e só se conserta com script de dados.
 *
 * A aritmética é toda em **UTC** de propósito: `new Date(1899, 11, 20)` era hora LOCAL,
 * e em 1899 o fuso do Brasil era LMT (-03:06:28). Somar dias inteiros sobre um offset de
 * minutos quebrados e ler o dia com `getDate()` pode deslocar a data em um dia.
 */
export function converterDataPlanilha(valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') {
    return '';
  }

  // Serial do Excel. O guarda é `typeof valor !== 'string'`: só célula NUMÉRICA é tratada
  // como serial — '19052' digitado como texto cai nos formatos abaixo.
  const numeroSerial = Number(valor);
  if (!isNaN(numeroSerial) && Number.isInteger(numeroSerial) && typeof valor !== 'string') {
    const base = Date.UTC(1899, 11, 30);
    return new Date(base + numeroSerial * 86400000).toISOString().slice(0, 10);
  }

  const texto = String(valor).trim();

  // Já em formato ISO YYYY-MM-DD
  let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa (aceita 1 ou 2 dígitos para dia/mês)
  m = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const dia = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    return `${m[3]}-${mes}-${dia}`;
  }

  // ddmmaaaa (8 dígitos, sem separador)
  const soDigitos = texto.replace(/\D/g, '');
  if (soDigitos.length === 8) {
    return `${soDigitos.slice(4, 8)}-${soDigitos.slice(2, 4)}-${soDigitos.slice(0, 2)}`;
  }

  // Não reconheceu: devolve o texto como veio, e o BANCO recusa com 22007/22008 —
  // que o `CadastroLote` traduz para "Data inválida. Use DD/MM/AAAA ou DDMMAAAA".
  // É deliberado: melhor a linha falhar falando do que entrar com data inventada.
  return texto;
}
