import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Prova, ProvaInsert, ProvaUpdate } from "@/hooks/useProvas";
import { useEditais } from "@/hooks/useEditais";

// ⚠️ `prova_n_candidatos` SAIU do formulário em 2026-08-02 e não deve voltar. Era o número
// que a alocação lia, e era digitado à mão: dizia 200 num edital com 7.231 inscritos, e o
// painel pintava a prova de coberta. Hoje a alocação conta os inscritos reais do edital.
// Só volta junto com o vínculo candidato↔prova, quando "esta prova aplica um recorte do
// edital" passar a ser exprimível — hoje não é. Ver o doc do módulo Aplicação de Provas.
export const formSchema = z.object({
  edital_id: z.string().min(1, "Selecione um edital"),
  prova_data: z.string().optional(),
  prova_hora_inicio: z.string().optional(),
  prova_hora_final: z.string().optional(),
  prova_cabecalho_linha1: z.string().optional(),
  prova_cabecalho_linha2: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prova?: Prova | null;
  onSubmit: (data: ProvaInsert | ProvaUpdate) => void;
  isLoading?: boolean;
}

export function ProvaDialog({
  open,
  onOpenChange,
  prova,
  isLoading,
  onSubmit,
}: ProvaDialogProps) {
  const isEditing = !!prova;
  const { editais, isLoading: editaisLoading } = useEditais();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      edital_id: "",
      prova_data: "",
      prova_hora_inicio: "",
      prova_hora_final: "",
      prova_cabecalho_linha1: "",
      prova_cabecalho_linha2: "",
    },
  });

  useEffect(() => {
    if (prova) {
      form.reset({
        edital_id: prova.edital_id ?? "",
        prova_data: prova.prova_data ?? "",
        prova_hora_inicio: prova.prova_hora_inicio ?? "",
        prova_hora_final: prova.prova_hora_final ?? "",
        prova_cabecalho_linha1: prova.prova_cabecalho_linha1 ?? "",
        prova_cabecalho_linha2: prova.prova_cabecalho_linha2 ?? "",
      });
    } else {
      form.reset({
        edital_id: "",
        prova_data: "",
        prova_hora_inicio: "",
        prova_hora_final: "",
        prova_cabecalho_linha1: "",
        prova_cabecalho_linha2: "",
      });
    }
  }, [prova, form]);

  // Herança de UI (D2/D3): ao escolher um edital numa prova NOVA, o edital preenche os
  // campos de cabeçalho como SUGESTÃO editável.
  //
  // ⚠️ O ramo `if (!isEditing)` SAIU em 2026-08-02 e não deve voltar: desde a PE001 o
  // edital não é escolhível na edição, então esta função só é alcançável na criação.
  // Mantê-lo daria a impressão de que existe um caminho de troca ao editar.
  //
  // ⚠️ `n_candidatos` saiu da herança em 2026-08-02, junto com o campo: herdar previsão
  // para um número que ninguém mais lê só espalharia a cópia desatualizada. O que se
  // herda é cabeçalho — e é herança de UI, sem trigger nem default no banco.
  const handleEditalChange = (id: string) => {
    form.setValue("edital_id", id, { shouldValidate: true });
    const ed = editais.find((e) => e.id === id);
    if (ed) {
      form.setValue("prova_cabecalho_linha1", ed.cabecalho_linha1 ?? "");
      form.setValue("prova_cabecalho_linha2", ed.cabecalho_linha2 ?? "");
    }
  };

  /** O edital da prova em edição — é o que a tela mostra em leitura. */
  const editalDaProva = isEditing ? editais.find((e) => e.id === prova?.edital_id) : undefined;

  const handleSubmit = (data: FormData) => {
    const camposDaProva = {
      prova_data: data.prova_data || null,
      prova_hora_inicio: data.prova_hora_inicio || null,
      prova_hora_final: data.prova_hora_final || null,
      prova_cabecalho_linha1: data.prova_cabecalho_linha1 || null,
      prova_cabecalho_linha2: data.prova_cabecalho_linha2 || null,
    };

    // 🔴 PE001: na EDIÇÃO o payload NÃO carrega `edital_id` nem `prova_edital`.
    //
    // Isto é mais forte que desabilitar o campo — não há valor de edital viajando, então
    // nem um bug de estado no formulário consegue reescrever o vínculo. O trigger
    // `check_prova_edital_imutavel` recusaria de qualquer jeito; aqui a intenção é a tela
    // nunca chegar a PEDIR a troca, porque erro que o banco recusa vira toast vermelho
    // para um usuário que não pediu nada.
    if (isEditing) {
      onSubmit(camposDaProva as ProvaUpdate);
      return;
    }

    const edital = editais.find((e) => e.id === data.edital_id);
    const formattedData: ProvaInsert = {
      edital_id: data.edital_id,
      // Cópia denormalizada só para o NOT NULL de prova_edital (CHAR(30)) enquanto a
      // coluna não é dropada. Truncada a 30 por segurança; a fonte de verdade é edital_id.
      prova_edital: (edital?.nome ?? "").slice(0, 30),
      ...camposDaProva,
    };
    onSubmit(formattedData);
  };

  const semEditais = !editaisLoading && editais.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Prova" : "Nova Prova"}</DialogTitle>
          <DialogDescription>
            {/* ⚠️ O texto de edição dizia "Trocar o edital não sobrescreve os campos já
                preenchidos" até 2026-08-02. Virou falso com a PE001 — e pior que falso:
                ensinava uma ação que a tela não oferece mais. */}
            {semEditais
              ? "É preciso ter um edital cadastrado antes de criar uma prova."
              : isEditing
                ? "Atualize os dados da prova. O edital é definido na criação e não muda."
                : "Escolha o edital: os dados dele entram como ponto de partida e podem ser ajustados."}
          </DialogDescription>
        </DialogHeader>

        {semEditais ? (
          // Não dá para criar prova sem um edital cadastrado (D5).
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Nenhum edital cadastrado ainda. Cadastre um edital antes de criar uma prova.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button asChild>
                <Link to="/editais">Cadastrar Edital</Link>
              </Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {/* 🔴 PE001 — na EDIÇÃO o edital é MOSTRADO, nunca oferecido.
                  O item do backlog pede exatamente isto: "o valor da vinculação com o
                  Edital segue sendo visualizado na UI... apenas visualizado".

                  ⚠️ É um bloco de leitura, e não um <Select disabled>, de propósito: um
                  select acinzentado diz "isto poderia mudar, mas não agora" e convida a
                  procurar como habilitar. Aqui não há quando — o vínculo é da criação. Por
                  isso o texto explica o porquê em vez de só travar.

                  A GARANTIA não é isto: é o trigger `check_prova_edital_imutavel`
                  (migration 20260802045221). Esta tela é a conveniência. */}
              {isEditing ? (
                <FormItem>
                  <FormLabel>Edital</FormLabel>
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                    {editalDaProva?.nome ?? "—"}
                  </div>
                  <FormDescription>
                    O edital é definido ao criar a prova e não pode ser alterado depois.
                  </FormDescription>
                </FormItem>
              ) : (
                <FormField
                  control={form.control}
                  name="edital_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Edital *</FormLabel>
                      <Select value={field.value} onValueChange={handleEditalChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um edital" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {editais.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="prova_data"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Data da Prova</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" className="h-9 text-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prova_hora_inicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Hora Início</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          inputMode="numeric"
                          placeholder="HH:MM"
                          maxLength={5}
                          className="h-9 text-sm"
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, "");
                            if (value.length >= 3) {
                              value = value.slice(0, 2) + ":" + value.slice(2, 4);
                            }
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prova_hora_final"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Hora Final</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          inputMode="numeric"
                          placeholder="HH:MM"
                          maxLength={5}
                          className="h-9 text-sm"
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, "");
                            if (value.length >= 3) {
                              value = value.slice(0, 2) + ":" + value.slice(2, 4);
                            }
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Configuração do Cabeçalho (PDF)
                </p>

                <FormField
                  control={form.control}
                  name="prova_cabecalho_linha1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Linha 1 do Cabeçalho</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="prova_cabecalho_linha2"
                  render={({ field }) => (
                    <FormItem className="mt-3">
                      <FormLabel>Linha 2 do Cabeçalho</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Departamento de Concurso e Implementação Tecnológica"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
