import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { SalaProva } from "@/hooks/useSalasProva";

export const createFormSchema = (maxAndares: number) => z.object({
  quantidade: z.coerce.number().int().min(1, "Mínimo 1 sala").max(50, "Máximo 50 salas"),
  sala_capacidade: z.coerce.number().int().positive("Capacidade deve ser positiva"),
  sala_andar: z.coerce.number().int().min(1, "Andar deve ser 1 ou maior").max(maxAndares, `Máximo ${maxAndares} andares`),
});

export const editFormSchema = (maxAndares: number) => z.object({
  sala_numero: z.coerce.number().int().positive("Número deve ser positivo"),
  sala_descricao: z.string().max(50, "Máximo 50 caracteres").optional().or(z.literal("")),
  sala_arcondicionado: z.boolean().default(false),
  sala_capacidade: z.coerce.number().int().positive("Capacidade deve ser positiva"),
  sala_andar: z.coerce.number().int().min(1, "Andar deve ser 1 ou maior").max(maxAndares, `Máximo ${maxAndares} andares`).optional().or(z.literal("")),
});

type CreateFormData = z.infer<ReturnType<typeof createFormSchema>>;
type EditFormData = z.infer<ReturnType<typeof editFormSchema>>;

export interface CreateSalaData {
  quantidade: number;
  sala_capacidade: number;
  sala_andar: number;
}

export interface EditSalaData {
  sala_numero: number;
  sala_descricao?: string;
  sala_arcondicionado?: boolean;
  sala_capacidade: number;
  sala_andar?: number;
}

interface SalaProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sala: SalaProva | null;
  onSubmit: (data: CreateSalaData | EditSalaData) => void;
  isLoading: boolean;
  maxAndares: number;
}

export function SalaProvaDialog({
  open,
  onOpenChange,
  sala,
  onSubmit,
  isLoading,
  maxAndares,
}: SalaProvaDialogProps) {
  const isEditing = !!sala;
  const safeMaxAndares = maxAndares > 0 ? maxAndares : 1;

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createFormSchema(safeMaxAndares)),
    defaultValues: {
      quantidade: 1,
      sala_capacidade: 0,
      sala_andar: 1,
    },
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema(safeMaxAndares)),
    defaultValues: {
      sala_numero: 0,
      sala_descricao: "",
      sala_arcondicionado: false,
      sala_capacidade: 0,
      sala_andar: "",
    },
  });

  useEffect(() => {
    if (sala) {
      editForm.reset({
        sala_numero: sala.sala_numero,
        sala_descricao: sala.sala_descricao ?? "",
        sala_arcondicionado: sala.sala_arcondicionado ?? false,
        sala_capacidade: sala.sala_capacidade,
        sala_andar: sala.sala_andar ?? "",
      });
    } else {
      createForm.reset({
        quantidade: 1,
        sala_capacidade: 0,
        sala_andar: 1,
      });
    }
  }, [sala, createForm, editForm]);

  const handleCreateSubmit = (data: CreateFormData) => {
    onSubmit({
      quantidade: data.quantidade,
      sala_capacidade: data.sala_capacidade,
      sala_andar: data.sala_andar,
    } as CreateSalaData);
  };

  const handleEditSubmit = (data: EditFormData) => {
    onSubmit({
      sala_numero: data.sala_numero,
      sala_descricao: data.sala_descricao === "" ? undefined : data.sala_descricao,
      sala_arcondicionado: data.sala_arcondicionado,
      sala_capacidade: data.sala_capacidade,
      sala_andar: data.sala_andar === "" ? undefined : data.sala_andar,
    } as EditSalaData);
  };

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Sala</DialogTitle>
            <DialogDescription>
              Atualize as informações da sala de prova.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="sala_numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número *</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="sala_capacidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade *</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="sala_descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Sala de Informática" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="sala_andar"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Andar</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Ex: 2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novas Salas</DialogTitle>
          <DialogDescription>
            Preencha os dados para criar novas salas de prova.
          </DialogDescription>
        </DialogHeader>
        <Form {...createForm}>
          <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
            <FormField
              control={createForm.control}
              name="quantidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade de Salas *</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} max={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={createForm.control}
                name="sala_andar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Andar * (1-{safeMaxAndares})</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={safeMaxAndares} placeholder="Ex: 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="sala_capacidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacidade *</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
