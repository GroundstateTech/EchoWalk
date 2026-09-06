# EchoWalk

**EchoWalk is a phone-first acoustic sonar accessibility research prototype by Groundstate Technology LLC.**

The Android prototype repeatedly emits a short high-frequency chirp from the phone speaker, records returning sound with the phone microphone, looks for a correlated echo, estimates candidate distance, and increases haptic feedback as an obstacle appears closer. The rear camera remains visible as a secondary visual aid; it is not used to fabricate distance measurements.

## Prototype scope

Version 0.2 deliberately stays small:

- one screen
- automatic repeating acoustic sonar
- phone speaker + phone microphone only
- candidate distance in meters when a sufficiently confident echo is found
- escalating haptic proximity warnings
- rear-camera preview as an optional visual aid
- one **Start / Stop Sonar** control

LiDAR, BLE sensors, external ultrasonic hardware, maps, profiles, accounts, and cloud services are intentionally out of scope for this prototype.

> **Safety:** EchoWalk is experimental software. It is not a certified mobility or medical device and must not replace a cane, guide dog, trained human assistance, or established orientation-and-mobility techniques.

## Requirements

- Node.js + npm
- Android Studio
- Android SDK + Platform Tools (`adb`)
- physical Android phone with USB debugging enabled

The native sonar module cannot run in Expo Go. Build the Android development app.

## Install

```powershell
npm install
npx expo-doctor
```

Do **not** run `npm audit fix --force` on this project. React Native and Expo packages are version-coupled; forcing npm audit upgrades can replace Expo or React Native with incompatible versions.

## Build and run

```powershell
npx expo prebuild --clean
adb devices
npx expo run:android
```

After the first native build, JavaScript-only changes can usually be served with:

```powershell
npx expo start --dev-client -c
```

Changes to `modules/echowalk-sonar/android/...` require rebuilding with `npx expo run:android`.

## Using the prototype

1. Open EchoWalk.
2. Allow camera and microphone permissions.
3. Sonar begins automatically.
4. Keep the phone speaker and microphone uncovered.
5. Point/hold the phone in the direction of travel.
6. As candidate echo distance decreases, haptics become more urgent.
7. Tap **STOP SONAR** to pause acoustic measurements.

The screen intentionally shows **NO READING** when the acoustic result is weak. The app does not substitute a fake camera-derived meter value.

## How the acoustic measurement works

The Android native module generates an approximately 17–20 kHz swept chirp, records a short PCM window, performs normalized correlation against the transmitted chirp, rejects the immediate speaker-to-microphone path, calculates candidate range from echo delay, and returns distance plus a confidence score to React Native.

Phone audio hardware introduces speaker latency, microphone latency, echo cancellation, filtering, frequency-response differences, and device-specific signal paths. Reliable accessibility use will require calibration and substantial real-world validation.

## Near-term priorities

Signal quality comes before new features: per-device latency calibration, stronger direct-path rejection, multi-peak analysis, confidence validation, phone-model testing, handling Android acoustic echo cancellation, and user testing with blind/low-vision accessibility specialists.

## Documentation

See the [documentation index](docs/README.md) for project governance, brand policy, support information, and standalone-operation notes.

## Ownership and license

Copyright © 2026 Groundstate Technology LLC. EchoWalk is released under the Apache License 2.0 so people can use, study, modify, and redistribute it while retaining clear project ownership and attribution. See `LICENSE` and `NOTICE`.

## Standalone-first deployment

This project does not require Groundstate Admin Center or a Groundstate account. Core operation remains local and independently deployable. See [Standalone operation](docs/governance/STANDALONE_OPERATION.md) for the product-specific identity and outage boundary.
