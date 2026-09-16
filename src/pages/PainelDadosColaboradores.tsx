import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { buscarEmFatias } from "@/lib/buscar-em-fatias";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, Search, Users, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Row {
  id: string;
  nome: string;
  email: string;
  unidade: string;
  ultimo_acesso: string | null;
}

type SortCol = "nome" | "email" | "unidade" | "ultimo_acesso";

/** O que o join aninhado devolve, antes de ser achatado. */
interface LinhaCrua {
  colaboradores: {
    id: string;
    colab_nome_completo: string | null;
    colab_email: string | null;
    colab_ultimo_acesso: string | null;
  } | null;
  prova_unidades: {
    unidades_prova: { unid_nome?: string | null; unid_sigla?: string | null } | null;
  } | null;
}

/**
 * Achata o join e DEDUPLICA por colaborador: quem está alocado em duas unidades da mesma
 * prova volta em duas linhas de `colaboradores_prova`, e o painel lista PESSOAS.
 *
 * ⚠️ Fica fora do componente de propósito — dentro do `useEffect` isto empurrava a
 * complexidade do `fetchData` acima do teto do lint, e aqui é função pura.
 */
function montarLinhas(cruas: LinhaCrua[]): Row[] {
  const vistos = new Set<string>();
  const linhas: Row[] = [];
  for (const cp of cruas) {
    const c = cp.colaboradores;
    if (!c || vistos.has(c.id)) continue;
    vistos.add(c.id);
    const u = cp.prova_unidades?.unidades_prova;
    linhas.push({
      id: c.id,
      nome: c.colab_nome_completo || "-",
      email: c.colab_email || "-",
      unidade: u?.unid_nome || u?.unid_sigla || "-",
      ultimo_acesso: c.colab_ultimo_acesso,
    });
  }
  return linhas;
}

export default function PainelDadosColaboradores() {
  const { provaId } = useParams<{ provaId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    async function fetchData() {
      if (!provaId) return;
      setIsLoading(true);
      setErro(null);
      try {
        // 🔴 EM FATIAS, não numa consulta só: o PostgREST corta em `max_rows` (1000) SEM
        // erro nenhum, e o painel mostraria uma lista incompleta como se fosse completa —
        // agora com quatro formas de reordenar o pedaço truncado. É o mesmo defeito que os
        // três exports de `GerenciarProva` fecharam em 10/09.
        //
        // ⚠️ O `.order('id')` substituiu a ordem por nome e NÃO é cosmético: sem ordem
        // determinística o banco pode devolver as linhas em ordem diferente de uma fatia
        // para a outra, e o laço repete uma e pula outra — calado. A ordem da TELA é
        // decidida no cliente (`filtered`), que já ordena pelas quatro colunas e desempata
        // pelo nome, então nada se perde ao trocar a ordem da consulta.
        const data = await buscarEmFatias((de, ate) =>
          supabase
            .from("colaboradores_prova")
            .select(`
              id,
              colaboradores (
                id,
                colab_nome_completo,
                colab_email,
                colab_ultimo_acesso
              ),
              prova_unidades!inner (
                prova_id,
                unidades_prova ( unid_nome )
              )
            `)
            .eq("prova_unidades.prova_id", provaId)
            .order("id", { ascending: true })
            .range(de, ate),
        );

        setRows(montarLinhas(data as unknown as LinhaCrua[]));
      } catch (e) {
        // ⚠️ Falha passou a APARECER. Antes era `if (!error && data)`: erro de consulta
        // deixava a lista vazia e a tela dizia "Nenhum colaborador encontrado" — a mesma
        // frase de uma prova sem ninguém alocado. Duas causas, uma única mensagem, e a
        // errada era indistinguível da normal.
        setRows([]);
        // ⚠️ `buscarEmFatias` faz `throw error` com o objeto CRU do PostgREST, que **não é
        // um `Error`** — só tem `message`. Testar `e instanceof Error` aqui descartaria a
        // mensagem do banco e mostraria um texto genérico: é a mesma armadilha que deixa o
        // `CorrigirEmailAcessoDialog` engolir as respostas da Edge Function. Coberto por
        // teste, que foi quem pegou.
        const msg = (e as { message?: string } | null)?.message;
        setErro(msg || "Falha ao carregar os colaboradores.");
      }
      setIsLoading(false);
    }
    fetchData();
  }, [provaId]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    const f = rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        r.unidade.toLowerCase().includes(s),
    );
    return [...f].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "ultimo_acesso") {
        const da = a.ultimo_acesso ? new Date(a.ultimo_acesso).getTime() : 0;
        const db = b.ultimo_acesso ? new Date(b.ultimo_acesso).getTime() : 0;
        cmp = da - db;
      } else {
        // `localeCompare` com "pt-BR" é o que faz acento ordenar junto da letra base
        // ("Álvaro" perto de "Alves", não no fim da lista). Vale para nome, email e
        // unidade — os três são texto e ordenam pela mesma regra.
        cmp = a[sortCol].localeCompare(b[sortCol], "pt-BR");
      }
      // Desempate explícito pelo nome. Sem ele o empate cairia na ordem de chegada da
      // consulta (que é nome ASC) — daria no mesmo, mas por acidente: bastaria a
      // consulta mudar de `.order()` para a ordem virar outra sem ninguém notar.
      if (cmp === 0 && sortCol !== "nome") cmp = a.nome.localeCompare(b.nome, "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, sortCol, sortDir]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortCol }) =>
    sortCol === col ? (
      sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3 text-primary" />
      ) : (
        <ArrowDown className="h-3 w-3 text-primary" />
      )
    ) : (
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    );

  // O gatilho é um <button>, não um onClick no <th>: assim a ordenação alcança quem
  // navega por teclado, e o leitor de tela anuncia o estado pelo `aria-sort`. As duas
  // colunas que já eram ordenáveis passaram a usar isto também — antes o clique vivia
  // num <div>, invisível para o teclado.
  const ColunaOrdenavel = ({ col, children }: { col: SortCol; children: React.ReactNode }) => (
    <TableHead
      className="font-semibold p-0"
      aria-sort={sortCol === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="flex w-full items-center gap-1 px-4 py-3 text-left font-semibold select-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children} <SortIcon col={col} />
      </button>
    </TableHead>
  );

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/gerenciar-prova/${provaId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">
              Painel de Dados dos Colaboradores
            </h1>
            <p className="text-muted-foreground">
              Lista de colaboradores cadastrados nesta prova
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4" />
              Colaboradores ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : erro ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-medium">Não foi possível carregar a lista.</p>
                <p className="mt-1">{erro}</p>
                <p className="mt-2 text-destructive/80">
                  A lista abaixo não é exibida porque estaria incompleta. Recarregue a página;
                  se persistir, avise quem cuida do sistema.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum colaborador encontrado.
              </div>
            ) : (
              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <ColunaOrdenavel col="nome">Nome</ColunaOrdenavel>
                      <ColunaOrdenavel col="email">Email</ColunaOrdenavel>
                      <ColunaOrdenavel col="unidade">Unidade</ColunaOrdenavel>
                      <ColunaOrdenavel col="ultimo_acesso">Último Acesso</ColunaOrdenavel>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.nome}</TableCell>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.unidade}</TableCell>
                        <TableCell>
                          {r.ultimo_acesso ? (
                            <span title={format(new Date(r.ultimo_acesso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}>
                              {formatDistanceToNow(new Date(r.ultimo_acesso), { addSuffix: true, locale: ptBR })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">Nunca acessou</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
