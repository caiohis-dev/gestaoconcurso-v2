import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

type SortCol = "nome" | "ultimo_acesso";

export default function PainelDadosColaboradores() {
  const { provaId } = useParams<{ provaId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    async function fetchData() {
      if (!provaId) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from("colaboradores_prova")
        .select(`
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
        .order("colab_nome_completo", { referencedTable: "colaboradores", ascending: true });

      if (!error && data) {
        const seen = new Set<string>();
        const list: Row[] = [];
        for (const cp of data as any[]) {
          const c = cp.colaboradores;
          if (!c || seen.has(c.id)) continue;
          seen.add(c.id);
          const unidade =
            cp.prova_unidades?.unidades_prova?.unid_nome ||
            cp.prova_unidades?.unidades_prova?.unid_sigla ||
            "-";
          list.push({
            id: c.id,
            nome: c.colab_nome_completo || "-",
            email: c.colab_email || "-",
            unidade,
            ultimo_acesso: c.colab_ultimo_acesso,
          });
        }
        setRows(list);
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
      if (sortCol === "nome") {
        cmp = a.nome.localeCompare(b.nome, "pt-BR");
      } else {
        const da = a.ultimo_acesso ? new Date(a.ultimo_acesso).getTime() : 0;
        const db = b.ultimo_acesso ? new Date(b.ultimo_acesso).getTime() : 0;
        cmp = da - db;
      }
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
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum colaborador encontrado.
              </div>
            ) : (
              <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead
                        className="font-semibold cursor-pointer select-none hover:bg-muted"
                        onClick={() => handleSort("nome")}
                      >
                        <div className="flex items-center gap-1">
                          Nome <SortIcon col="nome" />
                        </div>
                      </TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Unidade</TableHead>
                      <TableHead
                        className="font-semibold cursor-pointer select-none hover:bg-muted"
                        onClick={() => handleSort("ultimo_acesso")}
                      >
                        <div className="flex items-center gap-1">
                          Último Acesso <SortIcon col="ultimo_acesso" />
                        </div>
                      </TableHead>
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
