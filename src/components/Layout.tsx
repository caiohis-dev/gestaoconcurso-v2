import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Menu, Home, Settings, Users, UserCircle } from "lucide-react";
import { moduloDaRota, type NavLink } from "@/lib/modulos";
import fevreLogo from "@/assets/fevre-logo.png";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, role, signOut, isAdmin, isSuperAdmin, isCoordenador, isColaborador, isLoggingOut } = useAuth();
  const location = useLocation();
  const moduloAtual = moduloDaRota(location.pathname);

  // Dentro de um módulo: "Início" (volta ao hub) + os links daquele módulo (vindos do
  // registro — fonte de verdade única). No hub, moduloAtual é null e nada disso aparece.
  const linksModulo: NavLink[] = moduloAtual
    ? [{ href: "/", label: "Início", icon: Home }, ...moduloAtual.navLinks]
    : [];

  // Config geral: sempre visível, independe de módulo.
  // "Meu Cadastro" é o caminho dos 12 que são gestor E colaborador até o próprio
  // cadastro. Quem é só colaborador nunca vê o Layout — vai direto para
  // /perfil-colaborador no login.
  const linksConfig: NavLink[] = [
    { href: "/gerenciar-usuarios", label: "Usuários", icon: Users, showFor: ['superadmin'] },
    { href: "/perfil-colaborador", label: "Meu Cadastro", icon: UserCircle, showFor: ['colaborador'] },
  ];

  const navLinks = [...linksModulo, ...linksConfig].filter(link => {
    if (!link.showFor) return true;
    if (isSuperAdmin && link.showFor.includes('superadmin')) return true;
    if (isAdmin && link.showFor.includes('admin')) return true;
    if (isCoordenador && link.showFor.includes('coordenador')) return true;
    if (isColaborador && link.showFor.includes('colaborador')) return true;
    return false;
  });

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3">
              <img src={fevreLogo} alt="FEVRE" className="h-10 w-auto" />
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-foreground leading-tight">FEVRE</h1>
                <p className="text-xs text-muted-foreground">{moduloAtual ? moduloAtual.nome : "Sistema de Cadastro"}</p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link key={link.href} to={link.href}>
                  <Button variant={isActive(link.href) ? "secondary" : "ghost"} size="sm" className="gap-2">
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Button>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant={isSuperAdmin ? "default" : isAdmin ? "default" : isCoordenador ? "outline" : "secondary"} className={isSuperAdmin ? "bg-purple-600" : isAdmin ? "bg-primary" : isCoordenador ? "border-primary text-primary" : ""}>
              {isSuperAdmin ? "Super Admin" : isAdmin ? "Administrador" : isCoordenador ? "Coordenador" : "Usuário"}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/perfil" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    Alterar Cadastro
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isLoggingOut) {
                      signOut();
                    }
                  }} 
                  disabled={isLoggingOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isLoggingOut ? "Saindo..." : "Sair"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {navLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link to={link.href} className="flex items-center gap-2">
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container py-6 animate-fade-in">{children}</main>
    </div>
  );
}
