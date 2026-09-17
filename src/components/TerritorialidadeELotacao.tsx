/**
 * Territorialidade e lotação — o Quadro II e o Anexo I do Edital 004.
 *
 * 🔴 **Para o ACS a opção de inscrição É a unidade**, com código próprio (DN-1 a DN-39).
 * Por isso esta tela é uma grade por unidade, com cota calculada em cada linha — e não
 * uma repartição de um total.
 *
 * ⚠️ **O capítulo é ligável em qualquer edital.** O material de referência intitulava
 * este passo "(Exclusivo ACS/Polos)" em DOIS arquivos, e isso foi recusado: o ACS é o
 * caso conhecido, não uma condição. No próprio Edital 004 o ACE **não** é
 * territorializado, e os dois convivem no mesmo documento.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import {
  useTerritorialidade, useUnidadesLotacao,
  type UnidadeLotacao, type VagasGravadas, type LinhaDeAbrangencia,
} from "@/hooks/useTerritorialidade";
import {
  conferirDistribuicao, somarDistribuicao, totalDaUnidade, agruparPorBairro,
  lerColagemDoAnexo,
} from "@/lib/edital-territorialidade";
import { sugerirCotas } from "@/lib/edital-cotas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, AlertTriangle, CircleAlert, MapPin, Upload } from "lucide-react";

const inteiro = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

function BotaoDeImportacao({
  unidade, onImportar, importando,
}: {
  unidade: UnidadeLotacao;
  onImportar: (linhas: { bairro: string | null; logradouro: string }[]) => void;
  importando: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const { linhas, recusadas } = lerColagemDoAnexo(texto);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" />
          Colar o Anexo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar a abrangência de {unidade.nome}</DialogTitle>
          <DialogDescription>
            Uma linha por logradouro. Termine uma linha com <code>:</code> para abrir um
            bairro. A numeração do documento é descartada — a ordem vem da sequência colada.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          aria-label="Texto do anexo"
          placeholder={"AERO CLUBE:\n1 | AVENIDA BEIRA-RIO\n2 | RUA EDU CHAVES\n\nJARDIM PARAÍBA:\nRUA 552"}
        />
        <div className="text-xs text-muted-foreground">
          {linhas.length} logradouro(s) reconhecido(s).
          {/* 🔴 As recusadas são NOMEADAS, não contadas. Um número sozinho não diz o que
              se perdeu. */}
          {recusadas.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-destructive">
              {recusadas.slice(0, 8).map((r) => (
                <li key={r.linha}>
                  linha {r.linha}: {r.conteudo} — {r.motivo}
                </li>
              ))}
              {recusadas.length > 8 && <li>…e mais {recusadas.length - 8}.</li>}
            </ul>
          )}
        </div>
        {/* ⚠️ Diz que SUBSTITUI antes de substituir. É troca total da unidade, como a
            importação de candidatos é do edital. */}
        <p className="text-xs text-amber-700">
          Importar <strong>substitui</strong> toda a abrangência desta unidade neste edital.
        </p>
        <Button
          disabled={linhas.length === 0 || importando}
          onClick={() => {
            onImportar(linhas);
            setTexto("");
            setAberto(false);
          }}
        >
          {importando ? "Importando…" : `Importar ${linhas.length} logradouro(s)`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function LinhaDaUnidade({
  v, nome, salvar, remover,
}: {
  v: VagasGravadas;
  nome: string;
  salvar: ReturnType<typeof useTerritorialidade>["salvarVagas"];
  remover: (id: string) => void;
}) {
  const t = totalDaUnidade(v);
  const s = sugerirCotas(t);
  const divergente = s.pcd !== v.vagas_pcd || s.negros !== v.vagas_negros;
  const rotulo = { vagas_ampla_concorrencia: "Ampla concorrência", vagas_pcd: "PcD", vagas_negros: "Cota racial" } as const;

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-[12rem] flex-1 font-medium">{nome}</span>
      <Input className="w-24" defaultValue={v.codigo_inscricao ?? ""} placeholder="DN-1"
        aria-label={`Código de inscrição de ${nome}`}
        onBlur={(e) => salvar({ ...v, codigo_inscricao: e.target.value.trim() || null })} />
      {(["vagas_ampla_concorrencia", "vagas_pcd", "vagas_negros"] as const).map((campo) => (
        <Input key={campo} className="w-16" type="number" defaultValue={v[campo]}
          aria-label={`${rotulo[campo]} em ${nome}`}
          onBlur={(e) => salvar({ ...v, [campo]: inteiro(e.target.value) })} />
      ))}
      <span className={`w-20 text-right text-xs ${divergente ? "text-amber-700" : "text-muted-foreground"}`}>
        {t} vaga(s)
      </span>
      {/* 🔴 O botão de sugerir fica por LINHA: a cota é calculada por unidade, não
          repartida a partir de um total do cargo. */}
      <Button variant="ghost" size="sm" className="text-xs"
        aria-label={`Aplicar a cota sugerida em ${nome}`}
        disabled={t === 0 || !divergente}
        onClick={() => salvar({
          ...v,
          vagas_ampla_concorrencia: s.amplaConcorrencia,
          vagas_pcd: s.pcd,
          vagas_negros: s.negros,
        })}>
        sugerir
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Remover ${nome} da distribuição`}
        onClick={() => remover(v.id)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}

function DistribuicaoDoCargo({
  nome, editalCargoId, totalDeclarado, vagas, unidades, salvar, remover,
}: {
  nome: string;
  editalCargoId: string;
  totalDeclarado: number | null;
  vagas: VagasGravadas[];
  unidades: UnidadeLotacao[];
  salvar: ReturnType<typeof useTerritorialidade>["salvarVagas"];
  remover: (id: string) => void;
}) {
  const [nova, setNova] = useState("");
  const avisos = conferirDistribuicao({
    unidades: vagas, totalDeclaradoNoCargo: totalDeclarado, rotuloDoCargo: nome,
  });
  const soma = somarDistribuicao(vagas);
  const nomeDa = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "(unidade removida)";
  const disponiveis = unidades.filter((u) => !vagas.some((v) => v.unidade_lotacao_id === u.id));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{nome}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {vagas.length > 0 && (
          <>
            <p className="text-sm">
              <strong>{soma.total}</strong> vagas em {vagas.length} unidade(s) —{" "}
              {soma.amplaConcorrencia} AC · {soma.pcd} PcD · {soma.negros} cota racial
              {/* ⚠️ Num edital territorializado o Quadro I não declara total: o número
                  acima É o total do cargo, derivado. Por isso não há "x de y" aqui. */}
              {totalDeclarado !== null && <> · Quadro I declara {totalDeclarado}</>}
            </p>
            <ul className="space-y-1">
              {vagas.map((v) => (
                <LinhaDaUnidade key={v.id} v={v} nome={nomeDa(v.unidade_lotacao_id)}
                  salvar={salvar} remover={remover} />
              ))}
            </ul>
          </>
        )}

        <div className="flex items-center gap-2 border-t pt-3">
          <Select value={nova} onValueChange={setNova}>
            <SelectTrigger className="flex-1" aria-label="Unidade a acrescentar">
              <SelectValue placeholder={
                disponiveis.length === 0
                  ? "Todas as unidades já estão na lista"
                  : "Escolha a unidade"
              } />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="gap-2" disabled={!nova}
            onClick={() => {
              salvar({ edital_cargo_id: editalCargoId, unidade_lotacao_id: nova, ordem: vagas.length });
              setNova("");
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

/** O Anexo I, em accordion por unidade. */
function Abrangencia({
  unidades, linhas, onImportar, importando,
}: {
  unidades: UnidadeLotacao[];
  linhas: LinhaDeAbrangencia[];
  onImportar: (unidadeId: string, ls: { bairro: string | null; logradouro: string }[]) => void;
  importando: boolean;
}) {
  const comAlguma = unidades.filter((u) => linhas.some((l) => l.unidade_lotacao_id === u.id));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" />
          Áreas de abrangência — {linhas.length} logradouro(s)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 🔵 Nem toda unidade tem lista: no Edital 004 são 14 de 39. Dizer isso evita que
            a ausência pareça carregamento pela metade. */}
        <p className="mb-2 text-xs text-muted-foreground">
          {comAlguma.length} de {unidades.length} unidade(s) com abrangência publicada. No
          Edital 004 são 14 de 39 — nem toda unidade publica a lista.
        </p>
        <Accordion type="multiple">
          {unidades.map((u) => {
            const dela = linhas.filter((l) => l.unidade_lotacao_id === u.id);
            return (
              <AccordionItem key={u.id} value={u.id}>
                <AccordionTrigger className="text-sm">
                  {u.nome}
                  <span className="ml-auto mr-2 text-xs text-muted-foreground">
                    {dela.length === 0 ? "sem abrangência" : `${dela.length} logradouro(s)`}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <BotaoDeImportacao unidade={u} importando={importando}
                    onImportar={(ls) => onImportar(u.id, ls)} />
                  {agruparPorBairro(dela).map((s, i) => (
                    <div key={i}>
                      {s.bairro && <p className="text-xs font-medium">{s.bairro}</p>}
                      <ol className="ml-4 list-decimal text-xs text-muted-foreground">
                        {s.logradouros.map((l) => <li key={l.id}>{l.logradouro}</li>)}
                      </ol>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

/** O catálogo GLOBAL de unidades — separado de `unidades_prova`, por medição. */
function CatalogoDeUnidades({
  unidades, salvar,
}: { unidades: UnidadeLotacao[]; salvar: (u: { nome: string }) => void }) {
  const [nome, setNome] = useState("");
  return (
    <div className="flex items-center gap-2">
      <Input className="flex-1" value={nome} onChange={(e) => setNome(e.target.value)}
        placeholder="Nova unidade de lotação (ex.: UBSF Belmonte)"
        aria-label="Nome da nova unidade de lotação" />
      <Button className="gap-2" disabled={!nome.trim()}
        onClick={() => { salvar({ nome: nome.trim() }); setNome(""); }}>
        <Plus className="h-4 w-4" />
        Cadastrar unidade
      </Button>
      <span className="text-xs text-muted-foreground">{unidades.length} no catálogo</span>
    </div>
  );
}

export function TerritorialidadeELotacao({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { unidades, salvar: salvarUnidade } = useUnidadesLotacao();
  const ids = cargosDoEdital.map((c) => c.id);
  const {
    distribuicao, abrangencia, isLoading, salvarVagas, removerVagas,
    importarAbrangencia, isImportando,
  } = useTerritorialidade(editalId, ids);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando a territorialidade…</p>;
  if (cargosDoEdital.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        A distribuição é por cargo. Acrescente os cargos no capítulo{" "}
        <strong>Do Quadro de Cargos</strong> primeiro.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <CatalogoDeUnidades unidades={unidades} salvar={salvarUnidade} />
      {cargosDoEdital.map((ec) => (
        <DistribuicaoDoCargo
          key={ec.id}
          nome={cargos.find((c) => c.id === ec.cargo_id)?.nome ?? "(cargo removido)"}
          editalCargoId={ec.id}
          totalDeclarado={ec.vagas_total ?? null}
          vagas={distribuicao.filter((v) => v.edital_cargo_id === ec.id)}
          unidades={unidades}
          salvar={salvarVagas}
          remover={removerVagas}
        />
      ))}
      <Abrangencia
        unidades={unidades}
        linhas={abrangencia}
        importando={isImportando}
        onImportar={(unidadeId, linhas) => importarAbrangencia({ unidadeId, linhas })}
      />
    </div>
  );
}
