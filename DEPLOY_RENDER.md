# 🚀 Deploy do Backend no Render

## 📋 Pré-requisitos
- Conta no GitHub
- Conta no Render (gratuita): https://render.com

## 🔧 Passo 1: Preparar o Repositório no GitHub

### 1.1 Criar repositório no GitHub
1. Acesse https://github.com/new
2. Escolha um nome (ex: `hive-backend`)
3. Marque como **Público** (importante para Render free tier)
4. **NÃO** adicione README, .gitignore ou licença (já temos)
5. Clique em "Create repository"

### 1.2 Fazer commit e push do código
Abra o terminal na pasta do projeto e execute:

```bash
# Inicializar git (se ainda não foi feito)
git init

# Adicionar arquivos
git add .

# Fazer commit
git commit -m "Initial commit - Hive backend"

# Adicionar o repositório remoto (substitua USERNAME pelo seu usuário)
git remote add origin https://github.com/USERNAME/hive-backend.git

# Enviar para o GitHub
git branch -M main
git push -u origin main
```

## 🌐 Passo 2: Criar Web Service no Render

### 2.1 Acessar o Render
1. Acesse https://render.com
2. Faça login com sua conta
3. Clique em "New +" no canto superior direito
4. Selecione "Web Service"

### 2.2 Conectar ao GitHub
1. Clique em "Connect account" para conectar ao GitHub
2. Autorize o Render a acessar seus repositórios
3. Selecione o repositório que você criou (`hive-backend`)
4. Clique em "Connect"

### 2.3 Configurar o Web Service

Preencha os campos:

**Name:** `hive-backend` (ou o nome que preferir)

**Region:** `Oregon (US West)` (ou a região mais próxima)

**Branch:** `main`

**Root Directory:** (deixe em branco)

**Runtime:** `Node`

**Build Command:**
```
npm install
```

**Start Command:**
```
node server.cjs
```

**Instance Type:** `Free`

### 2.4 Adicionar Variáveis de Ambiente

Na seção "Environment Variables", clique em "Add Environment Variable" e adicione:

1. **PORT**
   - Value: `3000`

2. **NODE_ENV**
   - Value: `production`

3. **ALLOWED_ORIGINS**
   - Value: `https://seu-frontend.vercel.app` (você vai atualizar isso depois)
   - Ou use `*` temporariamente para aceitar qualquer origem

4. **GEMINI_API_KEY** (opcional, só se usar bot)
   - Value: `AIzaSyAvEcX6wt-2zz_YMOzqcpKqxeaWA7rgGn8`

### 2.5 Criar o Web Service
1. Clique em "Create Web Service"
2. Aguarde o deploy (pode levar 2-5 minutos)
3. Quando aparecer "Live", seu backend está no ar! 🎉

## 📝 Passo 3: Copiar a URL do Backend

1. Na página do seu Web Service no Render, você verá uma URL como:
   ```
   https://hive-backend-xxxx.onrender.com
   ```

2. **COPIE ESTA URL** - você vai precisar dela para o frontend!

## ✅ Passo 4: Testar o Backend

### 4.1 Testar se está funcionando
Abra no navegador:
```
https://seu-app.onrender.com
```

Você deve ver uma resposta do servidor ou erro CORS (normal, pois não configuramos o frontend ainda).

### 4.2 Testar WebSocket
Use uma ferramenta como Postman ou um cliente Socket.IO para testar a conexão.

## 🔄 Passo 5: Atualizar Variável ALLOWED_ORIGINS (depois do deploy do frontend)

Quando você fizer deploy do frontend na Vercel:

1. Copie a URL do frontend (ex: `https://seu-jogo.vercel.app`)
2. Volte ao Render
3. Vá em "Environment" do seu Web Service
4. Edite a variável `ALLOWED_ORIGINS`
5. Adicione a URL do frontend:
   ```
   https://seu-jogo.vercel.app,http://localhost:5173
   ```
6. Clique em "Save Changes"
7. O Render vai fazer redeploy automaticamente

## 🐛 Problemas Comuns

### "Build failed"
- Verifique se o `package.json` está commitado
- Verifique se o `server.cjs` está commitado
- Veja os logs no Render para detalhes do erro

### "Application failed to respond"
- Verifique se o Start Command está correto: `node server.cjs`
- Verifique se a porta está configurada corretamente
- Veja os logs no Render

### "CORS errors"
- Adicione a URL do frontend em `ALLOWED_ORIGINS`
- Use `*` temporariamente para debug (não recomendado em produção)

### O serviço fica "dormindo" (Free Tier)
- O Render free tier coloca o serviço em sleep após 15 minutos sem uso
- A primeira requisição após o sleep pode demorar 30-50 segundos
- Isso é normal no plano gratuito

## 📊 Monitoramento

No dashboard do Render você pode:
- Ver logs em tempo real
- Monitorar uso de recursos
- Ver deploys anteriores
- Configurar alertas

## 🔐 Segurança

**IMPORTANTE:**
- Nunca commite o arquivo `.env` no GitHub
- Use as Environment Variables do Render para secrets
- O `.gitignore` já está configurado para proteger o `.env`

## 🎯 Próximos Passos

Agora que o backend está no ar:
1. Anote a URL do Render
2. Faça deploy do frontend na Vercel
3. Configure o `VITE_SOCKET_URL` no Vercel para apontar para o Render
4. Volte e atualize o `ALLOWED_ORIGINS` no Render

## 📱 URL Final

Seu backend estará disponível em:
```
https://hive-backend-xxxx.onrender.com
```

**Guarde esta URL** para configurar o frontend!
