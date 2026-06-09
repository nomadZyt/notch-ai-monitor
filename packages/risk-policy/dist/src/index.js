import { DEFAULT_EVENT_PRIORITY } from "@notch-ai-monitor/shared";
const RISK_ORDER = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
};
const SHELL_BOUNDARY_TOKENS = new Set([
    "&&",
    "||",
    ";",
    "|",
    "&",
    ">",
    ">>",
    "<",
    "<<",
]);
const SHELL_TOKEN_PATTERN = /&&|\|\||>>|<<|[;|&<>]|"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s;&|<>]+)/g;
const RISK_EVENT_ACTIONS = [
    {
        id: "reject",
        label: "拒绝执行",
        style: "danger",
        resolves: true,
        sideEffect: "process",
        enabled: true,
    },
    {
        id: "allow-once",
        label: "允许一次",
        style: "primary",
        resolves: true,
        requiresConfirm: true,
        sideEffect: "process",
        enabled: true,
    },
    {
        id: "locate",
        label: "定位终端",
        style: "secondary",
        resolves: false,
        sideEffect: "navigation",
        enabled: true,
    },
    {
        id: "copy",
        label: "复制命令",
        style: "secondary",
        resolves: false,
        sideEffect: "clipboard",
        enabled: true,
    },
];
function tokenizeShell(command) {
    return [...command.matchAll(SHELL_TOKEN_PATTERN)].map((match) => {
        const token = match[1] ?? match[2] ?? match[3] ?? match[0];
        return token.replace(/\\"/g, '"');
    });
}
function commandName(token) {
    const withoutAssignments = token.includes("=") ? token.split("=").at(-1) ?? token : token;
    return withoutAssignments.split("/").at(-1) ?? withoutAssignments;
}
function isBoundaryToken(token) {
    return SHELL_BOUNDARY_TOKENS.has(token);
}
function uniqueStrings(items) {
    return [...new Set(items.filter((item) => item.length > 0))];
}
function maxRiskLevel(levels) {
    return levels.reduce((current, next) => (RISK_ORDER[next] > RISK_ORDER[current] ? next : current), "low");
}
function isWildcardPath(path) {
    return /[*?[\]]/.test(path);
}
function trimTrailingSlashes(path) {
    if (path === "/")
        return path;
    return path.replace(/\/+$/, "");
}
function isTempPath(path) {
    const normalized = trimTrailingSlashes(path);
    return (normalized === "/tmp" ||
        normalized.startsWith("/tmp/") ||
        normalized === "/var/tmp" ||
        normalized.startsWith("/var/tmp/") ||
        normalized === "/private/tmp" ||
        normalized.startsWith("/private/tmp/") ||
        normalized === "/private/var/tmp" ||
        normalized.startsWith("/private/var/tmp/") ||
        normalized.startsWith("/private/var/folders/") ||
        normalized === "$TMPDIR" ||
        normalized.startsWith("$TMPDIR/") ||
        normalized === "${TMPDIR}" ||
        normalized.startsWith("${TMPDIR}/") ||
        normalized === "tmp" ||
        normalized.startsWith("tmp/") ||
        normalized === "./tmp" ||
        normalized.startsWith("./tmp/") ||
        normalized === ".tmp" ||
        normalized.startsWith(".tmp/") ||
        normalized === "./.tmp" ||
        normalized.startsWith("./.tmp/") ||
        normalized === "temp" ||
        normalized.startsWith("temp/") ||
        normalized === "./temp" ||
        normalized.startsWith("./temp/"));
}
function isHomeDocumentsPath(path) {
    const normalized = trimTrailingSlashes(path);
    return (normalized === "~/Documents" ||
        normalized.startsWith("~/Documents/") ||
        normalized === "$HOME/Documents" ||
        normalized.startsWith("$HOME/Documents/") ||
        normalized === "${HOME}/Documents" ||
        normalized.startsWith("${HOME}/Documents/") ||
        /^\/Users\/[^/]+\/Documents(?:\/|$)/.test(normalized));
}
function isBroadRmTarget(path) {
    const normalized = trimTrailingSlashes(path);
    return (normalized === "/" ||
        normalized === "/*" ||
        normalized === "." ||
        normalized === "./" ||
        normalized === "*" ||
        normalized === "./*" ||
        normalized === "~" ||
        normalized === "~/*" ||
        normalized === "$HOME" ||
        normalized === "$HOME/*" ||
        normalized === "${HOME}" ||
        normalized === "${HOME}/*" ||
        normalized === "$PWD" ||
        normalized === "$PWD/*");
}
function classifyRmTargets(targets) {
    if (targets.length === 0)
        return "high";
    if (targets.some((target) => isBroadRmTarget(target) || isHomeDocumentsPath(target))) {
        return "critical";
    }
    if (targets.some((target) => isWildcardPath(target) && !isTempPath(target))) {
        return "high";
    }
    if (targets.every(isTempPath))
        return "medium";
    return "high";
}
function consumeCommandArguments(tokens, startIndex) {
    const args = [];
    for (let index = startIndex; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isBoundaryToken(token))
            break;
        args.push(token);
    }
    return args;
}
function scanRmRecursiveForce(tokens) {
    const matches = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (commandName(tokens[index]) !== "rm")
            continue;
        let hasRecursive = false;
        let hasForce = false;
        let readingOptions = true;
        const targets = [];
        for (const token of consumeCommandArguments(tokens, index + 1)) {
            if (readingOptions && token === "--") {
                readingOptions = false;
                continue;
            }
            if (readingOptions && token.startsWith("-") && token !== "-") {
                if (token === "--recursive")
                    hasRecursive = true;
                if (token === "--force")
                    hasForce = true;
                if (!token.startsWith("--")) {
                    hasRecursive = hasRecursive || /[rR]/.test(token);
                    hasForce = hasForce || token.includes("f");
                }
                continue;
            }
            readingOptions = false;
            targets.push(token);
        }
        if (!hasRecursive || !hasForce)
            continue;
        const affectedPaths = uniqueStrings(targets);
        const level = classifyRmTargets(affectedPaths);
        const reasons = [
            "检测到 rm -rf/rm -fr 递归强制删除。",
            affectedPaths.some((target) => !isTempPath(target))
                ? "删除目标不属于明确临时目录。"
                : "删除目标看起来位于临时目录，但仍会跳过普通确认。",
            affectedPaths.some(isWildcardPath) ? "删除目标包含通配符，实际影响范围可能扩大。" : "",
            affectedPaths.some(isHomeDocumentsPath) ? "删除目标命中用户 Documents 路径。" : "",
            affectedPaths.some(isBroadRmTarget) ? "删除目标过宽，可能清空当前目录、home 或根路径。" : "",
        ];
        matches.push({
            ruleId: "rm-recursive-force",
            level,
            reasons: uniqueStrings(reasons),
            affectedPaths,
            impact: affectedPaths.length > 0
                ? `递归强制删除：${affectedPaths.join("、")}`
                : "递归强制删除，未解析到明确目标路径。",
            rollback: "rm -rf 没有内建撤销；如已执行通常只能依赖备份、git 历史或系统快照恢复。",
        });
    }
    return matches;
}
function scanGitClean(tokens, context) {
    const matches = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (commandName(tokens[index]) !== "git")
            continue;
        const args = consumeCommandArguments(tokens, index + 1);
        const cleanIndex = args.findIndex((arg) => arg === "clean");
        if (cleanIndex === -1)
            continue;
        const cleanArgs = args.slice(cleanIndex + 1);
        const shortFlags = cleanArgs
            .filter((arg) => /^-[A-Za-z]+$/.test(arg))
            .map((arg) => arg.slice(1))
            .join("");
        const hasDryRun = cleanArgs.includes("-n") || cleanArgs.includes("--dry-run") || shortFlags.includes("n");
        const hasForce = cleanArgs.includes("--force") || shortFlags.includes("f");
        const hasDirectories = shortFlags.includes("d");
        const includesIgnored = shortFlags.includes("x");
        if (hasDryRun || !hasForce || !hasDirectories)
            continue;
        const gitCIndex = args.findIndex((arg) => arg === "-C");
        const affectedPath = gitCIndex >= 0 ? args[gitCIndex + 1] : context.cwd ?? ".";
        matches.push({
            ruleId: "git-clean-force-directories",
            level: "high",
            reasons: [
                includesIgnored
                    ? "检测到 git clean -xdf，会删除未跟踪文件、目录和被忽略文件。"
                    : "检测到 git clean -fd，会删除当前仓库未跟踪文件和目录。",
            ],
            affectedPaths: affectedPath ? [affectedPath] : [],
            impact: includesIgnored
                ? "删除当前仓库未跟踪和被忽略内容。"
                : "删除当前仓库未跟踪文件和目录。",
            rollback: "git clean 删除的未跟踪内容通常不在 git 历史中，需要从备份或手动副本恢复。",
        });
    }
    return matches;
}
function scanSudo(tokens) {
    if (!tokens.some((token) => commandName(token) === "sudo"))
        return [];
    return [
        {
            ruleId: "sudo-privilege-escalation",
            level: "medium",
            reasons: ["检测到 sudo 权限提升，命令可能绕过普通用户权限保护。"],
            affectedPaths: [],
            impact: "以管理员权限执行后，文件系统、进程或系统配置影响范围会扩大。",
            rollback: "先确认命令的具体副作用；如已执行，需要按对应系统变更单独恢复。",
        },
    ];
}
function scanRecursiveWorldWritable(tokens) {
    const matches = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (commandName(tokens[index]) !== "chmod")
            continue;
        const args = consumeCommandArguments(tokens, index + 1);
        const hasRecursive = args.some((arg) => /^-[A-Za-z]*R[A-Za-z]*$/.test(arg));
        const modeIndex = args.findIndex((arg) => arg === "777" || arg === "0777" || arg === "a+rwx");
        if (!hasRecursive || modeIndex === -1)
            continue;
        const affectedPaths = args
            .slice(modeIndex + 1)
            .filter((arg) => !arg.startsWith("-"));
        matches.push({
            ruleId: "chmod-recursive-777",
            level: "high",
            reasons: ["检测到 chmod -R 777，会递归开放读写执行权限。"],
            affectedPaths: uniqueStrings(affectedPaths),
            impact: "递归放开权限可能让本地项目或系统路径被任意用户改写。",
            rollback: "需要重新设置原始权限；若没有权限快照，恢复成本较高。",
        });
    }
    return matches;
}
function scanCurlPipeShell(command) {
    if (!/\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/.test(command)) {
        return [];
    }
    return [
        {
            ruleId: "download-pipe-shell",
            level: "high",
            reasons: ["检测到 curl/wget 直接管道到 shell，远端脚本会在本机执行。"],
            affectedPaths: [],
            impact: "远端内容未经本地审阅即可执行，可能修改文件、安装程序或启动进程。",
            rollback: "先下载到文件并审阅；如已执行，只能按脚本实际副作用逐项恢复。",
        },
    ];
}
function scanDdOutput(tokens) {
    const matches = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (commandName(tokens[index]) !== "dd")
            continue;
        const args = consumeCommandArguments(tokens, index + 1);
        const outputArg = args.find((arg) => arg.startsWith("of="));
        if (!outputArg)
            continue;
        const outputPath = outputArg.slice("of=".length);
        const critical = outputPath.startsWith("/dev/") || outputPath === "/" || outputPath === "/*";
        matches.push({
            ruleId: "dd-output-write",
            level: critical ? "critical" : "high",
            reasons: [
                critical
                    ? "检测到 dd 写入设备或宽路径，可能覆盖磁盘数据。"
                    : "检测到 dd of= 输出写入，可能覆盖目标文件。",
            ],
            affectedPaths: outputPath ? [outputPath] : [],
            impact: outputPath ? `dd 会覆盖输出目标：${outputPath}` : "dd 会覆盖输出目标。",
            rollback: "dd 覆盖写入通常不可撤销，需要从备份、镜像或快照恢复。",
        });
    }
    return matches;
}
function buildImpact(matches) {
    if (matches.length === 0)
        return "未发现 P0 风险规则命中。";
    return uniqueStrings(matches.map((match) => match.impact)).join("；");
}
function buildRollback(matches, riskLevel) {
    if (matches.length === 0)
        return "无需回滚。";
    if (riskLevel === "critical") {
        return "建议拒绝或改写命令并先备份；critical 命令如已执行，通常只能从备份、git、系统快照或磁盘镜像恢复。";
    }
    if (riskLevel === "high") {
        return "建议先拒绝或改写命令；如已执行，需要按删除、权限或脚本副作用从备份/git/快照恢复。";
    }
    return "建议人工确认命令范围和权限需求；如已执行，需要按实际副作用恢复。";
}
export function stableCommandHash(command) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < command.length; index += 1) {
        hash ^= command.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `cmd_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
export function scanCommand(command, context = {}) {
    const tokens = tokenizeShell(command);
    const matches = [
        ...scanRmRecursiveForce(tokens),
        ...scanGitClean(tokens, context),
        ...scanSudo(tokens),
        ...scanRecursiveWorldWritable(tokens),
        ...scanCurlPipeShell(command),
        ...scanDdOutput(tokens),
    ];
    const riskLevel = maxRiskLevel(matches.map((match) => match.level));
    return {
        command,
        riskLevel,
        isRisky: riskLevel !== "low",
        reasons: uniqueStrings(matches.flatMap((match) => match.reasons)),
        affectedPaths: uniqueStrings(matches.flatMap((match) => match.affectedPaths)),
        impact: buildImpact(matches),
        rollback: buildRollback(matches, riskLevel),
        origin: context.origin ?? "RiskScanner P0 command scan; command not executed",
        matchedRules: uniqueStrings(matches.map((match) => match.ruleId)),
    };
}
export function commandLooksRisky(command, context = {}) {
    return scanCommand(command, context).isRisky;
}
export function riskAssessmentToEvidence(assessment) {
    const evidence = {
        reason: assessment.reasons.length > 0
            ? assessment.reasons.join(" ")
            : "未命中 P0 风险规则。",
        impact: assessment.impact,
        origin: assessment.origin,
        rollback: assessment.rollback,
        riskLevel: assessment.riskLevel,
    };
    if (assessment.affectedPaths.length > 0) {
        evidence.affectedPaths = [...assessment.affectedPaths];
    }
    return evidence;
}
export function buildRiskEvent(input) {
    const assessment = input.assessment ?? scanCommand(input.command, input);
    if (!assessment.isRisky)
        return undefined;
    const commandHash = input.commandHash ?? stableCommandHash(input.command);
    const event = {
        id: input.id ?? `evt_risk_${commandHash.slice("cmd_".length)}`,
        sessionId: input.sessionId,
        type: "risk",
        priority: DEFAULT_EVENT_PRIORITY.risk,
        status: "active",
        title: assessment.riskLevel === "critical"
            ? "已拦截 critical 风险命令"
            : "已拦截危险命令",
        summary: assessment.reasons[0] ??
            `RiskScanner 检测到 ${assessment.riskLevel} 风险命令。`,
        command: input.command,
        commandHash,
        source: input.source ?? "RiskScanner P0",
        createdAt: input.createdAt,
        updatedAt: input.updatedAt ?? input.createdAt,
        evidence: riskAssessmentToEvidence(assessment),
        reasons: [...assessment.reasons],
        actions: RISK_EVENT_ACTIONS.map((action) => ({ ...action })),
    };
    return event;
}
