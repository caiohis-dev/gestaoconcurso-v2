# Roadmap: Wiki de Documentação (VitePress)

> **Objetivo:** Criar uma interface web rica, navegável e amigável para humanos (Sidebar, Busca Global, Dark Mode) para ler a documentação do projeto, mantendo **estrita compatibilidade** com o script de auditoria `npm run docs:conferir` e com o acesso direto por IAs. Nenhuma documentação sairá de `my_rules/`.

## Etapa 1: Infraestrutura e Configuração Base
*Objetivo: Trazer o gerador de site estático (VitePress) para o repositório de forma limpa, sem poluir os arquivos da aplicação principal.*

- [ ] **Subetapa 1A: Instalação das dependências**
  - Instalar `vitepress` como `devDependency`.
- [ ] **Subetapa 1B: Estruturação de pastas**
  - Criar o diretório `my_rules/.vitepress/` para isolar toda a configuração visual.
- [ ] **Subetapa 1C: Scripts NPM**
  - Adicionar scripts no `package.json` raiz (ex: `"docs:dev": "vitepress dev my_rules"`, `"docs:build": "vitepress build my_rules"`).
- [ ] **Subetapa 1D: Gitignore**
  - Adicionar o diretório de saída do build (`my_rules/.vitepress/dist`) e o cache (`my_rules/.vitepress/cache`) ao `.gitignore`.

## Etapa 2: Navegação e UX (Apresentação)
*Objetivo: Mapear a leitura seca do `.md` em uma experiência de navegação hierárquica e fluida.*

- [ ] **Subetapa 2A: Configuração Principal (`config.ts`)**
  - Definir metadados do site (título "Gestão de Concursos - Documentação", lang "pt-BR").
- [ ] **Subetapa 2B: Sidebar (Menu Lateral)**
  - Configurar a Sidebar para refletir a taxonomia estrita do projeto:
    - *Visão Geral* (Arquitetura, Transversais)
    - *Módulos* (Aplicação de Provas, Editais, Candidatos, etc.)
    - *Análises e Roadmaps*
- [ ] **Subetapa 2C: Homepage (Página Inicial)**
  - Criar um arquivo `my_rules/index.md` aproveitando o layout *home* do VitePress.
  - *Nota técnica:* Este arquivo servirá como as "boas-vindas" para humanos. A IA continuará lendo o `00-indice.md` sem interferência.
- [ ] **Subetapa 2D: Habilitar Busca Global**
  - Ativar o plugin de `local search` do VitePress para permitir encontrar termos instantaneamente em toda a base.

## Etapa 3: Tratamento de Conteúdo e Compatibilidade
*Objetivo: Garantir que as convenções atuais de escrita (que são otimizadas para IA e revisão em texto puro) renderizem de forma bonita para o humano.*

- [ ] **Subetapa 3A: Tratamento de Alertas e Convenções**
  - Avaliar como a convenção `> ⚠️` e `> 🔵` atual renderiza no VitePress.
  - Se necessário, configurar extensões de Markdown no VitePress para converter os blockquotes atuais em `Custom Containers` (caixas coloridas de "Warning", "Info", "Tip") de forma automática, **sem** obrigar a alterar o código-fonte dos `.md` atuais.
- [ ] **Subetapa 3B: Verificação da Auditoria**
  - Rodar `npm run docs:conferir` para provar definitivamente que a adição do Wiki não quebrou nem alterou as regras de validação estrutural do repositório.

## Etapa 4: Deploy e Hospedagem
*Objetivo: Disponibilizar o Wiki em um endereço persistente.*

- [ ] **Subetapa 4A: Ajuste do Pipeline / Scripts de Deploy**
  - No `setup-deploy.sh` (ou roteiro de CI se adotado), adicionar o passo de execução do `npm run docs:build`.
- [ ] **Subetapa 4B: Configuração do Nginx**
  - No servidor de produção, criar um server block (`sites-available/docs.fevre.online`) apontando para o *root* em `my_rules/.vitepress/dist`.
- [ ] **Subetapa 4C: Certificado TLS**
  - Rodar o `certbot` para o subdomínio `docs.fevre.online`.

---

> **Critério de Sucesso Final:** 
> 1. Ter um site `docs.fevre.online` com menu lateral rápido, busca e dark-mode.
> 2. O conteúdo deste site ser 100% derivado dos arquivos `.md` inalterados, preservando o valor do repo para a Inteligência Artificial.
