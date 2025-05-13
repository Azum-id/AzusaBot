/**
 * TikTok API Client
 *
 * A utility for fetching and validating TikTok video information
 * using the tikwm.com API service.
 */

/**
 * Validates a TikTok post URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if the URL is a valid TikTok post URL, false otherwise
 */
export function isValidTikTokUrl(url) {
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

        if (!validHostnames.some(hostname => urlObj.hostname === hostname)) {
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
 * Custom error class for TikTok API errors
 */
export class TikTokApiError extends Error {
    constructor(message, statusCode = null, response = null) {
        super(message);
        this.name = "TikTokApiError";
        this.statusCode = statusCode;
        this.response = response;
    }
}

/**
 * Fetches TikTok video information from the tikwm.com API
 * @param {string} url - TikTok video URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Object>} - Promise resolving to TikTok video data
 * @throws {TikTokApiError} - If the URL is invalid or the API request fails
 */
export async function fetchTikTokData(url, options = {}) {
    // Validate TikTok URL
    if (!isValidTikTokUrl(url)) {
        throw new TikTokApiError("Invalid TikTok URL provided");
    }

    const API_BASE_URL = "https://tikwm.com/api/";

    try {
        // Construct the API URL with proper encoding
        const apiUrl = new URL(API_BASE_URL);
        apiUrl.searchParams.append("url", url);

        // Set default fetch options with ability to override
        const fetchOptions = {
            method: "GET",
            headers: {
                Accept: "application/json",
                "User-Agent": "TikTok API Client/1.0",
                ...options.headers
            },
            ...options
        };

        // Make the API request
        const response = await fetch(apiUrl.toString(), fetchOptions);

        // Check if the response is OK
        if (!response.ok) {
            throw new TikTokApiError(
                `API request failed with status: ${response.status}`,
                response.status,
                await response.text()
            );
        }

        // Parse the JSON response
        const data = await response.json();

        // Check if the API returned an error
        if (data.code !== 0) {
            throw new TikTokApiError(
                data.msg || "Unknown API error",
                data.code,
                data
            );
        }

        return data;
    } catch (error) {
        // Handle fetch errors and rethrow as TikTokApiError
        if (!(error instanceof TikTokApiError)) {
            throw new TikTokApiError(
                `Failed to fetch TikTok data: ${error.message}`,
                null,
                error
            );
        }
        throw error;
    }
}

/**
 * Fetches TikTok video data and returns a simplified version of the response
 * @param {string} url - TikTok video URL
 * @returns {Promise<Object>} - Promise resolving to simplified TikTok video data
 * @throws {TikTokApiError} - If the URL is invalid or the API request fails
 */
export async function getSimplifiedTikTokData(url) {
    const response = await fetchTikTokData(url);

    if (!response.data) {
        throw new TikTokApiError("Invalid API response format");
    }

    const { data } = response;

    // Return only the most commonly needed fields
    return {
        id: data.id,
        title: data.title,
        cover: data.cover,
        videoUrl: data.play,
        duration: data.duration,
        stats: {
            plays: data.play_count,
            likes: data.digg_count,
            comments: data.comment_count,
            shares: data.share_count,
            downloads: data.download_count,
            saves: data.collect_count
        },
        author: {
            id: data.author?.id,
            username: data.author?.unique_id,
            nickname: data.author?.nickname,
            avatar: data.author?.avatar
        },
        music: {
            title: data.music_info?.title,
            url: data.music_info?.play,
            author: data.music_info?.author,
            isOriginal: data.music_info?.original
        },
        createdAt: data.create_time ? new Date(data.create_time * 1000) : null
    };
}

/**
 * Usage examples:
 *
 * // Basic usage
 * try {
 *   const data = await fetchTikTokData('https://vt.tiktok.com/ZShUCvXUf/');
 *   console.log(data.data.title);
 * } catch (error) {
 *   console.error('Error fetching TikTok data:', error.message);
 * }
 *
 * // Simplified data
 * try {
 *   const videoInfo = await getSimplifiedTikTokData('https://vt.tiktok.com/ZShUCvXUf/');
 *   console.log(videoInfo.title);
 *   console.log(videoInfo.videoUrl);
 * } catch (error) {
 *   console.error('Error:', error.message);
 * }
 */

