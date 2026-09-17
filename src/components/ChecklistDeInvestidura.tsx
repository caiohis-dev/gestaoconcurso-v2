/**
 * O checklist de investidura e posse — capítulo [16].
 *
 * 🎯 **A tela onde o defeito do Edital 004 deixa de ser possível.** O documento de
 * conselho de classe não é oferecido quando nenhum cargo do edital exige aquele conselho
 * — e não é "oferecido desabilitado": o botão **não existe**.
 *
 * ⚠️ O material de referência propunha "desabilitados ou ocultos". Desabilitado ainda é
 * oferecido, e vira habilitado no dia em que alguém "melhorar" a UX. Por isso a barreira
 * de verdade está no banco (trigger `IN001`) e esta tela é a conveniência — na ordem que
 * o §2 do CLAUDE.md manda, não o contrário.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useInvestidura, type DocumentoGravado } from "@/hooks/useInvestidura";
import {
  conferirInvestidura, conselhosDoEdital, documentosDoConselho, DOCUMENTOS_PADRAO,
  type CargoDoEdital,
} from "@/lib/edital-investidura";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CircleAlert, ListChecks, ShieldCheck } from "lucide-react";

const TODOS = "__todos__";

function LinhaDeDocumento({
  d, nomeDoCargo, cargos, salvar, remover,
}: {
  d: DocumentoGravado;
  nomeDoCargo: (id: string) => string;
  cargos: { id: string; nome: string }[];
  salvar: ReturnType<typeof useInvestidura>["salvar"];
  remover: (id: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <Input className="min-w-[16rem] flex-1" defaultValue={d.nome_documento}
        aria-label={`Nome do documento ${d.nome_documento}`}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== d.nome_documento) salvar({ ...d, nome_documento: v });
        }} />

      {/* 🔴 O escopo é escolha EXPLÍCITA, nunca um nulo implícito: o banco recusa a linha
          sem ela (`chk_doc_inv_escopo`), justamente para que "vale para todos" não se
          confunda com "esqueci de escolher". */}
      <Select
        value={d.aplica_a_todos_os_cargos ? TODOS : (d.cargo_id ?? TODOS)}
        onValueChange={(v) =>
          salvar({
            ...d,
            cargo_id: v === TODOS ? null : v,
            aplica_a_todos_os_cargos: v === TODOS,
          })
        }
      >
        <SelectTrigger className="w-56" aria-label={`Escopo de ${d.nome_documento}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os cargos</SelectItem>
          {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>

      {d.conselho_exigido && (
        <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
          <ShieldCheck className="h-3 w-3" />
          {d.conselho_exigido}
        </span>
      )}

      <label className="flex items-center gap-1.5 text-xs">
        <Switch checked={d.obrigatorio}
          onCheckedChange={(v) => salvar({ ...d, obrigatorio: v })}
          aria-label={`${d.nome_documento} é obrigatório`} />
        obrigatório
      </label>

      <Button variant="ghost" size="icon" aria-label={`Remover ${d.nome_documento}`}
        onClick={() => remover(d.id)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      {d.cargo_id && (
        <span className="w-full pl-1 text-xs text-muted-foreground">
          só para {nomeDoCargo(d.cargo_id)}
        </span>
      )}
    </li>
  );
}

export function ChecklistDeInvestidura({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { documentos, isLoading, salvar, remover, acrescentarVarios, isSalvando } =
    useInvestidura(editalId);
  const [novo, setNovo] = useState("");

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando o checklist…</p>;

  const doEdital: CargoDoEdital[] = cargosDoEdital.map((ec) => {
    const c = cargos.find((x) => x.id === ec.cargo_id);
    return {
      cargo_id: ec.cargo_id,
      nome: c?.nome ?? "(cargo removido)",
      conselho_classe_obrigatorio: c?.conselho_classe_obrigatorio ?? null,
    };
  });
  const conselhos = conselhosDoEdital(doEdital);
  const avisos = conferirInvestidura({ documentos, cargos: doEdital });
  const nomeDoCargo = (id: string) => doEdital.find((c) => c.cargo_id === id)?.nome ?? "(cargo)";
  const listaDeCargos = doEdital.map((c) => ({ id: c.cargo_id, nome: c.nome }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4" />
          Documentos da investidura — {documentos.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" disabled={isSalvando}
            onClick={() => acrescentarVarios(DOCUMENTOS_PADRAO.map((n) => ({ nome_documento: n })))}>
            <Plus className="h-4 w-4" />
            Pré-preencher os 10 documentos comuns
          </Button>

          {/*
            🎯 AQUI ESTÁ A REGRA. O botão de cada conselho só existe quando ALGUM CARGO do
            edital exige aquele conselho. Num edital só de Agente Comunitário de Saúde,
            `conselhos` é uma lista vazia e não há o que clicar — não há botão desabilitado
            esperando alguém habilitá-lo.
          */}
          {conselhos.map((sigla) => (
            <Button key={sigla} variant="outline" size="sm" className="gap-2" disabled={isSalvando}
              onClick={() => acrescentarVarios(
                documentosDoConselho(sigla).map((n) => ({ nome_documento: n, conselho_exigido: sigla })),
              )}>
              <ShieldCheck className="h-4 w-4" />
              Acrescentar documentos do {sigla}
            </Button>
          ))}
        </div>

        {conselhos.length === 0 && doEdital.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum cargo deste edital exige registro em conselho de classe, então não há
            documento de conselho a oferecer.
          </p>
        )}

        {documentos.length > 0 && (
          <ul className="space-y-2">
            {documentos.map((d) => (
              <LinhaDeDocumento key={d.id} d={d} nomeDoCargo={nomeDoCargo}
                cargos={listaDeCargos} salvar={salvar} remover={remover} />
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 border-t pt-3">
          <Input className="flex-1" value={novo} onChange={(e) => setNovo(e.target.value)}
            placeholder="Outro documento exigido na posse"
            aria-label="Nome do novo documento" />
          <Button className="gap-2" disabled={!novo.trim() || isSalvando}
            onClick={() => {
              salvar({
                nome_documento: novo.trim(),
                aplica_a_todos_os_cargos: true,
                cargo_id: null,
                ordem: documentos.length,
              });
              setNovo("");
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
