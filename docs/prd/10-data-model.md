# 数据模型（Entity）

## Entity-001: Account（邮箱账户）

| 字段名 | 类型 | 约束 | 描述 |
|-------|------|------|------|
| id | string | PK | UUID |
| email | string | NOT NULL, UNIQUE | 邮箱地址 |
| display_name | string | | 显示名称 |
| imap_host | string | NOT NULL | IMAP 服务器地址 |
| imap_port | number | NOT NULL | IMAP 端口 |
| imap_security | enum | TLS/SSL/STARTTLS | 加密方式 |
| smtp_host | string | NOT NULL | SMTP 服务器地址 |
| smtp_port | number | NOT NULL | SMTP 端口 |
| smtp_security | enum | TLS/SSL/STARTTLS | 加密方式 |
| auth_type | enum | Password/OAuth2 | 认证类型 |
| sync_enabled | boolean | DEFAULT true | 是否启用同步 |
| sync_interval | number | DEFAULT 15 | 同步间隔（分钟） |
| last_sync | timestamp | | 最后同步时间 |
| status | enum | normal/error/re_auth_required | 账户状态 |
| last_error | string | | 最近一次同步或认证错误 |

## Entity-002: Folder（文件夹）

| 字段名 | 类型 | 约束 | 描述 |
|-------|------|------|------|
| id | string | PK | UUID |
| account_id | string | FK | 所属账户 |
| remote_id | string | NOT NULL | 远程文件夹 ID |
| name | string | NOT NULL | 文件夹名称 |
| type | enum | system/custom | 系统/自定义 |
| icon | string | | 图标名称 |
| unread_count | number | DEFAULT 0 | 未读数 |

## Entity-003: Email（邮件）

| 字段名 | 类型 | 约束 | 描述 |
|-------|------|------|------|
| id | string | PK | UUID |
| account_id | string | FK | 所属账户 |
| folder_id | string | FK | 所属文件夹 |
| remote_id | string | NOT NULL | 远程邮件 ID |
| message_id | string | NOT NULL | Message-ID 头 |
| subject | string | | 主题 |
| from | json | NOT NULL | 发件人 {name, email} |
| to | json | NOT NULL | 收件人列表 |
| cc | json | | 抄送列表 |
| bcc | json | | 密送列表 |
| date | timestamp | NOT NULL | 发送时间 |
| has_attachments | boolean | DEFAULT false | 是否有附件 |
| is_read | boolean | DEFAULT false | 是否已读 |
| is_starred | boolean | DEFAULT false | 是否星标 |
| snippet | string | | 摘要/预览 |
| body_html | text | | HTML 正文 |
| body_text | text | | 纯文本正文 |
| headers | json | | 原始头信息 |

## Entity-004: Attachment（附件）

| 字段名 | 类型 | 约束 | 描述 |
|-------|------|------|------|
| id | string | PK | UUID |
| email_id | string | FK | 所属邮件 |
| filename | string | NOT NULL | 文件名 |
| mime_type | string | NOT NULL | MIME 类型 |
| size | number | NOT NULL | 文件大小 |
| content_id | string | | Content-ID（内嵌图片） |
| is_inline | boolean | DEFAULT false | 是否内嵌 |

## Entity-005: AppSettings（应用设置）

| 字段名 | 类型 | 约束 | 描述 |
|-------|------|------|------|
| id | string | PK | 固定单例 ID |
| theme_mode | enum | light/dark/system | 主题模式 |
| confirm_before_delete | boolean | DEFAULT true | 删除前是否确认 |
| download_directory | string | | 默认附件下载目录 |
| remote_image_policy | enum | always/ask/never | 远程图片加载策略 |
| search_history_limit | number | DEFAULT 10 | 搜索历史条数上限 |
