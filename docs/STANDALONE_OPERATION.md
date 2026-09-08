# Standalone operation

EchoWalk is designed to remain usable without a network connection after its application dependencies are installed.

## Runtime behavior

- Sonar controls and locally generated feedback do not require a remote service.
- Moving the app to the background pauses active sonar work; returning to the foreground resumes only a session that was previously running.
- Device permissions are requested by the application and remain under operating-system control.

## Validation

Run `npm run check` before packaging. This executes the project doctor, TypeScript checks, Expo configuration validation, and the Android export smoke test.
