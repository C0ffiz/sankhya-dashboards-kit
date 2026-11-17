// npm run proxy  — só o proxy local (para stacks com servidor de desenvolvimento próprio).
import { iniciarProxy } from '../../proxy/servidor-dev.mjs';
import { PORTA_PROXY } from '../projeto.mjs';

export async function comandoProxy(_, { porta }) {
  await iniciarProxy({ porta: Number(porta) || PORTA_PROXY });
}
