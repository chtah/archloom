// Types shared by every app. This package has no runtime of its own.
export type Reading = { deviceId: string; at: string; celsius: number };
export type BatchRef = { bucket: string; key: string; count: number };
