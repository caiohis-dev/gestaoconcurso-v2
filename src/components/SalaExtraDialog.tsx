import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface SalaExtraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    sala_numero: number;
    sala_descricao: string | null;
    sala_andar: string | null;
    sala_capacidade: number;
  }) => void;
  isLoading?: boolean;
  existingNumeros: number[];
}

export function SalaExtraDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  existingNumeros,
}: SalaExtraDialogProps) {
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState("");
  const [andar, setAndar] = useState("");
  const [capacidade, setCapacidade] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const numValue = parseInt(numero, 10);
    if (isNaN(numValue) || numValue <= 0) {
      setError("Número da sala deve ser um valor positivo");
      return;
    }

    if (existingNumeros.includes(numValue)) {
      setError("Este número de sala já existe nesta unidade");
      return;
    }

    const capValue = parseInt(capacidade, 10);
    if (isNaN(capValue) || capValue < 0) {
      setError("Capacidade deve ser um valor numérico válido");
      return;
    }

    onSubmit({
      sala_numero: numValue,
      sala_descricao: descricao.trim() || null,
      sala_andar: andar.trim() || null,
      sala_capacidade: capValue,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setNumero("");
      setDescricao("");
      setAndar("");
      setCapacidade("");
      setError("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Sala Extra</DialogTitle>
          <DialogDescription>
            Adicione uma sala extra para esta prova. O andar pode conter letras ou números.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="numero">Número da Sala *</Label>
              <Input
                id="numero"
                type="number"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ex: 101"
                min={1}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Sala de Informática"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="andar">Andar</Label>
              <Input
                id="andar"
                value={andar}
                onChange={(e) => setAndar(e.target.value)}
                placeholder="Ex: 1, Térreo, A, etc."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="capacidade">Capacidade *</Label>
              <Input
                id="capacidade"
                type="number"
                value={capacidade}
                onChange={(e) => setCapacidade(e.target.value)}
                placeholder="Ex: 30"
                min={0}
                required
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
