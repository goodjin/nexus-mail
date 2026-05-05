use super::database::Database;
use anyhow::{bail, Result};
use serde::Serialize;
use sqlx::Row;
use std::collections::HashMap;

const SMART_INBOX_CATEGORIES: [&str; 5] = [
    "important",
    "personal",
    "notifications",
    "newsletters",
    "low_priority",
];
const SMART_INBOX_PRIORITY: [&str; 2] = ["important", "personal"];
const SMART_INBOX_REASONS: [&str; 2] = ["user_mark_important", "user_mark_unimportant"];

#[derive(Debug, Serialize, Clone)]
pub struct SmartInboxGroup {
    pub id: String,
    pub label: String,
    pub unread_count: u32,
    pub latest_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SmartInboxPriorityItem {
    pub id: String,
    pub uid: String,
    pub account_id: String,
    pub folder_id: String,
    pub subject: String,
    pub from: String,
    pub date: String,
    pub flags: Vec<String>,
    pub category: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct SmartInboxSummary {
    pub groups: Vec<SmartInboxGroup>,
    pub priority_items: Vec<SmartInboxPriorityItem>,
}

#[derive(Debug, Serialize)]
pub struct SmartInboxOverride {
    pub id: String,
    pub email_id: String,
    pub account_id: String,
    pub category: String,
    pub reason: String,
    pub created_at: String,
}

struct SmartInboxRule {
    field: String,
    value: String,
    category: String,
}

struct ClassifiedEmail {
    id: String,
    uid: String,
    folder_id: String,
    subject: String,
    from: String,
    date: String,
    flags: Vec<String>,
    category: String,
    timestamp: i64,
}

pub async fn get_smart_inbox_summary(
    db: &Database,
    account_id: &str,
    account_email: &str,
) -> Result<SmartInboxSummary> {
    let classified = load_classified_emails(db, account_id, account_email).await?;
    let groups = build_groups(&classified);
    let mut priority_candidates: Vec<&ClassifiedEmail> = classified
        .iter()
        .filter(|email| SMART_INBOX_PRIORITY.contains(&email.category.as_str()))
        .collect();
    priority_candidates.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    let priority_items: Vec<SmartInboxPriorityItem> = priority_candidates
        .into_iter()
        .take(6)
        .map(|email| SmartInboxPriorityItem {
            id: email.id.clone(),
            uid: email.uid.clone(),
            account_id: account_id.to_string(),
            folder_id: email.folder_id.clone(),
            subject: email.subject.clone(),
            from: email.from.clone(),
            date: email.date.clone(),
            flags: email.flags.clone(),
            category: email.category.clone(),
        })
        .collect();
    Ok(SmartInboxSummary {
        groups,
        priority_items,
    })
}

pub async fn list_smart_inbox_groups(
    db: &Database,
    account_id: &str,
    account_email: &str,
) -> Result<Vec<SmartInboxGroup>> {
    let classified = load_classified_emails(db, account_id, account_email).await?;
    Ok(build_groups(&classified))
}

pub async fn set_smart_inbox_override(
    db: &Database,
    account_id: &str,
    email_id: &str,
    category: &str,
    reason: &str,
) -> Result<SmartInboxOverride> {
    ensure_category(category)?;
    ensure_reason(reason)?;
    let email_row = sqlx::query(
        "SELECT emails.sender
         FROM emails
         JOIN folders ON folders.id = emails.folder_id
         WHERE emails.id = ? AND folders.account_id = ?",
    )
    .bind(email_id)
    .bind(account_id)
    .fetch_optional(&db.pool)
    .await?;
    let sender: String = email_row
        .map(|row| row.get::<Option<String>, _>(0).unwrap_or_default())
        .ok_or_else(|| anyhow::anyhow!("Email not found for account"))?;
    let now = chrono::Utc::now();
    let created_at = now.timestamp_millis();

    sqlx::query(
        "INSERT INTO smart_inbox_overrides (id, email_id, account_id, category, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)
         ON CONFLICT(account_id, email_id)
         DO UPDATE SET category = excluded.category, reason = excluded.reason, status = 'active', created_at = excluded.created_at",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(email_id)
    .bind(account_id)
    .bind(category)
    .bind(reason)
    .bind(created_at)
    .execute(&db.pool)
    .await?;

    if let Some(sender_address) = extract_sender_address(&sender) {
        sqlx::query(
            "INSERT INTO smart_inbox_rules (id, account_id, field, value, category, created_at)
             VALUES (?, ?, 'sender', ?, ?, ?)
             ON CONFLICT(account_id, field, value)
             DO UPDATE SET category = excluded.category, created_at = excluded.created_at",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(account_id)
        .bind(sender_address)
        .bind(category)
        .bind(created_at)
        .execute(&db.pool)
        .await?;
    }

    let override_id: String = sqlx::query_as::<_, (String,)>(
        "SELECT id FROM smart_inbox_overrides WHERE account_id = ? AND email_id = ?",
    )
    .bind(account_id)
    .bind(email_id)
    .fetch_one(&db.pool)
    .await?
    .0;

    Ok(SmartInboxOverride {
        id: override_id,
        email_id: email_id.to_string(),
        account_id: account_id.to_string(),
        category: category.to_string(),
        reason: reason.to_string(),
        created_at: now.to_rfc3339(),
    })
}

fn ensure_category(category: &str) -> Result<()> {
    if SMART_INBOX_CATEGORIES.contains(&category) {
        Ok(())
    } else {
        bail!("Invalid smart inbox category: {}", category)
    }
}

fn ensure_reason(reason: &str) -> Result<()> {
    if SMART_INBOX_REASONS.contains(&reason) {
        Ok(())
    } else {
        bail!("Invalid smart inbox override reason: {}", reason)
    }
}

async fn load_classified_emails(
    db: &Database,
    account_id: &str,
    account_email: &str,
) -> Result<Vec<ClassifiedEmail>> {
    let overrides = load_overrides(db, account_id).await?;
    let rules = load_rules(db, account_id).await?;
    let account_domain = account_email
        .split('@')
        .nth(1)
        .map(|value| value.to_lowercase());
    let rows = sqlx::query(
        "SELECT emails.id, emails.remote_id, emails.folder_id, emails.subject, emails.sender, emails.date, emails.flags
         FROM emails
         JOIN folders ON folders.id = emails.folder_id
         WHERE folders.account_id = ?",
    )
    .bind(account_id)
    .fetch_all(&db.pool)
    .await?;
    let mut emails = Vec::with_capacity(rows.len());
    for row in rows {
        let id: String = row.get(0);
        let uid: String = row.get(1);
        let folder_id: String = row.get(2);
        let subject: String = row.get::<Option<String>, _>(3).unwrap_or_default();
        let from: String = row.get::<Option<String>, _>(4).unwrap_or_default();
        let date: String = row.get::<Option<String>, _>(5).unwrap_or_default();
        let flags_json: String = row.get::<Option<String>, _>(6).unwrap_or_else(|| "[]".to_string());
        let flags: Vec<String> = serde_json::from_str(&flags_json).unwrap_or_default();
        let category = resolve_category(
            &id,
            &subject,
            &from,
            account_domain.as_deref(),
            &overrides,
            &rules,
        );
        let timestamp = parse_timestamp(&date).unwrap_or(0);
        emails.push(ClassifiedEmail {
            id,
            uid,
            folder_id,
            subject,
            from,
            date,
            flags,
            category,
            timestamp,
        });
    }
    Ok(emails)
}

async fn load_overrides(db: &Database, account_id: &str) -> Result<HashMap<String, String>> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT email_id, category FROM smart_inbox_overrides WHERE account_id = ? AND status = 'active'",
    )
    .bind(account_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows.into_iter().collect())
}

async fn load_rules(db: &Database, account_id: &str) -> Result<Vec<SmartInboxRule>> {
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT field, value, category FROM smart_inbox_rules WHERE account_id = ?",
    )
    .bind(account_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(field, value, category)| SmartInboxRule {
            field,
            value,
            category,
        })
        .collect())
}

fn build_groups(classified: &[ClassifiedEmail]) -> Vec<SmartInboxGroup> {
    let mut stats: HashMap<String, (u32, Option<(i64, String)>)> = SMART_INBOX_CATEGORIES
        .iter()
        .map(|label| (label.to_string(), (0_u32, None)))
        .collect();
    for email in classified {
        let entry = stats
            .entry(email.category.clone())
            .or_insert((0, None));
        if !email.flags.iter().any(|flag| flag == "\\Seen") {
            entry.0 = entry.0.saturating_add(1);
        }
        if entry.1.as_ref().map(|(ts, _)| *ts).unwrap_or(0) < email.timestamp {
            entry.1 = Some((email.timestamp, email.date.clone()));
        }
    }
    SMART_INBOX_CATEGORIES
        .iter()
        .map(|label| {
            let (unread_count, latest) = stats
                .get(*label)
                .cloned()
                .unwrap_or((0, None));
            SmartInboxGroup {
                id: label.to_string(),
                label: label.to_string(),
                unread_count,
                latest_at: latest.map(|(_, value)| value).unwrap_or_default(),
            }
        })
        .collect()
}

fn resolve_category(
    email_id: &str,
    subject: &str,
    from: &str,
    account_domain: Option<&str>,
    overrides: &HashMap<String, String>,
    rules: &[SmartInboxRule],
) -> String {
    if let Some(category) = overrides.get(email_id) {
        return category.clone();
    }
    if let Some(sender_address) = extract_sender_address(from) {
        if let Some(rule) = rules.iter().find(|rule| {
            rule.field == "sender" && rule.value.eq_ignore_ascii_case(&sender_address)
        }) {
            return rule.category.clone();
        }
    }
    classify_heuristics(subject, from, account_domain)
}

fn classify_heuristics(subject: &str, from: &str, account_domain: Option<&str>) -> String {
    let subject_lower = subject.to_lowercase();
    let from_lower = from.to_lowercase();
    if subject_lower.contains("urgent")
        || subject_lower.contains("important")
        || subject_lower.contains("invoice")
        || subject_lower.contains("asap")
    {
        return "important".to_string();
    }
    if from_lower.contains("noreply")
        || from_lower.contains("no-reply")
        || from_lower.contains("notification")
        || subject_lower.contains("alert")
    {
        return "notifications".to_string();
    }
    if from_lower.contains("newsletter")
        || subject_lower.contains("newsletter")
        || subject_lower.contains("digest")
        || subject_lower.contains("weekly update")
    {
        return "newsletters".to_string();
    }
    if let (Some(domain), Some(sender_address)) = (account_domain, extract_sender_address(from)) {
        if let Some(sender_domain) = domain_for_address(&sender_address) {
            if sender_domain.eq_ignore_ascii_case(domain) {
                return "personal".to_string();
            }
        }
    }
    "low_priority".to_string()
}

fn extract_sender_address(sender: &str) -> Option<String> {
    let trimmed = sender.trim();
    if let Some(start) = trimmed.rfind('<') {
        if let Some(end) = trimmed.rfind('>') {
            if end > start {
                let address = trimmed[start + 1..end].trim();
                if address.contains('@') {
                    return Some(address.to_string());
                }
            }
        }
    }
    let token = trimmed.split_whitespace().find(|value| value.contains('@'))?;
    Some(
        token
            .trim_matches(|c| matches!(c, '<' | '>' | '"' | '\''))
            .to_string(),
    )
}

fn domain_for_address(address: &str) -> Option<&str> {
    address.split('@').nth(1).map(|value| value.trim())
}

fn parse_timestamp(date: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(date)
        .map(|dt| dt.timestamp_millis())
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(date).map(|dt| dt.timestamp_millis()))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_heuristics_assigns_expected_categories() {
        assert_eq!(
            classify_heuristics("Urgent: please review", "boss@example.com", None),
            "important"
        );
        assert_eq!(
            classify_heuristics("Status update", "noreply@service.com", None),
            "notifications"
        );
        assert_eq!(
            classify_heuristics("Weekly Update", "newsletter@service.com", None),
            "newsletters"
        );
        assert_eq!(
            classify_heuristics(
                "Lunch plans",
                "Teammate <teammate@company.com>",
                Some("company.com")
            ),
            "personal"
        );
        assert_eq!(
            classify_heuristics("Hello", "someone@other.com", Some("company.com")),
            "low_priority"
        );
    }

    #[test]
    fn resolve_category_respects_overrides_and_sender_rules() {
        let mut overrides = HashMap::new();
        overrides.insert("email-1".to_string(), "newsletters".to_string());
        let rules = vec![SmartInboxRule {
            field: "sender".to_string(),
            value: "ALERTS@EXAMPLE.COM".to_string(),
            category: "notifications".to_string(),
        }];

        assert_eq!(
            resolve_category(
                "email-1",
                "Urgent: please read",
                "alerts@example.com",
                None,
                &overrides,
                &rules
            ),
            "newsletters"
        );
        assert_eq!(
            resolve_category(
                "email-2",
                "Monthly summary",
                "Alerts <alerts@example.com>",
                None,
                &overrides,
                &rules
            ),
            "notifications"
        );
    }

    #[test]
    fn build_groups_tracks_unread_and_latest() {
        let emails = vec![
            ClassifiedEmail {
                id: "1".to_string(),
                uid: "uid1".to_string(),
                folder_id: "folder".to_string(),
                subject: "Subject".to_string(),
                from: "sender@example.com".to_string(),
                date: "2024-01-01T10:00:00Z".to_string(),
                flags: vec![],
                category: "important".to_string(),
                timestamp: 10,
            },
            ClassifiedEmail {
                id: "2".to_string(),
                uid: "uid2".to_string(),
                folder_id: "folder".to_string(),
                subject: "Subject".to_string(),
                from: "sender@example.com".to_string(),
                date: "2024-01-02T10:00:00Z".to_string(),
                flags: vec!["\\Seen".to_string()],
                category: "important".to_string(),
                timestamp: 20,
            },
            ClassifiedEmail {
                id: "3".to_string(),
                uid: "uid3".to_string(),
                folder_id: "folder".to_string(),
                subject: "Subject".to_string(),
                from: "sender@example.com".to_string(),
                date: "2024-01-03T10:00:00Z".to_string(),
                flags: vec![],
                category: "notifications".to_string(),
                timestamp: 30,
            },
        ];

        let groups = build_groups(&emails);
        let important = groups.iter().find(|group| group.id == "important").unwrap();
        assert_eq!(important.unread_count, 1);
        assert_eq!(important.latest_at, "2024-01-02T10:00:00Z");

        let notifications = groups
            .iter()
            .find(|group| group.id == "notifications")
            .unwrap();
        assert_eq!(notifications.unread_count, 1);
        assert_eq!(notifications.latest_at, "2024-01-03T10:00:00Z");

        let newsletters = groups
            .iter()
            .find(|group| group.id == "newsletters")
            .unwrap();
        assert_eq!(newsletters.unread_count, 0);
        assert_eq!(newsletters.latest_at, "");
    }

    #[test]
    fn extract_sender_address_and_domain_handle_edge_cases() {
        assert_eq!(
            extract_sender_address("Jane Doe <jane@example.com>"),
            Some("jane@example.com".to_string())
        );
        assert_eq!(
            extract_sender_address("jane@example.com (Jane)"),
            Some("jane@example.com".to_string())
        );
        assert_eq!(extract_sender_address("No Address"), None);
        assert_eq!(extract_sender_address("Name <invalid>"), None);

        assert_eq!(domain_for_address("user@Example.Com "), Some("Example.Com"));
        assert_eq!(domain_for_address("invalid"), None);
    }
}
