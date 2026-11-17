# Sankhya Dashboards Kit

Kit para **criar, testar, empacotar e depurar** dashboards HTML5 do **Construtor de Componentes de BI** do Sankhya.

- **Três stacks:** `vite` (padrão, com preview ao vivo e dados reais), `html` (qualquer ferramenta de front-end) e `jsp` (SQL executado no servidor, sem depender de permissão no navegador).
- **Pacote verificado:** o `.zip` sai no formato que o ERP aceita. O build recusa o que já sabemos que dá erro: entrada `index.jsp`, caminho relativo, zip sem entrada de pasta, segredos no pacote.
- **Diagnóstico e emulador:** descubra por que um componente não abre no ERP, com testes em camadas e um relatório para copiar, e teste o pacote na sua máquina antes de subir.
- **Sem segredos no ERP:** as credenciais da API ficam só no seu `.env`, para o preview. Dentro do ERP, o dashboard usa a sessão do usuário logado.

## Início rápido

Pré-requisito: Node.js 20.19 ou mais recente.

```bash
git clone https://github.com/C0ffiz/sankhya-dashboards-kit.git
cd sankhya-dashboards-kit
npm install
cp .env.example .env          # preencha com as credenciais da API (docs/primeiros-passos.md)
npm run novo -- exemplo       # cria dashboards/exemplo/
npm run dev -- exemplo        # abre http://127.0.0.1:5173 com dados reais do seu ERP
npm run build -- exemplo      # gera dist-sankhya/exemplo.zip para o ERP
```

## Comandos

Sempre na raiz do projeto. Os nomes de dashboard são as pastas de `dashboards/`.

| Comando | Para quê |
|---|---|
| `npm run novo -- <nome> [--stack vite\|jsp\|html]` | Criar um dashboard a partir de um modelo |
| `npm run dev -- <nome>` | Desenvolver com preview ao vivo e dados reais |
| `npm run build -- <nome>` | Gerar `dist-sankhya/<nome>.zip`, verificado, para importar no ERP |
| `npm run emular -- <nome ou .zip>` | Abrir o pacote como o ERP abre, na sua máquina, antes de subir: executa `<snk:query>`/JSTL e simula `openApp` |
| `npm run verificar -- <nome ou .zip> [--consertar]` | Conferir um `.zip`, inclusive feito fora do kit |
| `npm run diagnostico -- [nome]` | Gerar o pacote de testes para quando o componente não abre no ERP |
| — | Usuários sem DBExplorer: [consultas no servidor](docs/consultas-no-servidor.md) (`consultasServidor` no `dashboard.json`) |
| `npm run proxy` | Subir só o proxy de dados, para quem usa servidor de dev próprio |

## Documentação

| Documento | Quando ler |
|---|---|
| [Primeiros passos](docs/primeiros-passos.md) | Instalar, configurar o `.env`, testar a conexão |
| [Criar um dashboard](docs/criar-dashboard.md) | Consultar dados, parâmetros do ERP, gráficos, abrir telas do ERP |
| [Stacks](docs/stacks.md) | Escolher entre `vite`, `html` e `jsp`; o `dashboard.json` |
| [Publicar no ERP](docs/publicar-no-erp.md) | Construtor de Componentes de BI, XML do componente, base de testes |
| [Debug e logs](docs/debug-e-logs.md) | **O componente não abre ou não traz dados**: passo a passo, diagnóstico, logs, erros conhecidos |
| [Usar como dependência](docs/usar-como-dependencia.md) | Usar o kit dentro de outro projeto e receber as correções |
| [Segurança](docs/seguranca.md) | Credenciais, proxy, SankhyaJX, o que nunca fazer |
| [CHANGELOG](CHANGELOG.md) | O que mudou em cada versão |

Encontrou um problema? Abra uma issue com o modelo **"Problema no ERP"** e cole o relatório do diagnóstico.

## Estrutura

```
bin/sankhya-dash.mjs     CLI única (os scripts npm chamam ela)
lib/                     build, pacote (.zip + verificação), regras do JSP, emulador, comandos
proxy/                   proxy local SÓ de desenvolvimento: SQL → API do Sankhya com o .env (só leitura)
runtime/                 código que roda no navegador: dados.js, parametros.js, erp.js, SankhyaJX
modelos/                 modelos de dashboard (vite, jsp, html) e as páginas do diagnóstico
docs/                    documentação
dashboards/              seus dashboards (cada pasta é um)
dist-sankhya/            saída do build (não versionada)
```
