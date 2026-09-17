/**
 * O checklist de investidura e posse — capítulo [16].
 *
 * 🎯 **É a fatia que mata o defeito de abertura do módulo.** O item 15.8-L do Edital
 * 004/2026 publicado exige "Certidão Nada Consta do COREN" de Agente Comunitário de
 * Saúde, cargo de nível médio sem conselho de classe.
 *
 * 🔴 **E a medição mostrou de onde veio.** O Edital 003 (Enfermagem) tem DOIS documentos
 * de COREN — `K) Registro Ativo…` e `N) Certidão Nada Consta…` — e o 004 herdou só o
 * segundo, com o mesmo texto entre parênteses. Uma linha copiada à mão, não erro
 * sistemático.
 *
 * **A defesa é em duas camadas, e este módulo é a segunda:**
 *
 * | | onde | o que alcança |
 * |---|---|---|
 * | 1 | trigger `IN001` no banco | `conselho_exigido` que nenhum cargo do edital exige — exato e inescapável |
 * | 2 | `conferirInvestidura`, aqui | a sigla escrita no TEXTO LIVRE, que o trigger não vê |
 *
 * ⚠️ A camada 2 é heurística de propósito: nome de documento varia demais ("COREN",
 * "Coren-RJ", "Conselho Regional de Enfermagem") para virar barreira de banco sem recusar
 * o legítimo. Ela ACUSA, não impede — e é por isso que a camada 1 existe.
 *
 * ⚠️ O material de referência propunha "os documentos do COREN ficam DESABILITADOS ou
 * OCULTOS". Desabilitado ainda é oferecido, e vira habilitado no dia em que alguém
 * "melhorar" a UX. Aqui a opção não existe.
 */

/** Os conselhos do domínio, com o que procurar no texto livre. */
export const CONSELHOS: ReadonlyArray<{ sigla: string; nome: string }> = [
  { sigla: "COREN", nome: "Conselho Regional de Enfermagem" },
  { sigla: "CRM", nome: "Conselho Regional de Medicina" },
  { sigla: "CREF", nome: "Conselho Regional de Educação Física" },
  { sigla: "OAB", nome: "Ordem dos Advogados do Brasil" },
  { sigla: "CRO", nome: "Conselho Regional de Odontologia" },
  { sigla: "CRF", nome: "Conselho Regional de Farmácia" },
  { sigla: "CRP", nome: "Conselho Regional de Psicologia" },
  { sigla: "CRN", nome: "Conselho Regional de Nutrição" },
  { sigla: "CREA", nome: "Conselho Regional de Engenharia e Agronomia" },
  { sigla: "CRC", nome: "Conselho Regional de Contabilidade" },
  { sigla: "CRESS", nome: "Conselho Regional de Serviço Social" },
  { sigla: "CRMV", nome: "Conselho Regional de Medicina Veterinária" },
  { sigla: "CRB", nome: "Conselho Regional de Biblioteconomia" },
  { sigla: "CRFa", nome: "Conselho Regional de Fonoaudiologia" },
];

/**
 * 🔵 O núcleo comum aos TRÊS editais, medido item a item.
 *
 * ⚠️ O que NÃO entra aqui, e por quê: o **ASO** aparece como documento só no 002 (nos
 * outros dois está na frase de abertura, "julgado APTO no exame médico admissional"), e o
 * **diploma** é por cargo — o 002 diz "do Curso exigido para o cargo a que concorre", o
 * 003 lista um por cargo e o 004 diz "Diploma do Ensino Médio". Pré-marcar qualquer um
 * dos dois seria pôr na boca do edital algo que os três escrevem diferente.
 */
export const DOCUMENTOS_PADRAO: readonly string[] = [
  "Comprovante de votação (último pleito eleitoral)",
  "Documento Oficial de Identificação com foto (original e fotocópia)",
  "Comprovante de residência atualizado – últimos três meses (original e fotocópia)",
  "CPF (original e fotocópia)",
  "Cartão PIS/PASEP (original e fotocópia)",
  "Certidão de Nascimento ou Casamento (original e fotocópia)",
  "Certidão de Nascimento de filhos menores de 14 anos (original e fotocópia)",
  "2 (duas) fotos 3X4 recentes",
  // ⚠️ A condição mora no TEXTO, e é assim nos três editais. A P1 do roadmap perguntava
  // se `aplica_apenas_sexo` merecia ser coluna; medido, o reservista é o único item
  // condicionado a sexo, mas NÃO é o único condicional — "de filhos menores de 14 anos" e
  // "caso declare" estão na mesma lista, e os três exprimem a condição no próprio nome.
  // Uma coluna de sexo serviria a 1 linha de 12 e deixaria as outras duas em texto.
  "Certificado de Reservista (homem). (original e fotocópia)",
  "Cópia de inteiro teor da última declaração de Imposto de Renda, caso declare",
];

/** Os dois documentos que um conselho de classe traz junto, como no Edital 003. */
export const documentosDoConselho = (sigla: string) => [
  `Registro Ativo e regular com anuidade paga no ${sigla}`,
  `Certidão Nada Consta do ${sigla} (Certidão Única Atualizada)`,
];

export interface CargoDoEdital {
  cargo_id: string;
  nome: string;
  /** `null` = NÃO DECLARADO. `'NENHUM'` = declarado, e o cargo não tem conselho. */
  conselho_classe_obrigatorio: string | null;
}

export interface DocumentoInvestidura {
  id: string;
  cargo_id: string | null;
  aplica_a_todos_os_cargos: boolean;
  nome_documento: string;
  conselho_exigido: string | null;
  obrigatorio: boolean;
}

export interface AvisoInvestidura {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

/** As siglas que o edital pode legitimamente exigir — vazio se nenhum cargo declara uma. */
export function conselhosDoEdital(cargos: readonly CargoDoEdital[]): string[] {
  const s = new Set<string>();
  for (const c of cargos) {
    const v = c.conselho_classe_obrigatorio;
    // 🔴 `'NENHUM'` fora: é declaração de que o cargo não tem conselho, não um conselho.
    if (v && v !== "NENHUM") s.add(v);
  }
  return [...s].sort();
}

/**
 * Acha a sigla de um conselho escrita no texto livre.
 *
 * ⚠️ Casa a sigla como PALAVRA INTEIRA. Sem isso, "CRM" casaria dentro de "CRMV" e um
 * edital de Medicina Veterinária seria acusado de exigir o conselho de medicina — acusar
 * o certo é metade; a outra é não acusar o legítimo.
 */
export function conselhoNoTexto(texto: string): string | null {
  const t = texto.toUpperCase();
  // Da sigla mais longa para a mais curta: "CRMV" antes de "CRM", "CRESS" antes de "CRC".
  const ordenadas = [...CONSELHOS].sort((a, b) => b.sigla.length - a.sigla.length);
  for (const c of ordenadas) {
    if (new RegExp(`(^|[^A-Z])${c.sigla.toUpperCase()}([^A-Z]|$)`).test(t)) return c.sigla;
    if (t.includes(c.nome.toUpperCase())) return c.sigla;
  }
  return null;
}

export function conferirInvestidura(entrada: {
  documentos: readonly DocumentoInvestidura[];
  cargos: readonly CargoDoEdital[];
}): AvisoInvestidura[] {
  const { documentos, cargos } = entrada;
  const avisos: AvisoInvestidura[] = [];
  const permitidos = new Set(conselhosDoEdital(cargos));

  // ── 🔴 R3 do roadmap: conselho NÃO DECLARADO não pode virar "nenhum" em silêncio ──
  // A coluna nasce nula, e uma regra que lê nulo como "não tem conselho" degrada para
  // "não oferece nada" — seguro, mas mudo. Quem redige precisa saber que a informação
  // falta, senão descobre no dia em que o documento do COREN não aparece e o edital sai
  // sem ele.
  const semDeclaracao = cargos.filter((c) => c.conselho_classe_obrigatorio === null);
  if (semDeclaracao.length > 0 && documentos.length > 0) {
    avisos.push({
      severidade: "aviso",
      regra: "cargo-sem-conselho-declarado",
      mensagem: `${semDeclaracao.map((c) => c.nome).join(", ")} — não está declarado se o cargo exige conselho de classe. Enquanto faltar, o sistema não oferece o documento do conselho, e a ausência dele no checklist não significa que ele não seja necessário.`,
    });
  }

  for (const d of documentos) {
    // ── a brecha que o trigger não alcança: a sigla escrita no texto livre ──
    const noTexto = conselhoNoTexto(d.nome_documento);
    if (noTexto && !permitidos.has(noTexto)) {
      avisos.push({
        severidade: "erro",
        regra: "documento-de-conselho-nao-exigido",
        mensagem: `"${d.nome_documento}" menciona o ${noTexto}, e nenhum cargo deste edital exige registro nesse conselho. Foi exatamente assim que a Certidão Nada Consta do COREN chegou ao Edital 004/2026, num concurso de Agente Comunitário de Saúde.`,
      });
    } else if (noTexto && d.conselho_exigido === null) {
      // ⚠️ AVISO, não erro: o documento é legítimo, só está fora da coluna — e por isso
      // some do checklist no dia em que o cargo daquele conselho sair do edital.
      avisos.push({
        severidade: "aviso",
        regra: "conselho-so-no-texto",
        mensagem: `"${d.nome_documento}" cita o ${noTexto} no texto, mas não o declara no campo de conselho. Declarado, ele sai sozinho se o cargo de ${noTexto} deixar o edital; só no texto, fica para trás.`,
      });
    }
  }

  // ── documento por cargo que aponta para cargo fora do edital ──
  const idsNoEdital = new Set(cargos.map((c) => c.cargo_id));
  for (const d of documentos) {
    if (d.cargo_id !== null && !idsNoEdital.has(d.cargo_id)) {
      avisos.push({
        severidade: "erro",
        regra: "documento-de-cargo-fora-do-edital",
        mensagem: `"${d.nome_documento}" está preso a um cargo que não está neste edital. Ele não sai no checklist de ninguém — é linha órfã.`,
      });
    }
  }

  // ── conselho exigido pelos cargos e sem nenhum documento correspondente ──
  // 🔴 É o par do defeito do 004, na direção oposta: lá sobrava um documento de conselho;
  // aqui FALTA. Um edital de Enfermeiro sem a certidão do COREN é tão errado quanto.
  const cobertos = new Set(
    documentos
      .map((d) => d.conselho_exigido ?? conselhoNoTexto(d.nome_documento))
      .filter((s): s is string => s !== null),
  );
  if (documentos.length > 0) {
    for (const sigla of permitidos) {
      if (!cobertos.has(sigla)) {
        avisos.push({
          severidade: "aviso",
          regra: "conselho-exigido-sem-documento",
          mensagem: `Algum cargo deste edital exige registro no ${sigla}, e o checklist não pede nenhum documento desse conselho.`,
        });
      }
    }
  }

  return avisos;
}
