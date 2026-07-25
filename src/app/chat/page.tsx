import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ensureDefaultConversations, listConversationsForUser } from "@/lib/chat/service";
import { ChatView } from "@/components/chat/ChatView";

// Every staff role gets chat (Bookers, Housekeeping, Auditors, Admins,
// Co-owners) — there's no role this app excludes from internal team
// communication the way e.g. the financial Dashboard is Owner/Co-owner
// only. Guests never reach this route at all (separate session system,
// no User row).
export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureDefaultConversations();
  const conversations = await listConversationsForUser(user.id);

  return (
    <ChatView
      currentUserId={user.id}
      isAdmin={user.role === "OWNER_ADMIN"}
      initialConversations={JSON.parse(JSON.stringify(conversations))}
    />
  );
}
