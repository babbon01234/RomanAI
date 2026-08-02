import type {
  CanvasAssignment,
  CanvasCourse,
  CanvasFile,
  CanvasModule,
  CanvasSubmission,
} from "./types";

/**
 * A thin authenticated GET wrapper over the Canvas REST API. Read-only on
 * purpose: nothing in this phase writes back to Canvas.
 *
 * Auth is a static access token from the environment (Phase 2 scope — OAuth
 * and LTI are Phase 9). The token is only ever sent to the configured Canvas
 * host; see `download`, where a pre-signed URL can point somewhere else.
 */

export class CanvasError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CanvasError";
  }
}

export interface CanvasConfig {
  /** Origin only, no trailing slash: https://canvas.instructure.com */
  baseUrl: string;
  token: string;
}

/** Reads config from the environment, with the messages a teacher would need. */
export function canvasConfig(): CanvasConfig {
  const raw = process.env.CANVAS_BASE_URL?.trim();
  const token = process.env.CANVAS_ACCESS_TOKEN?.trim();

  if (!raw || !token) {
    throw new CanvasError(
      "Canvas isn't connected yet. Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN in .env.local.",
    );
  }

  // Accept "school.instructure.com" as readily as a full URL — a teacher
  // copying the domain out of their address bar shouldn't have to care.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CanvasError(`CANVAS_BASE_URL isn't a valid URL: ${raw}`);
  }

  return { baseUrl: url.origin, token };
}

export function isCanvasConfigured(): boolean {
  return Boolean(
    process.env.CANVAS_BASE_URL?.trim() && process.env.CANVAS_ACCESS_TOKEN?.trim(),
  );
}

/** Injectable so tests can drive the client without a network. */
export type Fetcher = typeof fetch;

export class CanvasClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: Fetcher;

  constructor(config: CanvasConfig, fetcher: Fetcher = fetch) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetcher = fetcher;
  }

  static fromEnv(fetcher: Fetcher = fetch): CanvasClient {
    return new CanvasClient(canvasConfig(), fetcher);
  }

  /** The host we're willing to send the access token to. */
  get host(): string {
    return new URL(this.baseUrl).host;
  }

  private url(path: string, query: Record<string, string | string[]> = {}): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      for (const one of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, one);
      }
    }
    return url.toString();
  }

  private async request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (error) {
      throw new CanvasError(
        `Couldn't reach Canvas at ${this.baseUrl}. ${
          error instanceof Error ? error.message : "Network error."
        }`,
      );
    }

    if (!response.ok) throw await describeFailure(response, this.baseUrl);
    return response;
  }

  async getJson<T>(
    path: string,
    query?: Record<string, string | string[]>,
  ): Promise<T> {
    const response = await this.request(this.url(path, query));
    return (await response.json()) as T;
  }

  /**
   * Canvas paginates list endpoints and advertises the next page in a Link
   * header rather than in the body. A sandbox course won't hit this, but a
   * real one with 60 files silently truncates at 10 without it.
   */
  async getAll<T>(
    path: string,
    query: Record<string, string | string[]> = {},
  ): Promise<T[]> {
    let url: string | null = this.url(path, { per_page: "100", ...query });
    const all: T[] = [];

    // Bounded so a misbehaving Link header can't spin forever.
    for (let page = 0; url && page < 25; page++) {
      const response: Response = await this.request(url);
      const batch = (await response.json()) as T[];
      if (!Array.isArray(batch)) {
        throw new CanvasError(`Expected a list from ${path}, got an object.`);
      }
      all.push(...batch);
      url = nextLink(response.headers.get("link"));
    }

    return all;
  }

  /**
   * Downloads a file's bytes. Canvas hands back a pre-signed URL that often
   * redirects to object storage, so the token goes along only when the URL is
   * still on the Canvas host — an Authorization header confuses S3 and would
   * turn a working download into a 400.
   */
  async download(fileUrl: string): Promise<Buffer> {
    const sameHost = safeHost(fileUrl) === this.host;

    const response = await this.fetcher(fileUrl, {
      headers: sameHost ? { Authorization: `Bearer ${this.token}` } : {},
      cache: "no-store",
    });

    if (!response.ok) {
      throw new CanvasError(
        `Download failed (${response.status} ${response.statusText}).`,
        response.status,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /* ----------------------------- endpoints ------------------------------ */

  /** Courses the token's user can see. Used to populate the course picker. */
  listCourses(): Promise<CanvasCourse[]> {
    return this.getAll<CanvasCourse>("/api/v1/courses", {
      enrollment_state: "active",
      "state[]": ["available", "unpublished", "completed"],
    });
  }

  getCourse(courseId: string): Promise<CanvasCourse> {
    return this.getJson<CanvasCourse>(`/api/v1/courses/${courseId}`, {
      "include[]": "syllabus_body",
    });
  }

  listFiles(courseId: string): Promise<CanvasFile[]> {
    return this.getAll<CanvasFile>(`/api/v1/courses/${courseId}/files`);
  }

  listModules(courseId: string): Promise<CanvasModule[]> {
    return this.getAll<CanvasModule>(`/api/v1/courses/${courseId}/modules`, {
      "include[]": "items",
    });
  }

  listAssignments(courseId: string): Promise<CanvasAssignment[]> {
    return this.getAll<CanvasAssignment>(`/api/v1/courses/${courseId}/assignments`);
  }

  /**
   * One assignment, including its rubric definition. The list endpoint above
   * omits `rubric`, and without it a rubric assessment is a set of numbers
   * keyed by opaque ids — no criterion names, no totals to be out of.
   */
  getAssignment(courseId: string, assignmentId: string): Promise<CanvasAssignment> {
    return this.getJson<CanvasAssignment>(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    );
  }

  /**
   * One student's submission with the teacher's rubric marks.
   *
   * `style=full` is the parameter that matters: without it Canvas returns
   * per-criterion points but drops the comments, which are the entire point
   * of explaining a grade in the teacher's own words.
   */
  getSubmission(
    courseId: string,
    assignmentId: string,
    userId: string,
  ): Promise<CanvasSubmission> {
    return this.getJson<CanvasSubmission>(
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
      { "include[]": ["rubric_assessment", "submission_comments"], style: "full" },
    );
  }
}

/* -------------------------------- helpers ------------------------------- */

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Pulls the rel="next" URL out of a Link header:
 *   <https://…?page=2>; rel="next",<https://…?page=9>; rel="last"
 */
export function nextLink(header: string | null): string | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    const match = /^\s*<([^>]+)>\s*;\s*(.+)$/.exec(part);
    if (match && /\brel\s*=\s*"?next"?/i.test(match[2])) return match[1];
  }

  return null;
}

/**
 * Canvas returns a JSON body on errors. Turning 401 and 404 into sentences a
 * teacher can act on matters more here than anywhere else in the app — this is
 * the one place where the failure is usually a setup mistake, not a bug.
 */
async function describeFailure(
  response: Response,
  baseUrl: string,
): Promise<CanvasError> {
  const detail = await canvasMessage(response);

  if (response.status === 401 || response.status === 403) {
    return new CanvasError(
      `Canvas rejected the access token (${response.status}). Check CANVAS_ACCESS_TOKEN hasn't expired and that it belongs to ${baseUrl}.${detail}`,
      response.status,
    );
  }

  if (response.status === 404) {
    return new CanvasError(
      `Canvas has no such course, or the token's user can't see it (404).${detail}`,
      404,
    );
  }

  return new CanvasError(
    `Canvas returned ${response.status} ${response.statusText}.${detail}`,
    response.status,
  );
}

async function canvasMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errors?: { message?: string }[] | { message?: string };
      message?: string;
    };

    const message =
      body.message ??
      (Array.isArray(body.errors) ? body.errors[0]?.message : body.errors?.message);

    return message ? ` Canvas said: ${message}` : "";
  } catch {
    return "";
  }
}
