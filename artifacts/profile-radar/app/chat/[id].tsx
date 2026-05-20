import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Image,
  Alert,
  Platform,
  Dimensions,
  ActionSheetIOS,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useApp, Message, NearbyUser } from "@/contexts/AppContext";
import { resolvePhotoUri, API_BASE } from "@/lib/api";

const { width } = Dimensions.get("window");
const MAX_BUBBLE_WIDTH = width * 0.72;

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function MessageBubble({
  msg,
  isMe,
  user,
  showAvatar,
}: {
  msg: Message;
  isMe: boolean;
  user: NearbyUser | undefined;
  showAvatar: boolean;
}) {
  const coverPhoto = user?.photos.find((p) => !p.isLocked);
  const fallbackColors = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];
  const fallbackColor = user
    ? fallbackColors[user.name.charCodeAt(0) % fallbackColors.length]
    : Colors.accent;

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
      {!isMe && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            coverPhoto ? (
              <Image source={{ uri: resolvePhotoUri(coverPhoto.uri) }} style={styles.msgAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.msgAvatar, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
                <Text style={styles.msgAvatarLetter}>{user?.name[0] ?? "?"}</Text>
              </View>
            )
          ) : (
            <View style={styles.msgAvatarSpace} />
          )}
        </View>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {msg.text}
        </Text>
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
          {timeLabel(msg.timestamp)}
        </Text>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const {
    myProfile, isSetup, getUserById, getMessages, sendMessage, markRead,
    blockUser, unblockUser, isBlocked,
    addToHotStuff, removeFromHotStuff, isHotStuff,
    archiveConversation, deleteConversation, setActivePeer,
    requestUnlock, hasUnlocked, canSeeLockedPhotos,
  } = useApp();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const user = getUserById(id);
  const messages = getMessages(id);
  const blocked = isBlocked(id);
  const isHot = isHotStuff(id);

  useEffect(() => {
    setActivePeer(id);
    markRead(id);
    return () => setActivePeer(null);
  }, [id]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || blocked) return;
    setText("");
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendMessage(id, trimmed);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, sending, blocked, id]);

  const handleSuggestReply = useCallback(async () => {
    if (suggesting || blocked || !isSetup) return;
    setSuggesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = {
        messages: messages.map((m) => ({
          sender: m.senderId === myProfile?.id ? "me" : "them",
          text: m.text,
        })),
        peerName: user?.name,
        myName: myProfile?.name,
        peerProfile: {
          lookingFor: user?.lookingFor,
          position: (user as any)?.position,
          age: user?.age,
        },
      };
      const res = await fetch(`${API_BASE}/api/ai/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      const { suggestion } = await res.json();
      if (suggestion) {
        setText(suggestion);
        inputRef.current?.focus();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSuggesting(false);
    }
  }, [suggesting, blocked, isSetup, messages, myProfile, user, id]);

  const hotStuffLabel = isHot ? "Remove from Hot Stuff" : "Add to Hot Stuff";
  const blockLabel = blocked ? "Unblock User" : "Block User";

  function handleMorePress() {
    Haptics.selectionAsync();
    if (Platform.OS === "ios") {
      const options = ["Cancel", hotStuffLabel, "Archive", blockLabel, "Delete"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: 4,
          cancelButtonIndex: 0,
          title: user?.name ?? "User",
        },
        (i) => {
          if (i === 1) toggleHotStuff();
          else if (i === 2) confirmArchive();
          else if (i === 3) (blocked ? confirmUnblock() : confirmBlock());
          else if (i === 4) confirmDelete();
        }
      );
    } else {
      Alert.alert(user?.name ?? "User", "Choose an action", [
        { text: hotStuffLabel, onPress: toggleHotStuff },
        { text: "Archive", onPress: confirmArchive },
        blocked
          ? { text: "Unblock User", onPress: confirmUnblock }
          : { text: "Block User", style: "destructive", onPress: confirmBlock },
        { text: "Delete", style: "destructive", onPress: confirmDelete },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  async function toggleHotStuff() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (isHot) {
      await removeFromHotStuff(id);
    } else {
      await addToHotStuff(id);
    }
  }

  function confirmArchive() {
    Alert.alert(
      "Archive Conversation",
      `Hide your conversation with ${user?.name ?? "this user"} from your messages list? You can find it again by searching or visiting their profile.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await archiveConversation(id);
            router.back();
          },
        },
      ]
    );
  }

  function confirmDelete() {
    Alert.alert(
      "Delete Conversation",
      `Permanently delete your conversation with ${user?.name ?? "this user"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteConversation(id);
            router.back();
          },
        },
      ]
    );
  }

  function confirmBlock() {
    Alert.alert(
      "Block User",
      `Are you sure you want to block ${user?.name ?? "this user"}? They won't be able to message you.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await blockUser(id);
            router.back();
          },
        },
      ]
    );
  }

  function confirmUnblock() {
    Alert.alert(
      "Unblock User",
      `Unblock ${user?.name ?? "this user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            await unblockUser(id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  const lockedPhotoCount = user?.photos.filter((p) => p.isLocked).length ?? 0;
  const alreadyRequested = hasUnlocked(id);
  const photosUnlocked = canSeeLockedPhotos(id);

  async function handleRequestUnlock() {
    if (requesting || alreadyRequested) return;
    setRequesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await requestUnlock(id);
    } finally {
      setRequesting(false);
    }
  }

  const topInset = insets.top + (Platform.OS === "web" ? 67 : 0);
  const coverPhoto = user?.photos.find((p) => !p.isLocked);
  const fallbackColors = ["#FF7A00", "#6C5CE7", "#00B4D8", "#06D6A0", "#FFB703", "#FB8500"];
  const fallbackColor = user
    ? fallbackColors[user.name.charCodeAt(0) % fallbackColors.length]
    : Colors.accent;

  const reversedMessages = [...messages].reverse();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>

        <Pressable
          style={styles.headerUser}
          onPress={() => router.push({ pathname: "/user/[id]", params: { id } })}
        >
          {coverPhoto ? (
            <Image source={{ uri: resolvePhotoUri(coverPhoto.uri) }} style={styles.headerAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.headerAvatar, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
              <Text style={styles.headerAvatarLetter}>{user?.name[0] ?? "?"}</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>{user?.name ?? "Unknown"}</Text>
              {isHot && <Ionicons name="flame" size={15} color={Colors.accent} />}
            </View>
            <View style={styles.headerStatusRow}>
              <View style={[styles.statusDot, user?.isOnline && styles.statusDotOnline]} />
              <Text style={styles.headerStatus}>{user?.isOnline ? "Online" : `${user?.distanceMiles ?? "?"} mi away`}</Text>
            </View>
          </View>
        </Pressable>

        <Pressable style={styles.moreBtn} onPress={handleMorePress}>
          <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {blocked ? (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban" size={16} color={Colors.danger} />
          <Text style={styles.blockedText}>You have blocked this user</Text>
        </View>
      ) : null}

      {/* Private photo unlock bar */}
      {!blocked && lockedPhotoCount > 0 && (
        photosUnlocked ? (
          <View style={styles.unlockedBanner}>
            <Ionicons name="lock-open" size={15} color={Colors.online} />
            <Text style={styles.unlockedBannerText}>
              Private photos unlocked — tap their profile to view
            </Text>
          </View>
        ) : alreadyRequested ? (
          <View style={styles.unlockPending}>
            <Ionicons name="time-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.unlockPendingText}>
              Unlock request sent · waiting for {user?.name ?? "them"}
            </Text>
          </View>
        ) : (
          <Pressable style={styles.unlockBar} onPress={handleRequestUnlock} disabled={requesting}>
            <View style={styles.unlockBarLeft}>
              <Ionicons name="lock-closed" size={15} color={Colors.accent} />
              <Text style={styles.unlockBarText}>
                {lockedPhotoCount} private photo{lockedPhotoCount !== 1 ? "s" : ""} · Request access
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={Colors.accent} />
          </Pressable>
        )
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            {coverPhoto ? (
              <Image source={{ uri: resolvePhotoUri(coverPhoto.uri) }} style={styles.emptyChatAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.emptyChatAvatar, { backgroundColor: fallbackColor, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ fontSize: 36, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>{user?.name[0] ?? "?"}</Text>
              </View>
            )}
            <Text style={styles.emptyChatName}>{user?.name ?? "Unknown"}</Text>
            <Text style={styles.emptyChatSub}>
              {user?.distanceMiles ?? "?"} mi away · {user?.lookingFor ?? ""}
            </Text>
            <Text style={styles.emptyChatHint}>Send a message to start the conversation</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={reversedMessages}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isMe = item.senderId === myProfile?.id;
              const nextMsg = reversedMessages[index - 1];
              const showAvatar = !isMe && (!nextMsg || nextMsg.senderId === myProfile?.id || nextMsg.senderId !== item.senderId);
              return (
                <MessageBubble
                  msg={item}
                  isMe={isMe}
                  user={user}
                  showAvatar={showAvatar}
                />
              );
            }}
          />
        )}

        {/* Input bar */}
        {!isSetup ? (
          <View style={[styles.guestBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 12) }]}>
            <View style={styles.guestBarTextWrap}>
              <Text style={styles.guestBarTitle}>Create a profile to message</Text>
              <Text style={styles.guestBarSub}>You're browsing as a guest. Set up your profile to start chatting.</Text>
            </View>
            <Pressable
              style={styles.guestBarBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/setup");
              }}
            >
              <Text style={styles.guestBarBtnText}>Create</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={blocked ? "You blocked this user" : "Message..."}
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              editable={!blocked}
              returnKeyType="default"
              onSubmitEditing={Platform.OS === "web" ? handleSend : undefined}
            />
            <Pressable
              style={[styles.suggestBtn, (blocked || suggesting) && styles.suggestBtnDisabled]}
              onPress={handleSuggestReply}
              disabled={blocked || suggesting}
            >
              <Ionicons
                name={suggesting ? "hourglass-outline" : "sparkles"}
                size={18}
                color={!blocked ? Colors.accent : Colors.textMuted}
              />
            </Pressable>
            <Pressable
              style={[styles.sendBtn, (!text.trim() || blocked) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || blocked || sending}
            >
              <Ionicons name="send" size={18} color={text.trim() && !blocked ? "#fff" : Colors.textMuted} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.bg, gap: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  headerUser: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarLetter: { fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  headerInfo: { flex: 1 },
  headerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerName: { fontSize: 16, fontWeight: "600", color: Colors.text, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  headerStatusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.textMuted },
  statusDotOnline: { backgroundColor: Colors.online },
  headerStatus: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  moreBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  blockedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,68,68,0.1)", paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,68,68,0.2)",
  },
  blockedText: { fontSize: 13, color: Colors.danger, fontFamily: "Inter_500Medium" },

  unlockBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: "rgba(255,122,0,0.08)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,122,0,0.18)",
  },
  unlockBarLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  unlockBarText: { fontSize: 13, color: Colors.accent, fontFamily: "Inter_500Medium" },

  unlockPending: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  unlockPendingText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },

  unlockedBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 11,
    backgroundColor: "rgba(6,214,160,0.08)",
    borderBottomWidth: 1, borderBottomColor: "rgba(6,214,160,0.2)",
  },
  unlockedBannerText: { fontSize: 13, color: Colors.online, fontFamily: "Inter_500Medium" },

  emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 40 },
  emptyChatAvatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 4 },
  emptyChatName: { fontSize: 22, fontWeight: "700", color: Colors.text, fontFamily: "Inter_700Bold" },
  emptyChatSub: { fontSize: 14, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  emptyChatHint: { fontSize: 13, color: Colors.textMuted, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },

  messageList: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },

  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginVertical: 2 },
  bubbleRowMe: { justifyContent: "flex-end" },
  bubbleRowThem: { justifyContent: "flex-start", gap: 8 },
  avatarSlot: { width: 32 },
  msgAvatar: { width: 30, height: 30, borderRadius: 15 },
  msgAvatarLetter: { fontSize: 12, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" },
  msgAvatarSpace: { width: 30, height: 30 },

  bubble: {
    maxWidth: MAX_BUBBLE_WIDTH, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: Colors.bgCardLight,
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21, fontFamily: "Inter_400Regular" },
  bubbleTextMe: { color: "#fff" },
  bubbleTextThem: { color: Colors.text },
  bubbleTime: { fontSize: 10, marginTop: 3, fontFamily: "Inter_400Regular" },
  bubbleTimeMe: { color: "rgba(255,255,255,0.65)", textAlign: "right" },
  bubbleTimeThem: { color: Colors.textMuted },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    backgroundColor: Colors.bgCard, borderRadius: 21,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.text, fontFamily: "Inter_400Regular",
    borderWidth: 1, borderColor: Colors.border,
  },
  suggestBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,122,0,0.12)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,122,0,0.25)",
  },
  suggestBtnDisabled: { opacity: 0.4 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: Colors.bgCard },

  guestBar: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  guestBarTextWrap: { flex: 1 },
  guestBarTitle: {
    fontSize: 14, fontWeight: "600", color: Colors.text,
    fontFamily: "Inter_600SemiBold", marginBottom: 2,
  },
  guestBarSub: {
    fontSize: 12, color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  guestBarBtn: {
    paddingHorizontal: 18, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
  },
  guestBarBtnText: {
    fontSize: 14, fontWeight: "600", color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
});
