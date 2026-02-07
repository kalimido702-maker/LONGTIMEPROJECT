/**
 * App Updates Routes
 * Handles app version checking and update file serving
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { query } from "../config/database-factory.js";
import path from "path";
import fs from "fs";

// Schema for version check request
const versionCheckSchema = z.object({
    currentVersion: z.string(),
    platform: z.enum(["win32", "darwin", "linux"]),
    arch: z.enum(["x64", "arm64", "ia32"]).optional(),
});

interface AppVersion {
    id: string;
    version: string;
    platform: string;
    download_url: string;
    release_notes: string;
    file_size: number;
    checksum: string;
    is_mandatory: boolean;
    created_at: Date;
}

export default async function updateRoutes(fastify: FastifyInstance) {
    /**
     * Check for updates
     * POST /api/updates/check
     */
    fastify.post(
        "/check",
        async (
            request: FastifyRequest<{ Body: z.infer<typeof versionCheckSchema> }>,
            reply: FastifyReply
        ) => {
            try {
                const body = versionCheckSchema.parse(request.body);

                // Get latest version for this platform
                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions 
           WHERE platform = ? AND is_active = TRUE 
           ORDER BY created_at DESC 
           LIMIT 1`,
                    [body.platform]
                );

                if (versions.length === 0) {
                    return reply.send({
                        updateAvailable: false,
                        currentVersion: body.currentVersion,
                    });
                }

                const latestVersion = versions[0];

                // Compare versions
                const isNewer = compareVersions(latestVersion.version, body.currentVersion) > 0;

                if (!isNewer) {
                    return reply.send({
                        updateAvailable: false,
                        currentVersion: body.currentVersion,
                        latestVersion: latestVersion.version,
                    });
                }

                // Build download URL
                const baseUrl = process.env.API_BASE_URL || `${request.protocol}://${request.hostname}`;
                const downloadUrl = `${baseUrl}/api/updates/download/${latestVersion.id}`;

                return reply.send({
                    updateAvailable: true,
                    currentVersion: body.currentVersion,
                    latestVersion: latestVersion.version,
                    downloadUrl: downloadUrl,
                    releaseNotes: latestVersion.release_notes,
                    fileSize: latestVersion.file_size,
                    checksum: latestVersion.checksum,
                    isMandatory: latestVersion.is_mandatory,
                });
            } catch (error) {
                if (error instanceof z.ZodError) {
                    return reply.code(400).send({
                        error: "Validation Error",
                        details: error.errors,
                    });
                }
                console.error("[Updates] Check error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Get latest version YAML for electron-updater (auto-detect platform)
     * GET /api/updates/latest.yml
     * Detects platform from User-Agent and returns YAML
     */
    fastify.get(
        "/latest.yml",
        async (
            request: FastifyRequest,
            reply: FastifyReply
        ) => {
            try {
                // Detect platform from User-Agent
                const userAgent = request.headers['user-agent'] || '';
                let platform = 'win32'; // Default to Windows

                if (userAgent.includes('Darwin') || userAgent.includes('Mac')) {
                    platform = 'darwin';
                } else if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
                    platform = 'linux';
                }

                console.log(`[Updates] latest.yml requested - User-Agent: ${userAgent}, detected platform: ${platform}`);

                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions 
           WHERE platform = ? AND is_active = TRUE 
           ORDER BY created_at DESC 
           LIMIT 1`,
                    [platform]
                );

                if (versions.length === 0) {
                    return reply.code(404).send({ error: `No version found for platform: ${platform}` });
                }

                const v = versions[0];
                // Use flat filename format - no slashes to avoid Windows directory issues in temp path
                // electron-updater uses the URL path as part of the temp filename
                const downloadFileName = `file-${v.id}.exe`;
                const safeFileName = `mahaly-update-${v.version}.exe`;

                console.log(`[Updates] YAML Response - version: ${v.version}, url: ${downloadFileName}, path: ${safeFileName}`);

                const yaml = `version: ${v.version}
files:
  - url: ${downloadFileName}
    sha512: ${v.checksum || ''}
    size: ${v.file_size || 0}
path: ${safeFileName}
sha512: ${v.checksum || ''}
releaseDate: ${new Date(v.created_at).toISOString()}
`;
                return reply.type('text/yaml').send(yaml);
            } catch (error) {
                console.error("[Updates] latest.yml error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Download update file with flat filename format
     * GET /api/updates/file-{id}.exe
     * This format avoids Windows temp file path issues with slashes
     */
    fastify.get(
        "/file-:id.exe",
        async (
            request: FastifyRequest<{ Params: { id: string } }>,
            reply: FastifyReply
        ) => {
            try {
                const { id } = request.params;
                console.log(`[Updates] File download requested: file-${id}.exe`);

                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions WHERE id = ?`,
                    [id]
                );

                if (versions.length === 0) {
                    console.log(`[Updates] Version not found: ${id}`);
                    return reply.code(404).send({ error: "Version not found" });
                }

                const version = versions[0];
                console.log(`[Updates] Found version: ${version.version}, download_url: ${version.download_url}`);

                // If download_url is external URL, redirect
                if (version.download_url && version.download_url.startsWith("http")) {
                    console.log(`[Updates] Redirecting to external URL: ${version.download_url}`);
                    return reply.redirect(version.download_url);
                }

                // Check if file exists locally
                const uploadsDir = process.env.UPLOADS_DIR || "./uploads/releases";

                let fileName = version.download_url;
                if (!fileName) {
                    console.log(`[Updates] No download_url set for version ${id}`);
                    return reply.code(404).send({ error: "No download URL configured for this version" });
                }

                if (fileName.includes('/')) {
                    fileName = path.basename(fileName);
                }

                const filePath = path.join(uploadsDir, fileName);
                console.log(`[Updates] Looking for file at: ${filePath}`);

                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    console.log(`[Updates] File found, size: ${stats.size} bytes`);

                    const stream = fs.createReadStream(filePath);
                    return reply
                        .header("Content-Type", "application/octet-stream")
                        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
                        .header("Content-Length", stats.size)
                        .send(stream);
                }

                console.log(`[Updates] File not found at: ${filePath}`);
                return reply.code(404).send({ error: "File not found" });
            } catch (error) {
                console.error("[Updates] File download error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    details: error instanceof Error ? error.message : "Unknown error"
                });
            }
        }
    );

    /**
     * Get latest version info for electron-updater
     * GET /api/updates/latest/:platform
     * Returns JSON format for electron-updater
     */
    fastify.get(
        "/latest/:platform",
        async (
            request: FastifyRequest<{ Params: { platform: string } }>,
            reply: FastifyReply
        ) => {
            try {
                let { platform } = request.params;

                // Handle latest.yml requests - extract platform from path
                // electron-updater requests: /latest/win32/latest.yml or /latest/darwin/latest.yml
                if (platform.endsWith('.yml')) {
                    // This is a direct .yml request, extract platform
                    platform = platform.replace('-latest.yml', '').replace('latest.yml', '').replace('.yml', '');
                }

                // Map platform names
                const platformMap: Record<string, string> = {
                    "win32": "win32",
                    "darwin": "darwin",
                    "linux": "linux",
                    "mac": "darwin",
                    "win": "win32",
                };

                const dbPlatform = platformMap[platform.toLowerCase()] || platform;

                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions 
           WHERE platform = ? AND is_active = TRUE 
           ORDER BY created_at DESC 
           LIMIT 1`,
                    [dbPlatform]
                );

                if (versions.length === 0) {
                    return reply.code(404).send({ error: "No version found for this platform" });
                }

                const v = versions[0];
                const baseUrl = process.env.API_BASE_URL || `${request.protocol}://${request.hostname}`;

                // Check if request wants YAML (from electron-updater)
                const url = request.url;
                if (url.includes('.yml') || request.headers.accept?.includes('text/yaml')) {
                    // Return YAML format for electron-updater
                    // url: full URL for download
                    // path: simple filename for local temp file (no special chars for Windows)
                    const downloadUrl = `${baseUrl}/api/updates/download/${v.id}`;
                    const safeFileName = `mahaly-update-${v.version}.exe`; // Simple ASCII filename
                    console.log(`[Updates] YAML Response - baseUrl: ${baseUrl}, downloadUrl: ${downloadUrl}`);
                    const yaml = `version: ${v.version}
files:
  - url: ${downloadUrl}
    sha512: ${v.checksum || ''}
    size: ${v.file_size || 0}
path: ${safeFileName}
sha512: ${v.checksum || ''}
releaseDate: ${new Date(v.created_at).toISOString()}
`;
                    console.log(`[Updates] YAML Content:\n${yaml}`);
                    return reply.type('text/yaml').send(yaml);
                }

                // Return JSON format for direct API calls
                return reply.send({
                    version: v.version,
                    files: [
                        {
                            url: `${baseUrl}/api/updates/download/${v.id}`,
                            sha512: v.checksum,
                            size: v.file_size,
                        },
                    ],
                    path: v.download_url,
                    sha512: v.checksum,
                    releaseNotes: v.release_notes,
                });
            } catch (error) {
                console.error("[Updates] Latest error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Handle electron-updater latest.yml requests
     * GET /api/updates/latest/:platform/latest.yml
     */
    fastify.get(
        "/latest/:platform/latest.yml",
        async (
            request: FastifyRequest<{ Params: { platform: string } }>,
            reply: FastifyReply
        ) => {
            try {
                const { platform } = request.params;

                // Map platform names
                const platformMap: Record<string, string> = {
                    "win32": "win32",
                    "darwin": "darwin",
                    "linux": "linux",
                    "mac": "darwin",
                    "win": "win32",
                };

                const dbPlatform = platformMap[platform.toLowerCase()] || platform;

                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions 
           WHERE platform = ? AND is_active = TRUE 
           ORDER BY created_at DESC 
           LIMIT 1`,
                    [dbPlatform]
                );

                if (versions.length === 0) {
                    return reply.code(404).send({ error: "No version found for this platform" });
                }

                const v = versions[0];
                const baseUrl = process.env.API_BASE_URL || `${request.protocol}://${request.hostname}`;

                // Return YAML format for electron-updater
                // url: full URL for download
                // path: simple filename for local temp file (no special chars for Windows)
                const downloadUrl = `${baseUrl}/api/updates/download/${v.id}`;
                const safeFileName = `mahaly-update-${v.version}.exe`; // Simple ASCII filename
                const yaml = `version: ${v.version}
files:
  - url: ${downloadUrl}
    sha512: ${v.checksum || ''}
    size: ${v.file_size || 0}
path: ${safeFileName}
sha512: ${v.checksum || ''}
releaseDate: ${new Date(v.created_at).toISOString()}
`;
                return reply.type('text/yaml').send(yaml);
            } catch (error) {
                console.error("[Updates] Latest YAML error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Download update file
     * GET /api/updates/download/:id
     */
    fastify.get(
        "/download/:id",
        async (
            request: FastifyRequest<{ Params: { id: string } }>,
            reply: FastifyReply
        ) => {
            try {
                const { id } = request.params;
                console.log(`[Updates] Download requested for version: ${id}`);

                const versions = await query<AppVersion>(
                    `SELECT * FROM app_versions WHERE id = ?`,
                    [id]
                );

                if (versions.length === 0) {
                    console.log(`[Updates] Version not found: ${id}`);
                    return reply.code(404).send({ error: "Version not found" });
                }

                const version = versions[0];
                console.log(`[Updates] Found version: ${version.version}, download_url: ${version.download_url}`);

                // If download_url is external URL, redirect
                if (version.download_url && version.download_url.startsWith("http")) {
                    console.log(`[Updates] Redirecting to external URL: ${version.download_url}`);
                    return reply.redirect(version.download_url);
                }

                // Check if file exists locally
                const uploadsDir = process.env.UPLOADS_DIR || "./uploads/releases";

                // Handle different download_url formats
                let fileName = version.download_url;
                if (!fileName) {
                    console.log(`[Updates] No download_url set for version ${id}`);
                    return reply.code(404).send({ error: "No download URL configured for this version" });
                }

                // If download_url is a full path, extract filename
                if (fileName.includes('/')) {
                    fileName = path.basename(fileName);
                }

                const filePath = path.join(uploadsDir, fileName);
                console.log(`[Updates] Looking for file at: ${filePath}`);

                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    console.log(`[Updates] File found, size: ${stats.size} bytes`);

                    const stream = fs.createReadStream(filePath);
                    // Use ASCII-safe filename for Content-Disposition
                    const safeFileName = encodeURIComponent(fileName).replace(/%20/g, ' ');
                    return reply
                        .header("Content-Type", "application/octet-stream")
                        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
                        .header("Content-Length", stats.size)
                        .send(stream);
                }

                // Try absolute path if relative didn't work
                const absolutePath = path.resolve(uploadsDir, fileName);
                console.log(`[Updates] Trying absolute path: ${absolutePath}`);

                if (fs.existsSync(absolutePath)) {
                    const stats = fs.statSync(absolutePath);
                    console.log(`[Updates] File found at absolute path, size: ${stats.size} bytes`);

                    const stream = fs.createReadStream(absolutePath);
                    // Use ASCII-safe filename for Content-Disposition
                    return reply
                        .header("Content-Type", "application/octet-stream")
                        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
                        .header("Content-Length", stats.size)
                        .send(stream);
                }

                console.log(`[Updates] File not found at any location`);
                return reply.code(404).send({
                    error: "File not found",
                    details: `Looked for: ${filePath} and ${absolutePath}`
                });
            } catch (error) {
                console.error("[Updates] Download error:", error);
                return reply.code(500).send({
                    error: "Internal server error",
                    details: error instanceof Error ? error.message : "Unknown error"
                });
            }
        }
    );

    /**
     * Get all versions (for admin dashboard)
     * GET /api/updates/versions
     */
    fastify.get(
        "/versions",
        async (
            request: FastifyRequest<{ Querystring: { platform?: string } }>,
            reply: FastifyReply
        ) => {
            try {
                const { platform } = request.query;
                let sql = `SELECT * FROM app_versions ORDER BY created_at DESC`;
                const params: string[] = [];

                if (platform) {
                    sql = `SELECT * FROM app_versions WHERE platform = ? ORDER BY created_at DESC`;
                    params.push(platform);
                }

                const versions = await query<AppVersion>(sql, params);
                return reply.send({ data: versions });
            } catch (error) {
                console.error("[Updates] Versions list error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Create new version (for admin dashboard)
     * POST /api/updates/versions
     */
    fastify.post(
        "/versions",
        async (
            request: FastifyRequest<{
                Body: {
                    version: string;
                    platform: string;
                    download_url: string;
                    release_notes?: string;
                    file_size?: number;
                    checksum?: string;
                    is_mandatory?: boolean;
                };
            }>,
            reply: FastifyReply
        ) => {
            try {
                const { version, platform, download_url, release_notes, file_size, checksum, is_mandatory } = request.body;

                const id = crypto.randomUUID();
                await query(
                    `INSERT INTO app_versions (id, version, platform, download_url, release_notes, file_size, checksum, is_mandatory)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, version, platform, download_url, release_notes || null, file_size || 0, checksum || null, is_mandatory || false]
                );

                return reply.status(201).send({
                    id,
                    message: "تم إضافة الإصدار بنجاح",
                });
            } catch (error) {
                console.error("[Updates] Create version error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Delete version (for admin dashboard)
     * DELETE /api/updates/versions/:id
     */
    fastify.delete(
        "/versions/:id",
        async (
            request: FastifyRequest<{ Params: { id: string } }>,
            reply: FastifyReply
        ) => {
            try {
                const { id } = request.params;
                await query(`DELETE FROM app_versions WHERE id = ?`, [id]);
                return reply.send({ message: "تم حذف الإصدار بنجاح" });
            } catch (error) {
                console.error("[Updates] Delete version error:", error);
                return reply.code(500).send({ error: "Internal server error" });
            }
        }
    );

    /**
     * Upload update file
     * POST /api/updates/upload
     * Accepts multipart form data with file
     */
    fastify.post(
        "/upload",
        async (
            request: FastifyRequest,
            reply: FastifyReply
        ) => {
            try {
                // Get multipart data
                const data = await request.file();

                if (!data) {
                    return reply.code(400).send({ error: "No file uploaded" });
                }

                const fileName = data.filename;
                const uploadsDir = process.env.UPLOADS_DIR || "./uploads/releases";

                // Ensure directory exists
                if (!fs.existsSync(uploadsDir)) {
                    fs.mkdirSync(uploadsDir, { recursive: true });
                }

                const filePath = path.join(uploadsDir, fileName);

                // Save file
                const fileBuffer = await data.toBuffer();
                fs.writeFileSync(filePath, fileBuffer);

                // Calculate file size
                const fileSize = fileBuffer.length;

                // Calculate SHA512 checksum
                const crypto = await import("crypto");
                const checksum = crypto.createHash("sha512").update(fileBuffer).digest("base64");

                console.log(`[Updates] File uploaded: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

                return reply.send({
                    success: true,
                    message: "تم رفع الملف بنجاح",
                    fileName,
                    fileSize,
                    checksum,
                    filePath: fileName, // Only return filename, not full path
                });
            } catch (error) {
                console.error("[Updates] Upload error:", error);
                return reply.code(500).send({ error: "فشل رفع الملف" });
            }
        }
    );
}

/**
 * Compare semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/, "").split(".").map(Number);
    const parts2 = v2.replace(/^v/, "").split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}
