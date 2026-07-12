import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  Building2, 
  FileText, 
  ClipboardList, 
  Settings, 
  UserPlus, 
  DoorOpen,
  DollarSign,
  Download,
  Lock,
  Unlock,
  UserCheck,
  Shield,
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  Layers,
  Target,
  FileSpreadsheet,
  Printer
} from "lucide-react";
import fevreLogo from "@/assets/fevre-logo.png";
import { motion, type Easing } from "framer-motion";

// Animation variants
const easeOut: Easing = [0.0, 0.0, 0.2, 1];
const easeInOut: Easing = [0.4, 0.0, 0.2, 1];

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easeOut }
  }
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.5, ease: easeOut }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.4, ease: easeOut }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: easeOut }
  }
};

const cardHover = {
  rest: { scale: 1 },
  hover: { 
    scale: 1.02,
    transition: { duration: 0.2, ease: easeInOut }
  }
};

export default function Treinamento() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header 
        className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-lg"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-6">
            <motion.div 
              className="bg-white p-2 rounded-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <img src={fevreLogo} alt="FEVRE Logo" className="h-14" />
            </motion.div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Sistema de Cadastro de Colaboradores do DCIT</h1>
              <p className="text-lg text-primary-foreground/80 flex items-center gap-2 mt-1">
                <BookOpen className="h-5 w-5" />
                Manual de Treinamento
              </p>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Introdução */}
        <motion.section 
          className="mb-16"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <Card className="border-2 border-primary/20 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-8 md:p-12">
              <div className="flex items-start gap-6">
                <motion.div 
                  className="hidden md:flex bg-primary/10 p-4 rounded-full"
                  whileHover={{ rotate: 10, scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                >
                  <GraduationCap className="h-16 w-16 text-primary" />
                </motion.div>
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Bem-vindo ao Sistema</h2>
                  <p className="text-lg md:text-xl text-foreground leading-relaxed">
                    O <strong className="text-primary">Sistema de Cadastro de Colaboradores do DCIT</strong> tem como função automatizar 
                    toda a organização do dia de prova. Com ele, é possível gerenciar locais de aplicação, 
                    colaboradores, alocações e documentos necessários para a realização das provas.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </motion.section>

        {/* Apresentação Geral */}
        <motion.section 
          className="mb-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeInUp}
        >
          <div className="flex items-center gap-4 mb-8">
            <motion.div 
              className="bg-primary p-3 rounded-xl"
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <Settings className="h-8 w-8 text-primary-foreground" />
            </motion.div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">Apresentação Geral do Sistema</h2>
          </div>
          
          <Card className="shadow-lg">
            <CardContent className="pt-8 pb-8">
              <p className="text-lg text-foreground leading-relaxed mb-8">
                O sistema é dividido em duas grandes áreas:
              </p>
              <motion.div 
                className="grid gap-6 md:grid-cols-2"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <motion.div 
                  className="p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/15 border-2 border-primary/20"
                  variants={staggerItem}
                  whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-primary p-3 rounded-lg">
                      <Building2 className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <h3 className="font-bold text-2xl text-foreground">Parâmetros Gerais</h3>
                  </div>
                  <p className="text-muted-foreground text-lg">
                    Itens que podem ser utilizados para qualquer prova: locais e pessoas.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium">Unidades</span>
                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium">Salas</span>
                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium">Colaboradores</span>
                    <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium">Funções</span>
                  </div>
                </motion.div>
                <motion.div 
                  className="p-6 rounded-xl bg-gradient-to-br from-secondary/5 to-secondary/15 border-2 border-secondary/20"
                  variants={staggerItem}
                  whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-secondary p-3 rounded-lg">
                      <ClipboardList className="h-8 w-8 text-secondary-foreground" />
                    </div>
                    <h3 className="font-bold text-2xl text-foreground">Configurações de Prova</h3>
                  </div>
                  <p className="text-muted-foreground text-lg">
                    Configurações específicas de cada prova: unidades, colaboradores e valores.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="bg-secondary/20 text-secondary px-3 py-1 rounded-full text-sm font-medium">Provas</span>
                    <span className="bg-secondary/20 text-secondary px-3 py-1 rounded-full text-sm font-medium">Alocações</span>
                    <span className="bg-secondary/20 text-secondary px-3 py-1 rounded-full text-sm font-medium">Pagamentos</span>
                  </div>
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Seção: Parâmetros Gerais */}
        <section className="mb-20 relative">
          {/* Barra de seção */}
          <motion.div 
            className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-primary to-primary/50 rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ originY: 0 }}
          />
          
          <div className="pl-8">
            <motion.div 
              className="flex items-center gap-4 mb-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              <motion.div 
                className="bg-primary p-4 rounded-xl shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <Building2 className="h-10 w-10 text-primary-foreground" />
              </motion.div>
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Parâmetros Gerais</h2>
                <p className="text-lg text-muted-foreground mt-1">Configurações base para todas as provas</p>
              </div>
            </motion.div>
            
            <motion.div 
              className="bg-muted/50 rounded-2xl p-6 mb-10"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-lg text-foreground leading-relaxed">
                São os itens que poderão ser utilizados para qualquer prova. Basicamente, estamos falando do 
                que permite que uma prova aconteça: <strong className="text-primary">lugares</strong> e <strong className="text-primary">pessoas</strong>.
              </p>
            </motion.div>

            {/* Unidades de Prova */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-secondary overflow-hidden">
                  <CardHeader className="bg-secondary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-secondary p-2.5 rounded-lg">
                        <Building2 className="h-6 w-6 text-secondary-foreground" />
                      </div>
                      Locais de Prova (Unidades)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Cada escola onde pode acontecer uma prova será cadastrada. O cadastro geral deve ser 
                      feito com a <strong>capacidade máxima</strong> da escola. Depois será possível utilizar 
                      um número menor de salas ou utilizar salas específicas com número de candidatos menor 
                      que o total da sala.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <Layers className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Estrutura de uma Unidade</h4>
                      </div>
                      <motion.div 
                        className="grid grid-cols-3 gap-4 text-center"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.div className="bg-card p-4 rounded-lg shadow" variants={staggerItem} whileHover={{ y: -5 }}>
                          <Building2 className="h-8 w-8 mx-auto text-secondary mb-2" />
                          <p className="font-semibold">Nome</p>
                          <p className="text-sm text-muted-foreground">Escola Municipal XYZ</p>
                        </motion.div>
                        <motion.div className="bg-card p-4 rounded-lg shadow" variants={staggerItem} whileHover={{ y: -5 }}>
                          <FileText className="h-8 w-8 mx-auto text-secondary mb-2" />
                          <p className="font-semibold">Sigla</p>
                          <p className="text-sm text-muted-foreground">EMXYZ</p>
                        </motion.div>
                        <motion.div className="bg-card p-4 rounded-lg shadow" variants={staggerItem} whileHover={{ y: -5 }}>
                          <Layers className="h-8 w-8 mx-auto text-secondary mb-2" />
                          <p className="font-semibold">Andares</p>
                          <p className="text-sm text-muted-foreground">3 andares</p>
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Plus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Nova Unidade:</strong> Cadastrar uma nova escola/local de prova informando nome, sigla e número de andares.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <DoorOpen className="h-5 w-5 mt-0.5 text-secondary flex-shrink-0" />
                          <span><strong>Gerenciar Salas:</strong> Acessar o cadastro de salas da unidade.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar:</strong> Alterar informações de uma unidade já cadastrada.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Excluir:</strong> Remover uma unidade (somente se não estiver vinculada a provas).</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Salas de Prova */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-secondary overflow-hidden">
                  <CardHeader className="bg-secondary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-secondary p-2.5 rounded-lg">
                        <DoorOpen className="h-6 w-6 text-secondary-foreground" />
                      </div>
                      Salas de Prova
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Cada unidade de prova possui suas próprias salas. As salas são cadastradas com número, 
                      capacidade e andar.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <DoorOpen className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Exemplo de Salas</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-card">
                              <th className="p-3 text-left font-semibold">Nº Sala</th>
                              <th className="p-3 text-left font-semibold">Andar</th>
                              <th className="p-3 text-left font-semibold">Capacidade</th>
                            </tr>
                          </thead>
                          <tbody>
                            <motion.tr className="border-b" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                              <td className="p-3">101</td>
                              <td className="p-3">1º</td>
                              <td className="p-3">30 candidatos</td>
                            </motion.tr>
                            <motion.tr className="border-b" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                              <td className="p-3">102</td>
                              <td className="p-3">1º</td>
                              <td className="p-3">25 candidatos</td>
                            </motion.tr>
                            <motion.tr initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                              <td className="p-3">201</td>
                              <td className="p-3">2º</td>
                              <td className="p-3">35 candidatos</td>
                            </motion.tr>
                          </tbody>
                        </table>
                      </div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Plus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Nova Sala:</strong> Cadastrar uma ou mais salas de uma vez, informando quantidade, capacidade e andar.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar:</strong> Alterar informações de uma sala (número, descrição, capacidade e andar).</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Excluir:</strong> Remover uma sala.</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Colaboradores */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-secondary overflow-hidden">
                  <CardHeader className="bg-secondary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-secondary p-2.5 rounded-lg">
                        <Users className="h-6 w-6 text-secondary-foreground" />
                      </div>
                      Colaboradores
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Cada pessoa que trabalha nas provas será cadastrada com todos os seus dados pessoais, 
                      tanto os dados utilizados no dia da prova quanto os dados utilizados pelos setores de 
                      <strong> contabilidade, RH e financeiro</strong>.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <Users className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Dados do Colaborador</h4>
                      </div>
                      <motion.div 
                        className="grid grid-cols-2 md:grid-cols-4 gap-3"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.div className="bg-card p-3 rounded-lg text-center" variants={staggerItem} whileHover={{ y: -3 }}>
                          <p className="text-xs text-muted-foreground">Nome</p>
                          <p className="font-medium text-sm">Identificação</p>
                        </motion.div>
                        <motion.div className="bg-card p-3 rounded-lg text-center" variants={staggerItem} whileHover={{ y: -3 }}>
                          <p className="text-xs text-muted-foreground">CPF</p>
                          <p className="font-medium text-sm">Documentação</p>
                        </motion.div>
                        <motion.div className="bg-card p-3 rounded-lg text-center" variants={staggerItem} whileHover={{ y: -3 }}>
                          <p className="text-xs text-muted-foreground">Endereço</p>
                          <p className="font-medium text-sm">Localização</p>
                        </motion.div>
                        <motion.div className="bg-card p-3 rounded-lg text-center" variants={staggerItem} whileHover={{ y: -3 }}>
                          <p className="text-xs text-muted-foreground">PIS/Chave PIX</p>
                          <p className="font-medium text-sm">Pagamento</p>
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <UserPlus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Novo Colaborador:</strong> Cadastrar um novo colaborador com todos os dados pessoais.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar:</strong> Alterar informações de um colaborador.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Excluir:</strong> Remover um colaborador (somente se não estiver alocado em provas).</span>
                        </motion.li>
                      </ul>
                    </motion.div>

                    <motion.div 
                      className="bg-secondary/10 rounded-xl p-6 border border-secondary/30"
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-secondary" />
                        Cadastro em Lote
                      </h4>
                      <p className="text-base text-foreground">
                        É possível importar colaboradores em lote através de planilha Excel. O sistema permite 
                        mapear as colunas da planilha para os campos do sistema e processar os registros automaticamente.
                      </p>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Funções de Colaboradores */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-secondary overflow-hidden">
                  <CardHeader className="bg-secondary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-secondary p-2.5 rounded-lg">
                        <ClipboardList className="h-6 w-6 text-secondary-foreground" />
                      </div>
                      Funções de Colaboradores
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Define as funções disponíveis para os colaboradores nas provas (Ex: Fiscal, Coordenador, 
                      Auxiliar de Coordenação, etc.). Cada função possui um <strong>código CBO</strong> para 
                      fins de exportação para o eSocial.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <ClipboardList className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Exemplos de Funções</h4>
                      </div>
                      <motion.div 
                        className="flex flex-wrap gap-3"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.span 
                          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium"
                          variants={staggerItem}
                          whileHover={{ scale: 1.05 }}
                        >
                          Coordenador Geral
                        </motion.span>
                        <motion.span 
                          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg font-medium"
                          variants={staggerItem}
                          whileHover={{ scale: 1.05 }}
                        >
                          Auxiliar de Coordenação
                        </motion.span>
                        <motion.span 
                          className="bg-primary/80 text-primary-foreground px-4 py-2 rounded-lg font-medium"
                          variants={staggerItem}
                          whileHover={{ scale: 1.05 }}
                        >
                          Fiscal
                        </motion.span>
                        <motion.span 
                          className="bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-lg font-medium"
                          variants={staggerItem}
                          whileHover={{ scale: 1.05 }}
                        >
                          Apoio
                        </motion.span>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Plus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Nova Função:</strong> Cadastrar uma nova função com nome, código CBO e descrição.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar:</strong> Alterar informações de uma função (bloqueado se já associada a provas).</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Excluir:</strong> Remover uma função (bloqueado se já associada a provas).</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Seção: Configurações de Prova */}
        <section className="mb-20 relative">
          {/* Barra de seção */}
          <motion.div 
            className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-secondary to-secondary/50 rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ originY: 0 }}
          />
          
          <div className="pl-8">
            <motion.div 
              className="flex items-center gap-4 mb-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              <motion.div 
                className="bg-secondary p-4 rounded-xl shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <ClipboardList className="h-10 w-10 text-secondary-foreground" />
              </motion.div>
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Configurações de Prova</h2>
                <p className="text-lg text-muted-foreground mt-1">Configurações específicas de cada prova</p>
              </div>
            </motion.div>
            
            <motion.div 
              className="bg-muted/50 rounded-2xl p-6 mb-10"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-lg text-foreground leading-relaxed">
                Quando chegamos nessa etapa, os Parâmetros Gerais já devem estar configurados. Aqui 
                configuramos cada uma das provas. As provas são compostas pela 
                <strong className="text-secondary"> escola onde ela acontece</strong> e pelas <strong className="text-secondary">pessoas que trabalham na aplicação</strong>.
              </p>
            </motion.div>

            {/* Lista de Provas */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-primary overflow-hidden">
                  <CardHeader className="bg-primary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-primary p-2.5 rounded-lg">
                        <FileText className="h-6 w-6 text-primary-foreground" />
                      </div>
                      Provas (Listagem)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Tela principal onde são listadas todas as provas cadastradas. Cada prova é identificada 
                      pelo seu <strong>edital</strong> e exibe informações como data, número de candidatos e status.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <FileText className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Card de Prova</h4>
                      </div>
                      <motion.div 
                        className="bg-card p-4 rounded-lg shadow-md max-w-sm border"
                        whileHover={{ scale: 1.02, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.2)" }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-lg">Edital 001/2025</span>
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Aberta</span>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>📅 Data: 15/03/2025</p>
                          <p>👥 500 candidatos</p>
                          <p>🏫 3 unidades</p>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <span className="bg-primary/10 text-primary px-3 py-1 rounded text-xs">Gerenciar</span>
                          <span className="bg-muted text-muted-foreground px-3 py-1 rounded text-xs">Editar</span>
                        </div>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Plus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Nova Prova:</strong> Cadastrar uma nova prova informando edital, data, horários, número de candidatos e textos do cabeçalho.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Settings className="h-5 w-5 mt-0.5 text-secondary flex-shrink-0" />
                          <span><strong>Gerenciar:</strong> Acessar a tela de gerenciamento completo da prova.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar:</strong> Alterar informações básicas da prova.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Excluir:</strong> Remover uma prova.</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Gerenciar Prova */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-primary overflow-hidden">
                  <CardHeader className="bg-primary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-primary p-2.5 rounded-lg">
                        <Settings className="h-6 w-6 text-primary-foreground" />
                      </div>
                      Gerenciar Prova
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Tela central de configuração de uma prova específica. Aqui você define quais unidades 
                      serão utilizadas e os valores de pagamento por função.
                    </p>
                    
                    {/* Ilustração - Fluxo */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <ArrowRight className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Fluxo de Configuração</h4>
                      </div>
                      <motion.div 
                        className="flex flex-wrap items-center justify-center gap-2 md:gap-4"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.div 
                          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-center"
                          variants={staggerItem}
                          whileHover={{ scale: 1.1 }}
                        >
                          <DollarSign className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-sm">1. Valores</span>
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                        </motion.div>
                        <motion.div 
                          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg font-medium text-center"
                          variants={staggerItem}
                          whileHover={{ scale: 1.1 }}
                        >
                          <Building2 className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-sm">2. Unidades</span>
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                        </motion.div>
                        <motion.div 
                          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium text-center"
                          variants={staggerItem}
                          whileHover={{ scale: 1.1 }}
                        >
                          <Users className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-sm">3. Colaboradores</span>
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                        </motion.div>
                        <motion.div 
                          className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg font-medium text-center"
                          variants={staggerItem}
                          whileHover={{ scale: 1.1 }}
                        >
                          <DoorOpen className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-sm">4. Salas</span>
                        </motion.div>
                        <motion.div variants={staggerItem}>
                          <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />
                        </motion.div>
                        <motion.div 
                          className="bg-amber-500 text-white px-4 py-2 rounded-lg font-medium text-center"
                          variants={staggerItem}
                          whileHover={{ scale: 1.1 }}
                        >
                          <Lock className="h-5 w-5 mx-auto mb-1" />
                          <span className="text-sm">5. Finalizar</span>
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <DollarSign className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
                          <span><strong>Cadastrar Funções:</strong> Definir os valores de pagamento para cada função nesta prova.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Building2 className="h-5 w-5 mt-0.5 text-secondary flex-shrink-0" />
                          <span><strong>Adicionar Unidade:</strong> Vincular uma unidade de prova a esta prova específica.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Users className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Gerenciar Colaboradores:</strong> Para cada unidade, acessar a tela de alocação de colaboradores.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <DoorOpen className="h-5 w-5 mt-0.5 text-secondary flex-shrink-0" />
                          <span><strong>Gerenciar Salas:</strong> Definir quais salas da unidade serão utilizadas e distribuir fiscais.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Lock className="h-5 w-5 mt-0.5 text-amber-500 flex-shrink-0" />
                          <span><strong>Finalizar Prova:</strong> Bloquear a edição da prova e liberar exportações e impressões.</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Gerenciar Colaboradores da Prova */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-primary overflow-hidden">
                  <CardHeader className="bg-primary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-primary p-2.5 rounded-lg">
                        <UserCheck className="h-6 w-6 text-primary-foreground" />
                      </div>
                      Gerenciar Colaboradores da Prova
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Dentre todos os colaboradores cadastrados, aqui escolhemos quais devem atuar nesta prova 
                      em cada unidade. Cada colaborador recebe uma função e o valor de pagamento é definido 
                      automaticamente.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <UserCheck className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Alocação de Colaboradores</h4>
                      </div>
                      <motion.div 
                        className="space-y-2"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.div 
                          className="bg-card p-3 rounded-lg flex items-center justify-between"
                          variants={staggerItem}
                          whileHover={{ x: 5 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/20 p-2 rounded-full">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-medium">João Silva</span>
                          </div>
                          <span className="bg-primary text-primary-foreground px-3 py-1 rounded text-sm">Coordenador Geral</span>
                        </motion.div>
                        <motion.div 
                          className="bg-card p-3 rounded-lg flex items-center justify-between"
                          variants={staggerItem}
                          whileHover={{ x: 5 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-secondary/20 p-2 rounded-full">
                              <Users className="h-4 w-4 text-secondary" />
                            </div>
                            <span className="font-medium">Maria Santos</span>
                          </div>
                          <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded text-sm">Fiscal</span>
                        </motion.div>
                        <motion.div 
                          className="bg-card p-3 rounded-lg flex items-center justify-between"
                          variants={staggerItem}
                          whileHover={{ x: 5 }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-secondary/20 p-2 rounded-full">
                              <Users className="h-4 w-4 text-secondary" />
                            </div>
                            <span className="font-medium">Pedro Oliveira</span>
                          </div>
                          <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded text-sm">Fiscal</span>
                        </motion.div>
                      </motion.div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <UserPlus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Adicionar Colaborador:</strong> Buscar e adicionar um colaborador à unidade, definindo sua função.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Alterar Função:</strong> Modificar a função de um colaborador já alocado.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Trash2 className="h-5 w-5 mt-0.5 text-destructive flex-shrink-0" />
                          <span><strong>Remover:</strong> Desvincular um colaborador desta prova/unidade.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Target className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Definir Metas:</strong> Configurar quantidade esperada de colaboradores por função na unidade.</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Gerenciar Salas Distribuídas */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-primary overflow-hidden">
                  <CardHeader className="bg-primary/5 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-primary p-2.5 rounded-lg">
                        <DoorOpen className="h-6 w-6 text-primary-foreground" />
                      </div>
                      Gerenciar Salas Distribuídas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Define quais salas de cada unidade serão utilizadas nesta prova específica. 
                      É possível ajustar a capacidade de candidatos e alocar os fiscais responsáveis.
                    </p>
                    
                    {/* Ilustração */}
                    <motion.div 
                      className="bg-gradient-to-r from-muted to-muted/50 rounded-xl p-6 border"
                      variants={scaleIn}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <DoorOpen className="h-6 w-6 text-primary" />
                        <h4 className="font-bold text-lg">Distribuição de Salas</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-card">
                              <th className="p-3 text-left font-semibold">Sala</th>
                              <th className="p-3 text-left font-semibold">Capacidade</th>
                              <th className="p-3 text-left font-semibold">Fiscal 1</th>
                              <th className="p-3 text-left font-semibold">Fiscal 2</th>
                            </tr>
                          </thead>
                          <tbody>
                            <motion.tr className="border-b" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                              <td className="p-3">101</td>
                              <td className="p-3">30</td>
                              <td className="p-3 text-primary">Maria Santos</td>
                              <td className="p-3 text-secondary">Ana Costa</td>
                            </motion.tr>
                            <motion.tr className="border-b" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                              <td className="p-3">102</td>
                              <td className="p-3">25</td>
                              <td className="p-3 text-primary">Pedro Oliveira</td>
                              <td className="p-3 text-muted-foreground">-</td>
                            </motion.tr>
                            <motion.tr initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                              <td className="p-3">201</td>
                              <td className="p-3">35</td>
                              <td className="p-3 text-primary">Carlos Lima</td>
                              <td className="p-3 text-secondary">Fernanda Dias</td>
                            </motion.tr>
                          </tbody>
                        </table>
                      </div>
                    </motion.div>

                    <motion.div 
                      className="bg-muted rounded-xl p-6"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Funcionalidades da Tela
                      </h4>
                      <ul className="space-y-3 text-base text-foreground">
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Plus className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
                          <span><strong>Adicionar Salas:</strong> Importar salas da unidade para a prova (individualmente ou em lote).</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Users className="h-5 w-5 mt-0.5 text-secondary flex-shrink-0" />
                          <span><strong>Alocar Fiscais:</strong> Definir Fiscal 1 e Fiscal 2 para cada sala.</span>
                        </motion.li>
                        <motion.li className="flex items-start gap-3 bg-card p-3 rounded-lg" variants={staggerItem} whileHover={{ x: 5 }}>
                          <Pencil className="h-5 w-5 mt-0.5 text-amber-600 flex-shrink-0" />
                          <span><strong>Editar Capacidade:</strong> Ajustar a capacidade de candidatos de cada sala para esta prova.</span>
                        </motion.li>
                      </ul>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Seção: Finalização e Exportações */}
        <section className="mb-20 relative">
          {/* Barra de seção */}
          <motion.div 
            className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-amber-500 to-amber-500/50 rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ originY: 0 }}
          />
          
          <div className="pl-8">
            <motion.div 
              className="flex items-center gap-4 mb-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              <motion.div 
                className="bg-amber-500 p-4 rounded-xl shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <Lock className="h-10 w-10 text-white" />
              </motion.div>
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Finalização e Exportações</h2>
                <p className="text-lg text-muted-foreground mt-1">Conclusão e geração de documentos</p>
              </div>
            </motion.div>
            
            <motion.div 
              className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl p-6 mb-10 border border-amber-200 dark:border-amber-800"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <p className="text-lg text-foreground leading-relaxed">
                Após todas as informações da prova serem configuradas, a prova deverá ser <strong className="text-amber-600">fechada 
                (finalizada)</strong>. A finalização bloqueia alterações e libera as funcionalidades de 
                exportação e impressão.
              </p>
            </motion.div>

            {/* Finalização */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-amber-500 overflow-hidden">
                  <CardHeader className="bg-amber-50 dark:bg-amber-950/20 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-amber-500 p-2.5 rounded-lg">
                        <Lock className="h-6 w-6 text-white" />
                      </div>
                      Finalizar Prova
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      A finalização é feita na tela de Gerenciar Prova. Após finalizar:
                    </p>
                    <motion.div 
                      className="grid gap-3 md:grid-cols-2"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <motion.div className="flex items-center gap-3 bg-muted p-4 rounded-lg" variants={staggerItem} whileHover={{ scale: 1.02 }}>
                        <CheckCircle2 className="h-6 w-6 text-amber-500 flex-shrink-0" />
                        <span>Não será mais possível adicionar/remover unidades</span>
                      </motion.div>
                      <motion.div className="flex items-center gap-3 bg-muted p-4 rounded-lg" variants={staggerItem} whileHover={{ scale: 1.02 }}>
                        <CheckCircle2 className="h-6 w-6 text-amber-500 flex-shrink-0" />
                        <span>Não será mais possível adicionar/remover colaboradores</span>
                      </motion.div>
                      <motion.div className="flex items-center gap-3 bg-muted p-4 rounded-lg" variants={staggerItem} whileHover={{ scale: 1.02 }}>
                        <CheckCircle2 className="h-6 w-6 text-amber-500 flex-shrink-0" />
                        <span>Não será mais possível alterar valores</span>
                      </motion.div>
                      <motion.div className="flex items-center gap-3 bg-muted p-4 rounded-lg" variants={staggerItem} whileHover={{ scale: 1.02 }}>
                        <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                        <span>Serão liberadas exportações e impressões</span>
                      </motion.div>
                    </motion.div>
                    
                    <motion.div 
                      className="bg-secondary/10 rounded-xl p-6 border border-secondary/30"
                      initial={{ opacity: 0, scale: 0.95 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                        <Unlock className="h-5 w-5 text-secondary" />
                        Reabrir Prova
                      </h4>
                      <p className="text-base text-foreground">
                        Caso seja necessário fazer alterações, é possível <strong>reabrir</strong> a prova. 
                        Essa ação requer confirmação de senha e permite editar novamente as configurações.
                      </p>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Exportações */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-green-500 overflow-hidden">
                  <CardHeader className="bg-green-50 dark:bg-green-950/20 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-green-500 p-2.5 rounded-lg">
                        <Download className="h-6 w-6 text-white" />
                      </div>
                      Exportações Disponíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <motion.div 
                      className="grid gap-6 md:grid-cols-2"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <motion.div 
                        className="p-6 rounded-xl bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/20 border border-green-200 dark:border-green-800"
                        variants={staggerItem}
                        whileHover={{ scale: 1.03, y: -5 }}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <FileSpreadsheet className="h-8 w-8 text-green-600" />
                          <h4 className="font-bold text-xl">Exportação ESOCIAL</h4>
                        </div>
                        <p className="text-base text-muted-foreground">
                          Gera planilha Excel com todos os dados dos colaboradores necessários para 
                          o envio ao eSocial.
                        </p>
                      </motion.div>
                      <motion.div 
                        className="p-6 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200 dark:border-blue-800"
                        variants={staggerItem}
                        whileHover={{ scale: 1.03, y: -5 }}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <Printer className="h-8 w-8 text-blue-600" />
                          <h4 className="font-bold text-xl">Documentos de Impressão</h4>
                        </div>
                        <p className="text-base text-muted-foreground">
                          Acessa a tela de geração de documentos em PDF para cada unidade.
                        </p>
                      </motion.div>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>

            {/* Documentos de Impressão */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={fadeInUp}
            >
              <motion.div variants={cardHover} initial="rest" whileHover="hover">
                <Card className="mb-8 shadow-lg border-l-4 border-l-blue-500 overflow-hidden">
                  <CardHeader className="bg-blue-50 dark:bg-blue-950/20 pb-4">
                    <CardTitle className="flex items-center gap-4 text-2xl">
                      <div className="bg-blue-500 p-2.5 rounded-lg">
                        <FileText className="h-6 w-6 text-white" />
                      </div>
                      Documentos de Impressão
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <p className="text-lg text-foreground leading-relaxed">
                      Tela para geração de documentos PDF por unidade. Os documentos incluem o cabeçalho 
                      configurado na prova e são formatados para impressão.
                    </p>
                    
                    <motion.div 
                      className="grid gap-4 md:grid-cols-2"
                      variants={staggerContainer}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                    >
                      <motion.div 
                        className="bg-muted rounded-xl p-5 border"
                        variants={staggerItem}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <FileText className="h-6 w-6 text-primary" />
                          <h4 className="font-bold text-lg">Lista de Presença</h4>
                        </div>
                        <p className="text-base text-muted-foreground">
                          Lista todos os colaboradores da unidade ordenados por função e nome. 
                          Inclui espaço para assinatura.
                        </p>
                      </motion.div>
                      <motion.div 
                        className="bg-muted rounded-xl p-5 border"
                        variants={staggerItem}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <FileText className="h-6 w-6 text-secondary" />
                          <h4 className="font-bold text-lg">Recibo de Pagamento</h4>
                        </div>
                        <p className="text-base text-muted-foreground">
                          Gera recibos agrupados por função. Cada mudança de função 
                          inicia uma nova página. Inclui CPF, valor e assinatura.
                        </p>
                      </motion.div>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Seção: Perfis de Usuário */}
        <section className="mb-20 relative">
          {/* Barra de seção */}
          <motion.div 
            className="absolute -left-4 top-0 bottom-0 w-2 bg-gradient-to-b from-purple-500 to-purple-500/50 rounded-full"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ originY: 0 }}
          />
          
          <div className="pl-8">
            <motion.div 
              className="flex items-center gap-4 mb-8"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              <motion.div 
                className="bg-purple-500 p-4 rounded-xl shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                <Shield className="h-10 w-10 text-white" />
              </motion.div>
              <div>
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">Perfis de Usuário</h2>
                <p className="text-lg text-muted-foreground mt-1">Níveis de acesso ao sistema</p>
              </div>
            </motion.div>
            
            <motion.div 
              className="grid gap-6 md:grid-cols-2"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <motion.div variants={staggerItem}>
                <motion.div whileHover={{ scale: 1.02, y: -5 }}>
                  <Card className="shadow-lg border-t-4 border-t-destructive h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-4 text-2xl">
                        <motion.div 
                          className="bg-destructive p-2.5 rounded-lg"
                          whileHover={{ rotate: 360 }}
                          transition={{ duration: 0.5 }}
                        >
                          <Shield className="h-6 w-6 text-destructive-foreground" />
                        </motion.div>
                        Administrador
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <motion.ul 
                        className="space-y-3 text-base text-foreground"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Acesso total ao sistema
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Gerencia parâmetros gerais
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Cria e configura provas
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Define coordenadores
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Acessa todas as exportações
                        </motion.li>
                      </motion.ul>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>

              <motion.div variants={staggerItem}>
                <motion.div whileHover={{ scale: 1.02, y: -5 }}>
                  <Card className="shadow-lg border-t-4 border-t-secondary h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-4 text-2xl">
                        <motion.div 
                          className="bg-secondary p-2.5 rounded-lg"
                          whileHover={{ rotate: 360 }}
                          transition={{ duration: 0.5 }}
                        >
                          <Shield className="h-6 w-6 text-secondary-foreground" />
                        </motion.div>
                        Coordenador
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <motion.ul 
                        className="space-y-3 text-base text-foreground"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true }}
                      >
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Acesso às provas que coordena
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Gerencia colaboradores da sua unidade
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Visualiza informações da prova
                        </motion.li>
                        <motion.li className="flex items-center gap-3" variants={staggerItem}>
                          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          Cadastra novos colaboradores
                        </motion.li>
                      </motion.ul>
                    </CardContent>
                  </Card>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <motion.footer 
          className="text-center py-12 text-muted-foreground border-t-2"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <motion.div 
            className="flex justify-center mb-4"
            whileHover={{ scale: 1.1 }}
          >
            <img src={fevreLogo} alt="FEVRE Logo" className="h-16 opacity-70" />
          </motion.div>
          <p className="text-lg font-medium">Sistema de Cadastro de Colaboradores do DCIT</p>
          <p className="mt-1">Fundação Educacional de Volta Redonda - FEVRE</p>
        </motion.footer>
      </main>
    </div>
  );
}
