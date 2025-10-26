<template>
  <div class="ai-model-config">
    <!-- 页面头部 -->
    <div class="page-header">
      <view class="header-content">
        <view class="title">
          <text class="title-text">🤖 AI模型配置管理</text>
          <text class="subtitle">抽屉式架构 - 轻松切换AI大模型</text>
        </view>
        <view class="header-actions">
          <button class="btn btn-primary" @tap="refreshData">
            <text class="icon">🔄</text>
            <text>刷新</text>
          </button>
          <button class="btn btn-success" @tap="exportConfigs">
            <text class="icon">📤</text>
            <text>导出配置</text>
          </button>
        </view>
      </view>
    </div>

    <!-- 统计卡片 -->
    <view class="stats-cards">
      <view class="stat-card">
        <view class="stat-icon">🤖</view>
        <view class="stat-content">
          <text class="stat-number">{{ stats.totalModels }}</text>
          <text class="stat-label">已配置模型</text>
        </view>
      </view>
      <view class="stat-card">
        <view class="stat-icon">📝</view>
        <view class="stat-content">
          <text class="stat-number">{{ stats.totalTemplates }}</text>
          <text class="stat-label">提示词模板</text>
        </view>
      </view>
      <view class="stat-card">
        <view class="stat-icon">✅</view>
        <view class="stat-content">
          <text class="stat-number">{{ stats.healthyModels }}</text>
          <text class="stat-label">健康模型</text>
        </view>
      </view>
      <view class="stat-card">
        <view class="stat-icon">⚡</view>
        <view class="stat-content">
          <text class="stat-number">{{ stats.cacheHits }}</text>
          <text class="stat-label">缓存命中</text>
        </view>
      </view>
    </view>

    <!-- 功能标签页 -->
    <view class="tab-container">
      <view class="tab-header">
        <view
          class="tab-item"
          :class="{ active: activeTab === 'models' }"
          @tap="switchTab('models')"
        >
          <text class="tab-text">模型配置</text>
        </view>
        <view
          class="tab-item"
          :class="{ active: activeTab === 'templates' }"
          @tap="switchTab('templates')"
        >
          <text class="tab-text">提示词模板</text>
        </view>
        <view
          class="tab-item"
          :class="{ active: activeTab === 'monitor' }"
          @tap="switchTab('monitor')"
        >
          <text class="tab-text">状态监控</text>
        </view>
      </view>

      <!-- 模型配置标签页 -->
      <view v-if="activeTab === 'models'" class="tab-content">
        <ModelConfig
          :models="models"
          :loading="loading"
          @refresh="refreshModels"
          @test-model="testModel"
          @update-config="updateModelConfig"
        />
      </view>

      <!-- 提示词模板标签页 -->
      <view v-if="activeTab === 'templates'" class="tab-content">
        <PromptTemplates
          :templates="templates"
          :models="models"
          :loading="loading"
          @refresh="refreshTemplates"
          @create-template="createTemplate"
          @update-template="updateTemplate"
          @delete-template="deleteTemplate"
        />
      </view>

      <!-- 状态监控标签页 -->
      <view v-if="activeTab === 'monitor'" class="tab-content">
        <SystemMonitor
          :health-status="healthStatus"
          :cache-stats="cacheStats"
          :loading="loading"
          @refresh="refreshMonitor"
          @clear-cache="clearCache"
          @reload-adapter="reloadAdapter"
        />
      </view>
    </view>

    <!-- 全局加载状态 -->
    <view v-if="loading" class="loading-overlay">
      <view class="loading-spinner"></view>
      <text class="loading-text">加载中...</text>
    </view>

    <!-- 提示消息 -->
    <view v-if="message.show" class="message-toast" :class="message.type">
      <text class="message-text">{{ message.text }}</text>
    </view>
  </div>
</template>

<script>
import ModelConfig from '@/components/admin/ModelConfig.vue'
import PromptTemplates from '@/components/admin/PromptTemplates.vue'
import SystemMonitor from '@/components/admin/SystemMonitor.vue'
import { AdminApiService } from '@/utils/admin/AdminApiService.js'

export default {
  name: 'AIModelConfig',
  components: {
    ModelConfig,
    PromptTemplates,
    SystemMonitor
  },
  data() {
    return {
      activeTab: 'models',
      loading: false,

      // 数据状态
      models: [],
      templates: [],
      healthStatus: null,
      cacheStats: null,

      // 统计信息
      stats: {
        totalModels: 0,
        totalTemplates: 0,
        healthyModels: 0,
        cacheHits: 0
      },

      // 消息提示
      message: {
        show: false,
        text: '',
        type: 'success'
      }
    }
  },

  onLoad() {
    this.initPage()
  },

  onShow() {
    this.refreshData()
  },

  methods: {
    // 初始化页面
    async initPage() {
      try {
        this.loading = true
        await Promise.all([
          this.loadModels(),
          this.loadTemplates(),
          this.loadHealthStatus()
        ])
        this.updateStats()
      } catch (error) {
        console.error('页面初始化失败:', error)
        this.showMessage('页面初始化失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 刷新所有数据
    async refreshData() {
      await this.initPage()
      this.showMessage('数据已刷新', 'success')
    },

    // 切换标签页
    switchTab(tab) {
      this.activeTab = tab
    },

    // 加载模型列表
    async loadModels() {
      try {
        const response = await AdminApiService.getModels()
        this.models = response.data.models || []
      } catch (error) {
        console.error('加载模型列表失败:', error)
        this.showMessage('加载模型列表失败', 'error')
      }
    },

    // 刷新模型数据
    async refreshModels() {
      await this.loadModels()
      this.updateStats()
    },

    // 加载提示词模板
    async loadTemplates() {
      try {
        const response = await AdminApiService.getPromptTemplates()
        this.templates = response.data.templates || []
      } catch (error) {
        console.error('加载提示词模板失败:', error)
        this.showMessage('加载提示词模板失败', 'error')
      }
    },

    // 刷新模板数据
    async refreshTemplates() {
      await this.loadTemplates()
      this.updateStats()
    },

    // 加载健康状态
    async loadHealthStatus() {
      try {
        const response = await AdminApiService.getAdaptersStatus()
        this.healthStatus = response.data
        this.cacheStats = response.data.cache_stats
      } catch (error) {
        console.error('加载健康状态失败:', error)
        this.showMessage('加载健康状态失败', 'error')
      }
    },

    // 刷新监控数据
    async refreshMonitor() {
      await this.loadHealthStatus()
      this.updateStats()
    },

    // 测试模型配置
    async testModel(modelType, config) {
      try {
        this.loading = true
        const response = await AdminApiService.testModelConfig(modelType, config)

        if (response.data.test_result === 'success') {
          this.showMessage(`模型 ${modelType} 测试成功`, 'success')
        } else {
          this.showMessage(`模型 ${modelType} 测试失败: ${response.data.error.message}`, 'error')
        }

        await this.refreshModels()
      } catch (error) {
        console.error('测试模型失败:', error)
        this.showMessage('测试模型失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 更新模型配置
    async updateModelConfig(modelType, config) {
      try {
        this.loading = true
        await AdminApiService.updateModelConfig(modelType, config)
        this.showMessage(`模型 ${modelType} 配置已更新`, 'success')
        await this.refreshModels()
      } catch (error) {
        console.error('更新模型配置失败:', error)
        this.showMessage('更新模型配置失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 创建提示词模板
    async createTemplate(modelType, template) {
      try {
        this.loading = true
        await AdminApiService.createPromptTemplate(modelType, template)
        this.showMessage('模板创建成功', 'success')
        await this.refreshTemplates()
      } catch (error) {
        console.error('创建模板失败:', error)
        this.showMessage('创建模板失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 更新提示词模板
    async updateTemplate(modelType, templateId, template) {
      try {
        this.loading = true
        await AdminApiService.updatePromptTemplate(modelType, templateId, template)
        this.showMessage('模板更新成功', 'success')
        await this.refreshTemplates()
      } catch (error) {
        console.error('更新模板失败:', error)
        this.showMessage('更新模板失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 删除提示词模板
    async deleteTemplate(modelType, templateId) {
      try {
        this.loading = true
        await AdminApiService.deletePromptTemplate(modelType, templateId)
        this.showMessage('模板删除成功', 'success')
        await this.refreshTemplates()
      } catch (error) {
        console.error('删除模板失败:', error)
        this.showMessage('删除模板失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 清理缓存
    async clearCache(modelType = null) {
      try {
        this.loading = true
        await AdminApiService.clearCache(modelType)
        this.showMessage(
          modelType ? `${modelType} 缓存已清理` : '所有缓存已清理',
          'success'
        )
        await this.refreshMonitor()
      } catch (error) {
        console.error('清理缓存失败:', error)
        this.showMessage('清理缓存失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 重新加载适配器
    async reloadAdapter(modelType) {
      try {
        this.loading = true
        await AdminApiService.reloadAdapter(modelType)
        this.showMessage(`适配器 ${modelType} 已重新加载`, 'success')
        await this.refreshMonitor()
      } catch (error) {
        console.error('重新加载适配器失败:', error)
        this.showMessage('重新加载适配器失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 导出配置
    async exportConfigs() {
      try {
        this.loading = true
        const response = await AdminApiService.exportConfigs()

        // 这里可以实现文件下载功能
        console.log('导出的配置:', response.data.export_data)
        this.showMessage('配置导出成功', 'success')
      } catch (error) {
        console.error('导出配置失败:', error)
        this.showMessage('导出配置失败', 'error')
      } finally {
        this.loading = false
      }
    },

    // 更新统计信息
    updateStats() {
      this.stats = {
        totalModels: this.models.length,
        totalTemplates: this.templates.length,
        healthyModels: this.models.filter(m => m.status === 'healthy').length,
        cacheHits: this.cacheStats?.instancesCount || 0
      }
    },

    // 显示消息提示
    showMessage(text, type = 'success') {
      this.message = {
        show: true,
        text,
        type
      }

      setTimeout(() => {
        this.message.show = false
      }, 3000)
    }
  }
}
</script>

<style lang="scss" scoped>
.ai-model-config {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.page-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20rpx 30rpx;

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title {
    .title-text {
      font-size: 36rpx;
      font-weight: bold;
      display: block;
      margin-bottom: 8rpx;
    }

    .subtitle {
      font-size: 24rpx;
      opacity: 0.9;
    }
  }

  .header-actions {
    display: flex;
    gap: 20rpx;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 16rpx 24rpx;
    border-radius: 8rpx;
    font-size: 26rpx;
    border: none;

    &.btn-primary {
      background-color: rgba(255, 255, 255, 0.2);
      color: white;
    }

    &.btn-success {
      background-color: rgba(76, 175, 80, 0.9);
      color: white;
    }

    .icon {
      font-size: 28rpx;
    }
  }
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  padding: 30rpx;

  .stat-card {
    background: white;
    border-radius: 16rpx;
    padding: 30rpx;
    display: flex;
    align-items: center;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);

    .stat-icon {
      font-size: 48rpx;
      margin-right: 20rpx;
    }

    .stat-content {
      .stat-number {
        font-size: 42rpx;
        font-weight: bold;
        color: #333;
        display: block;
      }

      .stat-label {
        font-size: 24rpx;
        color: #666;
        margin-top: 4rpx;
      }
    }
  }
}

.tab-container {
  background: white;
  margin: 0 30rpx 30rpx;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);

  .tab-header {
    display: flex;
    background: #f8f9fa;
    border-bottom: 1rpx solid #e9ecef;

    .tab-item {
      flex: 1;
      text-align: center;
      padding: 30rpx 20rpx;
      font-size: 28rpx;
      color: #666;
      border-bottom: 4rpx solid transparent;
      transition: all 0.3s ease;

      &.active {
        color: #667eea;
        background: white;
        border-bottom-color: #667eea;
        font-weight: bold;
      }

      .tab-text {
        position: relative;
      }
    }
  }

  .tab-content {
    min-height: 60vh;
  }
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;

  .loading-spinner {
    width: 60rpx;
    height: 60rpx;
    border: 6rpx solid rgba(255, 255, 255, 0.3);
    border-top: 6rpx solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20rpx;
  }

  .loading-text {
    color: white;
    font-size: 28rpx;
  }
}

.message-toast {
  position: fixed;
  top: 100rpx;
  left: 50%;
  transform: translateX(-50%);
  padding: 20rpx 40rpx;
  border-radius: 8rpx;
  font-size: 26rpx;
  z-index: 10000;
  animation: slideDown 0.3s ease;

  &.success {
    background-color: #4caf50;
    color: white;
  }

  &.error {
    background-color: #f44336;
    color: white;
  }

  &.warning {
    background-color: #ff9800;
    color: white;
  }

  .message-text {
    white-space: nowrap;
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes slideDown {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(-20rpx);
  }
  100% {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>