/**
 * Inscrição, taxas, isenção e canais — capítulos [6] e [7].
 *
 * 🔴 **A taxa é por CARGO, e o sistema SUGERE pelo nível.** Medido nos três editais: 100
 * para superior, 80 para médio/técnico. Mas são 6 pontos com 2 valores — correlação, não
 * regra do documento. Por isso o botão "sugerir" propõe e o usuário decide, no mesmo
 * desenho do Quadro I.
 *
 * ⚠️ **Nada aqui defere isenção.** O capítulo DESCREVE a regra que sai no edital; quem
 * analisa o pedido do candidato é a banca. Isenção é a porta de fraude mais visada de um
 * concurso, e não há validação automática nenhuma neste módulo.
 */
import { useState } from "react";
import { useEditalCargos } from "@/hooks/useEditalCargos";
import { useCargos } from "@/hooks/useCargos";
import { useInscricao, type CanalGravado, type CriterioGravado } from "@/hooks/useInscricao";
import {
  conferirInscricao, taxaSugerida, CRITERIOS_DE_ISENCAO, TIPOS_DE_CANAL,
  type CargoComTaxa, type TipoCriterioIsencao,
} from "@/lib/edital-inscricao";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle, CircleAlert, Banknote, Ticket, Contact } from "lucide-react";

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Taxas({
  cargos, salvarCargo,
}: {
  cargos: CargoComTaxa[];
  salvarCargo: (p: { id: string; taxa_inscricao: number | null }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="h-4 w-4" />
          Valor do boleto, por cargo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {cargos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            A taxa é por cargo. Acrescente os cargos no capítulo{" "}
            <strong>Do Quadro de Cargos</strong> primeiro.
          </p>
        )}
        {cargos.map((c) => {
          const sugerida = taxaSugerida(c.escolaridade_minima);
          return (
            <div key={c.edital_cargo_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[14rem] flex-1 font-medium">{c.nome}</span>
              <span className="w-28 text-xs text-muted-foreground">
                {c.escolaridade_minima ?? "nível não declarado"}
              </span>
              <span className="text-xs text-muted-foreground">R$</span>
              <Input className="w-28" type="number" step="0.01"
                defaultValue={c.taxa_inscricao ?? ""}
                aria-label={`Taxa de inscrição de ${c.nome}`}
                onBlur={(e) =>
                  salvarCargo({ id: c.edital_cargo_id, taxa_inscricao: num(e.target.value) })
                } />
              {/* 🔴 Só existe quando há nível declarado. Para nível não medido a sugestão
                  é `null`, e um botão que propusesse um chute seria aceito sem conferência
                  — e o boleto sairia errado. */}
              {sugerida !== null && c.taxa_inscricao !== sugerida && (
                <Button variant="ghost" size="sm" className="text-xs"
                  aria-label={`Sugerir a taxa de ${c.nome}`}
                  onClick={() => salvarCargo({ id: c.edital_cargo_id, taxa_inscricao: sugerida })}>
                  sugerir R$ {sugerida}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Isencao({
  criterios, config, salvarCriterio, removerCriterio, salvarConfig,
}: {
  criterios: CriterioGravado[];
  config: ReturnType<typeof useInscricao>["config"];
  salvarCriterio: ReturnType<typeof useInscricao>["salvarCriterio"];
  removerCriterio: (id: string) => void;
  salvarConfig: ReturnType<typeof useInscricao>["salvarConfig"];
}) {
  const ligado = (tipo: TipoCriterioIsencao) => criterios.find((c) => c.tipo_criterio === tipo);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4" />
          Critérios de isenção da taxa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ⚠️ TRÊS critérios, e são os que os três editais publicam — palavra por palavra.
            O esboço do roadmap propunha quatro, separando doador de sangue de REDOME; o
            documento os junta numa alínea só, sob a mesma lei municipal. */}
        {CRITERIOS_DE_ISENCAO.map((def) => {
          const c = ligado(def.tipo);
          return (
            <div key={def.tipo} className="space-y-2 border-b pb-3 last:border-0">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!c}
                  aria-label={def.rotulo}
                  onCheckedChange={(v) => {
                    if (v) {
                      salvarCriterio({
                        tipo_criterio: def.tipo,
                        lei_referencia: def.leiPadrao,
                        minimo_doacoes_sangue_12m: def.tipo === "DOADOR_SANGUE_OU_MEDULA" ? 3 : null,
                        redome_exige_ano_vigente: def.tipo === "DOADOR_SANGUE_OU_MEDULA" ? true : null,
                        ordem: criterios.length,
                      });
                    } else if (c) {
                      removerCriterio(c.id);
                    }
                  }}
                />
                {def.rotulo}
              </label>

              {c && (
                <div className="ml-10 space-y-2">
                  <Input defaultValue={c.lei_referencia ?? ""}
                    placeholder="Lei que fundamenta o critério"
                    aria-label={`Lei do critério ${def.rotulo}`}
                    onBlur={(e) => salvarCriterio({ ...c, lei_referencia: e.target.value.trim() || null })} />

                  {def.tipo === "DOADOR_SANGUE_OU_MEDULA" && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        Mínimo de doações em 12 meses
                        <Input className="w-20" type="number" defaultValue={c.minimo_doacoes_sangue_12m ?? ""}
                          aria-label="Mínimo de doações em 12 meses"
                          onBlur={(e) => salvarCriterio({ ...c, minimo_doacoes_sangue_12m: num(e.target.value) })} />
                      </label>
                      {/* ⚠️ É o parâmetro que de fato VARIA: o 003 e o 004 exigem carteira
                          emitida no ano vigente; o 002 não. */}
                      <label className="flex items-center gap-2 text-xs">
                        <Switch checked={!!c.redome_exige_ano_vigente}
                          aria-label="REDOME exige carteira do ano vigente"
                          onCheckedChange={(v) => salvarCriterio({ ...c, redome_exige_ano_vigente: v })} />
                        carteira do REDOME emitida no ano vigente
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-4 pt-1">
          {/* 🔴 O parâmetro que DIVERGE entre os três: o 003 e o 004 exigem procedimentos
              independentes por cargo; o 002 não tem a cláusula. */}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!config?.documentacao_isencao_vale_para_um_cargo}
              aria-label="A documentação vale para um cargo apenas"
              onCheckedChange={(v) => salvarConfig({ ...config, documentacao_isencao_vale_para_um_cargo: v })} />
            A documentação vale para um cargo apenas
          </label>
          <label className="flex items-center gap-2 text-sm">
            Limite de envelopes por candidato
            <Input className="w-20" type="number" defaultValue={config?.limite_envelopes_por_candidato ?? ""}
              aria-label="Limite de envelopes por candidato"
              onBlur={(e) => salvarConfig({ ...config, limite_envelopes_por_candidato: num(e.target.value) })} />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

function Canais({
  canais, salvarCanal, removerCanal,
}: {
  canais: CanalGravado[];
  salvarCanal: ReturnType<typeof useInscricao>["salvarCanal"];
  removerCanal: (id: string) => void;
}) {
  const [novo, setNovo] = useState({ tipo: "POSTO_PRESENCIAL", rotulo: "" });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Contact className="h-4 w-4" />
          Canais de atendimento — {canais.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 🔵 O canal é cadastrado UMA vez e citado por vários capítulos. No Edital 002 a
            mesma sede da FEVRE aparece em quatro finalidades — isenção, laudo PCD,
            autodeclaração e títulos —, e cada repetição digitada à mão é uma chance de
            divergir. O tipo é o MEIO; a finalidade vai no rótulo. */}
        {canais.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <Select value={c.tipo_canal} onValueChange={(v) => salvarCanal({ ...c, tipo_canal: v })}>
              <SelectTrigger className="w-40" aria-label={`Tipo do canal ${c.rotulo}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DE_CANAL.map((t) => (
                  <SelectItem key={t.tipo} value={t.tipo}>{t.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="w-48" defaultValue={c.rotulo} placeholder="Para que serve"
              aria-label={`Rótulo do canal ${c.rotulo}`}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.rotulo) salvarCanal({ ...c, rotulo: v });
              }} />
            <Input className="min-w-[14rem] flex-1" defaultValue={c.endereco ?? ""}
              placeholder="Endereço, e-mail ou telefone"
              aria-label={`Endereço do canal ${c.rotulo}`}
              onBlur={(e) => salvarCanal({ ...c, endereco: e.target.value.trim() || null })} />
            <Input className="w-40" defaultValue={c.horario_funcionamento ?? ""}
              placeholder="Horário"
              aria-label={`Horário do canal ${c.rotulo}`}
              onBlur={(e) => salvarCanal({ ...c, horario_funcionamento: e.target.value.trim() || null })} />
            <Button variant="ghost" size="icon" aria-label={`Remover o canal ${c.rotulo}`}
              onClick={() => removerCanal(c.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2 border-t pt-3">
          <Select value={novo.tipo} onValueChange={(v) => setNovo({ ...novo, tipo: v })}>
            <SelectTrigger className="w-40" aria-label="Tipo do novo canal"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_DE_CANAL.map((t) => (
                <SelectItem key={t.tipo} value={t.tipo}>{t.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="flex-1" value={novo.rotulo}
            onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })}
            placeholder="Para que serve (ex.: Entrega de envelopes)"
            aria-label="Rótulo do novo canal" />
          <Button className="gap-2" disabled={!novo.rotulo.trim()}
            onClick={() => {
              salvarCanal({ tipo_canal: novo.tipo, rotulo: novo.rotulo.trim(), ordem: canais.length });
              setNovo({ tipo: "POSTO_PRESENCIAL", rotulo: "" });
            }}>
            <Plus className="h-4 w-4" />
            Acrescentar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InscricaoTaxasEIsencao({ editalId }: { editalId: string }) {
  const { cargosDoEdital, salvar: salvarCargo } = useEditalCargos(editalId);
  const { cargos } = useCargos();
  const {
    criterios, canais, config, emailDaVistaDeProva, isLoading,
    salvarCriterio, removerCriterio, salvarCanal, removerCanal, salvarConfig,
  } = useInscricao(editalId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando o capítulo…</p>;

  const comTaxa: CargoComTaxa[] = cargosDoEdital.map((ec) => {
    const c = cargos.find((x) => x.id === ec.cargo_id);
    return {
      edital_cargo_id: ec.id,
      nome: c?.nome ?? "(cargo removido)",
      escolaridade_minima: c?.escolaridade_minima ?? null,
      taxa_inscricao: ec.taxa_inscricao ?? null,
    };
  });
  const avisos = conferirInscricao({ cargos: comTaxa, criterios, canais, emailDaVistaDeProva });

  return (
    <div className="space-y-4">
      <Taxas
        cargos={comTaxa}
        salvarCargo={(p) => {
          const ec = cargosDoEdital.find((x) => x.id === p.id);
          if (ec) salvarCargo({ ...ec, taxa_inscricao: p.taxa_inscricao });
        }}
      />
      <Isencao criterios={criterios} config={config} salvarCriterio={salvarCriterio}
        removerCriterio={removerCriterio} salvarConfig={salvarConfig} />
      <Canais canais={canais} salvarCanal={salvarCanal} removerCanal={removerCanal} />

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
    </div>
  );
}
