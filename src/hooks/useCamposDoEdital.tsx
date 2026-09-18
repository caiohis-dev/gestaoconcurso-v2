/**
 * Os valores de `{{campo:}}` deste edital, já formatados.
 *
 * 🔴 **Este hook é a ÚNICA peça do mecanismo que fala com o banco.** O catálogo, a regex,
 * o resolvedor e os formatadores são função pura em `src/lib/edital-campos.ts`, testados
 * com os editais reais como fixture. É a mesma divisão das duas resoluções irmãs —
 * `resolverReferencias` recebe o documento pronto, `resolverReferenciasDeItem` recebe o
 * mapa de âncoras pronto — e é ela que mantém os 15 arquivos `edital-*.ts` puros.
 *
 * 🔴 **Nenhuma consulta nova.** Ele agrega hooks que a tela já monta, então o custo é
 * zero: o React Query devolve o mesmo cache que os painéis de capítulo já usam.
 *
 * ⚠️ **Enquanto carrega, devolve `undefined` — não um mapa vazio.** Um mapa vazio faria o
 * linter acusar dezenas de `campo-sem-valor` no primeiro frame e a prévia encher de
 * `[?campo:…]`, tudo sumindo sozinho um instante depois. É a armadilha "vazio enquanto
 * carrega", um dos dois padrões de defeito que mais se repetem neste repo — e a regra do
 * linter já está desenhada para não rodar sem o mapa.
 */
import { useMemo } from "react";
import { useEdital } from "@/hooks/useEdital";
import { useCronograma } from "@/hooks/useCronograma";
import {
  formatarDataExtenso,
  formatarInteiro,
  formatarTexto,
} from "@/lib/edital-campos";
import { formatarDatasDaEtapa } from "@/lib/edital-cronograma";

export function useCamposDoEdital(editalId: string | undefined) {
  const { edital, isLoading: carregandoEdital } = useEdital(editalId);
  const { etapas, isLoading: carregandoCronograma } = useCronograma(editalId);

  const isLoading = carregandoEdital || carregandoCronograma;

  const valores = useMemo(() => {
    if (isLoading || !edital) return undefined;

    const m = new Map<string, string>();
    // 🔴 `por` descarta null, undefined E string vazia. Ausente e vazio são a MESMA coisa
    // aqui de propósito: um "" no mapa resolveria o marcador para nada, deixando um buraco
    // invisível no meio da frase. `[?campo:x]` é feio, e é por isso que funciona.
    const por = (chave: string, valor: string | null) => {
      if (valor) m.set(chave, valor);
    };

    por("numero_edital", formatarTexto(edital.numero_edital));
    por("orgao_demandante", formatarTexto(edital.orgao_demandante));
    por("entidade_executora", formatarTexto(edital.entidade_executora));
    por("decreto_autorizador", formatarTexto(edital.decreto_autorizador));
    por("prazo_validade_anos", formatarInteiro(edital.prazo_validade_anos));
    por("site_oficial", formatarTexto(edital.site_oficial));
    por("executora_endereco", formatarTexto(edital.executora_endereco));
    por("signatario_nome", formatarTexto(edital.signatario_nome));
    por("signatario_cargo", formatarTexto(edital.signatario_cargo));
    por("data_publicacao", formatarDataExtenso(edital.data_publicacao));

    // ⚠️ A etapa entra pela CHAVE do catálogo. Etapa própria do autor (`chave` nula) não
    // vira campo: ela não tem nome estável para um marcador apontar, e inventar um a
    // partir do `nome_evento` quebraria todo texto no dia em que alguém renomeasse a etapa.
    for (const e of etapas) {
      if (!e.chave) continue;
      por(`cronograma_${e.chave}`, formatarDatasDaEtapa(e) || null);
    }

    return m as ReadonlyMap<string, string>;
  }, [isLoading, edital, etapas]);

  return { valores, isLoading };
}
