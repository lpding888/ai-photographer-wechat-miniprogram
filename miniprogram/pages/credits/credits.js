// 积分明细页面
const apiService = require('../../utils/api.js')

// 时间格式化
function formatTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch (e) {
    return String(timestamp);
  }
}

Page({
  data: {
    // 积分信息
    userCredits: 0,
    totalEarned: 0,
    totalSpent: 0,

    // 明细列表
    records: [],
    loading: false,
    hasMore: true,
    isEmpty: false,

    // 筛选条件
    currentFilter: 'all', // all, earn, spend
    filters: [
      { key: 'all', label: '全部', icon: '📋' },
      { key: 'earn', label: '收入', icon: '💰' },
      { key: 'spend', label: '支出', icon: '🛒' }
    ],

    // 分页参数
    pageSize: 20,
    lastId: null
  },

  onLoad() {
    this.loadUserCredits();
    this.loadCreditRecords();
  },

  onPullDownRefresh() {
    this.refreshData();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  /**
   * 加载用户积分信息
   */
  async loadUserCredits() {
    try {
      const app = getApp();
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        this.setData({
          userCredits: userInfo.credits || 0
        });
      }

      // 获取积分统计
      const result = await apiService.getCreditSummary();

      if (result.success) {
        this.setData({
          userCredits: result.data.current || 0,
          totalEarned: result.data.totalEarned || 0,
          totalSpent: result.data.totalSpent || 0
        });
      }
    } catch (error) {
      console.error('加载积分信息失败:', error);
    }
  },

  /**
   * 加载积分明细记录
   */
  async loadCreditRecords() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const result = await apiService.getCreditRecords(
        this.data.currentFilter,
        this.data.pageSize,
        this.data.lastId
      );

      if (result.success) {
        const records = (result.data || []).map(record => {
          const amountDisplay = this.formatAmountDisplay(record);
          return {
            ...record,
            formatted_time: formatTime(record.created_at || record.createdAt || record.created_time),
            amount_display: amountDisplay,
            amountClass: amountDisplay.startsWith('+') ? 'earn' : 'spend',
            type_text: this.getTypeText(record.type),
            type_icon: this.getTypeIcon(record.type)
          };
        });

        if (this.data.lastId) {
          // 加载更多
          this.setData({
            records: [...this.data.records, ...records],
            hasMore: records.length >= this.data.pageSize,
            lastId: records.length > 0 ? records[records.length - 1]._id : null
          });
        } else {
          // 首次加载
          this.setData({
            records: records,
            hasMore: records.length >= this.data.pageSize,
            lastId: records.length > 0 ? records[records.length - 1]._id : null,
            isEmpty: records.length === 0
          });
        }
      } else {
        if (!this.data.lastId) {
          this.setData({ isEmpty: true });
        }
      }
    } catch (error) {
      console.error('加载积分记录失败:', error);
      if (!this.data.lastId) {
        this.setData({ isEmpty: true });
      }
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 格式化金额显示
   */
  formatAmountDisplay(record) {
    const amount = record.amount || 0;
    const type = record.type || '';

    // 收入类型列表
    const earnTypes = ['daily_sign', 'recharge', 'refund', 'admin_adjust', 'admin_add', 'invite_reward', 'share_reward', 'system_gift', 'signup_bonus', 'daily_bonus'];

    // 支出类型列表
    const spendTypes = ['photography', 'fitting', 'generation', 'consume', 'photography_generate', 'fitting_generate', 'ai_generation', 'work_generation', 'admin_deduct'];

    // 精确匹配
    if (earnTypes.includes(type)) {
      return `+${amount}`;
    } else if (spendTypes.includes(type)) {
      return `-${amount}`;
    }

    // 模糊匹配（兼容未来可能的新类型）
    if (type.includes('earn') || type.includes('sign') || type.includes('recharge') || type.includes('refund') || type.includes('reward') || type.includes('bonus') || type.includes('gift') || type.includes('add')) {
      return `+${amount}`;
    } else {
      return `-${amount}`;
    }
  },

  /**
   * 获取类型文本
   */
  getTypeText(type) {
    const typeMap = {
      // 收入类型
      'daily_sign': '每日签到',
      'recharge': '积分充值',
      'refund': '消费退款',
      'admin_adjust': '管理员调整',
      'admin_add': '管理员增加',
      'invite_reward': '邀请奖励',
      'share_reward': '分享奖励',
      'system_gift': '系统赠送',
      'signup_bonus': '注册奖励',
      'daily_bonus': '每日奖励',

      // 消费类型
      'photography': 'AI摄影',
      'fitting': '虚拟试衣',
      'generation': 'AI生成',
      'consume': '积分消费',
      'photography_generate': 'AI摄影生成',
      'fitting_generate': '试衣生成',
      'ai_generation': 'AI创作',
      'work_generation': '作品生成',
      'admin_deduct': '管理员扣除',

      // 其他类型
      'transfer': '积分转账',
      'exchange': '积分兑换',
      'expired': '积分过期',
      'correction': '数据校正'
    };

    // 如果找不到精确匹配，尝试模糊匹配
    if (typeMap[type]) {
      return typeMap[type];
    }

    // 模糊匹配常见模式
    if (type && typeof type === 'string') {
      const lowerType = type.toLowerCase();
      if (lowerType.includes('sign')) return '每日签到';
      if (lowerType.includes('recharge') || lowerType.includes('charge')) return '积分充值';
      if (lowerType.includes('photo') || lowerType.includes('photography')) return 'AI摄影';
      if (lowerType.includes('fit') || lowerType.includes('clothing')) return '虚拟试衣';
      if (lowerType.includes('generate') || lowerType.includes('creation')) return 'AI生成';
      if (lowerType.includes('refund') || lowerType.includes('return')) return '消费退款';
      if (lowerType.includes('admin')) return '管理员操作';
      if (lowerType.includes('consume') || lowerType.includes('cost')) return '积分消费';
      if (lowerType.includes('bonus') || lowerType.includes('reward')) return '奖励积分';
    }

    return type || '积分变动';
  },

  /**
   * 获取类型图标
   */
  getTypeIcon(type) {
    const iconMap = {
      // 收入类型
      'daily_sign': '📅',
      'recharge': '💳',
      'refund': '↩️',
      'admin_adjust': '⚙️',
      'admin_add': '➕',
      'invite_reward': '🎁',
      'share_reward': '🔗',
      'system_gift': '🎉',
      'signup_bonus': '🎊',
      'daily_bonus': '🌟',

      // 消费类型
      'photography': '📸',
      'fitting': '👔',
      'generation': '🤖',
      'consume': '🛒',
      'photography_generate': '📷',
      'fitting_generate': '👕',
      'ai_generation': '🎨',
      'work_generation': '✨',
      'admin_deduct': '➖',

      // 其他类型
      'transfer': '🔄',
      'exchange': '💱',
      'expired': '⏰',
      'correction': '🔧'
    };

    // 如果找不到精确匹配，尝试模糊匹配
    if (iconMap[type]) {
      return iconMap[type];
    }

    // 模糊匹配常见模式
    if (type && typeof type === 'string') {
      const lowerType = type.toLowerCase();
      if (lowerType.includes('sign')) return '📅';
      if (lowerType.includes('recharge') || lowerType.includes('charge')) return '💳';
      if (lowerType.includes('photo') || lowerType.includes('photography')) return '📸';
      if (lowerType.includes('fit') || lowerType.includes('clothing')) return '👔';
      if (lowerType.includes('generate') || lowerType.includes('creation')) return '🤖';
      if (lowerType.includes('refund') || lowerType.includes('return')) return '↩️';
      if (lowerType.includes('admin')) return '⚙️';
      if (lowerType.includes('consume') || lowerType.includes('cost')) return '🛒';
      if (lowerType.includes('bonus') || lowerType.includes('reward')) return '🎁';
    }

    return '💫';
  },

  /**
   * 切换筛选条件
   */
  switchFilter(e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.currentFilter) return;

    this.setData({
      currentFilter: filter,
      records: [],
      lastId: null,
      hasMore: true,
      isEmpty: false
    });

    this.loadCreditRecords();
  },

  /**
   * 刷新数据
   */
  refreshData() {
    this.setData({
      records: [],
      lastId: null,
      hasMore: true,
      isEmpty: false
    });

    this.loadUserCredits();
    this.loadCreditRecords();
  },

  /**
   * 加载更多
   */
  loadMore() {
    this.loadCreditRecords();
  },

  /**
   * 跳转到充值页面
   */
  goToRecharge() {
    wx.navigateTo({
      url: '/pages/recharge/recharge'
    });
  },

  /**
   * 显示积分说明
   */
  showCreditInfo() {
    wx.showModal({
      title: '积分说明',
      content: '• 每日签到可获得1积分（连续7天得2积分）\n• 分享赚积分每次2积分（每天3次）\n• 充值可获得对应积分\n• AI摄影和试衣消费积分\n• 邀请好友注册可获得5积分',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  /**
   * 分享页面
   */
  onShareAppMessage() {
    return {
      title: 'AI摄影师积分中心 - 记录每一分收获',
      path: '/pages/credits/credits',
      imageUrl: '/images/logo.png'
    };
  }
});