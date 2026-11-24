// npm run proxy  — só o proxy local (para stacks com servidor de desenvolvimento próprio).
import { iniciarProxy } from '../../proxy/servidor-dev.mjs';
import { PORTA_PROXY, portaLivre } from '../projeto.mjs';

export async function comandoProxy(_, { porta }) {
  await iniciarProxy({ porta: Number(porta) || (process.env.PORTA_PROXY ? PORTA_PROXY : await portaLivre(PORTA_PROXY)) });
}
