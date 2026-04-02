import { Router } from 'express';
import { auth } from '../auth/server';
import { orderRepo } from '../repositories/order.repo';
import { buildPagePayHtml, verifyNotifySign, isAlipayConfigured } from '../services/alipayService';

const router = Router();

interface ProductConfig {
  subject: string;
  amount: string;
  body: string;
}

const PRODUCTS: Record<string, ProductConfig> = {
  premium_lifetime: {
    subject: 'OpenSynapse Premium（终身）',
    amount: '99.00',
    body: '解锁所有高级功能，一次购买永久使用',
  },
};

function requireAuth(handler: (req: any, res: any, userId: string) => Promise<void>) {
  return async (req: any, res: any) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      const userId = session?.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return handler(req, res, userId);
    } catch (error) {
      console.error('[Payment] Auth failed:', error);
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

router.post('/create', requireAuth(async (req, res, userId) => {
  try {
    if (!isAlipayConfigured()) {
      return res.status(503).json({ error: '支付宝支付未配置' });
    }

    const { productCode } = req.body;
    const product = PRODUCTS[productCode as keyof typeof PRODUCTS];

    if (!product) {
      return res.status(400).json({ error: '无效的商品代码' });
    }

    const outTradeNo = `OS${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const order = await orderRepo.create({
      id: crypto.randomUUID(),
      userId,
      outTradeNo,
      totalAmount: product.amount,
      subject: product.subject,
      body: product.body,
      productCode,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const notifyUrl = process.env.ALIPAY_NOTIFY_URL || '';
    const returnUrl = `${process.env.ALIPAY_RETURN_URL || ''}?orderId=${order.id}`;

    const html = buildPagePayHtml({
      outTradeNo,
      totalAmount: product.amount,
      subject: product.subject,
      body: product.body,
      notifyUrl,
      returnUrl,
    });

    res.json({ orderId: order.id, outTradeNo, html });
  } catch (error) {
    console.error('[Payment] Create order error:', error);
    res.status(500).json({ error: '创建订单失败' });
  }
}));

router.post('/notify', async (req, res) => {
  try {
    const params = req.body as Record<string, string>;

    if (!verifyNotifySign(params)) {
      return res.send('fail');
    }

    const outTradeNo = params.out_trade_no;
    const tradeStatus = params.trade_status;
    const alipayTradeNo = params.trade_no;
    const buyerId = params.buyer_id;
    const totalAmount = params.total_amount;

    const order = await orderRepo.findByOutTradeNo(outTradeNo);
    if (!order) {
      return res.send('fail');
    }

    if (totalAmount && totalAmount !== order.totalAmount) {
      return res.send('fail');
    }

    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
      if (order.status !== 'paid') {
        await orderRepo.updateStatus(outTradeNo, {
          status: 'paid',
          alipayTradeNo,
          buyerId,
          paidAt: new Date(),
        });
      }
    } else if (tradeStatus === 'TRADE_CLOSED') {
      await orderRepo.updateStatus(outTradeNo, {
        status: 'closed',
        closedAt: new Date(),
      });
    }

    res.send('success');
  } catch (error) {
    console.error('[Payment] Notify error:', error);
    res.send('fail');
  }
});

router.get('/status/:orderId', requireAuth(async (req, res, userId) => {
  try {
    const order = await orderRepo.findById(req.params.orderId);
    if (!order || order.userId !== userId) {
      return res.status(404).json({ error: '订单不存在' });
    }

    res.json({
      id: order.id,
      outTradeNo: order.outTradeNo,
      status: order.status,
      totalAmount: order.totalAmount,
      subject: order.subject,
      productCode: order.productCode,
      paidAt: order.paidAt?.toISOString() || null,
      createdAt: order.createdAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('[Payment] Status query error:', error);
    res.status(500).json({ error: '查询订单状态失败' });
  }
}));

router.get('/orders', requireAuth(async (req, res, userId) => {
  try {
    const orders = await orderRepo.findByUser(userId);
    res.json(orders.map(o => ({
      id: o.id,
      outTradeNo: o.outTradeNo,
      status: o.status,
      totalAmount: o.totalAmount,
      subject: o.subject,
      productCode: o.productCode,
      paidAt: o.paidAt?.toISOString() || null,
      createdAt: o.createdAt?.toISOString() || null,
    })));
  } catch (error) {
    console.error('[Payment] List orders error:', error);
    res.status(500).json({ error: '获取订单列表失败' });
  }
}));

router.get('/premium-status', requireAuth(async (req, res, userId) => {
  try {
    const premium = await orderRepo.hasUserPurchased(userId, 'premium_lifetime');
    res.json({ premium });
  } catch (error) {
    console.error('[Payment] Premium status error:', error);
    res.status(500).json({ error: '查询会员状态失败' });
  }
}));

router.get('/config', (_req, res) => {
  res.json({
    configured: isAlipayConfigured(),
    products: Object.entries(PRODUCTS).map(([code, p]) => ({
      code,
      subject: p.subject,
      amount: p.amount,
      body: p.body,
    })),
  });
});

export default router;
