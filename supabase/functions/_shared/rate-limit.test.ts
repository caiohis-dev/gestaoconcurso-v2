import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { chaveDeOrigem, mensagemDoBloqueio, podeSeguir, TETOS } from "./rate-limit.ts";

// Testes do lado Deno do rate limit (Etapa 1 do roadmap). Cobrem o que é lógica PURA —
// a chave de origem — e o contrato de falha do `podeSeguir`, com um cliente dublê.
//
// ⚠️ As quatro Edge Functions que usam este helper NÃO são exercitadas aqui: três delas
// ENVIAM E-MAIL DE VERDADE, porque o banco local é cópia de produção e tem endereços
// reais. O que o teto faz no banco é a bateria `docs/bateria-rate-limit.sql`.

function req(xff?: string): Request {
  return new Request("https://exemplo.test/", {
    headers: xff ? { "x-forwarded-for": xff } : {},
  });
}

Deno.test("chaveDeOrigem: IPv4 passa inteiro", () => {
  assertEquals(chaveDeOrigem(req("203.0.113.7")), "203.0.113.7");
});

Deno.test("chaveDeOrigem: pega o PRIMEIRO da lista do XFF", () => {
  // O primeiro é o cliente; os seguintes são proxies. Pegar o último daria a chave do
  // próprio edge — um balde só para o mundo inteiro.
  assertEquals(chaveDeOrigem(req("203.0.113.7, 70.41.3.18, 150.172.238.178")), "203.0.113.7");
});

Deno.test("chaveDeOrigem: sem header vira 'desconhecido', nunca vazio", () => {
  // 🔴 Chave vazia seria pior que não ter teto: a RPC recusa string vazia, então a
  // requisição morreria em erro em vez de ser contada.
  assertEquals(chaveDeOrigem(req()), "desconhecido");
  assertEquals(chaveDeOrigem(req("   ")), "desconhecido");
});

Deno.test("chaveDeOrigem: IPv6 colapsa no prefixo /64", () => {
  // Os quatro primeiros grupos são a rede; o resto é a máquina — e as privacy extensions
  // rotacionam o resto sozinhas. Sem isto, uma casa teria ~18 quintilhões de tetos.
  assertEquals(chaveDeOrigem(req("2001:0db8:85a3:0000:1111:2222:3333:4444")), "2001:db8:85a3:0::/64");
});

Deno.test("chaveDeOrigem: o MESMO /64 escrito de duas formas dá a MESMA chave", () => {
  // É o ponto todo da normalização: "2001:db8:85a3:0::1" e a forma expandida são a mesma
  // rede. Se gerassem chaves diferentes, bastaria alternar a notação para zerar o teto.
  const curto = chaveDeOrigem(req("2001:db8:85a3::1"));
  const longo = chaveDeOrigem(req("2001:0db8:85a3:0000:0000:0000:0000:0001"));
  assertEquals(curto, longo);
});

Deno.test("chaveDeOrigem: máquinas diferentes na MESMA rede compartilham a chave", () => {
  const a = chaveDeOrigem(req("2001:db8:85a3:0:aaaa:bbbb:cccc:dddd"));
  const b = chaveDeOrigem(req("2001:db8:85a3:0:1111:2222:3333:4444"));
  assertEquals(a, b);
});

Deno.test("chaveDeOrigem: redes diferentes NÃO se misturam (controle positivo)", () => {
  // O inverso do caso acima: se tudo colapsasse na mesma chave, um vizinho barraria o
  // outro e o teto seria inútil na direção contrária.
  const a = chaveDeOrigem(req("2001:db8:85a3:1::1"));
  const b = chaveDeOrigem(req("2001:db8:85a3:2::1"));
  assertEquals(a === b, false);
});

/** Cliente dublê: só precisa do `.rpc()`. */
function clienteFake(resposta: { data: unknown; error: { message: string } | null }) {
  const chamadas: unknown[] = [];
  return {
    chamadas,
    // deno-lint-ignore no-explicit-any
    cliente: { rpc: (nome: string, args: unknown) => { chamadas.push({ nome, args }); return Promise.resolve(resposta); } } as any,
  };
}

Deno.test("podeSeguir: true quando a RPC libera", async () => {
  const { cliente } = clienteFake({ data: true, error: null });
  assertEquals(await podeSeguir(cliente, TETOS.acesso, "203.0.113.7"), true);
});

Deno.test("podeSeguir: false quando a RPC barra", async () => {
  const { cliente } = clienteFake({ data: false, error: null });
  assertEquals(await podeSeguir(cliente, TETOS.acesso, "203.0.113.7"), false);
});

Deno.test("🔴 podeSeguir: FALHA FECHADO — erro da RPC BLOQUEIA", async () => {
  // A regressão que define este tema. Até 2026-09-12 o código descartava o `error`, e
  // com a consulta falhando a requisição PASSAVA — o teto sumia justamente quando o banco
  // estava em apuros. Se este teste cair, o defeito voltou.
  const { cliente } = clienteFake({ data: null, error: { message: "connection refused" } });
  assertEquals(await podeSeguir(cliente, TETOS.acesso, "203.0.113.7"), false);
});

Deno.test("podeSeguir: resposta inesperada também BLOQUEIA", async () => {
  // `null`/`undefined` não são `true`. Qualquer coisa que não seja uma liberação
  // explícita tem de barrar — é o mesmo princípio do caso acima.
  const { cliente } = clienteFake({ data: null, error: null });
  assertEquals(await podeSeguir(cliente, TETOS.acesso, "203.0.113.7"), false);
});

Deno.test("podeSeguir: manda escopo, chave, max e janela para a RPC", async () => {
  const { cliente, chamadas } = clienteFake({ data: true, error: null });
  await podeSeguir(cliente, TETOS.cadastro, "203.0.113.7");

  assertEquals(chamadas, [{
    nome: "registrar_tentativa",
    args: {
      p_escopo: "cadastro",
      p_chave: "203.0.113.7",
      p_max: 3,
      p_janela: "60 minutes",
    },
  }]);
});

Deno.test("os tetos confirmados em 2026-09-12 (decisão N1)", () => {
  // Amarra os números para que mudá-los seja um ato deliberado, não um deslize.
  // 🔵 15 → 10 min em 2026-09-24, por decisão do usuário.
  assertEquals(TETOS.acesso, { escopo: "acesso", max: 5, janelaMin: 10 });
  assertEquals(TETOS.cadastro, { escopo: "cadastro", max: 3, janelaMin: 60 });
  assertEquals(TETOS["checagem-cpf"], { escopo: "checagem-cpf", max: 30, janelaMin: 15 });
  // 🔴 Acrescentado em 2026-09-19, e o número é folgado DE PROPÓSITO: a porta de
  // `incluir-email-cadastro` não tem prova de posse, então o teto por IP não detém o
  // ataque dirigido (basta uma requisição) — só o abuso em massa. Apertá-lo barraria
  // vários fiscais da mesma rede sem deter ninguém. Ver dividas-auth-colaborador.md §5.
  assertEquals(TETOS["inclusao-email"], { escopo: "inclusao-email", max: 10, janelaMin: 60 });
  // O teto GLOBAL, de chave fixa: é ele que impede a auditoria daquela porta (1 convite
  // + 1 aviso por admin, a cada registro) de virar o vetor — rotação de IP é trivial.
  assertEquals(TETOS["inclusao-email-global"], { escopo: "inclusao-email-global", max: 20, janelaMin: 60 });
});

Deno.test("a frase do 429 do `acesso` cita a janela verdadeira (decisão de 2026-09-24)", () => {
  // Derivada de TETOS: se a janela mudar e a frase não, ela passa a mentir para quem espera.
  assertEquals(
    mensagemDoBloqueio("acesso"),
    "Sistema com excesso de acessos. Tente novamente após 10 minutos.",
  );
  // Controle positivo: as portas de 60 min NÃO herdam o "10 minutos".
  assertEquals(mensagemDoBloqueio("cadastro"), "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
  assertEquals(mensagemDoBloqueio("inclusao-email"), "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
});
