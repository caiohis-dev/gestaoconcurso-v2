/**
 * Critérios de desempate — capítulo [15].
 *
 * 🔴 **O sistema DESCREVE a ordem. Quem desempata é a correção da prova**, que é outro
 * módulo e não existe. Desempate é a parte do edital que mais vira processo judicial, e
 * nada nesta tela compara candidatos.
 *
 * ⚠️ **Botões ↑ ↓, não arrasto** — mesma decisão da fatia 1: a lista tem 4 a 7 itens, os
 * botões funcionam pelo teclado, e a memória do repo registra 4 armadilhas silenciosas no
 * @dnd-kit 6.3.1.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import { useTitulos } from "@/hooks/useTitulos";
import { useDesempate, type CriterioGravado } from "@/hooks/useDesempate";
import {
  conferirDesempate, rotuloDoCriterio, TIPOS_DE_CRITERIO, type ListaDeDesempate,
} from "@/lib/edital-desempate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, CircleAlert, ListOrdered,
} from "lucide-react";

function LinhaDeCriterio({
  c, primeiro, ultimo, travado, disciplinas, salvar, remover, mover,
}: {
  c: CriterioGravado;
  primeiro: boolean;
  ultimo: boolean;
  travado: boolean;
  disciplinas: string[];
  salvar: ReturnType<typeof useDesempate>["salvar"];
  remover: (id: string) => void;
  mover: ReturnType<typeof useDesempate>["mover"];
}) {
  const exigeDisciplina = c.criterio_tipo === "PONTUACAO_DISCIPLINA";
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      {/* 🔴 A posição é read-only: ela vem da ordem da lista, como o número do artigo na
          fatia 1. Um campo editável aqui deixaria duas na mesma posição — que o banco
          recusa, mas a tela não deve nem oferecer. */}
      <span className="w-8 shrink-0 text-right font-medium text-muted-foreground">
        {c.ordem_prioridade}º
      </span>
      <span className="min-w-[16rem] flex-1">{rotuloDoCriterio(c.criterio_tipo)}</span>

      {exigeDisciplina && (
        <Select
          value={c.disciplina_referencia ?? ""}
          onValueChange={(v) => salvar({ ...c, disciplina_referencia: v })}
        >
          <SelectTrigger className="w-56" aria-label={`Disciplina do ${c.ordem_prioridade}º critério`}>
            <SelectValue placeholder="Escolha a disciplina" />
          </SelectTrigger>
          <SelectContent>
            {/* ⚠️ Só as disciplinas que existem na matriz. Deixar digitar livre aqui
                reabriria a divergência de nome que o linter existe para achar. */}
            {disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            {/* Mantém o valor gravado visível mesmo se ele sumiu da matriz — senão o
                critério pareceria vazio, e o linter acusaria algo invisível. */}
            {c.disciplina_referencia && !disciplinas.includes(c.disciplina_referencia) && (
              <SelectItem value={c.disciplina_referencia}>
                {c.disciplina_referencia} (fora da matriz)
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Subir o ${c.ordem_prioridade}º critério`}
          disabled={primeiro || travado} onClick={() => mover({ id: c.id, delta: -1 })}>
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Descer o ${c.ordem_prioridade}º critério`}
          disabled={ultimo || travado} onClick={() => mover({ id: c.id, delta: 1 })}>
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
          aria-label={`Remover o ${c.ordem_prioridade}º critério`}
          disabled={travado} onClick={() => remover(c.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function Lista({
  titulo, lista, criterios, disciplinas, travado, salvar, remover, mover,
}: {
  titulo: string;
  lista: ListaDeDesempate;
  criterios: CriterioGravado[];
  disciplinas: string[];
  travado: boolean;
  salvar: ReturnType<typeof useDesempate>["salvar"];
  remover: (id: string) => void;
  mover: ReturnType<typeof useDesempate>["mover"];
}) {
  const [novo, setNovo] = useState("");
  const dela = criterios
    .filter((c) => c.lista === lista)
    .sort((a, b) => a.ordem_prioridade - b.ordem_prioridade);
  // ⚠️ Só os tipos DESTA lista. O banco também os separa
  // (`chk_desempate_tipo_da_lista`), e oferecer o de outra lista seria pedir uma recusa.
  const disponiveis = TIPOS_DE_CRITERIO.filter(
    (t) => t.lista === lista && !dela.some((c) => c.criterio_tipo === t.tipo && !t.exigeDisciplina),
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{titulo}</p>
      {dela.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum critério nesta lista.</p>
      )}
      <ul className="space-y-1">
        {dela.map((c, i) => (
          <LinhaDeCriterio key={c.id} c={c} primeiro={i === 0} ultimo={i === dela.length - 1}
            travado={travado} disciplinas={disciplinas} salvar={salvar} remover={remover} mover={mover} />
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Select value={novo} onValueChange={setNovo}>
          <SelectTrigger className="flex-1" aria-label={`Critério a acrescentar em ${titulo}`}>
            <SelectValue placeholder={
              disponiveis.length === 0 ? "Todos os critérios já estão na lista" : "Escolha o critério"
            } />
          </SelectTrigger>
          <SelectContent>
            {disponiveis.map((t) => <SelectItem key={t.tipo} value={t.tipo}>{t.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="gap-2" disabled={!novo || travado}
          onClick={() => {
            const def = TIPOS_DE_CRITERIO.find((t) => t.tipo === novo)!;
            salvar({
              lista,
              criterio_tipo: novo,
              ordem_prioridade: dela.length + 1,
              // 🔴 A disciplina nasce com a primeira da matriz, não vazia: o banco recusa
              // `PONTUACAO_DISCIPLINA` sem disciplina (`chk_desempate_disciplina`), e um
              // botão que sempre falha é pior que um valor que o usuário troca.
              disciplina_referencia: def.exigeDisciplina ? (disciplinas[0] ?? null) : null,
            });
            setNovo("");
          }}>
          <Plus className="h-4 w-4" />
          Acrescentar
        </Button>
      </div>
    </div>
  );
}

export function CriteriosDeDesempate({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const ids = cargosDoEdital.map((c) => c.id);
  const { disciplinas } = useProvaObjetiva(ids);
  const { itens: titulos } = useTitulos(editalId, ids);
  const { criterios, isLoading, salvar, remover, mover, isMexendo } = useDesempate(editalId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os critérios…</p>;

  const nomes = [...new Set(disciplinas.map((d) => d.nome_disciplina))];
  const avisos = conferirDesempate({
    criterios, disciplinasDaProva: nomes, temProvaDeTitulos: titulos.length > 0,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4" />
          Critérios de desempate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 🔴 A fronteira, escrita na tela e não só no código: quem lê precisa saber que
            o sistema não desempata ninguém. */}
        <p className="text-xs text-muted-foreground">
          O capítulo descreve a ordem que sai publicada. O sistema não compara candidatos —
          quem aplica os critérios é a correção da prova.
        </p>

        {nomes.length === 0 && (
          <p className="text-xs text-amber-700">
            A matriz da prova ainda está vazia. Preencha o capítulo{" "}
            <strong>Da Prova Objetiva</strong> para escolher as disciplinas do desempate.
          </p>
        )}

        <Lista titulo="Ampla concorrência e cotas raciais" lista="GERAL"
          criterios={criterios} disciplinas={nomes} travado={isMexendo}
          salvar={salvar} remover={remover} mover={mover} />

        <div className="border-t pt-3">
          <Lista titulo="Pessoas com deficiência (Leis Municipais 3.113/94 e 3.221/95)" lista="PCD"
            criterios={criterios} disciplinas={nomes} travado={isMexendo}
            salvar={salvar} remover={remover} mover={mover} />
        </div>

        {avisos.length > 0 && (
          <ul className="space-y-1 text-xs">
            {avisos.map((a, i) => (
              <li key={i} className={`flex items-start gap-1 ${a.severidade === "erro" ? "text-destructive" : "text-amber-700"}`}>
                {a.severidade === "erro"
                  ? <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                {a.mensagem}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
