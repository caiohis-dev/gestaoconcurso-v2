/**
 * Ações afirmativas — capítulos [8] PCD, [9] cotas raciais e [11] condições especiais.
 *
 * 🔴 **A data de corte da lactante aparece CALCULADA, nunca editável.** É o conserto de um
 * defeito real: o item 10.10 do Edital 003/2026 chama 16/09 de "data de realização da
 * prova" enquanto o cronograma marca 20/09, e deriva dali um corte uma semana errado.
 * Ver `src/lib/edital-acoes-afirmativas.ts`.
 *
 * ⚠️ Os presets recomendados são **aviso**, nunca trava: o Edital 002 não compensa tempo
 * de amamentação e é válido. O sistema recomenda; quem redige decide.
 */
import {
  useAcoesAfirmativas,
  type RegrasPcdLinha,
  type RegrasCotasLinha,
  type RegrasLactantesLinha,
} from "@/hooks/useAcoesAfirmativas";
import { useCronograma } from "@/hooks/useCronograma";
import { primeiraData } from "@/lib/edital-cronograma";
import { dataLimiteNascimentoLactente, conferirAcoesAfirmativas } from "@/lib/edital-acoes-afirmativas";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CircleAlert, CalendarCheck } from "lucide-react";

type Gravar = ReturnType<typeof useAcoesAfirmativas>["gravar"];

const num = (v: string) => (v.trim() === "" ? null : Number(v));

function CardPcd({ pcd, gravar }: { pcd: RegrasPcdLinha | null; gravar: Gravar }) {
  const salvar = (campos: Partial<RegrasPcdLinha>) =>
    gravar({ tabela: "regras_pcd", dados: { ...pcd, ...campos } });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reserva para pessoas com deficiência</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Percentual de reserva (%)
          <Input type="number" step="0.01" defaultValue={pcd?.percentual_reserva ?? ""}
            onBlur={(e) => salvar({ percentual_reserva: num(e.target.value) })} />
        </label>
        <label className="text-sm">Validade do laudo temporário (meses)
          <Input type="number" defaultValue={pcd?.validade_meses_laudo_temporario ?? ""}
            onBlur={(e) => salvar({ validade_meses_laudo_temporario: num(e.target.value) })} />
        </label>
        <label className="col-span-full flex items-center gap-2 text-sm">
          <Switch checked={!!pcd?.aceita_laudo_indeterminado}
            onCheckedChange={(v) => salvar({ aceita_laudo_indeterminado: v })} />
          Aceita laudo com validade indeterminada (Leis RJ 9.425/2021 e 10.186/2023 — irreversível, TEA e Down)
        </label>
        <label className="col-span-full flex items-center gap-2 text-sm">
          <Switch checked={!!pcd?.obriga_rubrica_todas_folhas}
            onCheckedChange={(v) => salvar({ obriga_rubrica_todas_folhas: v })} />
          Exige rubrica em todas as folhas do envelope
        </label>
        <label className="col-span-full text-sm">Local da perícia presencial
          <Input defaultValue={pcd?.local_pericia ?? ""}
            onBlur={(e) => salvar({ local_pericia: e.target.value || null })} />
        </label>
        <p className="col-span-full text-xs text-muted-foreground">
          ⚠️ As <strong>datas</strong> de perícia não se cadastram aqui: são uma etapa do tipo
          “datas alternativas” no cronograma. Duplicá-las criaria duas fontes, e uma envelheceria.
        </p>
      </CardContent>
    </Card>
  );
}

function CardCotas({ cotas, gravar }: { cotas: RegrasCotasLinha | null; gravar: Gravar }) {
  const salvar = (campos: Partial<RegrasCotasLinha>) =>
    gravar({ tabela: "regras_cotas_raciais", dados: { ...cotas, ...campos } });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reserva para negros</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Percentual de reserva (%)
          <Input type="number" step="0.01" defaultValue={cotas?.percentual_reserva ?? ""}
            onBlur={(e) => salvar({ percentual_reserva: num(e.target.value) })} />
        </label>
        <label className="text-sm">Lei de base
          <Input defaultValue={cotas?.lei_base ?? ""} placeholder="Lei Municipal nº 5.309/2017"
            onBlur={(e) => salvar({ lei_base: e.target.value || null })} />
        </label>
        <label className="col-span-full flex items-center gap-2 text-sm">
          <Switch checked={!!cotas?.exige_autodeclaracao_datada_assinada}
            onCheckedChange={(v) => salvar({ exige_autodeclaracao_datada_assinada: v })} />
          Exige autodeclaração original, datada e assinada
        </label>
      </CardContent>
    </Card>
  );
}

function CardLactantes({
  lactantes, gravar, corte, dataDaProva,
}: {
  lactantes: RegrasLactantesLinha | null;
  gravar: Gravar;
  corte: string | null;
  dataDaProva: string | null;
}) {
  const salvar = (campos: Partial<RegrasLactantesLinha>) =>
    gravar({ tabela: "regras_lactantes", dados: { ...lactantes, ...campos } });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Candidata lactante</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Idade máxima do lactente (meses)
          <Input type="number" defaultValue={lactantes?.idade_maxima_lactente_meses ?? ""}
            onBlur={(e) => salvar({ idade_maxima_lactente_meses: num(e.target.value) })} />
        </label>

        {/* 🔴 CALCULADA, não editável — o conserto do defeito do Edital 003. */}
        <div className="text-sm">
          <span className="text-muted-foreground">Nascido a partir de</span>
          <div className="mt-1 flex h-10 items-center gap-2 rounded-md border bg-muted px-3">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <strong>{corte ?? "—"}</strong>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Calculado a partir da data da prova no cronograma{dataDaProva ? ` (${dataDaProva})` : ""}.
            Não se digita: no Edital 003/2026 essa data foi derivada à mão e ficou uma semana errada.
          </p>
        </div>

        <label className="col-span-full flex items-center gap-2 text-sm">
          <Switch checked={!!lactantes?.permite_compensacao_tempo}
            onCheckedChange={(v) =>
              // ⚠️ Desligar a compensação LIMPA o tempo: o banco recusa a combinação, e
              // deixar o número lá faria o edital dizer as duas coisas.
              salvar({
                permite_compensacao_tempo: v,
                tempo_maximo_compensacao_minutos: v ? lactantes?.tempo_maximo_compensacao_minutos ?? null : null,
              })} />
          Compensa o tempo de amamentação
        </label>
        {lactantes?.permite_compensacao_tempo && (
          <label className="text-sm">Tempo máximo (minutos)
            <Input type="number" defaultValue={lactantes?.tempo_maximo_compensacao_minutos ?? ""}
              onBlur={(e) => salvar({ tempo_maximo_compensacao_minutos: num(e.target.value) })} />
          </label>
        )}
        <label className="col-span-full flex items-center gap-2 text-sm">
          <Switch checked={!!lactantes?.exige_acompanhante_maior}
            onCheckedChange={(v) => salvar({ exige_acompanhante_maior: v })} />
          Exige acompanhante maior de idade para a guarda da criança
        </label>
      </CardContent>
    </Card>
  );
}

export function AcoesAfirmativas({ editalId, capitulo }: { editalId: string; capitulo: string }) {
  const { pcd, cotas, lactantes, isLoading, gravar } = useAcoesAfirmativas(editalId);
  const { etapas } = useCronograma(editalId);

  const etapaProva = etapas.find((e) => e.chave === "prova_objetiva");
  const dataDaProva = etapaProva ? primeiraData(etapaProva) : null;

  const avisos = conferirAcoesAfirmativas({
    dataDaProva,
    lactantes: lactantes && {
      idadeMaximaMeses: lactantes.idade_maxima_lactente_meses,
      permiteCompensacao: lactantes.permite_compensacao_tempo,
      tempoMaximoMinutos: lactantes.tempo_maximo_compensacao_minutos,
    },
    pcd: pcd && {
      percentualReserva: pcd.percentual_reserva,
      aceitaLaudoIndeterminado: pcd.aceita_laudo_indeterminado,
      validadeMesesLaudoTemporario: pcd.validade_meses_laudo_temporario,
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando as regras…</p>;

  const corte = dataLimiteNascimentoLactente(dataDaProva, lactantes?.idade_maxima_lactente_meses ?? null);

  return (
    <div className="space-y-4">
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
      {capitulo === "vagas_pcd" && <CardPcd pcd={pcd} gravar={gravar} />}
      {capitulo === "vagas_cotas_raciais" && <CardCotas cotas={cotas} gravar={gravar} />}
      {capitulo === "condicoes_especiais_prova" && (
        <CardLactantes lactantes={lactantes} gravar={gravar} corte={corte} dataDaProva={dataDaProva} />
      )}
    </div>
  );
}
