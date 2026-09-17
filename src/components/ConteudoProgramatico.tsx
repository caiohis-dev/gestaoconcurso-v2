/**
 * O conteúdo programático — o Anexo de ementas.
 *
 * 🎯 **O indicador de cobertura é a peça central**, e é o que o roadmap pedia: "quais
 * disciplinas da matriz JÁ têm ementa e quais não — é o que impede o anexo sair
 * incompleto".
 *
 * ⚠️ E a cobertura é calculada contra a **matriz da prova** (fatia 5), não contra uma
 * lista digitada aqui. Foi esse cruzamento que achou o `LESGISLAÇÃO DO SUS` do Edital
 * 003, onde o anexo descreve uma disciplina de nome diferente da que a prova cobra.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useProvaObjetiva } from "@/hooks/useProvaObjetiva";
import { useConteudoProgramatico, type EmentaGravada } from "@/hooks/useConteudoProgramatico";
import {
  conferirConteudo, coberturaPorCargo, type DisciplinaDaProva,
} from "@/lib/edital-conteudo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CircleAlert, BookOpen, Check, X } from "lucide-react";

const TODOS = "__todos__";

/** 🎯 Quais disciplinas da matriz já têm ementa — o que impede o anexo sair incompleto. */
function Cobertura({
  disciplinas, ementas,
}: { disciplinas: DisciplinaDaProva[]; ementas: EmentaGravada[] }) {
  const cobertura = coberturaPorCargo(disciplinas, ementas);
  if (cobertura.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        A cobertura é conferida contra a matriz da prova. Preencha o capítulo{" "}
        <strong>Da Prova Objetiva</strong> para o sistema saber quais disciplinas o anexo
        precisa descrever.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-xs">
      {cobertura.map((c) => (
        <div key={c.cargo_id} className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{c.nomeDoCargo}</span>
          {c.comEmenta.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <Check className="h-3 w-3" /> {d}
            </span>
          ))}
          {c.semEmenta.map((d) => (
            <span key={d} className="flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
              <X className="h-3 w-3" /> {d}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function LinhaDeEmenta({
  e, cargos, nomeDoCargo, salvar, remover,
}: {
  e: EmentaGravada;
  cargos: { id: string; nome: string }[];
  nomeDoCargo: (id: string) => string;
  salvar: ReturnType<typeof useConteudoProgramatico>["salvar"];
  remover: (id: string) => void;
}) {
  return (
    <li className="space-y-1 rounded-md border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-w-[14rem] flex-1 font-medium" defaultValue={e.nome_disciplina}
          aria-label={`Nome da disciplina ${e.nome_disciplina}`}
          onBlur={(ev) => {
            const v = ev.target.value.trim();
            if (v && v !== e.nome_disciplina) salvar({ ...e, nome_disciplina: v });
          }} />
        {/* 🔴 Escolha EXPLÍCITA: o banco recusa a linha sem ela (`chk_conteudo_escopo`),
            para que "vale para todos" não se confunda com "esqueci de escolher". */}
        <Select
          value={e.aplica_a_todos_os_cargos ? TODOS : (e.cargo_id ?? TODOS)}
          onValueChange={(v) =>
            salvar({ ...e, cargo_id: v === TODOS ? null : v, aplica_a_todos_os_cargos: v === TODOS })
          }
        >
          <SelectTrigger className="w-56" aria-label={`Escopo da ementa de ${e.nome_disciplina}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Comum a todos os cargos</SelectItem>
            {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" aria-label={`Remover a ementa de ${e.nome_disciplina}`}
          onClick={() => remover(e.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {/* ⚠️ Textarea simples: a ementa é texto corrido em parágrafos nos três editais, não
          lista numerada. Não usa o mecanismo de itens da fatia 1 nem inventa uma segunda
          sintaxe de lista — era a pergunta aberta do roadmap. */}
      <Textarea rows={4} className="text-sm" defaultValue={e.texto_ementa}
        aria-label={`Ementa de ${e.nome_disciplina}`}
        onBlur={(ev) => {
          const v = ev.target.value.trim();
          if (v && v !== e.texto_ementa) salvar({ ...e, texto_ementa: v });
        }} />
      {e.cargo_id && (
        <p className="text-xs text-muted-foreground">só para {nomeDoCargo(e.cargo_id)}</p>
      )}
    </li>
  );
}

export function ConteudoProgramatico({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { disciplinas } = useProvaObjetiva(cargosDoEdital.map((c) => c.id));
  const { ementas, isLoading, salvar, remover, isSalvando } = useConteudoProgramatico(editalId);
  const [novo, setNovo] = useState({ nome: "", escopo: TODOS });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as ementas…</p>;

  const nomeDoCargo = (id: string) =>
    cargos.find((c) => c.id === id)?.nome ?? "(cargo removido)";
  const listaDeCargos = cargosDoEdital.map((ec) => ({
    id: ec.cargo_id, nome: nomeDoCargo(ec.cargo_id),
  }));

  const daProva: DisciplinaDaProva[] = disciplinas.flatMap((d) => {
    const ec = cargosDoEdital.find((x) => x.id === d.edital_cargo_id);
    if (!ec) return [];
    return [{
      edital_cargo_id: d.edital_cargo_id,
      cargo_id: ec.cargo_id,
      nomeDoCargo: nomeDoCargo(ec.cargo_id),
      nome_disciplina: d.nome_disciplina,
    }];
  });

  const avisos = conferirConteudo({ ementas, disciplinas: daProva });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          Conteúdo programático — {ementas.length} ementa(s)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Cobertura disciplinas={daProva} ementas={ementas} />

        {ementas.length > 0 && (
          <ul className="space-y-2">
            {ementas.map((e) => (
              <LinhaDeEmenta key={e.id} e={e} cargos={listaDeCargos}
                nomeDoCargo={nomeDoCargo} salvar={salvar} remover={remover} />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input className="min-w-[12rem] flex-1" value={novo.nome}
            onChange={(ev) => setNovo({ ...novo, nome: ev.target.value })}
            placeholder="Disciplina (ex.: Língua Portuguesa)"
            aria-label="Nome da nova disciplina" />
          <Select value={novo.escopo} onValueChange={(v) => setNovo({ ...novo, escopo: v })}>
            <SelectTrigger className="w-56" aria-label="Escopo da nova ementa"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Comum a todos os cargos</SelectItem>
              {listaDeCargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* 🔴 Nasce com um texto de partida, e NÃO é placeholder inventado: o banco
              recusa ementa em branco (`chk_conteudo_ementa`), e a frase diz o que fazer em
              vez de fingir conteúdo. Quem abrir o anexo sem preencher vê a instrução. */}
          <Button className="gap-2" disabled={!novo.nome.trim() || isSalvando}
            onClick={() => {
              salvar({
                nome_disciplina: novo.nome.trim(),
                texto_ementa: "Descreva aqui o programa desta disciplina.",
                cargo_id: novo.escopo === TODOS ? null : novo.escopo,
                aplica_a_todos_os_cargos: novo.escopo === TODOS,
                ordem: ementas.length,
              });
              setNovo({ nome: "", escopo: TODOS });
            }}>
            <Plus className="h-4 w-4" />
            Acrescentar
          </Button>
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
