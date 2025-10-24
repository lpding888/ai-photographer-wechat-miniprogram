# AI摄影师 - 智能提示词和大模型管理系统

## 🎯 系统概述

这个管理系统用于统一管理AI摄影师项目中的所有提示词模板、大模型API配置和智能图片处理流程。支持动态配置、版本控制、性能监控和成本管理。

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  管理后台       │ ──▶│  配置管理API     │ ──▶│  数据库存储     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  智能处理服务    │ ◀──│  提示词引擎      │ ◀──│  大模型适配器    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 数据库设计

### **提示词模板表 (prompt_templates)**
```sql
CREATE TABLE prompt_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '模板名称',
  category VARCHAR(50) NOT NULL COMMENT '分类',
  subcategory VARCHAR(50) COMMENT '子分类',
  template_content TEXT NOT NULL COMMENT '模板内容',
  variables JSON COMMENT '变量定义',
  description TEXT COMMENT '模板描述',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  usage_count INT DEFAULT 0 COMMENT '使用次数',
  success_rate DECIMAL(5,2) DEFAULT 0.00 COMMENT '成功率',
  avg_quality_score DECIMAL(5,2) DEFAULT 0.00 COMMENT '平均质量评分',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(50) COMMENT '创建者',
  version VARCHAR(20) DEFAULT '1.0' COMMENT '版本号'
);
```

### **大模型配置表 (ai_models)**
```sql
CREATE TABLE ai_models (
  id INT PRIMARY KEY AUTO_INCREMENT,
  model_name VARCHAR(100) NOT NULL UNIQUE COMMENT '模型名称',
  model_type ENUM('text', 'multimodal', 'image') NOT NULL COMMENT '模型类型',
  provider VARCHAR(50) NOT NULL COMMENT '提供商',
  api_endpoint VARCHAR(255) NOT NULL COMMENT 'API端点',
  api_key_encrypted TEXT COMMENT '加密的API密钥',
  max_tokens INT DEFAULT 4096 COMMENT '最大Token数',
  cost_per_token DECIMAL(10,6) DEFAULT 0.0001 COMMENT '每Token成本',
  rate_limit_rpm INT DEFAULT 60 COMMENT '每分钟请求限制',
  rate_limit_tpm INT DEFAULT 1000000 COMMENT '每分钟Token限制',
  supported_features JSON COMMENT '支持的功能特性',
  model_config JSON COMMENT '模型配置参数',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  priority INT DEFAULT 1 COMMENT '优先级',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **提示词生成记录表 (prompt_generations)**
```sql
CREATE TABLE prompt_generations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL COMMENT '用户ID',
  template_id INT COMMENT '使用的模板ID',
  model_id INT COMMENT '使用的大模型ID',
  input_data JSON COMMENT '输入数据',
  generated_prompt TEXT NOT NULL COMMENT '生成的提示词',
  variables_filled JSON COMMENT '填充的变量',
  processing_time_ms INT COMMENT '处理时间(毫秒)',
  token_count INT COMMENT 'Token数量',
  estimated_cost DECIMAL(10,6) COMMENT '估算成本',
  quality_score DECIMAL(5,2) COMMENT '质量评分',
  generation_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES prompt_templates(id),
  FOREIGN KEY (model_id) REFERENCES ai_models(id)
);
```

### **大模型调用记录表 (model_calls)**
```sql
CREATE TABLE model_calls (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(50) NOT NULL COMMENT '用户ID',
  model_id INT NOT NULL COMMENT '模型ID',
  call_type ENUM('image_analysis', 'prompt_generation', 'image_generation') NOT NULL COMMENT '调用类型',
  input_data JSON COMMENT '输入数据',
  response_data JSON COMMENT '响应数据',
  tokens_used INT COMMENT '使用的Token数',
  processing_time_ms INT COMMENT '处理时间(毫秒)',
  cost DECIMAL(10,6) COMMENT '实际成本',
  status ENUM('success', 'failed', 'timeout') DEFAULT 'success',
  error_message TEXT COMMENT '错误信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (model_id) REFERENCES ai_models(id)
);
```

### **智能处理流程配置表 (intelligent_process_config)**
```sql
CREATE TABLE intelligent_process_config (
  id INT PRIMARY KEY AUTO_INCREMENT,
  process_name VARCHAR(100) NOT NULL COMMENT '流程名称',
  process_type ENUM('photography', 'fitting', 'general') NOT NULL COMMENT '流程类型',
  steps JSON NOT NULL COMMENT '处理步骤配置',
  default_model_id INT COMMENT '默认模型ID',
  fallback_model_ids JSON COMMENT '备用模型ID列表',
  quality_threshold DECIMAL(5,2) DEFAULT 0.7 COMMENT '质量阈值',
  cost_limit DECIMAL(10,2) DEFAULT 10.00 COMMENT '成本限制',
  timeout_seconds INT DEFAULT 300 COMMENT '超时时间(秒)',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (default_model_id) REFERENCES ai_models(id)
);
```

## 🔧 核心服务实现

### **1. 提示词管理服务 (PromptService)**
file_path</arg_key>
<arg_value>C:\Users\qq100\Desktop\迭代目录\2.0\ai-management-system.md