import { describe, expect, it } from "vitest";
import { mensagemErroAlocacao } from "./alocacao-candidatos";

describe("mensagemErroAlocacao", () => {
  it("traduz o 23505 da chave (prova, candidato): já alocado", () => {
    // O nome do índice vem da migration 20260804225156. Renomeá-lo lá sem mexer aqui
    // devolve ao usuário o 'duplicate key value violates' cru.
    expect(
      mensagemErroAlocacao({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "candidatos_alocacao_prova_candidato_key"',
      }),
    ).toMatch(/já está alocado/i);
  });

  it("traduz a recusa da RLS para papel", () => {
    expect(
      mensagemErroAlocacao({
        code: "42501",
        message: 'new row violates row-level security policy for table "candidatos_alocacao"',
      }),
    ).toMatch(/administrador/i);
  });

  it("⭐ CONTROLE: as recusas que o banco já explica passam INTACTAS", () => {
    // PF001, AL004, AL005, AL006 chegam em português nomeando o que fazer — traduzi-las
    // aqui trocaria uma explicação por um genérico, que é o defeito ao contrário.
    const doBanco = [
      'A prova "Edital 001/2026 SMA" está finalizada: a alocação de candidatos não pode mais ser alterada. Reabra a prova para editar.',
      "A sala está lotada (30 de 30 lugares ocupados). Escolha outra sala ou aumente a capacidade desta.",
      "O candidato não é do edital desta prova. A alocação foi recusada.",
      'Faltou espaço ao alocar o cargo "DOCENTE II": precisa de 40 vaga(s) e restam 39 (cargo novo começa em sala nova, e as salas não se dividem entre cargos). Vincule mais unidades à prova ou aumente capacidades. Nada foi alterado.',
    ];
    for (const message of doBanco) {
      expect(mensagemErroAlocacao({ message })).toBe(message);
    }
  });

  it("erro vazio ganha um fallback em vez de toast em branco", () => {
    expect(mensagemErroAlocacao({ message: "  " })).toBe("Erro ao alterar a alocação");
  });
});
