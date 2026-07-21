import { useState, useMemo, useEffect } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProvas } from "@/hooks/useProvas";
import { useProvaUnidades } from "@/hooks/useProvaUnidades";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Download, Loader2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatDateBR } from "@/lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fevreLogo from "@/assets/fevre-logo.png";

export default function DocumentosImpressao() {
  const { provaId } = useParams<{ provaId: string }>();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { provas, isLoading: isLoadingProvas } = useProvas();
  const { provaUnidades, isLoading: isLoadingProvaUnidades } = useProvaUnidades(provaId || "");
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const { toast } = useToast();

  const [exportingReciboUnidadeId, setExportingReciboUnidadeId] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string>("");

  // Load logo as base64 on mount
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const response = await fetch(fevreLogo);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Erro ao carregar logo:", error);
      }
    };
    loadLogo();
  }, []);

  const prova = provas.find((p) => p.id === provaId);

  // Get header lines from prova data
  const headerLine1 = prova?.prova_cabecalho_linha1 || "FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA";
  const headerLine2 = prova?.prova_cabecalho_linha2 || "Coordenação de Concursos e Processos Seletivos";

  const unidadesVinculadas = useMemo(() => {
    return provaUnidades.map((pu) => {
      const unidade = unidades.find((u) => u.id === pu.unidade_id);
      return {
        provaUnidadeId: pu.id,
        unidadeId: pu.unidade_id,
        sigla: unidade?.unid_sigla?.trim() || "",
        nome: unidade?.unid_nome || "",
      };
    }).sort((a, b) => a.sigla.localeCompare(b.sigla));
  }, [provaUnidades, unidades]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (!isLoadingProvas && !prova) {
    return <Navigate to="/provas" replace />;
  }

  if (!prova?.prova_finalizada) {
    return <Navigate to={`/gerenciar-prova/${provaId}`} replace />;
  }

  const isLoading = isLoadingProvas || isLoadingProvaUnidades || isLoadingUnidades;

  const gerarReciboPagamento = async (provaUnidadeId: string, siglaUnidade: string, nomeUnidade: string) => {
    if (!prova) return;

    setExportingReciboUnidadeId(provaUnidadeId);
    try {
      // Fetch collaborators with payment info
      const { data: colaboradoresProva, error } = await supabase
        .from('colaboradores_prova')
        .select(`
          id,
          valor_pagamento,
          funcao_id,
          colaboradores (colab_nome_completo, colab_cpf, colab_chave_pix),
          funcoes_colaboradores (cargo_nome)
        `)
        .eq('prova_unidade_id', provaUnidadeId);

      if (error) throw error;

      // Fetch payment values per function for this exam
      const { data: valoresFuncao } = await supabase
        .from('valores_funcao_prova')
        .select('funcao_id, valor_pagamento')
        .eq('prova_id', prova.id);

      // Create a map of funcao_id -> valor_pagamento
      const valoresPorFuncao: Record<string, number> = {};
      valoresFuncao?.forEach(vf => {
        if (vf.funcao_id) {
          valoresPorFuncao[vf.funcao_id] = vf.valor_pagamento;
        }
      });

      // Fetch Coordenador Geral for this unit
      let coordenadorGeralNome = "";
      const { data: coordenadorData } = await supabase
        .from('colaboradores_prova')
        .select(`
          colaboradores (colab_nome_completo),
          funcoes_colaboradores!inner (cargo_nome)
        `)
        .eq('prova_unidade_id', provaUnidadeId)
        .eq('funcoes_colaboradores.cargo_nome', 'Coordenador Geral')
        .limit(1);

      if (coordenadorData && coordenadorData.length > 0) {
        coordenadorGeralNome = coordenadorData[0].colaboradores?.colab_nome_completo?.toUpperCase() || "";
      }

      if (!colaboradoresProva || colaboradoresProva.length === 0) {
        toast({
          title: "Nenhum colaborador",
          description: `Não há colaboradores cadastrados para a unidade ${siglaUnidade}.`,
          variant: "destructive",
        });
        return;
      }

      // Group by function
      const groupedByFuncao: Record<string, typeof colaboradoresProva> = {};
      colaboradoresProva.forEach((cp) => {
        const funcao = cp.funcoes_colaboradores?.cargo_nome || "Sem Função";
        if (!groupedByFuncao[funcao]) {
          groupedByFuncao[funcao] = [];
        }
        groupedByFuncao[funcao].push(cp);
      });

      // Sort functions alphabetically and sort collaborators within each function
      const sortedFuncoes = Object.keys(groupedByFuncao).sort((a, b) => a.localeCompare(b));
      sortedFuncoes.forEach((funcao) => {
        groupedByFuncao[funcao].sort((a, b) => {
          const nomeA = a.colaboradores?.colab_nome_completo || "";
          const nomeB = b.colaboradores?.colab_nome_completo || "";
          return nomeA.localeCompare(nomeB);
        });
      });

      const edital = prova.prova_edital?.trim() || "PROVA";
      
      // Format exam date for title
      const dataProvaFormatada = formatDateBR(prova.prova_data) || "";
      
      // Create PDF - Landscape orientation
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 15;
      const marginRight = 15;

      // Function to format currency
      const formatCurrency = (value: number | null) => {
        if (value === null || value === undefined) return "R$ 0,00";
        return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      };

      // Function to add header to each page
      const addHeader = (funcaoName: string) => {
        let yPos = 15;

        // Add logo on the left
        if (logoBase64) {
          doc.addImage(logoBase64, "PNG", marginLeft, yPos, 20, 20);
        }

        // Header text - centered (Times New Roman, size 11)
        doc.setFont("times", "normal");
        doc.setFontSize(11);

        const headerCenterX = pageWidth / 2;

        // Line 1 - From prova registration
        doc.text(headerLine1, headerCenterX, yPos + 4, { align: "center" });
        
        // Line 2 - From prova registration
        doc.text(headerLine2, headerCenterX, yPos + 9, { align: "center" });
        
        // Line 3 - Edital
        doc.text(edital, headerCenterX, yPos + 14, { align: "center" });
        
        // Line 4 - Unidade
        doc.text(nomeUnidade, headerCenterX, yPos + 19, { align: "center" });

        // Title line - Bold, centered: "RECIBO DE PAGAMENTO DE [FUNÇÃO] - [DATA]"
        doc.setFont("times", "bold");
        const titleText = `LISTA DE PRESENÇA - ${funcaoName.toUpperCase()} ${dataProvaFormatada ? `- ${dataProvaFormatada}` : ""}`;
        doc.text(titleText, headerCenterX, yPos + 28, { align: "center" });

        // Coordenador Geral line - only show if name is not empty
        if (coordenadorGeralNome.trim()) {
          doc.setFont("times", "normal");
          const coordenadorText = `COORDENADOR GERAL: ${coordenadorGeralNome}`;
          doc.text(coordenadorText, marginLeft, yPos + 35);
        }

        return yPos + 42; // Return Y position after header
      };

      // Fixed 15 rows per page for payment receipt
      const rowsPerPage = 15;
      const rowHeight = 8;
      const tableHeaderHeight = 8;
      const footerHeight = 15;
      const fontSize = 9;

      let isFirstPage = true;

      // Generate pages for each function group
      for (const funcao of sortedFuncoes) {
        const funcaoColaboradores = groupedByFuncao[funcao];
        
        // Calculate pages for this function
        const totalPagesForFuncao = Math.ceil(funcaoColaboradores.length / rowsPerPage);

        for (let page = 0; page < totalPagesForFuncao; page++) {
          if (!isFirstPage) {
            doc.addPage();
          }
          isFirstPage = false;

          // Add header with function name
          const startY = addHeader(funcao);

          // Get rows for this page
          const startIndex = page * rowsPerPage;
          const endIndex = Math.min(startIndex + rowsPerPage, funcaoColaboradores.length);
          const pageRows = funcaoColaboradores.slice(startIndex, endIndex);

          // Prepare table data with sequential numbering within this function group
          const tableData = pageRows.map((cp, idx) => {
            // Use valor_pagamento from colaboradores_prova if set, otherwise get from valores_funcao_prova
            const valorPagamento = cp.valor_pagamento || (cp.funcao_id ? valoresPorFuncao[cp.funcao_id] : null) || 0;
            return [
              (startIndex + idx + 1).toString(),
              cp.colaboradores?.colab_nome_completo || "",
              cp.funcoes_colaboradores?.cargo_nome || "",
              cp.colaboradores?.colab_chave_pix || "",
              formatCurrency(valorPagamento),
              "",
            ];
          });

          // Add table
          autoTable(doc, {
            startY: startY,
            head: [["Nº", "Nome", "Função", "PIX", "Valor", "Assinatura"]],
            body: tableData,
            theme: "grid",
            margin: { left: marginLeft, right: marginRight, bottom: footerHeight },
            styles: {
              font: "times",
              fontSize: fontSize,
              cellPadding: 2,
              valign: "middle",
              lineColor: [0, 0, 0],
              lineWidth: 0.3,
              overflow: 'hidden',
              cellWidth: 'wrap',
              minCellHeight: rowHeight,
            },
            headStyles: {
              fillColor: [255, 255, 255],
              textColor: [0, 0, 0],
              fontStyle: "bold",
              halign: "center",
              minCellHeight: tableHeaderHeight,
            },
            columnStyles: {
              0: { halign: "center", cellWidth: 12 },
              1: { halign: "left", cellWidth: 80, overflow: 'hidden' },
              2: { halign: "left", cellWidth: 45, overflow: 'hidden' },
              3: { halign: "left", cellWidth: 50, overflow: 'hidden' },
              4: { halign: "right", cellWidth: 30 },
              5: { halign: "center", cellWidth: "auto" },
            },
            rowPageBreak: 'avoid',
            pageBreak: 'avoid',
          });

          // Add footer with page numbers for this function
          doc.setFont("times", "normal");
          doc.setFontSize(11);
          const footerText = `Página ${page + 1} de ${totalPagesForFuncao}`;
          doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: "center" });
        }
      }

      // ===== Página final: Substituições (conteúdo estático) =====
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      const subsStartY = addHeader("SUBSTITUIÇÕES");

      const subsRows = Array.from({ length: 15 }, () => ["", "", "", "", ""]);

      autoTable(doc, {
        startY: subsStartY,
        head: [["Nome Completo", "Data de Nascimento", "CPF", "Telefone", "Assinatura"]],
        body: subsRows,
        theme: "grid",
        margin: { left: marginLeft, right: marginRight, bottom: footerHeight },
        styles: {
          font: "times",
          fontSize: fontSize,
          cellPadding: 2,
          valign: "middle",
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
          overflow: 'hidden',
          cellWidth: 'wrap',
          minCellHeight: rowHeight,
        },
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          minCellHeight: tableHeaderHeight,
        },
        columnStyles: {
          0: { halign: "left", cellWidth: 80, overflow: 'hidden' },
          1: { halign: "center", cellWidth: 35 },
          2: { halign: "center", cellWidth: 35 },
          3: { halign: "center", cellWidth: 35 },
          4: { halign: "left", cellWidth: "auto", overflow: 'hidden' },
        },
        rowPageBreak: 'avoid',
        pageBreak: 'avoid',
      });

      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.text("Página 1 de 1", pageWidth / 2, pageHeight - 10, { align: "center" });



      // Generate filename with timestamp
      const timestamp = format(new Date(), "dd-MM-yyyy HH-mm-ss");
      const fileName = `${edital} - ${siglaUnidade} LISTA DE PRESENÇA Imp em ${timestamp}.pdf`;

      // Save PDF
      doc.save(fileName);

      toast({
        title: "Exportação concluída",
        description: `Lista de presença de ${siglaUnidade} exportada com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível gerar a lista de presença.",
        variant: "destructive",
      });
    } finally {
      setExportingReciboUnidadeId(null);
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground">Documentos de Impressão</h1>
            <p className="text-muted-foreground">
              {prova?.prova_edital?.trim()}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Eye className="h-4 w-4" />
              Pré-visualização de Cabeçalho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <img 
                    src={fevreLogo} 
                    alt="FEVRE Logo" 
                    className="w-16 h-16 object-contain"
                  />
                </div>
                <div className="flex-1 text-center font-serif text-sm space-y-1">
                  <p className="font-normal">{headerLine1}</p>
                  <p className="font-normal">{headerLine2}</p>
                  <p className="font-normal">{prova?.prova_edital?.trim() || "EDITAL"}</p>
                  <p className="font-normal">{"{UNIDADE DE PROVA}"}</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              As informações acima podem ser alteradas no cadastro do Edital.
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : unidadesVinculadas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">Nenhuma unidade vinculada a esta prova.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {unidadesVinculadas.map((unidade) => (
              <Card key={unidade.provaUnidadeId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" />
                    <span className="font-bold">{unidade.sigla}</span>
                    <span className="text-muted-foreground font-normal">-</span>
                    <span className="font-normal truncate">{unidade.nome}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => gerarReciboPagamento(
                      unidade.provaUnidadeId,
                      unidade.sigla,
                      unidade.nome
                    )}
                    disabled={exportingReciboUnidadeId === unidade.provaUnidadeId}
                  >
                    {exportingReciboUnidadeId === unidade.provaUnidadeId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Lista de Presença
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
