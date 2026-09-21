import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { enviarLinkAcesso, escolherTipoLink } from "./enviar-link-acesso.ts";
import { buscarContaPorEmail } from "./auth-lookup.ts";

// Testes do lado Deno do envio do link de acesso (tema de 2026-09-19: o invite que
// morria calado em e-mail com conta). Cobrem a DECISÃO — invite ou recovery — e o
// retry, com cliente e fetch dublês. Nada de rede.
//
// 🔴 As três Edge Functions que chamam este helper NÃO são exercitadas aqui:
// `reivindicar-acesso`, `recuperar-senha` e `public-create-colaborador` ENVIAM E-MAIL
// DE VERDADE a partir do banco local (cópia de produção, endereços reais) e o
// generateLink('invite') CRIA conta fora de transação. O que o vínculo faz no banco é
// a bateria `docs/bateria-vinculo-colaborador.sql`.

// --- dublês -----------------------------------------------------------------

/** Dublê do endpoint admin/users: devolve as contas que a lista contiver. */
function fetchDeAuth(emails: string[], opts?: { falha?: boolean }): typeof fetch {
  return ((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("/auth/v1/admin/users")) {
      if (opts?.falha) return Promise.resolve(new Response("boom", { status: 500 }));
      const alvo = decodeURIComponent(u.split("filter=")[1] ?? "");
      const users = emails.filter((e) => e.includes(alvo)).map((email) => ({ email }));
      return Promise.resolve(Response.json({ users }));
    }
    // send-email
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
}

type Chamada = { type: string; email: string };

type LinhaTrilha = Record<string, unknown>;

/**
 * Dublê do supabase.auth.admin.generateLink + do `.from('log_envio_link_acesso')`
 * que `registrarTrilhaDeEnvio` passou a chamar. `trilha`, se passado, recebe cada
 * linha inserida — é o que os testes novos usam para conferir o que foi gravado.
 * `trilhaFalha` simula o INSERT falhando (RLS, conexão), para provar que o helper
 * segue best-effort mesmo aí.
 */
function clienteDuble(
  chamadas: Chamada[],
  opts?: {
    recusaInviteComoExistente?: boolean;
    trilha?: LinhaTrilha[];
    trilhaFalha?: boolean;
  },
) {
  return {
    auth: {
      admin: {
        generateLink: (params: { type: string; email: string }) => {
          chamadas.push({ type: params.type, email: params.email });
          if (params.type === "invite" && opts?.recusaInviteComoExistente) {
            return Promise.resolve({
              data: null,
              error: { code: "email_exists", message: "A user with this email address has already been registered" },
            });
          }
          return Promise.resolve({
            data: { properties: { action_link: "https://exemplo.test/link" } },
            error: null,
          });
        },
      },
    },
    from: (tabela: string) => ({
      insert: (linha: LinhaTrilha) => {
        if (tabela !== "log_envio_link_acesso") {
          throw new Error(`dublê não implementa .from('${tabela}')`);
        }
        if (opts?.trilhaFalha) {
          return Promise.resolve({ error: { message: "RLS recusou o insert (dublê)" } });
        }
        opts?.trilha?.push(linha);
        return Promise.resolve({ error: null });
      },
    }),
    // O dublê implementa só o que o helper usa; o cast atravessa o tipo do cliente
    // real sem trazer `any` para o projeto.
  } as unknown as Parameters<typeof enviarLinkAcesso>[0];
}

// --- a decisão, pura --------------------------------------------------------

Deno.test("escolherTipoLink: conta encontrada pede recovery", () => {
  assertEquals(escolherTipoLink({ estado: "encontrada", user: { email: "a@b.com" } }), "recovery");
});

Deno.test("escolherTipoLink: conta ausente pede invite", () => {
  assertEquals(escolherTipoLink({ estado: "ausente" }), "invite");
});

Deno.test("escolherTipoLink: consulta INDISPONÍVEL cai em invite", () => {
  // 🟢 Controle positivo do conserto: quando o Auth não responde, o comportamento tem
  // de ser exatamente o de antes desta mudança — invite. Quem inverter isto passa a
  // mandar recovery para conta que talvez nem exista.
  assertEquals(escolherTipoLink({ estado: "indisponivel" }), "invite");
});

// --- a busca ----------------------------------------------------------------

Deno.test("buscarContaPorEmail: o filtro é PARCIAL, e o e-mail exato é conferido", async () => {
  // Sem a conferência exata, "ana@x.com" casaria "mariana@x.com" — e o link iria para
  // a caixa da outra pessoa.
  const conta = await buscarContaPorEmail("ana@x.com", {
    fetchImpl: fetchDeAuth(["mariana@x.com"]),
    supabaseUrl: "https://exemplo.test",
    serviceKey: "k",
  });
  assertEquals(conta.estado, "ausente");
});

Deno.test("buscarContaPorEmail: consulta que falha vira 'indisponivel', não 'ausente'", async () => {
  const conta = await buscarContaPorEmail("ana@x.com", {
    fetchImpl: fetchDeAuth([], { falha: true }),
    supabaseUrl: "https://exemplo.test",
    serviceKey: "k",
  });
  assertEquals(conta.estado, "indisponivel");
});

// --- o envio ----------------------------------------------------------------

Deno.test("enviarLinkAcesso: sem tipo, e-mail SEM conta → invite", async () => {
  const chamadas: Chamada[] = [];
  const r = await enviarLinkAcesso(clienteDuble(chamadas), {
    email: "novo@x.com",
    nome: "Fulano",
    origem: "teste",
    fetchImpl: fetchDeAuth([]),
  });
  assertEquals(r.ok, true);
  assertEquals(r.tipoUsado, "invite");
  assertEquals(chamadas, [{ type: "invite", email: "novo@x.com" }]);
});

Deno.test("enviarLinkAcesso: sem tipo, e-mail que JÁ tem conta → recovery", async () => {
  // 🔴 É o defeito do item de backlog: aqui o invite era gerado, recusado, e o
  // chamador respondia "link enviado" sem que nada saísse.
  const chamadas: Chamada[] = [];
  const r = await enviarLinkAcesso(clienteDuble(chamadas), {
    email: "tem@conta.com",
    nome: "Fulano",
    origem: "teste",
    fetchImpl: fetchDeAuth(["tem@conta.com"]),
  });
  assertEquals(r.ok, true);
  assertEquals(r.tipoUsado, "recovery");
  assertEquals(chamadas, [{ type: "recovery", email: "tem@conta.com" }]);
});

Deno.test("enviarLinkAcesso: invite recusado com email_exists é REPETIDO como recovery", async () => {
  // A corrida que a consulta não cobre: a conta nasce entre perguntar e gerar. Sem o
  // retry, o e-mail se perderia do mesmo jeito.
  const chamadas: Chamada[] = [];
  const r = await enviarLinkAcesso(
    clienteDuble(chamadas, { recusaInviteComoExistente: true }),
    { email: "corrida@x.com", nome: "Fulano", origem: "teste", fetchImpl: fetchDeAuth([]) },
  );
  assertEquals(r.ok, true);
  assertEquals(r.tipoUsado, "recovery");
  assertEquals(chamadas.map((c) => c.type), ["invite", "recovery"]);
});

Deno.test("enviarLinkAcesso: tipo EXPLÍCITO não consulta o Auth", async () => {
  // Prova de que `corrigir-email-acesso` ('recovery') e os dois ramos da
  // `recuperar-senha` ficaram intactos: nenhuma consulta a mais, nenhuma decisão nova.
  const chamadas: Chamada[] = [];
  let consultas = 0;
  const fetchImpl = ((url: string | URL | Request) => {
    if (String(url).includes("/auth/v1/admin/users")) consultas++;
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;

  const r = await enviarLinkAcesso(clienteDuble(chamadas), {
    email: "explicito@x.com",
    nome: "Fulano",
    tipo: "recovery",
    contexto: "redefinir",
    origem: "teste",
    fetchImpl,
  });
  assertEquals(r.ok, true);
  assertEquals(consultas, 0);
  assertEquals(chamadas, [{ type: "recovery", email: "explicito@x.com" }]);
});

Deno.test("enviarLinkAcesso: send-email que falha devolve ok=false COM motivo", async () => {
  // O chamador precisa de algo para logar — foi o `{ ok }` mudo que escondeu o defeito.
  const chamadas: Chamada[] = [];
  const fetchImpl = ((url: string | URL | Request) => {
    if (String(url).includes("/auth/v1/admin/users")) return Promise.resolve(Response.json({ users: [] }));
    return Promise.resolve(new Response("smtp caiu", { status: 500 }));
  }) as typeof fetch;

  const r = await enviarLinkAcesso(clienteDuble(chamadas), {
    email: "novo@x.com",
    nome: "Fulano",
    origem: "teste",
    fetchImpl,
  });
  assertEquals(r.ok, false);
  assertEquals(r.tipoUsado, "invite");
  assertEquals(r.motivo, "smtp caiu");
});

// --- a trilha (migration 20260921005259) -------------------------------------

Deno.test("enviarLinkAcesso: sucesso grava UMA linha na trilha, com os campos certos", async () => {
  const chamadas: Chamada[] = [];
  const trilha: Record<string, unknown>[] = [];
  const r = await enviarLinkAcesso(clienteDuble(chamadas, { trilha }), {
    email: "novo@x.com",
    nome: "Fulano de Tal",
    origem: "reivindicar-acesso",
    colaboradorId: "11111111-1111-1111-1111-111111111111",
    fetchImpl: fetchDeAuth([]),
  });
  assertEquals(r.ok, true);
  assertEquals(trilha.length, 1);
  assertEquals(trilha[0], {
    colaborador_id: "11111111-1111-1111-1111-111111111111",
    colab_nome: "Fulano de Tal",
    email: "novo@x.com",
    origem: "reivindicar-acesso",
    tipo_usado: "invite",
    sucesso: true,
    motivo_falha: null,
  });
});

Deno.test("enviarLinkAcesso: falha do generateLink grava sucesso=false COM o motivo", async () => {
  // Dublê que sempre recusa o generateLink, para exercitar o primeiro `finalizar`.
  const trilha: Record<string, unknown>[] = [];
  const clienteQueRecusaOLink = {
    auth: {
      admin: {
        generateLink: () =>
          Promise.resolve({ data: null, error: { message: "boom no Auth" } }),
      },
    },
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        assertEquals(tabela, "log_envio_link_acesso");
        trilha.push(linha);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as Parameters<typeof enviarLinkAcesso>[0];

  const r = await enviarLinkAcesso(clienteQueRecusaOLink, {
    email: "recusa@x.com",
    nome: "Fulano",
    origem: "public-create-colaborador",
    fetchImpl: fetchDeAuth([]),
  });
  assertEquals(r.ok, false);
  assertEquals(trilha.length, 1);
  assertEquals(trilha[0].sucesso, false);
  assertEquals(trilha[0].motivo_falha, "boom no Auth");
  // Sem colaboradorId no chamador: grava NULL, não string vazia nem "undefined".
  assertEquals(trilha[0].colaborador_id, null);
});

Deno.test("enviarLinkAcesso: falha do send-email grava sucesso=false COM o motivo", async () => {
  const trilha: Record<string, unknown>[] = [];
  const chamadas: Chamada[] = [];
  const fetchImpl = ((url: string | URL | Request) => {
    if (String(url).includes("/auth/v1/admin/users")) return Promise.resolve(Response.json({ users: [] }));
    return Promise.resolve(new Response("smtp caiu de novo", { status: 500 }));
  }) as typeof fetch;

  const r = await enviarLinkAcesso(clienteDuble(chamadas, { trilha }), {
    email: "novo2@x.com",
    nome: "Fulano",
    origem: "incluir-email-cadastro",
    fetchImpl,
  });
  assertEquals(r.ok, false);
  assertEquals(trilha.length, 1);
  assertEquals(trilha[0].sucesso, false);
  assertEquals(trilha[0].motivo_falha, "smtp caiu de novo");
  assertEquals(trilha[0].tipo_usado, "invite");
});

Deno.test("enviarLinkAcesso: INSERT da trilha falhando NÃO derruba o envio real", async () => {
  // 🔴 É o contrato do módulo inteiro: a trilha é best-effort. Se ela quebrar (RLS,
  // conexão), quem pediu o e-mail continua recebendo — só o console.error registra.
  const chamadas: Chamada[] = [];
  const r = await enviarLinkAcesso(clienteDuble(chamadas, { trilhaFalha: true }), {
    email: "resiliente@x.com",
    nome: "Fulano",
    origem: "reivindicar-acesso",
    fetchImpl: fetchDeAuth([]),
  });
  assertEquals(r.ok, true);
  assertEquals(r.tipoUsado, "invite");
});
