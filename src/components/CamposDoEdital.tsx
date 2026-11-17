/**
 * "Campos do edital" — o catálogo de `{{campo:}}` na tela, com onde cada um se preenche.
 *
 * 🔵 2026-11-16, a pedido do usuário: "como faço para ver o nome de um input na tela?". Até
 * aqui a ligação marcador → input só aparecia quando o campo estava VAZIO (o `[?campo:x]` da
 * prévia e a mensagem do linter). Preenchido, sumia — e quem escrevia um artigo novo não
 * tinha como saber que `{{campo:signatario_cargo}}` existe, nem onde se preenche.
 *
 * Mostra, por capítulo onde se preenche: o rótulo (o mesmo texto do input), o marcador com
 * botão de copiar, e o VALOR ATUAL — ou "vazio", que é o que sairia como `[?campo:x]`.
 *
 * ⚠️ O "onde se preenche" é `ondeSePreenche` do catálogo, e um teste o mede contra a tela
 * (`edital-campos.test.ts`): até 16/11 quatro campos apontavam para o capítulo errado.
 */
import { useMemo, useState } from "react";
import { useCamposDoEdital } from "@/hooks/useCamposDoEdital";
import { CAMPOS_CATALOGO } from "@/lib/edital-campos";
import { CAPITULO_POR_CHAVE, CAPITULOS_CATALOGO } from "@/lib/edital-capitulos";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Braces, Check, Copy } from "lucide-react";

/** Sem acento e em minúsculas — para "signatario" achar "Signatário". */
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function BotaoDeCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copiar ${texto}`}
      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        // Sem clipboard (http fora de localhost), o marcador continua selecionável na tela.
        void navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
    >
      {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * A lista, só apresentação. `valores` é `undefined` enquanto carrega — e aí a coluna de
 * valor diz "carregando", nunca "vazio": dizer "vazio" de um campo preenchido mandaria a
 * pessoa preencher de novo.
 */
export function ListaDeCampos({ valores, filtro }: { valores: ReadonlyMap<string, string> | undefined; filtro: string }) {
  const grupos = useMemo(() => {
    const f = normal(filtro.trim());
    const casam = CAMPOS_CATALOGO.filter(
      (c) => !f || normal(c.chave).includes(f) || normal(c.rotulo).includes(f),
    );
    // Na ordem do DOCUMENTO, que é a ordem da trilha à esquerda.
    const porCapitulo = CAPITULOS_CATALOGO.map((cap) => ({
      cap: { chave: cap.chave, titulo: cap.titulo },
      campos: casam.filter((c) => c.ondeSePreenche === cap.chave),
    }));
    // Campo cujo capítulo não está no catálogo não pode SUMIR da lista: vai para um grupo
    // à parte, visível. (O teste de `edital-campos` impede que exista; isto é o cinto.)
    const orfaos = casam.filter((c) => !CAPITULO_POR_CHAVE.has(c.ondeSePreenche));
    return [
      ...porCapitulo,
      { cap: { chave: "__desconhecido", titulo: "(capítulo desconhecido)" }, campos: orfaos },
    ].filter((g) => g.campos.length > 0);
  }, [filtro]);

  if (grupos.length === 0) return <p className="p-3 text-xs text-muted-foreground">Nenhum campo com “{filtro}”.</p>;

  return (
    <div className="divide-y">
      {grupos.map(({ cap, campos }) => (
        <section key={cap.chave} className="p-3" aria-label={`Preenche-se em ${cap.titulo}`}>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Preenche-se em: {cap.titulo}</h4>
          <ul className="space-y-1.5">
            {campos.map((c) => {
              const marcador = `{{campo:${c.chave}}}`;
              const valor = valores?.get(c.chave);
              return (
                <li key={c.chave} className="text-xs">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-foreground">{c.rotulo}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="select-all rounded bg-muted px-1 font-mono">{marcador}</code>
                    <BotaoDeCopiar texto={marcador} />
                  </div>
                  <div className={valor ? "text-muted-foreground" : "text-amber-700"}>
                    {valores === undefined ? "carregando…" : valor ? `= ${valor}` : "vazio — sairia como [?campo:" + c.chave + "]"}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function BotaoDeCampos({ editalId }: { editalId: string | undefined }) {
  const { valores } = useCamposDoEdital(editalId);
  const [filtro, setFiltro] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Braces className="h-4 w-4" />
          Campos do edital
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[26rem] p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por nome ou marcador…"
            aria-label="Buscar campo"
            className="h-8 text-sm"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Escreva o marcador no texto do artigo; o valor sai do capítulo indicado.
          </p>
        </div>
        <ScrollArea className="h-[60vh]">
          <ListaDeCampos valores={valores} filtro={filtro} />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
