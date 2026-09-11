import {
  ClipboardList,
  LayoutDashboard,
  Contact,
  FileText,
  ScrollText,
  Building2,
  Users,
  Upload,
  Briefcase,
  DoorOpen,
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
export type ModuloId = 'aplicacao-provas' | 'editais' | 'candidatos' | 'alocacao-candidatos';

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

// Papéis que um link de navegação pode exigir.
// ⚠️ 'colaborador' NÃO é usado por nenhum NavLink hoje — o único que o usava era "Meu
// Cadastro", que saiu do header para o menu do usuário em 2026-08-01 (ver Layout.tsx) e
// não é mais um NavLink. Fica no union por ser um papel de navegação legítimo, não como
// resquício: um item futuro só para colaborador volta a usá-lo sem precisar do tipo mudar.
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
  // 🔵 Passou a ser `/provas` para TODOS em 2026-09-10 (pedido do usuário). Antes era
  // `isAdmin ? '/dashboard' : '/colaboradores'` — um desvio por papel que existia porque
  // coordenador não alcança `/dashboard` (guard `["admin"]`) e cairia no guard da página.
  // `/provas` é guardada por `["admin", "coordenador"]`, então serve os dois e o desvio
  // deixou de ser necessário. ⚠️ Se um dia a entrada voltar a ser uma rota só-admin, o
  // desvio TEM de voltar junto — senão o card do hub manda o coordenador para um muro.
  rotaEntrada: () => '/provas',
  prefixosRota: [
    '/dashboard',
    '/colaboradores',
    '/provas',
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
  ],
  navLinks: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, showFor: ['admin', 'superadmin'] },
    { href: '/colaboradores', label: 'Colaboradores', icon: Contact },
    { href: '/provas', label: 'Provas', icon: FileText, showFor: ['admin', 'superadmin', 'coordenador'] },
    { href: '/unidades-prova', label: 'Unidades de Prova', icon: Building2, showFor: ['admin', 'superadmin'] },
  ],
};

// Editais é um módulo à parte (só admin): a base sobre a qual as provas são criadas.
// Aparece como card próprio no hub, não como link dentro de Aplicação de Provas.
const editais: Modulo = {
  id: 'editais',
  nome: 'Editais',
  descricao: 'Cadastro dos editais dos concursos — a base sobre a qual as provas são criadas.',
  icone: ScrollText,
  papeis: ['superadmin', 'admin'],
  rotaEntrada: () => '/editais',
  prefixosRota: ['/editais'],
  navLinks: [
    { href: '/editais', label: 'Editais', icon: ScrollText, showFor: ['admin', 'superadmin'] },
  ],
};

// Candidatos são os INSCRITOS de um edital — pessoas que fazem a prova, não gente que
// trabalha nela. Por isso é módulo próprio e não uma tela de Aplicação de Provas: aquele
// módulo cuida de quem APLICA a prova (fiscais, coordenadores, apoio). Só admin, como
// Editais, e pela mesma razão reforçada: cada linha aqui é CPF, endereço e telefone de um
// cidadão, e a RLS da tabela fecha a leitura em admin.
const candidatos: Modulo = {
  id: 'candidatos',
  nome: 'Candidatos',
  descricao: 'Os inscritos de cada edital, carregados por importação de planilha.',
  icone: Users,
  papeis: ['superadmin', 'admin'],
  rotaEntrada: () => '/candidatos',
  // Um prefixo só: `moduloDaRota` casa por igualdade OU prefixo + '/', então
  // '/candidatos/importar' e '/candidatos/cargos' já entram por aqui sem precisar ser
  // listadas. ⭐ É por isso que a página de cargos ficou sob `/candidatos/`: uma rota de
  // topo `/cargos` exigiria um prefixo novo, e esquecê-lo faria `moduloDaRota` devolver
  // null — o header perderia o realce e o invariante de `modulos.test.ts` quebraria.
  prefixosRota: ['/candidatos'],
  navLinks: [
    { href: '/candidatos', label: 'Candidatos', icon: Users, showFor: ['admin', 'superadmin'] },
    { href: '/candidatos/importar', label: 'Importar', icon: Upload, showFor: ['admin', 'superadmin'] },
    // O catálogo de cargos é do módulo Candidatos porque cargo só existe para classificar
    // inscrito — ele compõe a identidade do candidato desde a etapa 5.
    { href: '/candidatos/cargos', label: 'Cargos', icon: Briefcase, showFor: ['admin', 'superadmin'] },
  ],
};

// A alocação distribui os INSCRITOS (candidatos) nas salas de uma prova — cruza os dois
// módulos, mas é módulo próprio porque tem ciclo de vida seu (distribuir, ajustar à mão,
// desfazer). Só admin, pela mesma razão de Candidatos: a alocação só faz sentido junto
// do nome do inscrito, e a RLS de `candidatos` e de `candidatos_alocacao` fecha em admin.
const alocacaoCandidatos: Modulo = {
  id: 'alocacao-candidatos',
  nome: 'Alocação de Candidatos',
  descricao: 'A distribuição dos inscritos de um edital nas salas de cada prova.',
  icone: DoorOpen,
  papeis: ['superadmin', 'admin'],
  rotaEntrada: () => '/alocacao-candidatos',
  // Um prefixo só: `/alocacao-candidatos/:provaId` entra pela regra prefixo + '/'.
  prefixosRota: ['/alocacao-candidatos'],
  navLinks: [
    { href: '/alocacao-candidatos', label: 'Alocação', icon: DoorOpen, showFor: ['admin', 'superadmin'] },
  ],
};

export const MODULOS: Modulo[] = [aplicacaoProvas, editais, candidatos, alocacaoCandidatos];

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
