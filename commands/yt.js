/**
 * YouTube downloader command - Download YouTube videos with enhanced error handling
 */
import axios from "axios";

/**
 * Formats a number with suffixes (e.g., 1500 -> 1.5K)
 */
const formatNumber = num => {
    if (!num) return "0";
    if (num >= 1_000_000)
        return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return num.toString();
};

/**
 * Formats seconds to HH:MM:SS or MM:SS
 */
const formatDuration = seconds => {
    if (!seconds) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h) parts.push(h.toString());
    parts.push(h ? String(m).padStart(2, "0") : m.toString());
    parts.push(String(s).padStart(2, "0"));
    return parts.join(":");
};

/**
 * Truncates text to a given length, adding ellipsis
 */
const truncate = (text, length = 200) => {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
};

/**
 * Validates a YouTube URL
 */
const isValidYoutubeUrl = url => {
    const YT_REGEX =
        /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/).+/;
    return url && typeof url === "string" && YT_REGEX.test(url);
};

/**
 * Extracts video ID from YouTube URL
 */
const extractVideoId = url => {
    try {
        const urlObj = new URL(url);
        if (url.includes("youtu.be")) {
            return urlObj.pathname.slice(1);
        } else if (url.includes("youtube.com/watch")) {
            return urlObj.searchParams.get("v");
        } else if (url.includes("youtube.com/shorts")) {
            return urlObj.pathname.split("/").pop();
        }
    } catch (error) {
        return null;
    }
    return null;
};

/**
 * Universal fetch function for retrieving data from various websites
 * @param {string} url - The URL to fetch data from
 * @param {string} referer - The referer URL (optional)
 * @param {Object} customHeaders - Additional headers to include (optional)
 * @param {string} responseType - The response type (default: 'json')
 * @returns {Promise<any>} - The response data
 */
async function universalFetch(
    url,
    {
        referer = "",
        customHeaders = {},
        responseType = "json",
        userAgent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
    } = {}
) {
    try {
        // Extract domain from URL
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Build headers
        const headers = {
            authority: domain,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "cross-site",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": userAgent,
            ...customHeaders
        };

        // Add referer if provided
        if (referer) {
            headers.referer = referer;
        }

        // Make the request
        const response = await axios.get(url, {
            headers,
            responseType
        });

        return response.data;
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
        throw error;
    }
}

/**
 * Generates caption for a YouTube video
 */
function generateYoutubeCaption(data) {
    // Safely extract properties with fallbacks
    const {
        title = "Unknown Title",
        uploader = "Unknown Channel",
        view_count = 0,
        like_count = 0,
        duration = 0,
        upload_date = "Unknown Date",
        description = ""
    } = data;

    // Format duration if not already formatted
    const duration_formatted =
        data.duration_formatted || formatDuration(duration);

    let caption = `*🎬 YouTube Downloader*\n\n`;
    caption += `*Title:* ${title}\n`;
    caption += `*Channel:* ${uploader}\n`;
    caption += `*Views:* ${formatNumber(view_count)}\n`;

    // Only add likes if available
    if (like_count !== null) {
        caption += `*Likes:* ${formatNumber(like_count)}\n`;
    }

    caption += `*Duration:* ${duration_formatted}\n`;
    caption += `*Uploaded:* ${upload_date}\n\n`;

    if (description) {
        caption += `*Description:* ${truncate(description, 300)}\n\n`;
    }

    caption += `> Downloaded by: _Azusa - Bot_\n`;

    return caption;
}

/**
 * Performs the API request to download a YouTube video
 * @returns {Promise<Object>} The API response
 */
async function fetchYoutubeVideo(url, quality = "best") {
    try {
        const apiUrl = `https://azusa-backend.my.id/api/get?url=${encodeURIComponent(
            url
        )}&quality=${quality}`;

        const response = await axios.get(apiUrl, {
            timeout: 30000, // 30 seconds timeout
            headers: {
                "User-Agent": "Azusa-Bot/1.0"
            }
        });

        return response.data;
    } catch (error) {
        // Handle different types of errors
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            const status = error.response.status;
            const message =
                error.response.data?.message || "Unknown server error";

            throw new Error(`API error (${status}): ${message}`);
        } else if (error.request) {
            // The request was made but no response was received
            throw new Error(
                "No response from API server. Please check your internet connection."
            );
        } else {
            // Something happened in setting up the request
            throw new Error(`Request error: ${error.message}`);
        }
    }
}

/**
 * YouTube command definition
 */
const youtubeCommand = {
    name: "youtube",
    aliases: ["yt", "ytdl"],
    description: "Download YouTube video (best quality)",
    usage: "/youtube <link>",
    cooldown: 30, // 30 seconds cooldown between uses

    async execute(sock, msg, args, { AzusaLog, from, pushName }) {
        // Track when the command started
        const startTime = Date.now();
        let statusMessage = null;

        try {
            // Validate input
            const url = args[0];

            if (!url) {
                return await sock.sendMessage(from, {
                    text: `❌ Please include a YouTube link, ${pushName}.\n\nExample: /yt https://youtu.be/2PuFyjAs7JA`
                });
            }

            if (!isValidYoutubeUrl(url)) {
                return await sock.sendMessage(from, {
                    text: `❌ Invalid YouTube URL, ${pushName}. Please enter a correct YouTube link.`
                });
            }

            // Extract video ID for logging
            const videoId = extractVideoId(url);

            // Send initial status message
            statusMessage = await sock.sendMessage(
                from,
                {
                    text: `⏳ Processing YouTube download request...\nPlease wait, this may take a moment.`
                },
                { quoted: msg }
            );

            // Fetch video data
            const apiData = await fetchYoutubeVideo(url);

            // Validate API response
            if (
                apiData.status !== "success" ||
                !apiData.file ||
                !apiData.file.download_url
            ) {
                throw new Error("API did not provide a valid download URL");
            }

            // Cancel if video duration is more than 30 minutes (1800 seconds)
            if (apiData.video.duration > 1800) {
                if (statusMessage && statusMessage.key) {
                    return await sock.sendMessage(
                        from,
                        {
                            text: `NGOTAK KONTOL VIDEO NYA DURASI *${apiData.video.duration_formatted}* GUOBLOK!!!! MAXIMAL 30 MENIT PUQIMAK`,
                            edit: statusMessage.key
                        },
                        { quoted: msg }
                    );
                }
            }

            // Generate caption based on video data
            const caption = generateYoutubeCaption(apiData.video);

            // Update status message if needed
            if (statusMessage && statusMessage.key) {
                await sock.sendMessage(from, {
                    text: `✅ Video found! Sending video... (${apiData.file.size_mb} MB)`,
                    edit: statusMessage.key
                });
            }
            const vidBuffer = await universalFetch(apiData.file.download_url, {
                referer: "https://azusa-backend.my.id/",
                responseType: "arraybuffer"
            });
            const buffer = Buffer.from(vidBuffer);
            // Send the video
            await sock.sendMessage(from, {
                video: buffer,
                caption
            });
        } catch (err) {
            // Handle different error types
            let errorMessage =
                "⚠️ An error occurred while downloading the video.";

            if (err.message.includes("API error")) {
                errorMessage = `⚠️ Server error: ${err.message}`;
            } else if (err.message.includes("timeout")) {
                errorMessage =
                    "⚠️ Download timeout! Server might be busy. Please try again later.";
            } else if (err.message.includes("internet connection")) {
                errorMessage =
                    "⚠️ Cannot connect to server. Please check your internet connection.";
            } else if (err.message.includes("file size")) {
                errorMessage =
                    "⚠️ Video size is too large to send via WhatsApp. Try a shorter video.";
            }

            // Send error message
            await sock.sendMessage(from, {
                text: `${errorMessage} Try again later.\n\nDetails: ${err.message}`,
                edit: statusMessage
            });

            // Log error with context
            AzusaLog.handleError(err, `Error in /youtube command`);
        } finally {
            // Clean up or finalize anything if needed
        }
    }
};

// Adding retry capability
youtubeCommand.retry = async function (
    sock,
    msg,
    args,
    context,
    retryCount = 0
) {
    const MAX_RETRIES = 2;

    try {
        return await this.execute(sock, msg, args, context);
    } catch (error) {
        // Only retry for certain errors and if we haven't reached max retries
        if (
            retryCount < MAX_RETRIES &&
            (error.message.includes("timeout") ||
                error.message.includes("connection"))
        ) {
            await sock.sendMessage(context.from, {
                text: `⚠️ Connection lost, trying again... (${
                    retryCount + 1
                }/${MAX_RETRIES})`
            });

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Retry with incremented count
            return await this.retry(sock, msg, args, context, retryCount + 1);
        } else {
            // Re-throw if max retries reached or error is not retriable
            throw error;
        }
    }
};

export default youtubeCommand;

