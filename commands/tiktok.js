/**
 * tiktok downloader command - Download TikTok videos or images
 */

import Tiktok from "tiktermux";
import axios from "axios";
import { fetchTikTokData, TikTokApiError } from "../modules/tiktok.js";

/**
 * Formats a number for display (e.g., 1500 -> 1.5K)
 * @param {number} num - The number to format
 * @returns {string} - Formatted number string
 */
const formatNumber = num => {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    }
    return num.toString();
};

/**
 * Formats duration in seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration string
 */
const formatDuration = seconds => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

/**
 * Formats Unix timestamp to readable date
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} - Formatted date string
 */
const formatDate = timestamp => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
};

/**
 * Generates a formatted caption for TikTok videos
 * @param {string} url - TikTok video URL
 * @param {Object} options - Options for caption generation
 * @param {boolean} options.includeEmojis - Whether to include emojis in caption (default: true)
 * @param {boolean} options.includeStats - Whether to include video stats (default: true)
 * @param {boolean} options.includeDownloadInfo - Whether to include download info (default: true)
 * @param {string} options.botName - Name of the bot for footer (default: 'Bot')
 * @returns {Promise<Object>} - Object containing caption and video data
 * @throws {TikTokApiError} - If the URL is invalid or the API request fails
 */
export async function captionGenerator(url, options = {}) {
    // Set default options
    const {
        includeEmojis = true,
        includeStats = true,
        includeDownloadInfo = true,
        botName = "Bot"
    } = options;

    // Emojis for different sections
    const emoji = {
        title: includeEmojis ? "📝 " : "",
        author: includeEmojis ? "👤 " : "",
        music: includeEmojis ? "🎵 " : "",
        duration: includeEmojis ? "⏱️ " : "",
        date: includeEmojis ? "📅 " : "",
        plays: includeEmojis ? "▶️ " : "",
        likes: includeEmojis ? "❤️ " : "",
        comments: includeEmojis ? "💬 " : "",
        shares: includeEmojis ? "🔄 " : "",
        downloads: includeEmojis ? "📥 " : ""
    };

    try {
        // Validate TikTok URL
        if (!isValidTikTokUrl(url)) {
            throw new TikTokApiError("URL TikTok tidak valid");
        }

        // Fetch TikTok data
        const response = await fetchTikTokData(url);
        const { data } = response;

        if (!data) {
            throw new TikTokApiError("Gagal mendapatkan data TikTok");
        }

        // Build caption
        let caption = `*${emoji.title}TikTok Downloader*\n\n`;

        // Video title
        if (data.title) {
            caption += `${emoji.title}*Caption:* ${data.title.trim()}\n\n`;
        }

        // Video author
        if (data.author) {
            caption += `${emoji.author}*Author:* @${data.author.unique_id}`;
            if (
                data.author.nickname &&
                data.author.nickname !== data.author.unique_id
            ) {
                caption += ` (${data.author.nickname})`;
            }
            caption += "\n";
        }

        // Music info
        if (data.music_info) {
            const musicTitle = data.music_info.title || "Unknown";
            const musicAuthor = data.music_info.author || "Unknown";
            const isOriginal = data.music_info.original
                ? " (Original Sound)"
                : "";

            caption += `${emoji.music}*Music:* ${musicTitle} - ${musicAuthor}${isOriginal}\n`;
        }

        // Duration
        if (data.duration) {
            caption += `${emoji.duration}*Duration:* ${formatDuration(
                data.duration
            )}\n`;
        }

        // Stats section
        if (includeStats) {
            caption += "\n*📊 Stats:*\n";

            if (data.play_count !== undefined) {
                caption += `${emoji.plays}Views: ${formatNumber(
                    data.play_count
                )}\n`;
            }

            if (data.digg_count !== undefined) {
                caption += `${emoji.likes}Likes: ${formatNumber(
                    data.digg_count
                )}\n`;
            }

            if (data.comment_count !== undefined) {
                caption += `${emoji.comments}Comments: ${formatNumber(
                    data.comment_count
                )}\n`;
            }

            if (data.share_count !== undefined) {
                caption += `${emoji.shares}Shares: ${formatNumber(
                    data.share_count
                )}\n`;
            }

            if (data.download_count !== undefined) {
                caption += `${emoji.downloads}Downloads: ${formatNumber(
                    data.download_count
                )}\n`;
            }
        }
        // Creation date
        if (data.create_time) {
            caption += `${emoji.date}*Posted:* ${formatDate(
                data.create_time
            )}\n`;
        }
        // Footer
        caption += `\n> Downloaded by : _Azusa - Bot_\n`;

        // Return caption and important data
        return {
            caption
        };
    } catch (error) {
        if (error instanceof TikTokApiError) {
            throw error;
        } else {
            throw new TikTokApiError(
                `Gagal generate caption: ${error.message}`
            );
        }
    }
}

/**
 * Validates a TikTok post URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if the URL is a valid TikTok post URL, false otherwise
 */
function isValidTikTokUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    try {
        const urlObj = new URL(url);

        // List of accepted TikTok hostnames
        const validHostnames = [
            "tiktok.com",
            "www.tiktok.com",
            "m.tiktok.com",
            "vm.tiktok.com",
            "vt.tiktok.com"
        ];

        if (!validHostnames.includes(urlObj.hostname)) {
            return false;
        }

        // List of regex patterns for different TikTok URL formats
        const patterns = [
            // Standard web format
            /^https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,

            // Mobile share shortlink
            /^https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9]+\/?$/,

            // Short format (mobile)
            /^https?:\/\/m\.tiktok\.com\/v\/\d+/,

            // Regional domains
            /^https?:\/\/(?:www\.)?tiktok\.com\/[a-z]{2}\/[@\w.-]+\/video\/\d+/,

            // vt.tiktok.com shortlink
            /^https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9]+\/?$/
        ];

        return patterns.some(pattern => pattern.test(url));
    } catch (error) {
        return false;
    }
}

/**
 * Creates a formatted caption for the downloaded TikTok media
 * @param {Object} result - The TikTok result object from API
 * @param {string} pushName - Name of user who requested the download
 * @param {string} url - Original TikTok URL
 * @returns {string} - Formatted caption
 */
function generateCaption(result, pushName, url) {
    const author = result.author || {};
    const stats = result.statistics || {};
    const description = result.desc || "";
    const music = result.music || {};

    // Format statistics with thousands separator
    const formatNum = num =>
        num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";

    let caption = `*TikTok Downloader*\n\n`;

    // Author information
    caption += `👤 *${author.nickname || "Unknown"}*\n\n`;

    // Content description (if available)
    if (description.trim()) {
        caption += `💬 ${description.substring(0, 150)}${
            description.length > 150 ? "..." : ""
        }\n\n`;
    }

    // Statistics

    caption += `❤️ Likes: ${formatNum(stats.likeCount)}\n`;
    caption += `💬 Comments: ${formatNum(stats.commentCount)}\n`;
    caption += `🔄 Shares: ${formatNum(stats.shareCount)}\n`;

    caption += `\n> Downloaded by : _Azusa-Bot_\n`;

    return caption;
}

/**
 * Fungsi untuk mengambil data dari URL Tikcdn dengan header custom
 * @param {string} url - URL endpoint Tikcdn
 * @returns {Promise<Object>} - Response dari server
 */
async function fetchTikcdnData(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                authority: "tikcdn.io",
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "accept-language": "en-US,en;q=0.9",
                referer: "https://ssstik.io/",
                "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
                "sec-ch-ua-mobile": "?1",
                "sec-ch-ua-platform": '"Android"',
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "cross-site",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
                "user-agent":
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
            },
            responseType: "arraybuffer"
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching Tikcdn data:", error);
        throw error;
    }
}

const command = {
    name: "tiktok",
    aliases: ["td", "tt"],
    description: "Download TikTok video (HD) or images from a URL",
    usage: "/tiktok <url>",

    /**
     * Execute the tiktok downloader command
     * @param {Object} sock - The WhatsApp socket instance
     * @param {Object} msg - The message object
     * @param {Array} args - Command arguments
     * @param {Object} context - Additional context like logger
     *   - AzusaLog: logger instance
     *   - from: ID pengirim/chat
     *   - pushName: nama pengguna
     */
    async execute(sock, msg, args, { AzusaLog, from, pushName }) {
        try {
            const url = args[0];

            // Enhanced URL validation
            if (!url || !isValidTikTokUrl(url)) {
                return await sock.sendMessage(from, {
                    text: `Invalid TikTok URL, ${pushName}. Please provide a valid TikTok link.`
                });
            }

            // Show processing message
            await sock.sendMessage(from, {
                text: `⏳ Processing your TikTok download request...`
            });

            // Download data
            const res = await Tiktok.Downloader(url, { version: "v2" });

            if (res.status !== "success") {
                throw new Error("Download failed");
            }

            const result = res.result;
            // console.log(result.images);
            const caption = generateCaption(result, pushName, url);
            const caption2 = await captionGenerator(url);

            if (result.type === "video") {
                // Get the best video URL (HD preferred, with fallback)
                const videoUrl = result?.video || null;

                if (!videoUrl) {
                    throw new Error("No video URL found in response");
                }

                // Send HD video
                const vidStream = await fetchTikcdnData(videoUrl);
                const vidBuffer = Buffer.from(vidStream);
                await sock.sendMessage(from, {
                    video: vidBuffer,
                    caption: caption2.caption
                });
            } else if (result.type === "image") {
                // Check if there are images to send
                if (result.images && result.images.length > 0) {
                    // Send all images first without caption

                    for (let i = 0; i < result.images.length; i++) {
                        const stream = await fetchTikcdnData(result.images[i]);
                        const buffer = Buffer.from(stream);
                        await sock.sendMessage(from, {
                            image: buffer
                        });
                    }

                    // Send caption as separate text message after all images
                    await sock.sendMessage(from, {
                        text: caption2.caption
                    });
                } else {
                    throw new Error("No images found in response");
                }
            } else {
                await sock.sendMessage(from, {
                    text: `⚠️ Unsupported media type: ${result.type}. Only videos and images are supported.`
                });
            }
        } catch (err) {
            await sock.sendMessage(from, {
                text: `⚠️ Error downloading from TikTok: ${err.message}. Please try again or check your URL.`
            });

            AzusaLog.log({
                type: "error",
                message: `Error in /tiktok: ${err.message}`
            });
        }
    }
};

export default command;

