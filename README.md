# Rever by Shinplex

Retool OpenAI API 适配器 - 将 Retool AI Agent API 转换为 OpenAI 兼容格式。

## 项目结构

- **Retool**  
  Deno Version: [`retool.ts`](/retool.ts)  
  Cloudflare Workers: [`workers/retool.ts`](/workers/retool.ts)  
- **JetBrains AI**  
  Deno Version: [`jetbrains.ts`](/jetbrains.ts)  

---

## 快速开始（5分钟配置）

### 第一步：创建 Retool 账号并获取凭证

1. **注册/登录 Retool**
   - 访问 [retool.com](https://retool.com) 注册账号
   - 记下你的域名，格式为 `your-company.retool.com`

2. **获取认证 Token**（有效期约一周）
   - 登录 Retool 后，按 `F12` 打开浏览器开发者工具
   - 切换到 `Network`（网络）标签
   - 刷新页面或点击任意操作
   - 找到任意一个请求，查看请求头：
     - 复制 `x-xsrf-token` 的值 → 这是 `x_xsrf_token`
   - 切换到 `Application`（应用）标签 → Cookies
     - 复制 `accessToken` 的值 → 这是 `accessToken`

3. **创建 AI Agent**
   - 进入 Retool 控制台，点击左侧 `Agents (Beta)`
   - 点击 `Create Agent` 创建新 Agent
   - 建议创建名为 `claude-opus-4` 或 `claude-sonnet-4` 的 Agent
   - 在 Agent 设置页面选择对应的模型

### 第二步：配置环境变量

创建 `.env` 文件（或在 Deno Deploy 控制台配置）：

```bash
# 你自定义的 API 密钥（调用此适配器时使用）
CLIENT_API_KEYS=sk-your-custom-key

# Retool 账户配置（JSON 格式，注意要写成一行）
RETOOL_ACCOUNTS=[{"domain_name":"your-company.retool.com","x_xsrf_token":"751291ed-xxxx-xxxx","accessToken":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxx"}]
```

**多账户配置示例**（用于故障转移）：
```bash
RETOOL_ACCOUNTS=[{"domain_name":"account1.retool.com","x_xsrf_token":"token1","accessToken":"access1"},{"domain_name":"account2.retool.com","x_xsrf_token":"token2","accessToken":"access2"}]
```

### 第三步：运行

```bash
# 本地运行
deno run --allow-net --allow-env retool.ts

# 或部署到 Deno Deploy（见下方详细说明）
```

### 第四步：使用

```bash
# 查看可用模型
curl http://localhost:8000/models

# 发送聊天请求
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-custom-key" \
  -d '{"model": "claude-sonnet-4", "messages": [{"role": "user", "content": "你好"}]}'
```

---

## 环境变量详解

| 变量名 | 必需 | 格式 | 说明 |
|--------|------|------|------|
| `CLIENT_API_KEYS` | ✅ | 逗号分隔 | 你自定义的 API 密钥，用于调用此适配器 |
| `RETOOL_ACCOUNTS` | ✅ | JSON 数组 | Retool 账户配置 |
| `DEBUG_MODE` | ❌ | `true`/`false` | 调试模式，默认 `false` |

### RETOOL_ACCOUNTS 字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| `domain_name` | 你的 Retool 域名 | `mycompany.retool.com` |
| `x_xsrf_token` | XSRF Token（从请求头获取） | `751291ed-xxxx-xxxx` |
| `accessToken` | Access Token（从 Cookie 获取） | `eyJhbGci...` |

---

### Deno Deploy 部署

#### 方式一：通过 GitHub 连接

1. Fork 或 Push 代码到 GitHub 仓库

2. 访问 [Deno Deploy](https://dash.deno.com/) 并登录

3. 点击 "New Project" 创建新项目

4. 选择 "Deploy from GitHub repository"

5. 选择你的仓库，配置：
   - **Entry point**: `retool.ts`
   - **Branch**: `main` (或你的默认分支)

6. 在项目设置中配置环境变量：
   - 进入 Project Settings -> Environment Variables
   - 添加 `CLIENT_API_KEYS` 和 `RETOOL_ACCOUNTS`
   - 可选添加 `DEBUG_MODE`

7. 部署完成后，获取项目 URL（如 `https://your-project.deno.dev`）

#### 方式二：通过 CLI 部署

1. 安装 Deno：
   ```bash
   # macOS/Linux
   curl -fsSL https://deno.land/install.sh | sh
   
   # Windows (PowerShell)
   irm https://deno.land/install.ps1 | iex
   ```

2. 安装 deployctl：
   ```bash
   deno install -Arf jsr:@deno/deployctl
   ```

3. 登录 Deno Deploy：
   ```bash
   deployctl login
   ```

4. 部署项目：
   ```bash
   deployctl deploy --project=your-project-name retool.ts
   ```

5. 在 Deno Deploy 控制台配置环境变量

---

### 本地开发

1. 复制环境变量示例文件：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env` 文件，填入实际配置

3. 运行开发服务器：
   ```bash
   deno run --allow-net --allow-env retool.ts
   ```

4. 运行测试：
   ```bash
   deno test --allow-env
   ```

---

## API 使用示例

### 获取可用模型列表

```bash
# 公开端点（无需认证）
curl https://your-project.deno.dev/models

# 需要认证的端点
curl https://your-project.deno.dev/v1/models \
  -H "Authorization: Bearer your-api-key"
```

### 发送聊天请求

```bash
curl https://your-project.deno.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "agent-id-from-retool",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

### 流式响应

```bash
curl https://your-project.deno.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "agent-id-from-retool",
    "messages": [
      {"role": "user", "content": "Tell me a story"}
    ],
    "stream": true
  }'
```

### 切换调试模式

```bash
curl https://your-project.deno.dev/debug
```

---

## 错误处理

当所有 Retool 账户都失败时，API 返回结构化错误响应：

```json
{
  "error": {
    "message": "All Retool accounts failed",
    "type": "upstream_error",
    "attempts": 2,
    "details": [
      {
        "operation": "thread_create",
        "account": "domain1.retool.com",
        "statusCode": 401,
        "message": "Unauthorized",
        "timestamp": "2025-12-10T10:30:00.000Z"
      }
    ]
  }
}
```

---

## License

See [LICENSE](LICENSE) file.
