import * as React from "react";
import {
  AppState,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera, CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";

import EchoWalkSonar, {
  type SonarReading,
} from "./modules/echowalk-sonar";

type ProximityState = "no-reading" | "clear" | "near" | "very-close";

const LOOP_MS = 420;
const CONFIDENCE_REQUIRED = 0.12;
const VERY_CLOSE_METERS = 0.5;
const NEAR_METERS = 1.15;
const CLEAR_METERS = 1.9;

export default function App() {
  const [permissionsReady, setPermissionsReady] = React.useState(false);
  const [cameraAllowed, setCameraAllowed] = React.useState(false);
  const [microphoneAllowed, setMicrophoneAllowed] = React.useState(false);
  const [running, setRunning] = React.useState(true);
  const [reading, setReading] = React.useState<SonarReading | null>(null);
  const [proximity, setProximity] = React.useState<ProximityState>("no-reading");
  const [message, setMessage] = React.useState("Starting EchoWalk…");

  const busyRef = React.useRef(false);
  const lastHapticRef = React.useRef(0);
  const resumeAfterBackgroundRef = React.useRef(false);

  const requestPermissions = React.useCallback(async () => {
    try {
      const camera = await Camera.requestCameraPermissionsAsync();
      setCameraAllowed(camera.granted);

      let micGranted = Platform.OS !== "android";
      if (Platform.OS === "android") {
        const mic = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "EchoWalk microphone access",
            message:
              "EchoWalk listens for echoes from its sonar pulse to estimate nearby obstacles.",
            buttonPositive: "Allow",
          },
        );
        micGranted = mic === PermissionsAndroid.RESULTS.GRANTED;
      }

      setMicrophoneAllowed(micGranted);
      setPermissionsReady(true);

      if (Platform.OS !== "android") {
        setRunning(false);
        setMessage("Acoustic ranging is currently available on Android only.");
      } else if (!micGranted) {
        setRunning(false);
        setMessage("Microphone permission is required for sonar.");
      } else if (!EchoWalkSonar) {
        setRunning(false);
        setMessage("Native sonar is not installed. Build the Android development app.");
      } else {
        setMessage("Sonar active");
      }
    } catch {
      setPermissionsReady(true);
      setRunning(false);
      setMessage("Could not initialize EchoWalk permissions.");
    }
  }, []);

  React.useEffect(() => {
    void requestPermissions();
  }, [requestPermissions]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (resumeAfterBackgroundRef.current && microphoneAllowed && EchoWalkSonar) {
          resumeAfterBackgroundRef.current = false;
          setRunning(true);
          setMessage("Sonar active");
        }
        return;
      }
      setRunning((wasRunning) => {
        resumeAfterBackgroundRef.current = wasRunning;
        return false;
      });
      busyRef.current = false;
      setMessage("Sonar paused while EchoWalk is in the background");
    });
    return () => subscription.remove();
  }, [microphoneAllowed]);

  const triggerHaptic = React.useCallback(
    (style: "light" | "medium" | "heavy", minimumGapMs: number) => {
      const now = Date.now();
      if (now - lastHapticRef.current < minimumGapMs) return;
      lastHapticRef.current = now;

      const feedback =
        style === "heavy"
          ? Haptics.ImpactFeedbackStyle.Heavy
          : style === "medium"
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;

      void Haptics.impactAsync(feedback);
    },
    [],
  );

  const applyReading = React.useCallback(
    (next: SonarReading) => {
      const meters = next.distanceMeters;
      if (
        meters == null ||
        !Number.isFinite(meters) ||
        next.confidence < CONFIDENCE_REQUIRED
      ) {
        setProximity("no-reading");
        setMessage("Listening for a clean echo…");
        return;
      }

      if (meters <= VERY_CLOSE_METERS) {
        setProximity("very-close");
        setMessage("VERY CLOSE");
        triggerHaptic("heavy", 260);
      } else if (meters <= NEAR_METERS) {
        setProximity("near");
        setMessage("Object nearby");
        triggerHaptic("medium", 420);
      } else {
        setProximity("clear");
        setMessage(meters <= CLEAR_METERS ? "Object ahead" : "Path appears open");
        if (meters <= CLEAR_METERS) triggerHaptic("light", 800);
      }
    },
    [triggerHaptic],
  );

  React.useEffect(() => {
    const sonar = EchoWalkSonar;
    if (
      Platform.OS !== "android" ||
      !permissionsReady ||
      !microphoneAllowed ||
      !running ||
      !sonar
    ) {
      return;
    }

    let cancelled = false;

    const sample = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;

      try {
        const next = await sonar.pingAndMeasure();
        if (cancelled) return;
        setReading(next);
        applyReading(next);
      } catch {
        if (!cancelled) {
          setReading(null);
          setProximity("no-reading");
          setMessage("No reliable echo");
        }
      } finally {
        busyRef.current = false;
      }
    };

    void sample();
    const timer = setInterval(() => void sample(), LOOP_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyReading, microphoneAllowed, permissionsReady, running]);

  const toggleRunning = () => {
    if (Platform.OS !== "android" || !microphoneAllowed || !EchoWalkSonar) {
      void requestPermissions();
      return;
    }

    setRunning((value) => {
      const next = !value;
      setMessage(next ? "Sonar active" : "Sonar paused");
      return next;
    });
  };

  const meters =
    reading?.distanceMeters != null && reading.confidence >= CONFIDENCE_REQUIRED
      ? reading.distanceMeters
      : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {cameraAllowed ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.cameraFallback]} />
      )}
      <View style={styles.scrim} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.topBar}>
          <Text accessibilityRole="header" style={styles.brand}>
            EchoWalk
          </Text>
          <View style={[styles.dot, running ? styles.dotOn : styles.dotOff]} />
        </View>

        <View style={styles.centerPanel}>
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="text"
            accessible
            accessibilityLabel={
              meters == null
                ? `No reliable sonar reading. ${message}`
                : `${meters.toFixed(2)} meters. ${message}`
            }
            style={[
              styles.rangeRing,
              proximity === "very-close" && styles.rangeRingDanger,
              proximity === "near" && styles.rangeRingNear,
            ]}
          >
            <Text style={styles.distance}>{meters == null ? "—" : meters.toFixed(2)}</Text>
            <Text style={styles.unit}>{meters == null ? "NO READING" : "METERS"}</Text>
          </View>

          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.message,
              proximity === "very-close" && styles.messageDanger,
            ]}
          >
            {message}
          </Text>

          <Text style={styles.confidence}>
            {reading
              ? `Echo confidence ${Math.round(reading.confidence * 100)}%`
              : "Phone speaker + microphone sonar"}
          </Text>
        </View>

        <View style={styles.bottomPanel}>
          <Text style={styles.help}>
            Keep the speaker and microphone uncovered. The camera is an optional visual aid; distance comes from acoustic echoes.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? "Stop EchoWalk sonar" : "Start EchoWalk sonar"}
            accessibilityHint="Starts or pauses the repeating acoustic sonar pulse"
            onPress={toggleRunning}
            style={({ pressed }) => [
              styles.button,
              running ? styles.stopButton : styles.startButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>{running ? "STOP SONAR" : "START SONAR"}</Text>
          </Pressable>

          <Text style={styles.prototypeNotice}>
            Research prototype — do not use as a replacement for a cane, guide dog, or certified mobility aid.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#020507" },
  cameraFallback: { backgroundColor: "#071014" },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 8, 12, 0.64)",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  brand: { color: "white", fontSize: 27, fontWeight: "800", letterSpacing: 1.2 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  dotOn: { backgroundColor: "#66f2b7" },
  dotOff: { backgroundColor: "#8a969d" },
  centerPanel: { flex: 1, alignItems: "center", justifyContent: "center" },
  rangeRing: {
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 4,
    borderColor: "#66f2b7",
    backgroundColor: "rgba(3, 18, 22, 0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeRingNear: { borderColor: "#ffd166", borderWidth: 7 },
  rangeRingDanger: { borderColor: "#ff6767", borderWidth: 10 },
  distance: {
    color: "white",
    fontSize: 64,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  unit: { color: "#b8c4c9", fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  message: {
    marginTop: 24,
    color: "white",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
  },
  messageDanger: { fontSize: 30, fontWeight: "900" },
  confidence: { marginTop: 8, color: "#aab7bc", fontSize: 13 },
  bottomPanel: { gap: 14 },
  help: { color: "#d4dde1", fontSize: 14, lineHeight: 20, textAlign: "center" },
  button: {
    minHeight: 62,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: { backgroundColor: "#157f63" },
  stopButton: { backgroundColor: "#9b3f45" },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: "white", fontSize: 18, fontWeight: "900", letterSpacing: 1.3 },
  prototypeNotice: {
    color: "#a8b2b6",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
