export type ChatUser = { id: string; name: string; role: string; avatarUrl: string | null; avatarColor: string };

export type PresenceUser = ChatUser & {
  status: "ONLINE" | "BUSY" | "AWAY" | "DND" | "MEETING" | "OFFLINE";
  statusNote: string | null;
  device: string | null;
  lastActiveAt: string;
  isTyping: boolean;
};

export type ConversationSummary = {
  id: string;
  type: "TEAM" | "GROUP" | "DM";
  name: string | null;
  memberCount: number;
  members: ChatUser[];
  favorited: boolean;
  muted: boolean;
  lastMessage: { id: string; body: string; createdAt: string; senderId: string; senderName: string } | null;
  unreadCount: number;
  typingUserNames: string[];
};

export type ChatMessageReaction = { id: string; emoji: string; userId: string; user: { id: string; name: string } };

export type ChatMessageData = {
  id: string;
  conversationId: string;
  senderId: string;
  sender: ChatUser;
  body: string;
  bookingRef: string | null;
  replyToId: string | null;
  replyTo: { id: string; body: string; deletedAt: string | null; sender: { name: string } } | null;
  imageUrl: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  pinned: boolean;
  createdAt: string;
  reactions: ChatMessageReaction[];
};

export type BookingCardData = {
  id: string;
  confirmationNumber: string;
  guest: string;
  unit: string;
  unitNumber: string;
  checkIn: string;
  checkOut: string | null;
  stayType: string;
  platform: string;
  status: string;
  total: number;
};

export type AnnouncementData = {
  id: string;
  body: string;
  category: "ANNOUNCEMENT" | "URGENT" | "MAINTENANCE" | "POLICY";
  createdAt: string;
  createdBy: { id: string; name: string };
};
