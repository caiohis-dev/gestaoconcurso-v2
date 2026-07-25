import {
  ClipboardList,
  LayoutDashboard,
  Contact,
  FileText,
  ScrollText,
  Building2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registro de módulos — a FONTE DE VERDADE do sistema multi-módulo.
 *
 * O hub (Inicio.tsx), o header (Layout.tsx) e futuras telas leem daqui. Módulo novo
 * = 1 entrada em MODULOS; nunca duplicar a lista de rotas de um módulo em outro lugar.
 *
 * Segurança NÃO mora aqui: este arquivo é UX (o que mostrar/esconder). Quem barra é
 * RLS + as checagens das Edge Functions + os guards de página. Acesso a módulo deriva
 * dos papéis que já existem em user_roles (via useAuth) — sem tabela/enum de módulos.
 */

// Cresce com o sistema. Hoje só existe um módulo.
export type ModuloId = 'aplicacao-provas';

// Papéis de GESTÃO que podem receber um módulo. A dimensão 'colaborador' fica de fora:
// o colaborador puro nunca vê o hub (segue direto para /perfil-colaborador), e config
// geral (Usuários, Meu Cadastro) não é módulo.
export type PapelGestao = 'superadmin' | 'admin' | 'coordenador';

// O que o hub/header conhecem de quem está logado — um subconjunto do useAuth, para
// não acoplar o registro ao hook inteiro.
export interface CtxAcesso {
  isAdmin: boolean;        // true também para superadmin (ver useAuth)
  isSuperAdmin: boolean;
  isCoordenador: boolean;
}

// Papéis que um link de navegação pode exigir. Inclui 'colaborador' porque o header
// mistura links de módulo (só gestão) com config geral ('Meu Cadastro', do colaborador).
export type PapelNav = 'superadmin' | 'admin' | 'coordenador' | 'colaborador';

// Um item do header. Sem showFor = visível para todos que estão dentro do módulo.
export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  showFor?: PapelNav[];
}

export interface Modulo {
  id: ModuloId;
  nome: string;
  descricao: string;             // uma frase para o card do hub
  icone: LucideIcon;
  papeis: PapelGestao[];         // papéis de gestão com acesso
  // Para onde o card do hub leva, por papel (D4). isAdmin cobre superadmin.
  rotaEntrada: (ctx: Pick<CtxAcesso, 'isAdmin' | 'isCoordenador'>) => string;
  // Prefixos de rota que PERTENCEM ao módulo — usados por moduloDaRota (etapa 4).
  // NÃO incluir rotas públicas (/cadastro-publico) nem config geral
  // (/perfil, /perfil-colaborador, /gerenciar-usuarios).
  prefixosRota: string[];
  // Os links que o header mostra quando se está DENTRO deste módulo (etapa 4).
  navLinks: NavLink[];
}

const aplicacaoProvas: Modulo = {
  id: 'aplicacao-provas',
  nome: 'Aplicação de Provas',
  descricao: 'Cadastro de colaboradores, provas, unidades e a operação do dia da prova.',
  icone: ClipboardList,
  papeis: ['superadmin', 'admin', 'coordenador'],
  rotaEntrada: ({ isAdmin }) => (isAdmin ? '/dashboard' : '/colaboradores'),
  prefixosRota: [
    '/dashboard',
    '/colaboradores',
    '/provas',
    '/editais',
    '/unidades-prova',
    '/salas-prova',
    '/gerenciar-prova',
    '/gerenciar-salas-distribuidas',
    '/gerenciar-colaboradores-prova',
    '/ocorrencias-prova',
    '/funcoes-colaboradores',
    '/documentos-impressao',
    '/painel-dados-colaboradores',
    '/cadastro',
    '/cadastro-lote',
    '/treinamento',
  ],
  navLinks: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, showFor: ['admin', 'superadmin'] },
    { href: '/colaboradores', label: 'Colaboradores', icon: Contact },
    { href: '/provas', label: 'Provas', icon: FileText, showFor: ['admin', 'superadmin', 'coordenador'] },
    { href: '/editais', label: 'Editais', icon: ScrollText, showFor: ['admin', 'superadmin'] },
    { href: '/unidades-prova', label: 'Unidades de Prova', icon: Building2, showFor: ['admin', 'superadmin'] },
  ],
};

export const MODULOS: Modulo[] = [aplicacaoProvas];

// Papéis de gestão que o usuário efetivamente tem. superadmin ⊇ admin, então um
// módulo restrito a ['admin'] continua visível para o superadmin.
function papeisDoUsuario(ctx: CtxAcesso): PapelGestao[] {
  const papeis: PapelGestao[] = [];
  if (ctx.isSuperAdmin) papeis.push('superadmin', 'admin');
  else if (ctx.isAdmin) papeis.push('admin');
  if (ctx.isCoordenador) papeis.push('coordenador');
  return papeis;
}

/** Os módulos que o usuário pode ver no hub, na ordem de MODULOS. */
export function modulosDoUsuario(ctx: CtxAcesso): Modulo[] {
  const meus = papeisDoUsuario(ctx);
  return MODULOS.filter((m) => m.papeis.some((p) => meus.includes(p)));
}

/**
 * A que módulo pertence uma rota — usado pelo header para saber "estou dentro de qual
 * módulo?". Matching por IGUALDADE EXATA ou prefixo seguido de '/', nunca startsWith
 * cru: assim '/cadastro' não captura '/cadastro-publico' (que nem é do módulo) nem
 * '/cadastro-lote'. Retorna null fora de qualquer módulo (hub, config geral, público).
 */
export function moduloDaRota(pathname: string): Modulo | null {
  return (
    MODULOS.find((m) =>
      m.prefixosRota.some(
        (prefixo) => pathname === prefixo || pathname.startsWith(prefixo + '/'),
      ),
    ) ?? null
  );
}
