import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users } from "lucide-react";
import { useMetaColaboradoresUnidade } from "@/hooks/useMetaColaboradoresUnidade";
import { useValoresFuncaoProva } from "@/hooks/useValoresFuncaoProva";
import { useFuncoesColaboradores } from "@/hooks/useFuncoesColaboradores";

interface MetaColaboradoresDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provaUnidadeId: string;
  provaId: string;
  unidadeNome: string;
}

export function MetaColaboradoresDialog({
  open,
  onOpenChange,
  provaUnidadeId,
  provaId,
  unidadeNome,
}: MetaColaboradoresDialogProps) {
  const { metas, isLoading, upsertMetas, isUpserting } = useMetaColaboradoresUnidade(provaUnidadeId);
  const { valoresFuncao, isLoading: isLoadingValores } = useValoresFuncaoProva(provaId);
  const { funcoes, isLoading: isLoadingFuncoes } = useFuncoesColaboradores();
  
  const [formData, setFormData] = useState<Record<string, number>>({});

  // Filtra funções que têm valor cadastrado para esta prova
  const funcoesDisponiveis = funcoes.filter((f) =>
    valoresFuncao.some((v) => v.funcao_id === f.id)
  );

  useEffect(() => {
    if (open && metas) {
      const initialData: Record<string, number> = {};
      funcoesDisponiveis.forEach((f) => {
        const meta = metas.find((m) => m.funcao_id === f.id);
        initialData[f.id] = meta?.quantidade_meta ?? 0;
      });
      setFormData(initialData);
    }
  }, [open, metas, funcoesDisponiveis.length]);

  const handleSubmit = () => {
    const items = Object.entries(formData).map(([funcao_id, quantidade_meta]) => ({
      funcao_id,
      quantidade_meta,
    }));
    upsertMetas(items, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const handleChange = (funcaoId: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setFormData((prev) => ({
      ...prev,
      [funcaoId]: Math.max(0, numValue),
    }));
  };

  const isLoadingAll = isLoading || isLoadingValores || isLoadingFuncoes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Definir Número de Colaboradores
          </DialogTitle>
          {/* Era um <p> solto: visualmente uma descrição, mas o Radix não o enxergava
              (nem o leitor de tela). Como DialogDescription já vem com
              `text-sm text-muted-foreground`, a troca não muda o visual. */}
          <DialogDescription className="mt-1">
            {unidadeNome}
          </DialogDescription>
        </DialogHeader>

        {isLoadingAll ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : funcoesDisponiveis.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">
            Nenhuma função cadastrada para esta prova.
            <br />
            Cadastre as funções primeiro na página de gerenciamento da prova.
          </div>
        ) : (
          <Card className="border">
            <ScrollArea className="h-[300px] p-4">
              <div className="space-y-4">
                {funcoesDisponiveis.map((funcao) => (
                  <div key={funcao.id} className="grid gap-2">
                    <Label htmlFor={funcao.id}>{funcao.cargo_nome}</Label>
                    <Input
                      id={funcao.id}
                      type="number"
                      min="0"
                      value={formData[funcao.id] ?? 0}
                      onChange={(e) => handleChange(funcao.id, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isUpserting || funcoesDisponiveis.length === 0}
          >
            {isUpserting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
