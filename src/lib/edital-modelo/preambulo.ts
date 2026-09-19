/**
 * Capítulo `preambulo` — o parágrafo de abertura do edital.
 *
 * ── O QUE FOI MEDIDO NOS TRÊS EDITAIS (2026-09-18) ────────────────────────────────────
 *
 * O elemento pré-textual tem DUAS partes, e não uma:
 *
 * | | 002 | 003 | 004 |
 * |---|---|---|---|
 * | cabeçalho empilhado (município · secretaria · natureza · nº) | sim | sim | não transcrito |
 * | parágrafo de abertura ("torna público que…") | sim | sim | sim |
 *
 * 🔴 **Só o PARÁGRAFO entra aqui, e o cabeçalho NÃO.** O cabeçalho é identificação pura,
 * inteiramente derivável dos metadados (`orgao_demandante`, `natureza_juridica`,
 * `numero_edital`) e sem nada a redigir. Virá da exportação (fatia 12), montado do dado.
 * Transformá-lo em quatro artigos de texto seria convidar alguém a digitar à mão o que os
 * campos já sabem — e a divergir deles no dia em que um mudar.
 *
 * ── 🔴 O DEFEITO QUE ESTE CAPÍTULO SOZINHO JÁ MATA ────────────────────────────────────
 *
 * Medido: **`MUNICÍPIO DE V0LTA REDONDA`, com ZERO no lugar do O — 3 ocorrências no Edital
 * 002, 1 no Edital 003, nenhuma no 004.** Presente em dois documentos e ausente no terceiro
 * é a assinatura de copia-e-cola: o erro viajou de um edital para o outro e ninguém o viu.
 *
 * No modelo o nome do município é escrito **uma vez**, aqui, e revisado em diff. É o mesmo
 * argumento da "Certidão Nada Consta do COREN" exigida de Agente Comunitário de Saúde no
 * Edital 004 — a diferença é que este custa a credibilidade do documento, não um recurso.
 *
 * ⚠️ Duas correções silenciosas em relação ao 004, registradas para não parecerem descuido:
 * ele escreve *"nos termos NO presente Edital"* (o 002 escreve "do", que é o certo) e
 * *"para o PROCESSO SELETIVO PÚBLICO PARA"* com o "para" repetido.
 *
 * ── O que NÃO virou campo, e por quê ─────────────────────────────────────────────────
 *
 * - **"MUNICÍPIO DE VOLTA REDONDA"** e **"Administração Pública Municipal de Volta Redonda"**
 *   ficam literais: a regra do catálogo exige que o dado VARIE entre editais, e o município
 *   é o mesmo em todos os certames desta banca. Campo para constante é formulário a mais sem
 *   verdade a mais.
 * - **A secretaria que PUBLICA** (o 002 a empilha no cabeçalho, o 004 a cita no parágrafo)
 *   não ganhou campo próprio: ela já está em `signatario_cargo` — "Secretário Municipal de
 *   Administração" —, e duas fontes para o mesmo fato divergem. É a dívida que a fatia 12 já
 *   tem registrada com o e-mail da vista de prova.
 */
import type { CapituloDoModelo } from "@/lib/edital-modelo/tipos";

export const PREAMBULO: CapituloDoModelo = {
  chave: "preambulo",
  fonte: "Edital 004/2026, parágrafo de abertura, transcrito em 2026-09-18",
  artigosEsperados: 1,
  camposUsados: ["signatario_cargo", "natureza_juridica", "cargos_do_edital", "regime_trabalho"],
  ancorasPublicadas: [],
  ancorasConsumidas: [],
  artigos: [
    {
      // `prosa`: o preâmbulo é pré-textual e não recebe número — é o que `numerado: false`
      // diz no catálogo, e `prosa` é como o artigo respeita isso.
      tipo: "prosa",
      texto:
        "O **MUNICÍPIO DE VOLTA REDONDA**, através do **{{campo:signatario_cargo}}**, no uso de " +
        "suas atribuições legais, torna público que estarão abertas as inscrições para o " +
        "**{{campo:natureza_juridica}}** para **{{campo:cargos_do_edital}}**, visando ao " +
        "provimento de vagas e formação de Cadastro de Reserva nos quadros da Administração " +
        "Pública Municipal de Volta Redonda, a ser realizado sob o regime " +
        "{{campo:regime_trabalho}}, nos termos do presente Edital.",
    },
  ],
};
