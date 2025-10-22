 // 支付管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 添加积分记录
 */
async function addCreditRecord(data) {
  try {
    await db.collection('credit_records').add({
      data: {
        user_openid: data.user_openid,
        type: data.type,
        amount: Math.abs(data.amount),
        description: data.description || '',
        order_id: data.order_id || '',
        work_id: data.work_id || '',
        task_id: data.task_id || '',
        balance_after: data.balance_after || 0,
        created_at: new Date(),
        createdAt: new Date(),
        created_time: Date.now()
      }
    })
  } catch (error) {
    console.error('添加积分记录失败:', error)
  }
}

exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'getPackages':
        return await getPackages(event, wxContext)
      case 'getAllPackages':
        return await getAllPackages(event, wxContext)
      case 'createOrder':
        return await createOrder(event, wxContext)
      case 'dailyCheckin':
        return await dailyCheckin(event, wxContext)
      case 'getSignInState':
        return await getSignInState(event, wxContext)
      case 'shareReward':
        return await shareReward(event, wxContext)
      case 'listRechargeRecords':
        return await listRechargeRecords(event, wxContext)
      case 'listConsumeRecords':
        return await listConsumeRecords(event, wxContext)
      case 'paymentCallback':
        return await paymentCallback(event, wxContext)
      case 'cleanExpiredOrders':
        return await cleanExpiredOrders(event, wxContext)
      case 'checkOrderStatus':
        return await checkOrderStatus(event, wxContext)
      // 套餐管理功能
      case 'addPackage':
        return await addPackage(event, wxContext)
      case 'updatePackage':
        return await updatePackage(event, wxContext)
      case 'deletePackage':
        return await deletePackage(event, wxContext)
      case 'getCreditRecords':
        return await getCreditRecords(event, wxContext)
      case 'getCreditSummary':
        return await getCreditSummary(event, wxContext)
      default:
        return {
          success: false,
          message: '未知操作: ' + action
        }
    }
  } catch (error) {
    console.error('支付函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

/**
 * 获取充值套餐
 */
async function getPackages(event, wxContext) {
  try {
    // 从数据库获取套餐配置，如果没有则返回默认套餐
    const packagesResult = await db.collection('packages')
      .where({ is_active: true })
      .orderBy('sort_order', 'asc')
      .get()
    
    let packages = []
    
    if (packagesResult.data.length > 0) {
      packages = packagesResult.data
    } else {
      // 默认套餐
      packages = [
        {
          id: 'package_25',
          name: '基础包',
          credits: 25,
          price: 9.9,
          original_price: 12.5,
          discount: '限时8折',
          description: '适合轻度使用',
          is_popular: false
        },
        {
          id: 'package_60',
          name: '标准包',
          credits: 60,
          price: 19.9,
          original_price: 30.0,
          discount: '超值优惠',
          description: '性价比之选',
          is_popular: true
        },
        {
          id: 'package_100',
          name: '专业包',
          credits: 100,
          price: 29.9,
          original_price: 50.0,
          discount: '6折特惠',
          description: '专业用户首选',
          is_popular: false
        },
        {
          id: 'package_300',
          name: '企业包',
          credits: 300,
          price: 79.9,
          original_price: 150.0,
          discount: '5折优惠',
          description: '企业批量使用',
          is_popular: false
        }
      ]
    }
    
    return {
      success: true,
      data: packages,
      message: '获取套餐成功'
    }
    
  } catch (error) {
    console.error('获取套餐失败:', error)
    return {
      success: false,
      message: '获取套餐失败'
    }
  }
}

/**
 * 获取所有套餐（包括禁用的，用于管理界面）
 */
async function getAllPackages(event, wxContext) {
  // 检查管理员权限
  const authCheck = await checkAdminPermission(wxContext)
  if (!authCheck.isAdmin) {
    return {
      success: false,
      message: authCheck.message
    }
  }

  try {
    // 获取所有套餐，不过滤状态
    const packagesResult = await db.collection('packages')
      .orderBy('sort_order', 'asc')
      .get()

    return {
      success: true,
      data: packagesResult.data || [],
      message: '获取套餐成功'
    }

  } catch (error) {
    console.error('获取所有套餐失败:', error)
    return {
      success: false,
      message: '获取套餐失败'
    }
  }
}

/**
 * 创建充值订单
 */
async function createOrder(event, wxContext) {
  const { packageId } = event
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  if (!packageId) {
    return {
      success: false,
      message: '套餐ID不能为空'
    }
  }
  
  try {
    // 获取套餐信息
    const packages = await getPackages(event, wxContext)
    if (!packages.success) {
      return packages
    }
    
    const selectedPackage = packages.data.find(p => p.id === packageId)
    if (!selectedPackage) {
      return {
        success: false,
        message: '套餐不存在'
      }
    }
    
    // 生成订单ID
    const orderId = generateOrderId()
    
    // 创建订单记录
    const orderData = {
      _id: orderId,
      user_openid: OPENID,
      package_id: packageId,
      package_name: selectedPackage.name,
      credits: selectedPackage.credits,
      amount: selectedPackage.price,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    }
    
    await db.collection('orders').add({
      data: orderData
    })
    
    // 调用微信支付统一下单
    const paymentParams = await createWechatPayment(orderId, selectedPackage, OPENID)
    
    if (paymentParams.success) {
      return {
        success: true,
        data: {
          order_id: orderId,
          paymentParams: paymentParams.data
        },
        message: '订单创建成功'
      }
    } else {
      // 如果支付参数创建失败，更新订单状态
      await db.collection('orders')
        .doc(orderId)
        .update({
          data: {
            status: 'failed',
            error_message: paymentParams.message,
            updated_at: new Date()
          }
        })
      
      return paymentParams
    }
    
  } catch (error) {
    console.error('创建订单失败:', error)
    return {
      success: false,
      message: '创建订单失败'
    }
  }
}

/**
 * 每日签到
 */
async function dailyCheckin(event, wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 检查今天是否已签到
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const checkinResult = await db.collection('daily_checkins')
      .where({
        user_openid: OPENID,
        checkin_date: db.command.gte(today).and(db.command.lt(tomorrow))
      })
      .get()

    if (checkinResult.data.length > 0) {
      return {
        success: false,
        message: '今日已签到'
      }
    }

    // 获取用户当前信息
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userResult.data[0]

    // 计算签到奖励（连续签到有额外奖励）
    const consecutiveDays = await getConsecutiveCheckinDays(OPENID)
    let rewardCredits = 1 // 基础奖励

    // 连续签到奖励
    if (consecutiveDays >= 7) {
      rewardCredits = 2 // 连续7天奖励翻倍
    } else if (consecutiveDays >= 3) {
      rewardCredits = 1 // 连续3天保持基础奖励
    }

    // 记录签到
    await db.collection('daily_checkins').add({
      data: {
        user_openid: OPENID,
        checkin_date: new Date(),
        reward_credits: rewardCredits,
        consecutive_days: consecutiveDays + 1
      }
    })

    // 增加用户积分
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          credits: db.command.inc(rewardCredits),
          total_earned_credits: db.command.inc(rewardCredits),
          updated_at: new Date()
        }
      })

    // 记录积分变动
    await addCreditRecord({
      user_openid: OPENID,
      type: 'daily_sign',
      amount: rewardCredits,
      description: `每日签到奖励（连续${consecutiveDays + 1}天）`,
      balance_after: user.credits + rewardCredits
    })

    return {
      success: true,
      data: {
        reward_credits: rewardCredits,
        consecutive_days: consecutiveDays + 1,
        new_credits: user.credits + rewardCredits
      },
      message: `签到成功，获得${rewardCredits}积分！`
    }

  } catch (error) {
    console.error('签到失败:', error)
    return {
      success: false,
      message: '签到失败'
    }
  }
}

/**
 * 获取签到状态
 */
async function getSignInState(event, wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 检查今天是否已签到
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const checkinResult = await db.collection('daily_checkins')
      .where({
        user_openid: OPENID,
        checkin_date: db.command.gte(today).and(db.command.lt(tomorrow))
      })
      .get()

    const signed = checkinResult.data.length > 0

    // 获取连续签到天数
    let consecutiveDays = 0
    if (signed) {
      consecutiveDays = checkinResult.data[0].consecutive_days || 1
    } else {
      consecutiveDays = await getConsecutiveCheckinDays(OPENID)
    }

    return {
      success: true,
      data: {
        signed: signed,
        consecutive_days: consecutiveDays
      },
      message: '获取签到状态成功'
    }

  } catch (error) {
    console.error('获取签到状态失败:', error)
    return {
      success: false,
      message: '获取签到状态失败'
    }
  }
}

/**
 * 分享奖励
 */
async function shareReward(event, wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 获取用户信息
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userResult.data[0]

    // 检查今天的分享次数（每天最多奖励3次）
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const shareResult = await db.collection('share_records')
      .where({
        user_openid: OPENID,
        created_at: db.command.gte(today).and(db.command.lt(tomorrow))
      })
      .get()

    const todayShareCount = shareResult.data.length
    const maxDailyShares = 3 // 每天最多3次分享奖励

    if (todayShareCount >= maxDailyShares) {
      return {
        success: false,
        message: `今日分享次数已达上限（${maxDailyShares}次）`,
        data: {
          today_count: todayShareCount,
          max_count: maxDailyShares
        }
      }
    }

    // 分享奖励积分
    const rewardCredits = 2

    // 记录分享
    await db.collection('share_records').add({
      data: {
        user_openid: OPENID,
        reward_credits: rewardCredits,
        created_at: new Date(),
        share_count: todayShareCount + 1
      }
    })

    // 增加用户积分
    await db.collection('users')
      .doc(user._id)
      .update({
        data: {
          credits: db.command.inc(rewardCredits),
          total_earned_credits: db.command.inc(rewardCredits),
          updated_at: new Date()
        }
      })

    // 记录积分变动
    await addCreditRecord({
      user_openid: OPENID,
      type: 'share_reward',
      amount: rewardCredits,
      description: `分享奖励（今日第${todayShareCount + 1}次）`,
      balance_after: user.credits + rewardCredits
    })

    return {
      success: true,
      data: {
        reward_credits: rewardCredits,
        today_count: todayShareCount + 1,
        remaining_count: maxDailyShares - todayShareCount - 1,
        new_credits: user.credits + rewardCredits
      },
      message: `分享成功，获得${rewardCredits}积分！今日还可获得${maxDailyShares - todayShareCount - 1}次分享奖励`
    }

  } catch (error) {
    console.error('分享奖励失败:', error)
    return {
      success: false,
      message: '分享奖励失败'
    }
  }
}

/**
 * 获取充值记录
 */
async function listRechargeRecords(event, wxContext) {
  const { OPENID } = wxContext
  
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }
  
  try {
    const result = await db.collection('orders')
      .where({
        user_openid: OPENID,
        status: 'completed'
      })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get()
    
    const records = result.data.map(order => ({
      id: order._id,
      package_name: order.package_name,
      credits: order.credits,
      amount: order.amount,
      created_time: order.created_at,
      time_text: formatTime(order.created_at)
    }))
    
    return {
      success: true,
      data: records,
      message: '获取充值记录成功'
    }
    
  } catch (error) {
    console.error('获取充值记录失败:', error)
    return {
      success: false,
      message: '获取充值记录失败'
    }
  }
}

/**
 * 获取消费记录
 */
async function listConsumeRecords(event, wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    const result = await db.collection('credit_records')
      .where({
        user_openid: OPENID,
        type: db.command.in(['photography', 'fitting', 'generation', 'consume', 'photography_generate', 'fitting_generate', 'ai_generation', 'work_generation'])
      })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get()

    const records = result.data.map(record => ({
      id: record._id,
      type: record.type,
      type_text: record.type_text || (record.type === 'fitting' ? '智能试衣' : record.type === 'photography' ? '服装摄影' : '消费'),
      count: Math.abs(record.change || record.credits || record.amount || 0),
      ref_id: record.ref_id || record.work_id || record.task_id || '',
      time: record.created_at,
      created_at: record.created_at
    }))

    return {
      success: true,
      data: records,
      message: '获取消费记录成功'
    }

  } catch (error) {
    console.error('获取消费记录失败:', error)
    return {
      success: false,
      message: '获取消费记录失败'
    }
  }
}

/**
 * 支付回调处理 - 增强版本
 */
async function paymentCallback(event, wxContext) {
  const { outTradeNo, resultCode, totalFee, transactionId } = event

  try {
    console.log('收到支付回调:', { outTradeNo, resultCode, totalFee, transactionId })

    // 参数验证
    if (!outTradeNo) {
      console.error('支付回调缺少订单号')
      return {
        success: false,
        message: '订单号不能为空'
      }
    }

    if (resultCode !== 'SUCCESS') {
      console.log('支付失败或取消:', resultCode)

      // 更新订单状态为失败
      await db.collection('orders')
        .where({ _id: outTradeNo })
        .update({
          data: {
            status: 'failed',
            fail_reason: resultCode,
            updated_at: new Date()
          }
        })

      return {
        success: false,
        message: '支付失败'
      }
    }

    // 查询订单 - 防止重复处理
    const orderResult = await db.collection('orders')
      .where({ _id: outTradeNo })
      .get()

    if (orderResult.data.length === 0) {
      console.error('订单不存在:', outTradeNo)
      return {
        success: false,
        message: '订单不存在'
      }
    }

    const order = orderResult.data[0]

    // 防重复处理
    if (order.status === 'completed') {
      console.log('订单已处理完成:', outTradeNo)
      return {
        success: true,
        message: '订单已处理'
      }
    }

    // 金额验证（可选，增强安全性）
    if (totalFee && order.amount) {
      const expectedFee = Math.round(order.amount * 100)
      if (totalFee !== expectedFee) {
        console.error('支付金额不匹配:', { totalFee, expectedFee })
        return {
          success: false,
          message: '支付金额异常'
        }
      }
    }

    // 开始事务处理
    console.log('开始处理支付成功订单:', outTradeNo)

    // 更新订单状态
    await db.collection('orders')
      .doc(outTradeNo)
      .update({
        data: {
          status: 'completed',
          paid_at: new Date(),
          transaction_id: transactionId || '',
          updated_at: new Date()
        }
      })

    // 查询用户信息获取更新后的积分
    const userResult = await db.collection('users')
      .where({ openid: order.user_openid })
      .get()

    const currentUser = userResult.data[0] || {}
    const oldCredits = currentUser.credits || 0

    // 增加用户积分
    const creditsIncResult = await db.collection('users')
      .where({ openid: order.user_openid })
      .update({
        data: {
          credits: db.command.inc(order.credits),
          total_earned_credits: db.command.inc(order.credits),
          updated_at: new Date()
        }
      })

    console.log('积分增加结果:', creditsIncResult)

    // 记录积分变动
    await addCreditRecord({
      user_openid: order.user_openid,
      type: 'recharge',
      amount: order.credits,
      description: `充值套餐：${order.package_name}`,
      order_id: outTradeNo,
      balance_after: oldCredits + order.credits
    })

    // 记录充值成功日志
    console.log('支付处理完成:', {
      orderId: outTradeNo,
      userId: order.user_openid,
      credits: order.credits,
      amount: order.amount
    })

    return {
      success: true,
      message: '支付成功，积分已到账',
      data: {
        credits: order.credits,
        orderId: outTradeNo
      }
    }

  } catch (error) {
    console.error('支付回调处理失败:', error)

    // 记录错误，但不暴露详细错误信息给客户端
    return {
      success: false,
      message: '支付处理异常，请联系客服',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    }
  }
}

/**
 * 创建微信支付参数 - 个体工商户直接调用云开发支付API
 */
async function createWechatPayment(orderId, packageInfo, openid) {
  try {
    console.log('开始创建微信支付参数:', { orderId, packageInfo, openid })

    // 个体工商户直接调用云开发支付API
    const paymentResult = await cloud.cloudPay.unifiedOrder({
      function_name: 'payment', // 云函数名称
      env_id: 'cloudbase-0gu1afji26f514d2', // 云环境ID
      spbill_create_ip: '127.0.0.1', // 终端IP地址
      
      // 支付业务参数
      body: `AI摄影师-${packageInfo.name}`,
      out_trade_no: orderId,
      total_fee: Math.round(packageInfo.price * 100), // 单位为分
      openid: openid,
      sub_mch_id: '1728229870', // 个体工商户商户号
      sub_appid: 'wx1ed34a87abfaa643' // 小程序AppID
    })

    console.log('支付下单结果:', paymentResult)

    // 检查返回结果格式
    if (!paymentResult || paymentResult.returnCode === 'FAIL') {
      console.error('支付参数格式异常:', paymentResult)
      throw new Error(`支付参数异常: ${paymentResult?.returnMsg || '未知错误'}`)
    }

    // 确保返回的支付参数格式正确
    const paymentData = paymentResult
    console.log('支付参数详情:', paymentData)

    return {
      success: true,
      data: paymentData
    }

  } catch (error) {
    console.error('创建微信支付失败:', error)

    // 详细错误信息
    let errorMessage = '支付系统暂时不可用，请稍后重试'
    if (error.message) {
      if (error.message.includes('商户号')) {
        errorMessage = '商户号配置错误，请检查微信支付配置'
      } else if (error.message.includes('权限')) {
        errorMessage = '支付权限异常，请联系客服'
      } else if (error.message.includes('参数')) {
        errorMessage = '支付参数错误，请重试'
      }
    }

    return {
      success: false,
      message: errorMessage,
      error: error.message
    }
  }
}

/**
 * 获取连续签到天数
 */
async function getConsecutiveCheckinDays(openid) {
  try {
    const result = await db.collection('daily_checkins')
      .where({ user_openid: openid })
      .orderBy('checkin_date', 'desc')
      .limit(30)
      .get()
    
    if (result.data.length === 0) {
      return 0
    }
    
    let consecutiveDays = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < result.data.length; i++) {
      const checkinDate = new Date(result.data[i].checkin_date)
      checkinDate.setHours(0, 0, 0, 0)
      
      const expectedDate = new Date(today)
      expectedDate.setDate(today.getDate() - i)
      
      if (checkinDate.getTime() === expectedDate.getTime()) {
        consecutiveDays++
      } else {
        break
      }
    }
    
    return consecutiveDays
    
  } catch (error) {
    console.error('获取连续签到天数失败:', error)
    return 0
  }
}

/**
 * 格式化时间
 */
function formatTime(date) {
  try {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}`
  } catch (error) {
    return ''
  }
}

/**
 * 生成订单ID
 */
function generateOrderId() {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return `order_${timestamp}_${random}`
}

/**
 * 检查管理员权限
 */
async function checkAdminPermission(wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return { isAdmin: false, message: '用户未登录' }
  }

  try {
    // 查询管理员表 - 兼容两种字段名，与aimodels云函数保持一致
    let adminResult = await db.collection('admin_users')
      .where({
        _openid: OPENID,
        is_active: true
      })
      .get()

    // 如果使用_openid字段没有找到，尝试使用openid字段
    if (adminResult.data.length === 0) {
      adminResult = await db.collection('admin_users')
        .where({
          openid: OPENID,
          is_active: true
        })
        .get()
    }

    const isAdmin = adminResult.data && adminResult.data.length > 0

    return {
      isAdmin,
      message: isAdmin ? '验证通过' : '您没有管理员权限'
    }
  } catch (error) {
    console.error('检查管理员权限失败:', error)
    return { isAdmin: false, message: '权限验证失败' }
  }
}

/**
 * 添加套餐
 */
async function addPackage(event, wxContext) {
  // 检查管理员权限
  const authCheck = await checkAdminPermission(wxContext)
  if (!authCheck.isAdmin) {
    return {
      success: false,
      message: authCheck.message
    }
  }

  const { packageData } = event

  if (!packageData) {
    return {
      success: false,
      message: '套餐数据不能为空'
    }
  }

  try {
    // 生成唯一ID
    const packageId = `package_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 数据验证
    if (!packageData.name || !packageData.credits || !packageData.price) {
      return {
        success: false,
        message: '套餐名称、积分数量和价格不能为空'
      }
    }

    // 准备数据
    const newPackage = {
      _id: packageId,
      id: packageId,
      name: packageData.name,
      description: packageData.description || '',
      credits: parseInt(packageData.credits),
      price: parseFloat(packageData.price),
      original_price: parseFloat(packageData.original_price || packageData.price),
      discount: packageData.discount || '',
      sort_order: parseInt(packageData.sort_order || 1),
      is_popular: packageData.is_popular || false,
      is_active: packageData.is_active !== false,
      created_at: new Date(),
      updated_at: new Date()
    }

    await db.collection('packages').add({
      data: newPackage
    })

    return {
      success: true,
      data: newPackage,
      message: '套餐添加成功'
    }
  } catch (error) {
    console.error('添加套餐失败:', error)
    return {
      success: false,
      message: '添加套餐失败'
    }
  }
}

/**
 * 更新套餐
 */
async function updatePackage(event, wxContext) {
  // 检查管理员权限
  const authCheck = await checkAdminPermission(wxContext)
  if (!authCheck.isAdmin) {
    return {
      success: false,
      message: authCheck.message
    }
  }

  const { packageId, packageData } = event

  if (!packageId) {
    return {
      success: false,
      message: '套餐ID不能为空'
    }
  }

  if (!packageData) {
    return {
      success: false,
      message: '套餐数据不能为空'
    }
  }

  try {
    // 检查套餐是否存在
    const packageResult = await db.collection('packages')
      .where({
        $or: [
          { _id: packageId },
          { id: packageId }
        ]
      })
      .get()

    if (packageResult.data.length === 0) {
      return {
        success: false,
        message: '套餐不存在'
      }
    }

    // 准备更新数据
    const updateData = {
      updated_at: new Date()
    }

    // 只更新提供的字段
    if (packageData.name !== undefined) updateData.name = packageData.name
    if (packageData.description !== undefined) updateData.description = packageData.description
    if (packageData.credits !== undefined) updateData.credits = parseInt(packageData.credits)
    if (packageData.price !== undefined) updateData.price = parseFloat(packageData.price)
    if (packageData.original_price !== undefined) updateData.original_price = parseFloat(packageData.original_price)
    if (packageData.discount !== undefined) updateData.discount = packageData.discount
    if (packageData.sort_order !== undefined) updateData.sort_order = parseInt(packageData.sort_order)
    if (packageData.is_popular !== undefined) updateData.is_popular = packageData.is_popular
    if (packageData.is_active !== undefined) updateData.is_active = packageData.is_active

    await db.collection('packages')
      .where({
        $or: [
          { _id: packageId },
          { id: packageId }
        ]
      })
      .update({
        data: updateData
      })

    return {
      success: true,
      message: '套餐更新成功'
    }
  } catch (error) {
    console.error('更新套餐失败:', error)
    return {
      success: false,
      message: '更新套餐失败'
    }
  }
}

/**
 * 删除套餐
 */
async function deletePackage(event, wxContext) {
  // 检查管理员权限
  const authCheck = await checkAdminPermission(wxContext)
  if (!authCheck.isAdmin) {
    return {
      success: false,
      message: authCheck.message
    }
  }

  const { packageId } = event

  if (!packageId) {
    return {
      success: false,
      message: '套餐ID不能为空'
    }
  }

  try {
    // 检查是否有相关订单
    const orderResult = await db.collection('orders')
      .where({ package_id: packageId })
      .limit(1)
      .get()

    if (orderResult.data.length > 0) {
      return {
        success: false,
        message: '该套餐已有相关订单，无法删除。建议禁用套餐。'
      }
    }

    // 删除套餐
    const deleteResult = await db.collection('packages')
      .where({
        $or: [
          { _id: packageId },
          { id: packageId }
        ]
      })
      .remove()

    if (deleteResult.stats.removed === 0) {
      return {
        success: false,
        message: '套餐不存在'
      }
    }

    return {
      success: true,
      message: '套餐删除成功'
    }
  } catch (error) {
    console.error('删除套餐失败:', error)
    return {
      success: false,
      message: '删除套餐失败'
    }
  }
}

/**
 * 清理过期订单
 */
async function cleanExpiredOrders(event, wxContext) {
  try {
    // 默认30分钟过期
    const expireMinutes = event.expireMinutes || 30
    const expireTime = new Date(Date.now() - expireMinutes * 60 * 1000)

    console.log('清理过期订单，过期时间:', expireTime)

    // 查找过期的未支付订单
    const expiredOrders = await db.collection('orders')
      .where({
        status: 'pending',
        created_at: db.command.lt(expireTime)
      })
      .get()

    console.log('找到过期订单数量:', expiredOrders.data.length)

    if (expiredOrders.data.length === 0) {
      return {
        success: true,
        message: '没有过期订单需要清理',
        data: { cleaned: 0 }
      }
    }

    // 批量更新订单状态为已过期
    let cleanedCount = 0
    for (const order of expiredOrders.data) {
      try {
        await db.collection('orders')
          .doc(order._id)
          .update({
            data: {
              status: 'expired',
              expire_reason: '订单超时未支付',
              updated_at: new Date()
            }
          })
        cleanedCount++
      } catch (error) {
        console.error('更新订单状态失败:', order._id, error)
      }
    }

    console.log('成功清理过期订单数量:', cleanedCount)

    return {
      success: true,
      message: `成功清理${cleanedCount}个过期订单`,
      data: { cleaned: cleanedCount }
    }

  } catch (error) {
    console.error('清理过期订单失败:', error)
    return {
      success: false,
      message: '清理过期订单失败'
    }
  }
}

/**
 * 检查订单状态
 */
async function checkOrderStatus(event, wxContext) {
  const { orderId } = event
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  if (!orderId) {
    return {
      success: false,
      message: '订单ID不能为空'
    }
  }

  try {
    // 查询订单状态
    const orderResult = await db.collection('orders')
      .where({
        _id: orderId,
        user_openid: OPENID // 确保只能查询自己的订单
      })
      .get()

    if (orderResult.data.length === 0) {
      return {
        success: false,
        message: '订单不存在'
      }
    }

    const order = orderResult.data[0]

    // 检查订单是否过期
    const now = new Date()
    const orderTime = new Date(order.created_at)
    const expireTime = new Date(orderTime.getTime() + 30 * 60 * 1000) // 30分钟过期

    let status = order.status
    if (status === 'pending' && now > expireTime) {
      // 自动标记为过期
      await db.collection('orders')
        .doc(orderId)
        .update({
          data: {
            status: 'expired',
            expire_reason: '订单超时未支付',
            updated_at: new Date()
          }
        })
      status = 'expired'
    }

    return {
      success: true,
      data: {
        orderId: order._id,
        status: status,
        amount: order.amount,
        credits: order.credits,
        packageName: order.package_name,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        expireAt: expireTime,
        isExpired: status === 'expired' || now > expireTime
      },
      message: '获取订单状态成功'
    }

  } catch (error) {
    console.error('检查订单状态失败:', error)
    return {
      success: false,
      message: '检查订单状态失败'
    }
  }
}

/**
 * 获取积分记录
 */
async function getCreditRecords(event, wxContext) {
  const { OPENID } = wxContext
  const { filter = 'all', pageSize = 20, lastId = null } = event

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 构建查询条件
    let query = { user_openid: OPENID }

    // 根据筛选条件调整查询
    if (filter === 'earn') {
      query.type = db.command.in(['daily_sign', 'recharge', 'refund', 'admin_adjust', 'invite_reward', 'system_gift', 'signup_bonus', 'daily_bonus', 'share_reward', 'admin_add'])
    } else if (filter === 'spend') {
      query.type = db.command.in(['photography', 'fitting', 'generation', 'consume', 'photography_generate', 'fitting_generate', 'ai_generation', 'work_generation', 'admin_deduct'])
    }

    // 添加分页条件
    if (lastId) {
      query._id = db.command.lt(lastId)
    }

    // 分页查询
    const result = await db.collection('credit_records')
      .where(query)
      .orderBy('_id', 'desc')
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: result.data || []
    }
  } catch (error) {
    console.error('获取积分记录失败:', error)
    return {
      success: false,
      message: '获取积分记录失败'
    }
  }
}

/**
 * 获取积分汇总信息
 */
async function getCreditSummary(event, wxContext) {
  const { OPENID } = wxContext

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    }
  }

  try {
    // 获取用户当前积分
    const userResult = await db.collection('users')
      .where({ openid: OPENID })
      .get()

    const currentCredits = userResult.data.length > 0 ? (userResult.data[0].credits || 0) : 0

    // 统计总收入（所有正向积分变动）
    const earnResult = await db.collection('credit_records')
      .where({
        user_openid: OPENID,
        type: db.command.in(['daily_sign', 'recharge', 'refund', 'admin_adjust', 'invite_reward', 'system_gift', 'signup_bonus', 'daily_bonus', 'share_reward', 'admin_add'])
      })
      .get()

    const totalEarned = earnResult.data.reduce((sum, record) => sum + (record.amount || 0), 0)

    // 统计总支出（所有负向积分变动）
    const spendResult = await db.collection('credit_records')
      .where({
        user_openid: OPENID,
        type: db.command.in(['photography', 'fitting', 'generation', 'consume', 'photography_generate', 'fitting_generate', 'ai_generation', 'work_generation'])
      })
      .get()

    const totalSpent = spendResult.data.reduce((sum, record) => sum + (record.amount || 0), 0)

    return {
      success: true,
      data: {
        current: currentCredits,
        totalEarned: totalEarned,
        totalSpent: totalSpent
      }
    }
  } catch (error) {
    console.error('获取积分汇总失败:', error)
    return {
      success: false,
      message: '获取积分汇总失败'
    }
  }
}