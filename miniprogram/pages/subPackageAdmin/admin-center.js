// 统一管理中心页面
const api = require('../../utils/api');

Page({
  data: {
    currentTab: 0, // 0: AI模型, 1: 提示词, 2: 场景, 3: 套餐管理, 4: 用户管理, 5: 数据统计
    isAdmin: false,
    
    // AI模型管理
    aiModels: [],
    showModelDialog: false,
    editingModel: null,
    modelForm: {
      name: '',
      description: '',
      type: '',
      apiUrl: '',
      apiKey: '',
      weight: 50,
      priority: 5
    },
    modelTypes: ['Stable Diffusion XL', 'DALL-E 3', 'Midjourney', 'Flux.1 Dev', 'Gemini'],
    modelTypeIndex: 0,
    showApiKey: false,
    
    // 提示词管理
    promptTemplates: [],
    showPromptDialog: false,
    editingPrompt: null,
    promptForm: {
      name: '',
      description: '',
      category: '',
      template: '',
      variablesText: ''
    },
    
    // 场景管理
    scenes: [],
    showSceneDialog: false,
    editingScene: null,
    sceneForm: {
      name: '',
      description: '',
      category: '',
      tagsText: '',
      icon: '',
      imageUrl: ''
    },

    // 套餐管理
    packages: [],
    showPackageDialog: false,
    editingPackage: null,
    packageForm: {
      name: '',
      description: '',
      credits: 25,
      price: 9.9,
      originalPrice: 12.5,
      discount: '',
      sortOrder: 1,
      isPopular: false,
      isActive: true
    },

    // 用户管理
    users: [],
    userFilter: {
      status: 'all', // all, active, inactive
      keyword: ''
    },

    // 积分调整
    showCreditsDialog: false,
    creditsForm: {
      userId: '',
      nickname: '',
      currentCredits: 0,
      adjustType: 'add', // add, deduct, set
      amount: 0,
      reason: '',
      previewCredits: 0
    },

    // 数据统计
    statistics: {
      totalUsers: 0,
      activeUsers: 0,
      totalWorks: 0,
      todayWorks: 0,
      totalCredits: 0,
      todayCredits: 0
    },

    loading: false,
    isEmpty: false
  },

  onLoad() {
    this.checkAdminStatus();
  },

  onShow() {
    // 页面切换时重新加载数据
    if (this.data.isAdmin) {
      this.loadCurrentTabData();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadCurrentTabData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 检查管理员状态
   */
  async checkAdminStatus() {
    this.setData({ loading: true });
    
    try {
      const app = getApp();
      const userInfo = app.globalData.userInfo;
      
      if (!userInfo || !userInfo.openid) {
        this.redirectToHome('请先登录');
        return;
      }
      
      // 通过后端验证管理员权限
      const result = await api.callCloudFunction('aimodels', {
        action: 'checkAdminPermission'
      });
      
      if (result.success && result.data.isAdmin) {
        this.setData({ isAdmin: true });
        this.loadCurrentTabData();
      } else {
        this.redirectToHome('您没有管理员权限');
      }
    } catch (error) {
      console.error('检查管理员状态失败:', error);
      this.redirectToHome('权限验证失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 重定向到首页
   */
  redirectToHome(message) {
    wx.showModal({
      title: '访问被拒绝',
      content: message,
      showCancel: false,
      success: () => {
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  },

  /**
   * 切换标签页
   */
  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    if (index === this.data.currentTab) return;
    
    this.setData({ currentTab: index });
    this.loadCurrentTabData();
  },

  /**
   * 加载当前标签页数据
   */
  async loadCurrentTabData() {
    if (!this.data.isAdmin) return;

    this.setData({ loading: true, isEmpty: false });

    try {
      switch (this.data.currentTab) {
        case 0:
          await this.loadAIModels();
          break;
        case 1:
          await this.loadPromptTemplates();
          break;
        case 2:
          await this.loadScenes();
          break;
        case 3:
          await this.loadPackages();
          break;
        case 4:
          await this.loadUsers();
          break;
        case 5:
          await this.loadStatistics();
          break;
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      this.setData({ loading: false });
      this.checkEmpty();
    }
  },

  // 检查是否为空
  checkEmpty() {
    const { currentTab, aiModels, promptTemplates, scenes, packages } = this.data;
    let isEmpty = false;

    switch (currentTab) {
      case 0:
        isEmpty = aiModels.length === 0;
        break;
      case 1:
        isEmpty = promptTemplates.length === 0;
        break;
      case 2:
        isEmpty = scenes.length === 0;
        break;
      case 3:
        isEmpty = packages.length === 0;
        break;
      case 4:
        isEmpty = this.data.users.length === 0;
        break;
      case 5:
        isEmpty = false; // 统计页面总是有内容
        break;
    }

    this.setData({ isEmpty });
  },

  /**
   * 加载AI模型列表
   */
  async loadAIModels() {
    try {
      const result = await api.getAIModels();
      if (result.success) {
        this.setData({ aiModels: result.data });
      } else {
        wx.showToast({
          title: result.message || '加载模型失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载AI模型失败:', error);
      wx.showToast({
        title: '加载模型失败',
        icon: 'error'
      });
    }
  },

  /**
   * 加载提示词模板列表
   */
  async loadPromptTemplates() {
    try {
      const result = await api.getPromptTemplates();
      if (result.success) {
        // 处理变量数组，转换为字符串以便在模板中显示
        const processedData = result.data.map(item => ({
          ...item,
          variablesText: Array.isArray(item.variables) ? item.variables.join(', ') : (item.variablesText || '')
        }));
        this.setData({ promptTemplates: processedData });
      } else {
        wx.showToast({
          title: result.message || '加载提示词失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载提示词模板失败:', error);
      wx.showToast({
        title: '加载提示词失败',
        icon: 'error'
      });
    }
  },

  /**
   * 加载场景列表
   */
  async loadScenes() {
    try {
      const result = await api.getScenes();
      if (result.success) {
        // 处理标签显示
        const scenes = result.data.map(scene => ({
          ...scene,
          tagsDisplay: Array.isArray(scene.tags) ? scene.tags.join(', ') : (scene.tags || '无')
        }));
        this.setData({ scenes });
      } else {
        wx.showToast({
          title: result.message || '加载场景失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载场景失败:', error);
      wx.showToast({
        title: '加载场景失败',
        icon: 'error'
      });
    }
  },

  /**
   * AI模型管理相关方法
   */
  // 显示添加模型对话框
  showAddModelDialog() {
    this.setData({
      showModelDialog: true,
      editingModel: null,
      modelForm: {
        name: '',
        description: '',
        type: '',
        apiUrl: '',
        apiKey: '',
        weight: 50,
        priority: 5
      },
      modelTypeIndex: 0,
      showApiKey: false
    });
  },

  // 隐藏模型对话框
  hideModelDialog() {
    this.setData({ showModelDialog: false });
  },

  // 防止事件冒泡
  stopPropagation() {
    // 空函数，用于阻止事件冒泡
  },

  // 编辑模型
  editModel(e) {
    const model = e.currentTarget.dataset.model;
    const typeIndex = this.data.modelTypes.findIndex(type => type === model.type) || 0;
    
    this.setData({
      showModelDialog: true,
      editingModel: model,
      modelForm: {
        name: model.name,
        description: model.description,
        type: model.type,
        apiUrl: model.apiUrl,
        apiKey: model.apiKey,
        weight: model.weight,
        priority: model.priority
      },
      modelTypeIndex: typeIndex
    });
  },

  // 模型表单输入处理
  onModelFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    // 字数限制
    const limits = {
      name: 50,
      description: 200,
      apiUrl: 200,
      apiKey: 100
    };
    
    if (limits[field] && value.length > limits[field]) {
      wx.showToast({
        title: `${this.getModelFieldName(field)}不能超过${limits[field]}字符`,
        icon: 'error'
      });
      return;
    }
    
    this.setData({ [`modelForm.${field}`]: value });
  },
  
  // 获取模型字段中文名称
  getModelFieldName(field) {
    const names = {
      name: '模型名称',
      description: '模型描述',
      apiUrl: 'API地址',
      apiKey: 'API密钥'
    };
    return names[field] || field;
  },

  // 模型类型选择
  onModelTypeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      modelTypeIndex: index,
      'modelForm.type': this.data.modelTypes[index]
    });
  },

  // 模型权重滑块
  onModelWeightChange(e) {
    this.setData({ 'modelForm.weight': e.detail.value });
  },

  // 模型优先级滑块
  onModelPriorityChange(e) {
    this.setData({ 'modelForm.priority': e.detail.value });
  },

  // 切换API密钥可见性
  toggleApiKeyVisibility() {
    this.setData({ showApiKey: !this.data.showApiKey });
  },

  // 保存模型
  async saveModel() {
    const { modelForm, editingModel, modelTypeIndex, modelTypes } = this.data;
    
    // 表单验证
    if (!modelForm.name.trim()) {
      wx.showToast({ title: '请输入模型名称', icon: 'error' });
      return;
    }
    if (!modelForm.description.trim()) {
      wx.showToast({ title: '请输入模型描述', icon: 'error' });
      return;
    }
    if (modelTypeIndex === -1 || !modelTypes[modelTypeIndex]) {
      wx.showToast({ title: '请选择模型类型', icon: 'error' });
      return;
    }
    if (!modelForm.apiUrl.trim()) {
      wx.showToast({ title: '请输入API地址', icon: 'error' });
      return;
    }
    if (!modelForm.apiKey.trim()) {
      wx.showToast({ title: '请输入API密钥', icon: 'error' });
      return;
    }

    const modelData = {
      name: modelForm.name.trim(),
      description: modelForm.description.trim(),
      type: modelTypes[modelTypeIndex],
      apiUrl: modelForm.apiUrl.trim(),
      apiKey: modelForm.apiKey.trim(),
      weight: parseInt(modelForm.weight),
      priority: parseInt(modelForm.priority),
      status: 'active'
    };

    wx.showLoading({ title: editingModel ? '更新中...' : '添加中...' });

    try {
      let result;
      if (editingModel) {
        result = await api.updateAIModel(editingModel._id, modelData);
      } else {
        result = await api.addAIModel(modelData);
      }

      if (result.success) {
        wx.showToast({
          title: editingModel ? '更新成功' : '添加成功',
          icon: 'success'
        });
        this.hideModelDialog();
        this.loadAIModels(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('保存模型失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 切换模型状态
  async toggleModelStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'active' ? 'inactive' : 'active';
    
    wx.showLoading({ title: newStatus === 'active' ? '启用中...' : '禁用中...' });
    
    try {
      const result = await api.updateAIModel(id, { status: newStatus });
      if (result.success) {
        wx.showToast({
          title: newStatus === 'active' ? '已启用' : '已禁用',
          icon: 'success'
        });
        this.loadAIModels(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('切换模型状态失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除模型
  async deleteModel(e) {
    const { id } = e.currentTarget.dataset;
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个模型吗？删除后无法恢复。',
        success: resolve
      });
    });
    
    if (!result.confirm) return;
    
    wx.showLoading({ title: '删除中...' });
    
    try {
      const deleteResult = await api.deleteAIModel(id);
      if (deleteResult.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        this.loadAIModels(); // 重新加载数据
      } else {
        wx.showToast({
          title: deleteResult.message || '删除失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('删除模型失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 提示词管理相关方法
   */
  // 显示添加提示词对话框
  showAddPromptDialog() {
    this.setData({
      showPromptDialog: true,
      editingPrompt: null,
      promptForm: {
        name: '',
        description: '',
        category: 'photography', // 默认为摄影类型
        template: '',
        variablesText: ''
      }
    });
  },

  // 隐藏提示词对话框
  hidePromptDialog() {
    this.setData({ showPromptDialog: false });
  },

  // 编辑提示词
  editPrompt(e) {
    const prompt = e.currentTarget.dataset.prompt;
    this.setData({
      showPromptDialog: true,
      editingPrompt: prompt,
      promptForm: {
        name: prompt.name || '',
        description: prompt.description || '',
        category: prompt.category || '',
        template: prompt.template || '',
        variablesText: prompt.variablesText || (Array.isArray(prompt.variables) ? prompt.variables.join(', ') : '')
      }
    });
  },

  // 提示词表单输入处理
  onPromptFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    // 字数限制
    const limits = {
      name: 50,
      description: 200,
      category: 30,
      template: 2000, // 提示词模板限制2000字符
      variablesText: 300
    };
    
    if (limits[field] && value.length > limits[field]) {
      wx.showToast({
        title: `${this.getFieldName(field)}不能超过${limits[field]}字符`,
        icon: 'error'
      });
      return;
    }
    
    this.setData({ [`promptForm.${field}`]: value });
  },
  
  // 获取字段中文名称
  getFieldName(field) {
    const names = {
      name: '模板名称',
      description: '模板描述', 
      category: '分类',
      template: '提示词模板',
      variablesText: '变量列表'
    };
    return names[field] || field;
  },

  // 保存提示词
  async savePrompt() {
    const { promptForm, editingPrompt } = this.data;
    
    // 表单验证
    if (!promptForm.name.trim()) {
      wx.showToast({ title: '请输入模板名称', icon: 'error' });
      return;
    }
    if (!promptForm.description.trim()) {
      wx.showToast({ title: '请输入模板描述', icon: 'error' });
      return;
    }
    if (!promptForm.category.trim()) {
      wx.showToast({ title: '请输入分类（photography/fitting）', icon: 'error' });
      return;
    }
    if (!promptForm.template.trim()) {
      wx.showToast({ title: '请输入提示词模板', icon: 'error' });
      return;
    }

    // 处理变量
    const variables = promptForm.variablesText.split(',').map(v => v.trim()).filter(v => v);

    const promptData = {
      type: promptForm.category.trim() || 'photography', // 默认为photography类型
      name: promptForm.name.trim(),
      description: promptForm.description.trim(),
      category: promptForm.category.trim() || '默认分类',
      template: promptForm.template.trim(),
      variables: variables
    };

    wx.showLoading({ title: editingPrompt ? '更新中...' : '添加中...' });

    try {
      let result;
      if (editingPrompt) {
        result = await api.updatePromptTemplate(editingPrompt._id || editingPrompt.id, promptData);
      } else {
        result = await api.addPromptTemplate(promptData);
      }

      if (result.success) {
        wx.showToast({
          title: editingPrompt ? '更新成功' : '添加成功',
          icon: 'success'
        });
        this.hidePromptDialog();
        this.loadPromptTemplates(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('保存提示词失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除提示词
  async deletePrompt(e) {
    const { id } = e.currentTarget.dataset;
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个提示词模板吗？删除后无法恢复。',
        success: resolve
      });
    });
    
    if (!result.confirm) return;
    
    wx.showLoading({ title: '删除中...' });
    
    try {
      const deleteResult = await api.deletePromptTemplate(id);
      if (deleteResult.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        this.loadPromptTemplates(); // 重新加载数据
      } else {
        wx.showToast({
          title: deleteResult.message || '删除失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('删除提示词失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 场景管理相关方法
   */
  // 显示添加场景对话框
  showAddSceneDialog() {
    this.setData({
      showSceneDialog: true,
      editingScene: null,
      sceneForm: {
        name: '',
        description: '',
        category: '',
        tagsText: '',
        icon: '',
        imageUrl: ''
      }
    });
  },

  // 隐藏场景对话框
  hideSceneDialog() {
    this.setData({ showSceneDialog: false });
  },

  // 编辑场景
  editScene(e) {
    const scene = e.currentTarget.dataset.scene;
    this.setData({
      showSceneDialog: true,
      editingScene: scene,
      sceneForm: {
        name: scene.name,
        description: scene.description,
        category: scene.category,
        tagsText: scene.tags ? scene.tags.join(', ') : '',
        icon: scene.icon,
        imageUrl: scene.imageUrl || scene.image_url || ''
      }
    });
  },

  // 场景表单输入处理
  onSceneFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    // 字数限制
    const limits = {
      name: 50,
      description: 200,
      category: 30,
      tagsText: 100,
      icon: 50,
      imageUrl: 500
    };
    
    if (limits[field] && value.length > limits[field]) {
      wx.showToast({
        title: `${this.getSceneFieldName(field)}不能超过${limits[field]}字符`,
        icon: 'error'
      });
      return;
    }
    
    this.setData({ [`sceneForm.${field}`]: value });
  },
  
  // 获取场景字段中文名称
  getSceneFieldName(field) {
    const names = {
      name: '场景名称',
      description: '场景描述',
      category: '场景分类',
      tagsText: '场景标签',
      icon: '场景图标',
      imageUrl: '场景图片链接'
    };
    return names[field] || field;
  },

  // 保存场景
  async saveScene() {
    const { sceneForm, editingScene } = this.data;
    
    // 表单验证
    if (!sceneForm.name.trim()) {
      wx.showToast({ title: '请输入场景名称', icon: 'error' });
      return;
    }
    if (!sceneForm.description.trim()) {
      wx.showToast({ title: '请输入场景描述', icon: 'error' });
      return;
    }
    if (!sceneForm.category.trim()) {
      wx.showToast({ title: '请输入场景分类', icon: 'error' });
      return;
    }

    // 处理标签
    const tags = sceneForm.tagsText.split(',').map(tag => tag.trim()).filter(tag => tag);

    const sceneData = {
      name: sceneForm.name.trim(),
      description: sceneForm.description.trim(),
      category: sceneForm.category.trim(),
      tags: tags,
      icon: sceneForm.icon.trim() || '📸',
      imageUrl: sceneForm.imageUrl.trim(),
      enabled: true
    };

    wx.showLoading({ title: editingScene ? '更新中...' : '添加中...' });

    try {
      let result;
      if (editingScene) {
        result = await api.updateScene(editingScene.id, sceneData);
      } else {
        result = await api.addScene(sceneData);
      }

      if (result.success) {
        wx.showToast({
          title: editingScene ? '更新成功' : '添加成功',
          icon: 'success'
        });
        this.hideSceneDialog();
        this.loadScenes(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('保存场景失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 切换场景状态
  async toggleSceneStatus(e) {
    const { id, enabled } = e.currentTarget.dataset;
    const newEnabled = !enabled;
    
    wx.showLoading({ title: newEnabled ? '启用中...' : '禁用中...' });
    
    try {
      const result = await api.toggleSceneStatus(id, newEnabled);
      if (result.success) {
        wx.showToast({
          title: newEnabled ? '已启用' : '已禁用',
          icon: 'success'
        });
        this.loadScenes(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('切换场景状态失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除场景
  async deleteScene(e) {
    const { id } = e.currentTarget.dataset;
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个场景吗？删除后无法恢复。',
        success: resolve
      });
    });
    
    if (!result.confirm) return;
    
    wx.showLoading({ title: '删除中...' });
    
    try {
      const deleteResult = await api.deleteScene(id);
      if (deleteResult.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        this.loadScenes(); // 重新加载数据
      } else {
        wx.showToast({
          title: deleteResult.message || '删除失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('删除场景失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 用户管理相关方法
   */
  async loadUsers() {
    try {
      const result = await api.getUsers(this.data.userFilter);
      if (result.success) {
        this.setData({ users: result.data });
      } else {
        wx.showToast({
          title: result.message || '加载用户失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载用户失败:', error);
      wx.showToast({
        title: '加载用户失败',
        icon: 'error'
      });
    }
  },

  // 用户状态筛选
  onUserFilterChange(e) {
    const { filter, value } = e.currentTarget.dataset;
    this.setData({
      [`userFilter.${filter}`]: value
    });
    this.loadUsers();
  },

  // 用户搜索
  onUserSearch(e) {
    const keyword = e.detail.value;
    this.setData({
      'userFilter.keyword': keyword
    });
    // 防抖搜索
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.loadUsers();
    }, 500);
  },

  // 切换用户状态
  async toggleUserStatus(e) {
    const { userId, currentStatus } = e.currentTarget.dataset;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    wx.showLoading({ title: '更新中...' });

    try {
      const result = await api.updateUserStatus(userId, newStatus);

      if (result.success) {
        wx.showToast({
          title: newStatus === 'active' ? '用户已激活' : '用户已禁用',
          icon: 'success'
        });
        this.loadUsers();
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('切换用户状态失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 积分调整相关方法
   */
  // 显示积分调整对话框
  showAdjustCreditsDialog(e) {
    const user = e.currentTarget.dataset.user;
    const currentCredits = user.credits || 0;

    this.setData({
      showCreditsDialog: true,
      creditsForm: {
        userId: user._id || user.id,
        nickname: user.nickname || user.name || '未命名用户',
        currentCredits: currentCredits,
        adjustType: 'add',
        amount: 0,
        reason: '',
        previewCredits: currentCredits
      }
    });
  },

  // 隐藏积分调整对话框
  hideCreditsDialog() {
    this.setData({ showCreditsDialog: false });
  },

  // 选择调整类型
  selectAdjustType(e) {
    const type = e.currentTarget.dataset.type;
    const { currentCredits, amount } = this.data.creditsForm;

    // 计算预览积分
    let previewCredits = currentCredits;
    if (type === 'add') {
      previewCredits = currentCredits + (parseInt(amount) || 0);
    } else if (type === 'deduct') {
      previewCredits = currentCredits - (parseInt(amount) || 0);
    } else if (type === 'set') {
      previewCredits = parseInt(amount) || 0;
    }

    this.setData({
      'creditsForm.adjustType': type,
      'creditsForm.previewCredits': previewCredits
    });
  },

  // 积分数量输入
  onCreditsAmountInput(e) {
    const amount = parseInt(e.detail.value) || 0;
    const { currentCredits, adjustType } = this.data.creditsForm;

    // 计算预览积分
    let previewCredits = currentCredits;
    if (adjustType === 'add') {
      previewCredits = currentCredits + amount;
    } else if (adjustType === 'deduct') {
      previewCredits = currentCredits - amount;
    } else if (adjustType === 'set') {
      previewCredits = amount;
    }

    this.setData({
      'creditsForm.amount': amount,
      'creditsForm.previewCredits': previewCredits
    });
  },

  // 调整原因输入
  onCreditsReasonInput(e) {
    const reason = e.detail.value || '';
    this.setData({
      'creditsForm.reason': reason
    });
  },

  // 确认调整积分
  async confirmAdjustCredits() {
    const { userId, adjustType, amount, reason, previewCredits } = this.data.creditsForm;

    // 验证
    if (!amount || amount <= 0) {
      wx.showToast({
        title: '请输入有效的积分数量',
        icon: 'error'
      });
      return;
    }

    if (previewCredits < 0) {
      wx.showToast({
        title: '调整后积分不能为负数',
        icon: 'error'
      });
      return;
    }

    wx.showLoading({ title: '调整中...' });

    try {
      const result = await api.callCloudFunction('user', {
        action: 'adjustCredits',
        userId: userId,
        adjustType: adjustType,
        amount: amount,
        reason: reason
      });

      if (result.success) {
        wx.showToast({
          title: '积分调整成功',
          icon: 'success'
        });
        this.hideCreditsDialog();
        this.loadUsers(); // 重新加载用户列表
      } else {
        wx.showToast({
          title: result.message || '调整失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('调整积分失败:', error);
      wx.showToast({
        title: '调整失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 数据统计相关方法
   */
  async loadStatistics() {
    try {
      const result = await api.getStatistics();
      if (result.success) {
        this.setData({ statistics: result.data });
      } else {
        wx.showToast({
          title: result.message || '加载统计数据失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
      wx.showToast({
        title: '加载统计数据失败',
        icon: 'error'
      });
    }
  },

  // 导出数据
  async exportData(e) {
    const { type } = e.currentTarget.dataset; // type: users, works, orders

    wx.showLoading({ title: '导出中...' });

    try {
      const result = await api.exportData(type);

      if (result.success) {
        // 复制数据到剪贴板
        wx.setClipboardData({
          data: JSON.stringify(result.data, null, 2),
          success: () => {
            wx.showToast({
              title: '数据已复制到剪贴板',
              icon: 'success'
            });
          }
        });
      } else {
        wx.showToast({
          title: result.message || '导出失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('导出数据失败:', error);
      wx.showToast({
        title: '导出失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 套餐管理相关方法
   */
  // 加载套餐列表
  async loadPackages() {
    try {
      const result = await api.callCloudFunction('payment', {
        action: 'getAllPackages'  // 使用新的action获取所有套餐
      });
      if (result.success) {
        this.setData({ packages: result.data || [] });
      } else {
        wx.showToast({
          title: result.message || '加载套餐失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('加载套餐失败:', error);
      wx.showToast({
        title: '加载套餐失败',
        icon: 'error'
      });
    }
  },

  // 显示添加套餐对话框
  showAddPackageDialog() {
    this.setData({
      showPackageDialog: true,
      editingPackage: null,
      packageForm: {
        name: '',
        description: '',
        credits: 25,
        price: 9.9,
        originalPrice: 12.5,
        discount: '',
        sortOrder: 1,
        isPopular: false,
        isActive: true
      }
    });
  },

  // 隐藏套餐对话框
  hidePackageDialog() {
    this.setData({ showPackageDialog: false });
  },

  // 编辑套餐
  editPackage(e) {
    const pkg = e.currentTarget.dataset.package;
    this.setData({
      showPackageDialog: true,
      editingPackage: pkg,
      packageForm: {
        name: pkg.name || '',
        description: pkg.description || '',
        credits: pkg.credits || 25,
        price: pkg.price || 9.9,
        originalPrice: pkg.original_price || pkg.originalPrice || 12.5,
        discount: pkg.discount || '',
        sortOrder: pkg.sort_order || pkg.sortOrder || 1,
        isPopular: pkg.is_popular || pkg.isPopular || false,
        isActive: pkg.is_active !== false
      }
    });
  },

  // 套餐表单输入处理
  onPackageFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;

    // 字数限制
    const limits = {
      name: 30,
      description: 100,
      discount: 20
    };

    if (limits[field] && value.length > limits[field]) {
      wx.showToast({
        title: `${this.getPackageFieldName(field)}不能超过${limits[field]}字符`,
        icon: 'error'
      });
      return;
    }

    // 数字字段处理
    if (['credits', 'price', 'originalPrice', 'sortOrder'].includes(field)) {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0) {
        wx.showToast({
          title: '请输入有效的数字',
          icon: 'error'
        });
        return;
      }
      this.setData({ [`packageForm.${field}`]: numValue });
    } else {
      this.setData({ [`packageForm.${field}`]: value });
    }
  },

  // 获取套餐字段中文名称
  getPackageFieldName(field) {
    const names = {
      name: '套餐名称',
      description: '套餐描述',
      credits: '积分数量',
      price: '售价',
      originalPrice: '原价',
      discount: '折扣标签',
      sortOrder: '排序'
    };
    return names[field] || field;
  },

  // 切换套餐开关项
  onPackageToggle(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({ [`packageForm.${field}`]: value });
  },

  // 保存套餐
  async savePackage() {
    const { packageForm, editingPackage } = this.data;

    // 表单验证
    if (!packageForm.name.trim()) {
      wx.showToast({ title: '请输入套餐名称', icon: 'error' });
      return;
    }
    if (!packageForm.description.trim()) {
      wx.showToast({ title: '请输入套餐描述', icon: 'error' });
      return;
    }
    if (packageForm.credits <= 0) {
      wx.showToast({ title: '积分数量必须大于0', icon: 'error' });
      return;
    }
    if (packageForm.price <= 0) {
      wx.showToast({ title: '价格必须大于0', icon: 'error' });
      return;
    }

    const packageData = {
      name: packageForm.name.trim(),
      description: packageForm.description.trim(),
      credits: parseInt(packageForm.credits),
      price: parseFloat(packageForm.price),
      original_price: parseFloat(packageForm.originalPrice || packageForm.price),
      discount: packageForm.discount.trim(),
      sort_order: parseInt(packageForm.sortOrder),
      is_popular: packageForm.isPopular,
      is_active: packageForm.isActive
    };

    wx.showLoading({ title: editingPackage ? '更新中...' : '添加中...' });

    try {
      let result;
      if (editingPackage) {
        result = await api.callCloudFunction('payment', {
          action: 'updatePackage',
          packageId: editingPackage.id || editingPackage._id,
          packageData: packageData
        });
      } else {
        result = await api.callCloudFunction('payment', {
          action: 'addPackage',
          packageData: packageData
        });
      }

      if (result.success) {
        wx.showToast({
          title: editingPackage ? '更新成功' : '添加成功',
          icon: 'success'
        });
        this.hidePackageDialog();
        this.loadPackages(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('保存套餐失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 切换套餐状态
  async togglePackageStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = !status;

    wx.showLoading({ title: newStatus ? '启用中...' : '禁用中...' });

    try {
      const result = await api.callCloudFunction('payment', {
        action: 'updatePackage',
        packageId: id,
        packageData: { is_active: newStatus }
      });
      if (result.success) {
        wx.showToast({
          title: newStatus ? '已启用' : '已禁用',
          icon: 'success'
        });
        this.loadPackages(); // 重新加载数据
      } else {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('切换套餐状态失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 删除套餐
  async deletePackage(e) {
    const { id } = e.currentTarget.dataset;

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个套餐吗？删除后无法恢复。',
        success: resolve
      });
    });

    if (!result.confirm) return;

    wx.showLoading({ title: '删除中...' });

    try {
      const deleteResult = await api.callCloudFunction('payment', {
        action: 'deletePackage',
        packageId: id
      });
      if (deleteResult.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        this.loadPackages(); // 重新加载数据
      } else {
        wx.showToast({
          title: deleteResult.message || '删除失败',
          icon: 'error'
        });
      }
    } catch (error) {
      console.error('删除套餐失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  }
});