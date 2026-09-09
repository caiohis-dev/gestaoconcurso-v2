import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Gestão de Concursos - Documentação",
  description: "Documentação do sistema da FEVRE",
  cleanUrls: true,
  vite: {
    server: {
      fs: {
        allow: ['..']
      }
    }
  },
  themeConfig: {
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Início', link: '/' },
      { text: 'Índice de Estrutura', link: '/estrutura/00-indice' }
    ],
    sidebar: [
      {
        text: 'Visão Geral',
        items: [
          { text: 'Índice da Estrutura', link: '/estrutura/00-indice' },
          { text: 'README (Raiz)', link: '/README_root' },
          { text: 'Regras da IA (CLAUDE)', link: '/CLAUDE_root' },
          { text: 'Backlog', link: '/backlog' },
          { text: 'Banco de Produção', link: '/banco-producao' },
          { text: 'Hospedagem e Deploy', link: '/hospedagem-e-deploy' },
          { text: 'Versionamento', link: '/versionamento' }
        ]
      },
      {
        text: 'Transversais',
        items: [
          { text: 'Arquitetura Geral', link: '/estrutura/transversais/arquitetura-geral' },
          { text: 'Auth e Permissões', link: '/estrutura/transversais/auth-e-permissoes' },
          { text: 'Desenvolvimento Local', link: '/estrutura/transversais/desenvolvimento-local' },
          { text: 'Integrações Externas', link: '/estrutura/transversais/integracoes-externas' },
          { text: 'Invariantes', link: '/estrutura/transversais/invariantes' },
          { text: 'Testes', link: '/estrutura/transversais/testes' }
        ]
      },
      {
        text: 'Módulo: Aplicação de Provas',
        items: [
          { text: 'Contrato do Módulo', link: '/estrutura/modulos/aplicacao-provas/00-modulo' },
          { text: 'Alocação e Funções', link: '/estrutura/modulos/aplicacao-provas/alocacao-e-funcoes' },
          { text: 'Cadastro em Lote', link: '/estrutura/modulos/aplicacao-provas/cadastro-lote' },
          { text: 'Colaboradores', link: '/estrutura/modulos/aplicacao-provas/colaboradores' },
          { text: 'Documentos e Relatórios', link: '/estrutura/modulos/aplicacao-provas/documentos-e-relatorios' },
          { text: 'Ocorrências', link: '/estrutura/modulos/aplicacao-provas/ocorrencias' },
          { text: 'Provas e Unidades', link: '/estrutura/modulos/aplicacao-provas/provas-e-unidades' }
        ]
      },
      {
        text: 'Módulo: Candidatos',
        items: [
          { text: 'Contrato do Módulo', link: '/estrutura/modulos/candidatos/00-modulo' },
          { text: 'Cargos', link: '/estrutura/modulos/candidatos/cargos' }
        ]
      },
      {
        text: 'Módulo: Editais',
        items: [
          { text: 'Contrato do Módulo', link: '/estrutura/modulos/editais/00-modulo' }
        ]
      },
      {
        text: 'Módulo: Alocação de Candidatos',
        items: [
          { text: 'Contrato do Módulo', link: '/estrutura/modulos/alocacao-candidatos/00-modulo' }
        ]
      },
      {
        text: 'Histórico & Análises',
        items: [
          { text: 'README Análises', link: '/analises/README' },
          { text: 'Itens Concluídos', link: '/analises/concluidos/backlog-itens-concluidos' }
        ]
      },
      {
        text: 'Segurança',
        items: [
          { text: 'Regras de Segurança', link: '/seguranca/seguranca' },
          { text: 'Testes de Backlog', link: '/seguranca/testes-backlog' }
        ]
      },
      {
        text: 'Testes e QA',
        items: [
          { text: 'Bateria Autorização (Admin)', link: '/docs_raiz/bateria-create-admin-autorizacao' },
          { text: 'Frontend: Editais', link: '/docs_raiz/teste-frontend-editais' },
          { text: 'Frontend: Auth Colaborador', link: '/docs_raiz/teste-frontend-auth-colaborador' },
          { text: 'Frontend: Módulos', link: '/docs_raiz/teste-frontend-modulos' }
        ]
      }
    ]
  }
})
