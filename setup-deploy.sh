#!/bin/bash

# Nome exato do seu repositório
NOME_PROJETO="gestaoconcurso-v2"

# Caminhos dos arquivos
CAMINHO_CHAVE="$HOME/.ssh/${NOME_PROJETO}_deploy"
ARQUIVO_CONFIG="$HOME/.ssh/config"

echo "🚀 Iniciando configuração da Deploy Key para o projeto: $NOME_PROJETO"

# Garantir que a pasta .ssh existe com as permissões corretas
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# 1. Gerar a chave SSH (sem senha)
if [ ! -f "$CAMINHO_CHAVE" ]; then
    echo "🔑 Gerando chave SSH ed25519..."
    ssh-keygen -t ed25519 -f "$CAMINHO_CHAVE" -N "" -C "deploy-$NOME_PROJETO"
    echo "✅ Chave gerada em $CAMINHO_CHAVE"
else
    echo "⚠️ A chave $CAMINHO_CHAVE já existe. Pulando a etapa de geração."
fi

# 2. Configurar o ~/.ssh/config
echo "⚙️ Configurando o arquivo SSH..."
touch "$ARQUIVO_CONFIG"

# Verifica se o host já existe para não duplicar
if ! grep -q "Host github.com-$NOME_PROJETO" "$ARQUIVO_CONFIG"; then
    cat <<EOF >> "$ARQUIVO_CONFIG"

Host github.com-$NOME_PROJETO
  HostName github.com
  User git
  IdentityFile $CAMINHO_CHAVE
  IdentitiesOnly yes
EOF
    echo "✅ Configuração adicionada ao $ARQUIVO_CONFIG"
else
    echo "⚠️ O host github.com-$NOME_PROJETO já está configurado no $ARQUIVO_CONFIG."
fi

# Ajustar as permissões de segurança dos arquivos
chmod 600 "$CAMINHO_CHAVE"
chmod 644 "${CAMINHO_CHAVE}.pub"
chmod 600 "$ARQUIVO_CONFIG"

# 3. Exibir a chave pública e as instruções finais
echo ""
echo "======================================================="
echo "🎉 CONFIGURAÇÃO LOCAL CONCLUÍDA!"
echo "======================================================="
echo "👉 PASSO 1: Copie a chave abaixo e adicione em Settings > Deploy keys no GitHub:"
echo "🔗 Link direto: https://github.com/SEU_USUARIO/$NOME_PROJETO/settings/keys"
echo ""
cat "${CAMINHO_CHAVE}.pub"
echo ""
echo "-------------------------------------------------------"
echo "👉 PASSO 2: Na pasta do seu projeto local, execute o comando abaixo"
echo "   (lembre-se de trocar SEU_USUARIO pelo seu nome de usuário do GitHub):"
echo ""
echo "git remote set-url origin git@github.com-$NOME_PROJETO:SEU_USUARIO/$NOME_PROJETO.git"
echo "======================================================="
