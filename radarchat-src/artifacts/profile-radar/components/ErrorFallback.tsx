import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="alert-circle" size={48} color={Colors.accent} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message} numberOfLines={4}>
        {error.message || "An unexpected error occurred."}
      </Text>
      <Pressable style={styles.button} onPress={resetError}>
        <Text style={styles.buttonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 320,
  },
  button: {
    marginTop: 16,
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
});
