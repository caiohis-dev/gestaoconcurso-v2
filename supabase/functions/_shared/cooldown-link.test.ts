import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { COOLDOWN_MIN, emCooldown, ultimoEnvio } from "./cooldown-link.ts";

// O cooldown por conta, puro. Nada de rede nem de Edge Function: as duas que o usam
// (recuperar-senha e reivindicar-acesso) enviam e-mail de verdade a partir do banco
// local, que é cópia de produção.

const AGORA = Date.parse("2026-09-28T12:00:00Z");
const haMin = (min: number) => new Date(AGORA - min * 60_000).toISOString();

Deno.test("sem carimbo nenhum: fora do cooldown", () => {
  assertEquals(ultimoEnvio({}), null);
  assertEquals(emCooldown({}, AGORA), false);
});

// 🔴 O caso que o cooldown existe para pegar, e que a versão que olhava só o
// recovery_sent_at deixava passar: o invite deixa recovery_sent_at NULL.
Deno.test("convite recém-enviado (só confirmation_sent_at/invited_at): EM cooldown", () => {
  const user = { recovery_sent_at: null, confirmation_sent_at: haMin(1), invited_at: haMin(1) };
  assertEquals(emCooldown(user, AGORA), true);
});

Deno.test("só invited_at recente também conta", () => {
  assertEquals(emCooldown({ invited_at: haMin(1) }, AGORA), true);
});

Deno.test("recovery recente: EM cooldown", () => {
  assertEquals(emCooldown({ recovery_sent_at: haMin(1) }, AGORA), true);
});

Deno.test("vale o carimbo MAIS RECENTE dos três", () => {
  const user = { recovery_sent_at: haMin(60), confirmation_sent_at: null, invited_at: haMin(1) };
  assertEquals(ultimoEnvio(user)?.toISOString(), haMin(1));
  assertEquals(emCooldown(user, AGORA), true);
});

// Controle positivo: passada a janela, o envio volta a ser permitido. Sem ele, um
// `emCooldown` que sempre respondesse true passaria em todos os casos acima.
Deno.test("passada a janela: fora do cooldown", () => {
  const user = { recovery_sent_at: haMin(COOLDOWN_MIN + 1), invited_at: haMin(30) };
  assertEquals(emCooldown(user, AGORA), false);
});

Deno.test("fronteira: exatamente COOLDOWN_MIN depois já libera", () => {
  assertEquals(emCooldown({ recovery_sent_at: haMin(COOLDOWN_MIN) }, AGORA), false);
});

Deno.test("carimbo ilegível é ignorado, não trava a conta", () => {
  assertEquals(emCooldown({ recovery_sent_at: "lixo" }, AGORA), false);
});
