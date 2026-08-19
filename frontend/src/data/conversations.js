// Mock chat data. There is no messaging backend yet, so the chat UI renders
// this in order to be buildable and reviewable. Message text goes through i18n
// keys (`chatMessage.<conversationId>.<messageId>`) exactly like apartment
// titles do, so the demo content translates with the rest of the app.
// Participant names are proper nouns and stay as they are.
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const minutesAgo = (n) => new Date(Date.now() - n * MINUTE_MS).toISOString()
const hoursAgo = (n) => new Date(Date.now() - n * HOUR_MS).toISOString()
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString()

// `from: 'them'` is the other participant, `'me'` is the signed-in user.
// `apartmentId` links the conversation to a listing; it may be null.
export const CONVERSATIONS = [
  {
    id: 'c1',
    name: 'Dilnoza Karimova',
    isOnline: true,
    apartmentId: 1,
    unreadCount: 2,
    messages: [
      { id: 1, from: 'them', sentAt: hoursAgo(4) },
      { id: 2, from: 'me', sentAt: hoursAgo(3) },
      { id: 3, from: 'them', sentAt: minutesAgo(24) },
      { id: 4, from: 'them', sentAt: minutesAgo(19) },
    ],
  },
  {
    id: 'c2',
    name: 'Jasur Rahimov',
    isOnline: false,
    apartmentId: 3,
    unreadCount: 1,
    messages: [
      { id: 1, from: 'me', sentAt: hoursAgo(7) },
      { id: 2, from: 'them', sentAt: hoursAgo(5) },
    ],
  },
  {
    id: 'c3',
    name: 'Malika Yusupova',
    isOnline: true,
    apartmentId: 5,
    unreadCount: 0,
    messages: [
      { id: 1, from: 'them', sentAt: daysAgo(1) },
      { id: 2, from: 'me', sentAt: daysAgo(1) },
      { id: 3, from: 'them', sentAt: daysAgo(1) },
    ],
  },
  {
    id: 'c4',
    name: 'Bekzod Tursunov',
    isOnline: false,
    apartmentId: 7,
    unreadCount: 0,
    messages: [
      { id: 1, from: 'me', sentAt: daysAgo(2) },
      { id: 2, from: 'them', sentAt: daysAgo(2) },
    ],
  },
  {
    id: 'c5',
    name: 'Nodira Ergasheva',
    isOnline: false,
    apartmentId: 2,
    unreadCount: 0,
    messages: [
      { id: 1, from: 'them', sentAt: daysAgo(4) },
      { id: 2, from: 'me', sentAt: daysAgo(4) },
    ],
  },
  {
    id: 'c6',
    name: 'Sardor Aliyev',
    isOnline: true,
    apartmentId: 9,
    unreadCount: 0,
    messages: [
      { id: 1, from: 'them', sentAt: daysAgo(6) },
      { id: 2, from: 'me', sentAt: daysAgo(6) },
    ],
  },
]

// Locally sent messages carry their text directly; seeded ones carry a key.
export function messageTextKey(conversationId, messageId) {
  return `chatMessage.${conversationId}.${messageId}`
}

export function getLastMessage(conversation) {
  return conversation.messages[conversation.messages.length - 1] ?? null
}
