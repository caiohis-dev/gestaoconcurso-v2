/**
 * A faixa do edital padrão, no alto do Edital Studio.
 *
 * Três estados, e nenhum deles é silencioso:
 *
 * | quando | o que aparece |
 * |---|---|
 * | este edital É o modelo | aviso de que o texto aqui é a base de todos os outros |
 * | nunca absorveu e está vazio | o convite, com o número de artigos e o botão |
 * | já absorveu | a procedência: de que versão veio, e quando |
 *
 * 🔴 **O convite é um CLIQUE, não um efeito** — decisão do usuário em 2026-09-18. Um
 * `useEffect` que absorvesse ao montar dispararia duas vezes em StrictMode e duas vezes de
 * verdade em duas abas; e não teria onde dizer o que esta faixa diz.
 *
 * 🔴 **É aqui que a procedência do texto é anunciada, e ela não é enfeite.** O texto-base é
 * o Edital 004/2026, cujas referências cruzadas foram medidas: 35 das 51 apontavam para o
 * capítulo anterior. O modelo as corrige por âncora, mas o resto do texto continua sendo de
 * um concurso de Agente Comunitário de Saúde — e quem publicar sem revisar herda as
 * peculiaridades dele. É o defeito que o módulo existe para matar, e a única defesa contra
 * a versão dele que o próprio modelo pode criar.
 */
import { useEditalModelo, useAplicarModeloPadrao } from "@/hooks/useModeloPadrao";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileStack, Info, AlertTriangle } from "lucide-react";

function formatarDataHora(iso: string): string {
  const [data] = iso.split("T");
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

export function FaixaDoModeloPadrao({
  editalId,
  ehModelo,
  aplicadoEm,
  versaoAplicada,
  temArtigo,
}: {
  editalId: string;
  ehModelo: boolean;
  aplicadoEm: string | null;
  versaoAplicada: string | null;
  temArtigo: boolean;
}) {
  const { modelo, isLoading } = useEditalModelo();
  const { aplicar, isAplicando } = useAplicarModeloPadrao(editalId);

  if (ehModelo) {
    return (
      <Alert>
        <FileStack className="h-4 w-4" />
        <AlertTitle>Este é o edital modelo</AlertTitle>
        <AlertDescription>
          O texto redigido aqui é a base que os editais novos copiam. Ele não recebe prova nem
          inscrito, e não aparece na lista de editais.
          {modelo?.modelo_versao && <> Versão atual: <strong>{modelo.modelo_versao}</strong>.</>}
        </AlertDescription>
      </Alert>
    );
  }

  if (aplicadoEm) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Montado a partir do edital padrão</AlertTitle>
        <AlertDescription>
          Absorvido em {formatarDataHora(aplicadoEm)}
          {versaoAplicada && <> (versão {versaoAplicada})</>}. O texto-base é o Edital 004/2026 —
          revise cada capítulo antes de publicar.
        </AlertDescription>
      </Alert>
    );
  }

  // Só oferece para edital que nunca absorveu E não tem texto nenhum. Um edital com texto
  // escrito à mão não recebe convite: a RPC o recusaria (EM003) e o convite seria uma
  // promessa que o banco não honra.
  if (temArtigo || isLoading) return null;

  if (!modelo) {
    // ⚠️ Nunca um botão que não funciona. O modelo nasce por migration; se não existe, é
    // ambiente sem as migrations aplicadas, e dizer isso é mais útil que esconder a faixa.
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não há edital padrão neste ambiente</AlertTitle>
        <AlertDescription>
          A linha do modelo nasce por migration. Confira se as migrations foram aplicadas antes
          de redigir do zero.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <FileStack className="h-4 w-4" />
      <AlertTitle>Este edital ainda não tem texto</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          O edital padrão traz o documento inteiro com os marcadores de dado variável já no
          lugar — datas, valores e endereços saem dos formulários de cada capítulo.
        </p>
        <p className="text-xs">
          ⚠️ O texto-base é o <strong>Edital 004/2026</strong>, e as referências cruzadas foram
          reescritas por âncora: o documento publicado tinha 35 delas apontando para o capítulo
          errado. Revise cada capítulo antes de publicar.
        </p>
        <Button size="sm" onClick={() => aplicar(undefined)} disabled={isAplicando}>
          {isAplicando ? "Aplicando…" : "Aplicar o edital padrão"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
