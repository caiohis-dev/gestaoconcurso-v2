import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useProvas } from "@/hooks/useProvas";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useSalasDistribuidas, SalaDistribuida } from "@/hooks/useSalasDistribuidas";
import { useCandidatos, useContagemCandidatosPorEdital } from "@/hooks/useCandidatos";
import {
  useOcupacaoPorSala,
  useOcupacaoPorUnidade,
  useCargosDaProva,
  useEspeciaisDaProva,
  useCandidatosDaSala,
  useOndeEsta,
  useAplicarPlano,
  useIncluirNaSala,
  useRetirarDaSala,
} from "@/hooks/useAlocacaoCandidatos";
import { useUnidadeCapacidade } from "@/hooks/useUnidadeCapacidade";
import { AlocacaoDragDropUI } from "@/components/AlocacaoDragDropUI";
import { ListaDeCandidatosDaProva } from "@/components/ListaDeCandidatosDaProva";
import { idDoBloco, type CargoPendente, type UnidadeAlocavel } from "@/lib/alocacao-dnd";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, DoorOpen, Search, UserMinus, UserPlus, Lock } from "lucide-react";

/**
 * O quadro da alocação de UMA prova: distribuir, ver cada sala, incluir e retirar.
 *
 * As barreiras moram no banco (triggers e constraints da migration 20260804225156); o
 * que esta tela faz é evitar que a pessoa chegue nelas sem saber — o banner de prova
 * finalizada, a confirmação do distribuir dizendo o que será refeito, e os vazios
 * distintos (sem salas ≠ sem inscritos ≠ ninguém distribuído).
 */
export default function AlocacaoCandidatosProva() {
  const { provaId } = useParams<{ provaId: string }>();
  const idDaProva = provaId ?? "";
  const { provas, isLoading: provasLoading } = useProvas();
  const prova = provas.find((p) => p.id === idDaProva);

  const { provaUnidades } = useProvaUnidades(idDaProva);
  const { salas, isLoading: salasLoading } = useSalasDistribuidas(idDaProva);
  const { contagem } = useContagemCandidatosPorEdital();
  const { ocupacao, manuaisPorSala, error: ocupacaoError } = useOcupacaoPorSala(idDaProva);
  const { porUnidade } = useOcupacaoPorUnidade(idDaProva);
  const { cargos: cargosDaProva } = useCargosDaProva(idDaProva);
  const { especiais } = useEspeciaisDaProva(idDaProva);
  const { aplicar, isAplicando } = useAplicarPlano();

  const unidadeIds = useMemo(() => provaUnidades.map((pu) => pu.unidade_id), [provaUnidades]);
  const { data: capacidade, error: capacidadeError } = useUnidadeCapacidade(idDaProva, unidadeIds);

  const [busca, setBusca] = useState("");
  const { resultados } = useOndeEsta(idDaProva, busca);
  const [salaAberta, setSalaAberta] = useState<SalaDistribuida | null>(null);

  // Prova finalizada OU unidade finalizada congelam no banco (PF001); aqui é o aviso.
  const algumaUnidadeFinalizada = provaUnidades.some((pu) => pu.unidade_finalizada);
  const congelada = !!prova?.prova_finalizada;

  const siglaPorUnidade = useMemo(() => {
    const m: Record<string, string> = {};
    for (const pu of provaUnidades) m[pu.unidade_id] = pu.unidades_prova.unid_sigla;
    return m;
  }, [provaUnidades]);

  const salasPorUnidade = useMemo(() => {
    const grupos: Record<string, SalaDistribuida[]> = {};
    for (const sala of salas) {
      (grupos[sala.sala_fk_unidade] ??= []).push(sala);
    }
    return grupos;
  }, [salas]);

  const salaDoResultado = (salaId: string) => {
    const sala = salas.find((s) => s.id === salaId);
    if (!sala) return "sala não carregada";
    return `sala ${sala.sala_numero} (${siglaPorUnidade[sala.sala_fk_unidade] ?? "?"})`;
  };

  // 🔴 O aviso da decisão D1: entre marcar alguém e aplicar o plano, essa pessoa está EM
  // SALA e marcada para sair. O total de alocados a inclui, e sem dizer isso o número
  // mente por omissão.
  const foraComSala = cargosDaProva.reduce((s, c) => s + c.foraComSala, 0);

  const inscritos = prova?.edital_id ? contagem[prova.edital_id] : undefined;
  const alocados = Object.values(ocupacao).reduce((s, n) => s + n, 0);
  const pendentes = especiais.filter((e) => e.salaId === null);

  // O rascunho parte das alocações MANUAIS: aplicar o plano apaga as automáticas, então
  // contá-las como ocupação faria a tela dizer "sem vaga" onde o plano vai esvaziar.
  // 🔴 TRÊS blocos por cargo: comuns, PCD e sala especial. São estoques DISJUNTOS no
  // banco (`bloco_do_candidato` devolve um valor só, e a RPC valida cada um por si com
  // AL010), e o card de cada um tem cor própria — fundi-los mandaria gente do estoque
  // errado para a sala errada.
  const cargosParaArrastar: CargoPendente[] = useMemo(
    () =>
      cargosDaProva.flatMap((c) =>
        ([
          { bloco: "comum", quantos: c.aDistribuir },
          { bloco: "pcd", quantos: c.pcdADistribuir },
          { bloco: "sala_especial", quantos: c.salaEspecialADistribuir },
        ] as const)
          // ⚠️ Sem filtro de zero: bloco vazio vira card "sem inscritos" no container do
          // cargo. Escondê-lo fez o card de sala especial sumir da tela — ele tem 0 no
          // dado real, e a pessoa precisava justamente ver esse 0.
          .map((b) => ({
            id: idDoBloco(c.cargoId, b.bloco),
            cargoId: c.cargoId,
            nome: c.nome,
            bloco: b.bloco,
            naoAlocados: b.quantos,
            // O total nasce igual ao disponível: o rascunho começa vazio, e é o arrasto
            // que faz `naoAlocados` descer enquanto `total` fica parado.
            total: b.quantos,
          })),
      ),
    [cargosDaProva],
  );

  // 🔴 As salas UMA A UMA, em ordem física — não a capacidade somada. O quadro simula o
  // empacotamento do banco ("cada bloco abre sala nova"), e com um total só ele oferecia
  // vagas que a ociosidade das salas de fronteira já tinha gasto.
  const unidadesParaArrastar: UnidadeAlocavel[] = useMemo(
    () =>
      provaUnidades.map((pu) => ({
        id: pu.unidade_id,
        nome: `${pu.unidades_prova.unid_sigla} — ${pu.unidades_prova.unid_nome}`,
        salas: salas
          .filter((s) => s.sala_fk_unidade === pu.unidade_id)
          .sort(
            (a, b) =>
              (a.sala_andar ?? Number.MAX_SAFE_INTEGER) -
                (b.sala_andar ?? Number.MAX_SAFE_INTEGER) || a.sala_numero - b.sala_numero,
          )
          .map((s) => ({
            id: s.id,
            capacidade: s.sala_capacidade,
            // Só as MANUAIS: aplicar o plano apaga as automáticas.
            ocupadasManuais: manuaisPorSala[s.id] ?? 0,
          })),
        alocacoesPorCargo: [],
      })),
    [provaUnidades, salas, manuaisPorSala],
  );

  // A chave remonta o quadro quando o banco muda: um rascunho montado sobre números
  // antigos descreveria um mundo que já mudou.
  const chaveDoQuadro = useMemo(
    () =>
      [
        cargosParaArrastar.map((c) => `${c.id}:${c.naoAlocados}`).join("|"),
        unidadesParaArrastar
          .map((u) => `${u.id}:${u.salas.map((s) => `${s.id}/${s.capacidade}/${s.ocupadasManuais}`).join(",")}`)
          .join("|"),
      ].join("#"),
    [cargosParaArrastar, unidadesParaArrastar],
  );

  if (provasLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando prova…
        </div>
      </Layout>
    );
  }

  if (!prova) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <Alert>
            <AlertDescription>Prova não encontrada.</AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <CabecalhoAlocacao
          titulo={prova.editais?.nome ?? prova.prova_edital}
          resumo={
            inscritos !== undefined
              ? `${inscritos.toLocaleString("pt-BR")} inscrito(s) no edital · ${alocados.toLocaleString("pt-BR")} alocado(s) · ${pendentes.length} pedido(s) de atendimento especial pendente(s)`
              : "Este edital ainda não tem lista de inscritos importada."
          }
        />

        <AvisosAlocacao
          congelada={congelada}
          algumaUnidadeFinalizada={algumaUnidadeFinalizada}
          ocupacaoFalhou={ocupacaoError != null}
          capacidadeFalhou={capacidadeError != null}
          foraComSala={foraComSala}
        />

        <AlocacaoDragDropUI
          key={chaveDoQuadro}
          cargos={cargosParaArrastar}
          unidades={unidadesParaArrastar}
          congelada={congelada}
          isAplicando={isAplicando}
          onAplicar={(plano) => aplicar({ provaId: idDaProva, plano })}
        />

        <SecaoOndeEsta
          busca={busca}
          onBusca={setBusca}
          resultados={resultados}
          salaDoResultado={salaDoResultado}
        />

        <ListaDeCandidatosDaProva
          provaId={idDaProva}
          cargos={cargosDaProva}
          congelada={congelada}
        />

        <SecaoSalas
          isLoading={salasLoading}
          salas={salas}
          provaUnidades={provaUnidades}
          salasPorUnidade={salasPorUnidade}
          ocupacao={ocupacao}
          onVerSala={setSalaAberta}
        />
      </div>

      {salaAberta && (
        <SalaDialog
          sala={salaAberta}
          sigla={siglaPorUnidade[salaAberta.sala_fk_unidade] ?? "?"}
          provaId={idDaProva}
          editalId={prova.edital_id}
          ocupadas={ocupacao[salaAberta.id] ?? 0}
          congelada={congelada}
          onClose={() => setSalaAberta(null)}
        />
      )}

    </Layout>
  );
}

/** Título + resumo. O que era o botão "Distribuir" virou o quadro de arrasto. */
function CabecalhoAlocacao({ titulo, resumo }: { titulo: string; resumo: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <DoorOpen className="h-6 w-6" />
        Alocação — {titulo}
      </h1>
      <p className="text-muted-foreground">{resumo}</p>
    </div>
  );
}

/** Os avisos da tela. Consulta que FALHA não pode virar zeros com cara de verdade. */
function AvisosAlocacao({
  congelada,
  algumaUnidadeFinalizada,
  ocupacaoFalhou,
  capacidadeFalhou,
  foraComSala,
}: {
  congelada: boolean;
  algumaUnidadeFinalizada: boolean;
  ocupacaoFalhou: boolean;
  capacidadeFalhou: boolean;
  foraComSala: number;
}) {
  return (
    <>
      {congelada && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Esta prova está finalizada: a alocação é somente leitura. Reabra a prova para
            editar.
          </AlertDescription>
        </Alert>
      )}
      {!congelada && algumaUnidadeFinalizada && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Há unidade(s) finalizada(s) nesta prova: a alocação das salas delas é somente
            leitura até serem reabertas.
          </AlertDescription>
        </Alert>
      )}
      {ocupacaoFalhou && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar a ocupação das salas — os números abaixo podem estar
            zerados sem ser verdade. Recarregue a página.
          </AlertDescription>
        </Alert>
      )}
      {foraComSala > 0 && (
        <Alert>
          <AlertDescription>
            <strong>{foraComSala.toLocaleString("pt-BR")} inscrito(s)</strong> foram
            retirados da alocação automática mas <strong>ainda estão em sala</strong> — o
            total de alocados acima os inclui. Eles saem no próximo “Aplicar plano”.
          </AlertDescription>
        </Alert>
      )}
      {capacidadeFalhou && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar a capacidade das unidades — o quadro de planejamento
            mostraria zero vaga onde há salas. Recarregue a página antes de montar o plano.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** A busca "onde está fulano" entre os alocados da prova. */
function SecaoOndeEsta({
  busca,
  onBusca,
  resultados,
  salaDoResultado,
}: {
  busca: string;
  onBusca: (v: string) => void;
  resultados: { alocacaoId: string; salaId: string; nome: string; nInscricao: string }[];
  salaDoResultado: (salaId: string) => string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          Onde está?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          placeholder="Nome ou nº de inscrição do candidato alocado"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          aria-label="Buscar candidato alocado"
        />
        {busca.trim().length >= 2 && (
          <ul className="text-sm space-y-1">
            {resultados.length === 0 ? (
              <li className="text-muted-foreground">
                Ninguém alocado com esse nome ou inscrição nesta prova.
              </li>
            ) : (
              resultados.map((r) => (
                <li key={r.alocacaoId}>
                  <span className="font-medium">{r.nome}</span> (inscrição {r.nInscricao}) —{" "}
                  {salaDoResultado(r.salaId)}
                </li>
              ))
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}


/** As salas por unidade, com ocupação/capacidade. Os vazios são mensagens diferentes. */
function SecaoSalas({
  isLoading,
  salas,
  provaUnidades,
  salasPorUnidade,
  ocupacao,
  onVerSala,
}: {
  isLoading: boolean;
  salas: SalaDistribuida[];
  provaUnidades: ReturnType<typeof useProvaUnidades>["provaUnidades"];
  salasPorUnidade: Record<string, SalaDistribuida[]>;
  ocupacao: Record<string, number>;
  onVerSala: (sala: SalaDistribuida) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando salas…
      </div>
    );
  }
  if (salas.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Esta prova não tem salas: vincule unidades com salas cadastradas em Gerenciar Prova
          antes de distribuir.
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      {provaUnidades.map((pu) => {
        const salasDaUnidade = salasPorUnidade[pu.unidade_id] ?? [];
        if (salasDaUnidade.length === 0) return null;
        return (
          <Card key={pu.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {pu.unidades_prova.unid_sigla} — {pu.unidades_prova.unid_nome}
                {pu.unidade_finalizada && <Badge variant="secondary">finalizada</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sala</TableHead>
                    <TableHead>Andar</TableHead>
                    <TableHead>Ocupação</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salasDaUnidade.map((sala) => (
                    <TableRow key={sala.id}>
                      <TableCell>{sala.sala_numero}</TableCell>
                      <TableCell>{sala.sala_andar ?? "—"}</TableCell>
                      <TableCell>
                        {(ocupacao[sala.id] ?? 0)} / {sala.sala_capacidade}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onVerSala(sala)}
                          aria-label={`Ver sala ${sala.sala_numero}`}
                        >
                          Ver sala
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

/**
 * Uma sala aberta: quem está nela (retirar) e a inclusão manual por busca.
 *
 * ⚠️ Sem pré-check de vaga/duplicata ao incluir: as barreiras são do banco (AL006,
 * 23505, PF001) e chegam traduzidas pelo hook. Pré-check aqui seria corrida.
 */
function SalaDialog({
  sala,
  sigla,
  provaId,
  editalId,
  ocupadas,
  congelada,
  onClose,
}: {
  sala: SalaDistribuida;
  sigla: string;
  provaId: string;
  editalId: string | null;
  ocupadas: number;
  congelada: boolean;
  onClose: () => void;
}) {
  const { candidatos, isLoading } = useCandidatosDaSala(sala.id);
  const { retirar, isRetirando } = useRetirarDaSala();
  const { incluir, isIncluindo } = useIncluirNaSala();
  const [buscaIncluir, setBuscaIncluir] = useState("");

  // A busca de inscritos do edital reusa o hook do módulo Candidatos (mesma RLS admin).
  const { candidatos: doEdital, isLoading: buscando } = useCandidatos({
    editalId: buscaIncluir.trim().length >= 2 ? editalId : null,
    busca: buscaIncluir,
    porPagina: 8,
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Sala {sala.sala_numero} ({sigla}) — {ocupadas} / {sala.sala_capacidade}
          </DialogTitle>
          <DialogDescription>
            A lista desta sala nesta prova, em ordem alfabética. Retirar e incluir valem só
            para esta prova; a distribuição automática preserva o que for feito aqui.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a sala…
          </div>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém alocado nesta sala.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inscrição</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidatos.map((c) => (
                  <TableRow key={c.alocacaoId}>
                    <TableCell>{c.nInscricao}</TableCell>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>{c.cargo ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.origem === "manual" ? "default" : "outline"}>
                        {c.origem === "manual" ? "manual" : "automática"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={congelada || isRetirando}
                        onClick={() => retirar(c.alocacaoId)}
                        aria-label={`Retirar ${c.nome} da sala`}
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!congelada && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-sm font-medium">Incluir candidato nesta sala</p>
            <Input
              placeholder="Buscar por nome, inscrição ou CPF no edital"
              value={buscaIncluir}
              onChange={(e) => setBuscaIncluir(e.target.value)}
              aria-label="Buscar candidato para incluir"
            />
            {buscaIncluir.trim().length >= 2 &&
              (buscando ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </div>
              ) : doEdital.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém encontrado no edital.</p>
              ) : (
                <ul className="space-y-1">
                  {doEdital.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span>
                        {c.nome} (inscrição {c.n_inscricao})
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isIncluindo}
                        onClick={() =>
                          incluir({ candidatoId: c.id, salaId: sala.id, provaId })
                        }
                        aria-label={`Incluir ${c.nome} nesta sala`}
                      >
                        <UserPlus className="h-4 w-4 mr-1" aria-hidden="true" />
                        Incluir
                      </Button>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

