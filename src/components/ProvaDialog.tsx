import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Prova, ProvaInsert, ProvaUpdate } from "@/hooks/useProvas";

const formSchema = z.object({
  prova_edital: z
    .string()
    .min(1, "Edital é obrigatório")
    .max(30, "Máximo de 30 caracteres"),
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

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prova_edital: "",
      prova_data: "",
      prova_hora_inicio: "",
      prova_hora_final: "",
      prova_n_candidatos: "",
      prova_cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
      prova_cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
    },
  });

  useEffect(() => {
    if (prova) {
      form.reset({
        prova_edital: prova.prova_edital?.trim() ?? "",
        prova_data: prova.prova_data ?? "",
        prova_hora_inicio: prova.prova_hora_inicio ?? "",
        prova_hora_final: prova.prova_hora_final ?? "",
        prova_n_candidatos: prova.prova_n_candidatos?.toString() ?? "",
        prova_cabecalho_linha1: prova.prova_cabecalho_linha1 ?? "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
        prova_cabecalho_linha2: prova.prova_cabecalho_linha2 ?? "Coordenação de Concursos e Processos Seletivos",
      });
    } else {
      form.reset({
        prova_edital: "",
        prova_data: "",
        prova_hora_inicio: "",
        prova_hora_final: "",
        prova_n_candidatos: "",
        prova_cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
        prova_cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
      });
    }
  }, [prova, form]);

  const handleSubmit = (data: FormData) => {
    const formattedData: ProvaInsert | ProvaUpdate = {
      prova_edital: data.prova_edital,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Prova" : "Nova Prova"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="prova_edital"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edital *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: EDITAL-001/2024"
                      maxLength={30}
                    />
                  </FormControl>
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
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length >= 3) {
                            value = value.slice(0, 2) + ':' + value.slice(2, 4);
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
                          let value = e.target.value.replace(/\D/g, '');
                          if (value.length >= 3) {
                            value = value.slice(0, 2) + ':' + value.slice(2, 4);
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
              <p className="text-sm font-medium text-muted-foreground mb-3">Configuração do Cabeçalho (PDF)</p>
              
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : isEditing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
