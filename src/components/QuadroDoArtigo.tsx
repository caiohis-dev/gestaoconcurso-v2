/**
 * A tabela de um artigo `tipo = 'quadro'` — montada do DADO, nunca digitada.
 *
 * 🔴 **Por que nenhum quadro é digitável.** Levantadas todas as tabelas dos três editais
 * reais em 2026-09-16: nenhuma é de forma livre. Quadro I são os cargos, Quadro II é a
 * matriz da prova, os Quadros III/IV são os títulos, e os quadros de vagas por UBSF são
 * a territorialidade. A "Certidão Nada Consta do COREN" exigida de Agente Comunitário de
 * Saúde no Edital 004 é justamente copia-e-cola de tabela — o defeito que some quando a
 * tabela nasce do dado.
 *
 * 🔵 **Desde 2026-11-16 este componente só DESENHA.** Até então eram cinco componentes,
 * cada um buscando o próprio dado e montando as linhas no JSX — inalcançável por qualquer
 * exportador. As linhas agora saem de `src/lib/edital-documento.ts` (uma função por fonte),
 * e a prévia e o Markdown desenham o MESMO `QuadroMontado`.
 *
 * Fonte nova exige FATIA nova, e a CHECK `chk_edital_item_quadro_fonte` no banco é o que
 * garante isso quando a tela não estiver no caminho.
 */
import type { QuadroMontado } from "@/lib/edital-documento";
import { TextoFormatado } from "@/components/ArtigosDoCapitulo";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Bloco VISÍVEL para quadro sem dado.
 *
 * ⚠️ Nunca um espaço em branco. Perda silenciosa é o formato de erro que este repo mais
 * teme — e um quadro que simplesmente não aparece é indistinguível de um que não existe.
 */
export function QuadroPendente({ motivo }: { motivo: string }) {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
      {motivo}
    </p>
  );
}

export function QuadroDoArtigo({ quadro }: { quadro: QuadroMontado }) {
  if (quadro.pendencia) return <QuadroPendente motivo={quadro.pendencia} />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {quadro.colunas.map((c) => (
            <TableHead key={c.titulo} className={c.numerica ? "text-right" : undefined}>
              {c.titulo}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {quadro.linhas.map((linha, i) => (
          <TableRow key={i}>
            {linha.map((celula, j) => (
              <TableCell
                key={j}
                className={
                  quadro.colunas[j]?.numerica ? "text-right tabular-nums" : j === 0 ? "font-medium" : undefined
                }
              >
                <TextoFormatado texto={celula} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
