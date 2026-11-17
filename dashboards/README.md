# dashboards/

Cada subpasta é um dashboard. Crie com:

```bash
npm run novo -- <nome>                # stack vite (padrão)
npm run novo -- <nome> --stack jsp    # consulta no servidor, sem preview local
npm run novo -- <nome> --stack html   # outra ferramenta de front-end
```

O `dashboard.json` de cada pasta diz a stack e o nome da entrada no ERP. Detalhes em `docs/stacks.md`.
