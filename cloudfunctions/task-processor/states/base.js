// 基础状态处理器类

// 状态机state到业务status的映射
const STATE_TO_STATUS_MAP = {
  'pending': 'pending',
  'downloading': 'processing',
  'downloaded': 'processing',
  'ai_calling': 'processing',
  'ai_processing': 'processing',
  'ai_completed': 'processing',
  'watermarking': 'processing',
  'uploading': 'processing',
  'completed': 'completed',
  'failed': 'failed'
}

class BaseStateHandler {
  constructor(stateName) {
    this.stateName = stateName
  }

  async updateState(taskId, newState, stateData, db) {
    const businessStatus = STATE_TO_STATUS_MAP[newState] || 'processing'
    const _ = db.command

    await db.collection('task_queue').doc(taskId).update({
      data: {
        state: newState,
        status: businessStatus,
        state_data: _.set(stateData),  // 使用 set() 强制替换整个对象
        state_started_at: new Date(),
        updated_at: new Date()
      }
    })

    // 同时更新 works
    await db.collection('works').where({ task_id: taskId }).update({
      data: {
        status: businessStatus,
        state: newState,  // 保存详细状态供调试
        updated_at: new Date()
      }
    })
  }

  async markFailed(taskId, error, db) {
    await db.collection('task_queue').doc(taskId).update({
      data: {
        state: 'failed',
        status: 'failed',
        error: error,
        updated_at: new Date()
      }
    })

    await db.collection('works').where({ task_id: taskId }).update({
      data: {
        status: 'failed',
        error: error,
        updated_at: new Date()
      }
    })
  }

  // 子类必须实现
  async process(task, db, cloud) {
    throw new Error('子类必须实现 process 方法')
  }
}

module.exports = BaseStateHandler
