import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useEditais } from "@/hooks/useEditais";
import {
  useCandidatos,
  useContagemCandidatosPorEdital,
  useExcluirCandidatos,
  Candidato,
} from "@/hooks/useCandidatos";
import { useCargos } from "@/hooks/useCargos";
import { RACA_MAP } from "@/lib/constants";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  Loader2,
  Users,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  ScrollText,
} from "lucide-react";

const POR_PAGINA = 50;

/**
 * Valor do Select quando nada está filtrado.
 *
 * O Radix não aceita `value=""` num `SelectItem` — string vazia é o que ele usa para
 * "sem seleção", e um item com esse valor apaga o placeholder. Daí o sentinela.
 */
const TODOS_OS_CARGOS = "todos";

/** Data ISO → dd/mm/aaaa. Sem `new Date`: 'YYYY-MM-DD' seria lido como UTC e voltaria um
 *  dia em fusos negativos — o Brasil inteiro. É a armadilha clássica de data no JS. */
function dataBr(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function cpfFormatado(cpf: string | null): string {
  if (!cpf) return "—";
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * O traço é o vazio da ficha: dos 25 campos, 20 são opcionais na planilha.
 *
 * Existe como função — e não como um `?? "—"` repetido 20 vezes — porque um campo vazio é
 * uma decisão de exibição, não um ramo de lógica. Além de nomear a decisão, mantém
 * `camposDaFicha` legível: com os `??` inline, o contador de complexidade lia 24 ramos
 * numa lista que não decide nada.
 */
const ou = (valor: string | null | undefined) => valor ?? "—";

/**
 * Os 25 campos da ficha, na ordem em que aparecem.
 *
 * Fora do componente porque é dado, não render — e porque manter a lista aqui é o que
 * permite ao Cargo ter DUAS linhas sem encher a árvore de JSX de condicional.
 */
function camposDaFicha(c: Candidato): [string, string][] {
  const campos: [string, string][] = [
    ["Nº de inscrição", c.n_inscricao],
    ["Cargo", ou(c.cargos?.nome)],
  ];

  // A PROCEDÊNCIA do cargo, e só quando ela difere do nome canônico. É o que explica ao
  // usuário por que ele já viu `DOCENTE I ¿ HISTÓRIA` nesta tela: o texto sujo continua
  // guardado (D2), o catálogo é que passou a mandar no que se exibe. Repetir a linha
  // quando os dois textos são iguais seria ruído em 8 de cada 9 fichas.
  if (c.cargo && c.cargo !== c.cargos?.nome) {
    campos.push(["Cargo como veio na planilha", c.cargo]);
  }

  campos.push(
    ["CPF", cpfFormatado(c.cpf)],
    ["E-mail", ou(c.email)],
    ["Nascimento", dataBr(c.data_nascimento)],
    ["Hora de nascimento", ou(c.hora_nascimento)],
    ["Sexo", ou(c.sexo)],
    ["Raça", c.raca != null ? String(RACA_MAP[c.raca] ?? c.raca) : "—"],
    ["Telefone", ou(c.telefone)],
    ["Celular", ou(c.celular)],
    ["Identidade", ou(c.identidade_numero)],
    ["Órgão emissor", ou(c.identidade_orgao)],
    ["UF da identidade", ou(c.identidade_uf)],
    ["Emissão", dataBr(c.identidade_emissao)],
    ["Logradouro", ou(c.logradouro)],
    ["Número", ou(c.numero)],
    ["Complemento", ou(c.complemento)],
    ["Bairro", ou(c.bairro)],
    ["Cidade", ou(c.cidade)],
    ["UF", ou(c.uf)],
    ["CEP", ou(c.cep)],
    ["PcD", c.portador_deficiencia ? "Sim" : "Não"],
    ["Inscrição confirmada", c.confirmado ? "Sim" : "Não"],
    ["Concurso na origem", ou(c.concurso_id_origem)],
  );

  return campos;
}

/**
 * O que dizer quando a tabela volta vazia.
 *
 * São QUATRO vazios diferentes e a tela precisa distingui-los, porque cada um manda fazer
 * outra coisa: importar a planilha, corrigir o termo, ou trocar o cargo filtrado. Dizer
 * "nenhum inscrito neste edital" com um filtro ligado é a versão pior do erro — o usuário
 * conclui que a importação falhou e reimporta 7.416 linhas à toa.
 */
function mensagemDoVazio(busca: string, cargoNome: string | null): { titulo: string; detalhe: string } {
  if (!busca && !cargoNome) {
    return {
      titulo: "Nenhum inscrito neste edital",
      detalhe: "Importe a planilha de inscritos para preencher a lista.",
    };
  }
  if (busca && cargoNome) {
    return {
      titulo: "Nenhum inscrito encontrado",
      detalhe: `Nenhum inscrito de "${cargoNome}" bate com a busca.`,
    };
  }
  if (cargoNome) {
    return {
      titulo: "Nenhum inscrito encontrado",
      detalhe: `Nenhum inscrito deste edital está no cargo "${cargoNome}".`,
    };
  }
  return { titulo: "Nenhum inscrito encontrado", detalhe: "Nenhum inscrito bate com a busca." };
}

export default function Candidatos() {
  const navigate = useNavigate();
  const { editais, isLoading: carregandoEditais } = useEditais();
  const { contagem, isLoading: carregandoContagem } = useContagemCandidatosPorEdital();
  const { excluirUm, excluirDoEdital, isExcluindo } = useExcluirCandidatos();
  // O catálogo alimenta o filtro. É GLOBAL (D1 do roadmap de cargos), então pode conter
  // cargo de outro edital; hoje são 9 no total, e o vazio filtrado diz qual cargo não tem
  // ninguém, o que basta para a pessoa entender o que aconteceu.
  //
  // ⚠️ `isLoading` é lido de propósito: um catálogo ainda carregando é indistinguível de um
  // catálogo vazio se a gente só olhar o array, e o filtro apareceria com uma única opção
  // ("Todos") como se não houvesse cargo nenhum. É o padrão de defeito mais repetido deste
  // repo, e o próprio `useCargos` avisa sobre ele.
  const { cargos, isLoading: carregandoCargos } = useCargos();

  const [editalId, setEditalId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [cargoFiltro, setCargoFiltro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [candidatoAberto, setCandidatoAberto] = useState<Candidato | null>(null);
  const [candidatoParaExcluir, setCandidatoParaExcluir] = useState<Candidato | null>(null);
  const [limparEditalAberto, setLimparEditalAberto] = useState(false);

  // Digitar filtra sozinho, com folga para terminar a palavra. Sem o atraso, cada tecla
  // vira uma consulta `ilike` numa tabela de milhares de linhas.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(0);
    }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { candidatos, total, isLoading, isFetching } = useCandidatos({
    editalId,
    busca: buscaAplicada,
    cargoId: cargoFiltro,
    pagina,
    porPagina: POR_PAGINA,
  });

  const editalAtual = editais.find((e) => e.id === editalId) ?? null;
  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);
  const cargoFiltradoNome = cargos.find((c) => c.id === cargoFiltro)?.nome ?? null;
  const filtrando = !!buscaAplicada || !!cargoFiltro;
  const vazio = mensagemDoVazio(buscaAplicada, cargoFiltradoNome);
  /**
   * Quantos inscritos o edital tem, IGNORANDO os filtros — vem da RPC de contagem, a mesma
   * dos cards.
   *
   * ⚠️ Não confundir com `total`, que é o count da consulta FILTRADA. A distinção não é
   * cosmética: "limpar edital" apaga o edital inteiro, e enquanto ele anunciava `total` a
   * confirmação prometia remover 12 inscritos e removia 7.416. Era defeito já com a busca
   * ligada; o filtro por cargo só o tornaria mais fácil de encontrar.
   */
  const totalDoEdital = editalId ? (contagem[editalId] ?? 0) : 0;

  // Trocar de edital é trocar de conjunto: o cargo filtrado pode não existir no novo (o
  // catálogo é global), e uma lista vazia por causa de filtro herdado se parece com uma
  // importação que falhou.
  function escolherEdital(id: string) {
    setEditalId(id);
    setCargoFiltro(null);
    setPagina(0);
  }

  if (carregandoEditais) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // Sem edital não existe candidato: a lista de inscritos é sempre de um concurso. Mandar
  // para /editais é a mesma saída que o ProvaDialog dá quando falta edital para a prova.
  if (editais.length === 0) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ScrollText className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Nenhum edital cadastrado</h3>
          <p className="mt-1 max-w-md text-muted-foreground">
            Os candidatos são os inscritos de um edital. Cadastre o edital do concurso antes
            de importar a lista de inscritos.
          </p>
          <Button className="mt-4" onClick={() => navigate("/editais")}>
            Cadastrar Edital
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Candidatos</h1>
            <p className="text-muted-foreground">
              Os inscritos de cada edital. A lista é sempre carregada por importação de planilha.
            </p>
          </div>
          <Button className="gap-2" onClick={() => navigate("/candidatos/importar")}>
            <Upload className="h-4 w-4" />
            Importar Planilha
          </Button>
        </div>

        {/* Escolha do edital — os cards mostram quantos inscritos cada um já tem. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {editais.map((edital) => {
            const selecionado = edital.id === editalId;
            return (
              <Card
                key={edital.id}
                role="button"
                tabIndex={0}
                onClick={() => escolherEdital(edital.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    escolherEdital(edital.id);
                  }
                }}
                className={`cursor-pointer transition-colors ${
                  selecionado ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
                }`}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{edital.nome}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {carregandoContagem ? (
                      <span>carregando…</span>
                    ) : (
                      <span>{contagem[edital.id] ?? 0} inscrito(s) importado(s)</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!editalId ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Escolha um edital</h3>
            <p className="mt-1 text-muted-foreground">
              Selecione um edital acima para ver os inscritos dele.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, inscrição ou CPF"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {/* "Quantos inscritos de DOCENTE II?" é a primeira pergunta real da
                    operação, e o `aria-label` é o único nome que este combobox tem — o
                    placeholder não rotula campo. */}
                <Select
                  value={cargoFiltro ?? TODOS_OS_CARGOS}
                  disabled={carregandoCargos}
                  onValueChange={(v) => {
                    setCargoFiltro(v === TODOS_OS_CARGOS ? null : v);
                    setPagina(0);
                  }}
                >
                  {/* Sem `placeholder`: `value` nunca é vazio (o sentinela "todos" sempre
                      vale), então o Radix nunca o exibiria — seria adorno morto. Quem
                      comunica "ainda não sei os cargos" é o `disabled` acima. */}
                  <SelectTrigger className="w-full sm:w-64" aria-label="Filtrar por cargo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS_OS_CARGOS}>Todos os cargos</SelectItem>
                    {cargos.map((cargo) => (
                      <SelectItem key={cargo.id} value={cargo.id}>
                        {cargo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                {/* Com filtro ligado o contador diz "X de Y": um número solto menor que o
                    do card do edital pareceria inscrito perdido na importação. */}
                <span className="text-sm text-muted-foreground">
                  {isFetching
                    ? "carregando…"
                    : filtrando
                      ? `${total} de ${totalDoEdital} inscrito(s)`
                      : `${total} inscrito(s)`}
                </span>
                {totalDoEdital > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    onClick={() => setLimparEditalAberto(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Limpar edital
                  </Button>
                )}
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : candidatos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">{vazio.titulo}</h3>
                <p className="mt-1 text-muted-foreground">{vazio.detalhe}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Inscrição</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Cargo</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Nascimento</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidatos.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono">{c.n_inscricao}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {c.nome}
                              {c.portador_deficiencia && <Badge variant="secondary">PcD</Badge>}
                              {!c.confirmado && <Badge variant="outline">não confirmada</Badge>}
                            </div>
                          </TableCell>
                          {/* O nome CANÔNICO do catálogo, não o texto da planilha: é o
                              ponto inteiro da etapa 6. Sem `cargo_id` não há cargo
                              canônico a exibir — "—" é preciso, e a ficha mostra o texto
                              cru de quem quiser saber o que veio na origem. */}
                          <TableCell>{c.cargos?.nome ?? "—"}</TableCell>
                          <TableCell className="font-mono">{cpfFormatado(c.cpf)}</TableCell>
                          <TableCell>{dataBr(c.data_nascimento)}</TableCell>
                          {/* Os dois botões nomeiam O INSCRITO da linha, e não só a ação.
                              São até 50 linhas por página: "Ver"/"Excluir" repetidos 50
                              vezes deixam quem navega por leitor de tela sem saber em quem
                              vai clicar. O rótulo de "Ver" COMEÇA com a palavra visível,
                              que é o que a WCAG 2.5.3 (Label in Name) exige de quem tem
                              texto na tela; o de excluir só tem o ícone, então o
                              `aria-label` é o único nome que ele tem. */}
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2"
                              aria-label={`Ver ficha de ${c.nome}`}
                              onClick={() => setCandidatoAberto(c)}
                            >
                              <Eye aria-hidden="true" className="h-4 w-4" />
                              Ver
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-destructive hover:text-destructive"
                              aria-label={`Excluir ${c.nome}`}
                              onClick={() => setCandidatoParaExcluir(c)}
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Página {pagina + 1} de {ultimaPagina + 1}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={pagina === 0}
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={pagina >= ultimaPagina}
                      onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Ficha completa — a tabela mostra 5 colunas, e a inscrição tem 25 campos. */}
      <Dialog open={!!candidatoAberto} onOpenChange={(o) => !o && setCandidatoAberto(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{candidatoAberto?.nome}</DialogTitle>
            <DialogDescription>
              Ficha da inscrição como veio na planilha importada. Os campos são somente leitura:
              candidato se corrige na origem e se reimporta.
            </DialogDescription>
          </DialogHeader>
          {candidatoAberto && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {camposDaFicha(candidatoAberto).map(([rotulo, valor]) => (
                <div key={rotulo}>
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd className="font-medium text-foreground">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Excluir UM inscrito é confirmação simples, e a diferença para o "limpar edital"
          logo abaixo é proposital: aqui a ação é reversível (basta reimportar) e atinge
          uma linha; lá são milhares. Pedir senha nas duas ensinaria a digitá-la no piloto
          automático, que é o jeito de a proteção do caso grave deixar de valer. */}
      <AlertDialog open={!!candidatoParaExcluir} onOpenChange={(o) => !o && setCandidatoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir candidato</AlertDialogTitle>
            <AlertDialogDescription>
              Remover {candidatoParaExcluir?.nome} (inscrição {candidatoParaExcluir?.n_inscricao}) da
              lista de inscritos? Reimportar a planilha traz o registro de volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (candidatoParaExcluir) excluirUm(candidatoParaExcluir.id);
                setCandidatoParaExcluir(null);
              }}
            >
              {isExcluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ⚠️ A descrição usa `totalDoEdital`, NUNCA `total`: a ação apaga o edital inteiro, e
          `total` é o count da consulta FILTRADA. Anunciar o filtrado prometia remover 12 e
          removia 7.416. Com filtro ligado, a confirmação diz isso na cara. */}
      <PasswordConfirmDialog
        open={limparEditalAberto}
        onOpenChange={setLimparEditalAberto}
        title="Limpar inscritos do edital"
        description={`Isto remove TODOS os ${totalDoEdital} inscritos de "${editalAtual?.nome ?? ""}"${
          filtrando ? ", inclusive os que os filtros atuais escondem" : ""
        }. Use quando a planilha de origem mudou de formato e a reimportação sozinha não resolve — reimportar por cima já atualiza os inscritos existentes, sem precisar limpar.`}
        confirmText={isExcluindo ? "Removendo..." : "Remover todos"}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (editalId) excluirDoEdital(editalId);
          setLimparEditalAberto(false);
        }}
      />
    </Layout>
  );
}
