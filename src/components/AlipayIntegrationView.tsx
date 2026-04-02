import { useState, useEffect, useCallback, useRef } from 'react';
import { CreditCard, CheckCircle2, Loader2, ExternalLink, History, Crown } from 'lucide-react';
import { paymentApi } from '../services/dataApi';

interface Product {
  code: string;
  subject: string;
  amount: string;
  body: string;
}

interface OrderRecord {
  id: string;
  outTradeNo: string;
  status: string;
  totalAmount: string;
  subject: string;
  productCode: string;
  paidAt: string | null;
  createdAt: string | null;
}

type Tab = 'purchase' | 'orders';

export function AlipayIntegrationView() {
  const [tab, setTab] = useState<Tab>('purchase');
  const [configured, setConfigured] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [premium, setPremium] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'paid' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadConfig();
    loadPremiumStatus();
    return () => stopPolling();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await paymentApi.getConfig();
      setConfigured(data.configured);
      setProducts(data.products);
    } catch {
      setConfigured(false);
    }
  };

  const loadPremiumStatus = async () => {
    try {
      const data = await paymentApi.getPremiumStatus();
      setPremium(data.premium);
    } catch { /* ignore */ }
  };

  const loadOrders = async () => {
    try {
      const data = await paymentApi.getOrders();
      setOrders(data);
    } catch { /* ignore */ }
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = useCallback((orderId: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const status = await paymentApi.getOrderStatus(orderId);
        if (status.status === 'paid') {
          setPaymentStatus('paid');
          setPremium(true);
          stopPolling();
        } else if (status.status === 'closed') {
          setPaymentStatus('failed');
          stopPolling();
        }
      } catch { /* continue polling */ }
    }, 3000);

    // Timeout after 15 minutes
    setTimeout(() => stopPolling(), 15 * 60 * 1000);
  }, []);

  const handlePurchase = async (productCode: string) => {
    if (!configured) return;
    setCreating(true);
    setError(null);
    setPaymentStatus('idle');

    try {
      const result = await paymentApi.createOrder(productCode);
      setPaymentStatus('pending');

      // Open Alipay payment page in new window
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(result.html);
        newWindow.document.close();
      }

      startPolling(result.orderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建订单失败');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (tab === 'orders') loadOrders();
  }, [tab]);

  // Check for orderId in URL (return from Alipay)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    if (orderId) {
      setPaymentStatus('pending');
      startPolling(orderId);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [startPolling]);

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: '待支付', color: 'text-yellow-600' },
    paid: { text: '已支付', color: 'text-green-600' },
    closed: { text: '已关闭', color: 'text-gray-500' },
    refunded: { text: '已退款', color: 'text-red-600' },
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-xl">
              <CreditCard className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">会员订阅</h1>
          </div>
          <p className="text-gray-600">解锁 OpenSynapse 全部高级功能</p>
        </div>

        {/* Premium status banner */}
        {premium && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">您已是 Premium 会员</p>
              <p className="text-sm text-green-600">所有高级功能已解锁</p>
            </div>
            <Crown className="w-6 h-6 text-yellow-500 ml-auto" />
          </div>
        )}

        {/* Payment success banner */}
        {paymentStatus === 'paid' && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl animate-fade-in">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">支付成功！</p>
              <p className="text-sm text-green-600">Premium 功能已解锁，感谢您的支持</p>
            </div>
          </div>
        )}

        {/* Payment pending banner */}
        {paymentStatus === 'pending' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <div>
              <p className="font-semibold text-blue-800">等待支付中...</p>
              <p className="text-sm text-blue-600">请在新窗口中完成支付，支付成功后将自动更新状态</p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setTab('purchase')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              tab === 'purchase' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            购买
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              tab === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <History className="w-4 h-4" />
            订单记录
          </button>
        </div>

        {tab === 'purchase' && (
          <div className="space-y-6">
            {!configured ? (
              <div className="p-8 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
                <p className="text-yellow-800 font-medium">支付宝支付暂未配置</p>
                <p className="text-sm text-yellow-600 mt-2">请联系管理员完成支付宝商户配置</p>
              </div>
            ) : (
              products.map(product => (
                <div key={product.code} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Crown className="w-6 h-6 text-yellow-500" />
                        <h2 className="text-xl font-bold text-gray-900">{product.subject}</h2>
                      </div>
                      <p className="text-gray-600">{product.body}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-blue-600">¥{product.amount}</span>
                        <span className="text-gray-500">/ 终身</span>
                      </div>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          无限制 AI 对话
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          高级知识图谱功能
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          智能闪卡复习
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          一次购买，永久使用
                        </li>
                      </ul>
                    </div>
                    <button
                      onClick={() => handlePurchase(product.code)}
                      disabled={creating || premium}
                      className={`px-8 py-3 rounded-xl font-medium transition-all flex items-center gap-2 ${
                        premium
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : creating
                            ? 'bg-blue-400 text-white cursor-wait'
                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                      }`}
                    >
                      {creating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          创建订单中...
                        </>
                      ) : premium ? (
                        '已购买'
                      ) : (
                        <>
                          <ExternalLink className="w-5 h-5" />
                          立即购买
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="p-8 bg-gray-50 rounded-xl text-center text-gray-500">
                暂无订单记录
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{order.subject}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        订单号: {order.outTradeNo}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">¥{order.totalAmount}</p>
                      <p className={`text-sm font-medium mt-1 ${statusLabel[order.status]?.color || 'text-gray-500'}`}>
                        {statusLabel[order.status]?.text || order.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
