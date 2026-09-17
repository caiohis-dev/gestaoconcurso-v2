/**
 * Territorialidade e lotação — o Quadro II do Edital 004 e o Anexo I.
 *
 * 🔴 **Para o ACS, a opção de inscrição É a unidade.** O candidato não se inscreve para
 * "Agente Comunitário de Saúde": inscreve-se para "ACS na UBSF Belmonte", com código
 * próprio (DN-1 a DN-39). Por isso a cota é calculada **por unidade** — e é o que faz a
 * soma final divergir do que daria aplicar 20% ao total.
 *
 * ⚠️ **O Quadro I do Edital 004 NÃO TEM coluna de vagas.** Ele publica só cargo,
 * habilitação, carga horária e vencimento; o item 2.2 manda ao Quadro II. Então, num
 * edital territorializado, o total do cargo é **derivado** da distribuição — não há um
 * número declarado para conferir contra. Isso muda o que dá para validar aqui, e é a
 * razão de `conferirDistribuicao` só acusar divergência quando os DOIS existem.
 *
 * Medido no Edital 004, o único territorializado dos três:
 *
 * | | vagas | forma |
 * |---|---|---|
 * | ACS (Quadro II) | 80 | 39 unidades, cota calculada em cada uma |
 * | ACE (Quadro III) | 143 | linha única — **não é territorializado** |
 *
 * 🔴 Que o ACE não seja territorializado é a prova de que isto é **parâmetro do cargo**,
 * não do edital: os dois convivem no mesmo documento.
 */
import { sugerirCotas, type Cotas } from "@/lib/edital-cotas";

export interface VagasNaUnidade {
  unidade_lotacao_id: string;
  codigo_inscricao: string | null;
  vagas_ampla_concorrencia: number;
  vagas_pcd: number;
  vagas_negros: number;
}

export interface AvisoTerritorialidade {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

export const totalDaUnidade = (u: VagasNaUnidade) =>
  (u.vagas_ampla_concorrencia || 0) + (u.vagas_pcd || 0) + (u.vagas_negros || 0);

/** A soma da distribuição — é ela que vira o total do cargo num edital territorializado. */
export function somarDistribuicao(us: readonly VagasNaUnidade[]): Cotas {
  return us.reduce<Cotas>(
    (s, u) => ({
      total: s.total + totalDaUnidade(u),
      amplaConcorrencia: s.amplaConcorrencia + (u.vagas_ampla_concorrencia || 0),
      pcd: s.pcd + (u.vagas_pcd || 0),
      negros: s.negros + (u.vagas_negros || 0),
    }),
    { total: 0, amplaConcorrencia: 0, pcd: 0, negros: 0 },
  );
}

/**
 * Confere a distribuição por unidade.
 *
 * `totalDeclaradoNoCargo` é o `vagas_total` do Quadro I — **anulável de propósito**: o
 * Edital 004 não o declara, e exigi-lo obrigaria a inventar um número.
 */
export function conferirDistribuicao(entrada: {
  unidades: readonly VagasNaUnidade[];
  totalDeclaradoNoCargo: number | null;
  rotuloDoCargo?: string;
}): AvisoTerritorialidade[] {
  const { unidades, totalDeclaradoNoCargo: declarado } = entrada;
  const onde = entrada.rotuloDoCargo ? `${entrada.rotuloDoCargo}: ` : "";
  const avisos: AvisoTerritorialidade[] = [];
  if (unidades.length === 0) return avisos;

  const soma = somarDistribuicao(unidades);

  // 🔴 Só acusa quando os DOIS existem. Num edital territorializado o Quadro I não
  // declara total, e cobrar a igualdade contra um `null` acusaria todo edital do tipo 004.
  if (declarado !== null && declarado !== soma.total) {
    avisos.push({
      severidade: "erro",
      regra: "distribuicao-nao-fecha",
      mensagem: `${onde}as unidades somam ${soma.total} vagas e o Quadro I declara ${declarado}. Os dois números saem publicados no mesmo edital, e um deles está errado.`,
    });
  }

  for (const u of unidades) {
    const t = totalDaUnidade(u);
    if (t === 0) {
      avisos.push({
        severidade: "aviso",
        regra: "unidade-sem-vaga",
        mensagem: `${onde}há uma unidade com zero vagas na distribuição. Ela sairia no Quadro II como linha vazia — se não oferece vaga, não deveria estar na lista.`,
      });
      continue;
    }
    // ⚠️ AVISO, não erro: a cota é SUGESTÃO, e o usuário pode ter razão para divergir.
    // Mas divergir calado é como o Quadro I sai contradizendo o próprio percentual
    // declarado — o defeito que a fatia 2 existe para matar.
    const s = sugerirCotas(t);
    if (s.pcd !== u.vagas_pcd || s.negros !== u.vagas_negros) {
      avisos.push({
        severidade: "aviso",
        regra: "cota-da-unidade-diverge",
        mensagem: `${onde}uma unidade com ${t} vaga(s) declara ${u.vagas_pcd} PcD e ${u.vagas_negros} de cota racial, onde a regra medida dá ${s.pcd} e ${s.negros}.`,
      });
    }
  }

  // 🔴 O código de inscrição repetido é o defeito mais caro desta tabela: duas unidades
  // com o mesmo código fazem o candidato se inscrever para a UBSF errada, e nada no
  // sistema o desfaz depois. ⚠️ NÃO é índice único no banco de propósito — metade dos 39
  // códigos fica NULL enquanto se digita, e um índice barraria o meio do caminho.
  const vistos = new Map<string, number>();
  for (const u of unidades) {
    const c = u.codigo_inscricao?.trim().toUpperCase();
    if (c) vistos.set(c, (vistos.get(c) ?? 0) + 1);
  }
  for (const [codigo, n] of vistos) {
    if (n > 1) {
      avisos.push({
        severidade: "erro",
        regra: "codigo-de-inscricao-repetido",
        mensagem: `${onde}o código de inscrição "${codigo}" está em ${n} unidades. O candidato escolhe a unidade pelo código — repetido, ele se inscreve para a errada.`,
      });
    }
  }

  return avisos;
}

/** Uma seção do Anexo I: as ruas de um bairro (ou da unidade, quando não há bairro). */
export interface SecaoDeAbrangencia {
  bairro: string | null;
  logradouros: readonly { id: string; logradouro: string }[];
}

/**
 * Agrupa os logradouros por bairro, preservando a ordem publicada.
 *
 * ⚠️ `bairro` nulo é uma seção legítima, não um resto: das 28 seções do Anexo I, 12
 * listam as ruas direto sob a unidade. Jogá-las num balde "sem bairro" no fim mudaria a
 * ordem do documento — por isso a seção nula fica onde apareceu.
 */
export function agruparPorBairro(
  linhas: readonly { id: string; bairro: string | null; logradouro: string; ordem: number }[],
): SecaoDeAbrangencia[] {
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  const secoes: SecaoDeAbrangencia[] = [];
  for (const l of ordenadas) {
    const chave = l.bairro?.trim() || null;
    const ultima = secoes[secoes.length - 1];
    if (!ultima || ultima.bairro !== chave) {
      secoes.push({ bairro: chave, logradouros: [{ id: l.id, logradouro: l.logradouro }] });
    } else {
      (ultima.logradouros as { id: string; logradouro: string }[]).push({
        id: l.id, logradouro: l.logradouro,
      });
    }
  }
  return secoes;
}

/**
 * Lê o texto colado do Anexo I.
 *
 * Formato: uma linha por logradouro; uma linha terminada em `:` abre um bairro.
 *
 * 🔴 Devolve também as RECUSADAS, e a tela as mostra uma a uma. Importação que engole
 * linha em silêncio é o formato de defeito que este repo mais teme — e aqui a linha
 * perdida é uma rua que some do anexo publicado, sem sinal nenhum. Quem cola 843 linhas
 * não tem como conferir de cabeça.
 */
export function lerColagemDoAnexo(texto: string): {
  linhas: { bairro: string | null; logradouro: string }[];
  recusadas: { linha: number; conteudo: string; motivo: string }[];
} {
  const linhas: { bairro: string | null; logradouro: string }[] = [];
  const recusadas: { linha: number; conteudo: string; motivo: string }[] = [];
  let bairro: string | null = null;
  const vistos = new Set<string>();

  texto.split("\n").forEach((bruta, i) => {
    // ⚠️ Tira a numeração do documento ("1 | RUA X" ou "1. RUA X"): ela é do PDF, não do
    // dado, e é recalculada em `ordem`. Guardá-la faria a renumeração mentir depois.
    const l = bruta.replace(/^\s*\|?\s*\d+\s*[|.)-]?\s*/, "").replace(/\|/g, " ").trim();
    if (l === "") return;
    if (l.endsWith(":")) {
      bairro = l.slice(0, -1).trim() || null;
      return;
    }
    const chave = `${bairro ?? ""}::${l.toUpperCase()}`;
    if (vistos.has(chave)) {
      recusadas.push({ linha: i + 1, conteudo: l, motivo: "repetida neste bairro" });
      return;
    }
    vistos.add(chave);
    linhas.push({ bairro, logradouro: l });
  });

  return { linhas, recusadas };
}
