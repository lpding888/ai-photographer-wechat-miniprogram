<template>
  <view class="model-config">
    <!-- 模型列表 -->
    <view class="model-list">
      <view
        v-for="model in models"
        :key="model.key"
        class="model-card"
        :class="{ 'model-healthy': model.status === 'healthy' }"
      >
        <!-- 模型头部 -->
        <view class="model-header">
          <view class="model-info">
            <view class="model-title">
              <text class="model-name">{{ model.name }}</text>
              <view class="model-status" :class="getStatusClass(model.status)">
                <text class="status-text">{{ getStatusText(model.status) }}</text>
              </view>
            </view>
            <text class="model-type">{{ model.type }}</text>
            <text class="model-description">{{ model.description }}</text>
          </view>
          <view class="model-actions">
            <button
              class="action-btn"
              :class="{ active: expandedModels.includes(model.key) }"
              @tap="toggleModel(model.key)"
            >
              <text>{{ expandedModels.includes(model.key) ? '收起' : '展开' }}</text>
            </button>
          </view>
        </view>

        <!-- 展开的配置区域 -->
        <view v-if="expandedModels.includes(model.key)" class="model-details">
          <!-- 模型信息 -->
          <view class="detail-section">
            <view class="section-title">
              <text>📋 模型信息</text>
            </view>
            <view class="info-grid">
              <view class="info-item">
                <text class="info-label">类型:</text>
                <text class="info-value">{{ model.type }}</text>
              </view>
              <view class="info-item">
                <text class="info-label">版本:</text>
                <text class="info-value">{{ model.version }}</text>
              </view>
              <view class="info-item">
                <text class="info-label">能力:</text>
                <text class="info-value">{{ model.capabilities?.join(', ') || '无' }}</text>
              </view>
              <view class="info-item">
                <text class="info-label">最后检查:</text>
                <text class="info-value">{{ formatTime(model.lastHealthCheck) }}</text>
              </view>
            </view>
          </view>

          <!-- 配置编辑 -->
          <view class="detail-section">
            <view class="section-title">
              <text>⚙️ 配置设置</text>
            </view>
            <view class="config-editor">
              <view
                v-for="(value, key) in getEditableConfig(model)"
                :key="key"
                class="config-item"
              >
                <text class="config-label">{{ getConfigLabel(key) }}:</text>
                <input
                  v-if="isTextInput(key)"
                  class="config-input"
                  :type="getInputType(key)"
                  :value="value"
                  :placeholder="getConfigPlaceholder(key)"
                  @input="updateConfigValue(model.key, key, $event.detail.value)"
                />
                <switch
                  v-else-if="isBooleanInput(key)"
                  class="config-switch"
                  :checked="value"
                  @change="updateConfigValue(model.key, key, $event.detail.value)"
                />
                <picker
                  v-else-if="isSelectInput(key)"
                  class="config-picker"
                  :value="getSelectIndex(key, value)"
                  :range="getSelectOptions(key)"
                  @change="updateConfigValue(model.key, key, getSelectOptions(key)[$event.detail.value])"
                >
                  <view class="picker-display">
                    <text>{{ value || '请选择' }}</text>
                  </view>
                </picker>
              </view>
            </view>
          </view>

          <!-- 操作按钮 -->
          <view class="action-buttons">
            <button class="btn btn-primary" @tap="testModel(model)">
              <text>🧪 测试连接</text>
            </button>
            <button class="btn btn-success" @tap="saveConfig(model)">
              <text>💾 保存配置</text>
            </button>
            <button class="btn btn-warning" @tap="reloadModel(model)">
              <text>🔄 重新加载</text>
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 添加新模型按钮 -->
    <view class="add-model-section">
      <button class="add-model-btn" @tap="showAddModelDialog">
        <text class="add-icon">➕</text>
        <text>添加新模型</text>
      </button>
    </view>

    <!-- 配置编辑弹窗 -->
    <view v-if="showConfigDialog" class="config-dialog-overlay" @tap="hideConfigDialog">
      <view class="config-dialog" @tap.stop>
        <view class="dialog-header">
          <text class="dialog-title">编辑模型配置</text>
          <button class="close-btn" @tap="hideConfigDialog">
            <text>✕</text>
          </button>
        </view>
        <view class="dialog-content">
          <textarea
            class="config-textarea"
            v-model="dialogConfigText"
            placeholder="请输入JSON格式的配置..."
          ></textarea>
        </view>
        <view class="dialog-actions">
          <button class="btn btn-secondary" @tap="hideConfigDialog">取消</button>
          <button class="btn btn-primary" @tap="saveDialogConfig">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'ModelConfig',
  props: {
    models: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      expandedModels: [],
      editingConfigs: {},
      showConfigDialog: false,
      dialogConfigText: '',
      dialogModelType: ''
    }
  },
  methods: {
    // 切换模型展开状态
    toggleModel(modelKey) {
      const index = this.expandedModels.indexOf(modelKey)
      if (index > -1) {
        this.expandedModels.splice(index, 1)
      } else {
        this.expandedModels.push(modelKey)
      }
    },

    // 获取状态样式类
    getStatusClass(status) {
      return {
        'status-healthy': status === 'healthy',
        'status-unhealthy': status === 'unhealthy',
        'status-unknown': !status || status === 'unknown'
      }
    },

    // 获取状态文本
    getStatusText(status) {
      const statusMap = {
        'healthy': '✅ 健康',
        'unhealthy': '❌ 异常',
        'unknown': '❓ 未知'
      }
      return statusMap[status] || '❓ 未知'
    },

    // 格式化时间
    formatTime(timestamp) {
      if (!timestamp) return '从未'
      const date = new Date(timestamp)
      return date.toLocaleString('zh-CN')
    },

    // 获取可编辑的配置
    getEditableConfig(model) {
      const config = model.config || {}
      const editableKeys = [
        'defaultModel',
        'region',
        'apiEndpoint',
        'temperature',
        'maxTokens',
        'timeout',
        'useCloudBase',
        'maxImages',
        'quality',
        'size'
      ]

      const editableConfig = {}
      editableKeys.forEach(key => {
        if (config.hasOwnProperty(key)) {
          editableConfig[key] = config[key]
        }
      })

      return editableConfig
    },

    // 获取配置标签
    getConfigLabel(key) {
      const labelMap = {
        'defaultModel': '默认模型',
        'region': '区域',
        'apiEndpoint': 'API端点',
        'temperature': '温度',
        'maxTokens': '最大令牌数',
        'timeout': '超时时间',
        'useCloudBase': '使用云开发',
        'maxImages': '最大图片数',
        'quality': '质量',
        'size': '尺寸'
      }
      return labelMap[key] || key
    },

    // 获取配置占位符
    getConfigPlaceholder(key) {
      const placeholderMap = {
        'defaultModel': '请输入默认模型名称',
        'region': '请输入区域，如：ap-beijing',
        'apiEndpoint': '请输入API端点URL',
        'temperature': '请输入温度值 (0-1)',
        'maxTokens': '请输入最大令牌数',
        'timeout': '请输入超时时间 (毫秒)',
        'maxImages': '请输入最大图片数',
        'quality': '请选择质量等级',
        'size': '请选择图片尺寸'
      }
      return placeholderMap[key] || `请输入${this.getConfigLabel(key)}`
    },

    // 判断是否为文本输入
    isTextInput(key) {
      return [
        'defaultModel',
        'region',
        'apiEndpoint',
        'temperature',
        'maxTokens',
        'timeout',
        'maxImages'
      ].includes(key)
    },

    // 判断是否为布尔输入
    isBooleanInput(key) {
      return ['useCloudBase'].includes(key)
    },

    // 判断是否为选择输入
    isSelectInput(key) {
      return ['quality', 'size'].includes(key)
    },

    // 获取输入类型
    getInputType(key) {
      if (['temperature'].includes(key)) return 'number'
      if (['timeout', 'maxTokens', 'maxImages'].includes(key)) return 'number'
      return 'text'
    },

    // 获取选择选项
    getSelectOptions(key) {
      if (key === 'quality') {
        return ['standard', 'hd']
      }
      if (key === 'size') {
        return ['512x512', '1K', '2K', '4K']
      }
      return []
    },

    // 获取选择索引
    getSelectIndex(key, value) {
      const options = this.getSelectOptions(key)
      return options.indexOf(value)
    },

    // 更新配置值
    updateConfigValue(modelKey, configKey, value) {
      if (!this.editingConfigs[modelKey]) {
        this.editingConfigs[modelKey] = {}
      }

      // 类型转换
      if (this.getInputType(configKey) === 'number') {
        value = parseFloat(value) || 0
      }

      this.editingConfigs[modelKey][configKey] = value
    },

    // 测试模型
    async testModel(model) {
      this.$emit('test-model', model.type, this.getMergedConfig(model))
    },

    // 保存配置
    async saveConfig(model) {
      const config = this.getMergedConfig(model)
      this.$emit('update-config', model.type, config)
    },

    // 重新加载模型
    async reloadModel(model) {
      this.$emit('reload-model', model.type)
    },

    // 获取合并后的配置
    getMergedConfig(model) {
      const originalConfig = { ...(model.config || {}) }
      const editingConfig = this.editingConfigs[model.key] || {}
      return { ...originalConfig, ...editingConfig }
    },

    // 显示添加模型对话框
    showAddModelDialog() {
      // 这里可以实现添加新模型的功能
      this.showMessage('添加新模型功能开发中', 'info')
    },

    // 显示配置编辑对话框
    showConfigDialog(model) {
      this.dialogModelType = model.type
      this.dialogConfigText = JSON.stringify(this.getMergedConfig(model), null, 2)
      this.showConfigDialog = true
    },

    // 隐藏配置编辑对话框
    hideConfigDialog() {
      this.showConfigDialog = false
      this.dialogConfigText = ''
      this.dialogModelType = ''
    },

    // 保存对话框配置
    saveDialogConfig() {
      try {
        const config = JSON.parse(this.dialogConfigText)
        this.$emit('update-config', this.dialogModelType, config)
        this.hideConfigDialog()
      } catch (error) {
        this.showMessage('配置格式错误，请检查JSON格式', 'error')
      }
    },

    // 显示消息
    showMessage(text, type = 'info') {
      // 通过父组件显示消息
      this.$parent.showMessage(text, type)
    }
  }
}
</script>

<style lang="scss" scoped>
.model-config {
  padding: 20rpx;
}

.model-list {
  margin-bottom: 40rpx;
}

.model-card {
  background: white;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &.model-healthy {
    border-left: 8rpx solid #4caf50;
  }

  &:not(.model-healthy) {
    border-left: 8rpx solid #f44336;
  }
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 30rpx;

  .model-info {
    flex: 1;

    .model-title {
      display: flex;
      align-items: center;
      margin-bottom: 12rpx;

      .model-name {
        font-size: 32rpx;
        font-weight: bold;
        color: #333;
        margin-right: 16rpx;
      }

      .model-status {
        padding: 8rpx 16rpx;
        border-radius: 20rpx;
        font-size: 22rpx;

        &.status-healthy {
          background-color: #e8f5e8;
          color: #4caf50;
        }

        &.status-unhealthy {
          background-color: #ffeaea;
          color: #f44336;
        }

        &.status-unknown {
          background-color: #f5f5f5;
          color: #999;
        }

        .status-text {
          font-size: 22rpx;
        }
      }
    }

    .model-type {
      font-size: 26rpx;
      color: #667eea;
      margin-bottom: 8rpx;
      display: block;
    }

    .model-description {
      font-size: 24rpx;
      color: #666;
      line-height: 1.4;
    }
  }

  .model-actions {
    .action-btn {
      padding: 16rpx 24rpx;
      background-color: #f8f9fa;
      border: 1rpx solid #dee2e6;
      border-radius: 8rpx;
      font-size: 26rpx;
      color: #495057;
      transition: all 0.3s ease;

      &.active {
        background-color: #667eea;
        color: white;
        border-color: #667eea;
      }
    }
  }
}

.model-details {
  border-top: 1rpx solid #f0f0f0;
  background-color: #fafafa;
}

.detail-section {
  padding: 30rpx;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }

  .section-title {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 20rpx;
    display: flex;
    align-items: center;
    gap: 12rpx;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;

  .info-item {
    display: flex;
    align-items: center;
    gap: 12rpx;

    .info-label {
      font-size: 24rpx;
      color: #666;
      min-width: 120rpx;
    }

    .info-value {
      font-size: 24rpx;
      color: #333;
      flex: 1;
    }
  }
}

.config-editor {
  .config-item {
    display: flex;
    align-items: center;
    margin-bottom: 20rpx;
    gap: 20rpx;

    .config-label {
      font-size: 26rpx;
      color: #333;
      min-width: 160rpx;
    }

    .config-input {
      flex: 1;
      padding: 16rpx;
      border: 1rpx solid #ddd;
      border-radius: 8rpx;
      font-size: 26rpx;
      background-color: white;
    }

    .config-switch {
      flex: 1;
    }

    .config-picker {
      flex: 1;

      .picker-display {
        padding: 16rpx;
        border: 1rpx solid #ddd;
        border-radius: 8rpx;
        background-color: white;
        font-size: 26rpx;
        color: #333;
      }
    }
  }
}

.action-buttons {
  display: flex;
  gap: 20rpx;
  padding: 30rpx;
  background-color: white;

  .btn {
    flex: 1;
    padding: 20rpx;
    border-radius: 8rpx;
    font-size: 26rpx;
    border: none;
    color: white;

    &.btn-primary {
      background-color: #667eea;
    }

    &.btn-success {
      background-color: #4caf50;
    }

    &.btn-warning {
      background-color: #ff9800;
    }

    &.btn-secondary {
      background-color: #6c757d;
    }
  }
}

.add-model-section {
  padding: 30rpx;
  text-align: center;

  .add-model-btn {
    display: inline-flex;
    align-items: center;
    gap: 12rpx;
    padding: 24rpx 48rpx;
    background-color: #667eea;
    color: white;
    border-radius: 50rpx;
    font-size: 28rpx;
    border: none;

    .add-icon {
      font-size: 32rpx;
    }
  }
}

.config-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;

  .config-dialog {
    background: white;
    border-radius: 16rpx;
    width: 90%;
    max-width: 600rpx;
    max-height: 80vh;
    overflow: hidden;

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 30rpx;
      border-bottom: 1rpx solid #f0f0f0;

      .dialog-title {
        font-size: 32rpx;
        font-weight: bold;
        color: #333;
      }

      .close-btn {
        width: 60rpx;
        height: 60rpx;
        border-radius: 50%;
        background-color: #f5f5f5;
        border: none;
        font-size: 32rpx;
        color: #666;
      }
    }

    .dialog-content {
      padding: 30rpx;

      .config-textarea {
        width: 100%;
        min-height: 400rpx;
        padding: 20rpx;
        border: 1rpx solid #ddd;
        border-radius: 8rpx;
        font-size: 24rpx;
        font-family: monospace;
        background-color: #f8f9fa;
      }
    }

    .dialog-actions {
      display: flex;
      gap: 20rpx;
      padding: 30rpx;
      border-top: 1rpx solid #f0f0f0;

      .btn {
        flex: 1;
        padding: 20rpx;
        border-radius: 8rpx;
        font-size: 28rpx;
        border: none;

        &.btn-primary {
          background-color: #667eea;
          color: white;
        }

        &.btn-secondary {
          background-color: #f5f5f5;
          color: #666;
        }
      }
    }
  }
}
</style>