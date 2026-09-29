import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { padraoLiteral } from "./ilike.ts";

// O escape do padrão de ilike, puro. Que o escape FUNCIONA de ponta a ponta (URL →
// PostgREST → ILIKE) não se prova aqui: é a Etapa 3 do roadmap, contra o PostgREST local.

// Controle positivo: e-mail comum, sem nenhum caractere especial, sai IGUAL. Sem este
// caso, um padraoLiteral que estragasse todo e-mail passaria nos de baixo.
Deno.test("e-mail sem caractere especial sai igual", () => {
  assertEquals(padraoLiteral("joao.silva@hotmail.com"), "joao.silva@hotmail.com");
});

// 🔴 O caso do defeito: o `_` deixa de ser curinga.
Deno.test("`_` vira literal", () => {
  assertEquals(padraoLiteral("joao_silva@hotmail.com"), "joao\\_silva@hotmail.com");
});

Deno.test("`%` vira literal", () => {
  assertEquals(padraoLiteral("a%b@x.com"), "a\\%b@x.com");
});

// A ordem importa: a barra é escapada ANTES, senão a barra do `\_` seria duplicada e o
// `_` voltaria a ser curinga.
Deno.test("barra é escapada primeiro, sem duplicar a do `_`", () => {
  assertEquals(padraoLiteral("a\\_b"), "a\\\\\\_b");
});

Deno.test("vários `_` no mesmo valor", () => {
  assertEquals(padraoLiteral("a_b_c@x_y.com"), "a\\_b\\_c@x\\_y.com");
});

Deno.test("`*` é recusado — o PostgREST o traduz para `%` e a barra não o segura", () => {
  assertThrows(() => padraoLiteral("a*b@x.com"));
});
