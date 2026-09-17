/**
 * Inscrição, taxas, isenção e canais de atendimento — capítulos [6] e [7].
 *
 * 🔴 **A TAXA É POR CARGO, e a correlação com escolaridade é SUGESTÃO.** Medido, os 6
 * valores publicados:
 *
 * | | R$ 100,00 | R$ 80,00 |
 * |---|---|---|
 * | 002 | Docente I | Docente II |
 * | 003 | Enfermeiro | Técnico em Enfermagem |
 * | 004 | — | ACS e ACE |
 *
 * A correlação com o nível é perfeita — 100 para superior, 80 para médio/técnico —
 * inclusive no caso que quase a derruba, o Docente II, cuja habilitação mínima é "Curso
 * Normal de Nível **Médio**". Mas são **6 pontos com 2 valores distintos**: é correlação
 * observada, não regra declarada. Os três editais publicam uma lista nominal por cargo.
 *
 * ➜ Por isso o sistema **propõe** e o usuário decide, no mesmo desenho de `sugerirCotas`.
 * Modelar por escolaridade obrigaria o edital a obedecer a uma regra que ele nunca
 * escreveu, e quebraria no dia em que dois cargos de nível superior tivessem taxas
 * diferentes.
 *
 * 🔴 **E este módulo NÃO defere isenção.** Ele descreve a regra que sai no edital; quem
 * analisa o pedido é a banca. Isenção é a porta de fraude mais visada de um concurso, e
 * nada aqui valida documento de candidato — não deixe o texto sugerir que valida.
 */

/** Os três critérios, como os três editais os publicam. */
export type TipoCriterioIsencao =
  | "CADUNICO"
  | "DOADOR_SANGUE_OU_MEDULA"
  | "SERVICO_ELEITORAL";

/**
 * ⚠️ São TRÊS, não quatro. O esboço do roadmap separava `DOADOR_SANGUE` de
 * `DOADOR_MEDULA_REDOME`; os três editais os juntam numa alínea só, sob a Lei Municipal
 * 5.989/2022 — o 003 chega a escrever "de acordo com sua opção (REDOME ou Doador de
 * Sangue)". Separá-los publicaria uma alínea que o documento não tem.
 */
export const CRITERIOS_DE_ISENCAO: ReadonlyArray<{
  tipo: TipoCriterioIsencao;
  rotulo: string;
  leiPadrao: string;
}> = [
  {
    tipo: "CADUNICO",
    rotulo: "Inscrito no CadÚnico e membro de família de baixa renda",
    leiPadrao: "Lei nº 8.112/90, art. 11; Decretos Federais nº 6.593/2008 e nº 11.016/2022",
  },
  {
    tipo: "DOADOR_SANGUE_OU_MEDULA",
    rotulo: "Doador regular de sangue ou cadastrado no REDOME",
    leiPadrao: "Lei Municipal nº 5.989/2022",
  },
  {
    tipo: "SERVICO_ELEITORAL",
    rotulo: "Prestou serviço à Justiça Eleitoral",
    leiPadrao: "Lei Municipal nº 6.359/2024",
  },
];

export const TIPOS_DE_CANAL: ReadonlyArray<{ tipo: string; rotulo: string }> = [
  { tipo: "PORTAL_WEB", rotulo: "Site" },
  { tipo: "EMAIL", rotulo: "E-mail" },
  { tipo: "TELEFONE", rotulo: "Telefone" },
  { tipo: "POSTO_PRESENCIAL", rotulo: "Posto presencial" },
];

export interface CargoComTaxa {
  edital_cargo_id: string;
  nome: string;
  /** `null` = não declarada. `'NENHUM'` não existe aqui; ver `escolaridade_minima`. */
  escolaridade_minima: string | null;
  taxa_inscricao: number | null;
}

export interface CriterioIsencao {
  tipo_criterio: TipoCriterioIsencao;
  lei_referencia: string | null;
  minimo_doacoes_sangue_12m: number | null;
  redome_exige_ano_vigente: boolean | null;
}

export interface CanalAtendimento {
  id: string;
  tipo_canal: string;
  rotulo: string;
  endereco: string | null;
}

export interface AvisoInscricao {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/**
 * A taxa que os editais praticam para aquele nível.
 *
 * ⚠️ Devolve `null` para nível não medido. Chutar um valor seria pior que não sugerir: o
 * usuário aceitaria a sugestão sem conferir, e o boleto sairia errado.
 */
export function taxaSugerida(escolaridade: string | null): number | null {
  if (escolaridade === "SUPERIOR") return 100;
  if (escolaridade === "MEDIO" || escolaridade === "TECNICO") return 80;
  // FUNDAMENTAL não aparece em nenhum dos três editais.
  return null;
}

/** Um e-mail plausível. ⚠️ Não valida existência — só denuncia o que claramente não é. */
export const pareceEmail = (v: string) => /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v.trim());

/**
 * As regras da TAXA.
 *
 * ⚠️ Mora fora de `conferirInscricao` porque a função passou de 15 de complexidade no
 * lint (baseline 111). Extrair é a saída deste repo — elevar o baseline não é.
 */
function conferirTaxas(cargos: readonly CargoComTaxa[]): AvisoInscricao[] {
  const avisos: AvisoInscricao[] = [];
  if (cargos.length === 0) return avisos;

  const semTaxa = cargos.filter((c) => c.taxa_inscricao === null);
  if (semTaxa.length > 0) {
    avisos.push({
      severidade: "erro",
      regra: "taxa-nao-declarada",
      mensagem: `${semTaxa.map((c) => c.nome).join(", ")} — sem valor de taxa. O capítulo publica "o valor do boleto será:" e a linha sairia em branco.`,
    });
  }

  // 🔴 A correlação medida virando aviso. Não é barreira: o edital pode ter razão para
  // divergir. Mas divergir CALADO é como o Quadro I saiu contradizendo o percentual
  // declarado — o defeito que a fatia 2 existe para matar.
  const porNivel = new Map<string, CargoComTaxa[]>();
  for (const c of cargos) {
    if (c.escolaridade_minima === null || c.taxa_inscricao === null) continue;
    const lista = porNivel.get(c.escolaridade_minima) ?? [];
    lista.push(c);
    porNivel.set(c.escolaridade_minima, lista);
  }
  for (const [nivel, lista] of porNivel) {
    const valores = [...new Set(lista.map((c) => Number(c.taxa_inscricao)))];
    if (valores.length > 1) {
      avisos.push({
        severidade: "aviso",
        regra: "taxa-divergente-no-mesmo-nivel",
        mensagem: `Cargos de nível ${nivel} com taxas diferentes (${valores.map((v) => `R$ ${v.toFixed(2)}`).join(", ")}). Nos três editais medidos a taxa acompanha a escolaridade — confira se a diferença é intencional.`,
      });
    }
  }
  return avisos;
}

/** As regras dos CRITÉRIOS de isenção. */
function conferirCriterios(criterios: readonly CriterioIsencao[]): AvisoInscricao[] {
  const avisos: AvisoInscricao[] = [];

  const sangue = criterios.find((c) => c.tipo_criterio === "DOADOR_SANGUE_OU_MEDULA");
  if (sangue && sangue.minimo_doacoes_sangue_12m === null) {
    avisos.push({
      severidade: "aviso",
      regra: "doacoes-nao-declaradas",
      mensagem: `O critério de doador de sangue está ligado e não diz quantas doações exige. Os três editais pedem 3 em 12 meses — sem o número, o candidato não sabe se se enquadra.`,
    });
  }

  // ⚠️ AVISO, não erro: é o texto que dá base legal à isenção, e publicá-lo sem a lei é
  // frágil — mas não impede o edital de sair.
  for (const c of criterios) {
    if (!c.lei_referencia?.trim()) {
      avisos.push({
        severidade: "aviso",
        regra: "criterio-sem-lei",
        mensagem: `O critério ${c.tipo_criterio} não cita a lei que o fundamenta. Os três editais citam — é o que sustenta o indeferimento se for contestado.`,
      });
    }
  }
  return avisos;
}

/** As regras dos CANAIS, mais a mitigação do R1. */
function conferirCanais(
  canais: readonly CanalAtendimento[],
  emailDaVistaDeProva: string | null | undefined,
): AvisoInscricao[] {
  const avisos: AvisoInscricao[] = [];

  for (const c of canais) {
    // 🔴 O banco aceita e-mail malformado de propósito (CASO 5e da bateria): "dado
    // inválido entra cru; valide na leitura", decisão de 01/08 que removeu 4 CHECKs de
    // formato deste repo.
    if (c.tipo_canal === "EMAIL" && c.endereco && !pareceEmail(c.endereco)) {
      avisos.push({
        severidade: "erro",
        regra: "email-malformado",
        mensagem: `O canal "${c.rotulo}" está como e-mail e o endereço "${c.endereco}" não parece um. Ele sai impresso no edital, e o candidato escreve para o que estiver lá.`,
      });
    }
    // ⚠️ O posto presencial é exceção: é o canal que se cadastra primeiro e se detalha
    // depois, e acusá-lo de imediato encheria o painel no primeiro minuto.
    if (c.tipo_canal !== "POSTO_PRESENCIAL" && !c.endereco?.trim()) {
      avisos.push({
        severidade: "erro",
        regra: "canal-sem-endereco",
        mensagem: `O canal "${c.rotulo}" não tem endereço. Sairia no edital como um canal que ninguém consegue usar.`,
      });
    }
  }

  // 🔴 R1: o e-mail da vista de prova mora em OUTRA tabela.
  // O roadmap avisava que, se a fatia 5 viesse antes desta, ela criaria
  // `regras_vista_prova.email_solicitacao` solto — e foi o que aconteceu. A coluna não foi
  // migrada (tem CHECK própria, e remodelar tabela entregue custa mais que isto). Esta
  // regra é a mitigação: a duplicação passa a ser VISÍVEL em vez de silenciosa.
  const daVista = emailDaVistaDeProva?.trim();
  if (daVista && !canais.some((c) => c.endereco?.trim().toLowerCase() === daVista.toLowerCase())) {
    avisos.push({
      severidade: "aviso",
      regra: "email-da-vista-fora-dos-canais",
      mensagem: `O e-mail "${daVista}", declarado no capítulo da vista da folha de respostas, não está na lista de canais. São dois lugares guardando o mesmo endereço, e um deles vai envelhecer.`,
    });
  }
  return avisos;
}

export function conferirInscricao(entrada: {
  cargos: readonly CargoComTaxa[];
  criterios: readonly CriterioIsencao[];
  canais: readonly CanalAtendimento[];
  /** O e-mail que a fatia 5 guarda em `regras_vista_prova`. Ver a regra R1 acima. */
  emailDaVistaDeProva?: string | null;
}): AvisoInscricao[] {
  return [
    ...conferirTaxas(entrada.cargos),
    ...conferirCriterios(entrada.criterios),
    ...conferirCanais(entrada.canais, entrada.emailDaVistaDeProva),
  ];
}
