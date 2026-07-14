import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, Search, Users, ArrowUpDown, ArrowUp, ArrowDown, MailCheck } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Colab {
  id: string;
  colab_nome_completo: string | null;
  colab_email: string | null;
  colab_ultimo_acesso: string | null;
  colab_codigo_acesso: string | null;
  colab_cpf: string | null;
  colab_data_nascimento: string | null;
  colab_nacionalidade: string | null;
  colab_pis: string | null;
  colab_telefone: number | null;
  colab_chave_pix: string | null;
  colab_rua: string | null;
  colab_numero_casa: number | null;
  colab_bairro: string | null;
  colab_cidade: string | null;
  colab_cep: number | null;
  colab_estado_civil: number | null;
  colab_raca: number | null;
  colab_grau_instrucao: number | null;
}

interface Row {
  id: string;
  nome: string;
  email: string;
  unidade: string;
  ultimo_acesso: string | null;
  colab: Colab;
}

type SortCol = "nome" | "ultimo_acesso";

const CAMPOS_OBRIGATORIOS: { key: keyof Colab; label: string }[] = [
  { key: "colab_cpf", label: "CPF" },
  { key: "colab_data_nascimento", label: "Data de Nascimento" },
  { key: "colab_nome_completo", label: "Nome Completo" },
  { key: "colab_nacionalidade", label: "Nacionalidade" },
  { key: "colab_pis", label: "PIS" },
  { key: "colab_telefone", label: "Telefone" },
  { key: "colab_chave_pix", label: "Chave PIX" },
  { key: "colab_rua", label: "Rua" },
  { key: "colab_numero_casa", label: "Número" },
  { key: "colab_bairro", label: "Bairro" },
  { key: "colab_cidade", label: "Cidade" },
  { key: "colab_cep", label: "CEP" },
  { key: "colab_estado_civil", label: "Estado Civil" },
  { key: "colab_raca", label: "Raça/Cor" },
  { key: "colab_grau_instrucao", label: "Grau de Instrução" },
];

function getCamposFaltantes(c: Colab): string[] {
  return CAMPOS_OBRIGATORIOS
    .filter(({ key }) => {
      const v = c[key];
      return v === null || v === undefined || v === "" || v === 0;
    })
    .map((f) => f.label);
}

function buildEmailHtml(nome: string, codigo: string, campos: string[], siteUrl: string) {
  const semCampos = campos.length === 0;
  const primeiroNome = (nome || "Colaborador").trim().split(/\s+/)[0];
  const intro = semCampos
    ? `Identificamos que você ainda não acessou o sistema <strong>FEVRE</strong>. Acesse a plataforma e confira se seus dados cadastrais estão corretos.`
    : `Solicitamos a atualização dos seus dados cadastrais no sistema <strong>FEVRE</strong>. Os campos abaixo ainda precisam ser preenchidos:`;
  const lista = semCampos
    ? ""
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
        <tr><td style="background:#fef2f2;border-left:4px solid hsl(0,84%,45%);border-radius:6px;padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:hsl(0,84%,35%);">Campos pendentes</p>
          <ul style="font-size:15px;color:#1a1a1a;padding-left:20px;margin:0;">
            ${campos.map((c) => `<li style="margin:4px 0;">${c}</li>`).join("")}
          </ul>
        </td></tr>
      </table>`;
  const ctaLabel = semCampos ? "Acessar o sistema" : "Atualizar meus dados";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>FEVRE</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Inter,Arial,sans-serif;color:#1a1a1a;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);overflow:hidden;">
        <tr><td style="background:hsl(0,84%,45%);padding:28px 24px;text-align:center;">
          <img src="https://fevre.online/fevre-logo.png" alt="FEVRE" width="140" style="max-width:140px;height:auto;display:inline-block;"/>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="color:hsl(0,84%,45%);font-size:22px;font-weight:700;margin:0 0 16px;">Olá, ${primeiroNome}!</h1>
          <p style="font-size:16px;color:#334155;margin:0 0 20px;">${intro}</p>
          ${lista}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:hsl(230,75%,96%);border:1px dashed hsl(230,75%,55%);border-radius:8px;padding:18px 20px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:hsl(230,75%,35%);">Seu código de acesso</p>
              <p style="margin:0;font-size:30px;font-weight:700;letter-spacing:8px;color:hsl(230,75%,25%);">${codigo || "----"}</p>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px;">
            <tr><td align="center" style="border-radius:8px;background:hsl(0,84%,45%);">
              <a href="${siteUrl}" style="display:inline-block;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${ctaLabel}</a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#64748b;text-align:center;margin:0 0 4px;">
            Ou copie e cole no navegador:<br/>
            <a href="${siteUrl}" style="color:hsl(0,84%,45%);text-decoration:none;">${siteUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px 28px;border-top:1px solid #e2e8f0;">
          <p style="font-size:12px;color:#64748b;text-align:center;margin:0;">
            Em caso de dúvidas, entre em contato com o Coordenador da sua unidade.<br/>
            © FEVRE — <a href="https://fevre.online" style="color:#64748b;text-decoration:none;">fevre.online</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export default function PainelDadosColaboradores() {
  const { provaId } = useParams<{ provaId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reenviar, setReenviar] = useState(false);
  const [jaEnviadosIds, setJaEnviadosIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [sendLog, setSendLog] = useState<{ nome: string; email: string; ok: boolean; msg?: string }[]>([]);

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
            colab_ultimo_acesso,
            colab_codigo_acesso,
            colab_cpf,
            colab_data_nascimento,
            colab_nacionalidade,
            colab_pis,
            colab_telefone,
            colab_chave_pix,
            colab_rua,
            colab_numero_casa,
            colab_bairro,
            colab_cidade,
            colab_cep,
            colab_estado_civil,
            colab_raca,
            colab_grau_instrucao
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
            colab: c as Colab,
          });
        }
        setRows(list);
      }
      setIsLoading(false);
    }
    fetchData();
  }, [provaId]);

  useEffect(() => {
    async function fetchLog() {
      if (!provaId) return;
      const { data } = await supabase
        .from("email_atualizacao_log")
        .select("colaborador_id")
        .eq("prova_id", provaId)
        .eq("status", "sucesso");
      if (data) setJaEnviadosIds(new Set(data.map((d: any) => d.colaborador_id)));
    }
    fetchLog();
  }, [provaId]);

  const elegiveisTodos = useMemo(
    () =>
      rows.filter((r) => {
        const email = r.colab.colab_email;
        if (!email) return false;
        const faltantes = getCamposFaltantes(r.colab).length > 0;
        const nuncaAcessou = !r.colab.colab_ultimo_acesso;
        return faltantes || nuncaAcessou;
      }),
    [rows],
  );

  const jaReceberamCount = useMemo(
    () => elegiveisTodos.filter((r) => jaEnviadosIds.has(r.colab.id)).length,
    [elegiveisTodos, jaEnviadosIds],
  );

  const elegiveis = useMemo(
    () =>
      reenviar
        ? elegiveisTodos
        : elegiveisTodos.filter((r) => !jaEnviadosIds.has(r.colab.id)),
    [elegiveisTodos, jaEnviadosIds, reenviar],
  );


  const handleEnviarAtualizacao = async () => {
    setConfirmOpen(false);
    if (elegiveis.length === 0) {
      toast.info("Nenhum colaborador elegível para envio.");
      return;
    }
    setIsSending(true);
    setSendLog([]);
    setSendProgress({ done: 0, total: elegiveis.length });
    const base = import.meta.env.VITE_SUPABASE_URL;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const headers = {
      "Content-Type": "application/json",
      apikey,
      Authorization: `Bearer ${apikey}`,
    };
    const siteUrl = "https://fevre.online/auth";

    let sucesso = 0;
    let falhas = 0;
    for (let i = 0; i < elegiveis.length; i++) {
      const r = elegiveis[i];
      let ok = false;
      let msg: string | undefined;
      try {
        const campos = getCamposFaltantes(r.colab);
        const html = buildEmailHtml(
          r.colab.colab_nome_completo || "Colaborador",
          r.colab.colab_codigo_acesso || "",
          campos,
          siteUrl,
        );
        try {
          const res = await fetch(`${base}/functions/v1/send-email`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              to: r.colab.colab_email,
              subject: campos.length === 0
                ? "Confirme seus dados cadastrais — FEVRE"
                : "Atualize seus dados cadastrais — FEVRE",
              html,
            }),
          });
          if (res.ok) {
            ok = true;
          } else {
            const data = await res.json().catch(() => ({} as any));
            msg = data?.error || `HTTP ${res.status}`;
          }
        } catch (err: any) {
          msg = err?.message || "Falha de conexão";
        }
      } catch (err: any) {
        // Qualquer erro inesperado ao preparar o email não interrompe o lote
        msg = err?.message || "Erro inesperado ao preparar o envio";
      }

      if (ok) sucesso++;
      else falhas++;

      setSendLog((prev) => [
        ...prev,
        { nome: r.colab.colab_nome_completo || "-", email: r.colab.colab_email || "-", ok, msg },
      ]);

      // Persist log — falhas de persistência não interrompem o loop
      try {
        await supabase.from("email_atualizacao_log").insert({
          prova_id: provaId,
          colaborador_id: r.colab.id,
          email: r.colab.colab_email || "",
          status: ok ? "sucesso" : "falha",
          error_message: ok ? null : msg || null,
          sent_by: user?.id || null,
        });
        if (ok) {
          setJaEnviadosIds((prev) => {
            const next = new Set(prev);
            next.add(r.colab.id);
            return next;
          });
        }
      } catch { /* ignore log persistence errors */ }

      setSendProgress({ done: i + 1, total: elegiveis.length });
      // Intervalo de 1s entre envios para não estressar a API
      if (i < elegiveis.length - 1) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch { /* noop */ }
      }
    }

    setIsSending(false);
    if (falhas === 0) {
      toast.success(`Emails enviados: ${sucesso}`);
    } else {
      toast.warning(`Enviados: ${sucesso}. Falhas: ${falhas}.`);
    }
  };

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
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={isSending || isLoading || elegiveis.length === 0}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <MailCheck className="h-4 w-4 mr-2" />
            )}
            Solicitar Atualização de Dados
            {elegiveis.length > 0 && !isSending && ` (${elegiveis.length})`}
          </Button>
        </div>

        {(isSending || sendLog.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <MailCheck className="h-4 w-4" />
                {isSending ? "Enviando emails..." : "Resultado do Envio"}
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {sendProgress.done} / {sendProgress.total}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress
                value={sendProgress.total ? (sendProgress.done / sendProgress.total) * 100 : 0}
              />
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">
                  ✓ Sucesso: {sendLog.filter((l) => l.ok).length}
                </span>
                <span className="text-red-600">
                  ✗ Falhas: {sendLog.filter((l) => !l.ok).length}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Email</TableHead>
                      <TableHead className="font-semibold">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sendLog.map((l, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {l.ok ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                              Enviado
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                              Falha
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{l.nome}</TableCell>
                        <TableCell>{l.email}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {l.msg || (l.ok ? "OK" : "-")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

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

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (open) setReenviar(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar Atualização de Dados</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Há <strong>{elegiveisTodos.length}</strong> colaborador(es) elegível(is)
                  (com email cadastrado e campos pendentes ou sem primeiro acesso).
                </p>
                {jaReceberamCount > 0 && (
                  <p className="text-sm">
                    <strong>{jaReceberamCount}</strong> já receberam este email anteriormente.
                  </p>
                )}
                {jaReceberamCount > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reenviar}
                      onChange={(e) => setReenviar(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Reenviar também para quem já recebeu
                  </label>
                )}
                <p className="text-sm">
                  Serão enviados <strong>{elegiveis.length}</strong> email(s). Deseja prosseguir?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEnviarAtualizacao} disabled={elegiveis.length === 0}>
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
