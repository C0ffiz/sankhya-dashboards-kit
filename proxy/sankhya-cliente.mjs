// Cliente OAuth2 da API do Sankhya (client_credentials + X-Token). Só roda no Node, nunca no navegador.

export class SankhyaCliente {
  /** @param {{ SANKHYA_BASE_URL?: string, SANKHYA_CLIENT_ID?: string, SANKHYA_CLIENT_SECRET?: string, SANKHYA_X_TOKEN?: string }} env */
  constructor(env) {
    this.baseUrl = String(env.SANKHYA_BASE_URL || '').replace(/\/+$/, '');
    this.clientId = env.SANKHYA_CLIENT_ID;
    this.clientSecret = env.SANKHYA_CLIENT_SECRET;
    this.xToken = env.SANKHYA_X_TOKEN;
    this.token = null;
    this.expiraEm = 0;

    const faltando = ['SANKHYA_BASE_URL', 'SANKHYA_CLIENT_ID', 'SANKHYA_CLIENT_SECRET', 'SANKHYA_X_TOKEN'].filter((k) => !env[k]);
    if (faltando.length) {
      throw new Error(`Credenciais ausentes no .env: ${faltando.join(', ')}. Copie .env.example para .env e preencha.`);
    }
    if (!/^https:\/\//i.test(this.baseUrl)) {
      throw new Error('SANKHYA_BASE_URL precisa começar com https:// (ex.: https://api.sankhya.com.br).');
    }
  }

  /** Gera um token novo ou reaproveita o atual enquanto válido (margem de 60 s). */
  async obterToken() {
    const agora = Date.now();
    if (this.token && agora < this.expiraEm) return this.token;

    const r = await fetch(`${this.baseUrl}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Token': this.xToken },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.clientId, client_secret: this.clientSecret }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new ErroHttp(`Falha na autenticação (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`, r.status);

    const dados = await r.json();
    if (!dados.access_token) throw new Error('Autenticação sem access_token na resposta.');
    const expiraEmSeg = Number(dados.expires_in) || 300;
    this.token = dados.access_token;
    this.expiraEm = agora + Math.max(expiraEmSeg - 60, 30) * 1000;
    return this.token;
  }

  /** POST autenticado em um endpoint da API. Se o token expirou antes da hora (401), renova e tenta 1x. */
  async post(endpoint, corpo, tentativa = 1) {
    const token = await this.obterToken();
    const r = await fetch(`${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60_000),
    });
    if (r.status === 401 && tentativa === 1) {
      this.token = null;
      return this.post(endpoint, corpo, 2);
    }
    if (!r.ok) throw new ErroHttp(`Sankhya HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);
    const texto = await r.text();
    return texto ? JSON.parse(texto) : {};
  }
}

export class ErroHttp extends Error {
  constructor(msg, status) {
    super(msg);
    this.status = status;
  }
}
