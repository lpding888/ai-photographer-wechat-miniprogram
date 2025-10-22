// 用户中心页面逻辑
const app = getApp();
const apiService = require('../../utils/api.js');

// 本地归一化：兼容不同后端字段命名
function formatDate(input) {
  if (!input) return '';
  try {
    let ts = null;
    if (typeof input === 'number') {
      ts = input > 1e12 ? input : input * 1000;
    } else if (typeof input === 'string') {
      // 纯数字时间戳或 ISO 字符串
      if (/^\d+$/.test(input)) {
        const num = parseInt(input, 10);
        ts = num > 1e12 ? num : num * 1000;
      } else {
        const t = Date.parse(input);
        ts = isNaN(t) ? null : t;
      }
    } else if (input instanceof Date) {
      ts = input.getTime();
    }
    if (!ts) return String(input);
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch (e) {
    return String(input);
  }
}

function normalizeUserInfo(u) {
  if (!u) return null;
  const user_id = u.user_id || u._id || u.id || u.openid || u.uid || '';
  const createdRaw = u.created_at ?? u.register_time ?? u.createdAt ?? u.createdTime ?? u.create_time ?? u.created_at_ms ?? u.createdAtMs ?? '';
  const created_at = createdRaw ? formatDate(createdRaw) : '';
  return {
    ...u,
    user_id,
    created_at
  };
}

Page({
  data: {
    userInfo: null,
    loading: false,
    signInToday: false,
    signing: false,
    // 管理员隐藏入口
    adminTapCount: 0,
    lastAdminTap: 0,
    // 管理员状态
    isAdmin: false,
    // 编辑资料相关
    editingNickname: false,
    editNickname: '',
    editAvatarUrl: '',
    // 模式判断
    mode: 'commercial', // commercial | personal
    // 个人模式统计数据
    stats: {
      clothes: 0,
      works: 0,
      memories: 0
    }
  },

  onShow() {
    // 检查当前模式
    const mode = wx.getStorageSync('app_mode') || 'commercial'
    console.log('profile onShow - 当前模式:', mode)
    this.setData({ mode })

    // 更新自定义TabBar（先刷新列表，再设置选中）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar()

      // 刷新TabBar的tab列表
      if (tabBar.updateList) {
        tabBar.updateList()
      }

      // 设置选中状态
      const selected = mode === 'commercial' ? 2 : 3 // 商业=2, 个人=3
      tabBar.setData({ selected })
      console.log('profile onShow - 设置TabBar selected:', selected)
    }

    // 页面每次显示时，都执行一次完整的状态检查和刷新
    this.refreshProfile();

    // 商业模式：加载签到状态
    if (mode === 'commercial') {
      this.loadSignInState();
    }

    // 个人模式：加载统计数据
    if (mode === 'personal') {
      this.loadPersonalStats();
    }

    this.checkAdminStatus();
  },

  /**
   * 刷新个人中心数据
   * 1. 立即从 globalData 更新视图，保证快速响应
   * 2. 异步从服务器拉取最新信息，确保数据实时性
   */
  async refreshProfile() {
    // 步骤1: 立即从全局数据更新，确保页面基本信息能快速展示
    const currentUserInfo = app.globalData.userInfo;
    this.setData({
      userInfo: normalizeUserInfo(currentUserInfo)
    });
    console.log('profile.js: onShow - 从 globalData 同步用户信息', currentUserInfo);

    // 步骤2: 异步从服务器刷新最新用户信息，确保积分等数据是最新的
    // 只有在已登录的情况下才进行刷新
    if (currentUserInfo) {
      this.setData({ loading: true });
      console.log('profile.js: onShow - 用户已登录，开始从服务器刷新信息...');
      const newUserInfo = await app.refreshUserInfo();
      if (newUserInfo) {
        this.setData({
          userInfo: normalizeUserInfo(newUserInfo),
        });
        console.log('profile.js: onShow - 从服务器刷新用户信息成功', newUserInfo);
      } else {
        // 如果刷新失败（例如token失效），app.refreshUserInfo内部会清空登录状态
        // 这里我们只需要更新UI即可
        this.setData({
          userInfo: null
        });
        console.log('profile.js: onShow - 刷新用户信息失败或会话已失效，更新UI为未登录状态');
      }
      this.setData({ loading: false });
    } else {
      console.log('profile.js: onShow - 用户未登录，无需刷新');
    }
  },

  /**
   * 一键登录（直接在当前页面登录）
   */
  async goToLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      // 获取微信用户信息
      const userProfileRes = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: resolve,
          fail: reject
        });
      });

      console.log('profile.js: 获取微信用户信息成功');

      // 🚀 优化：直接调用registerUser，后端会自动判断新老用户
      console.log('profile.js: 调用 registerUser（自动处理新老用户）');
      const result = await apiService.registerUser(userProfileRes.userInfo);
      const isNewUser = result.data?.is_new_user || false;

      // 显示欢迎信息
      if (result.success) {
        wx.showToast({
          title: isNewUser ? '欢迎您！' : '欢迎回来！',
          icon: 'success',
          duration: 1500
        });
      }

      // 统一处理登录结果
      if (result.success && result.data) {
        // 保存到全局状态
        app.setUserInfo(result.data);
        // 立即更新当前页面
        this.setData({
          userInfo: normalizeUserInfo(result.data),
          loading: false
        });
        // 刷新管理员状态
        this.checkAdminStatus();
      } else {
        throw new Error(result.message || '登录失败');
      }

    } catch (error) {
      console.error('profile.js: 登录失败', error);
      let errorMsg = '登录失败，请重试';
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        errorMsg = '需要授权才能使用完整功能';
      }
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 跳转到积分充值页面 - 需要登录
   */
  goToRecharge() {
    if (!this.data.userInfo) {
      wx.showModal({
        title: '积分充值',
        content: '请先登录后再进行充值',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
      })
      return
    }

    wx.navigateTo({
      url: '/pages/recharge/recharge'
    });
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          console.log('profile.js: 用户确认退出登录');
          // 调用全局方法清空用户信息
          app.setUserInfo(null);
          // 更新当前页面的UI为未登录状态
          this.setData({
            userInfo: null
          });
          wx.showToast({
            title: '已退出',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 加载签到状态（优先服务端，退化为本地当天标记）
   */
  async loadSignInState() {
    try {
      if (typeof apiService.getSignInState === 'function') {
        const res = await apiService.getSignInState();
        if (res && res.success) {
          this.setData({ signInToday: !!res.data?.signed });
          return;
        }
      }
    } catch (e) {}
    // 本地回退：根据当天日期键判断
    const key = 'signIn_' + new Date().toISOString().slice(0,10);
    this.setData({ signInToday: !!wx.getStorageSync(key) });
  },

  /**
   * 每日签到：成功后积分+1并刷新用户信息（连续7天可获得2积分）- 需要登录
   */
  async handleSignIn() {
    if (!this.data.userInfo) {
      wx.showModal({
        title: '每日签到',
        content: '请先登录后再进行签到',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
      })
      return
    }

    if (this.data.signing || this.data.signInToday) return;
    this.setData({ signing: true });
    try {
      let ok = false;
      if (typeof apiService.dailyCheckin === 'function') {
        const res = await apiService.dailyCheckin();
        ok = !!(res && res.success);
      } else {
        ok = true; // 无后端时允许本地打点
      }
      if (ok) {
        // 本地当天标记
        const key = 'signIn_' + new Date().toISOString().slice(0,10);
        wx.setStorageSync(key, 1);
        this.setData({ signInToday: true });
        wx.showToast({ title: '签到成功 +1', icon: 'success' });
        // 刷新积分
        if (typeof app.refreshUserInfo === 'function') {
          const info = await app.refreshUserInfo();
          if (info) this.setData({ userInfo: normalizeUserInfo(info) });
        }
      } else {
        wx.showToast({ title: '签到失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '网络异常', icon: 'none' });
    } finally {
      this.setData({ signing: false });
    }
  },

  /**
   * 跳转充值记录/消费记录（如页面不存在则提示）
   */
  goToRecords(e) {
    const type = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.type) || 'consume';
    const map = {
      consume: '/pages/subPackageRecords/consume',
      recharge: '/pages/subPackageRecords/recharge'
    };
    const url = map[type] || map.consume;
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '记录页未接入', icon: 'none' })
    });
  },

  /**
   * 跳转到积分详情页面
   */
  goToCredits() {
    wx.navigateTo({
      url: '/pages/credits/credits'
    });
  },

  /**
   * 跳转到意见反馈页面
   */
  goToFeedback() {
    wx.navigateTo({
      url: '/pages/subPackageRecords/feedback/feedback'
    });
  },

  /**
   * 跳转到造型规划器
   */
  goToStylingPlanner() {
    wx.navigateTo({
      url: '/pages/styling-planner/styling-planner'
    });
  },

  /**
   * 跳转到造型回忆
   */
  goToMemories() {
    wx.navigateTo({
      url: '/pages/memories/memories'
    });
  },

  /**
   * 跳转到我的衣柜
   */
  goToWardrobe() {
    wx.switchTab({
      url: '/pages/wardrobe/wardrobe'
    });
  },

  /**
   * 加载个人模式统计数据
   */
  loadPersonalStats() {
    try {
      const dataManager = require('../../utils/data-manager.js')
      const clothes = dataManager.getWardrobeItems().length
      const memories = dataManager.getMemories().length
      // TODO: 从云数据库加载作品数量
      const works = 0

      this.setData({
        stats: { clothes, works, memories }
      })
    } catch (error) {
      console.error('加载个人统计数据失败:', error)
    }
  },

  /**
   * 切换模式
   */
  switchMode() {
    const currentMode = this.data.mode
    const targetMode = currentMode === 'commercial' ? 'personal' : 'commercial'
    const targetText = targetMode === 'commercial' ? '商业拍摄' : '个人生活'

    wx.showModal({
      title: '切换模式',
      content: `是否切换到${targetText}模式？`,
      confirmColor: '#FF9A56',
      success: (res) => {
        if (res.confirm) {
          wx.setStorageSync('app_mode', targetMode)

          // 跳转到对应模式的默认tab
          if (targetMode === 'commercial') {
            wx.switchTab({ url: '/pages/index/index' })
          } else {
            wx.switchTab({ url: '/pages/wardrobe/wardrobe' })
          }
        }
      }
    })
  },

  /**
   * 联系客服
   */
  contactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话/微信：17620309403\n工作时间：9:00-22:00',
      confirmText: '复制微信号',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: '17620309403',
            success: () => {
              wx.showToast({
                title: '已复制到剪贴板',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  /**
   * 邀请分享
   */
  onShareAppMessage() {
    const uid = (this.data.userInfo && (this.data.userInfo.user_id || this.data.userInfo._id)) || '';
    return {
      title: 'AI摄影师｜送你体验积分，一起玩转服装摄影与智能试衣',
      path: '/pages/index/index' + (uid ? ('?ref=' + encodeURIComponent(uid)) : ''),
      imageUrl: '/images/logo.png'
    };
  },

  /**
   * 分享赚积分
   */
  async shareForReward() {
    // 检查用户是否登录
    if (!this.data.userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    // 触发分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    // 调用系统分享
    wx.shareAppMessage({
      title: 'AI摄影师｜送你体验积分，一起玩转服装摄影与智能试衣',
      path: '/pages/index/index?ref=' + encodeURIComponent(this.data.userInfo.user_id || this.data.userInfo._id || ''),
      imageUrl: '/images/logo.png',
      success: async () => {
        console.log('分享成功，准备领取奖励');
        // 分享成功后，调用云函数领取奖励
        try {
          const result = await apiService.shareReward();
          if (result.success) {
            wx.showToast({
              title: result.message || '分享成功，获得积分',
              icon: 'success',
              duration: 2000
            });
            // 刷新用户信息
            await this.refreshProfile();
          } else {
            wx.showToast({
              title: result.message || '今日分享次数已用完',
              icon: 'none',
              duration: 2000
            });
          }
        } catch (error) {
          console.error('领取分享奖励失败:', error);
          wx.showToast({
            title: '领取奖励失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        console.log('分享失败或取消', error);
      }
    });
  },

  /**
   * 隐藏的管理员入口
   * 连续点击头像10次激活管理模式
   */
  onAvatarTap() {
    const now = Date.now()
    const timeDiff = now - this.data.lastAdminTap
    
    // 5秒内的点击才算数
    if (timeDiff < 5000) {
      const newCount = this.data.adminTapCount + 1
      this.setData({ 
        adminTapCount: newCount,
        lastAdminTap: now 
      })
      
      // 连续点击15次激活管理模式（更隐蔽）
      if (newCount >= 15) {
        this.tryOpenAdminPanel()
        this.setData({ adminTapCount: 0 })
      }
      // 移除提示，完全隐藏
    } else {
      // 超时5秒，重新计数
      this.setData({ 
        adminTapCount: 1,
        lastAdminTap: now 
      })
    }
  },

  /**
   * 尝试打开管理面板
   */
  async tryOpenAdminPanel() {
    try {
      // 验证管理员权限
      const api = require('../../utils/api')
      const result = await api.callCloudFunction('aimodels', {
        action: 'checkAdminPermission'
      })
      
      if (result.success && result.data.isAdmin) {
        // 是管理员，显示管理菜单
        wx.showActionSheet({
          itemList: ['🛠️ 管理中心', '🤖 AI模型管理', '📊 系统状态', '取消'],
          success: (res) => {
            if (res.tapIndex === 0) {
              // 跳转到管理中心页面（完整功能）
              wx.navigateTo({
                url: '/pages/subPackageAdmin/admin-center'
              })
            } else if (res.tapIndex === 1) {
              // 跳转到AI模型管理页面（简化版）
              wx.navigateTo({
                url: '/pages/subPackageAdmin/admin-models'
              })
            } else if (res.tapIndex === 2) {
              // 显示系统状态
              this.showSystemStatus()
            }
          }
        })
      } else {
        // 非管理员
        wx.showToast({
          title: '您没有管理员权限',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('管理员权限检查失败:', error)
      wx.showToast({
        title: '权限检查失败',
        icon: 'none'
      })
    }
  },

  /**
   * 显示系统状态
   */
  async showSystemStatus() {
    wx.showLoading({ title: '检查中...' })
    
    try {
      const api = require('../../utils/api')
      const result = await api.getAIModels('text-to-image', null, true)
      
      wx.hideLoading()
      
      if (result.success) {
        const activeModels = result.data.filter(m => m.is_active)
        wx.showModal({
          title: '系统状态',
          content: `当前有${activeModels.length}个活跃AI模型\n最高优先级: ${Math.max(...activeModels.map(m => m.priority))}`,
          showCancel: false
        })
      } else {
        wx.showToast({
          title: '获取状态失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: '检查失败',
        icon: 'none'
      })
    }
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    try {
      // 只有登录用户才检查管理员权限
      if (!app.globalData.userInfo) {
        this.setData({ isAdmin: false })
        return
      }

      const api = require('../../utils/api')
      const result = await api.callCloudFunction('aimodels', {
        action: 'checkAdminPermission'
      })

      const isAdmin = !!(result.success && result.data.isAdmin)
      this.setData({ isAdmin })

    } catch (error) {
      console.log('检查管理员权限失败:', error)
      this.setData({ isAdmin: false })
    }
  },

  /**
   * 直接进入管理中心
   */
  goToAdminCenter() {
    wx.navigateTo({
      url: '/pages/subPackageAdmin/admin-center'
    })
  },

  /**
   * 使用微信官方 chooseAvatar 功能选择头像
   */
  async onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    console.log('选择头像:', avatarUrl)

    this.setData({
      editAvatarUrl: avatarUrl
    })

    wx.showLoading({
      title: '上传中...',
      mask: true
    })

    try {
      // 上传到云存储
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
      const result = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: avatarUrl
      })

      console.log('头像上传成功:', result.fileID)

      // 更新用户资料
      await this.updateProfile({
        avatar_url: result.fileID
      })

      wx.hideLoading()
      wx.showToast({
        title: '头像更新成功',
        icon: 'success'
      })

    } catch (error) {
      console.error('头像上传失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '头像上传失败',
        icon: 'none'
      })
    }
  },

  /**
   * 开始编辑昵称
   */
  startEditNickname() {
    this.setData({
      editingNickname: true,
      editNickname: this.data.userInfo?.nickname || ''
    })
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    this.setData({
      editNickname: e.detail.value
    })
  },

  /**
   * 完成昵称编辑（失焦）
   */
  finishEditNickname() {
    // 如果没有改变，直接取消编辑
    if (this.data.editNickname === this.data.userInfo?.nickname) {
      this.setData({
        editingNickname: false
      })
    }
  },

  /**
   * 保存昵称
   */
  async saveNickname() {
    const nickname = this.data.editNickname.trim()

    if (!nickname) {
      wx.showToast({
        title: '昵称不能为空',
        icon: 'none'
      })
      return
    }

    if (nickname === this.data.userInfo?.nickname) {
      this.setData({
        editingNickname: false
      })
      return
    }

    wx.showLoading({
      title: '保存中...',
      mask: true
    })

    try {
      await this.updateProfile({
        nickname: nickname
      })

      this.setData({
        editingNickname: false
      })

      wx.hideLoading()
      wx.showToast({
        title: '昵称更新成功',
        icon: 'success'
      })

    } catch (error) {
      console.error('昵称保存失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  /**
   * 更新用户资料（调用云函数）
   */
  async updateProfile(data) {
    try {
      const result = await apiService.callCloudFunction('user', {
        action: 'updateUserInfo',
        ...data
      })

      if (result.success) {
        // 刷新用户信息
        await app.refreshUserInfo()
        const newUserInfo = app.globalData.userInfo

        this.setData({
          userInfo: normalizeUserInfo(newUserInfo),
          editAvatarUrl: '' // 清空临时头像
        })

        return true
      } else {
        throw new Error(result.message || '更新失败')
      }
    } catch (error) {
      console.error('更新用户资料失败:', error)
      throw error
    }
  }
});