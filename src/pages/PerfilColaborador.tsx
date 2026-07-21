import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { LogOut, Save, User } from 'lucide-react';
import fevreLogo from '@/assets/fevre-logo.png';
import { GRAU_INSTRUCAO_OPTIONS, ESTADO_CIVIL_OPTIONS, RACA_OPTIONS } from '@/lib/constants';
import { maskDateBR, brDateToIso, isoToBrDate, maskCPF, maskPIS, onlyDigits } from '@/lib/utils';
import { useBancos, TIPO_CONTA_OPTIONS } from '@/hooks/useBancos';

interface ColaboradorData {
  id: string;
  colab_matricula: string;
  colab_nome_completo: string;
  colab_cpf: string;
  colab_nacionalidade: string;
  colab_pis: string;
  colab_rua: string;
  colab_numero_casa: number;
  colab_complemento_endereco: string | null;
  colab_bairro: string;
  colab_cidade: string;
  colab_cep: number;
  colab_telefone: number;
  colab_grau_instrucao: number;
  colab_estado_civil: number;
  colab_raca: number;
  colab_deficiente: boolean;
  colab_data_nascimento: string | null;
  colab_email: string;
  colab_chave_pix: string;
  codigo_banco: string | null;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string | null;
}

export default function PerfilColaborador() {
  const navigate = useNavigate();
  const { user, signOut, loading, rolesLoaded, isColaborador } = useAuth();
  const { toast } = useToast();

  const [colaboradorData, setColaboradorData] = useState<ColaboradorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    colab_nome_completo: '',
    colab_cpf: '',
    colab_nacionalidade: '',
    colab_data_nascimento: '',
    colab_matricula: '',
    colab_pis: '',
    colab_rua: '',
    colab_numero_casa: '',
    colab_complemento_endereco: '',
    colab_bairro: '',
    colab_cidade: '',
    colab_cep: '',
    colab_telefone: '',
    colab_grau_instrucao: '',
    colab_estado_civil: '',
    colab_raca: '',
    colab_deficiente: false,
    colab_email: '',
    colab_chave_pix: '',
    codigo_banco: '',
    agencia: '',
    agencia_dv: '',
    conta: '',
    conta_dv: '',
    tipo_conta: '',
  });

  const { bancos } = useBancos();

  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    inactivityTimeoutRef.current = setTimeout(() => {
      toast({
        title: 'Sessão expirada',
        description: 'Você foi desconectado por inatividade.',
        variant: 'destructive',
      });
      // signOut do useAuth já recarrega a página em /auth.
      signOut();
    }, INACTIVITY_TIMEOUT);
  }, [signOut, toast]);

  // Logout por inatividade. As chamadas a register/update/unregister_colaborador_session
  // saíram na etapa 2A: aquela "sessão" era gravada por qualquer um, com qualquer id
  // (fragilidade 8), e a sessão de verdade agora é a do Supabase Auth.
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetInactivityTimer();
    };

    resetInactivityTimer();

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [resetInactivityTimer]);

  // A guarda da rota: precisa de sessão do Auth E do papel de colaborador. Um admin
  // que não seja colaborador não tem cadastro para ver aqui.
  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user || !isColaborador) {
      navigate('/auth', { replace: true });
    }
  }, [user, isColaborador, loading, rolesLoaded, navigate]);

  useEffect(() => {
    if (user && isColaborador) {
      fetchColaboradorData();
    }
  }, [user?.id, isColaborador]);

  const fetchColaboradorData = async () => {
    // Sem parâmetro: a RPC resolve o colaborador por auth.uid() -> colaboradores.user_id.
    // Não há id vindo do cliente para forjar.
    const { data, error } = await supabase.rpc('get_meu_colaborador');

    if (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar seus dados. Tente novamente.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const colaboradorInfo = data[0];
      setColaboradorData({
        id: colaboradorInfo.id,
        colab_matricula: colaboradorInfo.colab_matricula,
        colab_nome_completo: colaboradorInfo.colab_nome_completo,
        colab_cpf: colaboradorInfo.colab_cpf,
        colab_nacionalidade: colaboradorInfo.colab_nacionalidade,
        colab_pis: colaboradorInfo.colab_pis,
        colab_rua: colaboradorInfo.colab_rua,
        colab_numero_casa: colaboradorInfo.colab_numero_casa,
        colab_complemento_endereco: colaboradorInfo.colab_complemento_endereco,
        colab_bairro: colaboradorInfo.colab_bairro,
        colab_cidade: colaboradorInfo.colab_cidade,
        colab_cep: colaboradorInfo.colab_cep,
        colab_telefone: colaboradorInfo.colab_telefone,
        colab_grau_instrucao: colaboradorInfo.colab_grau_instrucao,
        colab_estado_civil: colaboradorInfo.colab_estado_civil,
        colab_raca: colaboradorInfo.colab_raca,
        colab_deficiente: colaboradorInfo.colab_deficiente,
        colab_data_nascimento: colaboradorInfo.colab_data_nascimento,
        colab_email: colaboradorInfo.colab_email,
        colab_chave_pix: colaboradorInfo.colab_chave_pix,
        codigo_banco: (colaboradorInfo as any).codigo_banco ?? null,
        agencia: (colaboradorInfo as any).agencia ?? null,
        agencia_dv: (colaboradorInfo as any).agencia_dv ?? null,
        conta: (colaboradorInfo as any).conta ?? null,
        conta_dv: (colaboradorInfo as any).conta_dv ?? null,
        tipo_conta: (colaboradorInfo as any).tipo_conta ?? null,
      });
      setFormData({
        colab_nome_completo: colaboradorInfo.colab_nome_completo || '',
        colab_cpf: maskCPF(colaboradorInfo.colab_cpf || ''),
        colab_nacionalidade: colaboradorInfo.colab_nacionalidade || '',
        colab_data_nascimento: isoToBrDate(colaboradorInfo.colab_data_nascimento),
        colab_matricula: colaboradorInfo.colab_matricula,
        colab_pis: maskPIS(colaboradorInfo.colab_pis || ''),
        colab_rua: colaboradorInfo.colab_rua,
        colab_numero_casa: colaboradorInfo.colab_numero_casa.toString(),
        colab_complemento_endereco: colaboradorInfo.colab_complemento_endereco || '',
        colab_bairro: colaboradorInfo.colab_bairro,
        colab_cidade: colaboradorInfo.colab_cidade,
        colab_cep: colaboradorInfo.colab_cep.toString(),
        colab_telefone: colaboradorInfo.colab_telefone.toString(),
        colab_grau_instrucao: colaboradorInfo.colab_grau_instrucao.toString(),
        colab_estado_civil: colaboradorInfo.colab_estado_civil.toString(),
        colab_raca: colaboradorInfo.colab_raca.toString(),
        colab_deficiente: colaboradorInfo.colab_deficiente,
        colab_email: colaboradorInfo.colab_email || '',
        colab_chave_pix: colaboradorInfo.colab_chave_pix || '',
        codigo_banco: (colaboradorInfo as any).codigo_banco || '',
        agencia: (colaboradorInfo as any).agencia || '',
        agencia_dv: (colaboradorInfo as any).agencia_dv || '',
        conta: (colaboradorInfo as any).conta || '',
        conta_dv: (colaboradorInfo as any).conta_dv || '',
        tipo_conta: (colaboradorInfo as any).tipo_conta || '',
      });
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!user || !isColaborador) return;

    // Client-side NOT NULL validations
    if (!formData.colab_nome_completo.trim()) {
      toast({ title: 'Campo obrigatório', description: 'Nome completo é obrigatório.', variant: 'destructive' });
      return;
    }
    const cpfClean = formData.colab_cpf.replace(/\D/g, '');
    if (cpfClean.length !== 11) {
      toast({ title: 'CPF inválido', description: 'O CPF deve ter 11 dígitos.', variant: 'destructive' });
      return;
    }
    const dataNascIso = brDateToIso(formData.colab_data_nascimento);
    if (!dataNascIso) {
      toast({ title: 'Campo obrigatório', description: 'Informe a data de nascimento no formato DD/MM/AAAA.', variant: 'destructive' });
      return;
    }

    // Bank data client-side validation
    if (formData.tipo_conta && formData.tipo_conta !== 'corrente' && formData.tipo_conta !== 'poupanca') {
      toast({ title: 'Tipo de conta inválido', description: 'Selecione "Conta Corrente" ou "Conta Poupança".', variant: 'destructive' });
      return;
    }
    if (formData.codigo_banco && !/^\d{3}$/.test(formData.codigo_banco)) {
      toast({ title: 'Banco inválido', description: 'Selecione um banco válido na lista.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    const { data, error } = await supabase.rpc('update_meu_colaborador', {
      p_nome_completo: formData.colab_nome_completo.trim(),
      p_cpf: cpfClean,
      p_nacionalidade: formData.colab_nacionalidade || '',
      p_data_nascimento: dataNascIso,
      p_matricula: formData.colab_matricula,
      p_pis: onlyDigits(formData.colab_pis),
      p_rua: formData.colab_rua,
      p_numero_casa: parseInt(formData.colab_numero_casa) || 0,
      p_complemento: formData.colab_complemento_endereco || '',
      p_bairro: formData.colab_bairro,
      p_cidade: formData.colab_cidade,
      p_cep: parseInt(formData.colab_cep) || 0,
      p_telefone: parseInt(formData.colab_telefone) || 0,
      p_grau_instrucao: parseInt(formData.colab_grau_instrucao) || 0,
      p_estado_civil: parseInt(formData.colab_estado_civil) || 0,
      p_raca: parseInt(formData.colab_raca) || 0,
      p_deficiente: formData.colab_deficiente,
      // Reescreve o e-mail carregado, sem alterá-lo: o campo é read-only porque colab_email é a
      // âncora do login, e a RPC não alcança auth.users.
      p_email: formData.colab_email,
      p_chave_pix: formData.colab_chave_pix,
    });

    // Update bank fields via dedicated RPC
    let bankError: unknown = null;
    if (!error) {
      const { error: bErr } = await supabase.rpc('update_meus_dados_bancarios', {
        p_codigo_banco: formData.codigo_banco || '',
        p_agencia: formData.agencia || '',
        p_agencia_dv: formData.agencia_dv || '',
        p_conta: formData.conta || '',
        p_conta_dv: formData.conta_dv || '',
        p_tipo_conta: formData.tipo_conta || '',
      });
      bankError = bErr;
    }

    setIsSaving(false);

    if (error) {
      console.error('Erro ao salvar:', error);
      
      let errorMessage = 'Não foi possível salvar suas alterações. Tente novamente.';
      
      // Check for specific constraint violations
      if (error.code === '23505') {
        if (error.message?.includes('colab_matricula') || error.details?.includes('colab_matricula')) {
          errorMessage = 'Esta matrícula já está cadastrada para outro colaborador. Verifique o número e tente novamente.';
        } else if (error.message?.includes('colab_chave_pix') || error.details?.includes('colab_chave_pix')) {
          errorMessage = 'Esta chave PIX já está cadastrada para outro colaborador. Cada chave pertence a uma única pessoa — verifique e tente novamente.';
        } else if (error.message?.includes('colab_pis') || error.details?.includes('colab_pis')) {
          errorMessage = 'Este PIS já está cadastrado para outro colaborador. Verifique o número e tente novamente.';
        } else if (error.message?.includes('colab_email') || error.details?.includes('colab_email')) {
          errorMessage = 'Este e-mail já está cadastrado para outro colaborador. Verifique o endereço e tente novamente.';
        } else {
          errorMessage = 'Um dos dados informados já está cadastrado para outro colaborador.';
        }
      }
      
      toast({
        title: 'Erro ao salvar',
        description: errorMessage,
        variant: 'destructive',
      });
    } else if (!data) {
      toast({
        title: 'Erro ao salvar',
        description: 'Colaborador não encontrado.',
        variant: 'destructive',
      });
    } else if (bankError) {
      const msg = (bankError as { message?: string })?.message || 'Não foi possível salvar os dados bancários.';
      toast({ title: 'Erro nos dados bancários', description: msg, variant: 'destructive' });
    } else {
      // Sucesso: confirma e mantém a sessão. Antes, salvar deslogava e mandava para
      // /auth — herança do modelo de sessão efêmera (CPF + código). Com a sessão real
      // do Auth isso expulsava os 12 gestor+colaborador da sessão de gestão só por
      // editarem o próprio cadastro, então o logout saiu daqui.
      toast({
        title: 'Dados atualizados com sucesso!',
        description: 'Suas alterações foram salvas.',
      });
      fetchColaboradorData();
    }
  };

  const handleLogout = () => {
    signOut();
    navigate('/auth');
  };

  const formatCpf = (cpf: string) => {
    const cpfStr = cpf.padStart(11, '0');
    return cpfStr
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2');
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!colaboradorData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Dados não encontrados.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <img src={fevreLogo} alt="FEVRE Logo" className="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
              <p className="text-sm text-muted-foreground">{colaboradorData.colab_nome_completo}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>

        {/* Profile Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Dados Pessoais
            </CardTitle>
            <CardDescription>
              Você pode atualizar estas informações
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="nome_completo">Nome Completo *</Label>
                <span className="text-xs text-muted-foreground">{formData.colab_nome_completo.length}/40</span>
              </div>
              <Input
                id="nome_completo"
                value={formData.colab_nome_completo}
                onChange={(e) => setFormData({ ...formData, colab_nome_completo: e.target.value })}
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cpf">CPF *</Label>
                <span className="text-xs text-muted-foreground">{onlyDigits(formData.colab_cpf).length}/11</span>
              </div>
              <Input
                id="cpf"
                inputMode="numeric"
                value={formData.colab_cpf}
                onChange={(e) => setFormData({ ...formData, colab_cpf: maskCPF(e.target.value) })}
                maxLength={14}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="nacionalidade">Nacionalidade</Label>
                <span className="text-xs text-muted-foreground">{formData.colab_nacionalidade.length}/10</span>
              </div>
              <Input
                id="nacionalidade"
                value={formData.colab_nacionalidade}
                onChange={(e) => setFormData({ ...formData, colab_nacionalidade: e.target.value })}
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento *</Label>
              <Input
                id="data_nascimento"
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={formData.colab_data_nascimento}
                onChange={(e) => setFormData({ ...formData, colab_data_nascimento: maskDateBR(e.target.value) })}
                maxLength={10}
              />
            </div>
          </CardContent>
        </Card>

        {/* Editable Card */}
        <Card>
          <CardHeader>
            <CardTitle>Dados Editáveis</CardTitle>
            <CardDescription>
              Você pode atualizar estas informações
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="matricula">Matrícula</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_matricula.length}/6</span>
                </div>
                <Input
                  id="matricula"
                  value={formData.colab_matricula}
                  onChange={(e) => setFormData({ ...formData, colab_matricula: e.target.value })}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pis">PIS</Label>
                  <span className="text-xs text-muted-foreground">{onlyDigits(formData.colab_pis).length}/11</span>
                </div>
                <Input
                  id="pis"
                  inputMode="numeric"
                  value={formData.colab_pis}
                  onChange={(e) => setFormData({ ...formData, colab_pis: maskPIS(e.target.value) })}
                  maxLength={14}
                  placeholder="000.00000.00-0"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rua">Rua</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_rua.length}/34</span>
                </div>
                <Input
                  id="rua"
                  value={formData.colab_rua}
                  onChange={(e) => setFormData({ ...formData, colab_rua: e.target.value })}
                  maxLength={34}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  type="number"
                  value={formData.colab_numero_casa}
                  onChange={(e) => setFormData({ ...formData, colab_numero_casa: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="complemento">Complemento</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_complemento_endereco.length}/20</span>
                </div>
                <Input
                  id="complemento"
                  value={formData.colab_complemento_endereco}
                  onChange={(e) => setFormData({ ...formData, colab_complemento_endereco: e.target.value })}
                  maxLength={22}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bairro">Bairro</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_bairro.length}/26</span>
                </div>
                <Input
                  id="bairro"
                  value={formData.colab_bairro}
                  onChange={(e) => setFormData({ ...formData, colab_bairro: e.target.value })}
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cidade">Cidade</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_cidade.length}/15</span>
                </div>
                <Input
                  id="cidade"
                  value={formData.colab_cidade}
                  onChange={(e) => setFormData({ ...formData, colab_cidade: e.target.value })}
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.colab_cep}
                  onChange={(e) => setFormData({ ...formData, colab_cep: e.target.value.replace(/\D/g, '') })}
                  maxLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.colab_telefone}
                  onChange={(e) => setFormData({ ...formData, colab_telefone: e.target.value.replace(/\D/g, '') })}
                  maxLength={11}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.colab_email}
                  readOnly
                  className="bg-muted text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Este é o e-mail do seu acesso: é com ele que você entra no sistema e recebe a
                  recuperação de senha. Trocá-lo significa trocar a sua conta de acesso — não é uma
                  edição de cadastro, então não acontece por aqui. Se precisar mudar, fale com a
                  coordenação.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="chave_pix">Chave PIX</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_chave_pix.length}/255</span>
                </div>
                <Input
                  id="chave_pix"
                  value={formData.colab_chave_pix}
                  onChange={(e) => setFormData({ ...formData, colab_chave_pix: e.target.value })}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Grau de Instrução</Label>
                <Select
                  value={formData.colab_grau_instrucao}
                  onValueChange={(value) => setFormData({ ...formData, colab_grau_instrucao: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRAU_INSTRUCAO_OPTIONS.map((grau) => (
                      <SelectItem key={grau.value} value={grau.value.toString()}>
                        {grau.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado Civil</Label>
                <Select
                  value={formData.colab_estado_civil}
                  onValueChange={(value) => setFormData({ ...formData, colab_estado_civil: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_CIVIL_OPTIONS.map((estado) => (
                      <SelectItem key={estado.value} value={estado.value.toString()}>
                        {estado.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Raça/Cor</Label>
                <Select
                  value={formData.colab_raca}
                  onValueChange={(value) => setFormData({ ...formData, colab_raca: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RACA_OPTIONS.map((raca) => (
                      <SelectItem key={raca.value} value={raca.value.toString()}>
                        {raca.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="deficiente"
                checked={formData.colab_deficiente}
                onChange={(e) => setFormData({ ...formData, colab_deficiente: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="deficiente">Pessoa com deficiência</Label>
            </div>

            {/* Dados Bancários */}
            <div className="pt-4 border-t space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Dados Bancários</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="codigo_banco">Banco</Label>
                  <Select
                    value={formData.codigo_banco || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, codigo_banco: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger id="codigo_banco">
                      <SelectValue placeholder="Selecione o banco" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Não informado —</SelectItem>
                      {bancos.map((b) => (
                        <SelectItem key={b.codigo_compe} value={b.codigo_compe}>
                          {b.codigo_compe} — {b.apelido}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agencia">Agência</Label>
                  <Input
                    id="agencia"
                    inputMode="numeric"
                    value={formData.agencia}
                    onChange={(e) => setFormData({ ...formData, agencia: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                    maxLength={8}
                    placeholder="0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agencia_dv">Dígito da Agência</Label>
                  <Input
                    id="agencia_dv"
                    value={formData.agencia_dv}
                    onChange={(e) => setFormData({ ...formData, agencia_dv: e.target.value.replace(/[^0-9xX]/g, '').slice(0, 2).toUpperCase() })}
                    maxLength={2}
                    placeholder="0 ou X"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conta">Conta</Label>
                  <Input
                    id="conta"
                    inputMode="numeric"
                    value={formData.conta}
                    onChange={(e) => setFormData({ ...formData, conta: e.target.value.replace(/\D/g, '').slice(0, 20) })}
                    maxLength={20}
                    placeholder="0000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conta_dv">Dígito da Conta</Label>
                  <Input
                    id="conta_dv"
                    value={formData.conta_dv}
                    onChange={(e) => setFormData({ ...formData, conta_dv: e.target.value.replace(/[^0-9xX]/g, '').slice(0, 2).toUpperCase() })}
                    maxLength={2}
                    placeholder="0 ou X"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="tipo_conta">Tipo de Conta</Label>
                  <Select
                    value={formData.tipo_conta || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, tipo_conta: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger id="tipo_conta">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Não informado —</SelectItem>
                      {TIPO_CONTA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>



            <Button onClick={handleSave} disabled={isSaving} className="w-full md:w-auto">
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Fundação Educacional de Volta Redonda
        </p>
      </div>
    </div>
  );
}
