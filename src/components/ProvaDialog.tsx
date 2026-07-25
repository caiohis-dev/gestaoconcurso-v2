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

export const formSchema = z.object({
  edital_id: z.string().min(1, "Selecione um edital"),
  prova_data: z.string().optional(),
  prova_hora_inicio: z.string().optional(),
  prova_hora_final: z.string().optional(),
  prova_n_candidatos: z.string().optional(),
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
      prova_n_candidatos: "",
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
        prova_n_candidatos: prova.prova_n_candidatos?.toString() ?? "",
        prova_cabecalho_linha1: prova.prova_cabecalho_linha1 ?? "",
        prova_cabecalho_linha2: prova.prova_cabecalho_linha2 ?? "",
      });
    } else {
      form.reset({
        edital_id: "",
        prova_data: "",
        prova_hora_inicio: "",
        prova_hora_final: "",
        prova_n_candidatos: "",
        prova_cabecalho_linha1: "",
        prova_cabecalho_linha2: "",
      });
    }
  }, [prova, form]);

  // Herança de UI (D2/D3): ao escolher um edital numa prova NOVA, o edital preenche os
  // três campos como SUGESTÃO editável. Ao EDITAR, não sobrescreve — a prova já tem os
  // seus, e são eles que a alocação e os PDFs leem.
  const handleEditalChange = (id: string) => {
    form.setValue("edital_id", id, { shouldValidate: true });
    if (!isEditing) {
      const ed = editais.find((e) => e.id === id);
      if (ed) {
        form.setValue("prova_n_candidatos", ed.n_candidatos != null ? String(ed.n_candidatos) : "");
        form.setValue("prova_cabecalho_linha1", ed.cabecalho_linha1 ?? "");
        form.setValue("prova_cabecalho_linha2", ed.cabecalho_linha2 ?? "");
      }
    }
  };

  const handleSubmit = (data: FormData) => {
    const edital = editais.find((e) => e.id === data.edital_id);
    const formattedData: ProvaInsert | ProvaUpdate = {
      edital_id: data.edital_id,
      // Cópia denormalizada só para o NOT NULL de prova_edital (CHAR(30)) enquanto a
      // coluna não é dropada. Truncada a 30 por segurança; a fonte de verdade é edital_id.
      prova_edital: (edital?.nome ?? "").slice(0, 30),
      prova_data: data.prova_data || null,
      prova_hora_inicio: data.prova_hora_inicio || null,
      prova_hora_final: data.prova_hora_final || null,
      prova_n_candidatos: data.prova_n_candidatos
        ? parseInt(data.prova_n_candidatos)
        : null,
      prova_cabecalho_linha1: data.prova_cabecalho_linha1 || null,
      prova_cabecalho_linha2: data.prova_cabecalho_linha2 || null,
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
            {semEditais
              ? "É preciso ter um edital cadastrado antes de criar uma prova."
              : isEditing
                ? "Atualize os dados da prova. Trocar o edital não sobrescreve os campos já preenchidos."
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

              <div className="grid grid-cols-4 gap-3">
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

                <FormField
                  control={form.control}
                  name="prova_n_candidatos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Nº Candidatos</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="0"
                          placeholder="Ex: 1500"
                          className="h-9 text-sm"
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
                          placeholder="Ex: Coordenação de Concursos e Processos Seletivos"
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
