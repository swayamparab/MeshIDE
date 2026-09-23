import type { Server as HttpServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import jwt from "jsonwebtoken";
import { WebSocketServer, WebSocket } from "ws";

interface JwtPayload {
    userId: string;
}

interface RunMessage {
    type: "run";
    fileName: string;
    content: string;
}

interface InputMessage {
    type: "input";
    data: string;
}

interface StopMessage {
    type: "stop";
}

type TerminalMessage =
    | RunMessage
    | InputMessage
    | StopMessage;

const MAX_FILE_NAME_LENGTH = 255;
const MAX_CODE_SIZE = 100 * 1024;
const MAX_INPUT_SIZE = 8 * 1024;
const MAX_OUTPUT_SIZE = 512 * 1024;

const RUN_TIMEOUT_MS = 10_000;
const IDLE_CONNECTION_TIMEOUT_MS =
    30 * 60 * 1000;

const ALLOWED_EXTENSIONS = new Set([
    ".js",
    ".py",
]);

function sendMessage(
    socket: WebSocket,
    message: unknown,
) {
    if (
        socket.readyState ===
        WebSocket.OPEN
    ) {
        socket.send(
            JSON.stringify(message),
        );
    }
}

function sendOutput(
    socket: WebSocket,
    data: string,
) {
    sendMessage(socket, {
        type: "output",
        data,
    });
}

function getCookie(
    cookieHeader: string | undefined,
    name: string,
) {
    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader
        .split(";")
        .map((cookie) => cookie.trim());

    for (const cookie of cookies) {
        const separatorIndex =
            cookie.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const key =
            cookie.slice(
                0,
                separatorIndex,
            );

        if (key !== name) {
            continue;
        }

        return decodeURIComponent(
            cookie.slice(
                separatorIndex + 1,
            ),
        );
    }

    return null;
}

function authenticateWebSocket(
    request: import("node:http").IncomingMessage,
) {
    const token = getCookie(
        request.headers.cookie,
        "mesh_access_token",
    );

    if (!token) {
        return null;
    }

    const secret =
        process.env.JWT_SECRET;

    if (!secret) {
        console.error(
            "JWT_SECRET is not configured.",
        );

        return null;
    }

    try {
        const decoded =
            jwt.verify(
                token,
                secret,
            );

        if (
            typeof decoded !==
            "object" ||
            decoded === null ||
            typeof decoded.userId !==
            "string"
        ) {
            return null;
        }

        return decoded as JwtPayload;
    } catch {
        return null;
    }
}

function isValidFileName(
    fileName: string,
) {
    if (
        fileName.length === 0 ||
        fileName.length >
        MAX_FILE_NAME_LENGTH
    ) {
        return false;
    }

    if (
        path.basename(fileName) !==
        fileName
    ) {
        return false;
    }

    /*
     * Keep the filename simple.
     */
    if (
        !/^[a-zA-Z0-9._-]+$/.test(
            fileName,
        )
    ) {
        return false;
    }

    return true;
}

function isRunMessage(
    value: unknown,
): value is RunMessage {
    if (
        typeof value !==
        "object" ||
        value === null
    ) {
        return false;
    }

    const message =
        value as Record<
            string,
            unknown
        >;

    return (
        message.type === "run" &&
        typeof message.fileName ===
        "string" &&
        typeof message.content ===
        "string"
    );
}

function isInputMessage(
    value: unknown,
): value is InputMessage {
    if (
        typeof value !==
        "object" ||
        value === null
    ) {
        return false;
    }

    const message =
        value as Record<
            string,
            unknown
        >;

    return (
        message.type === "input" &&
        typeof message.data ===
        "string"
    );
}

function isStopMessage(
    value: unknown,
): value is StopMessage {
    if (
        typeof value !== "object" ||
        value === null
    ) {
        return false;
    }

    const message =
        value as Record<
            string,
            unknown
        >;

    return message.type === "stop";
}

export function setupTerminalWebSocket(
    server: HttpServer,
) {
    const frontendUrl =
        process.env.FRONTEND_URL;

    const wss =
        new WebSocketServer({
            noServer: true,
            maxPayload:
                MAX_CODE_SIZE +
                16 * 1024,

            verifyClient: (
                info,
                callback,
            ) => {
                /*
                 * WebSocket connections from
                 * browsers include an Origin header.
                 *
                 * Reject unknown origins.
                 */
                if (
                    frontendUrl &&
                    info.origin !==
                    frontendUrl
                ) {
                    callback(
                        false,
                        403,
                        "Forbidden",
                    );

                    return;
                }

                /*
                 * Require an authenticated
                 * MeshIDE session.
                 */
                const user =
                    authenticateWebSocket(
                        info.req,
                    );

                if (!user) {
                    callback(
                        false,
                        401,
                        "Unauthorized",
                    );

                    return;
                }

                /*
                 * Store the authenticated
                 * user on the request so the
                 * connection handler can use it.
                 */
                (
                    info.req as
                    import("node:http").IncomingMessage & {
                        meshUser?: JwtPayload;
                    }
                ).meshUser = user;

                callback(true);
            },
        });

    wss.on(
        "connection",
        (socket, request) => {
            const authenticatedRequest =
                request as typeof request & {
                    meshUser?: JwtPayload;
                };

            const user =
                authenticatedRequest.meshUser;

            if (!user) {
                socket.close(
                    1008,
                    "Unauthorized",
                );

                return;
            }

            // console.log(
            //     `Terminal WebSocket connected for user ${user.userId}`,
            // );

            let runningProcess:
                ReturnType<typeof spawn> | null =
                null;

            let temporaryDirectory:
                string | null = null;

            let runTimeout:
                ReturnType<
                    typeof setTimeout
                > | null = null;

            let outputBytes = 0;

            let runInProgress = false;

            let lastActivity =
                Date.now();

            const cleanup =
                async () => {
                    if (runTimeout) {
                        clearTimeout(
                            runTimeout,
                        );

                        runTimeout = null;
                    }

                    if (
                        runningProcess
                    ) {
                        runningProcess.kill(
                            "SIGKILL",
                        );

                        runningProcess =
                            null;
                    }

                    if (
                        temporaryDirectory
                    ) {
                        const directory =
                            temporaryDirectory;

                        temporaryDirectory =
                            null;

                        await fs
                            .rm(
                                directory,
                                {
                                    recursive:
                                        true,
                                    force: true,
                                },
                            )
                            .catch(
                                () => { },
                            );
                    }

                    runInProgress =
                        false;
                };

            const inactivityTimer =
                setInterval(
                    () => {
                        if (
                            Date.now() -
                            lastActivity >
                            IDLE_CONNECTION_TIMEOUT_MS
                        ) {
                            socket.close(
                                1000,
                                "Terminal idle timeout",
                            );
                        }
                    },
                    60_000,
                );

            sendOutput(
                socket,
                "\x1b[90mMeshIDE terminal connected.\x1b[0m\r\n",
            );

            socket.on(
                "message",
                async (message) => {
                    lastActivity =
                        Date.now();

                    const messageSize =
                        Buffer.byteLength(
                            message.toString(),
                            "utf8",
                        );

                    if (
                        messageSize >
                        MAX_CODE_SIZE +
                        MAX_INPUT_SIZE
                    ) {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mRequest too large.\x1b[0m\r\n",
                        );

                        return;
                    }

                    let parsed: unknown;

                    try {
                        parsed =
                            JSON.parse(
                                message.toString(),
                            );
                    } catch {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mInvalid terminal message.\x1b[0m\r\n",
                        );

                        return;
                    }

                    if (isStopMessage(parsed)) {
                        if (runningProcess) {
                            runningProcess.kill("SIGKILL");

                            sendOutput(
                                socket,
                                "\r\n\x1b[33mProcess stopped by user.\x1b[0m\r\n",
                            );
                        }

                        return;
                    }

                    if (
                        isInputMessage(
                            parsed,
                        )
                    ) {
                        if (
                            parsed.data
                                .length >
                            MAX_INPUT_SIZE
                        ) {
                            sendOutput(
                                socket,
                                "\r\n\x1b[31mInput too large.\x1b[0m\r\n",
                            );

                            return;
                        }

                        if (
                            runningProcess?.stdin &&
                            !runningProcess
                                .stdin
                                .destroyed
                        ) {
                            runningProcess.stdin.write(
                                parsed.data,
                                "utf8",
                            );
                        }

                        return;
                    }

                    /*
                     * Run a single editor file.
                     */
                    if (
                        !isRunMessage(
                            parsed,
                        )
                    ) {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mInvalid terminal request.\x1b[0m\r\n",
                        );

                        return;
                    }

                    if (
                        !isValidFileName(
                            parsed.fileName,
                        )
                    ) {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mInvalid file name.\x1b[0m\r\n",
                        );

                        return;
                    }

                    if (
                        Buffer.byteLength(
                            parsed.content,
                            "utf8",
                        ) >
                        MAX_CODE_SIZE
                    ) {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mFile is too large. Maximum size is 100 KB.\x1b[0m\r\n",
                        );

                        return;
                    }

                    const fileName =
                        parsed.fileName;

                    const extension =
                        path
                            .extname(
                                fileName,
                            )
                            .toLowerCase();

                    if (
                        !ALLOWED_EXTENSIONS.has(
                            extension,
                        )
                    ) {
                        sendOutput(
                            socket,
                            "\r\n\x1b[31mOnly .js and .py files can be run right now.\x1b[0m\r\n",
                        );

                        return;
                    }

                    /*
                     * Only one process per
                     * terminal connection.
                     */
                    await cleanup();

                    outputBytes = 0;

                    temporaryDirectory =
                        await fs.mkdtemp(
                            path.join(
                                os.tmpdir(),
                                "meshide-",
                            ),
                        );

                    const filePath =
                        path.join(
                            temporaryDirectory,
                            fileName,
                        );

                    await fs.writeFile(
                        filePath,
                        parsed.content,
                        {
                            encoding:
                                "utf8",
                            mode: 0o600,
                        },
                    );

                    let command: string;
                    let args: string[];

                    if (
                        extension ===
                        ".js"
                    ) {
                        command =
                            process.execPath;

                        args = [
                            "--no-warnings",
                            filePath,
                        ];
                    } else {
                        /*
                         * Render/Linux should have
                         * python3 available.
                         */
                        command =
                            "python3";

                        /*
                         * -I:
                         * isolated Python mode.
                         *
                         * -u:
                         * unbuffered stdout/stderr,
                         * useful for interactive
                         * terminal output.
                         */
                        args = [
                            "-I",
                            "-u",
                            filePath,
                        ];
                    }

                    sendOutput(
                        socket,
                        `\r\n\x1b[90m$ ${command} ${fileName}\x1b[0m\r\n`,
                    );

                    /*
                     * Do NOT pass the complete
                     * server environment to user code.
                     *
                     * Only provide a minimal environment.
                     */
                    const safeEnvironment: NodeJS.ProcessEnv =
                    {
                        PATH:
                            process.env
                                .PATH ??
                            "",
                        LANG:
                            process.env
                                .LANG ??
                            "C.UTF-8",
                        LC_ALL:
                            process.env
                                .LC_ALL ??
                            "C.UTF-8",
                        NODE_ENV:
                            "production",
                    };

                    runningProcess =
                        spawn(
                            command,
                            args,
                            {
                                cwd:
                                    temporaryDirectory,
                                env:
                                    safeEnvironment,
                                stdio: [
                                    "pipe",
                                    "pipe",
                                    "pipe",
                                ],
                                shell: false,
                            },
                        );

                    runningProcess.stdin?.setDefaultEncoding(
                        "utf8",
                    );

                    runInProgress =
                        true;

                    const processForRun =
                        runningProcess;

                    const sendLimitedOutput =
                        (
                            data: Buffer,
                            isError =
                                false,
                        ) => {
                            if (
                                socket.readyState !==
                                WebSocket.OPEN
                            ) {
                                return;
                            }

                            outputBytes +=
                                data.length;

                            if (
                                outputBytes >
                                MAX_OUTPUT_SIZE
                            ) {
                                sendOutput(
                                    socket,
                                    "\r\n\x1b[31mOutput limit reached. Process terminated.\x1b[0m\r\n",
                                );

                                processForRun.kill(
                                    "SIGKILL",
                                );

                                return;
                            }

                            const text =
                                data.toString();

                            sendOutput(
                                socket,
                                isError
                                    ? `\x1b[31m${text}\x1b[0m`
                                    : text,
                            );
                        };

                    processForRun.stdout?.on(
                        "data",
                        (data) => {
                            sendLimitedOutput(
                                Buffer.from(
                                    data,
                                ),
                            );
                        },
                    );

                    processForRun.stderr?.on(
                        "data",
                        (data) => {
                            sendLimitedOutput(
                                Buffer.from(
                                    data,
                                ),
                                true,
                            );
                        },
                    );

                    processForRun.on(
                        "error",
                        (error) => {
                            if (
                                socket.readyState ===
                                WebSocket.OPEN
                            ) {
                                sendOutput(
                                    socket,
                                    `\r\n\x1b[31m${error.message}\x1b[0m\r\n`,
                                );
                            }
                        },
                    );

                    runTimeout =
                        setTimeout(
                            () => {
                                if (
                                    runningProcess ===
                                    processForRun
                                ) {
                                    processForRun.kill(
                                        "SIGKILL",
                                    );

                                    sendOutput(
                                        socket,
                                        "\r\n\x1b[31mExecution timed out after 10 seconds.\x1b[0m\r\n",
                                    );
                                }
                            },
                            RUN_TIMEOUT_MS,
                        );

                    processForRun.on(
                        "close",
                        async (
                            code,
                            signal,
                        ) => {
                            if (
                                runTimeout
                            ) {
                                clearTimeout(
                                    runTimeout,
                                );

                                runTimeout =
                                    null;
                            }

                            if (
                                socket.readyState ===
                                WebSocket.OPEN
                            ) {
                                if (
                                    signal ===
                                    "SIGKILL"
                                ) {
                                    sendOutput(
                                        socket,
                                        "\r\n\x1b[31mProcess terminated.\x1b[0m\r\n",
                                    );
                                } else {
                                    sendOutput(
                                        socket,
                                        `\r\n\x1b[90mProcess exited with code ${code ?? 0}.\x1b[0m\r\n`,
                                    );
                                }
                            }

                            if (
                                runningProcess ===
                                processForRun
                            ) {
                                runningProcess =
                                    null;
                            }

                            runInProgress =
                                false;

                            if (
                                temporaryDirectory
                            ) {
                                const directory =
                                    temporaryDirectory;

                                temporaryDirectory =
                                    null;

                                await fs
                                    .rm(
                                        directory,
                                        {
                                            recursive:
                                                true,
                                            force: true,
                                        },
                                    )
                                    .catch(
                                        () => { },
                                    );
                            }
                        },
                    );
                },
            );

            socket.on(
                "close",
                async () => {
                    clearInterval(
                        inactivityTimer,
                    );

                    await cleanup();

                    // console.log(
                    //     `Terminal WebSocket disconnected for user ${user.userId}`,
                    // );
                },
            );

            socket.on(
                "error",
                async (error) => {
                    console.error(
                        "Terminal WebSocket error:",
                        error,
                    );

                    clearInterval(
                        inactivityTimer,
                    );

                    await cleanup();
                },
            );
        },
    );

    return wss;
}