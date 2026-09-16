/**
 * A matriz da prova objetiva — composição, nota de corte e regras de sala.
 *
 * 🔴 **A soma das disciplinas TEM de fechar com o total declarado.** É a única validação
 * que o material de referência marca como bloqueante, e com razão: prova publicada com
 * soma errada é errata garantida.
 *
 * ⚠️ Ela não é CHECK no banco, e isso é escolha: não dá para expressar agregação de outra
 * tabela numa CHECK, e um trigger recusaria a digitação no meio do caminho — quem monta a
 * matriz preenche uma disciplina por vez, e o estado intermediário é legítimo. Grava-se
 * sempre; quem barra a PUBLICAÇÃO é o linter.
 *
 * Composições reais, que são o controle positivo dos testes:
 *
 * | edital | total | composição |
 * |---|---|---|
 * | 002 Docente I | 50 | 10 Português + 15 Pedagógicos + 25 Específicos |
 * | 003 Enfermeiro | 70 | 10 Português + 10 Legislação SUS + 50 Específicos |
 * | 004 ACS | 50 | 10 Português + 10 Matemática + 30 Específicos |
 */

export interface Disciplina {
  nome_disciplina: string;
  quantidade_questoes: number;
  peso_por_questao: number;
}

export interface ConfigProva {
  total_questoes: number | null;
  duracao_minutos: number | null;
  tempo_minimo_permanencia_minutos: number | null;
  tempo_minimo_levar_caderno_minutos: number | null;
  nota_corte_percentual: number | null;
  permite_zerar_disciplina: boolean | null;
}

export interface AvisoProva {
  severidade: "erro" | "aviso";
  regra: string;
  mensagem: string;
}

export const somaDasQuestoes = (ds: readonly Disciplina[]) =>
  ds.reduce((t, d) => t + (d.quantidade_questoes || 0), 0);

/** O mínimo de acertos para aprovação, a partir do total e do percentual de corte. */
export function minimoParaAprovacao(total: number | null, percentual: number | null): number | null {
  if (!total || !percentual) return null;
  // ⚠️ Arredondamento comum, como nas cotas — e conferido contra os três editais: 50% de
  // 50 é 25 e 50% de 70 é 35, os dois exatos, então nenhum deles exercita a fronteira.
  // Se um dia houver total ímpar com corte de 50%, é aqui que a regra se decide.
  return Math.round((total * percentual) / 100);
}

export function conferirProva(entrada: {
  config: ConfigProva | null;
  disciplinas: readonly Disciplina[];
}): AvisoProva[] {
  const { config, disciplinas } = entrada;
  const avisos: AvisoProva[] = [];
  if (!config) return avisos;

  const soma = somaDasQuestoes(disciplinas);

  if (config.total_questoes !== null && disciplinas.length > 0 && soma !== config.total_questoes) {
    avisos.push({
      severidade: "erro",
      regra: "soma-de-questoes-nao-fecha",
      mensagem: `As disciplinas somam ${soma} questões e o total declarado é ${config.total_questoes}. Prova publicada com soma errada é errata garantida.`,
    });
  }

  if (config.total_questoes !== null && disciplinas.length === 0) {
    avisos.push({
      severidade: "erro",
      regra: "prova-sem-disciplinas",
      mensagem: `A prova declara ${config.total_questoes} questões e nenhuma disciplina foi definida.`,
    });
  }

  // 🔴 A regra do caderno é sobre COMPORTAMENTO no dia da prova, e o banco só barra o
  // caso impossível (levar depois do fim). Levar o caderno no mesmo instante em que a
  // prova acaba é permitido pelo banco e inútil na prática — daí o aviso.
  const { duracao_minutos: dur, tempo_minimo_levar_caderno_minutos: cad } = config;
  if (dur !== null && cad !== null && cad === dur) {
    avisos.push({
      severidade: "aviso",
      regra: "caderno-so-no-fim",
      mensagem: `O candidato só poderia levar o caderno aos ${cad} minutos, que é exatamente o fim da prova. Nos editais de referência são 120 minutos numa prova de 180.`,
    });
  }

  if (config.permite_zerar_disciplina === true) {
    avisos.push({
      severidade: "aviso",
      regra: "permite-zerar-disciplina",
      mensagem:
        "Este edital aprova candidato que zere uma disciplina. Os três editais de referência (002, 003 e 004) exigem 'sem contudo zerar em qualquer uma das áreas'.",
    });
  }

  return avisos;
}
