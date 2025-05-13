import axios from "axios";
import moment from "moment-timezone";

/**
 * jikan - Menampilkan jadwal anime hari ini dari Jikan API
 */

// Fungsi untuk mengambil jadwal anime dari Jikan API
const getAnimeSchedule = async () => {
    try {
        const today = moment().tz("Asia/Jakarta").format("dddd").toLowerCase();
        const response = await axios.get(
            `https://api.jikan.moe/v4/schedules?filter=${today}`
        );
        const animeList = response.data.data;

        if (!animeList || animeList.length === 0)
            return "❌ Tidak ada anime yang tayang hari ini.";

        let message = `📅 *Jadwal Anime Hari Ini (${moment()
            .tz("Asia/Jakarta")
            .format("dddd, DD MMMM YYYY")})*\n\n`;

        animeList.forEach((anime, index) => {
            const title = anime.title;
            const type = anime.type?.toUpperCase() || "UNKNOWN";
            const year = anime.year || "????";
            const time = anime.broadcast?.time || "Tidak tersedia";
            const genres =
                anime.genres.map(g => g.name).join(", ") || "Tidak ada genre";

            message += `*${
                index + 1
            }. ${title} (${year}) | ${type}*\n🕒 Jam: ${time} WIB\n🎭 Genre: ${genres}\n\n`;
        });

        return message;
    } catch (error) {
        console.error("Error mengambil jadwal anime:", error);
        return "❌ Gagal mengambil jadwal anime. Coba lagi nanti.";
    }
};

const command = {
    name: "jikan",
    aliases: ["mal"],
    description: "Menampilkan jadwal anime hari ini dari Jikan API",
    usage: "/jikan",

    /**
     * Execute the jikan command
     * @param {Object} sock - The WhatsApp socket instance
     * @param {Object} msg - The message object
     * @param {Array} args - Command arguments
     * @param {Object} context - Additional context like logger
     */
    async execute(sock, msg, args, { AzusaLog, from, pushName }) {
        try {
            const scheduleMessage = await getAnimeSchedule();

            await sock.sendMessage(from, {
                text: scheduleMessage
            });
        } catch (err) {
            throw new Error(`Failed to execute jikan command: ${err.message}`);
        }
    }
};

export default command;
