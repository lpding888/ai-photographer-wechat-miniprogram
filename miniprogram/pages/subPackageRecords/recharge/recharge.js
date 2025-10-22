// 充值记录
const apiService = require('../../../utils/api.js');

Page({
  data: {
    loading: true,
    list: [],
    errorText: ''
  },

  onShow() {
    this.fetchList();
  },

  async fetchList() {
    // 防抖：正在请求则直接跳过
    if (this._fetching) {
      console.log('[recharge] skip: fetching');
      return;
    }
    this._fetching = true;

    this.setData({ loading: true });
    console.log('[recharge] fetchList:start');
    try {
      if (typeof apiService.getRechargeRecords === 'function') {
        console.log('[recharge] call getRechargeRecords');
        const res = await apiService.getRechargeRecords();
        console.log('[recharge] result raw:', res);
        if (res?.success) {
          const list = (res.data || []).map(this.normalize);
          console.log('[recharge] items:', { rawLen: (res.data||[]).length, mappedLen: list.length });
          this.setData({ list, loading: false });
          console.log('[recharge] setData success, list len:', this.data.list?.length);
          setTimeout(() => { this._fetching = false; }, 800);
          return;
        }
      }
      console.warn('[recharge] no success, fallback empty');
      // 本地占位
      this.setData({ list: [], loading: false, errorText: '暂无记录' });
      setTimeout(() => { this._fetching = false; }, 800);
    } catch (e) {
      console.error('[recharge] fetchList:error', e);
      this.setData({ loading: false, errorText: '加载失败，请下拉重试' });
      if (!this._toastLock) {
        this._toastLock = true;
        wx.showToast({ title: '加载失败', icon: 'none' });
        setTimeout(() => { this._toastLock = false; }, 2000);
      }
      setTimeout(() => { this._fetching = false; }, 800);
    }
  },

  normalize(x) {
    const t = x?.time || x?.created_time || x?.created_at || Date.now();
    const dt = new Date(typeof t === 'number' || typeof t === 'string' ? t : Date.now());
    const time_text = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    // 后端订单字段为 credits/amount/status/package_type
    const credits = x?.credits ?? x?.count ?? 0;
    const status = x?.status || 'completed';
    const status_text = (String(status).toLowerCase() === 'pending') ? 'pending' : '完成';
    const packageName = x?.package_name || x?.package_type || '';
    return {
      id: x?.id || x?._id || String(t),
      package_name: packageName,
      packageDisplay: packageName || `${credits}张`,
      count: credits,
      amount: x?.amount ?? x?.price ?? 0,
      status: status_text,
      time_text
    };
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ errorText: '' });
    this.fetchList().finally(() => wx.stopPullDownRefresh());
  },

  // 重试按钮
  onRetry() {
    this.setData({ errorText: '' });
    this.fetchList();
  }
});