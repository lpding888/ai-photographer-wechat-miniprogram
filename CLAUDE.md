# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI Photography WeChat Mini Program (AI摄影师小程序) that provides AI-powered clothing photography and virtual fitting services. The project uses WeChat Cloud Development (微信云开发) with a serverless architecture based on cloud functions.

## Development Commands

### Deployment
- **Deploy cloud functions**: Use PowerShell scripts in root directory (e.g., `deploy-cloudfunctions.ps1`)
- **Setup environment**: Run `setup-env-vars.ps1` to configure cloud environment variables
- **Check deployment**: Use `deployment-checklist.ps1` to verify deployment status

### Testing and Debugging
- **Test cloud functions**: Use the debug scripts like `debug-auth-issue.ps1` and `debug-auth-aimodels.ps1`
- **Check data integrity**: Run data validation scripts such as `check-photography-templates.ps1`
- **Fix common issues**: Use fix scripts like `fix-openid-error.ps1` and `fix-api-cloudfunction.ps1`

## Architecture

### Frontend Structure
- **miniprogram/**: WeChat Mini Program frontend code
  - `app.js`: Main application entry with cloud initialization and user management
  - `app.json`: App configuration with pages, tabBar, and cloud settings
  - `pages/`: Individual page components (index, photography, fitting, works, profile, etc.)
  - `utils/api.js`: Centralized API service class for cloud function calls
  - `components/`: Reusable components (loading, state)

### Backend Structure (Cloud Functions)
- **Core Functions**:
  - `api`: Unified API entry point for work management and user data queries
  - `user`: User registration, login, and profile management
  - `photography`: AI clothing photography generation
  - `fitting`: AI virtual fitting generation
  - `payment`: Credits system, recharge packages, and order management

- **Supporting Functions**:
  - `scene`: Photography scene data management
  - `prompt`: AI prompt template management
  - `storage`: Cloud storage file management and deduplication
  - `aimodels`: AI model configuration and selection
  - `auth`: Authentication and permission control

### Key Design Patterns

#### Cloud Function Architecture
All cloud functions follow a unified pattern:
```javascript
exports.main = async (event, context) => {
  const { action } = event
  const { OPENID } = cloud.getWXContext()

  switch (action) {
    case 'actionName':
      return await handleAction(event)
    // ...
  }
}
```

#### API Service Pattern
The frontend uses a centralized ApiService class (`utils/api.js`) that:
- Handles cloud initialization and readiness checking
- Provides unified error handling and loading states
- Manages user authentication context
- Implements retry logic for failed requests

#### Data Flow
1. **User Authentication**: App initialization → User login → Store user info globally
2. **AI Generation**: Upload images → Set parameters → Call cloud function → Monitor progress → Display results
3. **Work Management**: List works with pagination → View details → Toggle favorite/delete

## Configuration

### Cloud Environment
- Environment ID is configured in `app.js` (currently set to 'cloudbase-0gu1afji26f514d2')
- All cloud functions are configured in `project.config.json` with npm package management

### Database Collections
Core collections used:
- `users`: User profiles and credits
- `works`: Generated AI works and metadata
- `scenes`: Photography scenes and parameters
- `orders`: Payment orders and transaction history
- `task_queue`: Async task processing
- `aimodels`: AI model configurations

### API Integration
The system integrates with external AI services through configured providers. AI model selection is handled by the `aimodels` cloud function based on capabilities, cost, and provider preferences.

## Development Guidelines

### Cloud Function Development
- Always include proper error handling with try-catch blocks
- Use `cloud.getWXContext()` to get user OPENID for authentication
- Return standardized response format: `{ success: boolean, data?: any, message?: string }`
- Add `__noLoading` parameter to skip loading indicators for background calls

### Frontend Development
- Use the ApiService class for all cloud function calls
- Handle loading states and error messages consistently
- Follow WeChat Mini Program lifecycle patterns
- Store user info in both global data and local storage for persistence

### File Management
- Upload files to cloud storage with proper naming conventions
- Use the `storage` cloud function for file deduplication
- Implement proper cleanup for temporary files

### Authentication
- All sensitive operations require user authentication via OPENID
- Use the `auth` cloud function for permission checks
- Admin operations are protected with role-based access control

## Common Issues

### Storage API Timing Issues
The app includes enhanced error handling for WeChat's storage API timing issues. See `app.js` for the implementation of delayed initialization and fallback mechanisms.

### Cloud Function Dependencies
Each cloud function has its own `package.json` with required dependencies. The main dependencies are:
- `wx-server-sdk`: WeChat Cloud SDK
- Various AI service clients and utility libraries

### Development vs Production
- Debug mode is enabled in `app.json` (debug: true)
- Use the debug cloud functions for development testing
- Production deployment requires proper environment variable configuration

- 本项目全程使用中文对话