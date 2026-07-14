import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Upload, Play, Pause, Square, CheckCircle2, XCircle, ArrowLeft, ArrowRight, FileSpreadsheet, Users, Info, Link2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ESTADO_CIVIL_MAP, RACA_MAP, GRAU_INSTRUCAO_MAP } from '@/lib/constants';

// Colunas da tabela colaboradores (banco de dados)
const COLUNAS_BANCO = [
  { key: 'colab_matricula', label: 'Matrícula', obrigatorio: false },
  { key: 'colab_nome_completo', label: 'Nome Completo', obrigatorio: true },
  { key: 'colab_cpf', label: 'CPF', obrigatorio: true },
  { key: 'colab_data_nascimento', label: 'Data de Nascimento', obrigatorio: true },
  { key: 'colab_nacionalidade', label: 'Nacionalidade', obrigatorio: false },
  { key: 'colab_pis', label: 'PIS', obrigatorio: false },
  { key: 'colab_rua', label: 'Rua', obrigatorio: false },
  { key: 'colab_numero_casa', label: 'Número da Casa', obrigatorio: false },
  { key: 'colab_bairro', label: 'Bairro', obrigatorio: false },
  { key: 'colab_cidade', label: 'Cidade', obrigatorio: false },
  { key: 'colab_cep', label: 'CEP', obrigatorio: false },
  { key: 'colab_estado_civil', label: 'Estado Civil', obrigatorio: false },
  { key: 'colab_raca', label: 'Raça', obrigatorio: false },
  { key: 'colab_grau_instrucao', label: 'Grau de Instrução', obrigatorio: false },
  { key: 'colab_telefone', label: 'Telefone', obrigatorio: false },
  { key: 'colab_complemento_endereco', label: 'Complemento', obrigatorio: false },
  { key: 'colab_deficiente', label: 'Deficiente', obrigatorio: false },
  { key: 'colab_email', label: 'E-mail', obrigatorio: false },
  { key: 'colab_chave_pix', label: 'Chave PIX', obrigatorio: false },
];

// Limites de tamanho das colunas do banco (character varying/character)
const LIMITES_COLUNAS: Record<string, number> = {
  colab_matricula: 6,
  colab_nome_completo: 40,
  colab_cpf: 11,
  colab_nacionalidade: 10,
  colab_pis: 11,
  colab_rua: 34,
  colab_bairro: 26,
  colab_cidade: 15,
  colab_complemento_endereco: 20,
  colab_email: 255,
  colab_chave_pix: 255,
};

const COLUNAS_TEMPLATE = [
  'matricula',
  'nome_completo',
  'cpf',
  'data_nascimento',
  'nacionalidade',
  'pis',
  'rua',
  'numero_casa',
  'bairro',
  'cidade',
  'cep',
  'estado_civil',
  'raca',
  'grau_instrucao',
  'telefone',
  'complemento_endereco',
  'deficiente',
  'email',
  'chave_pix'
];

const EXEMPLO_LINHA = {
  matricula: '12345',
  nome_completo: 'João da Silva',
  cpf: '12345678901',
  data_nascimento: '1990-05-15',
  nacionalidade: 'Brasileira',
  pis: '12345678901',
  rua: 'Rua das Flores',
  numero_casa: '100',
  bairro: 'Centro',
  cidade: 'São Paulo',
  cep: '01234567',
  estado_civil: '1',
  raca: '1',
  grau_instrucao: '7',
  telefone: '11999998888',
  complemento_endereco: 'Apto 101',
  deficiente: 'false',
  email: 'joao@email.com',
  chave_pix: 'joao@email.com'
};

// Função para normalizar texto (remover acentos, espaços, underscores e converter para minúsculas)
const normalizarTexto = (texto: string): string => {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[_\s-]/g, '') // Remove underscores, espaços e hífens
    .trim();
};

export default function CadastroLote() {
  const { user, loading, isAdmin, isCoordenador } = useAuth();
  const navigate = useNavigate();
  
  const [passoAtual, setPassoAtual] = useState(1);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dadosImportados, setDadosImportados] = useState<any[]>([]);
  const [colunasExcel, setColunasExcel] = useState<string[]>([]);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  
  const [processando, setProcessando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [parado, setParado] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sucessos, setSucessos] = useState(0);
  const [erros, setErros] = useState(0);
  const [avisos, setAvisos] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [registrosNaoIncluidos, setRegistrosNaoIncluidos] = useState<{ nome: string; cpf: string }[]>([]);
  const [errosPorTipo, setErrosPorTipo] = useState<Record<string, number>>({});
  const [resultadosLinhas, setResultadosLinhas] = useState<{ status: string; mensagem: string }[]>([]);


  
  const logRef = useRef<HTMLTextAreaElement>(null);
  const pausadoRef = useRef(false);
  const paradoRef = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && !isAdmin && !isCoordenador) {
      navigate('/');
    }
  }, [user, loading, isAdmin, isCoordenador, navigate]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  if (loading || !user || (!isAdmin && !isCoordenador)) return null;

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([EXEMPLO_LINHA], { header: COLUNAS_TEMPLATE });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores');
    
    // Ajustar largura das colunas
    ws['!cols'] = COLUNAS_TEMPLATE.map(col => ({ wch: Math.max(col.length, 15) }));
    
    XLSX.writeFile(wb, 'template_colaboradores.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setArquivo(file);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Pegar cabeçalhos
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      if (jsonData.length < 2) {
        return;
      }
      
      const cabecalhos = (jsonData[0] as any[]).map(c => c?.toString() || '');
      setColunasExcel(cabecalhos);
      
      // Converter para array de objetos (ignorando linha de cabeçalho)
      const dados = XLSX.utils.sheet_to_json(sheet) as any[];
      
      // Filtrar linha de exemplo se existir
      const dadosFiltrados = dados.filter(linha => 
        linha.cpf?.toString() !== '12345678901' && 
        linha.nome_completo !== 'João da Silva'
      );
      
      setDadosImportados(dadosFiltrados);
      
      // Auto-mapeamento baseado em similaridade de nomes
      const mapeamentoInicial: Record<string, string> = {};
      
      COLUNAS_BANCO.forEach(col => {
        // Normalizar nome da coluna do banco para comparação
        const nomeBancoNormalizado = normalizarTexto(col.key.replace('colab_', ''));
        const labelNormalizado = normalizarTexto(col.label);
        
        // Procurar coluna do Excel que seja similar
        const colunaExcelCorrespondente = cabecalhos.find(colunaExcel => {
          const colunaExcelNormalizada = normalizarTexto(colunaExcel);
          return (
            colunaExcelNormalizada === nomeBancoNormalizado ||
            colunaExcelNormalizada === labelNormalizado ||
            colunaExcelNormalizada.includes(nomeBancoNormalizado) ||
            nomeBancoNormalizado.includes(colunaExcelNormalizada) ||
            colunaExcelNormalizada.includes(labelNormalizado) ||
            labelNormalizado.includes(colunaExcelNormalizada)
          );
        });
        
        mapeamentoInicial[col.key] = colunaExcelCorrespondente || '';
      });
      
      setMapeamento(mapeamentoInicial);
      
    } catch (error) {
      console.error('Erro ao ler arquivo:', error);
    }
  };

  const handleMapeamentoChange = (colunaBanco: string, colunaExcel: string) => {
    setMapeamento(prev => ({
      ...prev,
      [colunaBanco]: colunaExcel === '__NONE__' ? '' : colunaExcel
    }));
  };

  const mapeamentoCompleto = () => {
    // Verificar se todos os campos obrigatórios estão mapeados
    const obrigatorios = COLUNAS_BANCO.filter(c => c.obrigatorio);
    return obrigatorios.every(col => mapeamento[col.key] && mapeamento[col.key] !== '');
  };

  // Determina o tipo amigável de erro para agrupamento
  const obterTipoErro = (mensagem: string): string => {
    const m = mensagem.toLowerCase();
    if (m.includes('cpf já cadastrado')) return 'CPF duplicado';
    if (m.includes('matrícula já cadastrada')) return 'Matrícula duplicada';
    if (m.includes('pis já cadastrado')) return 'PIS duplicado';
    if (m.includes('colab_email')) return 'E-mail duplicado';
    if (m.includes('colab_chave_pix')) return 'Chave PIX duplicada';
    if (m.includes('registro duplicado')) return 'Duplicidade';
    if (m.includes('excede o tamanho permitido') || m.includes('value too long')) return 'Tamanho excedido';
    if (m.includes('data inválida') || m.includes('date/time field value out of range') || m.includes('invalid input syntax for type date')) return 'Data inválida';
    if (m.includes('formato inválido') || m.includes('invalid input syntax')) return 'Formato inválido';
    if (m.includes('campo obrigatório') || m.includes('null value') || m.includes('campos obrigatórios faltando')) return 'Campo obrigatório';
    return 'Outros';
  };

  // Converte data serial do Excel (ou string ddmmaaaa / dd/mm/aaaa) para YYYY-MM-DD
  const converterDataExcel = (valor: any): string => {
    if (valor === undefined || valor === null || valor === '') {
      return '';
    }

    const numeroSerial = Number(valor);
    if (!isNaN(numeroSerial) && Number.isInteger(numeroSerial) && typeof valor !== 'string') {
      // Data base: 20/12/1899 (conforme especificado)
      const dataBase = new Date(1899, 11, 20);
      const dataConvertida = new Date(dataBase.getTime() + numeroSerial * 24 * 60 * 60 * 1000);

      const ano = dataConvertida.getFullYear();
      const mes = String(dataConvertida.getMonth() + 1).padStart(2, '0');
      const dia = String(dataConvertida.getDate()).padStart(2, '0');

      return `${ano}-${mes}-${dia}`;
    }

    const texto = valor.toString().trim();

    // Já em formato ISO YYYY-MM-DD
    let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // Formato dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa (aceita 1 ou 2 dígitos para dia/mês)
    m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const dia = m[1].padStart(2, '0');
      const mes = m[2].padStart(2, '0');
      return `${m[3]}-${mes}-${dia}`;
    }

    // Formato ddmmaaaa (8 dígitos, sem separador)
    const soDigitos = texto.replace(/\D/g, '');
    if (soDigitos.length === 8) {
      const dia = soDigitos.slice(0, 2);
      const mes = soDigitos.slice(2, 4);
      const ano = soDigitos.slice(4, 8);
      return `${ano}-${mes}-${dia}`;
    }

    return texto;
  };


  const formatarDados = (linha: any) => {
    const getValor = (colunaBanco: string) => {
      const colunaExcel = mapeamento[colunaBanco];
      if (!colunaExcel) return null;
      return linha[colunaExcel];
    };

    const colaborador = {
      colab_matricula: getValor('colab_matricula')?.toString() || null,
      colab_nome_completo: getValor('colab_nome_completo')?.toString() || '',
      colab_cpf: getValor('colab_cpf')?.toString().replace(/\D/g, '').padStart(11, '0') || '',
      colab_data_nascimento: converterDataExcel(getValor('colab_data_nascimento')),
      colab_nacionalidade: getValor('colab_nacionalidade')?.toString() || null,
      colab_pis: getValor('colab_pis')?.toString().replace(/\D/g, '') || null,
      colab_rua: getValor('colab_rua')?.toString() || null,
      colab_numero_casa: getValor('colab_numero_casa') ? parseInt(getValor('colab_numero_casa').toString()) : null,
      colab_bairro: getValor('colab_bairro')?.toString() || null,
      colab_cidade: getValor('colab_cidade')?.toString() || null,
      colab_cep: getValor('colab_cep') ? parseInt(getValor('colab_cep').toString().replace(/\D/g, '')) : null,
      colab_estado_civil: getValor('colab_estado_civil') ? parseInt(getValor('colab_estado_civil').toString()) : null,
      colab_raca: getValor('colab_raca') ? parseInt(getValor('colab_raca').toString()) : null,
      colab_grau_instrucao: getValor('colab_grau_instrucao') ? parseInt(getValor('colab_grau_instrucao').toString()) : null,
      colab_telefone: getValor('colab_telefone') ? parseInt(getValor('colab_telefone').toString().replace(/\D/g, '')) : null,
      colab_complemento_endereco: getValor('colab_complemento_endereco')?.toString() || null,
      colab_deficiente: getValor('colab_deficiente')?.toString().toLowerCase() === 'true',
      colab_email: getValor('colab_email')?.toString() || null,
      colab_chave_pix: getValor('colab_chave_pix')?.toString() || null
    };

    // Truncamento silencioso para campos textuais tolerantes: mantém apenas o número máximo de caracteres
    const CAMPOS_TRUNCAR = ['colab_nome_completo', 'colab_complemento_endereco', 'colab_rua', 'colab_bairro'];
    for (const campo of CAMPOS_TRUNCAR) {
      const valor = (colaborador as any)[campo];
      const limite = LIMITES_COLUNAS[campo];
      if (valor && typeof valor === 'string' && limite && valor.length > limite) {
        (colaborador as any)[campo] = valor.slice(0, limite);
      }
    }

    // Pré-validação de tamanho dos campos para identificar a coluna excedida (ignora campos truncados)
    for (const [campo, limite] of Object.entries(LIMITES_COLUNAS)) {
      if (CAMPOS_TRUNCAR.includes(campo)) continue;
      const valor = (colaborador as any)[campo];
      if (valor && typeof valor === 'string' && valor.length > limite) {
        const colunaExcel = mapeamento[campo];
        const label = COLUNAS_BANCO.find(c => c.key === campo)?.label || campo;
        throw new Error(`TAMANHO_EXCEDIDO|${campo}|${colunaExcel || 'N/A'}|${label}|${limite}`);
      }
    }

    return colaborador;
  };

  const processarColaboradores = async () => {
    setProcessando(true);
    setPausado(false);
    setParado(false);
    pausadoRef.current = false;
    paradoRef.current = false;
    setLog([]);
    setSucessos(0);
    setErros(0);
    setAvisos(0);
    setProgresso(0);
    setRegistrosNaoIncluidos([]);
    setErrosPorTipo({});
    setResultadosLinhas([]);

    
    
    for (let i = 0; i < dadosImportados.length; i++) {
      if (paradoRef.current) {
        setLog(prev => [...prev, `⏹️ Processamento interrompido pelo usuário na linha ${i + 1}`]);
        break;
      }
      
      while (pausadoRef.current && !paradoRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (paradoRef.current) {
        setLog(prev => [...prev, `⏹️ Processamento interrompido pelo usuário na linha ${i + 1}`]);
        break;
      }
      
      const linha = dadosImportados[i];
      const colunaExcelNome = mapeamento['colab_nome_completo'];
      const nomeCompleto = colunaExcelNome ? linha[colunaExcelNome]?.toString() : `Linha ${i + 2}`;

      // ===== 1ª VALIDAÇÃO: CPF (formato + duplicidade como aviso) =====
      const colunaExcelCpfPre = mapeamento['colab_cpf'];
      const cpfRaw = colunaExcelCpfPre ? linha[colunaExcelCpfPre] : null;
      const cpfNormalizado = (cpfRaw?.toString() || '').replace(/\D/g, '').padStart(11, '0');

      if (!cpfRaw || cpfNormalizado.length !== 11 || /^0+$/.test(cpfNormalizado)) {
        const msg = 'CPF ausente ou inválido (deve ter 11 dígitos numéricos)';
        setLog(prev => [...prev, `❌ Erro ao cadastrar ${nomeCompleto}: ${msg}`]);
        setErros(prev => prev + 1);
        setErrosPorTipo(prev => ({ ...prev, ['CPF inválido']: (prev['CPF inválido'] || 0) + 1 }));
        setRegistrosNaoIncluidos(prev => [...prev, { nome: nomeCompleto, cpf: cpfNormalizado }]);
        setResultadosLinhas(prev => { const n = [...prev]; n[i] = { status: 'Erro', mensagem: msg }; return n; });
        setProgresso(((i + 1) / dadosImportados.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      const { data: cpfExistente } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('colab_cpf', cpfNormalizado)
        .maybeSingle();

      if (cpfExistente) {
        const msg = 'CPF já cadastrado na base — registro ignorado';
        setLog(prev => [...prev, `⚠️ ${nomeCompleto} — CPF ${cpfNormalizado.slice(0,3)}.${cpfNormalizado.slice(3,6)}.${cpfNormalizado.slice(6,9)}-${cpfNormalizado.slice(9)} já cadastrado (aviso)`]);
        setAvisos(prev => prev + 1);
        setResultadosLinhas(prev => { const n = [...prev]; n[i] = { status: 'Aviso', mensagem: msg }; return n; });
        setProgresso(((i + 1) / dadosImportados.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      try {
        const colaborador = formatarDados(linha);

        if (!colaborador.colab_nome_completo || !colaborador.colab_cpf || !colaborador.colab_data_nascimento) {
          throw new Error('Campos obrigatórios faltando (nome_completo, cpf ou data_nascimento)');
        }
        
        const { error } = await supabase
          .from('colaboradores')
          .insert(colaborador);
        
        if (error) throw error;
        
        setLog(prev => [...prev, `✅ ${nomeCompleto} cadastrado com sucesso`]);
        setSucessos(prev => prev + 1);
        setResultadosLinhas(prev => {
          const next = [...prev];
          next[i] = { status: 'Sucesso', mensagem: 'Cadastrado com sucesso' };
          return next;
        });

        
      } catch (error: any) {
        let mensagemErro = error.message || 'Erro desconhecido';
        let ehAviso = false;

        // Erro pré-validado de tamanho excedido: identifica a coluna exata
        if (typeof mensagemErro === 'string' && mensagemErro.startsWith('TAMANHO_EXCEDIDO|')) {
          const [, campoSupabase, colunaExcel, label, limite] = mensagemErro.split('|');
          mensagemErro = `O campo "${label}" (coluna da planilha: "${colunaExcel}", coluna do banco: "${campoSupabase}") excede o tamanho permitido (máximo ${limite} caracteres). Reduza o valor e tente novamente.`;
        } else if (error.code === '23505') {
          if (error.message?.includes('colab_cpf')) {
            mensagemErro = 'CPF já cadastrado na base — registro ignorado';
            ehAviso = true;
          } else if (error.message?.includes('colab_matricula')) {
            mensagemErro = 'Matrícula já cadastrada no sistema';
          } else if (error.message?.includes('colab_pis')) {
            mensagemErro = 'PIS já cadastrado no sistema';
          } else {
            mensagemErro = 'Registro duplicado no sistema';
          }
        } else if (error.code === '22001' || /value too long/i.test(error.message || '')) {
          const match = (error.message || '').match(/character varying\((\d+)\)/i);
          const limite = match ? ` (máximo ${match[1]} caracteres)` : '';
          const campoMap: Record<string, string> = {
            colab_matricula: 'Matrícula',
            colab_nome_completo: 'Nome Completo',
            colab_cpf: 'CPF',
            colab_nacionalidade: 'Nacionalidade',
            colab_pis: 'PIS',
            colab_rua: 'Rua',
            colab_bairro: 'Bairro',
            colab_cidade: 'Cidade',
            colab_complemento_endereco: 'Complemento',
            colab_email: 'E-mail',
            colab_chave_pix: 'Chave PIX',
          };
          const campoExcedido = Object.entries(campoMap).find(([k]) => error.message?.includes(k));
          mensagemErro = campoExcedido
            ? `O campo "${campoExcedido[1]}" excede o tamanho permitido${limite}. Reduza o valor e tente novamente.`
            : `Um dos campos excede o tamanho permitido${limite}. Verifique os dados e tente novamente.`;
        } else if (error.code === '22008' || error.code === '22007' || /date\/time field value out of range|invalid input syntax for type date/i.test(error.message || '')) {
          mensagemErro = 'Data inválida. Use o formato DD/MM/AAAA ou DDMMAAAA (ex.: 26/11/1971 ou 26111971).';
        } else if (error.code === '22P02' || /invalid input syntax/i.test(error.message || '')) {
          mensagemErro = 'Formato inválido em um dos campos. Verifique números, datas e códigos.';
        } else if (error.code === '23502' || /null value/i.test(error.message || '')) {
          mensagemErro = 'Campo obrigatório não preenchido na planilha.';
        }


        // Formatar dados da linha para exibição
        const dadosLinha = Object.entries(mapeamento)
          .filter(([_, colunaExcel]) => colunaExcel)
          .map(([colunaBanco, colunaExcel]) => {
            const valor = linha[colunaExcel];
            const label = COLUNAS_BANCO.find(c => c.key === colunaBanco)?.label || colunaBanco;
            return `${label}: ${valor !== undefined && valor !== null && valor !== '' ? valor : '(vazio)'}`;
          }).join(' | ');

        if (ehAviso) {
          setLog(prev => [...prev, `⚠️ ${nomeCompleto}: ${mensagemErro}`]);
          setAvisos(prev => prev + 1);
          setResultadosLinhas(prev => {
            const next = [...prev];
            next[i] = { status: 'Aviso', mensagem: mensagemErro };
            return next;
          });
        } else {
          setLog(prev => [
            ...prev,
            `❌ Erro ao cadastrar ${nomeCompleto}: ${mensagemErro}`,
            `   📋 Dados da linha ${i + 2}: ${dadosLinha}`
          ]);
          setErros(prev => prev + 1);

          const tipoErro = obterTipoErro(mensagemErro);
          setErrosPorTipo(prev => ({
            ...prev,
            [tipoErro]: (prev[tipoErro] || 0) + 1
          }));

          const colunaExcelCpf = mapeamento['colab_cpf'];
          const cpfValue = colunaExcelCpf ? linha[colunaExcelCpf]?.toString().padStart(11, '0') : '';
          setRegistrosNaoIncluidos(prev => [...prev, { nome: nomeCompleto, cpf: cpfValue }]);
          setResultadosLinhas(prev => {
            const next = [...prev];
            next[i] = { status: 'Erro', mensagem: mensagemErro };
            return next;
          });
        }

      }
      
      setProgresso(((i + 1) / dadosImportados.length) * 100);
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    setProcessando(false);
    setPausado(false);
    setFinalizado(true);
  };

  const handlePauseResume = () => {
    if (pausado) {
      pausadoRef.current = false;
      setPausado(false);
      setLog(prev => [...prev, `▶️ Processamento retomado`]);
    } else {
      pausadoRef.current = true;
      setPausado(true);
      setLog(prev => [...prev, `⏸️ Processamento pausado`]);
    }
  };

  const handleStop = () => {
    paradoRef.current = true;
    setParado(true);
    pausadoRef.current = false;
    setPausado(false);
  };

  const resetar = () => {
    setPassoAtual(1);
    setArquivo(null);
    setDadosImportados([]);
    setColunasExcel([]);
    setMapeamento({});
    setProcessando(false);
    setPausado(false);
    setParado(false);
    pausadoRef.current = false;
    paradoRef.current = false;
    setFinalizado(false);
    setLog([]);
    setSucessos(0);
    setErros(0);
    setAvisos(0);
    setProgresso(0);
    setRegistrosNaoIncluidos([]);
    setErrosPorTipo({});
    setResultadosLinhas([]);
  };

  const handleDownloadRelatorio = () => {
    if (dadosImportados.length === 0) return;
    const cabecalhos = colunasExcel.length > 0 ? colunasExcel : Object.keys(dadosImportados[0] || {});
    const headerFinal = [...cabecalhos, 'Resultado', 'Detalhes'];
    const rows = dadosImportados.map((linha, idx) => {
      const base: Record<string, any> = {};
      cabecalhos.forEach(c => { base[c] = linha[c] ?? ''; });
      const r = resultadosLinhas[idx];
      base['Resultado'] = r?.status || 'Não processado';
      base['Detalhes'] = r?.mensagem || '';
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: headerFinal });
    ws['!cols'] = headerFinal.map(h => ({ wch: Math.max(h.length, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    const nomeBase = arquivo?.name?.replace(/\.(xlsx|xls)$/i, '') || 'cadastro_lote';
    XLSX.writeFile(wb, `${nomeBase}_relatorio.xlsx`);
  };


  const passos = [
    { numero: 1, titulo: 'Download Template', icone: Download },
    { numero: 2, titulo: 'Upload', icone: Upload },
    { numero: 3, titulo: 'Mapeamento', icone: Link2 },
    { numero: 4, titulo: 'Processamento', icone: Play }
  ];

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-5xl">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Cadastro em Lote</h1>
            <p className="text-muted-foreground">Importe múltiplos colaboradores via planilha Excel</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          {passos.map((passo, index) => (
            <div key={passo.numero} className="flex items-center">
              <div className={`flex flex-col items-center ${passoAtual >= passo.numero ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${
                  passoAtual > passo.numero 
                    ? 'bg-primary border-primary text-primary-foreground' 
                    : passoAtual === passo.numero 
                      ? 'border-primary bg-primary/10' 
                      : 'border-muted'
                }`}>
                  {passoAtual > passo.numero ? (
                    <CheckCircle2 className="h-6 w-6" />
                  ) : (
                    <passo.icone className="h-5 w-5" />
                  )}
                </div>
                <span className="text-xs mt-2 font-medium">{passo.titulo}</span>
              </div>
              {index < passos.length - 1 && (
                <div className={`w-16 h-0.5 mx-2 transition-colors ${
                  passoAtual > passo.numero ? 'bg-primary' : 'bg-muted'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Conteúdo dos Passos */}
        <Card className="relative">
          {finalizado && (
            <div className="absolute top-4 right-4 z-10">
              <Button onClick={handleDownloadRelatorio} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Relatório de Inserção
              </Button>
            </div>
          )}

          {passoAtual === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Passo 1: Download do Template
                </CardTitle>
                <CardDescription>
                  Baixe o template Excel com todas as colunas necessárias para o cadastro em lote.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Colunas do Template:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {COLUNAS_TEMPLATE.map((col, i) => (
                      <div key={col} className="flex items-center gap-2">
                        <span className="text-muted-foreground">{i + 1}.</span>
                        <span className={['nome_completo', 'cpf', 'data_nascimento'].includes(col) ? 'font-semibold text-primary' : ''}>
                          {col}
                          {['nome_completo', 'cpf', 'data_nascimento'].includes(col) && ' *'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">* Campos obrigatórios</p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <Info className="h-4 w-4" />
                    Valores Válidos para Colunas Específicas
                  </h4>
                  
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-background/50 p-3 rounded-md">
                      <h5 className="font-medium text-sm mb-2">Estado Civil</h5>
                      <ul className="text-xs space-y-1">
                        {Object.entries(ESTADO_CIVIL_MAP).map(([value, label]) => (
                          <li key={value} className="flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-semibold">{value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-background/50 p-3 rounded-md">
                      <h5 className="font-medium text-sm mb-2">Raça</h5>
                      <ul className="text-xs space-y-1">
                        {Object.entries(RACA_MAP).map(([value, label]) => (
                          <li key={value} className="flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-semibold">{value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-background/50 p-3 rounded-md">
                      <h5 className="font-medium text-sm mb-2">Grau de Instrução</h5>
                      <ul className="text-xs space-y-1">
                        {Object.entries(GRAU_INSTRUCAO_MAP).map(([value, label]) => (
                          <li key={value} className="flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-semibold">{value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-3">
                    Use apenas os números indicados na planilha para estas colunas.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleDownloadTemplate} className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Template Excel
                  </Button>
                  <Button onClick={() => setPassoAtual(2)} variant="outline" className="flex-1">
                    Próximo Passo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {passoAtual === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Passo 2: Upload do Arquivo
                </CardTitle>
                <CardDescription>
                  Faça upload do arquivo Excel preenchido.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">Clique para selecionar o arquivo</p>
                    <p className="text-sm text-muted-foreground">Formatos aceitos: .xlsx, .xls</p>
                  </label>
                </div>

                {arquivo && (
                  <div className="bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 p-4 rounded-lg flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Arquivo carregado: {arquivo.name}</p>
                      <p className="text-sm">{dadosImportados.length} linha(s) de dados encontrada(s).</p>
                      <p className="text-sm">{colunasExcel.length} coluna(s) identificada(s).</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button onClick={() => setPassoAtual(1)} variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                  </Button>
                  <Button 
                    onClick={() => setPassoAtual(3)} 
                    disabled={!arquivo || colunasExcel.length === 0}
                    className="flex-1"
                  >
                    Próximo Passo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {passoAtual === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Passo 3: Mapeamento de Colunas
                </CardTitle>
                <CardDescription>
                  Relacione cada coluna da tabela de colaboradores com a coluna correspondente do arquivo Excel.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-md border overflow-auto max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-1/2">Coluna do Banco de Dados</TableHead>
                        <TableHead className="w-1/2">Coluna do Excel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {COLUNAS_BANCO.map((coluna) => (
                        <TableRow key={coluna.key}>
                          <TableCell>
                            <span className={coluna.obrigatorio ? 'font-semibold text-primary' : ''}>
                              {coluna.label}
                              {coluna.obrigatorio && ' *'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mapeamento[coluna.key] || '__NONE__'}
                              onValueChange={(value) => handleMapeamentoChange(coluna.key, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a coluna" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__NONE__">— Não mapear —</SelectItem>
                                {colunasExcel.map((col) => (
                                  <SelectItem key={col} value={col}>
                                    {col}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <p className="text-xs text-muted-foreground">* Campos obrigatórios devem ser mapeados</p>

                {!mapeamentoCompleto() && (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 p-4 rounded-lg flex items-start gap-2">
                    <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <p>Mapeie os campos obrigatórios (Nome Completo, CPF e Data de Nascimento) para continuar.</p>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button onClick={() => setPassoAtual(2)} variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                  </Button>
                  <Button 
                    onClick={() => setPassoAtual(4)} 
                    disabled={!mapeamentoCompleto()}
                    className="flex-1"
                  >
                    Próximo Passo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {passoAtual === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Passo 4: Processamento
                </CardTitle>
                <CardDescription>
                  {!processando && !finalizado && `Pronto para cadastrar ${dadosImportados.length} colaborador(es).`}
                  {processando && 'Processando cadastros...'}
                  {finalizado && 'Processamento concluído!'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!processando && !finalizado && (
                  <div className="flex gap-4">
                    <Button onClick={() => setPassoAtual(3)} variant="outline">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Voltar
                    </Button>
                    <Button onClick={processarColaboradores} className="flex-1">
                      <Play className="mr-2 h-4 w-4" />
                      Iniciar Cadastro em Lote
                    </Button>
                  </div>
                )}

                {(processando || finalizado) && (
                  <>
                    {processando && !finalizado && (
                      <div className="flex items-center justify-center gap-4 p-4 bg-muted/50 rounded-lg">
                        <Button
                          variant={pausado ? "default" : "outline"}
                          size="lg"
                          onClick={handlePauseResume}
                          className="flex items-center gap-2"
                        >
                          {pausado ? (
                            <>
                              <Play className="h-5 w-5" />
                              Retomar
                            </>
                          ) : (
                            <>
                              <Pause className="h-5 w-5" />
                              Pausar
                            </>
                          )}
                        </Button>
                        <Button
                          variant="destructive"
                          size="lg"
                          onClick={handleStop}
                          className="flex items-center gap-2"
                        >
                          <Square className="h-5 w-5" />
                          Parar
                        </Button>
                      </div>
                    )}

                    {pausado && (
                      <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-center">
                        <p className="text-amber-700 dark:text-amber-400 font-medium">
                          ⏸️ Processamento pausado - Clique em "Retomar" para continuar
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progresso</span>
                        <span>{Math.round(progresso)}%</span>
                      </div>
                      <Progress value={progresso} className="h-3" />
                    </div>

                    <div className="flex gap-4 text-sm">
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Sucessos: {sucessos}</span>
                      </div>
                      <div className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-4 w-4" />
                        <span>Erros: {erros}</span>
                      </div>
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <Info className="h-4 w-4" />
                        <span>Avisos: {avisos}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Total: {dadosImportados.length}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Log de Processamento:</label>
                      <Textarea
                        ref={logRef}
                        value={log.join('\n')}
                        readOnly
                        className="h-64 font-mono text-sm resize-none"
                        placeholder="O log aparecerá aqui..."
                      />
                    </div>

                    {finalizado && (
                      <>
                        {registrosNaoIncluidos.length > 0 && (
                          <Card className="border-destructive/50 bg-destructive/5">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                                <XCircle className="h-5 w-5" />
                                Registros Não Incluídos ({registrosNaoIncluidos.length})
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="max-h-48 overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-12">Nº</TableHead>
                                      <TableHead>Nome</TableHead>
                                      <TableHead>CPF</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {registrosNaoIncluidos.map((registro, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                                        <TableCell>{registro.nome}</TableCell>
                                        <TableCell className="font-mono">
                                          {registro.cpf ? `${registro.cpf.slice(0, 3)}.${registro.cpf.slice(3, 6)}.${registro.cpf.slice(6, 9)}-${registro.cpf.slice(9)}` : '-'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {Object.keys(errosPorTipo).length > 0 && (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 text-base">
                                <Info className="h-5 w-5" />
                                Erros por Tipo
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="max-h-48 overflow-y-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Tipo de Erro</TableHead>
                                      <TableHead className="w-32 text-right">Quantidade</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {Object.entries(errosPorTipo)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([tipo, quantidade]) => (
                                        <TableRow key={tipo}>
                                          <TableCell>{tipo}</TableCell>
                                          <TableCell className="text-right font-mono font-semibold">{quantidade}</TableCell>
                                        </TableRow>
                                      ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        

                        <div className="flex gap-4">
                          <Button onClick={resetar} variant="outline" className="flex-1">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Novo Cadastro em Lote
                          </Button>
                          <Button onClick={() => navigate('/')} className="flex-1">
                            <Users className="mr-2 h-4 w-4" />
                            Ver Colaboradores
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}
