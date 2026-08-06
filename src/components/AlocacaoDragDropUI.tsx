import { useCallback, useMemo, useState } from "react";
import {
  closestCenter,
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Shuffle, RotateCcw } from "lucide-react";
import { CargoCard } from "./CargoDraggableCard";
import { AlocacaoBadge } from "./AlocacaoDraggableBadge";
import { CargosPendentesDropzone } from "./CargosPendentesDropzone";
import { UnidadesDropzone } from "./UnidadesDropzone";
import {
  alocarCargoNaUnidade,
  DadosArrastaveis,
  devolverParaPendentes,
  EstadoAlocacao,
  estadoInicial,
  ID_PENDENTES,
  lerDadosArrastaveis,
  lerDadosSoltaveis,
  montarPlano,
  totalForaDoPlano,
  totalNoPlano,
  UnidadeAlocavel,
  CargoPendente,
} from "@/lib/alocacao-dnd";

/**
 * `pointerWithin` com queda para `closestCenter`.
 *
 * ⚠️ `closestCenter` sozinho NÃO serve aqui, e a razão é o aninhamento: o bloco alocado
 * mora dentro do card da unidade, então ao arrastá-lo para fora o card que o contém
 * disputa cada movimento por distância de centro. `pointerWithin` decide por onde o
 * ponteiro está — que é o que a pessoa acha que está fazendo.
 *
 * ⚠️ A saída mais citada para droppables aninhados é `collisionPriority`. Ela NÃO existe
 * no `@dnd-kit/core` 6.3.1 (é API do dnd-kit novo) — não tente.
 */
const detectarColisao: CollisionDetection = (args) => {
  const porPonteiro = pointerWithin(args);
  return porPonteiro.length > 0 ? porPonteiro : closestCenter(args);
};

interface Props {
  cargos: CargoPendente[];
  unidades: UnidadeAlocavel[];
  congelada: boolean;
  isAplicando: boolean;
  onAplicar: (plano: ReturnType<typeof montarPlano>) => void;
}

/**
 * O quadro de planejamento: arrastar cargos para unidades e aplicar de uma vez.
 *
 * 🔴 ARRASTAR NÃO GRAVA (decisão D1). O rascunho vive em memória e some no refresh
 * (decisão D4). O banco só é tocado no "Aplicar", numa transação — ou o plano todo entra,
 * ou nada muda. É o que mantém a recusa por falta de espaço (AL004) com sentido.
 */
export function AlocacaoDragDropUI({ cargos, unidades, congelada, isAplicando, onAplicar }: Props) {
  // `key` do estado: quando o banco muda (aplicar, incluir à mão), o pai remonta este
  // componente e o rascunho recomeça do zero — que é o comportamento certo, já que o
  // rascunho descreve um mundo que acabou de mudar.
  const [estado, setEstado] = useState<EstadoAlocacao>(() => estadoInicial(cargos, unidades));
  const [arrastando, setArrastando] = useState<DadosArrastaveis | null>(null);
  const [soltouComSucesso, setSoltouComSucesso] = useState(false);

  const sensors = useSensors(
    // Distância mínima: sem ela, um clique simples já dispara arrasto.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  );

  const noPlano = totalNoPlano(estado);
  const foraDoPlano = totalForaDoPlano(estado);
  const plano = useMemo(() => montarPlano(estado), [estado]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setArrastando(lerDadosArrastaveis(event.active.data.current));
    setSoltouComSucesso(false);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const origem = lerDadosArrastaveis(event.active.data.current);
      const destino = event.over ? lerDadosSoltaveis(event.over.data.current) : null;

      setArrastando(null);

      if (!origem || !destino) {
        setSoltouComSucesso(false);
        return;
      }

      // ⚠️ O cálculo é FORA de qualquer updater, sobre o `estado` desta renderização.
      // Descobrir "houve mudança?" de dentro de um `setEstado(atual => …)` não funciona:
      // o updater roda depois do handler, e a flag seria lida sempre falsa.
      let proximo = estado;
      let houveMudanca = false;

      if (origem.tipo === "cargo" && destino.tipo === "unidade") {
        const r = alocarCargoNaUnidade(estado, origem.blocoId, destino.unidadeId);
        proximo = r.estado;
        houveMudanca = r.transferidos > 0;
      } else if (origem.tipo === "alocado" && destino.tipo === ID_PENDENTES) {
        const r = devolverParaPendentes(estado, origem.blocoId, origem.unidadeId);
        proximo = r.estado;
        houveMudanca = r.devolvidos > 0;
      }
      // Os outros dois pares não têm efeito de propósito: cargo pendente solto de volta
      // nos pendentes (não saiu do lugar) e bloco alocado solto numa unidade (mover
      // bloco entre unidades não faz parte deste fluxo).

      if (houveMudanca) setEstado(proximo);
      setSoltouComSucesso(houveMudanca);
    },
    [estado],
  );

  const handleDragCancel = useCallback(() => {
    setArrastando(null);
    setSoltouComSucesso(false);
  }, []);

  const limpar = useCallback(() => setEstado(estadoInicial(cargos, unidades)), [cargos, unidades]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Planejar a distribuição</CardTitle>
            <p className="text-sm text-muted-foreground">
              Arraste cada cargo para a unidade que vai recebê-lo. Nada é gravado até você
              aplicar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={limpar}
              disabled={noPlano === 0 || isAplicando}
            >
              <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
              Limpar rascunho
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={congelada || isAplicando || noPlano === 0}>
                  {isAplicando ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  Aplicar plano
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Aplicar o plano de alocação?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isto REFAZ a distribuição desta prova: as alocações automáticas atuais são
                    apagadas e refeitas conforme o rascunho. As alocações feitas à mão são
                    preservadas. Os blocos de atendimento especial ganham sala própria — mas
                    aplicar <strong>não confere o pedido individual</strong> de cada um; isso
                    continua sendo feito na seção Atendimento especial.
                    {foraDoPlano > 0 && (
                      <>
                        {" "}
                        <strong>
                          {foraDoPlano.toLocaleString("pt-BR")} inscrito(s) não estão no rascunho e
                          ficarão sem sala.
                        </strong>
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onAplicar(plano)}>
                    Aplicar {noPlano.toLocaleString("pt-BR")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {congelada ? (
          <Alert>
            <AlertDescription>
              Prova finalizada: o planejamento está desabilitado. Reabra a prova para
              redistribuir.
            </AlertDescription>
          </Alert>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={detectarColisao}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No rascunho: <strong>{noPlano.toLocaleString("pt-BR")}</strong> · fora do
                rascunho: <strong>{foraDoPlano.toLocaleString("pt-BR")}</strong>
              </p>

              {/* Origem à esquerda, destino à direita: o gesto de arrastar passa a ter
                  uma direção só. `items-start` impede que a coluna mais curta estique. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <CargosPendentesDropzone cargos={estado.cargos} />
                <UnidadesDropzone unidades={estado.unidades} />
              </div>
            </div>

            {/* O overlay renderiza os componentes VISUAIS (sem `useDraggable`): um clone
                que registrasse o mesmo id sobrescreveria o nó de origem no Map do dnd-kit. */}
            <DragOverlay
              dropAnimation={
                soltouComSucesso
                  ? null
                  : { duration: 250, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }
              }
            >
              {arrastando?.tipo === "cargo" && (
                <CargoCard
                  nome={arrastando.nome}
                  naoAlocados={arrastando.naoAlocados}
                  total={arrastando.naoAlocados}
                  bloco={arrastando.bloco}
                  comoOverlay
                />
              )}
              {arrastando?.tipo === "alocado" && (
                <AlocacaoBadge
                  nome={arrastando.nome}
                  quantidade={arrastando.quantidade}
                  bloco={arrastando.bloco}
                  comoOverlay
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
