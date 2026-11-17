# Usar o kit em outro projeto

O kit pode ser usado de dois jeitos:

- **Clonado** (este repositório): bom para começar e para dashboards avulsos.
- **Como dependência** de outro projeto: bom quando o projeto tem outras coisas (automações, scripts, dashboards com regras de negócio da empresa) e **não deve copiar** o código do kit.

Com o kit como dependência, **uma correção feita no kit chega a todos os projetos** quando eles atualizam a versão. Nenhum arquivo é copiado, então nada fica duplicado e desatualizado.

## O que fica onde

| No kit (público) | No projeto (pode ser privado) |
|---|---|
| CLI, build, verificação, emulador, diagnóstico | Os dashboards (`dashboards/<nome>/`) |
| Proxy de desenvolvimento | O `.env` com as credenciais |
| `runtime/`: `dados.js`, `parametros.js`, `erp.js`, SankhyaJX | Regras de negócio, SQL da empresa, documentação interna |
| Documentação genérica (este `docs/`) | Documentação do que é específico da empresa |

Nada da empresa (nomes, dados, endereços do ERP) entra no kit.

## Configurar o projeto

`package.json` do projeto:

```json
{
  "type": "module",
  "scripts": {
    "novo": "sankhya-dash novo",
    "dev": "sankhya-dash dev",
    "build": "sankhya-dash build",
    "emular": "sankhya-dash emular",
    "verificar": "sankhya-dash verificar",
    "diagnostico": "sankhya-dash diagnostico"
  },
  "devDependencies": {
    "sankhya-dashboards-kit": "github:C0ffiz/sankhya-dashboards-kit#v2.0.0",
    "tailwindcss": "^4.3.5"
  },
  "dependencies": {
    "echarts": "^6.1.0"
  }
}
```

- **Fixe a versão** (`#v2.0.0` é uma tag do kit). Sem a tag, o projeto pega o que estiver na `main` naquele dia, e um `npm install` em outra máquina pode trazer outra versão.
- `tailwindcss` fica também no projeto porque o CSS dos dashboards (`@import "tailwindcss"`) é resolvido a partir da pasta do projeto.
- O `.env`, a pasta `dashboards/` e o `.gitignore` (com `.env`, `node_modules/`, `dist-sankhya/`) ficam na raiz do projeto, e os comandos rodam de lá: `npm run dev -- vendas`.
- Nos dashboards, importe do kit com `sankhya-kit/...`:

  ```js
  import { consultarSQL } from 'sankhya-kit/dados.js';
  import { lerParametros } from 'sankhya-kit/parametros.js';
  import { abrirTela, TELAS } from 'sankhya-kit/erp.js';
  ```

Se o `npm install` falhar com erro de permissão SSH ao baixar do GitHub, faça o git usar HTTPS:

```bash
git config --global url."https://github.com/".insteadOf ssh://git@github.com/
```

## Atualizar o kit no projeto

```bash
npm install github:C0ffiz/sankhya-dashboards-kit#v2.1.0
npm run build -- <cada dashboard>     # confira que tudo continua gerando
```

Confirme o `package.json` e o `package-lock.json` atualizados. O [CHANGELOG](../CHANGELOG.md) do kit diz o que mudou e se algo exige ajuste nos dashboards.

## Corrigir algo no kit

Encontrou um problema que vale para qualquer dashboard (empacotamento, ERP, proxy, diagnóstico)? **Corrija no kit, não no projeto.**

1. No repositório do kit, numa branch: faça a correção, teste com `npm run novo -- x`, `build`, `emular` e `diagnostico`, e registre no `CHANGELOG.md`.
2. Para testar no projeto **antes** de lançar a versão, aponte para o commit da branch:

   ```bash
   npm install github:C0ffiz/sankhya-dashboards-kit#<sha-do-commit>
   ```

   Ou, com os dois repositórios lado a lado na mesma máquina: `npm install ../sankhya-dashboards-kit`.
3. Depois do merge na `main` do kit: crie a tag da versão (`v2.1.0`), atualize o `version` do `package.json` do kit e atualize o projeto para a tag.

Nunca edite `node_modules/sankhya-dashboards-kit`: a alteração some no próximo `npm install`.

## Versões

O kit segue versionamento semântico:

| Mudança | Versão | Exemplo |
|---|---|---|
| Correção sem mudar o uso | `2.0.x` | Nova verificação no build |
| Novo recurso compatível | `2.x.0` | Novo comando, nova tela em `TELAS` |
| Algo que exige ajustar dashboards ou o XML | `x.0.0` | Mudar o nome padrão da entrada, mudar um import |
