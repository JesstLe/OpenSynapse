import { AlipaySdk } from 'alipay-sdk';

const ALIPAY_APP_ID = process.env.ALIPAY_APP_ID;
const ALIPAY_PRIVATE_KEY = process.env.ALIPAY_PRIVATE_KEY;
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_PUBLIC_KEY;
const ALIPAY_GATEWAY = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';

let alipaySdk: AlipaySdk | null = null;

function getAlipaySdk(): AlipaySdk {
  if (!alipaySdk) {
    if (!ALIPAY_APP_ID || !ALIPAY_PRIVATE_KEY || !ALIPAY_PUBLIC_KEY) {
      throw new Error('Alipay configuration missing: ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY');
    }
    alipaySdk = new AlipaySdk({
      appId: ALIPAY_APP_ID,
      privateKey: ALIPAY_PRIVATE_KEY,
      alipayPublicKey: ALIPAY_PUBLIC_KEY,
      gateway: ALIPAY_GATEWAY,
      signType: 'RSA2',
    });
  }
  return alipaySdk;
}

interface PagePayParams {
  outTradeNo: string;
  totalAmount: string;
  subject: string;
  body?: string;
  notifyUrl: string;
  returnUrl: string;
}

export function buildPagePayHtml(params: PagePayParams): string {
  const sdk = getAlipaySdk();

  const bizContent = {
    out_trade_no: params.outTradeNo,
    total_amount: params.totalAmount,
    subject: params.subject,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    body: params.body || '',
  };

  return sdk.pageExecute('alipay.trade.page.pay', 'POST', {
    bizContent,
    notifyUrl: params.notifyUrl,
    returnUrl: params.returnUrl,
  });
}

export function verifyNotifySign(postData: Record<string, string>): boolean {
  try {
    const sdk = getAlipaySdk();
    return sdk.checkNotifySignV2(postData);
  } catch (error) {
    console.error('[Alipay] Notify sign verification failed:', error);
    return false;
  }
}

export async function tradeQuery(outTradeNo: string) {
  const sdk = getAlipaySdk();
  const result = await sdk.curl('POST', '/v3/alipay/trade/query', {
    body: {
      out_trade_no: outTradeNo,
    },
  });
  return result;
}

export function isAlipayConfigured(): boolean {
  return !!(ALIPAY_APP_ID && ALIPAY_PRIVATE_KEY && ALIPAY_PUBLIC_KEY);
}
