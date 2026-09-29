// Valor digitado pelo usuário como padrão LITERAL de ilike — um lugar só.
//
// Criado em 2026-09-28 (my_rules/analises/roadmap-ilike-curinga-email.yaml). No ILIKE do
// Postgres, `_` casa um caractere qualquer e `%` casa qualquer sequência; o PostgREST
// ainda traduz `*` para `%`. Passar o e-mail cru ao `.ilike()` fazia `maria_souza@…`
// casar o cadastro de `maria.souza@…` — e a recuperar-senha mandava o convite para o
// endereço DIGITADO, criando conta com o signup desligado.
//
// O `ilike` continua sendo o operador certo: ele é o que compara SEM CAIXA (13 de 578
// e-mails do cadastro têm maiúscula, medido em 16/09 — um `.eq` os perderia). O que
// muda é que o valor deixa de ser padrão e passa a ser texto.
//
// 🔴 A barra vai PRIMEIRO. Escapar `_` antes dela e depois escapar a barra duplicaria a
// barra que acabou de entrar, e o `_` voltaria a ser curinga.
//
// ⚠️ O `*` não se escapa com barra: ele é tradução do PostgREST, não do Postgres. Hoje o
// zod `.email()` o recusa antes de chegar aqui (medido); se isso mudar, a busca com `*`
// volta a ser curinga. Por isso o texto com `*` é RECUSADO aqui, em vez de silenciosamente
// deixado passar.

export function padraoLiteral(valor: string): string {
  if (valor.includes('*')) {
    throw new Error('padraoLiteral: `*` não pode ser escapado no ilike do PostgREST');
  }
  return valor.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
