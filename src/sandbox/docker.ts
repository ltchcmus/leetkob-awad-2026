import { execFile } from "node:child_process";
import { request } from "node:http";
import { win32 } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const dockerExecutable =
  process.platform === "win32"
    ? win32.join(
        process.env.ProgramFiles ?? "C:\\Program Files",
        "Docker",
        "Docker",
        "resources",
        "bin",
        "docker.exe",
      )
    : "/usr/bin/docker";
export class DockerError extends Error {
  status: number;
  constructor(status: number) {
    super("docker_request_failed");
    this.status = status;
  }
}
export type Engine = {
  endpoint: string;
  call<T>(method: string, path: string, body?: unknown): Promise<T>;
};

/** CLI credentials/proxies are never inherited by a container creation request. */
export function dockerEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
  ]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

export async function connectDocker(): Promise<Engine> {
  let endpoint = process.env.DOCKER_HOST;
  if (!endpoint) {
    const { stdout } = await exec(
      dockerExecutable,
      ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      {
        timeout: 3000,
        maxBuffer: 8192,
        windowsHide: true,
        env: dockerEnvironment(),
      },
    );
    endpoint = stdout.trim();
  }
  const socketPath = endpoint.startsWith("unix://")
    ? endpoint.slice(7)
    : endpoint.startsWith("npipe://")
      ? endpoint.slice(8).replaceAll("/", "\\")
      : undefined;
  if (!socketPath) throw new DockerError(0); // Remote TCP/SSH daemons need a separately reviewed transport.
  function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const payload =
        body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const req = request(
        {
          socketPath,
          agent: false,
          method,
          path: `/v1.45${path}`,
          headers: payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) req.destroy(new DockerError(0));
            else chunks.push(chunk);
          });
          res.on("end", () => {
            clearTimeout(timer);
            if (
              !res.statusCode ||
              res.statusCode < 200 ||
              res.statusCode >= 300
            )
              reject(new DockerError(res.statusCode ?? 0));
            else {
              try {
                resolve(
                  (size
                    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
                    : {}) as T,
                );
              } catch {
                reject(new DockerError(0));
              }
            }
          });
          res.on("error", () => {
            clearTimeout(timer);
            reject(new DockerError(0));
          });
        },
      );
      const timer = setTimeout(() => req.destroy(new DockerError(0)), 3000);
      req.on("error", () => {
        clearTimeout(timer);
        reject(new DockerError(0));
      });
      req.end(payload);
    });
  }
  return {
    endpoint,
    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
      try {
        return await send<T>(method, path, body);
      } catch (error) {
        if (
          method !== "GET" ||
          !(error instanceof DockerError) ||
          error.status !== 0
        )
          throw error;
        // Retry a disconnected read once on a fresh socket, never a mutation.
        return send<T>(method, path, body);
      }
    },
  };
}
