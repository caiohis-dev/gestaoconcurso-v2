export const ESTADO_CIVIL_MAP: Record<number, string> = {
  1: 'Solteiro(a)',
  2: 'Casado(a)',
  3: 'Divorciado(a)',
  4: 'Viúvo(a)',
  5: 'Separado(a)',
  6: 'União Estável',
};

export const RACA_MAP: Record<number, string> = {
  1: 'Indígena',
  2: 'Branca',
  4: 'Preta',
  6: 'Amarela',
  8: 'Parda',
  9: 'Não Declarada',
};

export const GRAU_INSTRUCAO_MAP: Record<number, string> = {
  1: 'Analfabeto',
  2: 'Fundamental Incompleto',
  3: 'Fundamental Completo',
  4: 'Médio Incompleto',
  5: 'Médio Completo',
  6: 'Superior Incompleto',
  7: 'Superior Completo',
  8: 'Pós-Graduação',
  9: 'Mestrado',
  10: 'Doutorado',
};

export const ESTADO_CIVIL_OPTIONS = Object.entries(ESTADO_CIVIL_MAP).map(([value, label]) => ({
  value: Number(value),
  label,
}));

export const RACA_OPTIONS = Object.entries(RACA_MAP).map(([value, label]) => ({
  value: Number(value),
  label,
}));

export const GRAU_INSTRUCAO_OPTIONS = Object.entries(GRAU_INSTRUCAO_MAP).map(([value, label]) => ({
  value: Number(value),
  label,
}));
