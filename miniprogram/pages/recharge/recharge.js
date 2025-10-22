// 积分充值页面
const app = getApp();
const apiService = require('../../utils/api.js');

Page({
  data: {
    userInfo: null,
    packages: [
      { id: 'p25', count: 25, price: 9.9 },
      { id: 'p60', count: 60, price: 19.9 },
      { id: 'p100', count: 100, price: 29.9 }
    ],
    creating: false,
    errorText: '',
    refreshing: false,
    isIOS: false  // 是否为iOS平台
  },

  onLoad() {
    // 检测平台
    this.checkPlatform();
  },

  onShow() {
    this.setData({ userInfo: app?.globalData?.userInfo || null, errorText: '' });
    this.loadPackages();
  },

  /**
   * 检测平台是否为iOS
   */
  checkPlatform() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      const platform = systemInfo.platform;
      const isIOS = platform === 'ios' || platform === 'iPhone' || platform === 'iPad';

      this.setData({ isIOS });

      if (isIOS) {
        console.log('检测到iOS平台，将限制虚拟支付');
      }
    } catch (error) {
      console.error('获取系统信息失败:', error);
      // 安全起见，检测失败时默认当作iOS处理
      this.setData({ isIOS: true });
    }
  },

  // 下拉刷新：仅刷新用户信息
  onPullDownRefresh() {
    this.setData({ refreshing: true });
    const done = () => {
      wx.stopPullDownRefresh();
      this.setData({ refreshing: false });
    };
    if (typeof app.refreshUserInfo === 'function') {
      app.refreshUserInfo().then((info) => {
        if (info) this.setData({ userInfo: info });
        done();
      }).catch(() => {
        this.setData({ errorText: '刷新失败，请稍后重试' });
        done();
      });
    } else {
      done();
    }
  },

  // 加载可购套餐
  async loadPackages() {
    try {
      if (typeof apiService.getPackages === 'function') {
        const res = await apiService.getPackages();
        if (res?.success && Array.isArray(res.data)) {
          const normalized = (res.data || []).map(it => ({
            id: it.id || it.package_id || it.code || '',
            count: (it.count != null ? it.count : (it.credits != null ? it.credits : it.quantity)),
            price: (it.price != null ? it.price : it.amount),
            // 透传其他字段以备后续需要
            ...it
          }));
          this.setData({ packages: normalized, errorText: '' });
        } else {
          const msg = res?.message || '获取套餐失败';
          this.setData({ errorText: msg });
        }
      }
    } catch (e) {
      this.setData({ errorText: '获取套餐失败，请稍后重试' });
    }
  },

  selectPackage(e) {
    // 预留：选中样式，如需
  },

  async createOrder(e) {
    // 超短节流：300ms窗口内忽略重复触发
    const now = Date.now();
    if (this._lastOrderClickTs && (now - this._lastOrderClickTs) < 300) {
      console.log('[recharge] createOrder: throttled');
      return;
    }
    this._lastOrderClickTs = now;

    if (this.data.creating) return;
    const id = e?.currentTarget?.dataset?.id;
    const pkg = this.data.packages.find(p => p.id === id);
    if (!pkg) return wx.showToast({ title: '套餐不存在', icon: 'none' });

    // iOS平台限制检测
    if (this.data.isIOS) {
      this.showIOSPaymentTip();
      return;
    }

    this.setData({ creating: true });
    wx.showLoading({ title: '创建订单中...', mask: true });

    try {
      if (typeof apiService.createRechargeOrder === 'function') {
        const res = await apiService.createRechargeOrder({ packageId: id });

        wx.hideLoading();

        if (res?.success) {
          const orderId = res?.data?.order_id;
          const payParams = res?.data?.paymentParams;

          if (payParams) {
            // 有支付参数，调起微信支付
            wx.showLoading({ title: '正在调起支付...', mask: true });

            try {
              // 确保支付参数格式正确 - 适配云开发支付API返回格式
              const paymentParams = {
                timeStamp: payParams.timeStamp || payParams.timestamp || payParams.payment?.timeStamp || '',
                nonceStr: payParams.nonceStr || payParams.nonce_str || payParams.payment?.nonceStr || '',
                package: payParams.package || payParams.packageVal || payParams.payment?.package || 'prepay_id=' + (payParams.prepay_id || payParams.prepayid || ''),
                signType: payParams.signType || payParams.sign_type || payParams.payment?.signType || 'MD5',
                paySign: payParams.paySign || payParams.paySign || payParams.payment?.paySign || '',
                appId: payParams.appId || payParams.appid || 'wx1ed34a87abfaa643'
              }
              
              console.log('调起支付参数:', paymentParams)
              
              // 检查必要参数是否完整
              if (!paymentParams.timeStamp || !paymentParams.nonceStr || !paymentParams.package || !paymentParams.paySign) {
                throw new Error('支付参数不完整: ' + JSON.stringify(paymentParams))
              }
              
              await wx.requestPayment(paymentParams);

              wx.hideLoading();
              wx.showLoading({ title: '支付成功，处理中...', mask: true });

              // 支付成功后，主动通知后端完成订单并等待处理完成
              try {
                if (orderId) {
                  const callbackRes = await apiService.callCloudFunction('payment', {
                    action: 'paymentCallback',
                    outTradeNo: orderId,
                    resultCode: 'SUCCESS',
                    totalFee: Math.round((pkg?.price || 0) * 100)
                  });

                  if (callbackRes?.success) {
                    // 刷新用户信息
                    if (typeof app.refreshUserInfo === 'function') {
                      const info = await app.refreshUserInfo();
                      if (info) this.setData({ userInfo: info });
                    }

                    wx.hideLoading();
                    wx.showToast({ title: '支付成功，积分已到账', icon: 'success' });
                    this.setData({ errorText: '' });

                    // 成功引导：去查看充值记录
                    setTimeout(() => {
                      wx.showModal({
                        title: '充值成功',
                        content: `成功充值${pkg.count || pkg.credits}积分！是否前往查看充值记录？`,
                        confirmText: '查看记录',
                        cancelText: '留在本页',
                        success: (r) => { if (r.confirm) this.gotoRechargeRecords(); }
                      });
                    }, 1500);

                  } else {
                    // 回调处理失败，但支付可能已成功
                    wx.hideLoading();
                    wx.showModal({
                      title: '支付状态确认中',
                      content: '支付已完成，积分到账可能有延迟，请稍后查看充值记录。',
                      showCancel: false,
                      confirmText: '我知道了'
                    });

                    // 延迟刷新用户信息
                    setTimeout(async () => {
                      if (typeof app.refreshUserInfo === 'function') {
                        const info = await app.refreshUserInfo();
                        if (info) this.setData({ userInfo: info });
                      }
                    }, 3000);
                  }
                }
              } catch (syncErr) {
                console.warn('支付后主动同步订单失败：', syncErr);
                wx.hideLoading();
                wx.showModal({
                  title: '支付完成',
                  content: '支付已完成，积分到账可能有延迟，请稍后查看充值记录。',
                  showCancel: false,
                  confirmText: '我知道了'
                });
              }

            } catch (payErr) {
              wx.hideLoading();

              const isCancel = payErr && payErr.errMsg && payErr.errMsg.includes('cancel');
              const msg = isCancel ? '已取消支付' : '支付失败';

              this.setData({ errorText: msg });
              wx.showToast({ title: msg, icon: isCancel ? 'none' : 'error' });

              console.error('支付失败详情:', payErr)
              
              // 如果支付失败，检查订单状态
              if (!isCancel && orderId) {
                this.checkOrderStatus(orderId);
              }
            }

          } else {
            // 无支付参数则视为模拟/免支付通道
            wx.showToast({ title: '下单成功', icon: 'success' });
            if (typeof app.refreshUserInfo === 'function') {
              const info = await app.refreshUserInfo();
              if (info) this.setData({ userInfo: info });
            }
            this.setData({ errorText: '' });
          }

        } else {
          const msg = res?.message || '下单失败';
          this.setData({ errorText: msg });
          wx.showToast({ title: msg, icon: 'error' });
        }

      } else {
        wx.hideLoading();
        wx.showToast({ title: '模拟下单成功', icon: 'success' });
        this.setData({ errorText: '' });
      }

    } catch (e1) {
      wx.hideLoading();
      this.setData({ errorText: '网络异常' });
      wx.showToast({ title: '网络异常', icon: 'error' });
    } finally {
      this.setData({ creating: false });
    }
  },

  // 检查订单状态
  async checkOrderStatus(orderId) {
    try {
      const res = await apiService.callCloudFunction('payment', {
        action: 'checkOrderStatus',
        orderId: orderId
      });

      if (res?.success) {
        const order = res.data;
        const statusText = this.getOrderStatusText(order.status);

        wx.showModal({
          title: '订单状态',
          content: `订单状态：${statusText}\n订单号：${orderId}`,
          showCancel: false,
          confirmText: '我知道了'
        });
      }
    } catch (error) {
      console.error('检查订单状态失败:', error);
    }
  },

  // 获取订单状态文本
  getOrderStatusText(status) {
    const statusMap = {
      'pending': '待支付',
      'completed': '已完成',
      'failed': '支付失败',
      'expired': '已过期',
      'cancelled': '已取消'
    };
    return statusMap[status] || status;
  },

  gotoRechargeRecords() {
    wx.navigateTo({ url: '/subPackageRecords/pages/records/recharge' });
  },

  /**
   * iOS平台支付提示
   */
  showIOSPaymentTip() {
    wx.showModal({
      title: 'iOS支付限制',
      content: '由于苹果政策限制，暂不支持iOS设备内购买。\n\n您可以：\n1. 使用安卓设备充值\n2. 联系客服获取充值码\n3. 分享给好友邀请得积分',
      confirmText: '联系客服',
      cancelText: '我知道了',
      success: (res) => {
        if (res.confirm) {
          // 复制客服微信或跳转客服页面
          wx.setClipboardData({
            data: '17620309403',
            success: () => {
              wx.showToast({
                title: '客服微信已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  }
});