import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps<T extends string> {
  label: string;
  column: T;
  currentColumn: T | null;
  direction: "asc" | "desc";
  onSort: (column: T) => void;
  className?: string;
}

/**
 * Cabeçalho de tabela clicável com seta indicando coluna e direção ativas.
 * Nasceu em `/colaboradores` (ColaboradoresList) — extraído para cá para qualquer
 * tabela nova reaproveitar o mesmo padrão visual e de interação, em vez de reimplementar.
 */
export function SortableTableHead<T extends string>({
  label,
  column,
  currentColumn,
  direction,
  onSort,
  className,
}: SortableTableHeadProps<T>) {
  const isActive = currentColumn === column;
  return (
    <TableHead
      className={cn("font-semibold cursor-pointer select-none hover:bg-muted/50 transition-colors", className)}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowDown className="h-3 w-3 text-primary" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </div>
    </TableHead>
  );
}
