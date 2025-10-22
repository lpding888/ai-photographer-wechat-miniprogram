// 消费记录
const apiService = require('../../../../utils/api.js');

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
      console.log('[consume] skip: fetching');
      return;
    }
    this._fetching = true;

    this.setData({ loading: true });
    console.log('[consume] fetchList:start');
    try {
      if (typeof apiService.getConsumeRecords === 'function') {
        console.log('[consume] call getConsumeRecords');
        const res = await apiService.getConsumeRecords();
        console.log('[consume] result raw:', res);
        if (res?.success) {
          const data = res.data || [];
          const arr = Array.isArray(data) ? data : (data.list || data.records || data.items || []);
          const mapped = (arr || []).map(this.normalize);
          const merged = this.consolidateRecords(mapped);
          console.log('[consume] items:', { rawLen: (arr||[]).length, mappedLen: (mapped||[]).length, mergedLen: (merged||[]).length });
          this.setData({ list: merged, loading: false });
          console.log('[consume] setData success, list len:', this.data.list?.length);
          // 0.8秒窗口后允许下一次请求
          setTimeout(() => { this._fetching = false; }, 800);
          return;
        }
      }
      console.warn('[consume] no success, fallback empty');
      // 本地占位
      this.setData({ list: [], loading: false, errorText: '暂无记录' });
      setTimeout(() => { this._fetching = false; }, 800);
    } catch (e) {
      console.error('[consume] fetchList:error', e);
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
    // 兼容更多时间字段
    const t = x?.time || x?.created_time || x?.created_at || x?.create_time || x?.createdAt || x?.ts || Date.now();
    const dt = new Date(typeof t === 'number' || typeof t === 'string' ? t : Date.now());
    const time_text = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    // 兼容张数字段：count/credits/quantity/amount/change/delta
    let raw = x?.count ?? x?.credits ?? x?.quantity ?? x?.amount ?? x?.change ?? x?.delta ?? 0;
    // 若后端返回正负变动值，消费通常为负，统一转为正数展示并在模板前面加 "-"
    const consume = Math.abs(Number(raw)) || 0;
    // 类型兼容
    const type = x?.type || x?.biz_type || '';
    const type_text = x?.type_text || (type === 'fitting' ? '智能试衣' : type === 'photography' ? '服装摄影' : (type || '消费'));
    return {
      id: x?.id || x?._id || x?.record_id || String(t),
      type_text,
      count: consume,
      ref_id: x?.ref_id || x?.work_id || x?.task_id || '',
      time_text
    };
  },

  /**
   * 将同一任务/作品的多条消费明细合并为一条，张数相加，时间取最新
   * 依据优先级作为聚合键：ref_id > id
   */
  consolidateRecords(list = []) {
    if (!Array.isArray(list) || list.length === 0) return [];
    const map = {};
    for (const it of list) {
      const key = it.ref_id || it.id;
      if (!key) {
        const soloKey = `__solo__${it.id || Math.random()}`;
        if (!map[soloKey]) map[soloKey] = { ...it };
        else {
          map[soloKey].count += (Number(it.count) || 0);
          if (it.time_text && map[soloKey].time_text && it.time_text > map[soloKey].time_text) {
            map[soloKey].time_text = it.time_text;
          }
        }
        continue;
      }
      if (!map[key]) {
        map[key] = { ...it };
      } else {
        map[key].count += (Number(it.count) || 0);
        if (it.time_text && map[key].time_text && it.time_text > map[key].time_text) {
          map[key].time_text = it.time_text;
        }
      }
    }
    const merged = Object.values(map);
    merged.sort((a, b) => (b.time_text || '').localeCompare(a.time_text || ''));
    return merged;
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