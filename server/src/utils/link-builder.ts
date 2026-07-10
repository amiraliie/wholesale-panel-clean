type BuildConfigLinkArgs = {
  protocol: string;
  clientId: string;
  email?: string;
  host?: string;
  port?: number;
  serverHost?: string;
  serverPort?: number;
  streamSettings?: string | null;
  settings?: string | null;
  network?: string;
  remark?: string;
  security?: string;
};

function safeJsonParse<T = any>(value?: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function stripScheme(host: string): string {
  return host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function encodeRemark(value?: string): string {
  return encodeURIComponent(value || 'config');
}

function getNetwork(streamSettings?: string | null, fallback = 'tcp'): string {
  const parsed = safeJsonParse<any>(streamSettings);
  return parsed?.network || fallback;
}

function getSecurity(streamSettings?: string | null, fallback = 'none'): string {
  const parsed = safeJsonParse<any>(streamSettings);
  return parsed?.security || fallback;
}

function getTlsServerName(streamSettings?: string | null): string | undefined {
  const parsed = safeJsonParse<any>(streamSettings);
  return parsed?.tlsSettings?.serverName || parsed?.realitySettings?.serverNames?.[0];
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
}

export function buildConfigLink(args: BuildConfigLinkArgs): string {
  const protocol = String(args.protocol || '').toLowerCase();
  const host = stripScheme(args.serverHost || args.host || '127.0.0.1');
  const port = Number(args.serverPort || args.port || 443);
  const network = args.network || getNetwork(args.streamSettings);
  const security = args.security || getSecurity(args.streamSettings);
  const remark = args.remark || args.email || 'config';
  const sni = getTlsServerName(args.streamSettings);

  if (protocol === 'vmess') {
    const payload = {
      v: '2',
      ps: remark,
      add: host,
      port: String(port),
      id: args.clientId,
      aid: '0',
      scy: 'auto',
      net: network,
      type: 'none',
      host: '',
      path: '',
      tls: security === 'tls' ? 'tls' : '',
      sni: sni || '',
    };

    return `vmess://${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
  }

  if (protocol === 'trojan') {
    const query = buildQuery({
      security,
      type: network,
      sni,
    });

    return `trojan://${encodeURIComponent(args.clientId)}@${host}:${port}?${query}#${encodeRemark(remark)}`;
  }

  if (protocol === 'vless') {
    const query = buildQuery({
      encryption: 'none',
      security,
      type: network,
      sni,
    });

    return `vless://${encodeURIComponent(args.clientId)}@${host}:${port}?${query}#${encodeRemark(remark)}`;
  }

  throw new Error(`Unsupported protocol: ${args.protocol}`);
}

export function buildSubscriptionLink(subId: string): string {
  const base = process.env.SUBSCRIPTION_PUBLIC_URL || '';
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(subId)}`;
}
