/**
 * A prova de títulos — capítulo [14], os Quadros III e IV.
 *
 * 🔴 **O contador contra o teto é a peça central**, como o de questões na fatia 5: quadro
 * publicado que soma mais que o próprio teto se contradiz na cara do candidato. O aviso
 * aparece ao lado do contador, na hora, e não só ao salvar.
 *
 * ⚠️ **As regras gerais são do EDITAL e os títulos são do CARGO.** O item 13.4 do Edital
 * 002 declara o teto uma vez para os dois quadros, e por isso esta tela tem um bloco no
 * alto (uma vez) e um cartão por cargo abaixo. Difere da fatia 5 de propósito.
 *
 * 🔵 Cargo SEM título é estado legítimo, não pendência: é assim que o item 13.2 ("a
 * pontuação só ocorrerá para Docente I e Docente II") acontece sozinho. Por isso não há
 * aviso nenhum num cargo vazio.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useCronograma } from "@/hooks/useCronograma";
import { useTitulos, type TituloGravado } from "@/hooks/useTitulos";
import {
  conferirTitulos,
  somaDosPontos,
  dataLimiteDeConclusao,
  NIVEIS_DE_TITULO,
  rotuloDoNivel,
  type ConfigTitulos,
  type NivelTitulo,
} from "@/lib/edital-titulos";
import { ultimaData } from "@/lib/edital-cronograma";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CircleAlert, CalendarClock } from "lucide-react";

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

interface Rascunho {
  nivel: NivelTitulo;
  descricao: string;
  area: string;
  ch: string;
  pontos: string;
}
const VAZIO: Rascunho = { nivel: "ESPECIALIZACAO_LATO_SENSU", descricao: "", area: "", ch: "", pontos: "" };

/**
 * As regras que valem para o edital inteiro (item 13), e a data-limite DERIVADA.
 *
 * 🔴 A data-limite não tem campo: ela sai do fim das inscrições menos os dias declarados.
 * Um campo de data aqui seria a segunda cópia que envelhece calada quando o cronograma
 * muda — que é o `"dia XX/xx/2026"` do Edital 004 em outra roupa.
 */
function RegrasGerais({
  config, fimDasInscricoes, salvar,
}: {
  config: ConfigTitulos | null;
  fimDasInscricoes: string | null;
  salvar: (c: Partial<ConfigTitulos>) => void;
}) {
  const dias = config?.dias_conclusao_antes_fim_inscricoes ?? null;
  const limite = dataLimiteDeConclusao(fimDasInscricoes, dias);

  const chave = (campo: keyof ConfigTitulos, rotulo: string) => (
    <label key={campo} className="flex items-center gap-2 text-sm">
      <Switch
        checked={!!config?.[campo]}
        onCheckedChange={(v) => salvar({ ...config, [campo]: v })}
        aria-label={rotulo}
      />
      {rotulo}
    </label>
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Regras gerais da avaliação de títulos</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Teto máximo (pontos)
            <Input type="number" step="0.01" defaultValue={config?.teto_maximo_pontos ?? ""}
              onBlur={(e) => salvar({ ...config, teto_maximo_pontos: num(e.target.value) })} />
          </label>
          <label className="text-sm">Concluídos até (dias antes do fim das inscrições)
            <Input type="number" defaultValue={dias ?? ""}
              onBlur={(e) => salvar({ ...config, dias_conclusao_antes_fim_inscricoes: num(e.target.value) })} />
          </label>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {limite
            ? <>Data-limite de conclusão: <strong>{dataBR(limite)}</strong> — calculada do fim das inscrições, não digitada.</>
            : dias === null
              ? "Declare os dias para o sistema calcular a data-limite."
              : "Preencha o fim das inscrições no capítulo Do Cronograma para o sistema calcular a data-limite."}
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {chave("carater_classificatorio", "Apenas classificatório")}
          {chave("exige_historico_escolar", "Exige histórico escolar")}
          {chave("exige_reconhecimento_mec_cne", "Exige reconhecimento MEC/CNE")}
          {chave("exige_traducao_juramentada", "Exige tradução juramentada")}
          {chave("exige_revalidacao_diploma_estrangeiro", "Exige revalidação de diploma estrangeiro")}
        </div>
      </CardContent>
    </Card>
  );
}

/** 🔴 O contador contra o teto — a peça central, no padrão do contador de questões. */
function ContadorDePontos({ soma, teto }: { soma: number; teto: number | null }) {
  const fechou = teto === null || soma === teto;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className={fechou ? "" : "font-medium text-destructive"}>
          {soma} / {teto ?? "—"} pontos no quadro
        </span>
      </div>
      <Progress value={teto ? Math.min(100, (soma / teto) * 100) : 0} />
    </div>
  );
}

function LinhaDeTitulo({
  t, salvar, remover,
}: {
  t: TituloGravado;
  salvar: ReturnType<typeof useTitulos>["salvarTitulo"];
  remover: (id: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-40 shrink-0 text-xs text-muted-foreground">{rotuloDoNivel(t.nivel)}</span>
      <Input className="min-w-[12rem] flex-1" defaultValue={t.area_exigida ?? ""}
        placeholder="Área exigida"
        aria-label="Área exigida"
        onBlur={(e) => salvar({ ...t, area_exigida: e.target.value.trim() || null })} />
      <Input className="w-24" type="number" defaultValue={t.carga_horaria_minima_horas ?? ""}
        placeholder="CH mín."
        aria-label="Carga horária mínima em horas"
        onBlur={(e) => salvar({ ...t, carga_horaria_minima_horas: num(e.target.value) })} />
      <Input className="w-20" type="number" step="0.01" defaultValue={t.pontos_maximo}
        aria-label="Pontos"
        // ⚠️ Um campo só move os DOIS pontos. Nos 6 títulos reais mínimo e máximo são
        // iguais, e dois campos ofereceriam uma distinção que nenhum edital usa — mas o
        // banco a guarda, para o dia em que um deles a use.
        onBlur={(e) => {
          const p = Number(e.target.value);
          if (p > 0) salvar({ ...t, pontos_minimo: p, pontos_maximo: p });
        }} />
      <Button variant="ghost" size="icon" aria-label={`Remover título de ${t.area_exigida ?? rotuloDoNivel(t.nivel)}`}
        onClick={() => remover(t.id)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </li>
  );
}

function QuadroDeUmCargo({
  nome, editalCargoId, config, itens, rascunho, setRascunho, salvar, remover,
}: {
  nome: string;
  editalCargoId: string;
  config: ConfigTitulos | null;
  itens: TituloGravado[];
  rascunho: Rascunho;
  setRascunho: (r: Rascunho) => void;
  salvar: ReturnType<typeof useTitulos>["salvarTitulo"];
  remover: (id: string) => void;
}) {
  const avisos = conferirTitulos({ config, itens, rotuloDoCargo: nome });
  const pontos = Number(rascunho.pontos);
  const podeAcrescentar = rascunho.descricao.trim() !== "" && pontos > 0;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{nome}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {itens.length > 0 && (
          <>
            <ContadorDePontos soma={somaDosPontos(itens)} teto={config?.teto_maximo_pontos ?? null} />
            <ul className="space-y-1">
              {itens.map((t) => (
                <LinhaDeTitulo key={t.id} t={t} salvar={salvar} remover={remover} />
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Select value={rascunho.nivel} onValueChange={(v) => setRascunho({ ...rascunho, nivel: v as NivelTitulo })}>
            <SelectTrigger className="w-52" aria-label="Nível do título"><SelectValue /></SelectTrigger>
            <SelectContent>
              {NIVEIS_DE_TITULO.map((n) => (
                <SelectItem key={n.nivel} value={n.nivel}>{n.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="min-w-[14rem] flex-1" placeholder="Descrição, como sai no quadro publicado"
            aria-label="Descrição do título"
            value={rascunho.descricao} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} />
          <Input className="w-44" placeholder="Área exigida" aria-label="Área exigida do novo título"
            value={rascunho.area} onChange={(e) => setRascunho({ ...rascunho, area: e.target.value })} />
          <Input className="w-24" type="number" placeholder="CH mín." aria-label="Carga horária mínima do novo título"
            value={rascunho.ch} onChange={(e) => setRascunho({ ...rascunho, ch: e.target.value })} />
          <Input className="w-20" type="number" step="0.01" placeholder="pontos" aria-label="Pontos do novo título"
            value={rascunho.pontos} onChange={(e) => setRascunho({ ...rascunho, pontos: e.target.value })} />
          {/*
            🔴 Desabilitado até haver descrição e pontos > 0. Não há padrão inventado: o
            banco recusa zero ponto (`chk_titulo_pontos_positivos`), e mandar "1" só para
            a linha nascer criaria um título que vale 1 porque ninguém escolheu.
          */}
          <Button className="gap-2" disabled={!podeAcrescentar}
            onClick={() => {
              salvar({
                edital_cargo_id: editalCargoId,
                nivel: rascunho.nivel,
                descricao: rascunho.descricao.trim(),
                area_exigida: rascunho.area.trim() || null,
                carga_horaria_minima_horas: num(rascunho.ch),
                pontos_minimo: pontos,
                pontos_maximo: pontos,
                ordem: itens.length,
              });
              setRascunho(VAZIO);
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

export function QuadroDeTitulos({ editalId }: { editalId: string }) {
  const { cargosDoEdital } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const { etapas } = useCronograma(editalId);
  const ids = cargosDoEdital.map((c) => c.id);
  const { config, itens, isLoading, salvarConfig, salvarTitulo, removerTitulo } =
    useTitulos(editalId, ids);
  const [novos, setNovos] = useState<Record<string, Rascunho>>({});

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os títulos…</p>;
  if (cargosDoEdital.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        O quadro de títulos é por cargo. Acrescente os cargos no capítulo{" "}
        <strong>Do Quadro de Cargos</strong> primeiro.
      </p>
    );
  }

  const inscricoes = etapas.find((e) => e.chave === "inscricoes");

  return (
    <div className="space-y-4">
      <RegrasGerais
        config={config}
        fimDasInscricoes={inscricoes ? ultimaData(inscricoes) : null}
        salvar={salvarConfig}
      />
      {cargosDoEdital.map((ec) => (
        <QuadroDeUmCargo
          key={ec.id}
          nome={cargos.find((c) => c.id === ec.cargo_id)?.nome ?? "(cargo removido)"}
          editalCargoId={ec.id}
          config={config}
          itens={itens.filter((t) => t.edital_cargo_id === ec.id)}
          rascunho={novos[ec.id] ?? VAZIO}
          setRascunho={(r) => setNovos({ ...novos, [ec.id]: r })}
          salvar={salvarTitulo}
          remover={removerTitulo}
        />
      ))}
    </div>
  );
}
