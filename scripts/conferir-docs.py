#!/usr/bin/env python3
"""
Camada 1 — confere as afirmações das docs VIVAS contra a verdade estrutural
(sistema de arquivos + banco). Não lê código de aplicação; não altera nada.

⚠️ Regra central: LINHA DE ANOTAÇÃO HISTÓRICA NÃO É DIVERGÊNCIA.
Um "⚠️ até 30/07 era CASCADE" cita de propósito algo que não existe mais.
Acusá-la produziria ruído e, pior, pressionaria alguém a apagar justamente
o aviso que impede o erro.
"""
import re, os, subprocess, sys
from pathlib import Path

RAIZ = Path("/home/caio-teixeira/dev/gestaoconcurso")
SP = Path(sys.argv[1] if len(sys.argv) > 1 else ".")

DOCS_VIVAS = [
    RAIZ / "CLAUDE.md",
    RAIZ / "my_rules/backlog.md",
    RAIZ / "my_rules/estrutura/00-indice.md",
    *sorted((RAIZ / "my_rules/estrutura/transversais").glob("*.md")),
    *sorted((RAIZ / "my_rules/estrutura/modulos").glob("*/*.md")),
    RAIZ / "my_rules/analises/README.md",
    RAIZ / "my_rules/versionamento.md",
    RAIZ / "my_rules/banco-producao.md",
    RAIZ / "my_rules/hospedagem-e-deploy.md",
]

# --- verdade do banco -------------------------------------------------------
def extrair_do_banco() -> str:
    """Descobre o container do Postgres local e roda o SQL de extração.

    Envolto em `sg docker` porque a sessão de login deste ambiente é anterior à
    inclusão do usuário no grupo `docker` — sem isso vem `permission denied` no
    socket, que parece daemon fora do ar e não é.
    """
    sql = (RAIZ / "scripts/conferir-docs.sql").read_text(encoding="utf-8")
    achar = subprocess.run(
        ["sg", "docker", "-c", "docker ps --filter name=supabase_db_ --format {{.Names}}"],
        capture_output=True, text=True)
    nomes = [n for n in achar.stdout.split() if n]
    if not nomes:
        sys.exit("Banco local não está de pé. Rode: sg docker -c 'npx supabase start'")
    r = subprocess.run(
        ["sg", "docker", "-c", f"docker exec -i {nomes[0]} psql -U postgres -d postgres -t -A"],
        input=sql, capture_output=True, text=True)
    if r.returncode != 0 or "ERROR" in r.stdout:
        sys.exit(f"Falha ao extrair do banco:\n{r.stdout}{r.stderr}")
    return r.stdout

db = {"TABELA": set(), "COLUNA": set(), "POLICY": set(), "TRIGGER": set(),
      "CHECK": set(), "FK": {}, "FUNC": set(), "INDEX": set()}
cache = SP / "db-truth.txt"
bruto = cache.read_text(encoding="utf-8") if (len(sys.argv) > 2 and sys.argv[2] == "--cache"
                                              and cache.exists()) else extrair_do_banco()
for linha in bruto.splitlines():
    p = linha.split("|")
    if p[0] == "FK" and len(p) >= 3:
        db["FK"][p[1]] = p[2]
    elif p[0] in db and len(p) >= 2:
        db[p[0]].add(p[1] if p[0] not in ("POLICY", "TRIGGER") else p[2])

# --- verdade do sistema de arquivos ----------------------------------------
arquivos_repo = set()
for base in ("src", "supabase", "docs", "my_rules", ".claude"):
    d = RAIZ / base
    if d.exists():
        for p in d.rglob("*"):
            if p.is_file():
                arquivos_repo.add(str(p.relative_to(RAIZ)))
for p in RAIZ.iterdir():          # arquivos soltos na raiz
    if p.is_file():
        arquivos_repo.add(p.name)
basenames = {}
for a in arquivos_repo:
    basenames.setdefault(os.path.basename(a), []).append(a)

n_migrations = len(list((RAIZ / "supabase/migrations").glob("*.sql")))

# --- verdade das ROTAS: quem guarda o quê, direto do App.tsx ---------------
# 🔴 Esta checagem existe porque em 31/07 um doc afirmava que "guard é escrito à
# mão, um por arquivo" e mandava copiar o par bounce-por-login + bounce-por-papel
# — o padrão que já falhou 3 vezes e que a centralização de 26/07 eliminou.
# Guard é matéria de segurança: doc errada aqui ensina a reabrir buraco.
app = (RAIZ / "src/App.tsx").read_text(encoding="utf-8")
rotas_reais = {}
for trecho in app.split("<Route ")[1:]:
    trecho = trecho.split("/>")[0]          # limita ao próprio <Route ... />
    mp = re.search(r'path="([^"]+)"', trecho)
    if not mp:
        continue
    mr = re.search(r"papeis=\{\[([^\]]*)\]\}", trecho)
    rotas_reais[mp.group(1)] = (
        tuple(sorted(x.strip().strip('"\'') for x in mr.group(1).split(",") if x.strip()))
        if mr else None)

# --- marcadores que tornam a linha "histórica" (imune) ----------------------
HIST = ("🔵", "🔴 REESCRITO", "~~", "REMOVIDO", "deixou de valer", "não vale mais",
        "NÃO vale mais", "Até 30/07", "até 30/07", "era CASCADE", "O que era",
        "Corrigido em", "corrigido em", "RESOLVIDO", "Estreitado em", "morava em",
        "saiu daqui", "MORREU", "DESCARTAD", "RETIRAD", "OBSOLET", "antes era",
        "estava errad", "afirmava", "dizia", "Este item", "Este aviso", "até 2026",
        "foi movido", "virou ", "passou a ", "deixou de ",
        # narrativa de remoção — a leva que a 1ª rodada deixou passar (10 dos 14 flags)
        "removid", "Removid", "excluíd", "Excluíd", "dropad", "Dropad",
        "foram embora", "não existe mais", "NÃO existe mais", "sumiu", "saiu ",
        "aposentad", "órfão", "❌", "da época", "Naming da", "desde a subetapa")

def historica(linha: str) -> bool:
    return any(m in linha for m in HIST)

achados = []
def add(sev, arq, num, tipo, msg):
    achados.append((sev, arq, num, tipo, msg))

RE_ARQ  = re.compile(r"`([A-Za-z0-9_./-]+\.(?:tsx?|sql|json|md|toml))`")
RE_NUM  = re.compile(r"\*\*(\d{2,4})\*\*\s*(migrations?|testes?|policies|tabelas)", re.I)
RE_TAB  = re.compile(r"`(candidatos|colaboradores|cargos|cargo_apelidos|editais|provas|user_roles|profiles|bancos|unidades_prova|prova_unidades|sala_prova|salas_prova_distribuidas|colaboradores_prova|coordenadores_prova|funcoes_colaboradores|meta_colaboradores_unidade|valores_funcao_prova|ocorrencias_colaborador|email_atualizacao_log|prova_edit_locks|candidatos_importacao)`")
RE_COL  = re.compile(r"`(colab_[a-z_]+|cargo_[a-z_]+|n_inscricao|data_nascimento|hora_nascimento|nome_chave|texto_chave|user_id|prova_id|edital_id)`")
RE_TRG  = re.compile(r"`(check_[a-z_]+|candidatos_[a-z_]+|cargos_[a-z_]+|handle_new_user|generate_codigo_acesso)\b")
RE_FUNC = re.compile(r"`([a-z_]+)\(\)`")

for doc in DOCS_VIVAS:
    if not doc.exists():
        add("ERRO", str(doc.relative_to(RAIZ)), 0, "doc-ausente", "arquivo listado como vivo não existe")
        continue
    rel = str(doc.relative_to(RAIZ))
    linhas = doc.read_text(encoding="utf-8").splitlines()
    for i, linha in enumerate(linhas, 1):
        hist = historica(linha)
        # um "## Título — `coisa_removida`" só se explica na linha seguinte: olhe adiante
        if not hist and linha.startswith("#"):
            hist = any(historica(l) for l in linhas[i:i + 3])

        # 1. caminho/arquivo citado existe?
        for m in RE_ARQ.finditer(linha):
            ref = m.group(1)
            if ref.startswith(("http", "#")) or ref.startswith("."):
                continue                      # ".ui.test.tsx" é sufixo descrito, não arquivo
            alvo = os.path.normpath(os.path.join(os.path.dirname(rel), ref)) if ref.startswith("..") else ref
            existe = (ref in arquivos_repo or alvo in arquivos_repo
                      or os.path.basename(ref) in basenames)
            if not existe and not hist:
                add("ALTO", rel, i, "arquivo-inexistente", f"`{ref}`")

        # 2. tabela citada existe?
        for m in RE_TAB.finditer(linha):
            if m.group(1) not in db["TABELA"] and not hist:
                add("ALTO", rel, i, "tabela-inexistente", f"`{m.group(1)}`")

        # 3. trigger/função citada existe?
        for m in RE_TRG.finditer(linha):
            nome = m.group(1)
            conhecido = any(nome in db[k] for k in
                            ("TRIGGER", "FUNC", "TABELA", "INDEX", "CHECK")) or nome in db["FK"]
            if not conhecido and not hist:
                add("MEDIO", rel, i, "identificador-db-inexistente", f"`{nome}`")

        # 3b. matriz de guards: a linha "| `/rota` | Arquivo | `["papel"]` |"
        mg = re.match(r"\|\s*`(/[^`]*)`\s*\|[^|]*\|\s*`\[([^\]]*)\]`", linha)
        if mg and not hist:
            rota = mg.group(1)
            doc_papeis = tuple(sorted(x.strip().strip('"\'') for x in mg.group(2).split(",") if x.strip()))
            if rota not in rotas_reais:
                add("ALTO", rel, i, "rota-inexistente", f"`{rota}` não está no App.tsx")
            elif rotas_reais[rota] is None:
                add("ALTO", rel, i, "guard-ausente", f"`{rota}`: doc diz {list(doc_papeis)}, a rota NÃO tem RequireAcesso")
            elif rotas_reais[rota] != doc_papeis:
                add("ALTO", rel, i, "guard-divergente",
                    f"`{rota}`: doc diz {list(doc_papeis)}, App.tsx tem {list(rotas_reais[rota])}")

        # 4. contagens
        for m in RE_NUM.finditer(linha):
            val, tipo = int(m.group(1)), m.group(2).lower()
            real = {"migration": n_migrations, "migrations": n_migrations,
                    "tabela": len(db["TABELA"]), "tabelas": len(db["TABELA"]),
                    "policies": len(db["POLICY"])}.get(tipo)
            if real and val != real and not hist:
                add("MEDIO", rel, i, "contagem-divergente", f"diz {val} {tipo}, real = {real}")

# --- relatório --------------------------------------------------------------
ordem = {"ERRO": 0, "ALTO": 1, "MEDIO": 2, "BAIXO": 3}
achados.sort(key=lambda a: (ordem[a[0]], a[1], a[2]))
print(f"# Relatório da Camada 1\n")
print(f"Docs vivas conferidas: **{len(DOCS_VIVAS)}** · fatos estruturais: "
      f"**{sum(len(v) for v in db.values())}** · migrations: **{n_migrations}** · "
      f"rotas no App.tsx: **{len(rotas_reais)}** "
      f"({sum(1 for v in rotas_reais.values() if v)} com guard)\n")
if not achados:
    print("Nenhuma divergência.")
else:
    print(f"**{len(achados)} divergências.**\n")
    print("| Sev | Arquivo:linha | Tipo | Detalhe |")
    print("|---|---|---|---|")
    for sev, arq, num, tipo, msg in achados:
        print(f"| {sev} | `{arq}:{num}` | {tipo} | {msg} |")
