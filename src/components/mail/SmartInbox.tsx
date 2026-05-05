import React from "react";
import {
  SmartInboxCategory,
  SmartInboxGroup,
  SmartInboxOverrideReason,
  SmartInboxPriorityItem,
  SmartInboxSummary,
} from "../../hooks/useMailbox";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { formatDate } from "../../lib/utils";
import { Sparkles } from "lucide-react";

const CATEGORY_LABELS: Record<SmartInboxCategory, string> = {
  important: "重要",
  personal: "人际",
  notifications: "通知",
  newsletters: "订阅",
  low_priority: "低优先级",
};

interface SmartInboxProps {
  summary: SmartInboxSummary | null;
  groups: SmartInboxGroup[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOverride: (
    item: SmartInboxPriorityItem,
    category: SmartInboxCategory,
    reason: SmartInboxOverrideReason,
  ) => Promise<void>;
}

export const SmartInbox: React.FC<SmartInboxProps> = ({
  summary,
  groups,
  isLoading,
  error,
  onRefresh,
  onOverride,
}) => {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const groupList = groups.length > 0 ? groups : summary?.groups ?? [];
  const priorityItems = summary?.priority_items ?? [];
  const handleOverride = async (
    item: SmartInboxPriorityItem,
    category: SmartInboxCategory,
    reason: SmartInboxOverrideReason,
  ) => {
    setBusyId(item.id);
    try {
      await onOverride(item, category, reason);
    } catch (e) {
      console.error("Smart inbox override failed", e);
    } finally {
      setBusyId((prev) => (prev === item.id ? null : prev));
    }
  };

  return (
    <section
      className="h-full w-80 flex-shrink-0 flex flex-col border-r bg-nexus-background"
      data-testid="smart-inbox-view"
    >
      <header className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-nexus-accent" />
          <h2 className="text-sm font-semibold text-nexus-foreground">Smart Inbox</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          data-testid="smart-inbox-refresh"
          className="h-7 px-2 text-[11px]"
        >
          Refresh
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isLoading && (
          <div className="text-xs text-nexus-muted">Loading smart inbox...</div>
        )}
        {!isLoading && error && (
          <Card className="text-xs text-red-500" data-testid="smart-inbox-error">
            {error}
          </Card>
        )}

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-nexus-muted uppercase">Groups</h3>
          {groupList.length === 0 && !isLoading ? (
            <div className="text-xs text-nexus-muted">No smart inbox data yet.</div>
          ) : (
            groupList.map((group) => (
              <Card
                key={group.id}
                data-testid={`smart-inbox-group-${group.label}`}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div>
                  <div className="text-sm font-semibold text-nexus-foreground">
                    {CATEGORY_LABELS[group.label]}
                  </div>
                  <div className="text-[11px] text-nexus-muted">
                    {group.latest_at ? `最新：${formatDate(group.latest_at)}` : "暂无更新"}
                  </div>
                </div>
                <Badge
                  data-testid={`smart-inbox-group-unread-${group.label}`}
                  variant="primary"
                  className="min-w-[1.75rem] justify-center"
                >
                  {group.unread_count}
                </Badge>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-2" data-testid="smart-inbox-priority-list">
          <h3 className="text-xs font-semibold text-nexus-muted uppercase">Priority</h3>
          {priorityItems.length === 0 && !isLoading ? (
            <div className="text-xs text-nexus-muted">No priority messages.</div>
          ) : (
            priorityItems.map((item) => (
              <Card
                key={item.id}
                data-testid={`smart-inbox-item-${item.id}`}
                className="space-y-2 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-nexus-foreground truncate">
                      {item.subject || "(No Subject)"}
                    </div>
                    <div className="text-[11px] text-nexus-muted truncate">{item.from}</div>
                    <div className="text-[11px] text-nexus-muted">
                      {item.date ? formatDate(item.date) : ""}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    data-testid={`smart-inbox-item-category-${item.id}`}
                    className="capitalize"
                  >
                    {CATEGORY_LABELS[item.category]}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    data-testid={`smart-inbox-override-important-${item.id}`}
                    disabled={item.category === "important" || busyId === item.id}
                    onClick={() =>
                      handleOverride(item, "important", "user_mark_important")
                    }
                  >
                    标记重要
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    data-testid={`smart-inbox-override-unimportant-${item.id}`}
                    disabled={item.category === "low_priority" || busyId === item.id}
                    onClick={() =>
                      handleOverride(item, "low_priority", "user_mark_unimportant")
                    }
                  >
                    降低优先
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
