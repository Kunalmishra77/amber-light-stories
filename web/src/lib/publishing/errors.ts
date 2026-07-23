/**
 * Publishing error types, deliberately in their own dependency-free module.
 *
 * The job handler classifies a failure as retryable or terminal with
 * `instanceof`. It previously reached these classes through a dynamic
 * `import()` of the OAuth module inside its own catch block — and that module
 * pulls in `googleapis` and `next/headers`. If the import failed, the import
 * error REPLACED the real one, turning "no channel connected" (an operator
 * condition that must dead-letter) into a generic retryable failure that burned
 * the retry budget and never reached an incident.
 *
 * Keeping the types here means the handler can import them statically and cheaply.
 */

/** The platform has no Google OAuth client configured — an owner action. */
export class OAuthNotConfiguredError extends Error {
  constructor() {
    super(
      "YouTube connection isn't configured on this platform yet. " +
        "An administrator must set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
    );
    this.name = "OAuthNotConfiguredError";
  }
}

/** The tenant's YouTube authorization is missing, expired or was revoked. */
export class YouTubeAuthError extends Error {
  readonly needsReconnect: boolean;
  constructor(message: string, needsReconnect = true) {
    super(message);
    this.name = "YouTubeAuthError";
    this.needsReconnect = needsReconnect;
  }
}

/** Nothing has been rendered for this run, so there is nothing to upload. */
export class RenderedVideoMissingError extends Error {
  constructor(runId: string) {
    super(
      `No rendered video found for this run (${runId.slice(0, 8)}). ` +
        "Rendering must complete before the video can be published."
    );
    this.name = "RenderedVideoMissingError";
  }
}

/** An upload failure. `retryable=false` means retrying reproduces it exactly. */
export class YouTubeUploadError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "YouTubeUploadError";
    this.retryable = retryable;
  }
}
