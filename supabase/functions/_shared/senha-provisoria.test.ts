import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ALFABETO_SENHA, TAMANHO_SENHA, gerarSenhaProvisoria } from "./senha-provisoria.ts";

Deno.test("senha provisória — tamanho padrão, e acima do mínimo do GoTrue (6)", () => {
  const s = gerarSenhaProvisoria();
  assertEquals(s.length, TAMANHO_SENHA);
  assert(s.length >= 6);
});

Deno.test("senha provisória — só caracteres do alfabeto, nenhum ambíguo", () => {
  for (let i = 0; i < 200; i++) {
    for (const c of gerarSenhaProvisoria()) {
      assert(ALFABETO_SENHA.includes(c), `caractere fora do alfabeto: ${c}`);
      assert(!"0Oo1lI".includes(c), `caractere ambíguo: ${c}`);
    }
  }
});

Deno.test("senha provisória — não se repete entre chamadas", () => {
  const vistas = new Set<string>();
  for (let i = 0; i < 1000; i++) vistas.add(gerarSenhaProvisoria());
  assertEquals(vistas.size, 1000);
});

Deno.test("senha provisória — todo o alfabeto aparece (o sorteio alcança o fim dele)", () => {
  // Pega um descarte de bytes errado que cortasse o alfabeto (ex.: `b % 40`).
  const vistos = new Set<string>();
  for (let i = 0; i < 500; i++) for (const c of gerarSenhaProvisoria()) vistos.add(c);
  assertEquals(vistos.size, ALFABETO_SENHA.length);
});

Deno.test("senha provisória — respeita tamanho pedido", () => {
  assertEquals(gerarSenhaProvisoria(20).length, 20);
});
