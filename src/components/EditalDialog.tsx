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
import { Edital, EditalInsert, EditalUpdate } from "@/hooks/useEditais";

const formSchema = z.object({
  nome: z.string().min(1, "Nome do edital é obrigatório"),
  n_candidatos: z.string().optional(),
  cabecalho_linha1: z.string().optional(),
  cabecalho_linha2: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface EditalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edital?: Edital | null;
  onSubmit: (data: EditalInsert | EditalUpdate) => void;
  isLoading?: boolean;
}

export function EditalDialog({
  open,
  onOpenChange,
  edital,
  isLoading,
  onSubmit,
}: EditalDialogProps) {
  const isEditing = !!edital;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      n_candidatos: "",
      cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
      cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
    },
  });

  useEffect(() => {
    if (edital) {
      form.reset({
        nome: edital.nome ?? "",
        n_candidatos: edital.n_candidatos?.toString() ?? "",
        cabecalho_linha1: edital.cabecalho_linha1 ?? "",
        cabecalho_linha2: edital.cabecalho_linha2 ?? "",
      });
    } else {
      form.reset({
        nome: "",
        n_candidatos: "",
        cabecalho_linha1: "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA",
        cabecalho_linha2: "Coordenação de Concursos e Processos Seletivos",
      });
    }
  }, [edital, form]);

  const handleSubmit = (data: FormData) => {
    const formattedData: EditalInsert | EditalUpdate = {
      nome: data.nome.trim(),
      n_candidatos: data.n_candidatos ? parseInt(data.n_candidatos) : null,
      cabecalho_linha1: data.cabecalho_linha1 || null,
      cabecalho_linha2: data.cabecalho_linha2 || null,
    };
    onSubmit(formattedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Edital" : "Novo Edital"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Edital *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Edital 001/2026 SMA" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="n_candidatos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Candidatos</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min="0" placeholder="Ex: 1500" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-1">
                Cabeçalho (PDF)
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Sugestão herdada ao cadastrar uma prova sob este edital. Cada prova pode ajustar a sua.
              </p>

              <FormField
                control={form.control}
                name="cabecalho_linha1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Linha 1 do Cabeçalho</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cabecalho_linha2"
                render={({ field }) => (
                  <FormItem className="mt-3">
                    <FormLabel>Linha 2 do Cabeçalho</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Coordenação de Concursos e Processos Seletivos" />
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
      </DialogContent>
    </Dialog>
  );
}
