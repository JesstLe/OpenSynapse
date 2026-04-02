/**
 * Alipay Payment Integration Module
 * 
 * 支付宝开放平台支付产品接入最佳实践
 * 涵盖当面付、订单码支付、App支付、JSAPI支付、手机网站支付、
 * 电脑网站支付、预授权支付、商家扣款等全场景产品选型与集成指导
 */

export interface PaymentProduct {
  name: string;
  description: string;
  api: string;
  docs: {
    main: string;
    intro: string;
    prepare: string;
  };
  keywords: string[];
  applicable: string[];
  notes?: string;
}

export const PAYMENT_PRODUCTS: Record<string, PaymentProduct> = {
  face_to_face: {
    name: "当面付",
    description: "线下门店，用户出示付款码，商家扫码枪扫码收款",
    api: "alipay.trade.pay",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0izcu3",
      intro: "https://ideservice.alipay.com/cms/site/0izal0",
      prepare: "https://ideservice.alipay.com/cms/site/0izal1"
    },
    keywords: ["付款码", "条码支付", "扫码枪", "被扫", "线下门店", "便利店", "商超", "餐饮", "收银台扫码", "实体店", "面对面收款", "扫码枪收款", "用户出示付款码"],
    applicable: ["便利店", "商超综合体", "餐饮店", "医院", "学校", "电影院", "旅游景区等实体门店"]
  },
  order_code: {
    name: "订单码支付",
    description: "商家生成二维码，用户打开支付宝扫码付款",
    api: "alipay.trade.precreate",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0izg0z",
      intro: "https://ideservice.alipay.com/cms/site/0izgk1",
      prepare: "https://ideservice.alipay.com/cms/site/0izgk2"
    },
    keywords: ["订单码", "商家二维码", "主扫", "预下单", "商家生成二维码", "用户扫码支付", "商品二维码", "预创建订单"],
    applicable: ["商品售卖", "媒体广告支付等场景"]
  },
  wap_payment: {
    name: "手机网站支付",
    description: "手机浏览器 H5 页面内唤起支付宝付款",
    api: "alipay.trade.wap.pay",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0izne3",
      intro: "https://ideservice.alipay.com/cms/site/0izne4",
      prepare: "https://ideservice.alipay.com/cms/site/0izne5"
    },
    keywords: ["H5支付", "WAP支付", "手机网站", "手机浏览器", "移动端网页", "手机网页支付", "wap收银台", "手机端网页", "移动H5"],
    applicable: ["移动端网页内支付等场景"]
  },
  page_payment: {
    name: "电脑网站支付",
    description: "电脑浏览器网页内跳转支付宝收银台",
    api: "alipay.trade.page.pay",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0iztfv",
      intro: "https://ideservice.alipay.com/cms/site/0iztg0",
      prepare: "https://ideservice.alipay.com/cms/site/0iztg1"
    },
    keywords: ["PC支付", "电脑网站", "网页支付", "电脑端支付", "PC网页", "电脑浏览器", "网站支付", "传统网页支付", "网页收银台"],
    applicable: ["PC端电商网站", "在线服务平台等"]
  },
  jsapi: {
    name: "JSAPI 支付",
    description: "支付宝小程序内调起支付",
    api: "alipay.trade.create + my.tradePay",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0izg0f",
      intro: "https://ideservice.alipay.com/cms/site/0izg0g",
      prepare: "https://ideservice.alipay.com/cms/site/0izg0h"
    },
    keywords: ["小程序支付", "JSAPI", "支付宝小程序", "生活号", "小程序内支付", "小程序收银台", "小程序JSAPI", "my.tradePay", "小程序下单", "支付宝内小程序"],
    applicable: ["支付宝小程序内购物", "服务购买等场景"]
  },
  app_payment: {
    name: "App 支付",
    description: "原生 iOS/Android/鸿蒙 App 内调起支付宝付款",
    api: "alipay.trade.app.pay",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0izsn4",
      intro: "https://ideservice.alipay.com/cms/site/0izsn5",
      prepare: "https://ideservice.alipay.com/cms/site/0izsn6"
    },
    keywords: ["App支付", "移动应用支付", "iOS支付", "Android支付", "鸿蒙支付", "App内支付", "原生App支付", "手机App支付", "移动端App", "SDK支付", "客户端支付"],
    applicable: ["原生 iOS/Android/鸿蒙 App 内调起支付宝付款", "App 未安装支付宝客户端时可降级 H5 支付"]
  },
  pre_auth: {
    name: "预授权支付",
    description: "押金冻结、信用住、免押租赁",
    api: "alipay.fund.auth.order.app.freeze",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0j0lyx",
      intro: "https://ideservice.alipay.com/cms/site/0j0lyy",
      prepare: "https://ideservice.alipay.com/cms/site/0j0lyz"
    },
    keywords: ["预授权", "押金", "资金冻结", "信用住", "免押", "先享后付", "酒店押金", "租车押金", "充电宝押金", "单车押金", "民宿押金", "冻结资金", "授权冻结", "押金退还"],
    applicable: ["酒店民宿", "传统租车", "分时租赁", "单车租赁", "充电宝", "雨伞", "3C数码/手机/相机租赁等"]
  },
  merchant_deduction: {
    name: "商家扣款",
    description: "周期扣款、自动续费、会员订阅、连续包月",
    api: "alipay.trade.app.pay（支付并签约）+ alipay.trade.pay（后续扣款）",
    docs: {
      main: "https://ideservice.alipay.com/cms/site/0j0g6k",
      intro: "https://ideservice.alipay.com/cms/site/0j0g6l",
      prepare: "https://ideservice.alipay.com/cms/site/0j0g6m"
    },
    keywords: ["周期扣款", "自动续费", "会员订阅", "连续包月", "代扣", "商家扣款", "定期扣款", "会员自动续费", "包月会员", "订阅制", "定期扣费", "委托扣款", "协议扣款"],
    applicable: ["会员包月", "自动续费", "定期还款等"],
    notes: "商家扣款产品已于 2026.3.28 完成产品升级，本文仅支持最新版本的接入。当前只支持周期性扣款模式，用户主动免密支付场景暂不支持接入。"
  }
};

export interface QuickStartDoc {
  title: string;
  url: string;
  description: string;
}

export const QUICK_START_DOCS: Record<string, QuickStartDoc> = {
  sdk_download: {
    title: "服务端 SDK 下载",
    url: "https://ideservice.alipay.com/cms/site/0j0cjj",
    description: "通用版 SDK（Java/PHP/.NET/Python/Node.js）、Easy 版 SDK（Java/PHP/.NET）"
  },
  get_appid: {
    title: "获取 AppId",
    url: "https://ideservice.alipay.com/cms/site/02nebp",
    description: "应用唯一标识的获取方式"
  },
  sign_method: {
    title: "接口加签方式",
    url: "https://ideservice.alipay.com/cms/site/02mriz",
    description: "加签方式说明，支持 RSA2 和 RSA，推荐使用 RSA2（SHA256WithRSA）"
  },
  gateway: {
    title: "正式网关",
    url: "https://openapi.alipay.com/gateway.do",
    description: "访问地址：https://openapi.alipay.com/gateway.do"
  },
  sandbox: {
    title: "沙箱环境",
    url: "https://ideservice.alipay.com/cms/site/02np8i",
    description: "沙箱网关：https://openapi-sandbox.dl.alipaydev.com/gateway.do"
  },
  best_practices: {
    title: "接入规范和常见陷阱",
    url: "https://ideservice.alipay.com/cms/site/0j0kl2",
    description: "支付产品接入中的核心规范和产品接入常见陷阱说明"
  },
  error_codes: {
    title: "公共错误码说明",
    url: "https://ideservice.alipay.com/cms/site/02km9f",
    description: "此处为公共错误码说明，开发者在接入过程中遇到其他报错信息，可以参考所调用接口的 API 文档的业务错误码部分"
  }
};

export const DECISION_TREE = `
用户咨询支付宝接入
        |
        +-- 线下门店收款？
        |       +-- 用户出示付款码，商家扫 --> 当面付
        |       +-- 商家出示二维码，用户扫 --> 订单码支付
        |
        +-- 线上支付？
        |       +-- 原生 App（iOS/Android/鸿蒙）--> App 支付
        |       +-- 支付宝小程序 --> JSAPI支付
        |       +-- 手机浏览器 H5 --> 手机网站支付
        |       +-- 电脑浏览器网页 --> 电脑网站支付
        |
        +-- 需要冻结资金/押金？
        |       +-- 预授权支付
        |
        +-- 周期性自动扣款？
                +-- 会员订阅/连续包月/自动续费 --> 商家扣款
`;

export const CLARIFICATION_TEMPLATE = `
请确认您的业务场景：

1. 线下门店收款
   - 当面付：用户出示付款码，商家用扫码枪收款
     适用：便利店、商超综合体、餐饮店、医院、学校、电影院、旅游景区等实体门店
   - 订单码支付：商家生成二维码，用户扫码付款
     适用：商品售卖、媒体广告支付等场景

2. 线上App支付
   - 原生 iOS/Android/鸿蒙 App 内调起支付宝付款
   - App 未安装支付宝客户端时可降级 H5 支付

3. 支付宝小程序支付
   - JSAPI支付：小程序内调起支付宝收银台完成支付
   - 适用：支付宝小程序内购物、服务购买等场景

4. 手机网站支付
   - 手机浏览器 H5 页面内唤起支付宝 App 或网页收银台
   - 适用：移动端网页内支付等场景

5. 电脑网站支付
   - 电脑浏览器跳转支付宝网页收银台
   - 支持扫码支付或登录账户支付
   - 适用：PC端电商网站、在线服务平台等

6. 预授权支付
   - 先冻结资金或信用额度，按实际消费扣款，剩余解冻归还
   - 适用：酒店民宿、传统租车、分时租赁、单车租赁、充电宝、雨伞、3C数码/手机/相机租赁等

7. 商家扣款（周期自动扣款）
   - 用户签约授权后，商家主动发起周期性扣款
   - 适用：会员包月、自动续费、定期还款等

请描述您的具体业务需求？
`;

/**
 * 根据业务场景路由到对应的支付产品
 */
export function routePaymentProduct(scenario: string, details?: string): string {
  const product = PAYMENT_PRODUCTS[scenario];
  
  if (!product) {
    return `未知场景: ${scenario}。可用场景: ${Object.keys(PAYMENT_PRODUCTS).join(', ')}`;
  }

  return `
## 推荐产品：${product.name}

**产品描述**: ${product.description}
**核心 API**: ${product.api}
**适用场景**: ${product.applicable.join('、')}

### 在线文档
- 产品介绍: ${product.docs.intro}
- 接入准备: ${product.docs.prepare}
- 完整文档: ${product.docs.main}

### 使用 curl 获取文档
\`\`\`bash
# 获取产品介绍
curl -sL "${product.docs.intro}"

# 获取接入准备指南
curl -sL "${product.docs.prepare}"

# 获取完整文档
curl -sL "${product.docs.main}"
\`\`\`

${product.notes ? `\n**注意**: ${product.notes}\n` : ''}

请先阅读在线文档获取最新的接口参数和代码示例。
`;
}

/**
 * 获取产品文档索引
 */
export function getProductDocumentation(productKey: string): string {
  const product = PAYMENT_PRODUCTS[productKey];
  
  if (!product) {
    return `未知产品: ${productKey}`;
  }

  return `
## ${product.name} - 文档索引

### 文档链接
| 类型 | URL |
|------|-----|
| 产品介绍 | ${product.docs.intro} |
| 接入准备 | ${product.docs.prepare} |
| 完整文档 | ${product.docs.main} |

### 核心信息
- **API**: ${product.api}
- **描述**: ${product.description}
- **适用**: ${product.applicable.join('、')}

### 递归访问示例
\`\`\`bash
# 1. 访问产品介绍
curl -sL "${product.docs.intro}"

# 2. 访问接入准备
curl -sL "${product.docs.prepare}"

# 3. 访问完整文档
curl -sL "${product.docs.main}"
\`\`\`

文档内容会动态更新，编写代码前务必通过 curl 阅读最新版本。
`;
}

/**
 * 获取接入指南
 */
export function getIntegrationGuide(productKey: string, language: string = "java"): string {
  const product = PAYMENT_PRODUCTS[productKey];
  
  if (!product) {
    return `未知产品: ${productKey}`;
  }

  const langMap: Record<string, string> = {
    java: "Java",
    php: "PHP",
    python: "Python",
    nodejs: "Node.js",
    dotnet: ".NET"
  };

  return `
## ${product.name} - ${langMap[language] || language} 接入指南

### 接入步骤

1. **获取 AppId**
   - 访问: ${QUICK_START_DOCS.get_appid.url}
   - 在支付宝开放平台创建应用获取 AppId

2. **配置密钥**
   - 生成 RSA2 密钥对
   - 上传公钥到开放平台
   - 保存私钥用于接口加签

3. **下载 SDK**
   - 文档: ${QUICK_START_DOCS.sdk_download.url}
   - 选择 ${langMap[language] || language} 版本 SDK

4. **调用接口**
   - 核心 API: ${product.api}
   - 网关地址: ${QUICK_START_DOCS.gateway.url}
   - 沙箱测试: ${QUICK_START_DOCS.sandbox.url}

### 完整文档
- 产品介绍: ${product.docs.intro}
- 接入准备: ${product.docs.prepare}
- 接口文档: ${product.docs.main}

### 注意事项
- 测试阶段建议使用沙箱环境
- 所有接口参数请参考在线文档最新版本
- ${QUICK_START_DOCS.best_practices.title}: ${QUICK_START_DOCS.best_practices.url}

请先阅读在线文档获取详细的代码示例和接口参数。
`;
}

/**
 * 关键词匹配支付产品
 */
export function matchKeywords(keywords: string): { product: PaymentProduct; score: number } | null {
  let bestMatch: { product: PaymentProduct; score: number; key: string } | null = null;
  
  for (const [key, product] of Object.entries(PAYMENT_PRODUCTS)) {
    let score = 0;
    const keywordList = keywords.toLowerCase().split(/[，,、\s]+/);
    
    for (const kw of keywordList) {
      for (const productKw of product.keywords) {
        if (kw.includes(productKw) || productKw.includes(kw)) {
          score += 1;
        }
      }
    }
    
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { key, product, score };
    }
  }
  
  return bestMatch ? { product: bestMatch.product, score: bestMatch.score } : null;
}

/**
 * 获取快速开始指南
 */
export function getQuickStart(topic: string): string {
  const doc = QUICK_START_DOCS[topic];
  
  if (!doc) {
    return `未知主题: ${topic}。可用主题: ${Object.keys(QUICK_START_DOCS).join(', ')}`;
  }

  return `
## ${doc.title}

**说明**: ${doc.description}
**文档地址**: ${doc.url}

### 获取文档内容
\`\`\`bash
curl -sL "${doc.url}"
\`\`\`
`;
}

/**
 * 获取决策树
 */
export function getDecisionTree(): string {
  return DECISION_TREE;
}

/**
 * 获取澄清话术
 */
export function getClarificationTemplate(): string {
  return CLARIFICATION_TEMPLATE;
}

/**
 * 获取所有支付产品列表
 */
export function getAllProducts(): PaymentProduct[] {
  return Object.values(PAYMENT_PRODUCTS);
}

/**
 * 根据 API 名称查找产品
 */
export function findProductByApi(apiName: string): PaymentProduct | null {
  for (const product of Object.values(PAYMENT_PRODUCTS)) {
    if (product.api.includes(apiName)) {
      return product;
    }
  }
  return null;
}
