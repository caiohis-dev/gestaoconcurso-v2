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

/**
 * Qual dos três estoques de um cargo. Espelha `bloco_do_candidato` no banco, e os três
 * são DISJUNTOS: quem tem texto de pedido é `sala_especial` mesmo sendo PCD.
 */
export type BlocoCargo = "comum" | "pcd" | "sala_especial";

export const ROTULO_DO_BLOCO: Record<BlocoCargo, string> = {
  comum: "Demais",
  pcd: "PCD",
  sala_especial: "Sala especial",
};

/** A ordem dos três cards dentro do container do cargo. Fixa, para não dançar na tela. */
export const ORDEM_DOS_BLOCOS: BlocoCargo[] = ["pcd", "sala_especial", "comum"];

/**
 * Um BLOCO arrastável. Cada cargo tem três: comuns, PCD e sala especial.
 *
 * 🔴 `id` é a chave do bloco, e NÃO é o uuid do cargo: os dois blocos do mesmo cargo
 * precisam ser distinguíveis em toda a lógica (arrastar, devolver, somar, montar o
 * plano). Usar `cargoId` como chave faria o bloco de especiais e o de comuns se fundirem
 * silenciosamente na mesma unidade — gente do estoque errado na sala errada.
 */
export interface CargoPendente {
  id: string;
  /** O uuid real do cargo. `null` é o "(sem cargo)" que a RPC aceita. */
  cargoId: string | null;
  nome: string;
  bloco: BlocoCargo;
  /** Quem o plano pode colocar: desconta só os alocados À MÃO, nunca os do plano. */
  naoAlocados: number;
  /**
   * Quantos o bloco tinha quando a tela abriu. NÃO muda com o arrasto — é o que permite
   * distinguir os dois zeros: `total === 0` é "sem inscritos" (o bloco nunca teve
   * ninguém) e `total > 0 && naoAlocados === 0` é "todos alocados" (você já os arrastou).
   * Sem este campo, os dois casos são o mesmo número e a tela mente num deles.
   */
  total: number;
}

/** A chave de um bloco. Determinística: a mesma entrada dá sempre o mesmo id. */
export function idDoBloco(cargoId: string | null, bloco: BlocoCargo): string {
  return `${cargoId ?? "sem-cargo"}|${bloco}`;
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
  /** = `CargoPendente.id`. É por ele que se casa bloco com bloco, nunca pelo cargo. */
  blocoId: string;
  cargoId: string | null;
  nome: string;
  bloco: BlocoCargo;
  quantidade: number;
  ordem: number;
}

/** Uma sala do snapshot, na ordem física, como o rascunho a enxerga. */
export interface SalaDoQuadro {
  id: string;
  capacidade: number;
  /**
   * As alocações MANUAIS já nesta sala. Só elas: aplicar o plano apaga as automáticas,
   * então contá-las faria a tela dizer que não há vaga onde há.
   */
  ocupadasManuais: number;
}

/** Uma unidade que recebe blocos de cargo até encher. */
export interface UnidadeAlocavel {
  id: string;
  nome: string;
  /**
   * 🔴 As salas UMA A UMA, em ordem física — não um total.
   *
   * A tela precisa simular o MESMO empacotamento do banco, e "cada bloco abre sala nova"
   * torna a capacidade útil MENOR que a soma das capacidades. Com um total só, a tela
   * oferecia vagas que a ociosidade das salas de fronteira já tinha gasto: em 05/08, na
   * unidade CGV (16×30 = 480), ela ofereceu 152 onde o banco tinha 120 — as 32 de
   * diferença eram sobra de duas salas de fronteira. O plano era recusado com AL004
   * depois de a pessoa já ter montado tudo.
   */
  salas: SalaDoQuadro[];
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
  cargo_id: string | null;
  unidade_id: string;
  quantidade: number;
  /** Qual dos três estoques do cargo. */
  bloco: BlocoCargo;
}

/** O id do único droppable que não é uma unidade. */
export const ID_PENDENTES = "cargos-pendentes";

/**
 * O que viaja no `data` de um draggable. União discriminada de propósito: o
 * `handleDragEnd` fica exaustivo e o TypeScript cobra o caso novo quando aparecer.
 */
export type DadosArrastaveis =
  | { tipo: "cargo"; blocoId: string; nome: string; bloco: BlocoCargo; naoAlocados: number }
  | {
      tipo: "alocado";
      unidadeId: string;
      blocoId: string;
      nome: string;
      bloco: BlocoCargo;
      quantidade: number;
    };

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

/** A capacidade somada da unidade — para exibir, nunca para decidir o que cabe. */
export function vagasTotais(unidade: UnidadeAlocavel): number {
  return unidade.salas.reduce((s, sala) => s + sala.capacidade, 0);
}

/** Quanta gente já está na unidade: as manuais de base + o que o rascunho pôs. */
export function totalAlocado(unidade: UnidadeAlocavel): number {
  return (
    unidade.salas.reduce((s, sala) => s + sala.ocupadasManuais, 0) +
    unidade.alocacoesPorCargo.reduce((s, b) => s + b.quantidade, 0)
  );
}

/**
 * Simula o empacotamento do banco: enche as salas em ordem física, e CADA BLOCO COMEÇA EM
 * SALA NOVA — o resto da sala de fronteira vira vaga ociosa, que ninguém mais usa.
 *
 * 🔴 É a tradução fiel do laço de `aplicar_plano_de_alocacao`. Se as duas divergirem, a
 * tela volta a deixar montar plano que o banco recusa — foi o defeito de 05/08.
 *
 * Devolve o ponteiro (índice da próxima sala livre para um bloco NOVO), quantas vagas
 * ainda dá para usar dali em diante, e quantas ficaram ociosas pelo caminho.
 */
export function simularEmpacotamento(unidade: UnidadeAlocavel): {
  ponteiro: number;
  vagasUteis: number;
  ociosas: number;
  /** Quanta gente do rascunho NÃO coube. `> 0` significa plano que o banco recusaria. */
  naoCoube: number;
} {
  const livrePorSala = unidade.salas.map((s) => Math.max(s.capacidade - s.ocupadasManuais, 0));
  const blocos = [...unidade.alocacoesPorCargo].sort((a, b) => a.ordem - b.ordem);

  let ponteiro = 0;
  let ociosas = 0;
  let naoCoube = 0;

  for (const bloco of blocos) {
    let restam = bloco.quantidade;
    while (restam > 0 && ponteiro < livrePorSala.length) {
      const cabe = Math.min(restam, livrePorSala[ponteiro]);
      livrePorSala[ponteiro] -= cabe;
      restam -= cabe;
      // Só avança a sala quando ela ENCHE; a última do bloco fica na sobra e o `ponteiro++`
      // depois do laço a abandona — é exatamente a vaga ociosa da regra.
      if (restam > 0) ponteiro += 1;
    }
    naoCoube += restam;
    if (ponteiro < livrePorSala.length) {
      ociosas += livrePorSala[ponteiro];
      livrePorSala[ponteiro] = 0;
      ponteiro += 1;
    }
  }

  const vagasUteis = livrePorSala.slice(ponteiro).reduce((s, v) => s + v, 0);
  return { ponteiro, vagasUteis, ociosas, naoCoube };
}

/**
 * Quanto ainda dá para acrescentar A ESTE BLOCO nesta unidade.
 *
 * 🔴 NÃO é o mesmo que `vagasRestantes`. Crescer um bloco que JÁ está na unidade usa o
 * resto da sala de fronteira DELE — "cada bloco abre sala nova" separa blocos DIFERENTES,
 * não impede um bloco de encher a própria sala. Foi o que os testes antigos pegaram: com
 * a conta de bloco novo, arrastar mais gente do mesmo cargo para a mesma unidade era
 * recusado sem motivo.
 *
 * ⚠️ E crescer um bloco EMPURRA os seguintes: se o bloco 1 cresce, o 2 e o 3 andam para
 * frente e podem deixar de caber. Por isso a resposta não é uma subtração — é buscar o
 * maior acréscimo que ainda faz o rascunho INTEIRO caber. A busca é binária porque
 * "coube" é monotônico: aumentar a quantidade nunca ajuda.
 */
export function maxAdicionavelAoBloco(unidade: UnidadeAlocavel, blocoId: string): number {
  const comDelta = (delta: number): UnidadeAlocavel => {
    const existe = unidade.alocacoesPorCargo.some((b) => b.blocoId === blocoId);
    return {
      ...unidade,
      alocacoesPorCargo: existe
        ? unidade.alocacoesPorCargo.map((b) =>
            b.blocoId === blocoId ? { ...b, quantidade: b.quantidade + delta } : b,
          )
        : [
            ...unidade.alocacoesPorCargo,
            {
              blocoId,
              cargoId: null,
              nome: "",
              bloco: "comum" as const,
              quantidade: delta,
              ordem: Number.MAX_SAFE_INTEGER,
            },
          ],
    };
  };

  const cabe = (delta: number) => simularEmpacotamento(comDelta(delta)).naoCoube === 0;

  let baixo = 0;
  let alto = unidade.salas.reduce((s, sala) => s + Math.max(sala.capacidade - sala.ocupadasManuais, 0), 0);
  if (cabe(alto)) return alto;

  while (baixo < alto) {
    const meio = Math.ceil((baixo + alto) / 2);
    if (cabe(meio)) baixo = meio;
    else alto = meio - 1;
  }
  return baixo;
}

/**
 * Quanto ainda cabe na unidade para um bloco NOVO.
 *
 * ⚠️ NÃO é `capacidade − alocados`. Ver `simularEmpacotamento`: a ociosidade das salas de
 * fronteira já gastou parte da capacidade, e ignorá-la é o que fez a tela prometer vagas
 * que o banco não tinha.
 */
export function vagasRestantes(unidade: UnidadeAlocavel): number {
  return simularEmpacotamento(unidade).vagasUteis;
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
  blocoId: string,
  unidadeId: string,
): { estado: EstadoAlocacao; transferidos: number } {
  const origem = estado.cargos.find((c) => c.id === blocoId);
  const unidade = estado.unidades.find((u) => u.id === unidadeId);
  if (!origem || !unidade) return { estado, transferidos: 0 };

  // ⚠️ `maxAdicionavelAoBloco`, não `vagasRestantes`: crescer um bloco que já está aqui
  // usa o resto da sala de fronteira dele, e a conta de "bloco novo" recusaria sem motivo.
  const transferidos = Math.min(origem.naoAlocados, maxAdicionavelAoBloco(unidade, blocoId));
  if (transferidos <= 0) return { estado, transferidos: 0 };

  // ⚠️ Casa por `blocoId`, NUNCA por cargo: os comuns e os especiais do mesmo cargo são
  // estoques separados e não podem se fundir num bloco só dentro da unidade.
  const jaTem = unidade.alocacoesPorCargo.some((a) => a.blocoId === blocoId);

  return {
    transferidos,
    estado: {
      // Repetir o mesmo bloco na mesma unidade NÃO consome ordem nova: ele só cresce,
      // e a posição dele na lista do plano continua sendo a do primeiro arrasto.
      proximaOrdem: jaTem ? estado.proximaOrdem : estado.proximaOrdem + 1,
      cargos: estado.cargos.map((c) =>
        c.id === blocoId ? { ...c, naoAlocados: c.naoAlocados - transferidos } : c,
      ),
      unidades: estado.unidades.map((u) =>
        u.id !== unidadeId
          ? u
          : {
              ...u,
              alocacoesPorCargo: jaTem
                ? u.alocacoesPorCargo.map((a) =>
                    a.blocoId === blocoId
                      ? { ...a, quantidade: a.quantidade + transferidos }
                      : a,
                  )
                : [
                    ...u.alocacoesPorCargo,
                    {
                      blocoId,
                      cargoId: origem.cargoId,
                      nome: origem.nome,
                      bloco: origem.bloco,
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
  blocoId: string,
  unidadeId: string,
): { estado: EstadoAlocacao; devolvidos: number } {
  const unidade = estado.unidades.find((u) => u.id === unidadeId);
  const bloco = unidade?.alocacoesPorCargo.find((a) => a.blocoId === blocoId);
  if (!unidade || !bloco) return { estado, devolvidos: 0 };

  const devolvidos = bloco.quantidade;

  return {
    devolvidos,
    estado: {
      // `proximaOrdem` NÃO recua: reaproveitar um número já usado embaralharia a ordem
      // relativa dos blocos que continuam de pé.
      proximaOrdem: estado.proximaOrdem,
      cargos: estado.cargos.map((c) =>
        c.id === blocoId ? { ...c, naoAlocados: c.naoAlocados + devolvidos } : c,
      ),
      unidades: estado.unidades.map((u) =>
        u.id !== unidadeId
          ? u
          : {
              ...u,
              alocacoesPorCargo: u.alocacoesPorCargo.filter((a) => a.blocoId !== blocoId),
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
        bloco: a.bloco,
        ordem: a.ordem,
      })),
    )
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ cargo_id, unidade_id, quantidade, bloco }) => ({
      cargo_id,
      unidade_id,
      quantidade,
      bloco,
    }));
}

/** Quantos o rascunho vai alocar ao todo. */
export function totalNoPlano(estado: EstadoAlocacao): number {
  return estado.unidades.reduce(
    (s, u) => s + u.alocacoesPorCargo.reduce((t, a) => t + a.quantidade, 0),
    0,
  );
}

/**
 * Em que estado um card de bloco está. Os dois zeros dizem coisas OPOSTAS:
 *   `sem-inscritos`  → o cargo não tem ninguém nesse bloco; nunca teve.
 *   `todos-alocados` → havia gente e ela já está no rascunho. O trabalho está feito.
 * Mostrar o mesmo texto nos dois faria a pessoa procurar candidatos que não existem — ou
 * achar que perdeu os que acabou de distribuir.
 */
export type EstadoDoBloco = "disponivel" | "sem-inscritos" | "todos-alocados";

export function estadoDoBloco(naoAlocados: number, total: number): EstadoDoBloco {
  if (naoAlocados > 0) return "disponivel";
  return total === 0 ? "sem-inscritos" : "todos-alocados";
}

/** Um cargo e seus três blocos, para a tela desenhar um container por cargo. */
export interface CargoAgrupado {
  chave: string;
  nome: string;
  blocos: CargoPendente[];
}

/**
 * Agrupa os blocos por cargo, preservando a ordem em que os cargos chegaram do banco
 * (alfabética, sem cargo por último) e ordenando os três blocos por `ORDEM_DOS_BLOCOS`.
 *
 * ⚠️ Blocos ZERADOS entram assim mesmo. É de propósito: o card de sala especial vale
 * justamente por dizer "0" — some-lo faria a pessoa procurar na tela um número que ela
 * precisa ver antes de montar o plano. Quem não arrasta é o `useDraggable`, que se
 * desabilita sozinho quando não há ninguém.
 */
export function agruparPorCargo(cargos: CargoPendente[]): CargoAgrupado[] {
  const grupos: CargoAgrupado[] = [];
  const porChave = new Map<string, CargoAgrupado>();

  for (const bloco of cargos) {
    const chave = bloco.cargoId ?? "sem-cargo";
    let grupo = porChave.get(chave);
    if (!grupo) {
      grupo = { chave, nome: bloco.nome, blocos: [] };
      porChave.set(chave, grupo);
      grupos.push(grupo);
    }
    grupo.blocos.push(bloco);
  }

  for (const grupo of grupos) {
    grupo.blocos.sort(
      (a, b) => ORDEM_DOS_BLOCOS.indexOf(a.bloco) - ORDEM_DOS_BLOCOS.indexOf(b.bloco),
    );
  }
  return grupos;
}

/** Quantos ficam sem sala se o plano for aplicado como está (decisão D3: é permitido). */
export function totalForaDoPlano(estado: EstadoAlocacao): number {
  return estado.cargos.reduce((s, c) => s + c.naoAlocados, 0);
}
