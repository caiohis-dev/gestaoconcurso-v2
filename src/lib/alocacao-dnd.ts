/**
 * O RASCUNHO de alocação por arrasto — TIPOS E TRANSIÇÕES PURAS, sem React e sem dnd-kit.
 *
 * Arrastar NÃO grava (decisão D1 de 2026-08-05): este módulo mantém um plano em memória,
 * e o botão "Aplicar" manda o plano inteiro para `aplicar_plano_de_alocacao`, que roda em
 * transação. As regras de verdade (por cargo, alfabético, cargo novo abre sala nova,
 * especiais fora) moram no banco — ver `my_rules/estrutura/modulos/alocacao-candidatos/`.
 *
 * As transições são puras e devolvem estado novo por uma razão prática: quem chama
 * precisa saber SE mudou algo (para não animar um sucesso que não houve), e descobrir
 * isso de dentro de um updater do React não funciona — o updater roda depois do handler.
 */

/** Um cargo com gente que o plano ainda pode colocar. */
export interface CargoPendente {
  id: string;
  nome: string;
  /** Não-especiais que ainda não têm alocação MANUAL — o que o plano pode distribuir. */
  naoAlocados: number;
}

/**
 * O bloco de um cargo dentro de uma unidade — a granularidade que se arrasta.
 *
 * 🔴 `ordem` não é enfeite: a RPC recebe uma lista ORDENADA e é ela que decide quem cai
 * onde quando um cargo se divide entre unidades (a 1ª entrada leva os primeiros N
 * alfabéticos, a 2ª os N seguintes). Sem guardar a ordem de arrasto, dois planos com os
 * mesmos blocos em ordens diferentes produziriam salas diferentes — e a tela não teria
 * como saber qual você montou.
 */
export interface AlocacaoUnidade {
  cargoId: string;
  nome: string;
  quantidade: number;
  ordem: number;
}

/** Uma unidade que recebe blocos de cargo até encher. */
export interface UnidadeAlocavel {
  id: string;
  nome: string;
  vagasTotais: number;
  /**
   * A ocupação de base: as alocações MANUAIS, que o plano preserva. As automáticas NÃO
   * entram — aplicar o plano as apaga, então contá-las faria a tela dizer que não há
   * vaga onde há.
   */
  alocados: number;
  alocacoesPorCargo: AlocacaoUnidade[];
}

export interface EstadoAlocacao {
  cargos: CargoPendente[];
  unidades: UnidadeAlocavel[];
  /** Contador monotônico da ordem de arrasto. Nunca decresce, nem ao devolver um bloco. */
  proximaOrdem: number;
}

/** Uma entrada do plano, no formato que a RPC espera. */
export interface EntradaPlano {
  cargo_id: string;
  unidade_id: string;
  quantidade: number;
}

/** O id do único droppable que não é uma unidade. */
export const ID_PENDENTES = "cargos-pendentes";

/**
 * O que viaja no `data` de um draggable. União discriminada de propósito: o
 * `handleDragEnd` fica exaustivo e o TypeScript cobra o caso novo quando aparecer.
 */
export type DadosArrastaveis =
  | { tipo: "cargo"; cargoId: string; nome: string; naoAlocados: number }
  | { tipo: "alocado"; unidadeId: string; cargoId: string; nome: string; quantidade: number };

/** O que viaja no `data` de um droppable. */
export type DadosSoltaveis =
  | { tipo: "unidade"; unidadeId: string }
  | { tipo: typeof ID_PENDENTES };

/** Leitura defensiva: o `data.current` do dnd-kit é `any` por natureza. */
export function lerDadosArrastaveis(dados: unknown): DadosArrastaveis | null {
  if (!dados || typeof dados !== "object") return null;
  const tipo = (dados as { tipo?: unknown }).tipo;
  return tipo === "cargo" || tipo === "alocado" ? (dados as DadosArrastaveis) : null;
}

export function lerDadosSoltaveis(dados: unknown): DadosSoltaveis | null {
  if (!dados || typeof dados !== "object") return null;
  const tipo = (dados as { tipo?: unknown }).tipo;
  return tipo === "unidade" || tipo === ID_PENDENTES ? (dados as DadosSoltaveis) : null;
}

export function vagasRestantes(unidade: UnidadeAlocavel): number {
  return Math.max(unidade.vagasTotais - unidade.alocados, 0);
}

/** Monta o rascunho inicial a partir do que o banco respondeu. Começa sempre VAZIO. */
export function estadoInicial(
  cargos: CargoPendente[],
  unidades: UnidadeAlocavel[],
): EstadoAlocacao {
  return { cargos, unidades, proximaOrdem: 1 };
}

/**
 * Soltar um cargo pendente numa unidade: entra o que couber.
 *
 * `transferidos = 0` é o caso "não coube nada" — quem chama usa isso para não animar um
 * sucesso que não houve.
 */
export function alocarCargoNaUnidade(
  estado: EstadoAlocacao,
  cargoId: string,
  unidadeId: string,
): { estado: EstadoAlocacao; transferidos: number } {
  const cargo = estado.cargos.find((c) => c.id === cargoId);
  const unidade = estado.unidades.find((u) => u.id === unidadeId);
  if (!cargo || !unidade) return { estado, transferidos: 0 };

  const transferidos = Math.min(cargo.naoAlocados, vagasRestantes(unidade));
  if (transferidos <= 0) return { estado, transferidos: 0 };

  const jaTem = unidade.alocacoesPorCargo.some((a) => a.cargoId === cargoId);

  return {
    transferidos,
    estado: {
      // Repetir o mesmo cargo na mesma unidade NÃO consome ordem nova: o bloco só cresce,
      // e a posição dele na lista do plano continua sendo a do primeiro arrasto.
      proximaOrdem: jaTem ? estado.proximaOrdem : estado.proximaOrdem + 1,
      cargos: estado.cargos.map((c) =>
        c.id === cargoId ? { ...c, naoAlocados: c.naoAlocados - transferidos } : c,
      ),
      unidades: estado.unidades.map((u) =>
        u.id !== unidadeId
          ? u
          : {
              ...u,
              alocados: u.alocados + transferidos,
              alocacoesPorCargo: jaTem
                ? u.alocacoesPorCargo.map((a) =>
                    a.cargoId === cargoId
                      ? { ...a, quantidade: a.quantidade + transferidos }
                      : a,
                  )
                : [
                    ...u.alocacoesPorCargo,
                    {
                      cargoId,
                      nome: cargo.nome,
                      quantidade: transferidos,
                      ordem: estado.proximaOrdem,
                    },
                  ],
            },
      ),
    },
  };
}

/**
 * Arrastar um bloco de volta para os pendentes: volta o BLOCO INTEIRO daquele cargo
 * naquela unidade. É a mesma granularidade em que ele entrou.
 *
 * ⚠️ A quantidade sai do ESTADO, nunca do `data` do drag: o payload do arrasto é uma
 * cópia do momento em que o gesto começou e envelhece se algo mudar no meio.
 */
export function devolverParaPendentes(
  estado: EstadoAlocacao,
  cargoId: string,
  unidadeId: string,
): { estado: EstadoAlocacao; devolvidos: number } {
  const unidade = estado.unidades.find((u) => u.id === unidadeId);
  const bloco = unidade?.alocacoesPorCargo.find((a) => a.cargoId === cargoId);
  if (!unidade || !bloco) return { estado, devolvidos: 0 };

  const devolvidos = bloco.quantidade;

  return {
    devolvidos,
    estado: {
      // `proximaOrdem` NÃO recua: reaproveitar um número já usado embaralharia a ordem
      // relativa dos blocos que continuam de pé.
      proximaOrdem: estado.proximaOrdem,
      cargos: estado.cargos.map((c) =>
        c.id === cargoId ? { ...c, naoAlocados: c.naoAlocados + devolvidos } : c,
      ),
      unidades: estado.unidades.map((u) =>
        u.id !== unidadeId
          ? u
          : {
              ...u,
              alocados: Math.max(u.alocados - devolvidos, 0),
              alocacoesPorCargo: u.alocacoesPorCargo.filter((a) => a.cargoId !== cargoId),
            },
      ),
    },
  };
}

/**
 * O rascunho vira o payload da RPC: todos os blocos, achatados e ORDENADOS pela ordem de
 * arrasto (que atravessa unidades — por isso o achatamento vem antes da ordenação).
 */
export function montarPlano(estado: EstadoAlocacao): EntradaPlano[] {
  return estado.unidades
    .flatMap((u) =>
      u.alocacoesPorCargo.map((a) => ({
        cargo_id: a.cargoId,
        unidade_id: u.id,
        quantidade: a.quantidade,
        ordem: a.ordem,
      })),
    )
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ cargo_id, unidade_id, quantidade }) => ({ cargo_id, unidade_id, quantidade }));
}

/** Quantos o rascunho vai alocar ao todo. */
export function totalNoPlano(estado: EstadoAlocacao): number {
  return estado.unidades.reduce(
    (s, u) => s + u.alocacoesPorCargo.reduce((t, a) => t + a.quantidade, 0),
    0,
  );
}

/** Quantos ficam sem sala se o plano for aplicado como está (decisão D3: é permitido). */
export function totalForaDoPlano(estado: EstadoAlocacao): number {
  return estado.cargos.reduce((s, c) => s + c.naoAlocados, 0);
}
