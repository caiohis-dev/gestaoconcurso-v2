/**
 * Os dados do certame — o editor do capítulo `preambulo`.
 *
 * 🔴 **Ele fecha um buraco que existia desde a fatia 1 (2026-09-16):** as onze colunas de
 * metadados entraram em `editais` naquela migration e `useEdital` ganhou `salvarMetadados`
 * — mas **nenhuma tela chamava essa função**. Os campos existiam no banco e não havia por
 * onde preenchê-los. Sem isto, todo `{{campo:}}` deste grupo resolveria para
 * `[?campo:…]` para sempre, e o linter mandaria o autor a um lugar que não existe.
 *
 * ⚠️ Grava no `blur`, como os outros editores estruturados do módulo (`AcoesAfirmativas`,
 * `QuadroDeTitulos`). Não há botão de salvar aqui de propósito: o "Salvar capítulo" do
 * alto da tela é dos ARTIGOS, e ter dois botões com significados diferentes na mesma tela
 * é o começo de alguém salvar a coisa errada.
 */
import { useEdital, type EditalMetadados } from "@/hooks/useEdital";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Metadados = Partial<Omit<EditalMetadados, "id" | "nome">>;

/** Campo vazio é valor AUSENTE, nunca string vazia — ver o `por()` de `useCamposDoEdital`. */
const texto = (v: string): string | null => (v.trim() === "" ? null : v.trim());
const numero = (v: string): number | null => (v.trim() === "" ? null : Number(v));

function Campo({
  rotulo,
  dica,
  children,
  largo,
}: {
  rotulo: string;
  dica?: string;
  children: React.ReactNode;
  largo?: boolean;
}) {
  return (
    <label className={`text-sm ${largo ? "col-span-full" : ""}`}>
      {rotulo}
      {children}
      {dica && <span className="mt-0.5 block text-xs text-muted-foreground">{dica}</span>}
    </label>
  );
}

type Salvar = (campos: Metadados) => void;

/**
 * ⚠️ Os três cartões são componentes próprios porque, num só, a função passava de 15 de
 * complexidade no lint — cada `??` de valor anulável conta. Extrair é a saída deste repo;
 * elevar o baseline não é (ver `edital-linter.ts`, que já fez a mesma extração).
 */
function CardIdentificacao({ edital, salvar }: { edital: EditalMetadados; salvar: Salvar }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identificação do certame</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Número do edital" dica="Como se escreve no documento — ex.: 004/2026-SMA.">
          <Input
            defaultValue={edital.numero_edital ?? ""}
            onBlur={(e) => salvar({ numero_edital: texto(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Ano">
          <Input
            type="number"
            defaultValue={edital.ano ?? ""}
            onBlur={(e) => salvar({ ano: numero(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Natureza jurídica">
          <Select
            defaultValue={edital.natureza_juridica ?? undefined}
            onValueChange={(v) => salvar({ natureza_juridica: v })}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CONCURSO_PUBLICO">Concurso público</SelectItem>
              <SelectItem value="PROCESSO_SELETIVO">Processo seletivo</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo rotulo="Regime de trabalho" dica="Ex.: estatutário.">
          <Input
            defaultValue={edital.regime_trabalho ?? ""}
            onBlur={(e) => salvar({ regime_trabalho: texto(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Decreto autorizador" largo>
          <Input
            defaultValue={edital.decreto_autorizador ?? ""}
            onBlur={(e) => salvar({ decreto_autorizador: texto(e.target.value) })}
          />
        </Campo>
      </CardContent>
    </Card>
  );
}

function CardQuemRealiza({ edital, salvar }: { edital: EditalMetadados; salvar: Salvar }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem realiza</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Órgão demandante">
          <Input
            defaultValue={edital.orgao_demandante ?? ""}
            onBlur={(e) => salvar({ orgao_demandante: texto(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Entidade executora">
          <Input
            defaultValue={edital.entidade_executora ?? ""}
            onBlur={(e) => salvar({ entidade_executora: texto(e.target.value) })}
          />
        </Campo>
        <Campo
          rotulo="Endereço da entidade executora"
          dica="Sai impresso onde o documento manda entregar envelope — 7 vezes no Edital 004."
          largo
        >
          <Input
            defaultValue={edital.executora_endereco ?? ""}
            onBlur={(e) => salvar({ executora_endereco: texto(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Site oficial do certame" dica="Onde as publicações saem — 9 ocorrências no Edital 004." largo>
          <Input
            defaultValue={edital.site_oficial ?? ""}
            onBlur={(e) => salvar({ site_oficial: texto(e.target.value) })}
          />
        </Campo>
      </CardContent>
    </Card>
  );
}

function CardValidadeEAssinatura({ edital, salvar }: { edital: EditalMetadados; salvar: Salvar }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Validade e assinatura</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Prazo de validade (anos)">
          <Input
            type="number"
            defaultValue={edital.prazo_validade_anos ?? ""}
            onBlur={(e) => salvar({ prazo_validade_anos: numero(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Prorrogável por igual período">
          <div className="pt-2">
            <Switch
              checked={edital.prorrogavel ?? false}
              onCheckedChange={(v) => salvar({ prorrogavel: v })}
              aria-label="Prorrogável por igual período"
            />
          </div>
        </Campo>
        <Campo rotulo="Nome de quem assina">
          <Input
            defaultValue={edital.signatario_nome ?? ""}
            onBlur={(e) => salvar({ signatario_nome: texto(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Cargo de quem assina">
          <Input
            defaultValue={edital.signatario_cargo ?? ""}
            onBlur={(e) => salvar({ signatario_cargo: texto(e.target.value) })}
          />
        </Campo>
        <Campo
          rotulo="Data de publicação"
          dica="O Edital 004 publicou esta linha em branco: “Volta Redonda, ___ de ________ de 2026”."
          largo
        >
          <Input
            type="date"
            defaultValue={edital.data_publicacao ?? ""}
            onBlur={(e) => salvar({ data_publicacao: texto(e.target.value) })}
          />
        </Campo>
      </CardContent>
    </Card>
  );
}

export function DadosDoEdital({ editalId }: { editalId: string }) {
  const { edital, isLoading, salvarMetadados } = useEdital(editalId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os dados do certame…</p>;
  if (!edital) return null;

  return (
    <div className="space-y-4">
      <CardIdentificacao edital={edital} salvar={salvarMetadados} />
      <CardQuemRealiza edital={edital} salvar={salvarMetadados} />
      <CardValidadeEAssinatura edital={edital} salvar={salvarMetadados} />
    </div>
  );
}
