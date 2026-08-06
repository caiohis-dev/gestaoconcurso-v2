import { useDraggable } from "@dnd-kit/core";
import { Users, Accessibility, FileText, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BlocoCargo,
  DadosArrastaveis,
  estadoDoBloco,
  EstadoDoBloco,
  ROTULO_DO_BLOCO,
} from "@/lib/alocacao-dnd";

/** Cada bloco tem cor própria. Não é enfeite — ver `CargoCard`. */
const COR_DO_BLOCO: Record<BlocoCargo, string> = {
  comum: "bg-red-50 border-red-200 text-red-900 hover:bg-red-100",
  pcd: "bg-violet-50 border-violet-300 text-violet-900 hover:bg-violet-100",
  sala_especial: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100",
};

/** Só os dois zeros têm estilo/texto próprios; `disponivel` cai no `??` do chamador. */
const ESTILO_DA_SITUACAO: Partial<Record<EstadoDoBloco, string>> = {
  "sem-inscritos": "bg-muted/40 border-dashed text-muted-foreground cursor-default",
  "todos-alocados": "bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default",
};

const TEXTO_DA_SITUACAO: Partial<Record<EstadoDoBloco, string>> = {
  "sem-inscritos": "sem inscritos",
  "todos-alocados": "todos alocados",
};

const ICONE_DO_BLOCO: Record<BlocoCargo, typeof Users> = {
  comum: Users,
  pcd: Accessibility,
  sala_especial: FileText,
};

interface CargoCardProps {
  bloco: BlocoCargo;
  naoAlocados: number;
  /** Quantos o bloco tinha ao abrir a tela. Distingue os DOIS zeros — ver abaixo. */
  total: number;
  /** Só o clone do `DragOverlay` passa isto: some a opacidade que esconde a origem. */
  comoOverlay?: boolean;
  arrastando?: boolean;
  /** O overlay mostra o nome do cargo; dentro do container ele já está no cabeçalho. */
  nome?: string;
}

/**
 * O visual de um bloco arrastável, SEM hook nenhum.
 *
 * ⚠️ A separação não é estética: o `DragOverlay` renderiza um clone deste card, e se o
 * clone também chamasse `useDraggable` haveria DOIS draggables com o mesmo `id`
 * registrados. O dnd-kit guarda os nós num Map por id — o clone sobrescreveria o nó de
 * origem. Componente visual puro + wrapper arrastável resolve na raiz.
 *
 * 🔴 BLOCO VAZIO NÃO SOME: vira um card desabilitado. Esconder o card faria a pessoa
 * procurar na tela um número que ela precisa ver ANTES de montar o plano — e "não achei o
 * card" é indistinguível de "não olhei direito". Foi exatamente o que aconteceu com o
 * bloco de sala especial, que tem 0 inscritos no dado real.
 *
 * 🔴 E os DOIS ZEROS dizem coisas opostas — quem decide qual é `estadoDoBloco`, na lib
 * pura, porque isso é regra de leitura e não formatação.
 */
export function CargoCard({
  bloco,
  naoAlocados,
  total,
  comoOverlay,
  arrastando,
  nome,
}: CargoCardProps) {
  const situacao = estadoDoBloco(naoAlocados, total);
  const Icone = situacao === "todos-alocados" ? Check : ICONE_DO_BLOCO[bloco];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border text-sm touch-none transition-colors",
        // Tracejado = nunca houve ninguém. Sólido esverdeado = havia e está feito.
        ESTILO_DA_SITUACAO[situacao] ?? cn("cursor-grab active:cursor-grabbing", COR_DO_BLOCO[bloco]),
        arrastando && !comoOverlay && "opacity-0",
        comoOverlay && "shadow-lg cursor-grabbing w-56",
      )}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium truncate">
          {comoOverlay && nome ? `${nome} — ${ROTULO_DO_BLOCO[bloco]}` : ROTULO_DO_BLOCO[bloco]}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 tabular-nums",
          situacao === "disponivel" ? "font-semibold" : "text-xs italic",
        )}
      >
        {TEXTO_DA_SITUACAO[situacao] ?? naoAlocados.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

interface CargoDraggableCardProps {
  /** O id do BLOCO (cargo + comum/pcd/sala_especial), não o do cargo. */
  id: string;
  nome: string;
  bloco: BlocoCargo;
  naoAlocados: number;
  total: number;
}

function rotuloAcessivel(
  nome: string,
  bloco: BlocoCargo,
  naoAlocados: number,
  total: number,
): string {
  const situacao = estadoDoBloco(naoAlocados, total);
  const prefixo = `${nome} — ${ROTULO_DO_BLOCO[bloco]}`;
  return situacao === "disponivel"
    ? `${prefixo}, ${naoAlocados} a distribuir`
    : `${prefixo}: ${TEXTO_DA_SITUACAO[situacao]}`;
}

/** Um bloco pendente, arrastável para uma unidade — a menos que esteja vazio. */
export function CargoDraggableCard({
  id,
  nome,
  bloco,
  naoAlocados,
  total,
}: CargoDraggableCardProps) {
  const dados: DadosArrastaveis = { tipo: "cargo", blocoId: id, nome, bloco, naoAlocados };

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cargo-${id}`,
    data: dados,
    // Bloco vazio não arrasta: o card fica só como informação.
    disabled: naoAlocados === 0,
  });

  // Sem `transform` no nó de origem: quem se move é o clone do DragOverlay. Aplicar os
  // dois soma deslocamentos e faz a origem invisível empurrar a área de rolagem.
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      aria-label={rotuloAcessivel(nome, bloco, naoAlocados, total)}
    >
      <CargoCard
        bloco={bloco}
        naoAlocados={naoAlocados}
        total={total}
        arrastando={isDragging}
      />
    </div>
  );
}
