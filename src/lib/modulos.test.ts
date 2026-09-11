import { describe, it, expect } from "vitest";
import {
  MODULOS,
  modulosDoUsuario,
  moduloDaRota,
  type CtxAcesso,
} from "@/lib/modulos";

/**
 * `src/lib/modulos.ts` é a fonte de verdade do sistema multi-módulo: o hub, o header
 * e (futuramente) os guards leem dele. As funções são puras, então estes testes não
 * mockam nada — o que eles guardam são as REGRAS, que hoje só estavam garantidas por
 * comentário no arquivo.
 */

// `useAuth` deriva isAdmin de `role === 'admin' || role === 'superadmin'`, então um
// superadmin chega aqui com isAdmin=true E isSuperAdmin=true. Estas fábricas evitam
// que um teste construa um contexto que o app nunca produziria.
const ctx = (over: Partial<CtxAcesso> = {}): CtxAcesso => ({
  isAdmin: false,
  isSuperAdmin: false,
  isCoordenador: false,
  ...over,
});

const SUPERADMIN = ctx({ isAdmin: true, isSuperAdmin: true });
const ADMIN = ctx({ isAdmin: true });
const COORDENADOR = ctx({ isCoordenador: true });
const USER_PURO = ctx();
const ADMIN_E_COORDENADOR = ctx({ isAdmin: true, isCoordenador: true });

const idsDe = (ms: { id: string }[]) => ms.map((m) => m.id);

describe("modulosDoUsuario", () => {
  it("dá ao superadmin todos os módulos, inclusive os restritos a admin", () => {
    // Editais declara papeis: ['superadmin','admin']. A regra "superadmin ⊇ admin"
    // vive em papeisDoUsuario; se ela cair, o superadmin perde módulos em silêncio.
    expect(idsDe(modulosDoUsuario(SUPERADMIN))).toEqual([
      "aplicacao-provas",
      "editais",
      "candidatos",
      "alocacao-candidatos",
    ]);
  });

  it("dá ao admin os mesmos módulos que ao superadmin", () => {
    expect(idsDe(modulosDoUsuario(ADMIN))).toEqual([
      "aplicacao-provas",
      "editais",
      "candidatos",
      "alocacao-candidatos",
    ]);
  });

  it("dá ao coordenador só Aplicação de Provas — Editais é restrito a admin", () => {
    expect(idsDe(modulosDoUsuario(COORDENADOR))).toEqual(["aplicacao-provas"]);
  });

  it("não dá módulo nenhum a quem só tem o papel `user`", () => {
    // É o estado vazio do hub ("fale com a administração"), não um erro.
    expect(modulosDoUsuario(USER_PURO)).toEqual([]);
  });

  it("não duplica módulo para quem acumula admin e coordenador", () => {
    // Os dois papéis alcançam aplicacao-provas; o filtro usa `some`, não um flatMap.
    const ids = idsDe(modulosDoUsuario(ADMIN_E_COORDENADOR));
    expect(ids).toEqual(["aplicacao-provas", "editais", "candidatos", "alocacao-candidatos"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserva a ordem de MODULOS (é a ordem dos cards no hub)", () => {
    const ordemDoRegistro = idsDe(MODULOS);
    const ordemDoUsuario = idsDe(modulosDoUsuario(SUPERADMIN));
    expect(ordemDoUsuario).toEqual(
      ordemDoRegistro.filter((id) => ordemDoUsuario.includes(id)),
    );
  });
});

describe("moduloDaRota", () => {
  it("casa a rota exata", () => {
    expect(moduloDaRota("/dashboard")?.id).toBe("aplicacao-provas");
    expect(moduloDaRota("/editais")?.id).toBe("editais");
  });

  it("casa sub-rotas, que é como o header sabe em que módulo você está", () => {
    expect(moduloDaRota("/gerenciar-prova/abc-123")?.id).toBe("aplicacao-provas");
    expect(moduloDaRota("/salas-prova/uma-unidade")?.id).toBe("aplicacao-provas");
    expect(
      moduloDaRota("/gerenciar-salas-distribuidas/prova-1/unidade-2")?.id,
    ).toBe("aplicacao-provas");
  });

  it("NÃO deixa /cadastro capturar /cadastro-publico", () => {
    // A regra mais frágil do arquivo. Com `startsWith` cru, /cadastro-publico —
    // que é rota PÚBLICA, fora de qualquer módulo — cairia dentro de Aplicação de
    // Provas e o header passaria a se comportar como se a pessoa estivesse logada
    // num módulo. O matching correto é igualdade OU prefixo seguido de '/'.
    expect(moduloDaRota("/cadastro-publico")).toBeNull();
    expect(moduloDaRota("/cadastro")?.id).toBe("aplicacao-provas");
    expect(moduloDaRota("/cadastro-lote")?.id).toBe("aplicacao-provas");
  });

  it("devolve null no hub e nas rotas de config geral", () => {
    // Config geral (Usuários, Meu Cadastro, Perfil) não é módulo — decisão de
    // desenho. Se passarem a casar, o header perde os links de config.
    expect(moduloDaRota("/")).toBeNull();
    expect(moduloDaRota("/perfil")).toBeNull();
    expect(moduloDaRota("/perfil-colaborador")).toBeNull();
    expect(moduloDaRota("/gerenciar-usuarios")).toBeNull();
  });

  it("devolve null nas rotas públicas de autenticação", () => {
    expect(moduloDaRota("/auth")).toBeNull();
    expect(moduloDaRota("/redefinir-senha")).toBeNull();
  });

  it("devolve null para rota inexistente", () => {
    expect(moduloDaRota("/rota-que-nao-existe")).toBeNull();
  });
});

describe("rotaEntrada", () => {
  const aplicacaoProvas = MODULOS.find((m) => m.id === "aplicacao-provas")!;
  const editais = MODULOS.find((m) => m.id === "editais")!;

  it("leva para /provas, qualquer que seja o papel", () => {
    // ⚠️ Este caso já afirmou `/dashboard` para admin e `/colaboradores` para
    // coordenador — um desvio por papel, trocado em 2026-09-10 a pedido do usuário.
    // O que NÃO mudou é a razão de o desvio ter existido: coordenador não alcança
    // `/dashboard` (guard `["admin"]`), e mandá-lo para lá o jogaria contra o guard da
    // página. `/provas` é `["admin", "coordenador"]`, então serve os dois.
    for (const ctx of [
      { isAdmin: true, isCoordenador: false },
      { isAdmin: false, isCoordenador: true },
      { isAdmin: true, isCoordenador: true }, // superadmin: isAdmin o cobre
    ]) {
      expect(aplicacaoProvas.rotaEntrada(ctx)).toBe("/provas");
    }
  });


  it("leva Editais sempre para /editais, qualquer que seja o papel", () => {
    expect(editais.rotaEntrada({ isAdmin: true, isCoordenador: false })).toBe("/editais");
    expect(editais.rotaEntrada({ isAdmin: false, isCoordenador: true })).toBe("/editais");
  });
});

/**
 * Invariantes do registro. Não testam comportamento de usuário — testam que uma
 * entrada nova em MODULOS não nasce quebrada. É aqui que um módulo futuro mal
 * cadastrado falha, em vez de falhar silenciosamente na UI.
 */
describe("invariantes do registro MODULOS", () => {
  it("tem ids únicos", () => {
    const ids = idsDe(MODULOS);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("garante que todo navLink aponta para dentro do próprio módulo", () => {
    // Um link para fora quebraria o realce do header: clicar nele levaria a uma
    // rota que moduloDaRota atribui a outro módulo (ou a nenhum).
    for (const modulo of MODULOS) {
      for (const link of modulo.navLinks) {
        expect(
          moduloDaRota(link.href)?.id,
          `navLink ${link.href} do módulo ${modulo.id} não pertence a ele`,
        ).toBe(modulo.id);
      }
    }
  });

  it("garante que nenhuma rota pertence a dois módulos", () => {
    const vistos = new Map<string, string>();
    for (const modulo of MODULOS) {
      for (const prefixo of modulo.prefixosRota) {
        expect(
          vistos.has(prefixo),
          `prefixo ${prefixo} está em ${vistos.get(prefixo)} e em ${modulo.id}`,
        ).toBe(false);
        vistos.set(prefixo, modulo.id);
      }
    }
  });

  it("mantém rotas públicas e de config geral fora de prefixosRota", () => {
    // Regra escrita no próprio modulos.ts. Violá-la faz o header tratar uma tela
    // pública como interna ao módulo.
    const proibidas = [
      "/cadastro-publico",
      "/perfil",
      "/perfil-colaborador",
      "/gerenciar-usuarios",
      "/auth",
      "/redefinir-senha",
      "/",
    ];
    for (const modulo of MODULOS) {
      for (const proibida of proibidas) {
        expect(
          modulo.prefixosRota,
          `${proibida} não pode estar em prefixosRota de ${modulo.id}`,
        ).not.toContain(proibida);
      }
    }
  });

  it("declara ao menos um papel e um navLink por módulo", () => {
    for (const modulo of MODULOS) {
      expect(modulo.papeis.length, `${modulo.id} sem papéis`).toBeGreaterThan(0);
      expect(modulo.navLinks.length, `${modulo.id} sem navLinks`).toBeGreaterThan(0);
      expect(modulo.prefixosRota.length, `${modulo.id} sem rotas`).toBeGreaterThan(0);
    }
  });
});
