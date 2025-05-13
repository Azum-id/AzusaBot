/**
 * ig - Mendownload foto atau video dari Instagram
 */
import { IgApiClient } from "instagram-private-api";
import fs from "fs/promises";
import path from "path";
import { urlSegmentToInstagramId } from "instagram-id-to-url-segment";
import axios from "axios";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Logger } from "../utils/AzusaLogger.js";
import dotenv from "dotenv";
dotenv.config();
// Konfigurasi
const CONFIG = {
    SESSION_FILE_PATH: "./session.json",
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 2000,
    TEMP_DIR: "./temp"
};
// Initialize logger
const AzusaLog = new Logger();
const command = {
    name: "ig",
    aliases: ["instagram", "igdl"],
    description: "Mendownload foto atau video dari Instagram",
    usage: "/ig [URL Instagram]",
    cooldown: 10, // Cooldown dalam detik
    async execute(sock, msg, args, { AzusaLog, from, pushName }) {
        try {
            // Periksa apakah URL diberikan
            if (!args[0]) {
                await sock.sendMessage(
                    from,
                    {
                        text: `⚠️ *Format Salah*\n\nFormat yang benar: /ig [URL
Instagram]\nContoh: /ig https://www.instagram.com/p/abcdef123456/`
                    },
                    { quoted: msg }
                );
                return;
            }
            // Kirim pesan loading
            await sock.sendMessage(
                from,
                {
                    text: `⏳  *Memproses...*\n\nSedang mengambil konten dari Instagram.\nMohon tunggu sebentar...`
                },
                { quoted: msg }
            );
            // Validasi URL dan dapatkan shortcode
            const url = args[0];
            const shortcode = InstagramUrlParser.getShortcode(url);
            if (!shortcode) {
                await sock.sendMessage(from, {
                    text: `❌  *URL Tidak Valid*\n\nURL yang Anda berikan bukan URL Instagram yang valid.\nContoh URL yang valid: https://www.instagram.com/p/abcdef123456/`
                });
                return;
            }
            // Konversi shortcode ke media ID
            const mediaId = InstagramUrlParser.shortcodeToMediaId(shortcode);
            if (!mediaId) {
                await sock.sendMessage(
                    from,
                    {
                        text: `❌  *Error*\n\nGagal mengkonversi shortcode Instagram.`
                    },
                    { quoted: msg }
                );
                return;
            }
            // Inisialisasi Instagram client
            const client = new InstagramClient();
            await client.initialize();
            // Login jika diperlukan
            if (!(await client.login())) {
                await sock.sendMessage(
                    from,
                    {
                        text: `❌  *Error Login*\n\nGagal login ke Instagram. Silakan coba lagi nanti.`
                    },
                    { quoted: msg }
                );
                return;
            }
            // Ambil info media
            const mediaItem = await client.getMediaInfo(mediaId);
            if (!mediaItem) {
                await sock.sendMessage(
                    from,
                    {
                        text: `❌  *Media Tidak Ditemukan*\n\nPost Instagram tidak ditemukan atau sudah dihapus.`
                    },
                    { quoted: msg }
                );
                return;
            }
            // Dapatkan data media
            const mediaType = InstagramClient.getMediaType(mediaItem);
            const mediaUrls = InstagramClient.getMediaUrls(mediaItem);
            const username = mediaItem.user?.username || "unknown";
            const caption = mediaItem.caption?.text || "";
            // Cek apakah ada URL media yang bisa diunduh
            if (!mediaUrls || mediaUrls.length === 0) {
                await sock.sendMessage(
                    from,
                    {
                        text: `❌  *Gagal Mengambil Media*\n\nTidak ada media yang bisa diunduh dari post ini.`
                    },
                    { quoted: msg }
                );
                return;
            }
            const stats = {
                likeCount: mediaItem.like_count || 0,
                commentCount: mediaItem.comment_count || 0,
                viewCount:
                    mediaItem.play_count !== undefined
                        ? mediaItem.play_count
                        : mediaItem.view_count !== undefined
                        ? mediaItem.view_count
                        : null
            };
            const formattedCaption = formatCaption(
                username,
                caption,
                mediaUrls.length,
                mediaType,
                url,
                stats
            );
            if (mediaType === "Album") {
                // Album: kirim semua media dulu, lalu caption
                let successCount = 0;
                for (const [index, item] of mediaUrls.entries()) {
                    try {
                        if (item.type === "Photo") {
                            await sock.sendMessage(from, {
                                image: { url: item.url }
                            });
                        } else {
                            await sock.sendMessage(from, {
                                video: { url: item.url }
                            });
                        }
                        successCount++;
                    } catch (itemError) {
                        AzusaLog.log({
                            type: "error",
                            message: `Gagal mengirim item Instagram ${index}: ${itemError.message}`
                        });
                    }
                }
                if (successCount > 0) {
                    await sock.sendMessage(
                        from,
                        {
                            text: formattedCaption
                        },
                        { quoted: msg }
                    );
                }
                if (successCount === 0) {
                    await sock.sendMessage(
                        from,
                        {
                            text: `❌  *Gagal*\n\nTidak ada media yang berhasil dikirim.`
                        },
                        { quoted: msg }
                    );
                } else if (successCount < mediaUrls.length) {
                    await sock.sendMessage(
                        from,
                        {
                            text: `⚠️ *Sebagian Berhasil*\n\nBerhasil mengirim ${successCount} dari ${mediaUrls.length} media.`
                        },
                        { quoted: msg }
                    );
                }
            } else {
                // Single photo/video/reel: kirim langsung dengan caption
                try {
                    const firstItem = mediaUrls[0];
                    if (firstItem.type === "Photo") {
                        await sock.sendMessage(
                            from,
                            {
                                image: { url: firstItem.url },
                                caption: formattedCaption
                            },
                            { quoted: msg }
                        );
                    } else {
                        await sock.sendMessage(
                            from,
                            {
                                video: { url: firstItem.url },
                                caption: formattedCaption
                            },
                            { quoted: msg }
                        );
                    }
                } catch (itemError) {
                    AzusaLog.log({
                        type: "error",
                        message: `Gagal mengirim media: ${itemError.message}`
                    });
                    await sock.sendMessage(
                        from,
                        {
                            text: `❌  *Gagal*\n\nTidak berhasil mengirim media.`
                        },
                        { quoted: msg }
                    );
                }
            }
        } catch (err) {
            await sock.sendMessage(
                from,
                {
                    text: `❌  *Error*\n\nTerjadi kesalahan saat mengunduh konten Instagram.\nSilakan coba lagi nanti.`
                },
                { quoted: msg }
            );
            AzusaLog.log({
                type: "error",
                message: `Command ig error: ${err.message}`,
                stack: err.stack
            });
            throw new Error(`Gagal menjalankan command ig: ${err.message}`);
        }
    }
};
export default command;
// Fungsi utility
function formatCaption(username, caption, totalItems, mediaType, url, stats) {
    const formatNum = num =>
        num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";
    let formattedCaption = `*Instagram ${mediaType}*\n`;
    formattedCaption += `👤 *@${username}*\n\n`;
    if (caption) {
        const maxLength = 300;
        formattedCaption +=
            caption.length > maxLength
                ? caption.substring(0, maxLength) + "..."
                : caption;
        formattedCaption += "\n\n";
    }
    // Tambahkan statistik
    formattedCaption += `❤️ *${formatNum(stats.likeCount)}* suka\n`;
    formattedCaption += `💬 *${formatNum(stats.commentCount)}* komentar\n`;
    if (stats.viewCount !== null) {
        formattedCaption += `▶️ *${formatNum(stats.viewCount)}* dilihat\n`;
    }
    formattedCaption += `\n> Downloaded By : _Azusa-Bot_`;
    return formattedCaption;
}
async function downloadFile(url, filePath) {
    const response = await axios({
        method: "GET",
        url: url,
        responseType: "stream"
    });
    const writer = createWriteStream(filePath);
    await pipeline(response.data, writer);
    return filePath;
}
// Kelas untuk mengelola operasi Instagram API
class InstagramClient {
    constructor() {
        this.ig = new IgApiClient();
        this.sessionManager = new SessionManager(CONFIG.SESSION_FILE_PATH);
        this.isLoggedIn = false;
    }
    async initialize() {
        try {
            // Validasi variabel lingkungan
            this._validateEnvironmentVars();
            // Generate device
            this.ig.state.generateDevice(process.env.IG_USERNAME);
            // Set proxy jika ada
            if (process.env.IG_PROXY) {
                this.ig.state.proxyUrl = process.env.IG_PROXY;
            }
            // Subscribe ke event end request untuk menyimpan sesi
            this.ig.request.end$.subscribe(async () => {
                try {
                    const serialized = await this.ig.state.serialize();
                    delete serialized.constants; // Menghapus constants untuk mengurangi ukuran file
                    await this.sessionManager.save(serialized);
                } catch (error) {
                    AzusaLog.handleError(
                        error,
                        "Gagal menyimpan sesi setelah request"
                    );
                }
            });
            return true;
        } catch (error) {
            AzusaLog(error, "Gagal menginisialisasi Instagram client");

            return false;
        }
    }
    _validateEnvironmentVars() {
        // Validasi variabel lingkungan yang diperlukan
        if (!process.env.IG_USERNAME) {
            throw new Error("IG_USERNAME tidak ditemukan di file .env");
        }
        if (!process.env.IG_PASSWORD) {
            throw new Error("IG_PASSWORD tidak ditemukan di file .env");
        }
    }
    async login() {
        try {
            // Coba load session terlebih dahulu
            if (await this.sessionManager.exists()) {
                const sessionData = await this.sessionManager.load();
                if (sessionData) {
                    await this.ig.state.deserialize(sessionData);
                    // Validasi sesi dengan mencoba mengambil user saat ini
                    try {
                        await this.ig.account.currentUser();
                        this.isLoggedIn = true;

                        AzusaLog.log({
                            type: "success",
                            message: `Berhasil login menggunakan sesi yang tersimpan`
                        });
                        return true;
                    } catch (sessionError) {
                        AzusaLog.log({
                            type: "warning",
                            message: `Sesi kadaluarsa, mencoba login ulang...`
                        });
                        await this.sessionManager.clear();
                    }
                }
            }
            // Login dengan username dan password
            await this.ig.account.login(
                process.env.IG_USERNAME,
                process.env.IG_PASSWORD
            );
            this.isLoggedIn = true;
            // Simpan sesi baru
            const serialized = await this.ig.state.serialize();
            delete serialized.constants;
            await this.sessionManager.save(serialized);

            AzusaLog.log({
                type: "success",
                message: `Success Login with Username & Password`
            });
            return true;
        } catch (error) {
            this.isLoggedIn = false;
            AzusaLog.handleError(error, "Failed Login");

            return false;
        }
    }
    async getMediaInfo(mediaId) {
        let attempts = 0;
        while (attempts < CONFIG.MAX_RETRY_ATTEMPTS) {
            try {
                if (!this.isLoggedIn) {
                    const loginSuccess = await this.login();
                    if (!loginSuccess) {
                        throw new Error("Tidak dapat melanjutkan tanpa login");
                    }
                }
                const media = await this.ig.media.info(mediaId);
                if (!media || !media.items || media.items.length === 0) {
                    throw new Error("Media tidak ditemukan atau sudah dihapus");
                }
                return media.items[0];
            } catch (error) {
                attempts++;
                if (
                    error.name === "IgResponseError" &&
                    error.message.includes("login_required")
                ) {
                    this.isLoggedIn = false;
                    AzusaLog.log({
                        type: "warning",
                        message: `Sesi kadaluarsa, mencoba login ulang...`
                    });
                    await this.sessionManager.clear();
                } else if (
                    error.name === "IgResponseError" &&
                    error.message.includes("media_not_found")
                ) {
                    AzusaLog.log({
                        type: "error",
                        message: `Media tidak ditemukan atau sudah dihapus:`
                    });

                    break;
                } else {
                    if (attempts < CONFIG.MAX_RETRY_ATTEMPTS) {
                        AzusaLog.log({
                            type: "warning",
                            message: `Gagal mengambil media (percobaan ${attempts}/${CONFIG.MAX_RETRY_ATTEMPTS}). Mencoba lagi...`
                        });

                        // Delay before retry
                        await new Promise(resolve =>
                            setTimeout(resolve, CONFIG.RETRY_DELAY_MS)
                        );
                    } else {
                        AzusaLog.handleError(
                            error,
                            `Gagal mengambil media setelah ${CONFIG.MAX_RETRY_ATTEMPTS} percobaan:`
                        );
                    }
                }
            }
        }
        return null;
    }
    static getMediaType(media) {
        const { media_type, product_type } = media;
        if (media_type === 1) return "Photo";
        if (media_type === 2) {
            if (product_type === "feed") return "Video";
            if (product_type === "igtv") return "IGTV";
            if (product_type === "clips") return "Reel";
            return "Video"; // Default fallback for media_type 2
        }
        if (media_type === 8) return "Album";
        return "Unknown";
    }
    static getMediaUrls(media) {
        try {
            const urls = [];
            if (media.media_type === 8 && Array.isArray(media.carousel_media)) {
                // Album dengan beberapa media
                media.carousel_media.forEach((item, index) => {
                    if (
                        item.media_type === 1 &&
                        item.image_versions2?.candidates?.length > 0
                    ) {
                        // Photo
                        urls.push({
                            type: "Photo",
                            url: item.image_versions2.candidates[0].url,
                            index: index
                        });
                    } else if (
                        item.media_type === 2 &&
                        item.video_versions?.length > 0
                    ) {
                        // Video
                        urls.push({
                            type: "Video",
                            url: item.video_versions[0].url,
                            index: index
                        });
                    }
                });
            } else if (
                media.media_type === 2 &&
                media.video_versions?.length > 0
            ) {
                // Single video
                urls.push({
                    type: "Video",
                    url: media.video_versions[0].url,
                    index: 0
                });
            } else if (
                media.media_type === 1 &&
                media.image_versions2?.candidates?.length > 0
            ) {
                // Single photo
                urls.push({
                    type: "Photo",
                    url: media.image_versions2.candidates[0].url,
                    index: 0
                });
            }
            return urls;
        } catch (error) {
            AzusaLog(error, "Gagal mengekstrak URL media");
            return [];
        }
    }
}
// Kelas untuk mengelola session
class SessionManager {
    constructor(filePath) {
        this.filePath = filePath;
    }
    async exists() {
        try {
            await fs.access(this.filePath);
            return true;
        } catch {
            return false;
        }
    }
    async save(data) {
        try {
            // Pastikan data tidak null atau undefined
            if (!data) {
                throw new Error("Data sesi kosong");
            }
            // Buat direktori jika belum ada
            const dir = path.dirname(this.filePath);
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (err) {
                // Ignore error jika direktori sudah ada
                if (err.code !== "EEXIST") throw err;
            }
            await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            AzusaLog.handleError(error, "Gagal menyimpan sesi");
            return false;
        }
    }
    async load() {
        try {
            if (!(await this.exists())) {
                return null;
            }
            const data = await fs.readFile(this.filePath, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            AzusaLog.handleError(error, "Gagal memuat sesi");
            return null;
        }
    }
    async clear() {
        try {
            if (await this.exists()) {
                await fs.unlink(this.filePath);
                AzusaLog.log({ type: "info", message: "Sesi dihapus" });
            }
            return true;
        } catch (error) {
            AzusaLog.handleError(error, "Gagal menghapus sesi");
            return false;
        }
    }
}
// Utilitas untuk URL dan shortcode Instagram
class InstagramUrlParser {
    static getShortcode(url) {
        try {
            if (
                !url ||
                typeof url !== "string" ||
                !url.includes("instagram.com")
            ) {
                return null;
            }
            let parsedUrl;
            try {
                parsedUrl = new URL(url);
            } catch {
                // Coba tambahkan protokol jika tidak ada
                if (!url.startsWith("http")) {
                    try {
                        parsedUrl = new URL(`https://${url}`);
                    } catch {
                        return null;
                    }
                } else {
                    return null;
                }
            }
            const pathname = parsedUrl.pathname;
            const patterns = [
                /\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/,
                /\/[^\/]+\/(reel|p|tv)\/([a-zA-Z0-9_-]+)/
            ];
            for (const pattern of patterns) {
                const match = pathname.match(pattern);
                if (match) {
                    return match[2];
                }
            }
            return null;
        } catch (error) {
            AzusaLog.handleError(error, "Gagal mengurai URL Instagram");
            return null;
        }
    }
    static shortcodeToMediaId(shortcode) {
        try {
            return urlSegmentToInstagramId(shortcode);
        } catch (error) {
            AzusaLog.handleError(
                error,
                "Gagal mengonversi shortcode ke media ID"
            );

            return null;
        }
    }
}

