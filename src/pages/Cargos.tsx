import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCargosComUso,
  useCriarCargo,
  useAtualizarCargo,
  useExcluirCargo,
  cargoTemInscritos,
  Cargo,
  CargoComUso,
} from "@/hooks/useCargos";
import Layout from "@/components/Layout";
import { CargoDialog } from "@/components/CargoDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Plus, Pencil, Trash2, Loader2, Briefcase, ArrowLeft, Lock } from "lucide-react";

/**
 * Gestão do catálogo de cargos.
 *
 * ⭐ POR QUE ESTA PÁGINA EXISTE. Até 2026-07-30 o catálogo só era gerenciável DENTRO do
 * assistente de importação (passo 3), e a decisão D7 do roadmap de Cargos recomendava
 * deixar assim. O usuário pediu a tela; ela executa a "etapa 7" daquele roadmap, reduzida
 * ao CRUD.
 *
 * ⚠️ O QUE ELA DELIBERADAMENTE NÃO FAZ, e não é esquecimento:
 *
 *   - **Desativar (`cargos.ativo`)**: a coluna existe desde a etapa 1 e não tem consumidor
 *     nenhum. Para "inativo" significar algo, o passo Cargos do assistente teria de parar
 *     de oferecer os inativos — ou seja, mexer no fluxo de importação. Fica fora até
 *     alguém decidir esse comportamento.
 *   - **Fundir cargos duplicados**: reapontar candidatos e apelidos e só então apagar é
 *     operação de dados em três tabelas, e exige RPC transacional. Três chamadas soltas do
 *     cliente deixariam estado pela metade. Está desenhada na etapa 7 do roadmap.
 */
export default function Cargos() {
  const navigate = useNavigate();
  const { cargos, isLoading } = useCargosComUso();
  const { criarCargo, isCriando } = useCriarCargo();
  const { atualizarCargo, isAtualizando } = useAtualizarCargo();
  const { excluirCargo, isExcluindo } = useExcluirCargo();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [cargoEmEdicao, setCargoEmEdicao] = useState<Cargo | null>(null);
  const [cargoParaExcluir, setCargoParaExcluir] = useState<CargoComUso | null>(null);

  const abrirCriacao = () => {
    setCargoEmEdicao(null);
    setDialogOpen(true);
  };

  const abrirEdicao = (cargo: CargoComUso) => {
    setCargoEmEdicao(cargo);
    setDialogOpen(true);
  };

  // Um diálogo só: a presença de `cargoEmEdicao` é que decide criar vs. renomear. Dois
  // diálogos separados duplicariam o formulário e as regras de validação.
  const salvar = async (nome: string) => {
    if (cargoEmEdicao) {
      await atualizarCargo({ id: cargoEmEdicao.id, nome });
    } else {
      await criarCargo(nome);
    }
    setDialogOpen(false);
    setCargoEmEdicao(null);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cargos</h1>
            <p className="text-muted-foreground">
              O catálogo é global: vale para todos os editais. ⚠️ <strong>Cargo que já
              tem inscritos não pode ser alterado nem excluído.</strong> A janela para
              corrigir um nome é antes da primeira importação que o use — textos
              memorizados não impedem.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* ⚠️ `aria-label` porque o header do Layout tem um link de navegação também
                chamado "Candidatos": sem ele, leitor de tela anuncia dois controles
                idênticos com destinos que parecem iguais e não são. */}
            <Button
              variant="outline"
              className="gap-2"
              aria-label="Voltar para a lista de candidatos"
              onClick={() => navigate("/candidatos")}
            >
              <ArrowLeft className="h-4 w-4" />
              Candidatos
            </Button>
            <Button className="gap-2" onClick={abrirCriacao}>
              <Plus className="h-4 w-4" />
              Novo cargo
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : cargos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Briefcase className="h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-medium">Nenhum cargo cadastrado</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Use <strong>Novo cargo</strong> para criar o primeiro, ou deixe que a importação
                de candidatos os crie — o passo Cargos do assistente também cadastra.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cargo</TableHead>
                      <TableHead className="text-right">Inscritos</TableHead>
                      <TableHead className="text-right">Textos memorizados</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargos.map((cargo) => {
                      // ⚠️ ANTECIPA a barreira do banco; não a substitui. Quem recusa é o
                      // trigger CG001 e a FK `candidatos_cargo_id_fkey` RESTRICT — aqui é
                      // só para o usuário não digitar um nome novo para descobrir depois
                      // que não podia.
                      //
                      // ⚠️ Só INSCRITO tranca. Uma linha pode exibir "Textos memorizados:
                      // 5" e ainda assim oferecer os dois botões — é o caso normal desde
                      // 01/08, não um defeito de renderização.
                      const imutavel = cargoTemInscritos(cargo);
                      return (
                        <TableRow key={cargo.id}>
                          <TableCell className="font-medium">{cargo.nome}</TableCell>
                          <TableCell className="text-right">{cargo.candidatos}</TableCell>
                          <TableCell className="text-right">{cargo.apelidos}</TableCell>
                          <TableCell className="text-right">
                            {imutavel ? (
                              // Botão cinza e mudo deixa o usuário procurando o que fazer.
                              // Este diz por que, e a contagem ao lado diz o quanto.
                              <span className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                                <Lock className="h-4 w-4" />
                                Em uso por inscritos — não editável
                              </span>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => abrirEdicao(cargo)}
                                  aria-label={`Renomear ${cargo.nome}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Renomear
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-2 text-destructive hover:text-destructive"
                                  onClick={() => setCargoParaExcluir(cargo)}
                                  aria-label={`Excluir ${cargo.nome}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Excluir
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CargoDialog
        open={dialogOpen}
        onOpenChange={(aberto) => {
          setDialogOpen(aberto);
          if (!aberto) setCargoEmEdicao(null);
        }}
        cargo={cargoEmEdicao}
        onSubmit={salvar}
        isLoading={isCriando || isAtualizando}
      />

      {/* Confirmação de exclusão — AlertDialog e não senha, porque o BANCO é a rede: a FK
          `candidatos_cargo_id_fkey` é RESTRICT e recusa apagar cargo com inscrito. É o
          mesmo critério do módulo: excluir UM inscrito usa AlertDialog; "limpar edital",
          que não tem rede nenhuma, é que pede senha.

          ⚠️ ESTE DIÁLOGO SÓ ABRE PARA CARGO SEM INSCRITO, porque o botão Excluir não
          existe para os outros — então NÃO há ramo "N inscritos vão barrar" aqui, e não
          deve haver: guarda que não pode disparar é armadilha. Mas o cargo PODE ter
          apelidos, e esse ramo é obrigatório. */}
      <AlertDialog
        open={cargoParaExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setCargoParaExcluir(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o cargo {cargoParaExcluir?.nome}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Nenhum inscrito usa este cargo, então ele pode ser excluído. A ação não
                  tem volta — mas o cargo pode ser criado de novo a qualquer momento,
                  inclusive pelo assistente de importação.
                </p>

                {/* 🔴 O aviso que não pode sumir: os apelidos vão junto, por CASCADE, e em
                    silêncio. É a memória de "texto sujo → cargo" que pré-preenche as
                    próximas importações; sem ela, o usuário reassocia tudo de novo.

                    ⚠️ Ele saiu em 31/07, quando a FK virou RESTRICT e o ramo ficou
                    inalcançável, e VOLTOU em 01/08 junto com o CASCADE. Se alguém mexer na
                    FK de novo, este bloco é o primeiro lugar a conferir — sem ele, o
                    CASCADE vira perda muda. Há teste guardando. */}
                {cargoParaExcluir && cargoParaExcluir.apelidos > 0 && (
                  <p className="rounded-md border border-destructive p-3 text-destructive">
                    <strong>{cargoParaExcluir.apelidos}</strong> texto(s) de planilha
                    memorizado(s) serão apagados junto. Nas próximas importações, esses
                    textos voltam a aparecer sem associação.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isExcluindo}
              onClick={async () => {
                if (cargoParaExcluir) {
                  // ⚠️ Sem pré-check de uso aqui, de propósito: "leio e então decido" é uma
                  // corrida, e a recusa do banco nomeia o obstáculo melhor. A contagem
                  // acima informa; quem barra é a FK.
                  await excluirCargo(cargoParaExcluir.id).catch(() => undefined);
                  setCargoParaExcluir(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
