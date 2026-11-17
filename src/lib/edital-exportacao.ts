/**
 * O PORTÃO da exportação — decide se o edital pode sair, e o que falta para sair.
 *
 * 🔴 **Decisão do usuário (D-P1, 2026-11-16):** com pendência aberta a exportação é
 * BLOQUEADA, e só se libera com uma confirmação que NOMEIE cada pendência. Não há "marcar
 * todas": confirmar em bloco é o mesmo que não confirmar nada.
 *
 * Há dois tipos de impedimento, e a diferença é deliberada:
 *
 * | impedimento | confirmável? | por quê |
 * |---|---|---|
 * | pendência (linter, painel, quadro, anexo) | ✅ nomeando cada uma | o arquivo sai com ela VISÍVEL (`[?…]`, `> PENDÊNCIA`), e quem confirma sabe o que vai junto |
 * | consulta que FALHOU | ❌ | o hook lê falha como vazio (`data ?? []`): o arquivo sairia com uma tabela ou anexo FALTANDO, e a pendência diria "sem linha" — uma mentira plausível |
 * | rascunho não salvo | ❌ | a exportação lê o BANCO. O arquivo sairia diferente do texto na tela, e confirmar não muda isso; salvar resolve com um clique |
 *
 * ⚠️ **Por que o portão olha o documento montado e não só o linter.** Anexo vazio não é
 * regra do linter (ele não recebe o dado dos anexos) — só o documento montado sabe. E o
 * linter roda aqui SEM `linhasPorFonte`: a regra `quadro-sem-dado` não roda, porque a
 * pendência do quadro já vem do documento, com o motivo. Rodar as duas listaria o mesmo
 * quadro duas vezes.
 */
import { analisarEdital, type Severidade } from "@/lib/edital-linter";
import type { CapituloResolvido } from "@/lib/edital-numeracao";
import type { ItemBruto } from "@/lib/edital-itens";
import type { DocumentoMontado } from "@/lib/edital-documento";
import type { AvisoDePainel } from "@/lib/edital-conferencias";

export interface PendenciaDeExportacao {
  /**
   * Identidade da pendência para a confirmação. Inclui o TEXTO: se a pendência mudar (um
   * renumerar, outro motivo), a confirmação antiga não vale para a nova.
   */
  id: string;
  origem: "linter" | "painel" | "quadro" | "anexo";
  severidade: Severidade;
  /** Chave do capítulo, para levar a pessoa até lá. `null` nos anexos. */
  capitulo: string | null;
  texto: string;
}

export function pendenciasDaExportacao(entrada: {
  capitulos: readonly CapituloResolvido[];
  itens: readonly ItemBruto[];
  valores: ReadonlyMap<string, string>;
  documento: DocumentoMontado;
  /**
   * As dez conferências de painel (`conferenciasDoEdital`). OBRIGATÓRIO, sem padrão: um
   * `[]` implícito é o portão voltando a ignorá-las sem ninguém notar.
   */
  conferencias: readonly AvisoDePainel[];
}): PendenciaDeExportacao[] {
  const tituloDe = (chave: string) => entrada.capitulos.find((c) => c.chave === chave)?.titulo ?? chave;
  const brutas: Omit<PendenciaDeExportacao, "id">[] = [
    ...analisarEdital({ documento: entrada.capitulos, itens: entrada.itens, valoresDeCampo: entrada.valores }).map(
      (a) => ({ origem: "linter" as const, severidade: a.severidade, capitulo: a.capitulo, texto: a.mensagem }),
    ),
    // No painel a mensagem aparece dentro do capítulo; aqui ela chega sozinha, então leva o
    // título dele na frente.
    ...entrada.conferencias.map((a) => ({
      origem: "painel" as const,
      severidade: a.severidade,
      capitulo: a.capitulo,
      texto: `${tituloDe(a.capitulo)} — ${a.mensagem}`,
    })),
    ...entrada.documento.capitulos.flatMap((c) =>
      c.artigos
        .filter((a) => a.quadro?.pendencia)
        .map((a) => ({
          origem: "quadro" as const,
          severidade: "erro" as const,
          capitulo: c.chave,
          texto: `Quadro ${a.numeroDoQuadro ?? "?"}: ${a.quadro!.pendencia}`,
        })),
    ),
    ...entrada.documento.anexos
      .filter((a) => a.pendencia)
      .map((a) => ({
        origem: "anexo" as const,
        severidade: "erro" as const,
        capitulo: null,
        texto: `Anexo ${a.numero} (${a.titulo}): ${a.pendencia}`,
      })),
  ];

  // Duas pendências com o mesmo texto são DUAS confirmações, não uma: `#2` desempata.
  const vistos = new Map<string, number>();
  return brutas.map((p) => {
    const base = `${p.origem}|${p.capitulo ?? ""}|${p.texto}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return { ...p, id: n === 1 ? base : `${base}#${n}` };
  });
}

export type EstadoDaExportacao =
  | { tipo: "falha"; consultas: string[] }
  | { tipo: "carregando" }
  | { tipo: "rascunho"; quantidade: number }
  | { tipo: "pendente"; pendencias: PendenciaDeExportacao[]; faltam: PendenciaDeExportacao[] }
  | { tipo: "livre"; pendencias: PendenciaDeExportacao[] };

/**
 * A ordem das recusas importa:
 * 1. **falha** antes de tudo — inclusive antes de "carregando": consulta que falhou não
 *    volta sozinha, e esperar por ela seria um spinner eterno;
 * 2. **carregando** — documento pela metade nunca é avaliado;
 * 3. **rascunho** antes das pendências — confirmar pendência de um texto que vai mudar ao
 *    salvar seria confirmar a coisa errada;
 * 4. **pendências**: livre só quando TODAS as atuais estão confirmadas. Confirmação de
 *    pendência que sumiu não conta, nem atrapalha.
 */
export function avaliarExportacao(entrada: {
  consultasComErro: readonly string[];
  pendencias: readonly PendenciaDeExportacao[] | undefined;
  rascunhosSujos: number;
  confirmadas: ReadonlySet<string>;
}): EstadoDaExportacao {
  if (entrada.consultasComErro.length > 0) return { tipo: "falha", consultas: [...entrada.consultasComErro] };
  if (!entrada.pendencias) return { tipo: "carregando" };
  if (entrada.rascunhosSujos > 0) return { tipo: "rascunho", quantidade: entrada.rascunhosSujos };

  const pendencias = [...entrada.pendencias];
  const faltam = pendencias.filter((p) => !entrada.confirmadas.has(p.id));
  return faltam.length > 0 ? { tipo: "pendente", pendencias, faltam } : { tipo: "livre", pendencias };
}

/**
 * `edital-002-2026.md` a partir do número; sem número, do nome. Sem acento nem espaço —
 * o arquivo vai para pasta, e-mail e git.
 */
export function nomeDoArquivo(edital: { nome?: string | null; numero_edital?: string | null } | null | undefined): string {
  const base = edital?.numero_edital?.trim() ? `edital-${edital.numero_edital}` : edital?.nome?.trim() || "edital";
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "edital"}.md`;
}
