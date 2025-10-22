// AI摄影师首页逻辑
const apiService = require('../../utils/api');
const app = getApp();

Page({
  data: {
    userInfo: null,
    loading: false
  },

  onShow() {
    // 更新自定义TabBar选中状态（统一tab顺序：摄影=0）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      })
    }

    // 页面每次显示时，都从全局同步并异步刷新用户信息
    this.refreshHomePage();
  },

  /**
   * 刷新首页数据 - 优化版本
   * 1. 立即从 globalData 更新视图（不显示加载中）
   * 2. 后台异步从服务器拉取最新信息
   */
  async refreshHomePage() {
    // 立即从全局数据更新UI，不显示加载中
    const currentUserInfo = app.globalData.userInfo;
    this.setData({
      userInfo: currentUserInfo
    });
    console.log('index.js: onShow - 从 globalData 同步用户信息', currentUserInfo);

    // 后台异步刷新最新用户信息，不阻塞页面显示
    if (currentUserInfo) {
      console.log('index.js: onShow - 用户已登录，后台异步刷新用户信息...');
      setTimeout(async () => {
        try {
          const newUserInfo = await app.refreshUserInfo();
          if (newUserInfo) {
            this.setData({
              userInfo: newUserInfo
            });
            console.log('index.js: onShow - 后台刷新用户信息成功', newUserInfo);
          }
        } catch (error) {
          console.warn('index.js: onShow - 后台刷新用户信息失败', error);
          // 静默失败，不影响用户体验
        }
      }, 0);
    } else {
      console.log('index.js: onShow - 用户未登录，无需刷新');
    }
  },

  /**
   * 用户登录
   */
  onLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (userProfileRes) => {
        console.log('index.js: onLogin - 获取微信用户信息成功', userProfileRes.userInfo);
        this.processLogin(userProfileRes.userInfo);
      },
      fail: (error) => {
        console.error('index.js: onLogin - 获取微信用户信息失败', error);
        let errorMsg = '登录失败，请重试';
        if (error.errMsg && error.errMsg.includes('getUserProfile:fail auth deny')) {
          errorMsg = '需要授权才能使用完整功能';
        }
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    });
  },

  /**
   * 处理登录流程 - 优化版（减少API调用次数）
   */
  async processLogin(wxUserInfo) {
    try {
      console.log('index.js: processLogin - 开始处理登录流程...');

      // 🚀 优化：直接调用 registerUser，后端会自动判断新老用户
      // - 如果是新用户：创建账号并返回
      // - 如果是老用户：直接返回用户信息
      // 避免了之前需要两次API调用的问题
      console.log('index.js: processLogin - 调用 registerUser（自动处理新老用户）');
      const result = await apiService.registerUser(wxUserInfo);

      if (result.success && result.data) {
        // 后端返回的数据结构可能不一致，需要适配
        const userInfo = result.data.user_info || result.data;
        const isNewUser = result.data.is_new_user || false;

        // **关键步骤：调用全局方法，将用户信息设置到全局**
        app.setUserInfo(userInfo);

        // 更新当前页面的数据
        this.setData({
          userInfo: userInfo,
          loading: false
        });

        // 显示欢迎信息
        wx.showToast({
          title: isNewUser ? '欢迎您！' : '欢迎回来！',
          icon: 'success',
          duration: 1500
        });

        console.log('index.js: processLogin - 登录成功，全局用户信息已设置', userInfo);
      } else {
        throw new Error(result.message || '登录失败');
      }
    } catch (error) {
      console.error('index.js: processLogin - 登录流程异常', error);
      wx.showToast({
        title: error.message || '登录失败，请重试',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 跳转到服装拍摄页面
   */
  goToPhotography() {
    wx.navigateTo({
      url: '/pages/photography/photography'
    })
  },

  /**
   * 跳转到模特换装页面
   */
  goToFitting() {
    wx.navigateTo({
      url: '/pages/fitting/fitting'
    })
  },

  /**
   * 跳转到积分页面 - 需要登录
   */
  goToCredits() {
    if (!this.data.userInfo) {
      // 显示友好的登录提示，而不是生硬的"请先登录"
      wx.showModal({
        title: '查看积分',
        content: '请先登录查看您的积分余额',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            this.onLogin()
          }
        }
      })
      return
    }

    wx.navigateTo({
      url: '/pages/credits/credits'
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    // imageUrl会自动使用页面截图
    return {
      title: 'AI摄影师 - 用AI技术重新定义摄影艺术',
      path: '/pages/index/index'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    // imageUrl会自动使用页面截图
    return {
      title: 'AI摄影师 - 用AI技术重新定义摄影艺术'
    }
  },

})