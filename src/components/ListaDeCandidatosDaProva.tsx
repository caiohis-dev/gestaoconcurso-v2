import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  Accessibility,
  FileText,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  UserMinus,
} from "lucide-react";
import { IncluirEmSalaDialog } from "./IncluirEmSalaDialog";
import type { CandidatoDaProva } from "@/hooks/useAlocacaoCandidatos";
import {
  useCandidatosDaProva,
  useForaDoAutomatico,
  useRetirarDaSala,
  type CargoDaProva,
} from "@/hooks/useAlocacaoCandidatos";

const POR_PAGINA = 25;
const TODOS_OS_CARGOS = "__todos__";
const TODOS = "todos";
const SEM_SALA = "sem-sala";

/**
 * A lista de TODOS os inscritos do edital da prova, com o marcador "retirar da alocação
 * automática" por linha.
 *
 * 🔴 MARCAR NÃO MEXE EM SALA (decisão D1 de 2026-08-05). O inscrito sai dos contadores dos
 * blocos na hora, mas a alocação que ele já tenha só é desfeita no próximo "Aplicar" —
 * quem escreve em sala continua sendo só o Aplicar. O aviso de `foraComSala` no quadro
 * de cima é o que impede esse intervalo de virar mentira.
 *
 * ⚠️ Esta seção substituiu a antiga "Atendimento especial". Sair daqui o botão "Incluir em
 * sala" NÃO quer dizer que a inclusão manual acabou: ela vive no diálogo "Ver sala", que é
 * onde ela sempre esteve de fato.
 *
 * ⚠️ Paginação não é enfeite: são 7.231 inscritos. O total vem da RPC e fala do conjunto
 * INTEIRO — sem ele a tela mostraria uma página e ninguém saberia que os outros existem.
 */
export function ListaDeCandidatosDaProva({
  provaId,
  cargos,
  congelada,
}: {
  provaId: string;
  cargos: CargoDaProva[];
  congelada: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [cargoId, setCargoId] = useState<string>(TODOS_OS_CARGOS);
  const [situacao, setSituacao] = useState<string>(TODOS);
  const [pagina, setPagina] = useState(0);
  const [paraIncluir, setParaIncluir] = useState<CandidatoDaProva | null>(null);

  const filtroCargo = cargoId === TODOS_OS_CARGOS ? null : cargoId;
  const somenteSemSala = situacao === SEM_SALA;
  const { candidatos, total, isLoading, isFetching, error } = useCandidatosDaProva({
    provaId,
    busca,
    cargoId: filtroCargo,
    pagina,
    porPagina: POR_PAGINA,
    semSala: somenteSemSala,
  });
  const { alternar, isAlternando } = useForaDoAutomatico();
  const { retirar, isRetirando } = useRetirarDaSala();

  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);

  // Mexer no filtro tem de voltar para a primeira página: manter a página 7 depois de
  // buscar mostraria "nenhum resultado" sobre uma busca que tem resultados.
  const mudarBusca = (v: string) => {
    setBusca(v);
    setPagina(0);
  };
  const mudarCargo = (v: string) => {
    setCargoId(v);
    setPagina(0);
  };
  const mudarSituacao = (v: string) => {
    setSituacao(v);
    setPagina(0);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Lista de todos os candidatos
          {total > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({total.toLocaleString("pt-BR")})
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Marque quem não deve entrar na distribuição automática. A marcação vale já para os
          números do quadro acima; a sala de quem já tem uma só muda no próximo “Aplicar”.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[14rem]">
            <Search
              className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-8"
              placeholder="Buscar por nome, inscrição ou CPF"
              value={busca}
              onChange={(e) => mudarBusca(e.target.value)}
              aria-label="Buscar candidato na lista"
            />
          </div>
          <Select value={cargoId} onValueChange={mudarCargo}>
            <SelectTrigger className="w-[16rem]" aria-label="Filtrar por cargo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_OS_CARGOS}>Todos os cargos</SelectItem>
              {cargos
                .filter((c) => c.cargoId !== null)
                .map((c) => (
                  <SelectItem key={c.cargoId} value={c.cargoId as string}>
                    {c.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={situacao} onValueChange={mudarSituacao}>
            <SelectTrigger className="w-[14rem]" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os inscritos</SelectItem>
              <SelectItem value={SEM_SALA}>Somente sem sala</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error != null && (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar a lista de inscritos. Recarregue a página — uma lista
              vazia aqui não quer dizer que o edital não tem candidatos.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando inscritos…
          </div>
        ) : candidatos.length === 0 ? (
          // Os dois vazios são MENSAGENS DIFERENTES: filtro sem resultado não é edital sem
          // lista, e confundi-los manda a pessoa reimportar uma planilha que está lá.
          <p className="text-sm text-muted-foreground py-6">
            {busca.trim() || filtroCargo || somenteSemSala
              ? "Nenhum inscrito encontrado com esse filtro."
              : "Este edital ainda não tem lista de inscritos importada."}
          </p>
        ) : (
          <>
            <div className={isFetching ? "opacity-60 transition-opacity" : undefined}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[7rem]">Inscrição</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="w-[3rem]" />
                    <TableHead className="text-right w-[16rem]">
                      Retirar da alocação automática
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidatos.map((c) => (
                    <TableRow key={c.candidatoId}>
                      <TableCell className="tabular-nums">{c.nInscricao}</TableCell>
                      <TableCell>
                        {/* O nome fica em elemento PRÓPRIO: o `sr-only` do marcador ao
                            lado entraria no mesmo `textContent` e o nome deixaria de ser
                            localizável — por leitor de tela e por teste. */}
                        <span className="flex items-center gap-1.5">
                          <span>{c.nome}</span>
                          <MarcadorDeAtendimento bloco={c.bloco} salaEspecial={c.salaEspecial} />
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.cargoNome}</TableCell>
                      <TableCell>
                        {/* Só quem NÃO tem sala: incluir alguém já alocado é recusado pelo
                            banco (23505 — um candidato, uma sala por prova), então o botão
                            ali seria uma promessa que morre no clique. */}
                        {c.salaId === null ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={congelada}
                            onClick={() => setParaIncluir(c)}
                            aria-label={`Incluir ${c.nome} em uma sala`}
                          >
                            <UserPlus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : (
                          <BotaoRetirar
                            nome={c.nome}
                            origem={c.origem}
                            disabled={congelada || isRetirando || c.alocacaoId === null}
                            onRetirar={() => c.alocacaoId && retirar(c.alocacaoId)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <SwitchForaDoAutomatico
                          nome={c.nome}
                          marcado={c.foraDoAutomatico}
                          emSalaManual={c.origem === "manual"}
                          disabled={congelada || isAlternando}
                          onAlternar={(marcado) =>
                            alternar({
                              provaId,
                              candidatoId: c.candidatoId,
                              retirar: marcado,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-muted-foreground">
                Página {pagina + 1} de {ultimaPagina + 1}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina >= ultimaPagina}
                  onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {paraIncluir && (
        <IncluirEmSalaDialog
          provaId={provaId}
          candidatoId={paraIncluir.candidatoId}
          nome={paraIncluir.nome}
          salaEspecial={paraIncluir.salaEspecial}
          portadorDeficiencia={paraIncluir.portadorDeficiencia}
          onClose={() => setParaIncluir(null)}
        />
      )}
    </Card>
  );
}

/**
 * O marcador "retirar da alocação automática".
 *
 * 🔴 DESABILITADO para quem está numa sala escolhida À MÃO, e o valor dele é FALSO nesse
 * caso — porque as duas coisas dizem o mesmo: "o plano não mexe nesta pessoa". Aplicar um
 * plano só apaga `origem='automatica'`, então quem tem alocação manual já está fora por
 * construção. Deixar o switch ligado em cima disso seria estado redundante, e redundância
 * diverge: bastaria a pessoa sair da sala para sobrar uma marcação que ninguém pôs.
 *
 * ⚠️ Quem GARANTE isso é o banco, não este componente: um trigger apaga a marcação quando
 * a alocação manual entra (`alocacao_manual_limpa_marcacao`) e outro recusa marcar quem
 * já está em sala à mão (`AL011`). O switch desabilitado é conveniência — evita que a
 * pessoa chegue na recusa sem entender por quê.
 */
function SwitchForaDoAutomatico({
  nome,
  marcado,
  emSalaManual,
  disabled,
  onAlternar,
}: {
  nome: string;
  marcado: boolean;
  emSalaManual: boolean;
  disabled: boolean;
  onAlternar: (marcado: boolean) => void;
}) {
  const rotulo = emSalaManual
    ? `${nome} está numa sala escolhida à mão, então a distribuição automática já não o inclui. Retire-o da sala para poder marcá-lo.`
    : `Retirar ${nome} da alocação automática`;

  const controle = (
    <Switch
      // `false` explícito, não `marcado`: o banco garante que não há marcação enquanto
      // houver alocação manual, e a tela não pode mostrar um estado que o banco proíbe.
      checked={emSalaManual ? false : marcado}
      disabled={disabled || emSalaManual}
      onCheckedChange={onAlternar}
      aria-label={rotulo}
    />
  );

  if (!emSalaManual) return controle;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        {/* `span` no trigger: controle desabilitado não emite eventos de ponteiro, e sem
            o invólucro o tooltip nunca abriria — justamente no caso em que ele é a única
            explicação de por que o switch não responde. */}
        <TooltipTrigger asChild>
          <span className="inline-block">{controle}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[22rem]">{rotulo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Retirar da sala. O par do botão de incluir — a linha tem um OU outro, nunca os dois.
 *
 * 🔴 O QUE ELE PROMETE DEPENDE DA ORIGEM, e o tooltip diz qual:
 *   `manual`     → a pessoa foi colocada à mão; tirar é DEFINITIVO.
 *   `automatica` → o PLANO a colocou; tirar vale até o próximo "Aplicar", que a recoloca.
 *                  Para tirar de vez, o caminho é o switch "Retirar da alocação
 *                  automática" na mesma linha.
 * Sem essa distinção o mesmo botão prometeria a mesma coisa em dois casos opostos, e
 * metade das pessoas voltaria para a sala sem ninguém entender por quê.
 */
function BotaoRetirar({
  nome,
  origem,
  disabled,
  onRetirar,
}: {
  nome: string;
  origem: "automatica" | "manual" | null;
  disabled: boolean;
  onRetirar: () => void;
}) {
  const volta = origem === "automatica";
  const explicacao = volta
    ? `Retirar ${nome} da sala. Foi o plano que a colocou, então ela volta no próximo “Aplicar” — para tirar de vez, use o marcador ao lado.`
    : `Retirar ${nome} da sala. Ela foi incluída à mão, então a retirada é definitiva.`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={disabled}
            onClick={onRetirar}
            aria-label={explicacao}
          >
            <UserMinus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[22rem]">{explicacao}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * O ícone que substituiu a coluna "Pedido" (decisão D2).
 *
 * ⚠️ O TEXTO do pedido ("sala térrea e ledor") é a informação que decide a sala de quem
 * pede atendimento especial. A coluna saiu para a tabela caber, mas o texto NÃO pode sair
 * da tela — quem for alocar à mão precisaria abrir /candidatos para lê-lo. Daí o tooltip.
 *
 * 🔴 O `TooltipProvider` é LOCAL de propósito. O Radix lança "Tooltip must be used within
 * TooltipProvider" e derruba a ÁRVORE INTEIRA — a página some, não só o ícone. Hoje existe
 * um provider na raiz do App, então isto funcionaria; mas depender de um ancestral distante
 * é a mesma fragilidade do `useDroppable` fora do DndContext, e foi o teste desta tela que
 * a expôs. Providers aninhados são suportados e custam nada.
 */
function MarcadorDeAtendimento({
  bloco,
  salaEspecial,
}: {
  bloco: "comum" | "pcd" | "sala_especial";
  salaEspecial: string | null;
}) {
  if (bloco === "comum") return null;

  const texto =
    bloco === "sala_especial"
      ? (salaEspecial?.trim() ?? "Pedido de sala especial")
      : "Portador de deficiência (PCD)";

  const Icone = bloco === "sala_especial" ? FileText : Accessibility;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={
              bloco === "sala_especial" ? "text-amber-600 shrink-0" : "text-violet-600 shrink-0"
            }
          >
            <Icone className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{texto}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[20rem]">{texto}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
