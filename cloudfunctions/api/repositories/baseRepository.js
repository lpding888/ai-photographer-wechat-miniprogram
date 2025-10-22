// 基础数据访问层
const cloud = require('wx-server-sdk')

class BaseRepository {
  constructor(collectionName) {
    this.db = cloud.database()
    this.collection = this.db.collection(collectionName)
  }
  
  /**
   * 根据ID查找单个文档
   */
  async findById(id) {
    try {
      const result = await this.collection.doc(id).get()
      return result.data
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 根据条件查找文档
   */
  async findOne(query) {
    try {
      const result = await this.collection.where(query).get()
      return result.data.length > 0 ? result.data[0] : null
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 根据条件查找多个文档
   */
  async find(query, options = {}) {
    try {
      let queryBuilder = this.collection.where(query)
      
      if (options.orderBy) {
        queryBuilder = queryBuilder.orderBy(options.orderBy.field, options.orderBy.direction)
      }
      
      if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit)
      }
      
      if (options.skip) {
        queryBuilder = queryBuilder.skip(options.skip)
      }
      
      const result = await queryBuilder.get()
      return result.data
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 创建文档
   */
  async create(data) {
    try {
      const result = await this.collection.add({
        data: {
          ...data,
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      return result._id
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 更新文档
   */
  async updateById(id, data) {
    try {
      const result = await this.collection.doc(id).update({
        data: {
          ...data,
          updated_at: new Date()
        }
      })
      return result.stats.updated > 0
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 删除文档
   */
  async deleteById(id) {
    try {
      const result = await this.collection.doc(id).remove()
      return result.stats.removed > 0
    } catch (error) {
      throw error
    }
  }
  
  /**
   * 统计文档数量
   */
  async count(query = {}) {
    try {
      const result = await this.collection.where(query).count()
      return result.total
    } catch (error) {
      throw error
    }
  }
}

module.exports = BaseRepository