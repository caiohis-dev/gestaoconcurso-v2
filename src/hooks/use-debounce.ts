import { useEffect, useState } from 'react';

/**
 * Devolve o valor com atraso, reiniciando a contagem a cada mudança.
 *
 * Existe para os PICKERS que buscam no servidor (`/gerenciar-colaboradores-prova` e o
 * substituto de `/ocorrencias-prova`): ali a lista se atualiza enquanto a pessoa digita,
 * então não cabe o botão "Buscar" que `/colaboradores` usa — e sem atraso cada tecla
 * viraria uma requisição.
 *
 * ⚠️ O valor volta ATRASADO por definição. Quem mostra "nenhum resultado" tem de olhar
 * também o `isFetching` da consulta, senão a tela afirma que não há nada durante a janela
 * entre a tecla e a resposta — o padrão "vazio enquanto carrega", que já rendeu defeito
 * neste repo mais de uma vez.
 */
export function useDebounce<T>(valor: T, atrasoMs = 300): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => clearTimeout(id);
  }, [valor, atrasoMs]);

  return atrasado;
}
