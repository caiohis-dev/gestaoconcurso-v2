import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen, userEvent, waitFor } from "@/test/utils";
import ReivindicarAcessoCard from "./ReivindicarAcessoCard";

/**
 * O card da porta única — e, desde 2026-09-19, o caminho pelo qual o colaborador SEM
 * e-mail informa o próprio. Até então esse ramo era um beco sem saída ("procure o
 * coordenador"), e eram 243 pessoas sem caminho nenhum no app.
 *
 * 🔴 O que estes testes guardam NÃO é a segurança da porta — ela não tem prova de posse,
 * por decisão explícita, e quem contém o que dá é o BANCO (ver
 * my_rules/analises/dividas-auth-colaborador.md §5 e docs/bateria-email-autoinformado.sql).
 * Aqui se guarda o que só a tela pode errar: mostrar o formulário no ramo errado, mandar
 * um CPF diferente do que o servidor confirmou, e engolir a recusa do servidor.
 *
 * ⚠️ O mock é do `fetch` GLOBAL, não do client do Supabase: este card monta as chamadas
 * às Edge Functions à mão, com a anon key nos headers (é fluxo sem login). Mockar
 * `supabase.functions.invoke` não pegaria nada.
 */
describe("ReivindicarAcessoCard — informar o próprio e-mail", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** CPF com dígitos verificadores corretos. */
  const CPF = "529.982.247-25";
  const CPF_LIMPO = "52998224725";

  /** Resposta do `reivindicar-acesso` para quem existe, não tem conta e não tem e-mail. */
  const SEM_EMAIL = { existe: true, ja_vinculado: false, email_mascarado: null };

  const respostaDe = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    json: async () => body,
  });

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(respostaDe(SEM_EMAIL));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Filtra por URL em vez de contar chamadas globais — o padrão do CadastroPublico. */
  const chamadasPara = (trecho: string) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes(trecho));

  const chegarNoRamoSemEmail = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/CPF/i), CPF);
    await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));
    await waitFor(() => expect(screen.getByLabelText("Seu e-mail")).toBeInTheDocument());
  };

  it("o ramo 'cadastro sem e-mail' oferece o formulário", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

    await chegarNoRamoSemEmail(user);

    expect(screen.getByLabelText("Repita o e-mail")).toBeInTheDocument();
    // O aviso da irreversibilidade não é decorativo: depois disto só a coordenação troca.
    expect(screen.getByText(/vira o/i)).toBeInTheDocument();
  });

  it("🟢 CONTROLE POSITIVO: 'CPF não encontrado' NÃO oferece formulário", async () => {
    // Quem não tem cadastro não pode ganhar campo de e-mail nenhum — a RPC recusaria, e a
    // tela teria prometido o que o servidor nega. Os dois ramos dividiam o MESMO bloco
    // antes de 2026-09-19; este caso é o que impede que voltem a se juntar.
    fetchMock.mockResolvedValue(
      respostaDe({ existe: false, ja_vinculado: false, email_mascarado: null }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

    await user.type(screen.getByLabelText(/CPF/i), CPF);
    await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));

    await waitFor(() => expect(screen.getByText(/CPF não encontrado/i)).toBeInTheDocument());
    expect(screen.queryByLabelText("Seu e-mail")).not.toBeInTheDocument();
  });

  it("manda para a EF o MESMO CPF que o servidor confirmou", async () => {
    // O CPF confirmado vive num state próprio, separado do input (que está mascarado e a
    // pessoa pode reeditar). Se alguém voltar a ler o input aqui, o e-mail iria parar no
    // cadastro errado — e a essa altura o erro é irreversível para as duas pessoas.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);
    await chegarNoRamoSemEmail(user);

    fetchMock.mockResolvedValue(respostaDe({ ok: true, email_mascarado: "jo***@x.com" }));
    await user.type(screen.getByLabelText("Seu e-mail"), "joao@exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "joao@exemplo.com");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() => expect(chamadasPara("incluir-email-cadastro")).toHaveLength(1));
    const [, init] = chamadasPara("incluir-email-cadastro")[0];
    expect(JSON.parse(init.body)).toEqual({
      cpf: CPF_LIMPO,
      email: "joao@exemplo.com",
      origem: "auth",
    });
  });

  it("e-mails diferentes NÃO chegam à Edge Function", async () => {
    // A dupla digitação existe porque o erro é irreversível: o cadastro passa a ter
    // e-mail, esta porta se fecha, e o link foi para a caixa errada.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);
    await chegarNoRamoSemEmail(user);

    await user.type(screen.getByLabelText("Seu e-mail"), "joao@exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "joao@exemplo.co");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() => expect(screen.getByText(/não são iguais/i)).toBeInTheDocument());
    expect(chamadasPara("incluir-email-cadastro")).toHaveLength(0);
  });

  it("diferença só de caixa ou espaço é ACEITA", async () => {
    // Sem normalizar, "Ana@x.com" e "ana@x.com" seriam recusados sem motivo real — e o
    // servidor compara por lower(trim(...)) de qualquer jeito.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);
    await chegarNoRamoSemEmail(user);

    fetchMock.mockResolvedValue(respostaDe({ ok: true, email_mascarado: "an***@x.com" }));
    await user.type(screen.getByLabelText("Seu e-mail"), "Ana@Exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "  ana@exemplo.com  ");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() => expect(chamadasPara("incluir-email-cadastro")).toHaveLength(1));
  });

  it("a recusa do servidor aparece na tela, com o texto do servidor", async () => {
    // A mensagem do banco é escrita para ser lida (CLAUDE.md §2). Trocá-la por um texto
    // genérico aqui desfaria o trabalho que a RPC teve de explicar o que fazer.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);
    await chegarNoRamoSemEmail(user);

    fetchMock.mockResolvedValue(
      respostaDe(
        { error: "Não é possível usar este e-mail neste cadastro. Procure o coordenador." },
        false,
        409,
      ),
    );
    await user.type(screen.getByLabelText("Seu e-mail"), "ocupado@exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "ocupado@exemplo.com");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() =>
      expect(screen.getByText(/Não é possível usar este e-mail neste cadastro/i)).toBeInTheDocument(),
    );
  });

  it("mostra o e-mail mascarado QUE O SERVIDOR devolveu, não o digitado", async () => {
    // A tela confirma o que foi gravado, não o que foi teclado.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);
    await chegarNoRamoSemEmail(user);

    fetchMock.mockResolvedValue(respostaDe({ ok: true, email_mascarado: "jo***@exemplo.com" }));
    await user.type(screen.getByLabelText("Seu e-mail"), "joao@exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "joao@exemplo.com");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() => expect(screen.getByText("jo***@exemplo.com")).toBeInTheDocument());
  });

  it("🔴 cadastro vinculado com e-mail DIVERGENTE não manda informar o e-mail — manda ao coordenador", async () => {
    // O ciclo que existia até 2026-09-19: pelo CPF a tela dizia "informe o seu e-mail";
    // a pessoa informava o do cadastro; a `recuperar-senha` não achava conta com ele,
    // caía no ramo de estado A (que exige user_id NULL) e respondia "link enviado" sem
    // enviar nada. Medido: 1 pessoa real no banco, e é um coordenador.
    fetchMock.mockResolvedValue(
      respostaDe({
        existe: true,
        ja_vinculado: true,
        email_mascarado: "ab***@ab.com",
        divergente: true,
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

    await user.type(screen.getByLabelText(/CPF/i), CPF);
    await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));

    await waitFor(() => expect(screen.getByText("ab***@ab.com")).toBeInTheDocument());
    expect(screen.getByText(/procure o coordenador/i)).toBeInTheDocument();
    expect(screen.queryByText(/informe esse e-mail neste mesmo campo/i)).not.toBeInTheDocument();
  });

  it("🟢 CONTROLE POSITIVO: vinculado SEM divergência segue mandando informar o e-mail", async () => {
    // O caso comum não pode ter regredido junto: quem tem cadastro e conta no mesmo
    // endereço continua sendo mandado ao caminho do e-mail, que funciona para ele.
    fetchMock.mockResolvedValue(
      respostaDe({
        existe: true,
        ja_vinculado: true,
        email_mascarado: "jo***@exemplo.com",
        divergente: false,
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

    await user.type(screen.getByLabelText(/CPF/i), CPF);
    await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));

    await waitFor(() => expect(screen.getByText("jo***@exemplo.com")).toBeInTheDocument());
    expect(screen.getByText(/informe esse e-mail neste mesmo campo/i)).toBeInTheDocument();
    expect(screen.queryByText(/procure o coordenador/i)).not.toBeInTheDocument();
  });

  it("no /cadastro-publico a origem informada é 'cadastro-publico'", async () => {
    // O card é o mesmo nas duas telas; a origem é o que a trilha usa para dizer por onde
    // o registro entrou. Sem `permitirEmail`, o card está no cadastro público.
    const user = userEvent.setup();
    renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} initialCpf={CPF_LIMPO} />);

    await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));
    await waitFor(() => expect(screen.getByLabelText("Seu e-mail")).toBeInTheDocument());

    fetchMock.mockResolvedValue(respostaDe({ ok: true, email_mascarado: "jo***@x.com" }));
    await user.type(screen.getByLabelText("Seu e-mail"), "joao@exemplo.com");
    await user.type(screen.getByLabelText("Repita o e-mail"), "joao@exemplo.com");
    await user.click(screen.getByRole("button", { name: /usar este e-mail/i }));

    await waitFor(() => expect(chamadasPara("incluir-email-cadastro")).toHaveLength(1));
    const [, init] = chamadasPara("incluir-email-cadastro")[0];
    expect(JSON.parse(init.body).origem).toBe("cadastro-publico");
  });
  describe("excesso de acessos (429)", () => {
    // Decisão do usuário em 2026-09-24: frase fixa, com a janela de `TETOS.acesso`.
    const FRASE = "Sistema com excesso de acessos. Tente novamente após 10 minutos.";

    it("pelo CPF, mostra a frase fixa", async () => {
      fetchMock.mockResolvedValue(respostaDe({ error: "qualquer" }, false, 429));
      const user = userEvent.setup();
      renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

      await user.type(screen.getByLabelText(/CPF/i), CPF);
      await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));

      expect(await screen.findByText(FRASE)).toBeInTheDocument();
    });

    it("pelo e-mail, mostra a MESMA frase — as duas portas dividem o orçamento", async () => {
      fetchMock.mockResolvedValue(respostaDe({ error: "qualquer" }, false, 429));
      const user = userEvent.setup();
      renderWithProviders(<ReivindicarAcessoCard onClose={() => {}} permitirEmail />);

      await user.type(screen.getByLabelText(/CPF/i), "joao@exemplo.com");
      await user.click(screen.getByRole("button", { name: /enviar|continuar|^buscar/i }));

      await waitFor(() => expect(chamadasPara("recuperar-senha")).toHaveLength(1));
      expect(await screen.findByText(FRASE)).toBeInTheDocument();
    });
  });
});
