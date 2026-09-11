import { describe, it, expect, vi } from "vitest";
import { buscarEmFatias, TAMANHO_FATIA } from "@/lib/buscar-em-fatias";

/** N linhas fabricadas, para exercitar as bordas do teto sem depender de dado real. */
const linhas = (n: number, prefixo = "l") =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefixo}${i}` }));

/**
 * O laço que impede um export de sair incompleto.
 *
 * 🔴 O PostgREST corta a resposta em `max_rows` (1000 por padrão) **sem erro**. Uma
 * consulta sem `.range()` acima disso devolve 1000 linhas e o código segue como se fossem
 * todas — num export, isso é um documento oficial incompleto que ninguém percebe.
 */
describe("buscarEmFatias", () => {
  it("uma fatia curta encerra o laço — uma chamada só", async () => {
    const buscar = vi.fn().mockResolvedValue({ data: linhas(3), error: null });

    const todas = await buscarEmFatias(buscar);

    expect(todas).toHaveLength(3);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith(0, TAMANHO_FATIA - 1);
  });

  it("🔴 fatia CHEIA busca a próxima — é a borda que decide tudo", async () => {
    // Uma fatia com exatamente `TAMANHO_FATIA` linhas NÃO prova que acabou: prova que o
    // teto foi atingido. Parar aqui é exatamente o defeito que este helper existe para
    // eliminar, e é o erro natural de quem implementa "se veio vazio, pare".
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA, "a"), error: null })
      .mockResolvedValueOnce({ data: linhas(2, "b"), error: null });

    const todas = await buscarEmFatias(buscar);

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(todas).toHaveLength(TAMANHO_FATIA + 2);
  });

  it("pede as fatias seguintes na janela certa, sem sobrepor nem pular", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA), error: null })
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA), error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await buscarEmFatias(buscar);

    expect(buscar.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("concatena na ordem em que as fatias chegaram", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA, "a"), error: null })
      .mockResolvedValueOnce({ data: [{ id: "z0" }, { id: "z1" }], error: null });

    const todas = await buscarEmFatias<{ id: string }>(buscar);

    expect(todas[0].id).toBe("a0");
    expect(todas.at(-1)?.id).toBe("z1");
  });

  it("⭐ fatia cheia seguida de VAZIA termina — e não roda para sempre", async () => {
    // O caso do total múltiplo exato do teto. Se o laço só parasse em `< TAMANHO_FATIA`
    // sem aceitar zero, ele ficaria pedindo janelas vazias indefinidamente.
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA), error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const todas = await buscarEmFatias(buscar);

    expect(todas).toHaveLength(TAMANHO_FATIA);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("trata `data: null` como fatia vazia, sem quebrar", async () => {
    const buscar = vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(buscarEmFatias(buscar)).resolves.toEqual([]);
  });

  it("falha fechada: erro numa fatia interrompe, não devolve parcial", async () => {
    // Devolver o que já veio seria pior que falhar: o export sairia incompleto com cara
    // de sucesso, que é justamente o defeito combatido aqui.
    const buscar = vi
      .fn()
      .mockResolvedValueOnce({ data: linhas(TAMANHO_FATIA), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "sem permissão" } });

    await expect(buscarEmFatias(buscar)).rejects.toEqual({ message: "sem permissão" });
  });
});
