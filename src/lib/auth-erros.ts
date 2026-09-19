/**
 * Traduz o erro de login do GoTrue para uma frase que diz O QUE FAZER.
 *
 * 🔴 Por que isto existe (2026-09-19): o `Auth.tsx` traduzia **só** "Invalid login
 * credentials" e deixava todo o resto chegar ao usuário como veio — em inglês. A pior
 * consequência não é o idioma, é o silêncio prático: quem acabou de ter o e-mail
 * corrigido pela `corrigir-email-acesso` vê **"Email not confirmed"** e não tem como
 * adivinhar que a providência é abrir o link enviado ao endereço NOVO. E esse estado não
 * é acidente: aquela EF deixa a conta pendente de propósito (`email_confirm: false`),
 * para a pessoa provar posse da caixa. Medido em 19/09: **6 contas não confirmadas, 5
 * delas com cadastro de colaborador.**
 *
 * ⚠️ Os códigos abaixo foram MEDIDOS contra o GoTrue local, não deduzidos:
 *   - senha errada, e-mail inexistente e e-mail malformado → todos `invalid_credentials`
 *     / "Invalid login credentials" (os três, indistinguíveis — e é assim que tem de ser:
 *     distinguir "não existe" de "senha errada" faria da tela um oráculo de contas);
 *   - conta não confirmada → `email_not_confirmed` / "Email not confirmed".
 *
 * O teto de sign-in é da plataforma (30/5 min por IP, medido no dashboard em 13/08) e não
 * foi exercitado aqui — por isso ele casa por código E por texto, e cai no genérico se
 * nenhum bater. **Nunca devolva `undefined`:** sem frase, o toast fica vazio e o erro
 * some, que é justamente o defeito que esta função existe para impedir.
 */
export function mensagemDeErroDeLogin(error: { code?: string; message?: string } | null): string {
  const codigo = (error?.code ?? "").toLowerCase();
  const texto = (error?.message ?? "").toLowerCase();
  const casa = (...chaves: string[]) =>
    chaves.some((c) => codigo === c || texto.includes(c.replace(/_/g, " ")));

  if (casa("invalid_credentials", "invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (casa("email_not_confirmed", "email not confirmed")) {
    return (
      "A sua conta ainda não foi confirmada. Abra o link que enviamos ao seu e-mail e defina a senha por lá. " +
      'Se o link expirou ou você não o recebeu, use "Estou sem minha senha" logo abaixo.'
    );
  }

  if (casa("over_request_rate_limit", "over_email_send_rate_limit", "request rate limit reached")) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";
  }

  if (casa("user_banned")) {
    return "Este acesso está bloqueado. Procure a coordenação.";
  }

  // Genérico, mas nunca vazio — e sem repassar texto em inglês que a pessoa não pode usar.
  return 'Não foi possível entrar. Tente de novo em alguns instantes, ou use "Estou sem minha senha".';
}
