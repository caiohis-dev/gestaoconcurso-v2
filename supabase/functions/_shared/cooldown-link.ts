// Cooldown por CONTA entre dois envios de link de acesso — um lugar só.
//
// Extraído da recuperar-senha em 2026-09-28, quando a reivindicar-acesso passou a
// mandar link para quem já tem conta e precisou da mesma regra (ver
// my_rules/analises/roadmap-cpf-link-para-conta-existente.yaml). Duas cópias da
// leitura dos carimbos divergiriam — e a versão que olhava só um deles já foi defeito.
//
// Cobre dois problemas de uma vez: bombardear de e-mail quem tem cadastro, e a
// rotação de token — cada generateLink invalida o link anterior, então clicar
// "enviar" duas vezes mataria o link do primeiro e-mail, que costuma ser justamente o
// que a pessoa abre.
//
// 🔴 Olha os TRÊS carimbos, não só o recovery_sent_at: o generateLink('invite') grava
// `confirmation_sent_at`/`invited_at` e deixa `recovery_sent_at` NULL. Considerar só o
// recovery deixaria passar o pior caso — quem acabou de receber o invite pediria de
// novo, receberia um recovery na hora, e esse segundo link INVALIDA o primeiro.

export const COOLDOWN_MIN = 2;

/** O carimbo de envio mais recente da conta, entre os três; null se não há nenhum. */
export function ultimoEnvio(user: Record<string, unknown>): Date | null {
  const carimbos = [user.recovery_sent_at, user.confirmation_sent_at, user.invited_at]
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((t) => !Number.isNaN(t));
  return carimbos.length ? new Date(Math.max(...carimbos)) : null;
}

/** true = um link saiu para esta conta há menos de COOLDOWN_MIN; não gere outro. */
export function emCooldown(user: Record<string, unknown>, agora: number = Date.now()): boolean {
  const ultimo = ultimoEnvio(user);
  return ultimo !== null && agora - ultimo.getTime() < COOLDOWN_MIN * 60_000;
}
