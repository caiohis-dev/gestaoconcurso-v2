import { useState, useEffect } from 'react';
import { useColaboradores, Colaborador, ColaboradorInsert } from '@/hooks/useColaboradores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ESTADO_CIVIL_OPTIONS, RACA_OPTIONS, GRAU_INSTRUCAO_OPTIONS } from '@/lib/constants';
import { maskDateBR, brDateToIso, isoToBrDate, maskCPF, maskPIS, onlyDigits } from '@/lib/utils';
import { useBancos, TIPO_CONTA_OPTIONS } from '@/hooks/useBancos';
import { CheckCircle2, XCircle } from 'lucide-react';
import { z } from 'zod';

const colaboradorSchema = z.object({
  colab_matricula: z.string().max(6, 'Máximo 6 caracteres').nullable().optional(),
  colab_nome_completo: z.string().min(1, 'Nome completo obrigatório').max(40, 'Máximo 40 caracteres'),
  colab_cpf: z.string().length(11, 'CPF deve ter 11 dígitos'),
  colab_data_nascimento: z.string().min(1, 'Data de nascimento obrigatória'),
  colab_nacionalidade: z.string().max(10, 'Máximo 10 caracteres').nullable().optional(),
  colab_pis: z.string().max(11, 'Máximo 11 caracteres').nullable().optional(),
  colab_rua: z.string().max(34, 'Máximo 34 caracteres').nullable().optional(),
  colab_numero_casa: z.number().nullable().optional(),
  colab_bairro: z.string().max(26, 'Máximo 26 caracteres').nullable().optional(),
  colab_cidade: z.string().max(15, 'Máximo 15 caracteres').nullable().optional(),
  colab_cep: z.number().nullable().optional(),
  colab_estado_civil: z.number().nullable().optional(),
  colab_raca: z.number().nullable().optional(),
  colab_grau_instrucao: z.number().nullable().optional(),
  colab_telefone: z.number({ invalid_type_error: 'Telefone obrigatório' }).int().positive('Telefone obrigatório'),
  colab_complemento_endereco: z.string().max(20, 'Máximo 20 caracteres').nullable().optional(),
  colab_deficiente: z.boolean().optional().default(false),
  colab_email: z.string().min(1, 'Email obrigatório').email('Email inválido').max(255, 'Máximo 255 caracteres'),
  colab_chave_pix: z.string().max(255, 'Máximo 255 caracteres').nullable().optional(),
  colab_codigo_acesso: z.string().regex(/^\d{4}$/, 'Código deve ter exatamente 4 dígitos').optional(),
  codigo_banco: z.string().regex(/^\d{3}$/, 'Selecione um banco').nullable().optional().or(z.literal('')),
  agencia: z.string().regex(/^\d{1,8}$/, 'Agência deve conter apenas números').nullable().optional().or(z.literal('')),
  agencia_dv: z.string().regex(/^[0-9xX]{1,2}$/, 'DV inválido').nullable().optional().or(z.literal('')),
  conta: z.string().regex(/^\d{1,20}$/, 'Conta deve conter apenas números').nullable().optional().or(z.literal('')),
  conta_dv: z.string().regex(/^[0-9xX]{1,2}$/, 'DV inválido').nullable().optional().or(z.literal('')),
  tipo_conta: z.enum(['corrente', 'poupanca']).nullable().optional().or(z.literal('')),
});

interface ColaboradorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaborador?: Colaborador | null;
  publicMode?: boolean;
  initialCpf?: string;
}


const initialFormData = {
  colab_matricula: '',
  colab_nome_completo: '',
  colab_cpf: '',
  colab_data_nascimento: '',
  colab_nacionalidade: 'Brasileira',
  colab_pis: '',
  colab_rua: '',
  colab_numero_casa: '',
  colab_bairro: '',
  colab_cidade: '',
  colab_cep: '',
  colab_estado_civil: '',
  colab_raca: '',
  colab_grau_instrucao: '',
  colab_telefone: '',
  colab_complemento_endereco: '',
  colab_deficiente: false,
  colab_email: '',
  colab_chave_pix: '',
  colab_codigo_acesso: '',
  colab_confirma_codigo_acesso: '',
  codigo_banco: '',
  agencia: '',
  agencia_dv: '',
  conta: '',
  conta_dv: '',
  tipo_conta: '',
};

export default function ColaboradorDialog({ open, onOpenChange, colaborador, publicMode = false, initialCpf }: ColaboradorDialogProps) {
  const { create, update, isCreating, isUpdating } = useColaboradores();
  const { bancos } = useBancos();
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublicSubmitting, setIsPublicSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string; codigo?: string } | null>(null);
  const isEditing = !!colaborador;
  const isSubmitting = isCreating || isUpdating || isPublicSubmitting;

  useEffect(() => {
    if (colaborador) {
      setFormData({
        colab_matricula: colaborador.colab_matricula || '',
        colab_nome_completo: colaborador.colab_nome_completo || '',
        colab_cpf: maskCPF(colaborador.colab_cpf),
        colab_data_nascimento: isoToBrDate(colaborador.colab_data_nascimento),
        colab_nacionalidade: colaborador.colab_nacionalidade || '',
        colab_pis: maskPIS(colaborador.colab_pis || ''),
        colab_rua: colaborador.colab_rua || '',
        colab_numero_casa: colaborador.colab_numero_casa?.toString() || '',
        colab_bairro: colaborador.colab_bairro || '',
        colab_cidade: colaborador.colab_cidade || '',
        colab_cep: colaborador.colab_cep?.toString() || '',
        colab_estado_civil: colaborador.colab_estado_civil?.toString() || '',
        colab_raca: colaborador.colab_raca?.toString() || '',
        colab_grau_instrucao: colaborador.colab_grau_instrucao?.toString() || '',
        colab_telefone: colaborador.colab_telefone?.toString() || '',
        colab_complemento_endereco: colaborador.colab_complemento_endereco || '',
        colab_deficiente: colaborador.colab_deficiente,
        colab_email: colaborador.colab_email || '',
        colab_chave_pix: colaborador.colab_chave_pix || '',
        colab_codigo_acesso: colaborador.colab_codigo_acesso || '',
        colab_confirma_codigo_acesso: '',
        codigo_banco: colaborador.codigo_banco || '',
        agencia: colaborador.agencia || '',
        agencia_dv: colaborador.agencia_dv || '',
        conta: colaborador.conta || '',
        conta_dv: colaborador.conta_dv || '',
        tipo_conta: colaborador.tipo_conta || '',
      });
    } else {
      setFormData({ ...initialFormData, colab_cpf: initialCpf ? maskCPF(initialCpf) : '', colab_codigo_acesso: '', colab_confirma_codigo_acesso: '' });
    }
    setErrors({});
  }, [colaborador, open, initialCpf]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const data: ColaboradorInsert = {
      colab_matricula: formData.colab_matricula || null,
      colab_nome_completo: formData.colab_nome_completo,
      colab_cpf: onlyDigits(formData.colab_cpf).padStart(11, '0'),
      colab_data_nascimento: brDateToIso(formData.colab_data_nascimento),
      colab_nacionalidade: formData.colab_nacionalidade || null,
      colab_pis: onlyDigits(formData.colab_pis) || null,
      colab_rua: formData.colab_rua || null,
      colab_numero_casa: formData.colab_numero_casa ? Number(formData.colab_numero_casa) : null,
      colab_bairro: formData.colab_bairro || null,
      colab_cidade: formData.colab_cidade || null,
      colab_cep: formData.colab_cep ? Number(formData.colab_cep) : null,
      colab_estado_civil: formData.colab_estado_civil ? Number(formData.colab_estado_civil) : null,
      colab_raca: formData.colab_raca ? Number(formData.colab_raca) : null,
      colab_grau_instrucao: formData.colab_grau_instrucao ? Number(formData.colab_grau_instrucao) : null,
      colab_telefone: formData.colab_telefone ? Number(formData.colab_telefone) : null,
      colab_complemento_endereco: formData.colab_complemento_endereco || null,
      colab_deficiente: formData.colab_deficiente,
      colab_email: formData.colab_email || null,
      colab_chave_pix: formData.colab_chave_pix || null,
      codigo_banco: formData.codigo_banco || null,
      agencia: formData.agencia || null,
      agencia_dv: formData.agencia_dv || null,
      conta: formData.conta || null,
      conta_dv: formData.conta_dv || null,
      tipo_conta: (formData.tipo_conta as 'corrente' | 'poupanca' | '') || null,
      ...(isEditing ? {} : { colab_codigo_acesso: formData.colab_codigo_acesso }),
    };

    if (!isEditing && formData.colab_codigo_acesso !== formData.colab_confirma_codigo_acesso) {
      setErrors((prev) => ({
        ...prev,
        colab_confirma_codigo_acesso: 'Os códigos de acesso não coincidem.',
      }));
      return;
    }

    try {
      colaboradorSchema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    if (isEditing && colaborador) {
      update({ id: colaborador.id, ...data }, {
        onSuccess: () => onOpenChange(false),
      });
    } else if (publicMode) {
      setIsPublicSubmitting(true);
      (async () => {
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-create-colaborador`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify(data),
          });
          const result = await res.json().catch(() => ({} as any));

          if (!res.ok || result?.error) {
            const raw = result?.error || `Erro ${res.status}`;
            let friendly = raw;
            if (/cpf.*(já|ja).*cadastrad/i.test(raw)) {
              friendly = 'Este CPF já está cadastrado no sistema.';
            } else if (/c[oó]digo.*(uso|cadastrad)/i.test(raw) || /colab_codigo_acesso/i.test(raw)) {
              friendly = 'Este código de acesso já está em uso. Escolha outro.';
            }
            setSubmitStatus({ type: 'error', message: friendly });
            return;
          }
          const codigo = result?.codigo_acesso;
          setSubmitStatus({
            type: 'success',
            message: codigo
              ? `Colaborador cadastrado com sucesso! Código de acesso: ${codigo}`
              : 'Colaborador cadastrado com sucesso!',
            codigo,
          });
        } catch (err: any) {
          setSubmitStatus({
            type: 'error',
            message: err?.message || 'Falha de conexão. Tente novamente.',
          });
        } finally {
          setIsPublicSubmitting(false);
        }
      })();


    } else {
      create(data, {
        onSuccess: () => onOpenChange(false),
      });
    }
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => publicMode && e.preventDefault()}
          onEscapeKeyDown={(e) => publicMode && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
            <DialogDescription>
              {isEditing ? 'Atualize os dados do colaborador.' : 'Preencha os dados para cadastrar um novo colaborador.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Código de Acesso (apenas ao editar) */}
          {isEditing && colaborador?.colab_codigo_acesso && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-primary">Código de Acesso</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Código utilizado pelo colaborador para acessar o sistema
                  </p>
                </div>
                <div className="text-3xl font-mono font-bold tracking-[0.3em] text-primary">
                  {colaborador.colab_codigo_acesso}
                </div>
              </div>
            </div>
          )}

          {/* Identificação */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Identificação</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!isEditing && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="codigo_acesso">Crie seu Código de Acesso (4 dígitos) *</Label>
                    <span className="text-xs text-muted-foreground">{formData.colab_codigo_acesso.length}/4</span>
                  </div>
                  <Input
                    id="codigo_acesso"
                    inputMode="numeric"
                    value={formData.colab_codigo_acesso}
                    onChange={(e) => updateField('colab_codigo_acesso', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="0000"
                  />
                  {errors.colab_codigo_acesso && <p className="text-sm text-destructive">{errors.colab_codigo_acesso}</p>}
                </div>
              )}
              {!isEditing && (
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="confirma_codigo_acesso">Confirme seu Código de Acesso (4 dígitos) *</Label>
                    <span className="text-xs text-muted-foreground">{formData.colab_confirma_codigo_acesso.length}/4</span>
                  </div>
                  <Input
                    id="confirma_codigo_acesso"
                    inputMode="numeric"
                    value={formData.colab_confirma_codigo_acesso}
                    onChange={(e) => updateField('colab_confirma_codigo_acesso', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    placeholder="0000"
                  />
                  {errors.colab_confirma_codigo_acesso && <p className="text-sm text-destructive">{errors.colab_confirma_codigo_acesso}</p>}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="matricula">Matrícula (PMVR)</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_matricula.length}/6</span>
                </div>
                <Input
                  id="matricula"
                  value={formData.colab_matricula}
                  onChange={(e) => updateField('colab_matricula', e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                />
                {errors.colab_matricula && <p className="text-sm text-destructive">{errors.colab_matricula}</p>}
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
                  onChange={(e) => updateField('colab_cpf', maskCPF(e.target.value))}
                  maxLength={14}
                  placeholder="000.000.000-00"
                />
                {errors.colab_cpf && <p className="text-sm text-destructive">{errors.colab_cpf}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_nascimento">Data de Nascimento *</Label>
                <Input
                  id="data_nascimento"
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={formData.colab_data_nascimento}
                  onChange={(e) => updateField('colab_data_nascimento', maskDateBR(e.target.value))}
                  maxLength={10}
                />
                {errors.colab_data_nascimento && <p className="text-sm text-destructive">{errors.colab_data_nascimento}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nome">Nome Completo *</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_nome_completo.length}/40</span>
                </div>
                <Input
                  id="nome"
                  value={formData.colab_nome_completo}
                  onChange={(e) => updateField('colab_nome_completo', e.target.value)}
                  maxLength={40}
                  placeholder="Nome completo do colaborador"
                />
                {errors.colab_nome_completo && <p className="text-sm text-destructive">{errors.colab_nome_completo}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nacionalidade">Nacionalidade</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_nacionalidade.length}/10</span>
                </div>
                <Input
                  id="nacionalidade"
                  value={formData.colab_nacionalidade}
                  onChange={(e) => updateField('colab_nacionalidade', e.target.value)}
                  maxLength={10}
                  placeholder="Brasileira"
                />
                {errors.colab_nacionalidade && <p className="text-sm text-destructive">{errors.colab_nacionalidade}</p>}
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
                  onChange={(e) => updateField('colab_pis', maskPIS(e.target.value))}
                  maxLength={14}
                  placeholder="000.00000.00-0"
                />
                {errors.colab_pis && <p className="text-sm text-destructive">{errors.colab_pis}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  value={formData.colab_telefone}
                  onChange={(e) => updateField('colab_telefone', e.target.value.replace(/\D/g, ''))}
                  maxLength={12}
                  placeholder="21999999999"
                  required
                />
                {errors.colab_telefone && <p className="text-sm text-destructive">{errors.colab_telefone}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="email">Email *</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_email.length}/255</span>
                </div>
                <Input
                  id="email"
                  type="email"
                  value={formData.colab_email}
                  onChange={(e) => updateField('colab_email', e.target.value)}
                  maxLength={255}
                  placeholder="email@exemplo.com"
                  required
                />
                {errors.colab_email && <p className="text-sm text-destructive">{errors.colab_email}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="chave_pix">Chave PIX</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_chave_pix.length}/255</span>
                </div>
                <Input
                  id="chave_pix"
                  value={formData.colab_chave_pix}
                  onChange={(e) => updateField('colab_chave_pix', e.target.value)}
                  maxLength={255}
                  placeholder="CPF, Email, Telefone ou Chave aleatória"
                />
                {errors.colab_chave_pix && <p className="text-sm text-destructive">{errors.colab_chave_pix}</p>}
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Endereço</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rua">Rua</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_rua.length}/34</span>
                </div>
                <Input
                  id="rua"
                  value={formData.colab_rua}
                  onChange={(e) => updateField('colab_rua', e.target.value)}
                  maxLength={34}
                  placeholder="Nome da rua"
                />
                {errors.colab_rua && <p className="text-sm text-destructive">{errors.colab_rua}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  value={formData.colab_numero_casa}
                  onChange={(e) => updateField('colab_numero_casa', e.target.value.replace(/\D/g, ''))}
                  placeholder="123"
                />
                {errors.colab_numero_casa && <p className="text-sm text-destructive">{errors.colab_numero_casa}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="complemento">Complemento</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_complemento_endereco.length}/20</span>
                </div>
                <Input
                  id="complemento"
                  value={formData.colab_complemento_endereco}
                  onChange={(e) => updateField('colab_complemento_endereco', e.target.value)}
                  maxLength={20}
                  placeholder="Apto, Bloco..."
                />
                {errors.colab_complemento_endereco && <p className="text-sm text-destructive">{errors.colab_complemento_endereco}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bairro">Bairro</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_bairro.length}/26</span>
                </div>
                <Input
                  id="bairro"
                  value={formData.colab_bairro}
                  onChange={(e) => updateField('colab_bairro', e.target.value)}
                  maxLength={26}
                  placeholder="Nome do bairro"
                />
                {errors.colab_bairro && <p className="text-sm text-destructive">{errors.colab_bairro}</p>}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cidade">Cidade</Label>
                  <span className="text-xs text-muted-foreground">{formData.colab_cidade.length}/15</span>
                </div>
                <Input
                  id="cidade"
                  value={formData.colab_cidade}
                  onChange={(e) => updateField('colab_cidade', e.target.value)}
                  maxLength={15}
                  placeholder="Volta Redonda"
                />
                {errors.colab_cidade && <p className="text-sm text-destructive">{errors.colab_cidade}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.colab_cep}
                  onChange={(e) => updateField('colab_cep', e.target.value.replace(/\D/g, ''))}
                  maxLength={8}
                  placeholder="00000000"
                />
                {errors.colab_cep && <p className="text-sm text-destructive">{errors.colab_cep}</p>}
              </div>
            </div>
          </div>

          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Dados Pessoais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="estado_civil">Estado Civil</Label>
                <Select
                  value={formData.colab_estado_civil}
                  onValueChange={(value) => updateField('colab_estado_civil', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_CIVIL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.colab_estado_civil && <p className="text-sm text-destructive">{errors.colab_estado_civil}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="raca">Raça/Cor</Label>
                <Select
                  value={formData.colab_raca}
                  onValueChange={(value) => updateField('colab_raca', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {RACA_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.colab_raca && <p className="text-sm text-destructive">{errors.colab_raca}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="grau_instrucao">Grau de Instrução</Label>
                <Select
                  value={formData.colab_grau_instrucao}
                  onValueChange={(value) => updateField('colab_grau_instrucao', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRAU_INSTRUCAO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.colab_grau_instrucao && <p className="text-sm text-destructive">{errors.colab_grau_instrucao}</p>}
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="deficiente"
                  checked={formData.colab_deficiente}
                  onCheckedChange={(checked) => updateField('colab_deficiente', checked)}
                />
                <Label htmlFor="deficiente">Pessoa com Deficiência (PCD)</Label>
              </div>
            </div>
          </div>

          {/* Dados Bancários */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Dados Bancários</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="codigo_banco">Banco</Label>
                <Select
                  value={formData.codigo_banco || 'none'}
                  onValueChange={(value) => updateField('codigo_banco', value === 'none' ? '' : value)}
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
                {errors.codigo_banco && <p className="text-sm text-destructive">{errors.codigo_banco}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencia">Agência</Label>
                <Input
                  id="agencia"
                  inputMode="numeric"
                  value={formData.agencia}
                  onChange={(e) => updateField('agencia', e.target.value.replace(/\D/g, '').slice(0, 8))}
                  maxLength={8}
                  placeholder="0000"
                />
                {errors.agencia && <p className="text-sm text-destructive">{errors.agencia}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencia_dv">Dígito da Agência</Label>
                <Input
                  id="agencia_dv"
                  value={formData.agencia_dv}
                  onChange={(e) => updateField('agencia_dv', e.target.value.replace(/[^0-9xX]/g, '').slice(0, 2).toUpperCase())}
                  maxLength={2}
                  placeholder="0 ou X"
                />
                {errors.agencia_dv && <p className="text-sm text-destructive">{errors.agencia_dv}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="conta">Conta</Label>
                <Input
                  id="conta"
                  inputMode="numeric"
                  value={formData.conta}
                  onChange={(e) => updateField('conta', e.target.value.replace(/\D/g, '').slice(0, 20))}
                  maxLength={20}
                  placeholder="0000000"
                />
                {errors.conta && <p className="text-sm text-destructive">{errors.conta}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="conta_dv">Dígito da Conta</Label>
                <Input
                  id="conta_dv"
                  value={formData.conta_dv}
                  onChange={(e) => updateField('conta_dv', e.target.value.replace(/[^0-9xX]/g, '').slice(0, 2).toUpperCase())}
                  maxLength={2}
                  placeholder="0 ou X"
                />
                {errors.conta_dv && <p className="text-sm text-destructive">{errors.conta_dv}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tipo_conta">Tipo de Conta</Label>
                <Select
                  value={formData.tipo_conta || 'none'}
                  onValueChange={(value) => updateField('tipo_conta', value === 'none' ? '' : value)}
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
                {errors.tipo_conta && <p className="text-sm text-destructive">{errors.tipo_conta}</p>}
              </div>
            </div>
          </div>





          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : isEditing ? 'Atualizar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {submitStatus && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`bg-background border-4 ${
            submitStatus.type === 'success' ? 'border-green-500' : 'border-red-500'
          } rounded-2xl p-10 max-w-lg w-full shadow-2xl relative`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center ${
                submitStatus.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 animate-pulse'
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}
            >
              {submitStatus.type === 'success' ? (
                <CheckCircle2 className="w-16 h-16 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-16 h-16 text-red-600 dark:text-red-400" />
              )}
            </div>
            <h2
              className={`text-3xl font-bold ${
                submitStatus.type === 'success'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {submitStatus.type === 'success' ? 'Cadastro realizado!' : 'Erro ao cadastrar'}
            </h2>
            <p className="text-lg text-foreground font-medium">
              {submitStatus.message}
            </p>
            {submitStatus.type === 'success' && (
              <p className="text-sm text-red-600 font-semibold">
                Guarde seu Código de Acesso. Confira também sua caixa de Spam.
              </p>
            )}
            <Button
              type="button"
              onClick={() => {
                if (submitStatus.type === 'success') {
                  onOpenChange(false);
                }
                setSubmitStatus(null);
              }}
              className={`mt-2 text-white px-10 py-3 text-lg font-semibold ${
                submitStatus.type === 'success'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitStatus.type === 'success' ? 'Continuar' : 'Fechar'}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
