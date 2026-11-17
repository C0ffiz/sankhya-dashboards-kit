# Primeiros passos

## 1. Pré-requisitos

- **Node.js 20.19 ou mais recente** (recomendado: 22 LTS). Confira com `node -v`.
- Acesso à **API do Sankhya** (gateway), com as credenciais do passo 3.
- Para publicar: usuário no ERP com acesso ao **Construtor de Componentes de BI**. Para testar sem burocracia, use a **base de testes** (veja [Publicar no ERP](publicar-no-erp.md)).

Não é preciso Python, Java nem servidor local.

## 2. Instalação

```bash
git clone https://github.com/C0ffiz/sankhya-dashboards-kit.git
cd sankhya-dashboards-kit
npm install
```

Para usar o kit dentro de outro projeto, em vez de clonar, veja [Usar como dependência](usar-como-dependencia.md).

## 3. Configurar o `.env`

O `.env` guarda as credenciais da API. Ele só é lido na sua máquina, pelo proxy de desenvolvimento e pela varredura de segredos do build. **Nunca** vai para o GitHub (está no `.gitignore`) nem para o pacote do ERP.

```bash
cp .env.example .env            # Windows (PowerShell): Copy-Item .env.example .env
```

| Variável | O que é |
|---|---|
| `SANKHYA_BASE_URL` | Endereço da API, sem barra no final. Normalmente `https://api.sankhya.com.br`. |
| `SANKHYA_CLIENT_ID` | Client ID do aplicativo cadastrado no Portal do Desenvolvedor Sankhya. |
| `SANKHYA_CLIENT_SECRET` | Client Secret desse aplicativo. |
| `SANKHYA_X_TOKEN` | Token de integração (X-Token) gerado no ERP para esse aplicativo. |

Se você não tem essas credenciais, peça ao administrador do Sankhya. Prefira um aplicativo com **acesso só de leitura** às tabelas que os dashboards consultam.

## 4. Testar a conexão

```bash
npm run novo -- exemplo
npm run dev -- exemplo
```

O navegador abre em `http://127.0.0.1:5173` com a lista de empresas (`TSIEMP`) do seu ERP. O terminal mostra cada consulta: tempo, status e número de linhas.

## Rede com proxy corporativo

Se a sua rede exige proxy (variável `HTTPS_PROXY` definida), o kit liga sozinho o suporte do Node a ele (`NODE_USE_ENV_PROXY=1`, Node 22.21 ou mais recente). Em versões mais antigas do Node, atualize-o ou configure o proxy no sistema.

## Problemas na instalação

| Sintoma | Causa provável |
|---|---|
| `Credenciais ausentes no .env: ...` | O `.env` não existe na raiz ou tem variável vazia. Refaça o passo 3. |
| `SANKHYA_BASE_URL precisa começar com https://` | URL sem `https://`. |
| `Falha na autenticação (HTTP 401/403)` | Client ID, Client Secret ou X-Token errados, ou aplicativo sem permissão. |
| `Falha ao contatar o Sankhya: fetch failed (ENOTFOUND)` | Sem internet, URL errada ou proxy corporativo (veja acima). |
| `Não foi possível usar a porta 8787` | Outro processo usa a porta. Feche-o ou use outra: `PORTA_PROXY=8788 npm run dev -- <nome>`. |
| `Dashboard "x" não encontrado` | Nome errado, ou a pasta não tem `index.html` nem `dashboard.json`. |
| Erro do Oracle (ex.: `ORA-00942`) | O SQL chegou ao ERP: corrija a consulta ou a permissão do usuário da API. |

Problemas **dentro do ERP** (componente não abre, sem dados): [Debug e logs](debug-e-logs.md).
